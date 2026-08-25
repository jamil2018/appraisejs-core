import { createHash } from 'node:crypto'

import { BrowserEngine } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'
import {
  ASSESSMENT_PREFLIGHT_ALGORITHM,
  ASSESSMENT_PREFLIGHT_RECEIPT_SCHEMA,
  canonicalRemoteEvaluationEnvironmentBinding,
  expectedQualityPublicationPreflightAuthority,
  normalizedRemoteScopeBindings,
  remoteEvaluationScopeCreateSchema,
  remoteScopeRequestIdentity,
  remoteScopePolicies,
  remoteScopeValidationBindingSchema,
  type RemoteEvaluationScopeCreateInput,
  type RemoteScopeEnvironment,
  type RemoteScopePhaseBinding,
  type RemoteScopeTarget,
} from '@/lib/quality-design/remote-evaluation-scope-contract'
import {
  canonicalizeAndValidateQualityRealization,
  generationIntentProjection,
} from '@/lib/quality-design/validation-realization'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { defaultOperationDefinitions, defaultOperationRegistry } from '@/lib/operation-catalog'
import { environmentSchema } from '@/constants/form-opts/environment-form-opts'
import {
  ensureEnvironment,
  environmentSummary,
  getEnvironmentByIdOrThrow,
} from '@/services/environment/environment-service'
import {
  coordinatorAuthorizationHandoffFromDetails,
  coordinatorAuthorizationHandoffSchema,
  ServiceError,
} from '@/services/shared/errors'
import { ensureBuiltInStepDefinitionReadiness } from '@/services/step-definition/built-in-readiness-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import { runQualityAssessment } from './assessment-execution-service'
import { setCanonicalAssessmentPreflightAuthority, type RemoteScopeAuthority } from './remote-evaluation-scope-service'
import {
  readReadyStepDefinitions,
  readTargetBoundLocators,
  validatedStepReference,
} from './assessment-binding-read-model'
import {
  compileQualityValidations,
  createQualityAssessment,
  publishQualityValidations,
  readQualityAssessment,
  readQualityRequirementGraph,
} from './quality-design-service'

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const browserSchema = z.nativeEnum(BrowserEngine)
const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

const environmentProposalSchema = environmentSchema.strict()
const existingEnvironmentSchema = z.object({ environmentId: z.string().min(1) }).strict()
const proposedEnvironmentSchema = z
  .object({ allowCreate: z.literal(true), proposal: environmentProposalSchema })
  .strict()
const preparationEnvironmentSchema = z.union([existingEnvironmentSchema, proposedEnvironmentSchema])
const inputSchema = remoteEvaluationScopeCreateSchema
  .omit({ validationBindings: true, environment: true, runtime: true })
  .extend({
    // Local flows still require this at the service boundary. Remote v2
    // subjects may omit it only because the sealed binding packet can be
    // hydrated before every canonical calculation and mutation.
    validationBindings: z.array(remoteScopeValidationBindingSchema).min(1).optional(),
    environment: preparationEnvironmentSchema,
    subject: z.union([
      z
        .object({
          subjectDigest: z.string().startsWith('sha256:'),
          authority: z.string().min(1),
          subjectKind: z.enum(['ARTIFACT', 'DEPLOYMENT_SNAPSHOT']).optional(),
          metadata: z.record(z.string(), primitiveSchema).optional(),
        })
        .strict(),
      z
        .object({
          subjectRevisionId: z.string().min(1),
          expectedSubjectDigest: z.string().startsWith('sha256:').optional(),
        })
        .strict(),
    ]),
    runtime: z.object({ browserEngine: browserSchema.optional() }).strict().default({}),
    authorizationGrantId: z.string().uuid().optional(),
    executionRequestId: z.string().uuid().optional(),
    expectedRequestHash: z.string().startsWith('sha256:').optional(),
    consentId: z.string().uuid().optional(),
    expectedExecutionManifestHash: z.string().startsWith('sha256:').optional(),
    expectedPreflight: z
      .object({
        algorithmVersion: z.literal(ASSESSMENT_PREFLIGHT_ALGORITHM),
        preflightHash: z.string().startsWith('sha256:'),
      })
      .strict()
      .optional(),
    // A successor is an explicit immutable retry boundary. Preparation never
    // discovers a successor from a root scope or newest-row ordering.
    assessmentId: z.string().min(1).optional(),
    idempotencyKey: z.string().min(1).max(1_000),
  })
  .strict()

/**
 * A non-mutating preparation check intentionally has no creation proposal,
 * idempotency key, authorization material, or execution request identity.
 * Those fields have command semantics and cannot be part of a stable
 * realization identity.
 */
const preflightInputSchema = inputSchema
  .omit({
    authorizationGrantId: true,
    executionRequestId: true,
    expectedRequestHash: true,
    consentId: true,
    expectedExecutionManifestHash: true,
    expectedPreflight: true,
    assessmentId: true,
    idempotencyKey: true,
  })
  .extend({
    environment: existingEnvironmentSchema,
  })
  .strict()

type PreparationRequest = z.infer<typeof inputSchema>
type PreflightRequest = z.infer<typeof preflightInputSchema>
type PreparationInput = Omit<PreparationRequest, 'validationBindings'> & {
  validationBindings: z.infer<typeof remoteScopeValidationBindingSchema>[]
}
type PreflightInput = Omit<z.infer<typeof preflightInputSchema>, 'validationBindings'> & {
  validationBindings: z.infer<typeof remoteScopeValidationBindingSchema>[]
}
type ExpectedPreflight = NonNullable<PreparationInput['expectedPreflight']>
type Receipt = Record<string, unknown>
type RemoteScopeCheckpointBinding = RemoteScopePhaseBinding
type BindingsMetadata = {
  bindingsSource: 'persisted_remote_scope' | 'caller_exact_remote_scope' | 'caller_supplied'
  bindingsRecovered: boolean
  counts: { validationCount: number; stepCount: number; locatorCount: number }
}
type HydratedBindingsInput<T extends PreparationRequest | PreflightRequest> = T & {
  validationBindings: z.infer<typeof remoteScopeValidationBindingSchema>[]
}
type PreparedBinding = {
  validationId: string
  steps: Array<
    z.infer<typeof remoteScopeValidationBindingSchema>['steps'][number] & {
      step: { id: string; version: string; definitionHash: string }
      locatorCardinalities: Array<{ inputName: string; cardinality: 'exactlyOne' | 'collection' }>
    }
  >
  locators: Array<{
    id: string
    version: '1'
    contentHash: string
    binding: { id: string; name: string; value: string; locatorGroupId: string }
  }>
  locatorGroups: Array<{ id: string; name: string; route: string; moduleId: string }>
}

type PreparationFailureClassification =
  | 'request_invalid'
  | 'state_conflict'
  | 'prerequisite_missing'
  | 'infrastructure_failure'
  | 'terminal_execution_failure'
  | 'active_execution'
  | 'execution_reserved'
  | 'authorization_required'
  | 'target_failure'

type PreparationFailure = {
  message: string
  classification: PreparationFailureClassification
  authorization?: z.infer<typeof coordinatorAuthorizationHandoffSchema>
}

async function hydratePreparationBindings<T extends PreparationRequest | PreflightRequest>(
  request: T,
  target: { id: string; kind?: string },
  client: typeof prisma = prisma,
): Promise<{ input: HydratedBindingsInput<T>; bindings: BindingsMetadata }> {
  const localBindings = request.validationBindings
  if (target.kind !== 'REMOTE_BLACK_BOX') {
    if (!localBindings)
      throw new ServiceError('validationBindings are required for non-remote assessment work.', 'VALIDATION', 400, {
        code: 'validation_bindings_required',
      })
    return {
      input: { ...request, validationBindings: localBindings } as HydratedBindingsInput<T>,
      bindings: {
        bindingsSource: 'caller_supplied',
        bindingsRecovered: false,
        counts: {
          validationCount: localBindings.length,
          stepCount: localBindings.reduce((count, binding) => count + binding.steps.length, 0),
          locatorCount: localBindings.reduce((count, binding) => count + binding.locatorIds.length, 0),
        },
      },
    }
  }
  const environmentId = 'environmentId' in request.environment ? request.environment.environmentId : undefined
  const { hydrateRemoteEvaluationScopeBindings, parseRemoteSubjectReference } =
    await import('./remote-evaluation-scope-service')
  const subject = parseRemoteSubjectReference(request.subject)
  if (!subject)
    throw new ServiceError(
      'REMOTE_BLACK_BOX assessment preparation requires subjectRevisionId from evaluation_subject_remote_scope_create.',
      'VALIDATION',
    )
  if (!environmentId)
    throw new ServiceError(
      'REMOTE_BLACK_BOX preparation requires the scope-bound existing environmentId.',
      'VALIDATION',
    )
  const hydrated = await hydrateRemoteEvaluationScopeBindings(
    {
      subject,
      targetProjectId: target.id,
      qualityPlanId: request.qualityPlanId,
      revisionId: request.revisionId,
      environmentId,
      validationBindings: localBindings,
    },
    client as never,
  )
  return {
    input: { ...request, validationBindings: hydrated.validationBindings } as HydratedBindingsInput<T>,
    bindings: {
      bindingsSource: hydrated.bindingsSource,
      bindingsRecovered: hydrated.bindingsRecovered,
      counts: hydrated.counts,
    },
  }
}

