import { createHash } from 'node:crypto'

import { BrowserEngine } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { defaultOperationDefinitions, defaultOperationRegistry } from '@/lib/operation-catalog'
import { ensureEnvironment, environmentSummary } from '@/services/environment/environment-service'
import { ServiceError } from '@/services/shared/errors'
import { ensureBuiltInStepDefinitionReadiness } from '@/services/step-definition/built-in-readiness-service'
import { resolveTargetProject } from '@/services/target-project/target-project-service'
import {
  computeStepReferenceHash,
  stepDefinitionSchema,
  validateStepInvocationInputs,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import { runQualityAssessment } from './assessment-execution-service'
import {
  compileQualityValidations,
  createQualityAssessment,
  publishQualityValidations,
  readQualityRequirementGraph,
} from './quality-design-service'

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const browserSchema = z.nativeEnum(BrowserEngine)
const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const compactStepInputValueSchema = z.union([
  primitiveSchema,
  z.array(primitiveSchema),
  z.record(z.string(), primitiveSchema),
])

const compactStepBindingSchema = z.object({
  stepId: z.string().min(1),
  version: z.string().min(1),
  inputs: z.record(z.string(), compactStepInputValueSchema).default({}),
  keyword: z.enum(['Given', 'When', 'Then', 'And']).default('Given'),
  description: z.string().min(1).max(500),
})
const bindingSchema = z.object({
  validationId: z.string().min(1),
  steps: z.array(compactStepBindingSchema).min(1),
  locatorIds: z.array(z.string().min(1)).max(100).default([]),
})
const environmentProposalSchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  expectedPageTitle: z.string().max(200).optional(),
  apiBaseUrl: z.string().url().optional(),
  username: z.string().optional(),
  passwordEnvironmentVariable: z
    .string()
    .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .optional(),
})
const inputSchema = z.object({
  target: z.string().min(1),
  qualityPlanId: z.string().min(1),
  revisionId: z.string().min(1),
  expectedDesignHash: z.string().startsWith('sha256:'),
  validationBindings: z.array(bindingSchema).min(1),
  environment: z.object({
    environmentId: z.string().min(1).optional(),
    allowCreate: z.literal(true).optional(),
    proposal: environmentProposalSchema.optional(),
  }),
  subject: z.object({
    subjectDigest: z.string().startsWith('sha256:'),
    authority: z.string().min(1),
    subjectKind: z.enum(['ARTIFACT', 'DEPLOYMENT_SNAPSHOT']).optional(),
    metadata: z.record(z.string(), primitiveSchema).optional(),
  }),
  runtime: z.object({ browserEngine: browserSchema.optional() }).default({}),
  idempotencyKey: z.string().min(1).max(1_000),
})