async function assertRemoteScopeIfApplicable(
  input: PreparationInput,
  target: { id: string; fingerprint: string; kind?: string },
  preflight: ReturnType<typeof preparationPreflight>,
) {
  const { assertRemoteEvaluationScopePreflight, parseRemoteSubjectReference, remoteScopePhaseBinding } =
    await import('./remote-evaluation-scope-service')
  const reference = parseRemoteSubjectReference(input.subject)
  if (target.kind === 'REMOTE_BLACK_BOX' && !reference)
    throw new ServiceError(
      'REMOTE_BLACK_BOX assessment preparation requires subjectRevisionId from evaluation_subject_remote_scope_create.',
      'VALIDATION',
    )
  if (!reference) return
  const resolved = await assertRemoteEvaluationScopePreflight({
    subject: input.subject,
    target: input.target,
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
    expectedDesignHash: input.expectedDesignHash,
    validationBindings: input.validationBindings,
    environment: input.environment as { environmentId: string },
    runtime: input.runtime,
    preflight,
  })
  return resolved ? { ...resolved, phaseBinding: remoteScopePhaseBinding(resolved) } : null
}

function phaseReceipts(receipt: Receipt) {
  return (receipt.phases && typeof receipt.phases === 'object' ? receipt.phases : {}) as Record<string, unknown>
}

function hasPhase(receipt: Receipt, name: string) {
  return Object.hasOwn(phaseReceipts(receipt), name)
}

function receiptFor(preparation: { receiptJson: string }) {
  return JSON.parse(preparation.receiptJson) as Receipt
}

/**
 * Completed preparations are immutable replays. A caller that supplies a
 * preflight identity must therefore be checked against the identity captured
 * in that immutable receipt, never against the current catalog or runtime
 * state.
 */
function assertCompletedReplayPreflight(
  preparation: { receiptJson: string },
  expectedPreflight: ExpectedPreflight | undefined,
) {
  if (!expectedPreflight) return
  const receipt = receiptFor(preparation)
  const accepted = receipt.preflight as Partial<ExpectedPreflight> | undefined
  if (
    accepted?.algorithmVersion !== expectedPreflight.algorithmVersion ||
    accepted.preflightHash !== expectedPreflight.preflightHash
  )
    throw new ServiceError('Assessment preflight token is stale.', 'CONFLICT', 409, {
      code: 'preflight_stale',
    })
}

/** The canonical resolver uses raw catalog data only internally. Persisted and
 * public receipts must carry bounded identities/counts, never selector or
 * compact-intent content. */
function boundedPreflight<T extends Record<string, unknown>>(preflight: T) {
  const bounded = { ...preflight }
  delete bounded.scopeIntent
  delete bounded.realizationIntent
  return bounded
}

function response(
  preparation: { id: string; phase: string; receiptJson: string; failureJson: string | null },
  unchanged = false,
) {
  const receipt = receiptFor(preparation)
  const failure = preparation.failureJson ? (JSON.parse(preparation.failureJson) as PreparationFailure) : undefined
  const authorization = coordinatorAuthorizationHandoffSchema.safeParse(failure?.authorization)
  const complete = preparation.phase === 'STARTED'
  const retry = preparationRetry(failure, complete)
  return {
    preparationId: preparation.id,
    phase: preparation.phase,
    ...(unchanged ? { unchanged: true } : {}),
    environment: receipt.environment,
    preflight: receipt.preflight,
    publication: receipt.publication,
    assessment: receipt.assessment,
    assessmentRun: receipt.assessmentRun,
    hashes: receipt.hashes,
    bindings: receipt.bindings,
    ...(failure ? { blockers: [failure], failure } : {}),
    ...(authorization.success
      ? { durableState: 'authorization_request_committed' as const, authorization: authorization.data }
      : {}),
    retry,
    nextRecommendedAction: recommendedAction(complete, retry),
    nextRequiredAgentBehavior: requiredBehavior(complete, retry),
  }
}

function preparationRetry(failure: PreparationFailure | undefined, complete: boolean) {
  const classification = failure?.classification ?? (complete ? 'target_failure' : 'infrastructure_failure')
  return {
    safe:
      classification === 'prerequisite_missing' ||
      classification === 'infrastructure_failure' ||
      classification === 'authorization_required',
    classification,
  }
}

function recommendedAction(complete: boolean, retry: ReturnType<typeof preparationRetry>) {
  if (complete) return 'assessment_reconcile'
  if (retry.classification === 'terminal_execution_failure') return 'assessment_create_successor'
  if (retry.classification === 'active_execution' || retry.classification === 'execution_reserved')
    return 'assessment_reconcile'
  return retry.safe ? 'assessment_prepare_run' : 'project_diagnostic'
}

function requiredBehavior(complete: boolean, retry: ReturnType<typeof preparationRetry>) {
  if (complete) return 'wait_for_terminal_execution_then_reconcile'
  if (retry.classification === 'terminal_execution_failure')
    return 'create_successor_then_prepare_with_a_new_idempotency_key'
  if (retry.classification === 'active_execution' || retry.classification === 'execution_reserved')
    return 'wait_for_active_assessment_execution_then_reconcile'
  return retry.safe ? 'replay_same_idempotency_key_to_resume' : 'inspect_diagnostic_and_revise_request_or_state'
}

async function checkpoint(
  preparationId: string,
  phase: string,
  update: Receipt,
  remoteScopeBinding?: RemoteScopeCheckpointBinding,
) {
  const persist = async (client: typeof prisma) => {
    if (remoteScopeBinding) {
      const { assertRemoteEvaluationScopeCurrent } = await import('./remote-evaluation-scope-service')
      await assertRemoteEvaluationScopeCurrent(remoteScopeBinding, client as never)
    }
    const current = await client.assessmentPreparation.findUniqueOrThrow({ where: { id: preparationId } })
    const receipt = receiptFor(current)
    const next = { ...receipt, ...update, phases: { ...phaseReceipts(receipt), [phase]: update } }
    return client.assessmentPreparation.update({
      where: { id: preparationId },
      data: { phase, receiptJson: canonicalContractJson(next), failureJson: null },
    })
  }
  // Unit seams predate transaction support; production always takes the
  // transaction path, keeping the remote compare and checkpoint atomic.
  return prisma.$transaction ? prisma.$transaction(tx => persist(tx as typeof prisma)) : persist(prisma)
}

async function recordFailure(preparationId: string, error: unknown) {
  const terminalExecutionFailure =
    error instanceof ServiceError && error.details?.code === 'assessment_execution_terminal'
  const activeExecution = error instanceof ServiceError && error.details?.code === 'assessment_execution_incomplete'
  const executionReserved = error instanceof ServiceError && error.details?.code === 'assessment_execution_reserved'
  const authorization =
    error instanceof ServiceError && error.code === 'UNAUTHORIZED' && error.message === 'AUTHORIZATION_REQUIRED'
      ? coordinatorAuthorizationHandoffFromDetails(error.details)
      : undefined
  const failure: PreparationFailure = {
    message: error instanceof Error ? error.message : 'Preparation failed.',
    classification: authorization
      ? 'authorization_required'
      : terminalExecutionFailure
        ? 'terminal_execution_failure'
        : executionReserved
          ? 'execution_reserved'
          : activeExecution
            ? 'active_execution'
            : error instanceof ServiceError && error.code === 'CONFLICT'
              ? 'state_conflict'
              : error instanceof ServiceError && error.code === 'VALIDATION'
                ? 'request_invalid'
                : error instanceof ServiceError && error.code === 'NOT_FOUND'
                  ? 'prerequisite_missing'
                  : 'infrastructure_failure',
    ...(authorization ? { authorization } : {}),
  }
  return prisma.assessmentPreparation.update({
    where: { id: preparationId },
    data: { failureJson: canonicalContractJson(failure) },
  })
}

function isTerminalExecutionFailure(preparation: { failureJson: string | null }) {
  if (!preparation.failureJson) return false
  try {
    return (JSON.parse(preparation.failureJson) as PreparationFailure).classification === 'terminal_execution_failure'
  } catch {
    return false
  }
}

async function approvedGraph(input: PreparationInput, targetProjectId: string, client: typeof prisma = prisma) {
  const graph = await readQualityRequirementGraph(
    { qualityPlanId: input.qualityPlanId, revisionId: input.revisionId },
    client as never,
  )
  if (graph.qualityPlan.targetProjectId !== targetProjectId)
    throw new ServiceError('Quality Plan does not belong to the requested target.', 'CONFLICT')
  if (!['SCENARIOS_APPROVED', 'REALIZED', 'PUBLISHED'].includes(graph.revision.status))
    throw new ServiceError('Scenario approval is required before preparation.', 'CONFLICT')
  if (graph.designHash !== input.expectedDesignHash)
    throw new ServiceError('Scenario design hash is stale.', 'CONFLICT')
  return graph
}

function duplicateError(code: string, field: string, firstIndex: number, duplicateIndex: number): never {
  throw new ServiceError(`Duplicate ${field} is not allowed.`, 'VALIDATION', 400, {
    code,
    firstIndex,
    duplicateIndex,
  })
}

function assertNoDuplicateIds(values: string[], code: string, field: string) {
  const indices = new Map<string, number>()
  for (const [index, value] of values.entries()) {
    const firstIndex = indices.get(value)
    if (firstIndex !== undefined) throw duplicateError(code, field, firstIndex, index)
    indices.set(value, index)
  }
}

function assertCurrentValidationBindings(
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  validationBindings: PreparationInput['validationBindings'],
  authority:
    { kind: 'all-approved-v2' } | { kind: 'persisted-partition-manifest'; validationVersionIds: readonly string[] } = {
    kind: 'all-approved-v2',
  },
) {
  assertNoDuplicateIds(
    validationBindings.map(binding => binding.validationId),
    'duplicate_validation_binding',
    'validation binding',
  )
  const expected = new Set(
    authority.kind === 'all-approved-v2'
      ? graph.validationVersions.map(version => version.id)
      : authority.validationVersionIds,
  )
  const actual = new Set(validationBindings.map(binding => binding.validationId))
  if (
    validationBindings.length !== expected.size ||
    expected.size !== actual.size ||
    [...expected].some(id => !actual.has(id))
  )
    throw new ServiceError(
      authority.kind === 'all-approved-v2'
        ? 'validationBindings must cover each current approved ValidationVersion exactly once.'
        : 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION',
      'VALIDATION',
      400,
      authority.kind === 'all-approved-v2' ? undefined : { code: 'REMOTE_SCOPE_PARTITION_AUTHORITY_VIOLATION' },
    )
}

function preparedSteps(
  binding: PreparationInput['validationBindings'][number],
  definitions: Awaited<ReturnType<typeof readReadyStepDefinitions>>,
) {
  return binding.steps.map(step => {
    const { definition, definitionHash } = validatedStepReference(step, definitions)
    // Composition children enforce their own canonical operation cardinality
    // when dispatched. Parent locator names may be remapped to different child
    // input names, so treating the parent as a direct operation would reject a
    // valid reviewed composition and seal the wrong override keys.
    const locatorCardinalities =
      definition.execution.kind === 'composition'
        ? []
        : definition.inputs
            .filter(input => input.type === 'locator')
            .map(input => {
              if (definition.execution.kind !== 'operation')
                throw new ServiceError(
                  `Locator-consuming Step Definition ${definition.identity.id}@${definition.identity.version} must use a canonical operation binding.`,
                  'VALIDATION',
                )
              let operation: ReturnType<typeof defaultOperationRegistry.read>[number] | undefined
              try {
                operation = defaultOperationRegistry.read([
                  { id: definition.execution.handlerId, version: definition.execution.handlerVersion },
                ])[0]
              } catch {
                throw new ServiceError(
                  `Canonical operation ${definition.execution.handlerId}@${definition.execution.handlerVersion} is unavailable for locator cardinality validation.`,
                  'VALIDATION',
                )
              }
              const canonicalInput = operation?.inputs.find(candidate => candidate.name === input.name)
              if (canonicalInput?.type !== 'locator' || !canonicalInput.cardinality)
                throw new ServiceError(
                  `Canonical locator input ${input.name} for ${definition.execution.handlerId}@${definition.execution.handlerVersion} is missing cardinality.`,
                  'VALIDATION',
                )
              return { inputName: input.name, cardinality: canonicalInput.cardinality }
            })
    return {
      ...step,
      step: {
        id: definition.identity.id,
        version: definition.identity.version,
        definitionHash,
      },
      locatorCardinalities,
    }
  })
}

function preparedLocators(
  binding: PreparationInput['validationBindings'][number],
  locatorsById: Awaited<ReturnType<typeof readTargetBoundLocators>>,
) {
  const boundLocators = binding.locatorIds.map(id => locatorsById.get(id)!)
  return {
    locators: boundLocators.map(locator => ({
      id: locator.id,
      version: '1' as const,
      contentHash: digest({
        id: locator.id,
        name: locator.name,
        value: locator.value,
        locatorGroupId: locator.locatorGroupId!,
      }),
      binding: {
        id: locator.id,
        name: locator.name,
        value: locator.value,
        locatorGroupId: locator.locatorGroupId!,
      },
    })),
    locatorGroups: [
      // LocatorGroup.targetProjectId establishes ownership at the read
      // boundary, but it is persistence metadata rather than executable
      // validation content. Do not leak it into the logical node: the
      // published validation-artifact contract intentionally has no such
      // field, and both durable projections must start from one shape.
      ...new Map(
        boundLocators.map(locator => {
          const group = locator.locatorGroup!
          return [group.id, { id: group.id, name: group.name, route: group.route, moduleId: group.moduleId }] as const
        }),
      ).values(),
    ],
  }
}

async function validateAndResolveBindings(
  input: PreparationInput,
  targetProjectId: string,
  client: typeof prisma = prisma,
  authority?:
    { kind: 'all-approved-v2' } | { kind: 'persisted-partition-manifest'; validationVersionIds: readonly string[] },
) {
  const graph = await approvedGraph(input, targetProjectId, client)
  const effectiveAuthority =
    authority ??
    (await (async () => {
      const reference =
        input.subject && typeof input.subject === 'object' && 'subjectRevisionId' in input.subject
          ? input.subject
          : undefined
      if (!reference) return { kind: 'all-approved-v2' as const }
      const remoteScopeModule = await import('./remote-evaluation-scope-service')
      if (!('remoteScopePartitionAuthorityForSubject' in remoteScopeModule)) return { kind: 'all-approved-v2' as const }
      return remoteScopeModule.remoteScopePartitionAuthorityForSubject(reference, client as never)
    })())
  assertCurrentValidationBindings(graph, input.validationBindings, effectiveAuthority)
  const [definitions, locatorsById] = await Promise.all([
    readReadyStepDefinitions(input.validationBindings, client),
    readTargetBoundLocators(
      input.validationBindings,
      targetProjectId,
      (firstIndex, duplicateIndex) =>
        duplicateError('duplicate_locator_id', 'locator identifier', firstIndex, duplicateIndex),
      client,
    ),
  ])
  const bindings: PreparedBinding[] = input.validationBindings.map(binding => ({
    validationId: binding.validationId,
    steps: preparedSteps(binding, definitions),
    ...preparedLocators(binding, locatorsById),
  }))
  return { graph, bindings }
}

type CanonicalPreparationRealization = {
  validations: Array<{
    validationVersionId: string
    realization: { runtimePublication: ReturnType<typeof canonicalizeAndValidateQualityRealization>['envelope'] }
    integrityHash: string
    intentHash: string
  }>
}

function realizationIntentFor(realization: CanonicalPreparationRealization) {
  return realization.validations
    .map(item => ({
      validationVersionId: item.validationVersionId,
      intentHash: item.intentHash,
    }))
    .sort((left, right) => left.validationVersionId.localeCompare(right.validationVersionId))
}

function realizationPreflightHash(realization: CanonicalPreparationRealization) {
  return digest({
    schemaVersion: 'assessment-realization-preflight/v1',
    validations: realizationIntentFor(realization),
  })
}

/**
 * Canonicalize raw server-built realization through the one compiler-owned
 * boundary before it is exposed or passed to a mutating compiler.
 */
function buildAndValidateRealization(input: {
  preparation: PreparationInput
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>
  bindings: PreparedBinding[]
  environmentId: string
  target: { id: string; fingerprint: string; kind?: string }
}) {
  try {
    const raw = realizationFor(input.preparation, input.graph, input.bindings, input.environmentId, input.target)
    return {
      validations: raw.validations.map(item => {
        const canonical = canonicalizeAndValidateQualityRealization({
          realization: item.realization,
          target: input.target,
        })
        return {
          validationVersionId: item.validationVersionId,
          realization: canonical.realization,
          integrityHash: canonical.integrityHash,
          intentHash: canonical.intentHash,
        }
      }),
    } satisfies CanonicalPreparationRealization
  } catch (error) {
    if (error instanceof ServiceError && error.details?.code === 'conflicting_step_definition_reference') throw error
    if (error instanceof ServiceError && error.details?.code === 'scenario_page_context_required')
      throw new ServiceError(error.message, 'VALIDATION', 400, error.details)
    throw new ServiceError('Compact assessment realization failed strict runtime validation.', 'VALIDATION', 400, {
      code: 'realization_runtime_invalid',
    })
  }
}