type PreparationInput = z.infer<typeof inputSchema>
type Receipt = Record<string, unknown>
type PreparedBinding = {
  validationId: string
  steps: Array<
    z.infer<typeof compactStepBindingSchema> & {
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
  'request_invalid' | 'state_conflict' | 'prerequisite_missing' | 'infrastructure_failure' | 'target_failure'

type PreparationFailure = { message: string; classification: PreparationFailureClassification }

function phaseReceipts(receipt: Receipt) {
  return (receipt.phases && typeof receipt.phases === 'object' ? receipt.phases : {}) as Record<string, unknown>
}

function hasPhase(receipt: Receipt, name: string) {
  return Object.hasOwn(phaseReceipts(receipt), name)
}

function receiptFor(preparation: { receiptJson: string }) {
  return JSON.parse(preparation.receiptJson) as Receipt
}

function response(
  preparation: { id: string; phase: string; receiptJson: string; failureJson: string | null },
  unchanged = false,
) {
  const receipt = receiptFor(preparation)
  const failure = preparation.failureJson ? (JSON.parse(preparation.failureJson) as PreparationFailure) : undefined
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
    ...(failure ? { blockers: [failure], failure } : {}),
    retry,
    nextRecommendedAction: recommendedAction(complete, retry.safe),
    nextRequiredAgentBehavior: requiredBehavior(complete, retry.safe),
  }
}

function preparationRetry(failure: PreparationFailure | undefined, complete: boolean) {
  const classification = failure?.classification ?? (complete ? 'target_failure' : 'infrastructure_failure')
  return {
    safe: classification === 'prerequisite_missing' || classification === 'infrastructure_failure',
    classification,
  }
}

function recommendedAction(complete: boolean, safe: boolean) {
  if (complete) return 'assessment_reconcile'
  return safe ? 'assessment_prepare_run' : 'project_diagnostic'
}

function requiredBehavior(complete: boolean, safe: boolean) {
  if (complete) return 'wait_for_terminal_execution_then_reconcile'
  return safe ? 'replay_same_idempotency_key_to_resume' : 'inspect_diagnostic_and_revise_request_or_state'
}

async function checkpoint(preparationId: string, phase: string, update: Receipt) {
  const current = await prisma.assessmentPreparation.findUniqueOrThrow({ where: { id: preparationId } })
  const receipt = receiptFor(current)
  const next = { ...receipt, ...update, phases: { ...phaseReceipts(receipt), [phase]: update } }
  return prisma.assessmentPreparation.update({
    where: { id: preparationId },
    data: { phase, receiptJson: canonicalContractJson(next), failureJson: null },
  })
}

async function recordFailure(preparationId: string, error: unknown) {
  const failure: PreparationFailure = {
    message: error instanceof Error ? error.message : 'Preparation failed.',
    classification:
      error instanceof ServiceError && error.code === 'CONFLICT'
        ? 'state_conflict'
        : error instanceof ServiceError && error.code === 'VALIDATION'
          ? 'request_invalid'
          : error instanceof ServiceError && error.code === 'NOT_FOUND'
            ? 'prerequisite_missing'
            : 'infrastructure_failure',
  }
  return prisma.assessmentPreparation.update({
    where: { id: preparationId },
    data: { failureJson: canonicalContractJson(failure) },
  })
}

async function approvedGraph(input: PreparationInput, targetProjectId: string) {
  const graph = await readQualityRequirementGraph({ qualityPlanId: input.qualityPlanId, revisionId: input.revisionId })
  if (graph.qualityPlan.targetProjectId !== targetProjectId)
    throw new ServiceError('Quality Plan does not belong to the requested target.', 'CONFLICT')
  if (!['SCENARIOS_APPROVED', 'REALIZED', 'PUBLISHED'].includes(graph.revision.status))
    throw new ServiceError('Scenario approval is required before preparation.', 'CONFLICT')
  if (graph.designHash !== input.expectedDesignHash)
    throw new ServiceError('Scenario design hash is stale.', 'CONFLICT')
  return graph
}

function assertCurrentValidationBindings(
  graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>,
  validationBindings: PreparationInput['validationBindings'],
) {
  const expected = new Set(graph.validationVersions.map(version => version.id))
  const actual = new Set(validationBindings.map(binding => binding.validationId))
  if (
    validationBindings.length !== expected.size ||
    expected.size !== actual.size ||
    [...expected].some(id => !actual.has(id))
  )
    throw new ServiceError(
      'validationBindings must cover each current approved ValidationVersion exactly once.',
      'VALIDATION',
    )
}

async function readyStepDefinitions(validationBindings: PreparationInput['validationBindings']) {
  const requestedSteps = validationBindings.flatMap(binding => binding.steps)
  const exactDefinitions = await prisma.stepDefinition.findMany({
    where: { OR: requestedSteps.map(step => ({ id: step.stepId, version: step.version, status: 'ready' })) },
    select: { id: true, version: true, definitionJson: true },
  })
  const definitions = new Map(
    exactDefinitions.map(row => {
      const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
      return [`${row.id}@${row.version}`, definition] as const
    }),
  )
  return definitions
}

async function targetLocators(validationBindings: PreparationInput['validationBindings'], targetProjectId: string) {
  const locatorIds = [...new Set(validationBindings.flatMap(binding => binding.locatorIds))]
  const locators = locatorIds.length
    ? await prisma.locator.findMany({
        where: { id: { in: locatorIds }, targetProjectId },
        select: {
          id: true,
          name: true,
          value: true,
          locatorGroupId: true,
          locatorGroup: { select: { id: true, name: true, route: true, moduleId: true } },
        },
      })
    : []
  if (
    locators.length !== locatorIds.length ||
    locators.some(locator => !locator.locatorGroupId || !locator.locatorGroup)
  )
    throw new ServiceError('Locator binding must reference a target-owned locator with a locator group.', 'CONFLICT')
  return new Map(locators.map(locator => [locator.id, locator]))
}

function preparedSteps(
  binding: PreparationInput['validationBindings'][number],
  definitions: Awaited<ReturnType<typeof readyStepDefinitions>>,
) {
  return binding.steps.map(step => {
    const definition = definitions.get(`${step.stepId}@${step.version}`)
    if (!definition) throw new ServiceError(`Step Definition ${step.stepId}@${step.version} is not ready.`, 'CONFLICT')
    try {
      validateStepInvocationInputs(definition, step.inputs)
    } catch (error) {
      throw new ServiceError(
        error instanceof Error ? error.message : 'Step invocation inputs are invalid.',
        'VALIDATION',
      )
    }
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
        definitionHash: computeStepReferenceHash(definition),
      },
      locatorCardinalities,
    }
  })
}

function preparedLocators(
  binding: PreparationInput['validationBindings'][number],
  locatorsById: Awaited<ReturnType<typeof targetLocators>>,
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
      ...new Map(boundLocators.map(locator => [locator.locatorGroup!.id, locator.locatorGroup!])).values(),
    ],
  }
}

async function validateAndResolveBindings(input: PreparationInput, targetProjectId: string) {
  const graph = await approvedGraph(input, targetProjectId)
  assertCurrentValidationBindings(graph, input.validationBindings)
  const [definitions, locatorsById] = await Promise.all([
    readyStepDefinitions(input.validationBindings),
    targetLocators(input.validationBindings, targetProjectId),
  ])
  const bindings: PreparedBinding[] = input.validationBindings.map(binding => ({
    validationId: binding.validationId,
    steps: preparedSteps(binding, definitions),
    ...preparedLocators(binding, locatorsById),
  }))
  return { graph, bindings }
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
    validations: graph.validationVersions.map(version => {
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

function authoritativeCompilation(graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>) {
  const versions = graph.validationVersions
  if (
    !versions.length ||
    versions.some(
      version =>
        !['REALIZED', 'PUBLISHED'].includes(version.status) ||
        typeof version.realizationHash !== 'string' ||
        !version.realizationHash,
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
          realizationHash: version.realizationHash,
        })),
    ),
    validationVersionIds: versions.map(version => version.id),
  }
}

function authoritativePublication(graph: Awaited<ReturnType<typeof readQualityRequirementGraph>>) {
  if (!graph.validationVersions.length || graph.validationVersions.some(version => version.status !== 'PUBLISHED'))
    return undefined
  return {
    validationVersionIds: graph.validationVersions.map(version => version.id),
    statuses: graph.validationVersions.map(version => version.status),
  }
}

type PreparationRecord = {
  id: string
  phase: string
  receiptJson: string
  failureJson: string | null
  inputHash: string
}
type PreparationState = { preparation: PreparationRecord; receipt: Receipt }
type Compilation = { compilationHash: string; validationVersionIds: string[] }

function preparationState(preparation: PreparationRecord): PreparationState {
  return { preparation, receipt: receiptFor(preparation) }
}

async function advance(state: PreparationState, phase: string, update: Receipt) {
  return preparationState(await checkpoint(state.preparation.id, phase, update))
}

async function acquirePreparation(input: PreparationInput, targetProjectId: string, inputHash: string) {
  const preparation = (await prisma.assessmentPreparation.upsert({
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
  })) as PreparationRecord
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
) {
  const stepReferences = bindings.flatMap(binding => binding.steps.map(step => step.step))
  const locatorReferences = bindings.flatMap(binding =>
    binding.locators.map(locator => ({
      id: locator.id,
      version: locator.version,
      contentHash: locator.contentHash,
    })),
  )
  return {
    ready: true,
    validationCount: graph.validationVersions.length,
    stepReferenceCount: stepReferences.length,
    locatorReferenceCount: locatorReferences.length,
    stepReferenceHash: digest(stepReferences),
    locatorReferenceHash: digest(locatorReferences),
  }
}

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
) {
  const checkpointed = compilationFrom(state)
  if (hasPhase(state.receipt, 'REALIZED') && checkpointed) return state
  const committed = authoritativeCompilation(await observedGraph(input))
  const realized = committed
    ? undefined
    : await compileQualityValidations({
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        expectedDesignHash: input.expectedDesignHash,
        realization: realizationFor(input, graph, bindings, environmentId, target),
      })
  const compilation = compilationResult(authoritativeCompilation(await observedGraph(input)) ?? committed, realized)
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
  if (!validationVersionIds?.length || !statuses?.length)
    throw new ServiceError('Preparation cannot derive immutable publication identities.', 'CONFLICT')
  return { validationVersionIds, statuses }
}