function assertPersistedRealizationsMatch(
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  realization: CanonicalPreparationRealization,
  partitionValidationIds?: readonly string[],
) {
  const expected = new Map(realizationIntentFor(realization).map(item => [item.validationVersionId, item.intentHash]))
  const versions = partitionValidationIds
    ? graph.validationVersions.filter(version => partitionValidationIds.includes(version.id))
    : graph.validationVersions
  for (const version of versions) {
    // Version-level realization/status is a historical summary. An active
    // generation, when present, is the sole executable realization authority.
    if (!version.activeGeneration) continue
    let persisted: unknown
    try {
      persisted = JSON.parse(version.activeGeneration.canonicalRealizationJson)
    } catch {
      throw new ServiceError(
        'Active validation generation cannot be matched to compact preparation intent.',
        'CONFLICT',
        409,
        {
          code: 'active_generation_unverifiable',
          validationVersionId: version.id,
        },
      )
    }
    // Generation intent is the one explicit receipt-neutral projection. Do
    // not rebuild a compiler envelope or patch a synthetic command key here:
    // preparation compares exactly the generation's durable compact intent.
    const persistedIntentHash = hashCanonical(generationIntentProjection(persisted))
    if (persistedIntentHash !== expected.get(version.id))
      throw new ServiceError(
        'Active validation generation conflicts with compact preparation intent.',
        'CONFLICT',
        409,
        {
          code: 'active_generation_conflict',
          validationVersionId: version.id,
        },
      )
  }
}

function browserName(engine: BrowserEngine) {
  return engine.toLowerCase()
}

function realizationFor(
  input: PreparationInput,
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  bindings: PreparedBinding[],
  environmentId: string,
  target: { id: string; fingerprint: string },
) {
  const byId = new Map(bindings.map(binding => [binding.validationId, binding]))
  const browser = browserName(input.runtime.browserEngine ?? BrowserEngine.CHROMIUM)
  return {
    // The immutable partition authority has already proven that `bindings`
    // is an exact subset. Realization must never re-expand that subset from
    // the broader approved graph, or an absent foreign binding would reach
    // runtime canonicalization as an undefined value.
    validations: graph.validationVersions
      .filter(version => byId.has(version.id))
      .map(version => {
        const binding = byId.get(version.id)!
        const design = version.design as { title?: string; behavior?: string }
        const caseId = `quality-case-${version.id}`
        const moduleId = `quality-module-${version.id}`
        const suiteId = `quality-suite-${version.id}`
        const steps = binding.steps.map((item, index) => ({
          id: `${caseId}-step-${index + 1}`,
          order: index + 1,
          label: item.description,
          gherkinStep: `${item.keyword} ${item.description}`,
          invocation: {
            step: item.step,
            inputs: item.inputs,
            presentation: { keyword: item.keyword, description: item.description },
          },
          parameters: [],
        }))
        const gherkin = [
          `Scenario: ${design.title ?? version.validationIdentity}\n${steps.map(step => `  ${step.gherkinStep}`).join('\n')}`,
        ]
        const receiptHash = digest({ validationVersionId: version.id, environmentId, browser, steps })
        const compilerReceipt = {
          schemaVersion: '1',
          catalogHash: digest(binding.steps.map(item => item.step)),
          locatorGraphHash: digest(binding.locators),
          environments: [environmentId],
          browsers: [browser],
          runtimes: ['node'],
        }
        const runtimeInput = {
          schemaVersion: '2',
          targetProjectId: target.id,
          targetFingerprint: target.fingerprint,
          astId: version.id,
          astHash: version.canonicalHash,
          contextHash: digest({ targetProjectId: target.id, validationVersionId: version.id }),
          previewHash: digest({ gherkin, steps }),
          receiptHash,
          compilerReceipt: { ...compilerReceipt, contentHash: digest(compilerReceipt) },
          extensionPolicy: createCustomExtensionPolicy({
            projectId: target.id,
            projectFingerprint: target.fingerprint,
            capabilityImports: {},
          }),
          rootInvocations: steps.map(step => ({ caseId, stepId: step.id, invocation: step.invocation })),
          locatorBindings: steps.flatMap((step, index) =>
            binding.steps[index]!.locatorCardinalities.map(locator => ({
              caseId,
              stepId: step.id,
              inputName: locator.inputName,
              cardinality: locator.cardinality,
            })),
          ),
          operationCardinalities: defaultOperationDefinitions.flatMap(operation =>
            operation.inputs
              .filter(input => input.type === 'locator')
              .map(input => {
                if (!input.cardinality)
                  throw new ServiceError(
                    `Canonical locator input ${input.name} for ${operation.handler.id}@${operation.handler.version} is missing cardinality.`,
                    'VALIDATION',
                  )
                return {
                  operation: `${operation.handler.id}@${operation.handler.version}`,
                  inputName: input.name,
                  cardinality: input.cardinality,
                }
              }),
          ),
          stepDefinitions: binding.steps.map(item => item.step),
          locators: binding.locators,
          extensions: [],
          matrix: [{ browser, environment: environmentId }],
          expected: {
            scenarios: [{ scenarioId: version.id, caseId, stepIds: steps.map(step => step.id) }],
            scenarioCount: 1,
          },
          gherkinHash: digest(gherkin),
        }
        const node = {
          id: version.id,
          testCaseIds: [caseId],
          appraiseArtifacts: {
            modules: [{ id: moduleId, name: design.title ?? version.validationIdentity, parentId: null }],
            locatorGroups: binding.locatorGroups,
            testSuites: [
              { id: suiteId, name: design.title ?? version.validationIdentity, moduleId, testCaseIds: [caseId] },
            ],
            testCases: [
              {
                id: caseId,
                title: design.title ?? version.validationIdentity,
                description: design.behavior ?? '',
                steps,
              },
            ],
            locators: binding.locators.map(locator => locator.binding),
          },
          matrix: runtimeInput.matrix,
        }
        return {
          validationVersionId: version.id,
          realization: {
            runtimePublication: {
              idempotencyKey: `prepare:${input.idempotencyKey}:${version.id}`,
              projection: { validationNode: node, gherkin },
              validationProjection: { validations: [node], gherkin },
              runtimeInput,
            },
          },
        }
      }),
  }
}

function authoritativeCompilation(
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  partitionValidationIds?: readonly string[],
) {
  const versions = partitionValidationIds
    ? graph.validationVersions.filter(version => partitionValidationIds.includes(version.id))
    : graph.validationVersions
  if (
    !versions.length ||
    versions.some(
      version =>
        !hasAuthoritativeActivePublication(version, graph.targetKind) ||
        typeof version.activeGeneration?.realizationHash !== 'string' ||
        !version.activeGeneration.realizationHash,
    )
  )
    return undefined
  return {
    compilationHash: hashCanonical(
      [...versions]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(version => ({
          id: version.id,
          canonicalHash: version.canonicalHash,
          realizationHash: version.activeGeneration!.realizationHash,
          generationId: version.activeGeneration!.id,
          publicationId: version.activeGeneration!.publicationId,
          publicationOperationHash: version.activeGeneration!.operationHash,
        })),
    ),
    validationVersionIds: versions.map(version => version.id),
  }
}

function authoritativePublication(
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  partitionValidationIds?: readonly string[],
) {
  const versions = partitionValidationIds
    ? graph.validationVersions.filter(version => partitionValidationIds.includes(version.id))
    : graph.validationVersions
  if (!versions.length || versions.some(version => !hasAuthoritativeActivePublication(version, graph.targetKind)))
    return undefined
  return {
    validationVersionIds: versions.map(version => version.id),
    statuses: versions.map(version => version.status),
    generations: versions.map(version => ({
      validationVersionId: version.id,
      generationId: version.activeGeneration!.id,
      publicationId: version.activeGeneration!.publicationId,
      operationHash: version.activeGeneration!.operationHash,
    })),
  }
}

function hasAuthoritativeActivePublication(
  version: Awaited<ReturnType<typeof readQualityRequirementGraph>>['validationVersions'][number],
  targetKind?: string,
) {
  const generation = version.activeGeneration
  return Boolean(
    generation &&
    generation.disposition === 'ACTIVE' &&
    generation.preflightAlgorithmVersion === ASSESSMENT_PREFLIGHT_ALGORITHM &&
    generation.preflightAuthority === expectedQualityPublicationPreflightAuthority(targetKind ?? 'LOCAL_WORKSPACE') &&
    generation.publicationId &&
    generation.operationHash &&
    generation.runtimeInputHash,
  )
}

type PreparationRecord = {
  id: string
  phase: string
  receiptJson: string
  failureJson: string | null
  inputHash: string
}
type PreparationState = {
  preparation: PreparationRecord
  receipt: Receipt
  remoteScopeBinding?: RemoteScopeCheckpointBinding
}
type Compilation = { compilationHash: string; validationVersionIds: string[] }

function preparationState(
  preparation: PreparationRecord,
  remoteScopeBinding?: RemoteScopeCheckpointBinding,
): PreparationState {
  return { preparation, receipt: receiptFor(preparation), remoteScopeBinding }
}

async function advance(state: PreparationState, phase: string, update: Receipt) {
  return preparationState(
    await checkpoint(state.preparation.id, phase, update, state.remoteScopeBinding),
    state.remoteScopeBinding,
  )
}

async function acquirePreparation(
  input: PreparationInput,
  targetProjectId: string,
  inputHash: string,
  remoteScopeBinding?: RemoteScopeCheckpointBinding,
) {
  const acquire = async (client: typeof prisma) => {
    if (remoteScopeBinding) {
      const { assertRemoteEvaluationScopeCurrent } = await import('./remote-evaluation-scope-service')
      await assertRemoteEvaluationScopeCurrent(remoteScopeBinding, client as never)
    }
    return client.assessmentPreparation.upsert({
      where: { targetProjectId_idempotencyKey: { targetProjectId, idempotencyKey: input.idempotencyKey } },
      create: {
        targetProjectId,
        idempotencyKey: input.idempotencyKey,
        inputHash,
        qualityPlanId: input.qualityPlanId,
        qualityPlanRevisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
      },
      update: {},
    })
  }
  const preparation = (await (prisma.$transaction
    ? prisma.$transaction(tx => acquire(tx as typeof prisma))
    : acquire(prisma))) as PreparationRecord
  if (preparation.inputHash !== inputHash)
    throw new ServiceError('assessment_prepare_run idempotency key has different canonical input.', 'CONFLICT')
  return preparation
}

async function ensureReadiness(
  state: PreparationState,
  readiness: Awaited<ReturnType<typeof ensureBuiltInStepDefinitionReadiness>>,
) {
  return hasPhase(state.receipt, 'READINESS') ? state : advance(state, 'READINESS', { readiness })
}

function preparationPreflight(
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  bindings: PreparedBinding[],
  realization: CanonicalPreparationRealization,
) {
  const stepReferences = bindings.flatMap(binding => binding.steps.map(step => step.step))
  const locatorReferences = bindings.flatMap(binding =>
    binding.locators.map(locator => ({
      id: locator.id,
      version: locator.version,
      contentHash: locator.contentHash,
    })),
  )
  const realizationIntentHash = realizationPreflightHash(realization)
  return {
    ready: true,
    algorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
    validationCount: bindings.length,
    stepReferenceCount: stepReferences.length,
    locatorReferenceCount: locatorReferences.length,
    stepReferenceHash: digest(stepReferences),
    locatorReferenceHash: digest(locatorReferences),
    realizationIntentHash,
    preflightHash: realizationIntentHash,
    validations: realization.validations.map(item => {
      const binding = bindings.find(candidate => candidate.validationId === item.validationVersionId)!
      return {
        validationVersionId: item.validationVersionId,
        stepReferenceCount: binding.steps.length,
        locatorReferenceCount: binding.locators.length,
        realizationHash: item.integrityHash,
      }
    }),
    diagnostics: [],
  }
}

/**
 * The sole preflight authority for a compact remote assessment request.  It is
 * intentionally read-only: scope issuance, public preflight, and preparation
 * call this exact resolver and then decide independently whether a write is
 * allowed.  Do not add a lighter remote-only fingerprint here; that was the
 * v1 split-brain bug.
 */
export type CanonicalAssessmentPreflight = ReturnType<typeof preparationPreflight> & {
  schemaVersion: typeof ASSESSMENT_PREFLIGHT_RECEIPT_SCHEMA
  algorithmVersion: typeof ASSESSMENT_PREFLIGHT_ALGORITHM
  scopeIntentHash: string
  realizationIntentHash: string
  preflightHash: string
}

// Imported by the SQLite integration harness through an isolated generated module.
// fallow-ignore-next-line unused-export
export async function resolveCanonicalAssessmentPreflight(
  source: unknown,
  client: typeof prisma = prisma,
  authority: RemoteScopeAuthority = { kind: 'all-approved-v2' },
): Promise<CanonicalAssessmentPreflight> {
  const raw = source as Record<string, unknown>
  const parsedRemoteInput = remoteEvaluationScopeCreateSchema.parse({
    target: raw.target,
    qualityPlanId: raw.qualityPlanId,
    revisionId: raw.revisionId,
    expectedDesignHash: raw.expectedDesignHash,
    validationBindings: raw.validationBindings,
    environment: raw.environment,
    runtime: raw.runtime,
    idempotencyKey: raw.idempotencyKey ?? 'canonical-preflight',
  })
  // The canonical resolver is shared by scope issuance, public preflight, and
  // preparation. Normalize the compact fields at this boundary so locator
  // discovery order cannot change the resolved graph or any v2 identity.
  // Keep step arrays untouched: their order is authored execution semantics.
  const remoteInput = {
    ...parsedRemoteInput,
    validationBindings: normalizedRemoteScopeBindings(parsedRemoteInput.validationBindings),
  }
  const target = await client.targetProject.findFirst({
    where: {
      OR: [{ id: remoteInput.target }, { fingerprint: remoteInput.target }, { canonicalIdentity: remoteInput.target }],
    },
  })
  if (!target || target.kind !== 'REMOTE_BLACK_BOX')
    throw new ServiceError('REMOTE_BLACK_BOX target was not found for canonical preflight.', 'NOT_FOUND')
  const environment = await client.environment.findFirst({
    where: { id: remoteInput.environment.environmentId, targetProjectId: target.id },
  })
  if (!environment) throw new ServiceError('Environment was not found for canonical preflight.', 'NOT_FOUND')
  const preparation = {
    ...remoteInput,
    subject: { subjectRevisionId: 'canonical-preflight-subject' },
    environment: { environmentId: environment.id },
    runtime: { browserEngine: remoteInput.runtime.browserEngine ?? 'CHROMIUM' },
  } as PreparationInput
  const { graph, bindings } = await validateAndResolveBindings(preparation, target.id, client, authority)
  const realization = buildAndValidateRealization({
    preparation,
    graph,
    bindings,
    environmentId: environment.id,
    target,
  })
  const policies = remoteScopePolicies()
  const frozenEnvironment = canonicalRemoteEvaluationEnvironmentBinding(
    environment as unknown as RemoteScopeEnvironment,
    target as unknown as RemoteScopeTarget,
  )
  const validationCatalog = graph.validationVersions
    .map(version => ({
      validationVersionId: version.id,
      validationIdentity: version.validationIdentity,
      version: version.version,
      canonicalHash: version.canonicalHash,
      // The graph read model exposes the canonical AST hash as canonicalHash;
      // it intentionally does not expose raw AST bytes at this boundary.
      canonicalAstHash: version.canonicalHash,
    }))
    .sort((left, right) => left.validationVersionId.localeCompare(right.validationVersionId))
  const stepDefinitions = bindings
    .flatMap(binding =>
      binding.steps.map(step => ({
        validationVersionId: binding.validationId,
        stepId: step.step.id,
        version: step.step.version,
        definitionHash: step.step.definitionHash,
      })),
    )
    .sort((left, right) => canonicalContractJson(left).localeCompare(canonicalContractJson(right)))
  const locators = bindings
    .flatMap(binding =>
      binding.locators.map(locator => ({
        validationVersionId: binding.validationId,
        id: locator.id,
        name: locator.binding.name,
        value: locator.binding.value,
        locatorGroupId: locator.binding.locatorGroupId,
        locatorGroup: binding.locatorGroups.find(group => group.id === locator.binding.locatorGroupId),
      })),
    )
    .sort((left, right) => left.id.localeCompare(right.id))
  const scopeIntent = {
    schemaVersion: 'appraise.quality-assessment-scope-intent/v2',
    target: { id: target.id, kind: target.kind, fingerprint: target.fingerprint },
    qualityPlan: {
      id: remoteInput.qualityPlanId,
      revisionId: remoteInput.revisionId,
      revisionContentHash: graph.revision.contentHash,
      designHash: graph.designHash,
    },
    validationBindings: normalizedRemoteScopeBindings(remoteInput.validationBindings),
    validationCatalog,
    stepDefinitions,
    locators,
    environment: {
      id: environment.id,
      scopeVersion: environment.scopeVersion,
      snapshotHash: hashCanonical(frozenEnvironment),
    },
    runtime: { browserEngine: remoteInput.runtime.browserEngine ?? 'CHROMIUM' },
    policies,
  }
  const scopeIntentHash = hashCanonical(scopeIntent)
  const realizationIntent = realizationIntentFor(realization)
  const realizationIntentHash = hashCanonical({
    schemaVersion: 'appraise.quality-realization-intent/v2',
    validations: realizationIntent,
  })
  const preflightHash = hashCanonical({
    algorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
    scopeIntentHash,
    realizationIntentHash,
  })
  return {
    ...preparationPreflight(graph, bindings, realization),
    validationCount: bindings.length,
    schemaVersion: ASSESSMENT_PREFLIGHT_RECEIPT_SCHEMA,
    algorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
    scopeIntentHash,
    realizationIntentHash,
    preflightHash,
  }
}