async function ensurePublished(state: PreparationState, input: PreparationInput) {
  if (hasPhase(state.receipt, 'PUBLISHED')) return state
  const compilation = compilationFrom(state)
  if (!compilation) throw new ServiceError('Preparation receipt is missing compilation checkpoint.', 'CONFLICT')
  const committed = authoritativePublication(await observedGraph(input))
  const published = committed
    ? undefined
    : await publishQualityValidations({
        qualityPlanId: input.qualityPlanId,
        revisionId: input.revisionId,
        validationVersionIds: compilation.validationVersionIds,
        expectedCompilationHash: compilation.compilationHash,
      })
  const publication = publicationResult(authoritativePublication(await observedGraph(input)) ?? committed, published)
  return advance(state, 'PUBLISHED', { publication: { ...publication, compilationHash: compilation.compilationHash } })
}

function assessmentFrom(state: PreparationState) {
  return state.receipt.assessment as { id?: string; status?: string } | undefined
}

async function ensureAssessment(state: PreparationState, input: PreparationInput) {
  const assessment = assessmentFrom(state)
  if (hasPhase(state.receipt, 'ASSESSMENT') && assessment?.id) return state
  const created = await createQualityAssessment({
    qualityPlanId: input.qualityPlanId,
    revisionId: input.revisionId,
    subject: input.subject,
    idempotencyKey: `prepare:${input.idempotencyKey}`,
  })
  return advance(state, 'ASSESSMENT', { assessment: { id: created.assessment.id, status: created.assessment.status } })
}

async function ensureStarted(state: PreparationState, input: PreparationInput, environmentId: string) {
  if (hasPhase(state.receipt, 'STARTED')) return state
  const assessmentId = assessmentFrom(state)?.id
  if (!assessmentId) throw new ServiceError('Preparation receipt is missing Assessment identity.', 'CONFLICT')
  const run = await runQualityAssessment({
    assessmentId,
    runtime: { environmentId, browserEngine: input.runtime.browserEngine ?? BrowserEngine.CHROMIUM },
    idempotencyKey: `prepare:${input.idempotencyKey}`,
  })
  return advance(state, 'STARTED', { assessmentRun: { id: run.id, status: run.status } })
}

async function executePreparation(
  input: PreparationInput,
  target: { id: string; fingerprint: string },
  inputHash: string,
) {
  // Synchronizing the built-in catalog is reversible readiness maintenance. All
  // request-specific validation happens before a preparation record, environment,
  // publication, Assessment, or TestRun is created.
  const readiness = await ensureBuiltInStepDefinitionReadiness(prisma)
  const { graph, bindings } = await validateAndResolveBindings(input, target.id)
  const preflight = preparationPreflight(graph, bindings)
  const preparation = await acquirePreparation(input, target.id, inputHash)
  if (preparation.phase === 'STARTED') return response(preparation, true)
  try {
    let state = await ensureReadiness(preparationState(preparation), readiness)
    if (!hasPhase(state.receipt, 'PREFLIGHT')) state = await advance(state, 'PREFLIGHT', { preflight })
    state = await ensurePreparationEnvironment(state, input, target.id)
    const environmentId = environmentIdFrom(state.receipt)
    state = await ensureRealized(state, input, graph, bindings, environmentId, target, inputHash)
    state = await ensurePublished(state, input)
    state = await ensureAssessment(state, input)
    state = await ensureStarted(state, input, environmentId)
    return response(state.preparation)
  } catch (error) {
    return response(await recordFailure(preparation.id, error))
  }
}

export async function prepareQualityAssessmentRun(source: unknown) {
  const input = inputSchema.parse(source)
  const target = await resolveTargetProject(input.target)
  const inputHash = digest({ ...input, targetProjectId: target.id })
  return executePreparation(input, target, inputHash)
}