setCanonicalAssessmentPreflightAuthority((source, client, authority) =>
  resolveCanonicalAssessmentPreflight(
    remoteScopeRequestIdentity(source as RemoteEvaluationScopeCreateInput),
    client,
    authority,
  ),
)

function environmentIdFrom(receipt: Receipt) {
  const id = (receipt.environment as { id?: string } | undefined)?.id
  if (!id) throw new ServiceError('Preparation receipt is missing environment identity.', 'CONFLICT')
  return id
}

async function ensurePreparationEnvironment(state: PreparationState, input: PreparationInput, targetProjectId: string) {
  if (hasPhase(state.receipt, 'ENVIRONMENT')) return state
  const ensured = await ensureEnvironment(input.environment, targetProjectId)
  const environment = environmentSummary(ensured.environment)
  return advance(state, 'ENVIRONMENT', { environment: { ...environment, outcome: ensured.outcome } })
}

function compilationFrom(state: PreparationState): Compilation | undefined {
  const compilation = state.receipt.compilation as Partial<Compilation> | undefined
  if (!compilation?.compilationHash || !compilation.validationVersionIds?.length) return undefined
  return compilation as Compilation
}

async function observedGraph(input: PreparationInput) {
  return readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: input.revisionId })
}

async function persistedPartitionValidationIds(binding?: RemoteScopeCheckpointBinding) {
  if (!binding) return undefined
  const remoteScopeModule = await import('./remote-evaluation-scope-service')
  if (!('remoteScopePartitionAuthorityForSubject' in remoteScopeModule)) return undefined
  const authority = await remoteScopeModule.remoteScopePartitionAuthorityForSubject({
    subjectRevisionId: binding.subjectRevisionId,
  })
  return authority.kind === 'persisted-partition-manifest' ? authority.validationVersionIds : undefined
}

function compilationResult(
  committed: Compilation | undefined,
  realized: Awaited<ReturnType<typeof compileQualityValidations>> | undefined,
) {
  const compilationHash = committed?.compilationHash ?? realized?.compilationHash
  const validationVersionIds =
    committed?.validationVersionIds ?? realized?.validationVersions.map(version => version.id)
  if (!compilationHash || !validationVersionIds?.length)
    throw new ServiceError('Preparation cannot derive an immutable compilation hash.', 'CONFLICT')
  return { compilationHash, validationVersionIds }
}

async function ensureRealized(
  state: PreparationState,
  input: PreparationInput,
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  bindings: PreparedBinding[],
  environmentId: string,
  target: { id: string; fingerprint: string },
  inputHash: string,
  remoteScopeBinding?: RemoteScopeCheckpointBinding,
) {
  const checkpointed = compilationFrom(state)
  if (hasPhase(state.receipt, 'REALIZED') && checkpointed) return state
  const candidate = buildAndValidateRealization({
    preparation: input,
    graph,
    bindings,
    environmentId,
    target,
  })
  const partitionValidationIds = await persistedPartitionValidationIds(remoteScopeBinding)
  const observed = await observedGraph(input)
  assertPersistedRealizationsMatch(observed, candidate, partitionValidationIds)
  const committed = authoritativeCompilation(observed, partitionValidationIds)
  const realized = committed
    ? undefined
    : await compileQualityValidations({
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        realization: candidate,
        ...(remoteScopeBinding ? { remoteScopeBinding } : {}),
      })
  const compilation = compilationResult(
    authoritativeCompilation(await observedGraph(input), partitionValidationIds) ?? committed,
    realized,
  )
  return advance(state, 'REALIZED', {
    compilation,
    hashes: { inputHash, compilationHash: compilation.compilationHash },
  })
}

function publicationResult(
  committed: ReturnType<typeof authoritativePublication>,
  published: Awaited<ReturnType<typeof publishQualityValidations>> | undefined,
) {
  const validationVersionIds =
    committed?.validationVersionIds ?? published?.validationVersions.map(version => version.id)
  const statuses = committed?.statuses ?? published?.validationVersions.map(version => version.status)
  const generations = committed?.generations ?? published?.validationVersions.map(version => version.activeGeneration)
  if (
    !validationVersionIds?.length ||
    !statuses?.length ||
    !generations?.length ||
    generations.some(generation => !generation)
  )
    throw new ServiceError('Preparation cannot derive immutable publication identities.', 'CONFLICT')
  return { validationVersionIds, statuses, generations }
}

async function ensurePublished(
  state: PreparationState,
  input: PreparationInput,
  remoteScopeBinding?: RemoteScopeCheckpointBinding,
) {
  if (hasPhase(state.receipt, 'PUBLISHED')) return state
  const compilation = compilationFrom(state)
  if (!compilation) throw new ServiceError('Preparation receipt is missing compilation checkpoint.', 'CONFLICT')
  const partitionValidationIds = await persistedPartitionValidationIds(remoteScopeBinding)
  const committed = authoritativePublication(await observedGraph(input), partitionValidationIds)
  const published = committed
    ? undefined
    : await publishQualityValidations({
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        validationVersionIds: compilation.validationVersionIds,
        expectedCompilationHash: compilation.compilationHash,
        ...(remoteScopeBinding ? { remoteScopeBinding } : {}),
      })
  const publication = publicationResult(
    authoritativePublication(await observedGraph(input), partitionValidationIds) ?? committed,
    published,
  )
  return advance(state, 'PUBLISHED', { publication: { ...publication, compilationHash: compilation.compilationHash } })
}

function assessmentFrom(state: PreparationState) {
  return state.receipt.assessment as { id?: string; status?: string } | undefined
}

function selectedAssessmentConflict(code: string, message: string, assessmentId: string): never {
  throw new ServiceError(message, 'CONFLICT', 409, { code, assessmentId })
}

async function selectedReadyAssessment(input: PreparationInput, target: { id: string }) {
  if (!input.assessmentId) return null
  const selected = await readQualityAssessment(input.assessmentId)
  const assessment = selected.assessment
  const scopeMatches =
    selected.qualityPlan?.id === input.qualityPlanId &&
    selected.qualityPlan?.targetProjectId === target.id &&
    selected.revision?.revision?.id === input.revisionId
  if (!scopeMatches)
    selectedAssessmentConflict(
      'assessment_selector_scope_mismatch',
      'Selected Assessment does not match the requested target, Quality Plan, or revision.',
      input.assessmentId,
    )

  const expectedSubject = input.subject
  const subjectMatches =
    'subjectRevisionId' in expectedSubject
      ? selected.subject?.id === expectedSubject.subjectRevisionId &&
        (!expectedSubject.expectedSubjectDigest ||
          selected.subject?.subjectDigest === expectedSubject.expectedSubjectDigest)
      : selected.subject?.subjectDigest === expectedSubject.subjectDigest &&
        selected.subject?.authority === expectedSubject.authority &&
        selected.subject?.subjectKind === (expectedSubject.subjectKind ?? 'ARTIFACT') &&
        canonicalContractJson(selected.subject?.metadata ?? null) ===
          canonicalContractJson(expectedSubject.metadata ?? null)
  if (!subjectMatches)
    selectedAssessmentConflict(
      'assessment_selector_scope_mismatch',
      'Selected Assessment does not match the requested immutable subject.',
      input.assessmentId,
    )

  const isRoot = assessment.supersedesAssessmentId === null
  const lineageMatches = isRoot
    ? assessment.generation === 0 && assessment.lineageId === assessment.id
    : assessment.generation > 0 && Boolean(assessment.lineageId) && assessment.lineageId !== assessment.id
  if (!lineageMatches)
    selectedAssessmentConflict(
      'assessment_selector_lineage_invalid',
      'Selected Assessment has an inconsistent immutable lineage.',
      input.assessmentId,
    )
  if (assessment.status !== 'READY')
    selectedAssessmentConflict(
      'assessment_selector_not_ready',
      'Selected Assessment must be READY before preparation can bind a new AssessmentRun.',
      input.assessmentId,
    )
  return selected
}

async function ensureAssessment(state: PreparationState, input: PreparationInput, target: { id: string }) {
  const assessment = assessmentFrom(state)
  if (hasPhase(state.receipt, 'ASSESSMENT') && assessment?.id) return state
  const selected = await selectedReadyAssessment(input, target)
  if (selected)
    return advance(state, 'ASSESSMENT', {
      assessment: { id: selected.assessment.id, status: selected.assessment.status },
    })
  try {
    const created = await createQualityAssessment({
      qualityPlanId: input.qualityPlanId,
      revisionId: input.revisionId,
      subject: input.subject,
      idempotencyKey: `prepare:${input.idempotencyKey}`,
    })
    return advance(state, 'ASSESSMENT', {
      assessment: { id: created.assessment.id, status: created.assessment.status },
    })
  } catch (error) {
    // A fresh preparation key after a terminal capsule-start failure must use
    // the same still-READY Assessment root. The root reservation conflict is
    // the proof that it is the exact target/revision/subject scope requested
    // above; re-read it and let the new preparation own a new AssessmentRun.
    const assessmentId =
      error instanceof ServiceError && error.details?.code === 'assessment_scope_reserved'
        ? error.details.assessmentId
        : undefined
    if (typeof assessmentId !== 'string') throw error
    const existing = await readQualityAssessment(assessmentId)
    if (existing.assessment.status !== 'READY') {
      if (existing.assessment.status === 'RUNNING')
        throw new ServiceError(
          'Assessment execution is already reserved by an active run; wait for it or reconcile its terminal evidence.',
          'CONFLICT',
          409,
          {
            code: 'assessment_execution_reserved',
            assessmentId,
            nextRecommendedAction: 'assessment_reconcile',
            nextRequiredAgentBehavior: 'wait_for_active_assessment_execution_then_reconcile',
          },
        )
      throw error
    }
    return advance(state, 'ASSESSMENT', {
      assessment: { id: existing.assessment.id, status: existing.assessment.status },
    })
  }
}

async function ensureStarted(state: PreparationState, input: PreparationInput, environmentId: string) {
  if (hasPhase(state.receipt, 'STARTED')) return state
  const assessmentId = assessmentFrom(state)?.id
  if (!assessmentId) throw new ServiceError('Preparation receipt is missing Assessment identity.', 'CONFLICT')
  const run = await runQualityAssessment({
    assessmentId,
    runtime: { environmentId, browserEngine: input.runtime.browserEngine ?? BrowserEngine.CHROMIUM },
    authorizationGrantId: input.authorizationGrantId,
    executionRequestId: input.executionRequestId,
    expectedRequestHash: input.expectedRequestHash,
    consentId: input.consentId,
    expectedExecutionManifestHash: input.expectedExecutionManifestHash,
    idempotencyKey: `prepare:${input.idempotencyKey}`,
  })
  return advance(state, 'STARTED', { assessmentRun: { id: run.id, status: run.status } })
}

async function startedPreparationReplay(input: PreparationInput, targetProjectId: string, inputHash: string) {
  const preparation = (await prisma.assessmentPreparation.findUnique({
    where: { targetProjectId_idempotencyKey: { targetProjectId, idempotencyKey: input.idempotencyKey } },
  })) as PreparationRecord | null
  if (!preparation) return null
  if (preparation.inputHash !== inputHash)
    throw new ServiceError('assessment_prepare_run idempotency key has different canonical input.', 'CONFLICT')
  if (preparation.phase !== 'STARTED') return null
  assertCompletedReplayPreflight(preparation, input.expectedPreflight)
  return response(preparation, true)
}

/** A terminal TestRun is immutable history. Its preparation key must remain a
 * stable receipt rather than silently discovering that a second replay can no
 * longer perform any execution work. After reconciliation returns the exact
 * Assessment root to READY, a new preparation key owns the retry. */
async function terminalExecutionPreparationReplay(input: PreparationInput, targetProjectId: string, inputHash: string) {
  const preparation = (await prisma.assessmentPreparation.findUnique({
    where: { targetProjectId_idempotencyKey: { targetProjectId, idempotencyKey: input.idempotencyKey } },
  })) as PreparationRecord | null
  if (!preparation) return null
  if (preparation.inputHash !== inputHash)
    throw new ServiceError('assessment_prepare_run idempotency key has different canonical input.', 'CONFLICT')
  return isTerminalExecutionFailure(preparation) ? response(preparation, true) : null
}

function existingEnvironmentIdFor(input: PreparationInput) {
  const environmentId = 'environmentId' in input.environment ? input.environment.environmentId : undefined
  if (input.expectedPreflight && !environmentId)
    throw new ServiceError('expectedPreflight requires an existing environmentId.', 'VALIDATION', 400, {
      code: 'preflight_requires_existing_environment',
    })
  return environmentId
}

async function assertRemotePreparationSubject(input: PreparationInput, targetId: string) {
  const targetRecord = prisma.targetProject?.findUnique
    ? await prisma.targetProject.findUnique({ where: { id: targetId }, select: { kind: true } })
    : null
  const { parseRemoteSubjectReference } = await import('./remote-evaluation-scope-service')
  const remoteTarget = targetRecord?.kind === 'REMOTE_BLACK_BOX'
  if (remoteTarget && !parseRemoteSubjectReference(input.subject))
    throw new ServiceError(
      'REMOTE_BLACK_BOX assessment preparation requires subjectRevisionId from evaluation_subject_remote_scope_create.',
      'VALIDATION',
    )
  if (remoteTarget && 'allowCreate' in input.environment)
    throw new ServiceError(
      'REMOTE_BLACK_BOX preparation requires the scope-bound existing environmentId.',
      'VALIDATION',
    )
  return remoteTarget
}

async function resolvedBindingsForPreparation(
  input: PreparationInput,
  targetId: string,
  mustValidateBeforeReadiness: boolean,
) {
  const guarded =
    mustValidateBeforeReadiness || input.expectedPreflight
      ? await validateAndResolveBindings(input, targetId)
      : undefined
  const readiness = guarded ? undefined : await ensureBuiltInStepDefinitionReadiness(prisma)
  return { readiness, ...(guarded ?? (await validateAndResolveBindings(input, targetId))) }
}

async function preflightForPreparationContext(input: {
  request: PreparationInput
  target: { id: string; fingerprint: string; kind?: string }
  environmentId: string | undefined
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>
  bindings: Awaited<ReturnType<typeof validateAndResolveBindings>>['bindings']
}) {
  const existingEnvironment = input.environmentId
    ? await getEnvironmentByIdOrThrow(input.environmentId, input.target.id)
    : undefined
  const realization = existingEnvironment
    ? buildAndValidateRealization({
        preparation: input.request,
        graph: input.graph,
        bindings: input.bindings,
        environmentId: existingEnvironment.id,
        target: input.target,
      })
    : undefined
  const isRemote = input.target.kind === 'REMOTE_BLACK_BOX'
  if (isRemote && !input.request.expectedPreflight)
    throw new ServiceError(
      'REMOTE_BLACK_BOX preparation requires the v2 preflight comparison token.',
      'VALIDATION',
      400,
      {
        code: 'expected_preflight_required',
      },
    )
  const preflight =
    existingEnvironment && isRemote
      ? await resolveCanonicalAssessmentPreflight(
          input.request,
          prisma,
          await (
            await import('./remote-evaluation-scope-service')
          ).remoteScopePartitionAuthorityForSubject(input.request.subject),
        )
      : realization
        ? preparationPreflight(input.graph, input.bindings, realization)
        : undefined
  if (
    input.request.expectedPreflight &&
    (preflight?.algorithmVersion !== input.request.expectedPreflight.algorithmVersion ||
      preflight?.preflightHash !== input.request.expectedPreflight.preflightHash)
  )
    throw new ServiceError('Assessment preflight hash is stale.', 'CONFLICT', 409, {
      code: 'preflight_stale',
    })
  return { existingEnvironment, realization, preflight }
}

async function resolvePreparationContext(
  input: PreparationInput,
  target: { id: string; fingerprint: string; kind?: string },
) {
  const environmentId = existingEnvironmentIdFor(input)
  const remoteTarget = await assertRemotePreparationSubject(input, target.id)
  const bindingsContext = await resolvedBindingsForPreparation(input, target.id, remoteTarget)
  const preflightContext = await preflightForPreparationContext({
    request: input,
    target,
    environmentId,
    graph: bindingsContext.graph,
    bindings: bindingsContext.bindings,
  })
  const remoteScope = preflightContext.preflight
    ? await assertRemoteScopeIfApplicable(input, target, preflightContext.preflight)
    : null
  return { environmentId, ...bindingsContext, ...preflightContext, remoteScope }
}

async function assertCurrentPreparationRemoteScope(
  remoteScope: Awaited<ReturnType<typeof assertRemoteScopeIfApplicable>>,
) {
  if (!remoteScope) return
  const { assertRemoteEvaluationScopeCurrent } = await import('./remote-evaluation-scope-service')
  await assertRemoteEvaluationScopeCurrent(remoteScope.phaseBinding)
}

async function advancePreparationToStarted(input: {
  preparation: PreparationRecord
  request: PreparationInput
  target: { id: string; fingerprint: string }
  inputHash: string
  ready: Awaited<ReturnType<typeof ensureBuiltInStepDefinitionReadiness>>
  context: Awaited<ReturnType<typeof resolvePreparationContext>>
  bindings: BindingsMetadata
}) {
  const { bindings, context, inputHash, preparation, ready, request, target } = input
  let state = await ensureReadiness(preparationState(preparation, context.remoteScope?.phaseBinding), ready)
  if (!hasPhase(state.receipt, 'BINDINGS')) state = await advance(state, 'BINDINGS', { bindings })
  if (!hasPhase(state.receipt, 'PREFLIGHT')) {
    state = await advance(state, 'PREFLIGHT', {
      preflight: context.preflight
        ? boundedPreflight(context.preflight)
        : {
            ready: true,
            environmentResolution: 'deferred_until_explicit_creation',
            diagnostics: [],
          },
    })
  }
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  state = await ensurePreparationEnvironment(state, request, target.id)
  const environmentId = environmentIdFrom(state.receipt)
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  state = await ensureRealized(
    state,
    request,
    context.graph,
    context.bindings,
    environmentId,
    target,
    inputHash,
    context.remoteScope?.phaseBinding,
  )
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  state = await ensurePublished(state, request, context.remoteScope?.phaseBinding)
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  state = await ensureAssessment(state, request, target)
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  state = await ensureStarted(state, request, environmentId)
  return state.preparation
}

async function executePreparation(
  input: PreparationInput,
  target: { id: string; fingerprint: string },
  inputHash: string,
  bindings: BindingsMetadata,
) {
  // This is normally caught by the outer idempotency lookup. Keep the same
  // immutable replay guard here for a completion racing that lookup, before
  // readiness repair or any other mutable work.
  const complete = await startedPreparationReplay(input, target.id, inputHash)
  if (complete) return complete
  const terminalFailure = await terminalExecutionPreparationReplay(input, target.id, inputHash)
  if (terminalFailure) return terminalFailure
  // Scope binding is resolved before readiness maintenance. This prevents a
  // raw, stale, or allowCreate remote command from changing durable state.
  const context = await resolvePreparationContext(input, target)
  // Re-read the bound snapshot before readiness or any preparation phase can
  // mutate durable state. Each downstream service repeats the same guard at
  // its own mutation boundary.
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  const ready = context.readiness ?? (await ensureBuiltInStepDefinitionReadiness(prisma))
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  const completedAfterReadiness = await startedPreparationReplay(input, target.id, inputHash)
  if (completedAfterReadiness) return completedAfterReadiness
  const terminalFailureAfterReadiness = await terminalExecutionPreparationReplay(input, target.id, inputHash)
  if (terminalFailureAfterReadiness) return terminalFailureAfterReadiness
  await assertCurrentPreparationRemoteScope(context.remoteScope)
  const preparation = await acquirePreparation(input, target.id, inputHash, context.remoteScope?.phaseBinding)
  if (preparation.phase === 'STARTED') {
    assertCompletedReplayPreflight(preparation, input.expectedPreflight)
    return response(preparation, true)
  }
  if (isTerminalExecutionFailure(preparation)) return response(preparation, true)
  try {
    await assertCurrentPreparationRemoteScope(context.remoteScope)
    return response(
      await advancePreparationToStarted({ preparation, request: input, target, inputHash, ready, context, bindings }),
    )
  } catch (error) {
    return response(await recordFailure(preparation.id, error))
  }
}

export async function prepareQualityAssessmentRun(source: unknown) {
  const request = inputSchema.parse(source)
  const target = await resolveTargetProject(request.target)
  const hydrated = await hydratePreparationBindings(request, target)
  const input = hydrated.input
  if (target.kind === 'REMOTE_BLACK_BOX' && !input.expectedPreflight)
    throw new ServiceError(
      'REMOTE_BLACK_BOX preparation requires the exact v2 expectedPreflight token.',
      'VALIDATION',
      400,
      {
        code: 'expected_preflight_required',
        requiredAlgorithmVersion: ASSESSMENT_PREFLIGHT_ALGORITHM,
      },
    )
  const immutableInput = Object.fromEntries(
    Object.entries(input).filter(
      ([key]) =>
        ![
          'authorizationGrantId',
          'executionRequestId',
          'expectedRequestHash',
          'consentId',
          'expectedExecutionManifestHash',
          'expectedPreflight',
        ].includes(key),
    ),
  )
  const inputHash = digest({ ...immutableInput, targetProjectId: target.id })
  // A completed command is immutable. Replaying its exact command identity
  // must not be invalidated by later mutable catalog/locator drift.
  const complete = await startedPreparationReplay(input, target.id, inputHash)
  if (complete) return complete
  // Validate an explicit successor selector before any readiness, environment,
  // realization, publication, preparation, or runtime mutation. It is read
  // again immediately before binding the AssessmentRun to close a status race.
  await selectedReadyAssessment(input, target)
  return executePreparation(input, target, inputHash, hydrated.bindings)
}

/**
 * Resolves exactly the same compact intent as preparation without readiness
 * repair, environment creation, durable receipts, publication, execution, or
 * runtime/capsule side effects. Public callers receive only bounded hashes and
 * counts; server-owned envelopes remain internal.
 */
async function resolveQualityAssessmentPreflight(
  source: unknown,
  verifyRemoteScope: boolean,
  client: typeof prisma = prisma,
) {
  const request = preflightInputSchema.parse(source)
  const target =
    client === prisma
      ? await resolveTargetProject(request.target)
      : await client.targetProject.findFirst({
          where: {
            OR: [{ id: request.target }, { fingerprint: request.target }, { canonicalIdentity: request.target }],
          },
        })
  if (!target) throw new ServiceError('Target project was not found for preflight.', 'NOT_FOUND')
  const hydrated = await hydratePreparationBindings(request, target, client)
  const input = hydrated.input as PreflightInput
  if (target.kind === 'REMOTE_BLACK_BOX') {
    // Resolve the issued scope before generic catalog validation. A changed
    // validation ID/set is external scope drift, never a misleading fresh
    // caller-input validation error.
    const remoteScopeModule = await import('./remote-evaluation-scope-service')
    const reference = remoteScopeModule.parseRemoteSubjectReference(input.subject)
    if (reference)
      await remoteScopeModule.assertRemoteEvaluationScopeCurrent(
        {
          subjectRevisionId: reference.subjectRevisionId,
          targetProjectId: target.id,
          qualityPlanId: input.qualityPlanId,
          revisionId: input.revisionId,
          environmentId: input.environment.environmentId,
        },
        client as never,
      )
    const preflight = await resolveCanonicalAssessmentPreflight(
      input,
      client,
      'remoteScopePartitionAuthorityForSubject' in remoteScopeModule
        ? await remoteScopeModule.remoteScopePartitionAuthorityForSubject(input.subject, client as never)
        : { kind: 'all-approved-v2' },
    )
    if (verifyRemoteScope)
      await assertRemoteScopeIfApplicable(
        { ...input, idempotencyKey: 'preflight' } as PreparationInput,
        target,
        preflight,
      )
    return { ...preflight, ...hydrated.bindings }
  }
  // Local/deployment preflight keeps its established generic behavior. The
  // v2 unification is specifically the remote scope authority and must not
  // impose remote environment/scope invariants on local authored work.
  const preparationInput = {
    ...input,
    environment: { environmentId: input.environment.environmentId },
    idempotencyKey: 'preflight',
  } as PreparationInput
  const { graph, bindings } = await validateAndResolveBindings(preparationInput, target.id, client)
  const environment =
    client === prisma
      ? await getEnvironmentByIdOrThrow(input.environment.environmentId, target.id)
      : await client.environment.findFirst({
          where: { id: input.environment.environmentId, targetProjectId: target.id },
        })
  if (!environment) throw new ServiceError('Environment was not found for preflight.', 'NOT_FOUND')
  const realization = buildAndValidateRealization({
    preparation: preparationInput,
    graph,
    bindings,
    environmentId: environment.id,
    target,
  })
  assertPersistedRealizationsMatch(graph, realization)
  const preflight = preparationPreflight(graph, bindings, realization)
  if (verifyRemoteScope) await assertRemoteScopeIfApplicable(preparationInput, target, preflight)
  return { ...preflight, ...hydrated.bindings }
}

export async function preflightQualityAssessmentRun(source: unknown) {
  const preflight = boundedPreflight(await resolveQualityAssessmentPreflight(source, true))
  return {
    ...preflight,
    expectedPreflight: {
      algorithmVersion: preflight.algorithmVersion,
      preflightHash: preflight.preflightHash,
    },
    nextRecommendedAction: 'assessment_prepare_run' as const,
  }
}

/** Internal compiler-bound resolver used only while issuing the first remote
 * scope. It performs the same pure DB/read-model resolution but cannot be
 * reached through an action, route, or MCP operation. */
