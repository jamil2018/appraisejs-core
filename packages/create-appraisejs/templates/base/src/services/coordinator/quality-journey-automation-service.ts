import {
  externalQualityJourneyAssignmentFields,
  projectExternalQualityJourneySubmission,
} from './quality-journey-external-submission-input'
import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient, QualityJourney, QualityJourneyWorkItem } from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import {
  assertInternalScenarioAutomationAssignment,
  registerInternalScenarioAutomationReadiness,
} from './quality-journey-scenario-automation-readiness'
import { readCompletedInternalDiscovery } from './quality-journey-discovery-service'
import { qualityJourneyRemediationScope } from './quality-journey-remediation-scope'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import {
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionContentHash,
  stepDefinitionSchema,
  stepExecutionBindingSchema,
  stepInvocationSchema,
  validateStepInvocationInputs,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import {
  automationMaterializationRequestSchema,
  automationTargetBindingSchema,
  hashAutomationMaterialization,
  hashAutomationTargetBinding,
  hashScenarioPortfolio,
  scenarioPortfolioSchema,
  workerResultEnvelopeSchema,
  preparedRuntimeCapsuleSchema,
  qualityJourneyWorkItemId,
  resourceResolutionBundleSchema,
  type AssignmentManifest,
  type WorkerResultEnvelope,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import {
  assertCoordinatorMutationSession,
  type CoordinatorSessionCredentials,
} from './quality-journey-coordinator-session'
import {
  acceptExternalQualityJourneySubmissionInTransaction,
  completeAutomatorWorkWithBusinessJoinInTransaction,
  externalAnalyzerAdmissionProtocol,
  externalAssignmentSecretHash,
  issueQualityJourneySpecializedWorkItemWithBusinessJoinInTransaction,
  setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction,
  type ExternalAnalyzerProjectPrincipal,
} from './quality-journey-service'
import {
  assertJourneyBusinessGroupSupportsNoInvalidationInTransaction,
  readJourneyBusinessEnrollmentKindInTransaction,
  withJourneyBusinessWriteJoinInTransaction,
  type BeforeJourneyBusinessWrite,
  type QueueAttemptTerminal,
} from './quality-journey-business-write-join'
import type { E2BusinessScope } from './quality-journey-e2-retirement-service'
import { prepareSharedResourceMutationInTransaction, type SharedResourceMutationKey } from './quality-journey-shared-resource-guard-service'
import {
  acquireSharedResourceUseInBusinessGroupInTransaction,
  resolveAutomationMaterializationUseRequestInTransaction,
  resolveResourceResolutionUseRequestInTransaction,
  validateActiveSharedResourceUseInTransaction,
  validateAutomationMaterializationOwnersInTransaction,
} from './quality-journey-shared-resource-use-service'

type Db = PrismaClient | Prisma.TransactionClient
const json = canonicalContractJson
const hash = hashAutomationMaterialization
const idFor = (kind: string, ...parts: string[]) =>
  `qja_${kind}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24)}`
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')

type ApprovedInput = {
  remediation?: NonNullable<Awaited<ReturnType<typeof qualityJourneyRemediationScope>>>
  journey: QualityJourney
  portfolio: {
    id: string
    artifactId: string
    artifactRevisionId: string
    discoveryRevisionId: string
    discoveryCompletionHash: string
    contentHash: string
    approvedIntentHash: string | null
    decisionSetHash: string | null
    scenarios: Array<{
      stableScenarioId: string
      scenarioRevisionId: string
      behavioralIntentJson: string
      behavioralIntentHash: string
      contentHash: string
      decisions: Array<{ id: string; decision: string; contentHash: string }>
    }>
  }
}

type AutomationMaterializationRequest = ReturnType<typeof automationMaterializationRequestSchema.parse>
const externalAutomationMaterializationRequestSchema = z
  .object({
    journeyId: z.string().min(1).max(200),
    targetProjectId: z.string().min(1).max(200),
    workItemId: z.string().min(1).max(200),
    attemptId: z.string().min(1).max(200),
    leaseId: z.string().min(1).max(200),
    expectedInputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    expectedScopeHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    scenarios: z.unknown(),
    result: z.unknown(),
    ...externalQualityJourneyAssignmentFields,
  })
  .strict()
type AutomationProposal = AutomationMaterializationRequest['scenarios'][number]
type ApprovedScenario = ApprovedInput['portfolio']['scenarios'][number]
type ScenarioIntent = {
  title: string
  narrative: string
  steps: Array<{ stepId: string; action: string; expected: string }>
}
type ReadyDefinition = {
  definition: ReturnType<typeof stepDefinitionSchema.parse>
  execution: ReturnType<typeof stepExecutionBindingSchema.parse> | null
}
type MappedStep = {
  source: ScenarioIntent['steps'][number]
  mapping: AutomationProposal['steps'][number]
  definition: ReturnType<typeof stepDefinitionSchema.parse>
  operation: (typeof defaultOperationDefinitions)[number]
  invocation: ReturnType<typeof stepInvocationSchema.parse>
}
type AutomationTargetBinding = ReturnType<typeof automationTargetBindingSchema.parse>
type AutomationResourceAuthority = {
  discoveryRevisionId: string
  resourceResolutionHash: string
  destinationModuleId: string
  allowedResourceIds: string[]
  stepDefinitionReferences: Set<string>
  locatorIds: Set<string>
  operationReferences: Set<string>
  frozenResourceHashes: Array<{ id: string; contentHash: string }>
}

/** Capture original authentication scalars before any await, preserving M03 legacy credentials. */
function snapshotAutomationCoordinatorCredentials(value: CoordinatorSessionCredentials | undefined): CoordinatorSessionCredentials | undefined {
  if (!value || typeof value !== 'object') return value
  return { journeyId: value.journeyId, targetProjectId: value.targetProjectId,
    coordinatorSessionId: value.coordinatorSessionId, coordinatorGeneration: value.coordinatorGeneration,
    coordinatorHandoffId: value.coordinatorHandoffId, coordinatorPrincipalId: value.coordinatorPrincipalId }
}

/** Original caller authority only. Retained source rows never supply credentials. */
async function automationSharedUseScope(
  tx: Prisma.TransactionClient,
  request: Pick<AutomationMaterializationRequest, 'journeyId' | 'targetProjectId'>,
  original: CoordinatorSessionCredentials | undefined,
): Promise<E2BusinessScope | null> {
  if (await readJourneyBusinessEnrollmentKindInTransaction(tx, request) === 'LEGACY') return null
  if (!original || typeof original !== 'object' || !original.coordinatorSessionId || !original.coordinatorGeneration ||
    original.journeyId !== request.journeyId || original.targetProjectId !== request.targetProjectId)
    throw new ServiceError('E2 Automator materialization requires the original current coordinator binding.', 'UNAUTHORIZED')
  return { journeyId: request.journeyId, targetProjectId: request.targetProjectId,
    coordinatorSessionId: original.coordinatorSessionId, generation: original.coordinatorGeneration,
    credentials: { ...original, journeyId: original.journeyId, targetProjectId: original.targetProjectId } }
}

async function validateSelectedAutomationResources(
  tx: Prisma.TransactionClient, ownScope: E2BusinessScope | null, resources: AutomationResourceAuthority,
): Promise<void> {
  if (!ownScope) return
  const request = await resolveResourceResolutionUseRequestInTransaction(tx, { scope: ownScope,
    discoveryRevisionId: resources.discoveryRevisionId, resourceResolutionHash: resources.resourceResolutionHash })
  await validateActiveSharedResourceUseInTransaction(tx, request)
}

/** Retained replay results are metadata until their exact own Use and complete root-owner closure pass. */
async function validateRetainedAutomationMaterialization(
  tx: Prisma.TransactionClient, ownScope: E2BusinessScope,
  materialization: { id: string; materializationHash: string },
): Promise<void> {
  const request = await resolveAutomationMaterializationUseRequestInTransaction(tx, { scope: ownScope,
    materializationId: materialization.id, materializationHash: materialization.materializationHash })
  await validateActiveSharedResourceUseInTransaction(tx, request)
  const associations = await tx.qualityJourneyAutomationMaterializationBinding.findMany({
    where: { materializationId: materialization.id }, orderBy: { bindingId: 'asc' }, take: 4097,
  })
  if (associations.length !== 1 || associations[0]!.materializationId !== materialization.id)
    throw new ServiceError('Retained Automator materialization requires its exact binding association.', 'CONFLICT')
  await validateAutomationMaterializationOwnersInTransaction(tx, { scope: ownScope, targetBindingId: associations[0]!.bindingId })
}

async function activeAutomationJourney(journeyId: string, targetProjectId: string, db: Db) {
  const journey = await db.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  if (journey.stage !== 'AUTOMATION')
    throw new ServiceError('Automator materialization is not active for this journey.', 'CONFLICT')
  if (!journey.activeScenarioPortfolioRevisionId)
    throw new ServiceError('Automator materialization requires an active approved Scenario Portfolio.', 'CONFLICT')
  return journey
}

function assertApprovedPortfolio(
  journey: Awaited<ReturnType<typeof activeAutomationJourney>>,
  portfolio: NonNullable<Awaited<ReturnType<PrismaClient['qualityJourneyScenarioPortfolioRevision']['findUnique']>>> & {
    scenarios: ApprovedInput['portfolio']['scenarios']
  },
) {
  if (portfolio.journeyId !== journey.id || portfolio.status !== 'APPROVED' || !portfolio.approvedIntentHash)
    throw new ServiceError('Automator materialization requires the exact approved Scenario Portfolio.', 'CONFLICT')
  if (!portfolio.scenarios.some(scenario => scenario.decisions.some(decision => decision.decision === 'APPROVED')))
    throw new ServiceError(
      'Automator materialization requires at least one exact approved scenario decision.',
      'CONFLICT',
    )
  return portfolio
}

async function approvedInput(journeyId: string, targetProjectId: string, db: Db): Promise<ApprovedInput> {
  const journey = await activeAutomationJourney(journeyId, targetProjectId, db)
  const portfolioRevisionId = journey.activeScenarioPortfolioRevisionId
  if (!portfolioRevisionId)
    throw new ServiceError('Automator materialization requires an active approved Scenario Portfolio.', 'CONFLICT')
  const portfolio = await db.qualityJourneyScenarioPortfolioRevision.findUnique({
    where: { id: portfolioRevisionId },
    include: { scenarios: { include: { decisions: true }, orderBy: { scenarioRevisionId: 'asc' } } },
  })
  if (!portfolio)
    throw new ServiceError('Automator materialization requires the exact approved Scenario Portfolio.', 'CONFLICT')
  const approvedPortfolio = assertApprovedPortfolio(journey, portfolio)
  const remediation = await qualityJourneyRemediationScope(journey.id, journey.activeCycleId, db)
  if (remediation) {
    const selected = approvedPortfolio.scenarios.filter(s =>
      remediation.scenarioRevisionIds.includes(s.scenarioRevisionId),
    )
    if (
      selected.length !== remediation.scenarioRevisionIds.length ||
      selected.some(s => !s.decisions.some(d => d.decision === 'APPROVED'))
    )
      throw new ServiceError('Remediation selection is outside approved scenario authority.', 'CONFLICT')
    return { journey, portfolio: { ...approvedPortfolio, scenarios: selected }, remediation }
  }
  return { journey, portfolio: approvedPortfolio }
}

function approvedScenarios(value: ApprovedInput) {
  return value.portfolio.scenarios.filter(scenario =>
    scenario.decisions.some(decision => decision.decision === 'APPROVED'),
  )
}

function inputArtifacts(
  value: ApprovedInput,
  resources: AutomationResourceAuthority,
): AssignmentManifest['inputArtifacts'] {
  return [
    ...(value.remediation
      ? [
          {
            kind: 'REMEDIATION_APPROVAL' as const,
            artifactId: `remediation:${value.remediation.reportRevisionId}`,
            contentHash: hash(value.remediation),
          },
        ]
      : []),
    {
      kind: 'SCENARIO_PORTFOLIO_REVISION' as const,
      artifactId: value.portfolio.artifactId,
      revisionId: value.portfolio.artifactRevisionId,
      contentHash: value.portfolio.contentHash,
    },
    ...approvedScenarios(value).map(scenario => ({
      kind: 'SCENARIO_REVISION' as const,
      artifactId: scenario.stableScenarioId,
      revisionId: scenario.scenarioRevisionId,
      contentHash: scenario.contentHash,
    })),
    {
      kind: 'RESOURCE_RESOLUTION_BUNDLE' as const,
      artifactId: value.portfolio.id,
      contentHash: resources.resourceResolutionHash,
    },
  ].sort((left, right) => json(left).localeCompare(json(right))) as AssignmentManifest['inputArtifacts']
}

async function automationResourceAuthority(value: ApprovedInput, db: Db): Promise<AutomationResourceAuthority> {
  const discovery = await db.qualityJourneyDiscoveryRevision.findUnique({
    where: { id: value.portfolio.discoveryRevisionId },
    select: {
      journeyId: true,
      targetProjectId: true,
      status: true,
      resourceResolutionHash: true,
      resourceResolutionJson: true,
    },
  })
  if (
    !discovery ||
    discovery.journeyId !== value.journey.id ||
    discovery.targetProjectId !== value.journey.targetProjectId ||
    discovery.status !== 'COMPLETED' ||
    !discovery.resourceResolutionHash ||
    !discovery.resourceResolutionJson
  )
    throw new ServiceError(
      'Automator materialization requires the exact completed Resource Resolution Bundle.',
      'CONFLICT',
    )
  const bundle = resourceResolutionBundleSchema.parse(JSON.parse(discovery.resourceResolutionJson))
  const destination = bundle.reusable.find(
    resource => resource.resourceKind === 'MODULE' && resource.resourceId === `module:${bundle.destinationModuleId}`,
  )
  if (!destination)
    throw new ServiceError('Automator materialization requires a compatible frozen destination module.', 'CONFLICT')
  const allowedResourceIds = [...new Set(bundle.reusable.map(resource => resource.resourceId))].sort()
  const frozenScope = await db.qualityJourneyDiscoveryRevision.findUniqueOrThrow({
    where: { id: value.portfolio.discoveryRevisionId },
    select: { resourceScopeJson: true },
  })
  const frozenScopeContents = JSON.parse(frozenScope.resourceScopeJson) as {
    resources: Array<{ id: string; contentHash: string }>
  }
  const frozenResourceHashes = frozenScopeContents.resources
    .filter(resource => allowedResourceIds.includes(resource.id))
    .map(resource => ({ id: resource.id, contentHash: resource.contentHash }))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (frozenResourceHashes.length !== allowedResourceIds.length)
    throw new ServiceError('Automator materialization has incomplete frozen Resource Explorer authority.', 'CONFLICT')
  return {
    discoveryRevisionId: value.portfolio.discoveryRevisionId,
    resourceResolutionHash: discovery.resourceResolutionHash,
    destinationModuleId: bundle.destinationModuleId,
    allowedResourceIds,
    stepDefinitionReferences: new Set(
      bundle.reusable
        .filter(resource => resource.resourceKind === 'STEP_DEFINITION')
        .map(resource => resource.resourceId),
    ),
    locatorIds: new Set(
      bundle.reusable.filter(resource => resource.resourceKind === 'LOCATOR').map(resource => resource.resourceId),
    ),
    operationReferences: new Set(
      bundle.reusable.filter(resource => resource.resourceKind === 'OPERATION').map(resource => resource.resourceId),
    ),
    frozenResourceHashes,
  }
}

async function scope(value: ApprovedInput, db: Db) {
  const resources = await automationResourceAuthority(value, db)
  const scenarioDecisions = approvedScenarios(value).map(scenario => {
    // A portfolio may deliberately contain rejected scenarios. The frozen
    // Automator authority is only the exact approved decision for each input.
    const decision = scenario.decisions.find(candidate => candidate.decision === 'APPROVED')!
    return {
      scenarioRevisionId: scenario.scenarioRevisionId,
      contentHash: scenario.contentHash,
      behavioralIntentHash: scenario.behavioralIntentHash,
      decisionId: decision.id,
      decisionHash: decision.contentHash,
    }
  })
  const frozen = {
    ...(value.remediation ? { remediation: value.remediation } : {}),
    journeyId: value.journey.id,
    targetProjectId: value.journey.targetProjectId,
    cycleId: value.journey.activeCycleId,
    portfolioRevisionId: value.portfolio.artifactRevisionId,
    portfolioHash: value.portfolio.contentHash,
    approvedIntentHash: value.portfolio.approvedIntentHash,
    decisionSetHash: value.portfolio.decisionSetHash,
    resourceResolutionHash: resources.resourceResolutionHash,
    destinationModuleId: resources.destinationModuleId,
    allowedResourceIds: resources.allowedResourceIds,
    scenarioDecisions,
    operationCatalogHash: hash(defaultOperationDefinitions),
  }
  return {
    frozen,
    resources,
    inputHash: hash(frozen),
    scopeHash: hash({ ...frozen, scope: 'automator-materialization/v1' }),
  }
}

/** Called immediately after final Phase 5 approval. It gives Automator a
 * narrow, immutable assignment rather than allowing generic issuance to infer
 * a later catalog or scenario state. */
export async function ensureQualityJourneyAutomationForApprovedScenarios(
  input: { journeyId: string; targetProjectId: string },
  tx: Prisma.TransactionClient,
  beforeWrite: BeforeJourneyBusinessWrite,
) {
  if (typeof beforeWrite !== 'function')
    throw new ServiceError('Automation bootstrap requires its owning business write join.', 'UNAUTHORIZED')
  const approved = await approvedInput(input.journeyId, input.targetProjectId, tx)
  const compiled = await scope(approved, tx)
  const workItemId = qualityJourneyWorkItemId(approved.journey.id, approved.journey.activeCycleId, 'AUTOMATOR')

  const item = await issueQualityJourneySpecializedWorkItemWithBusinessJoinInTransaction(
    approved.journey,
    {
      id: workItemId,
      role: 'AUTOMATOR',
      inputHash: compiled.inputHash,
      inputArtifacts: inputArtifacts(approved, compiled.resources),
      authorizationScope: {
        allowedTargetRoutes: [],
        allowedResourceIds: compiled.resources.allowedResourceIds,
        scope: {
          permittedTools: ['catalog.search', 'automation.write', 'runtime-capsule.publish'],
          permittedCommands: ['work.output.submit'],
          filesystemPaths: [],
          networkOrigins: [],
          credentialGrantIds: [],
          targetAccess: 'NONE',
        },
      },
      completionCriteria: [
        'Materialize only exact approved scenario revisions.',
        'Persist source-revision, Step Definition, and operation catalog lineage.',
        'Write only to the frozen destination module and compatible Resource Resolution resources.',
        'Prepare a typed capsule without creating a TestRun or RuntimeCapsule.',
      ],
    },
    tx,
    beforeWrite,
  )
  await setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction(approved.journey.id, [item.id], tx, beforeWrite)
  return { workItemId: item.id, inputHash: compiled.inputHash, scopeHash: compiled.scopeHash }
}

async function loadMaterializationReferences(
  request: Pick<AutomationMaterializationRequest, 'targetProjectId'>,
  resources: AutomationResourceAuthority,
  db: Prisma.TransactionClient,
) {
  return Promise.all([
    db.module.findFirst({
      where: { id: resources.destinationModuleId, targetProjectId: request.targetProjectId },
      select: { id: true, name: true, updatedAt: true },
    }),
    db.stepDefinition.findMany({
      where: {
        status: 'ready',
        OR: [...resources.stepDefinitionReferences].map(reference => {
          const [, id, version] = reference.split(':')
          return { id, version }
        }),
      },
      select: {
        id: true,
        version: true,
        definitionHash: true,
        definitionJson: true,
        executionBinding: { select: { bindingJson: true, bindingHash: true } },
      },
      orderBy: [{ id: 'asc' }, { version: 'asc' }],
    }),
    db.locator.findMany({
      where: {
        targetProjectId: request.targetProjectId,
        id: { in: [...resources.locatorIds].map(reference => reference.slice('locator:'.length)) },
      },
      select: { id: true, value: true, updatedAt: true, targetProjectId: true },
    }),
  ])
}

function assertFrozenResourceContent(
  resources: AutomationResourceAuthority,
  module: { id: string; name: string; updatedAt: Date } | null,
  definitions: Array<{ id: string; version: string; definitionHash?: string }>,
  locators: Array<{ id: string; value: string; updatedAt: Date; targetProjectId: string }>,
) {
  const current = new Map<string, string>()
  if (module) current.set(`module:${module.id}`, hash(module))
  for (const definition of definitions)
    if (definition.definitionHash) current.set(`step:${definition.id}:${definition.version}`, definition.definitionHash)
  for (const locator of locators) current.set(`locator:${locator.id}`, hash(locator))
  for (const operation of defaultOperationDefinitions)
    current.set(`operation:${operation.id}:${operation.version}`, hash(operation))
  if (resources.frozenResourceHashes.some(resource => current.get(resource.id) !== resource.contentHash))
    throw new ServiceError('Automator materialization resource authority is stale or mutated.', 'CONFLICT')
}

/** Current assignment inputs only. Locator values remain with Appraise. */
export async function readInternalAutomatorAssignment(
  journey: QualityJourney,
  item: QualityJourneyWorkItem,
  tx: Prisma.TransactionClient,
) {
  assertInternalScenarioAutomationAssignment(journey, item, 'AUTOMATOR', 'AUTOMATION')
  await assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(tx, item)
  const approved = await approvedInput(journey.id, journey.targetProjectId, tx)
  const { revision } = await readCompletedInternalDiscovery(journey, tx)
  if (
    approved.portfolio.discoveryRevisionId !== revision.id ||
    approved.portfolio.discoveryCompletionHash !== revision.completionHash
  )
    throw new ServiceError('Automator assignment does not bind accepted Discovery.', 'CONFLICT')
  const { frozen, resources, inputHash, scopeHash } = await scope(approved, tx)
  const refs = inputArtifacts(approved, resources)
  if (item.inputHash !== inputHash || json(JSON.parse(item.inputArtifactRefsJson)) !== json(refs))
    throw new ServiceError(
      'Automator assignment does not bind current approved scenario and resource authority.',
      'CONFLICT',
    )
  const artifact = await tx.qualityJourneyArtifact.findFirstOrThrow({
    where: {
      journeyId: journey.id,
      targetProjectId: journey.targetProjectId,
      kind: 'SCENARIO_PORTFOLIO_REVISION',
      artifactId: approved.portfolio.artifactId,
      revisionId: approved.portfolio.artifactRevisionId,
      contentHash: approved.portfolio.contentHash,
    },
  })
  const portfolio = scenarioPortfolioSchema.parse(JSON.parse(artifact.artifactJson))
  if (hashScenarioPortfolio(portfolio) !== approved.portfolio.contentHash)
    throw new ServiceError('Approved Scenario Portfolio content has changed.', 'CONFLICT')
  const scenarios = approvedScenarios(approved).map(row => {
    const scenario = portfolio.scenarios.find(candidate => candidate.scenarioRevisionId === row.scenarioRevisionId)
    if (!scenario || hash(scenario) !== row.contentHash || json(scenario.behavioralIntent) !== row.behavioralIntentJson)
      throw new ServiceError('Approved scenario revision content has changed.', 'CONFLICT')
    return scenario
  })
  const [module, definitions, locators] = await loadMaterializationReferences(item, resources, tx)
  assertFrozenResourceContent(resources, module, definitions, locators)
  return {
    inputHash,
    scopeHash,
    scope: frozen,
    inputArtifacts: refs,
    scenarios,
    resourceBindings: resources.frozenResourceHashes,
    stepDefinitions: [...readyDefinitionIndex(definitions).values()].map(({ definition }) => ({
      definition,
      definitionHash: computeStepReferenceHash(definition),
    })),
    operations: defaultOperationDefinitions.filter(operation =>
      resources.operationReferences.has(`operation:${operation.id}:${operation.version}`),
    ),
  }
}

function parseAndValidateScenarioIntent(scenario: ApprovedScenario, proposal: AutomationProposal): ScenarioIntent {
  const intent = JSON.parse(scenario.behavioralIntentJson) as ScenarioIntent
  if (
    proposal.scenarioRevisionId !== scenario.scenarioRevisionId ||
    proposal.steps.length !== intent.steps.length ||
    proposal.steps.some((step, index) => step.sourceScenarioStepId !== intent.steps[index]?.stepId)
  )
    throw new ServiceError('Automator proposal does not preserve exact source scenario step IDs and order.', 'CONFLICT')
  return intent
}

function readyDefinitionIndex(
  definitions: Array<{
    id: string
    version: string
    definitionHash: string
    definitionJson: string
    executionBinding: { bindingJson: string; bindingHash: string } | null
  }>,
): Map<string, ReadyDefinition> {
  return new Map(
    definitions.map(row => {
      const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
      const hashes = computeStepDefinitionHashes(definition)
      if (row.definitionHash !== hashes.definitionHash)
        throw new ServiceError('Automator Step Definition content hash is stale or forged.', 'CONFLICT')
      const execution = row.executionBinding
        ? stepExecutionBindingSchema.parse(JSON.parse(row.executionBinding.bindingJson))
        : null
      if (
        !execution ||
        row.executionBinding!.bindingHash !== hashes.executionHash ||
        stepDefinitionContentHash(execution) !== hashes.executionHash ||
        json(execution) !== json(definition.execution)
      )
        throw new ServiceError('Automator Step Definition execution binding is stale or forged.', 'CONFLICT')
      return [`${row.id}:${row.version}`, { definition, execution }]
    }),
  )
}

function resolvedStepDefinition(
  mapping: AutomationProposal['steps'][number],
  definitions: Map<string, ReadyDefinition>,
) {
  const resolved = definitions.get(`${mapping.stepDefinition.id}:${mapping.stepDefinition.version}`)
  if (!resolved || computeStepReferenceHash(resolved.definition) !== mapping.stepDefinition.definitionHash)
    throw new ServiceError('Automator proposal references a missing, stale, or non-ready Step Definition.', 'CONFLICT')
  return resolved
}

function canonicalOperation(mapping: AutomationProposal['steps'][number], operationReferences: ReadonlySet<string>) {
  const reference = `operation:${mapping.operation.id}:${mapping.operation.version}`
  if (!operationReferences.has(reference))
    throw new ServiceError(
      'Automator proposal operation is outside the compatible Resource Explorer authority.',
      'CONFLICT',
    )
  const operation = defaultOperationDefinitions.find(
    candidate => candidate.id === mapping.operation.id && candidate.version === mapping.operation.version,
  )
  if (!operation || json(operation.handler) !== json(mapping.operation.handler))
    throw new ServiceError('Automator proposal references an unknown or stale canonical operation.', 'CONFLICT')
  return operation
}

function validateExecutionBinding(
  mapping: AutomationProposal['steps'][number],
  execution: ReadyDefinition['execution'],
) {
  if (
    execution?.kind !== 'operation' ||
    execution.handlerId !== mapping.operation.handler.id ||
    execution.handlerVersion !== mapping.operation.handler.version
  )
    throw new ServiceError(
      'Automator proposal operation does not match the selected Step Definition execution binding.',
      'CONFLICT',
    )
}

function addParameterInputs(
  mapping: AutomationProposal['steps'][number],
  operation: (typeof defaultOperationDefinitions)[number],
) {
  const supplied = new Set<string>()
  for (const parameter of mapping.parameters) {
    const input = operation.inputs.find(candidate => candidate.name === parameter.name)
    if (!input || input.type === 'locator' || input.type !== parameter.type || supplied.has(parameter.name))
      throw new ServiceError('Automator parameters do not match the selected operation contract.', 'CONFLICT')
    supplied.add(parameter.name)
  }
  return supplied
}

function addTestDataInputs(
  mapping: AutomationProposal['steps'][number],
  operation: (typeof defaultOperationDefinitions)[number],
  supplied: Set<string>,
) {
  for (const requirement of mapping.testData) {
    const input = operation.inputs.find(candidate => candidate.name === requirement.key)
    if (!input || input.type === 'locator' || input.type !== requirement.type || supplied.has(requirement.key))
      throw new ServiceError('Automator test data does not match the selected operation contract.', 'CONFLICT')
    supplied.add(requirement.key)
  }
}

function addLocatorInputs(
  mapping: AutomationProposal['steps'][number],
  operation: (typeof defaultOperationDefinitions)[number],
  knownLocators: Set<string>,
  supplied: Set<string>,
) {
  for (const requirement of mapping.locatorRequirements) {
    if (requirement.locatorId && !knownLocators.has(requirement.locatorId))
      throw new ServiceError('Automator locator requirement is missing or belongs to another target.', 'CONFLICT')
    const input = operation.inputs.find(candidate => candidate.name === requirement.parameterName)
    if (!input || (requirement.runtimeParameter && input.type !== 'locator'))
      throw new ServiceError(
        'Automator runtime locator parameter is not permitted by the selected operation.',
        'CONFLICT',
      )
    if (input.type !== 'locator' || supplied.has(requirement.parameterName))
      throw new ServiceError(
        'Automator locator requirement does not match the selected operation contract.',
        'CONFLICT',
      )
    supplied.add(requirement.parameterName)
  }
}

function materializeStep(
  source: ScenarioIntent['steps'][number],
  mapping: AutomationProposal['steps'][number],
  definitions: Map<string, ReadyDefinition>,
  knownLocators: Set<string>,
  operationReferences: ReadonlySet<string>,
): MappedStep {
  const resolved = resolvedStepDefinition(mapping, definitions)
  const operation = canonicalOperation(mapping, operationReferences)
  validateExecutionBinding(mapping, resolved.execution)
  const supplied = addParameterInputs(mapping, operation)
  addTestDataInputs(mapping, operation, supplied)
  addLocatorInputs(mapping, operation, knownLocators, supplied)
  if (operation.inputs.some(input => input.required && !supplied.has(input.name)))
    throw new ServiceError('Automator proposal omits a required operation input.', 'CONFLICT')
  const inputs = Object.fromEntries([
    ...mapping.parameters.map(parameter => [parameter.name, parameter.value]),
    ...mapping.testData.map(requirement => [requirement.key, requirement.value]),
    ...mapping.locatorRequirements.map(requirement => [
      requirement.parameterName,
      requirement.locatorId ?? requirement.requirementId,
    ]),
  ])
  const invocation = stepInvocationSchema.parse({
    step: mapping.stepDefinition,
    inputs,
    presentation: { keyword: 'Then', description: source.expected },
  })
  validateStepInvocationInputs(resolved.definition, invocation.inputs)
  return { source, mapping, definition: resolved.definition, operation, invocation }
}

function materializeSteps(
  proposal: AutomationProposal,
  intent: ScenarioIntent,
  definitions: Map<string, ReadyDefinition>,
  knownLocators: Set<string>,
  operationReferences: ReadonlySet<string>,
) {
  return proposal.steps.map((mapping, index) =>
    materializeStep(intent.steps[index]!, mapping, definitions, knownLocators, operationReferences),
  )
}

async function findMaterializationReplay(
  request: AutomationMaterializationRequest,
  scenario: ApprovedScenario,
  proposal: AutomationProposal,
  requestHash: string,
  replayKey: string,
  db: Prisma.TransactionClient,
) {
  const materializationHash = materializationContentHash(request, proposal)
  const idempotencyReceipt = await db.qualityJourneyAutomationMaterialization.findFirst({
    where: { journeyId: request.journeyId, idempotencyKey: replayKey },
    include: { preparedCapsule: true },
  })
  if (idempotencyReceipt) {
    if (idempotencyReceipt.requestHash !== requestHash)
      throw new ServiceError('Automator materialization idempotency key was reused with different input.', 'CONFLICT')
    if (idempotencyReceipt.status === 'FAILED') {
      const failure = idempotencyReceipt.failureJson
        ? (JSON.parse(idempotencyReceipt.failureJson) as { message?: string })
        : null
      throw new ServiceError(
        failure?.message ?? 'Automator materialization previously failed for this exact request.',
        'CONFLICT',
        409,
        { failureKind: idempotencyReceipt.failureKind ?? 'AUTOMATION_ERROR', replayed: true },
      )
    }
    return idempotencyReceipt
  }
  return db.qualityJourneyAutomationMaterialization
    .findFirst({
      where: {
        journeyId: request.journeyId,
        scenarioRevisionId: scenario.scenarioRevisionId,
        inputHash: request.expectedInputHash,
        status: 'MATERIALIZED',
      },
      include: { preparedCapsule: true },
    })
    .then(receipt => {
      if (receipt && receipt.materializationHash !== materializationHash)
        throw new ServiceError(
          'Automator materialization input conflicts with immutable approved-scenario output.',
          'CONFLICT',
        )
      return receipt
    })
}

function materializationContentHash(request: AutomationMaterializationRequest, proposal: AutomationProposal) {
  return hash({
    journeyId: request.journeyId,
    targetProjectId: request.targetProjectId,
    expectedInputHash: request.expectedInputHash,
    expectedScopeHash: request.expectedScopeHash,
    workItemId: request.workItemId,
    attemptId: request.attemptId,
    leaseId: request.leaseId,
    scenario: proposal,
  })
}

type TargetCase = {
  id: string
  title: string
  description: string
  TestSuite: Array<{ id: string; name: string; description: string | null; moduleId: string; targetProjectId: string }>
  steps: Array<{ order: number; gherkinStep: string; label: string; icon: string; invocationJson: string }>
}

function expectedTargetSteps(mappedSteps: MappedStep[]) {
  return mappedSteps.map((mapped, order) => ({
    order,
    gherkinStep: executableScenarioAction(mapped.source.action, mapped.invocation.presentation?.keyword),
    label: mapped.source.expected,
    icon: 'VALIDATION' as const,
    invocationJson: canonicalStepDefinitionJson(mapped.invocation),
  }))
}

function executableScenarioAction(action: string, keyword: 'Given' | 'When' | 'Then' | 'And' | undefined) {
  if (!action || action !== action.trim() || /[\r\n\u2028\u2029]/.test(action))
    throw new ServiceError('Automator approved scenario action must be a single Gherkin line.', 'CONFLICT')
  if (/^(?:Given|When|Then|And|But) \S/.test(action)) return action
  if (/^(?:Given|When|Then|And|But)(?:\s|$)/.test(action) || !keyword)
    throw new ServiceError('Automator approved scenario action needs an executable Gherkin keyword.', 'CONFLICT')
  return `${keyword} ${action}`
}

function targetBindingPacket(
  targetProjectId: string,
  moduleId: string,
  suite: { id: string; name: string; description: string | null },
  testCase: { id: string; title: string; description: string },
  steps: ReturnType<typeof expectedTargetSteps>,
): AutomationTargetBinding {
  return automationTargetBindingSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    targetProjectId,
    moduleId,
    suite,
    testCase: { ...testCase, steps },
  })
}

function targetSemanticHash(binding: AutomationTargetBinding) {
  return hash({
    schemaVersion: binding.schemaVersion,
    targetProjectId: binding.targetProjectId,
    moduleId: binding.moduleId,
    suite: { name: binding.suite.name, description: binding.suite.description },
    testCase: {
      title: binding.testCase.title,
      description: binding.testCase.description,
      steps: binding.testCase.steps,
    },
  })
}

function targetHashes(binding: AutomationTargetBinding) {
  const stepHash = hash(binding.testCase.steps)
  const suiteHash = hash({ targetProjectId: binding.targetProjectId, moduleId: binding.moduleId, suite: binding.suite })
  const testCaseHash = hashAutomationTargetBinding(binding)
  return { semanticHash: targetSemanticHash(binding), suiteHash, testCaseHash, stepHash }
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002')
}

function bindingMatchesCandidate(
  testCase: TargetCase,
  request: AutomationMaterializationRequest,
  intent: ScenarioIntent,
  moduleId: string,
  steps: ReturnType<typeof expectedTargetSteps>,
) {
  if (testCase.TestSuite.length !== 1 || testCase.steps.length !== steps.length) return false
  const suite = testCase.TestSuite[0]!
  if (
    suite.targetProjectId !== request.targetProjectId ||
    suite.moduleId !== moduleId ||
    suite.name !== intent.title ||
    suite.description !== intent.narrative
  )
    return false
  return testCase.steps.every((step, index) => json(step) === json(steps[index]))
}

async function loadTargetCase(id: string, targetProjectId: string, db: Prisma.TransactionClient) {
  return db.testCase.findFirst({
    where: { id, targetProjectId },
    include: {
      TestSuite: { select: { id: true, name: true, description: true, moduleId: true, targetProjectId: true } },
      steps: {
        select: { order: true, gherkinStep: true, label: true, icon: true, invocationJson: true },
        orderBy: { order: 'asc' },
      },
    },
  })
}

async function resolveDurableTargetBinding(
  durable: NonNullable<
    Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyAutomationTargetBinding']['findFirst']>>
  >,
  request: AutomationMaterializationRequest,
  intent: ScenarioIntent,
  moduleId: string,
  steps: ReturnType<typeof expectedTargetSteps>,
  semanticHash: string,
  resources: AutomationResourceAuthority,
  db: Prisma.TransactionClient,
  ownScope: E2BusinessScope | null,
) {
  if (!ownScope)
    throw new ServiceError('Legacy Automator cannot add an unsupported retained materialization owner to a durable target.',
      'CONFLICT', 409, { reason: 'UNSUPPORTED_LEGACY_MATERIALIZATION_OWNER_LINEAGE' })
  await validateAutomationMaterializationOwnersInTransaction(db, { scope: ownScope, targetBindingId: durable.id })
  const existingCase = await loadTargetCase(durable.testCaseId, request.targetProjectId, db)
  if (!existingCase || !bindingMatchesCandidate(existingCase, request, intent, moduleId, steps))
    throw new ServiceError(
      'Durable target materialization binding no longer matches its canonical content.',
      'CONFLICT',
    )
  const suite = existingCase.TestSuite[0]!
  const binding = targetBindingPacket(
    request.targetProjectId,
    moduleId,
    { id: suite.id, name: suite.name, description: suite.description },
    { id: existingCase.id, title: existingCase.title, description: existingCase.description },
    steps,
  )
  const hashes = targetHashes(binding)
  if (
    durable.bindingJson !== json(binding) ||
    durable.suiteHash !== hashes.suiteHash ||
    durable.testCaseHash !== hashes.testCaseHash ||
    durable.stepHash !== hashes.stepHash ||
    durable.resourceHashJson !== json(resources.frozenResourceHashes)
  )
    throw new ServiceError('Durable target materialization binding hash is incompatible.', 'CONFLICT')
  return { suite, testCase: existingCase, binding, semanticHash, targetBindingId: durable.id }
}

type PlannedMaterializationTarget = {
  suite: { id: string; name: string; description: string | null }
  testCase: { id: string; title: string; description: string }
  binding: AutomationTargetBinding
  semanticHash: string
  targetBindingId: string
  fresh: boolean
  steps: Array<ReturnType<typeof expectedTargetSteps>[number] & { id: string }>
}
type RetainedAutomationMaterialization = Prisma.QualityJourneyAutomationMaterializationGetPayload<{
  include: { preparedCapsule: true }
}>
type MaterializationResult = { materialization: RetainedAutomationMaterialization; replayed: boolean }
type PlannedMaterialization = {
  scenario: ApprovedScenario
  proposal: AutomationProposal
  requestHash: string
} & ({ replay: RetainedAutomationMaterialization; fresh: null } | {
  replay: null
  fresh: { materializationId: string; mappedSteps: MappedStep[]; target: PlannedMaterializationTarget }
})

async function planMaterializationTarget(
  request: AutomationMaterializationRequest, intent: ScenarioIntent, mappedSteps: MappedStep[], materializationId: string,
  moduleId: string, resources: AutomationResourceAuthority, tx: Prisma.TransactionClient,
  ownScope: E2BusinessScope | null, targets: Map<string, PlannedMaterializationTarget>,
): Promise<PlannedMaterializationTarget> {
  const steps = expectedTargetSteps(mappedSteps)
  const suite = { id: idFor('suite', materializationId), name: intent.title, description: intent.narrative }
  const testCase = { id: idFor('case', materializationId), title: intent.title, description: intent.narrative }
  const provisional = targetBindingPacket(request.targetProjectId, moduleId, suite, testCase, steps)
  const semanticHash = targetSemanticHash(provisional)
  const planned = targets.get(semanticHash)
  if (planned) return planned
  const durable = await tx.qualityJourneyAutomationTargetBinding.findFirst({
    where: { targetProjectId: request.targetProjectId, semanticHash },
  })
  let target: PlannedMaterializationTarget
  if (durable) {
    const existing = await resolveDurableTargetBinding(durable, request, intent, moduleId, steps, semanticHash, resources, tx, ownScope)
    target = { ...existing, fresh: false, steps: [] }
  } else {
    target = { suite, testCase, binding: provisional, semanticHash,
      targetBindingId: idFor('target-binding', materializationId), fresh: true,
      steps: steps.map((step, index) => ({ id: idFor('step', materializationId, String(index)), ...step })) }
  }
  targets.set(semanticHash, target)
  return target
}

/** No target lookup or identity substitution occurs after the complete effect batch. */
async function insertPlannedMaterializationTarget(
  request: AutomationMaterializationRequest, target: PlannedMaterializationTarget, db: Prisma.TransactionClient,
) {
  await db.testSuite.create({ data: { ...target.suite, moduleId: target.binding.moduleId, targetProjectId: request.targetProjectId } })
  await db.testCase.create({ data: { ...target.testCase, targetProjectId: request.targetProjectId,
    TestSuite: { connect: { id: target.suite.id } }, steps: { create: target.steps } } })
}

async function materializeOne(
  request: AutomationMaterializationRequest, approved: ApprovedInput, resources: AutomationResourceAuthority,
  plan: PlannedMaterialization, db: Prisma.TransactionClient, beforeWrite: BeforeJourneyBusinessWrite,
  ownScope: E2BusinessScope | null, insertedTargets: Set<string>,
): Promise<MaterializationResult> {
  // The complete planning pass validated every E2 replay before any writer.
  if (plan.replay) return { materialization: plan.replay, replayed: true }
  const { materializationId, mappedSteps, target } = plan.fresh
  const createTargetBinding = target.fresh && !insertedTargets.has(target.semanticHash)
  if (createTargetBinding) {
    await insertPlannedMaterializationTarget(request, target, db)
    insertedTargets.add(target.semanticHash)
  }
  return persistMaterialization({ request, approved, resources, scenario: plan.scenario, proposal: plan.proposal,
    decision: plan.scenario.decisions.find(candidate => candidate.decision === 'APPROVED')!, requestHash: plan.requestHash,
    materializationId, suite: target.suite, testCase: target.testCase, binding: target.binding,
    semanticHash: target.semanticHash, targetBindingId: target.targetBindingId, createTargetBinding }, mappedSteps, db, beforeWrite, ownScope)
}

type MaterializationPersistenceInput = {
  request: AutomationMaterializationRequest
  approved: ApprovedInput
  scenario: ApprovedScenario
  proposal: AutomationProposal
  decision: ApprovedScenario['decisions'][number]
  requestHash: string
  materializationId: string
  suite: { id: string }
  testCase: { id: string }
  binding: AutomationTargetBinding
  semanticHash: string
  targetBindingId: string
  createTargetBinding: boolean
  resources: AutomationResourceAuthority
}

async function persistMaterialization(
  value: MaterializationPersistenceInput,
  mappedSteps: MappedStep[],
  db: Prisma.TransactionClient,
  beforeWrite: BeforeJourneyBusinessWrite,
  ownScope: E2BusinessScope | null,
) {
  const {
    request,
    approved,
    scenario,
    proposal,
    decision,
    requestHash,
    materializationId,
    suite,
    testCase,
    binding,
    semanticHash,
    targetBindingId,
  } = value
  const manifest = {
    schemaVersion: 'appraise.quality-journey/v1',
    kind: 'PREPARED_RUNTIME_CAPSULE',
    materializationId,
    sourceScenarioRevisionId: scenario.scenarioRevisionId,
    sourceScenarioContentHash: scenario.contentHash,
    suiteId: suite.id,
    testCaseId: testCase.id,
    steps: mappedSteps.map(({ source, mapping }) => ({
      stepId: source.stepId,
      definition: mapping.stepDefinition,
      operation: mapping.operation,
      parameters: mapping.parameters,
      testData: mapping.testData,
      locatorRequirements: mapping.locatorRequirements,
    })),
    dataRequirements: mappedSteps.flatMap(step => step.mapping.testData),
    locatorRequirements: mappedSteps.flatMap(step => step.mapping.locatorRequirements),
  }
  const artifactJson = {
    ...manifest,
    decision: { id: decision.id, contentHash: decision.contentHash },
    portfolioRevisionId: approved.portfolio.artifactRevisionId,
    portfolioHash: approved.portfolio.contentHash,
  }
  const artifact = await db.qualityJourneyArtifact.create({
    data: {
      id: idFor('artifact', materializationId),
      identityKey: `AUTOMATION:${scenario.scenarioRevisionId}:${request.expectedInputHash}`,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: approved.journey.activeCycleId,
      kind: 'RUNTIME_CAPSULE',
      artifactId: materializationId,
      contentHash: hash(artifactJson),
      artifactJson: json(artifactJson),
    },
  })
  const materialization = await db.qualityJourneyAutomationMaterialization.create({
    data: {
      id: materializationId,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: approved.journey.activeCycleId,
      scenarioRevisionId: scenario.scenarioRevisionId,
      scenarioContentHash: scenario.contentHash,
      portfolioRevisionId: approved.portfolio.artifactRevisionId,
      portfolioRecordId: approved.portfolio.id,
      portfolioContentHash: approved.portfolio.contentHash,
      decisionId: decision.id,
      decisionHash: decision.contentHash,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      leaseId: request.leaseId,
      ownerTokenHash: tokenHash(request.ownerToken),
      inputHash: request.expectedInputHash,
      idempotencyKey: `${request.idempotencyKey}:${scenario.scenarioRevisionId}`,
      requestHash,
      materializationHash: materializationContentHash(request, proposal),
      sourceProofVersion: 'M06_MATERIALIZATION_ARTIFACT_V1',
      suiteId: suite.id,
      testCaseId: testCase.id,
      artifactRecordId: artifact.id,
      artifactJson: json(artifactJson),
    },
  })
  await db.qualityJourneyAutomationMaterializationSourceProof.create({
    data: {
      materializationId,
      expectedScopeHash: request.expectedScopeHash,
      reconstructionVersion: 'M06_MATERIALIZATION_ARTIFACT_V1',
    },
  })
  const bindingHashes = targetHashes(binding)
  let resolvedTargetBindingId = targetBindingId
  if (value.createTargetBinding) {
    try {
      const targetBinding = await db.qualityJourneyAutomationTargetBinding.create({
        data: {
          id: targetBindingId,
          journeyId: request.journeyId,
          targetProjectId: request.targetProjectId,
          semanticHash,
          suiteId: suite.id,
          testCaseId: testCase.id,
          suiteHash: bindingHashes.suiteHash,
          testCaseHash: bindingHashes.testCaseHash,
          stepHash: bindingHashes.stepHash,
          bindingJson: json(binding),
          resourceHashJson: json(value.resources.frozenResourceHashes),
        },
      })
      resolvedTargetBindingId = targetBinding.id
    } catch (error) {
      // An E2 collision cannot change the already guarded whole-request target plan.
      if (ownScope || !isUniqueConflict(error)) throw error
      // Legacy cannot acquire a final Use for a newly added retained owner.
      // Even identical future scalar IDs do not prove a concurrent binding's
      // complete owner set. Refuse adoption and roll back the owning transaction.
      throw new ServiceError('Concurrent Automator binding requires unsupported legacy retained-owner publication.',
        'CONFLICT', 409, { reason: 'UNSUPPORTED_LEGACY_MATERIALIZATION_OWNER_LINEAGE' })
    }
  }
  await db.qualityJourneyAutomationMaterializationBinding.create({
    data: { materializationId, bindingId: resolvedTargetBindingId },
  })
  if (ownScope) {
    const useRequest = await resolveAutomationMaterializationUseRequestInTransaction(db, { scope: ownScope,
      materializationId, materializationHash: materialization.materializationHash })
    await acquireSharedResourceUseInBusinessGroupInTransaction(db, useRequest, beforeWrite)
    await validateAutomationMaterializationOwnersInTransaction(db, { scope: ownScope, targetBindingId: resolvedTargetBindingId })
    await validateSelectedAutomationResources(db, ownScope, value.resources)
  }
  const capsulePayload = preparedRuntimeCapsuleSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    capsuleId: idFor('prepared', materializationId),
    journeyId: request.journeyId,
    targetProjectId: request.targetProjectId,
    cycleId: approved.journey.activeCycleId,
    materializationId,
    inputHash: request.expectedInputHash,
    manifestHash: hash(manifest),
    status: 'PREPARED',
  })
  const capsule = await db.qualityJourneyPreparedRuntimeCapsule.create({
    data: {
      id: capsulePayload.capsuleId,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: approved.journey.activeCycleId,
      materializationId,
      inputHash: request.expectedInputHash,
      capsuleHash: hash(capsulePayload),
      manifestJson: json(manifest),
      manifestHash: capsulePayload.manifestHash,
    },
  })
  const source = {
    kind: 'SCENARIO_REVISION',
    artifactId: scenario.stableScenarioId,
    revisionId: scenario.scenarioRevisionId,
    contentHash: scenario.contentHash,
  }
  const links = [
    { target: { kind: 'TEST_SUITE', artifactId: suite.id, contentHash: hash({ id: suite.id }) } },
    { target: { kind: 'TEST_CASE', artifactId: testCase.id, contentHash: hash({ id: testCase.id }) } },
    { target: { kind: 'RUNTIME_CAPSULE', artifactId: capsule.id, contentHash: capsule.capsuleHash } },
  ]
  await db.qualityJourneyArtifactLink.createMany({
    data: links.map(({ target }, index) => ({
      id: idFor('link', materializationId, String(index)),
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: approved.journey.activeCycleId,
      relation: 'MATERIALIZES',
      sourceJson: json(source),
      targetJson: json(target),
      linkHash: hash({ cycleId: approved.journey.activeCycleId, relation: 'MATERIALIZES', source, target }),
    })),
  })
  return { materialization: { ...materialization, preparedCapsule: capsule }, replayed: false }
}

type AutomationFailureKind = 'DESIGN_DEFECT' | 'OBSERVATION_STALE' | 'RESOURCE_GAP' | 'AUTOMATION_ERROR'

const automationFailureRules: ReadonlyArray<readonly [AutomationFailureKind, readonly string[]]> = [
  ['DESIGN_DEFECT', ['proposal', 'scenario', 'operation', 'step definition', 'input', 'lineage']],
  ['OBSERVATION_STALE', ['stale', 'lease', 'authority']],
  ['RESOURCE_GAP', ['missing', 'requires a target-owned module', 'locator']],
]

function classifyAutomationFailure(error: unknown): AutomationFailureKind {
  const message = error instanceof Error ? error.message.toLowerCase() : 'unknown error'
  return (
    automationFailureRules.find(([, terms]) => terms.some(term => message.includes(term)))?.[0] ?? 'AUTOMATION_ERROR'
  )
}

/** The materializing transaction deliberately rolls back on every error.
 * This second, compact transaction preserves a typed diagnosis and the exact
 * attempt binding without publishing a partially prepared capsule. */
async function loadFailureScenario(
  tx: Prisma.TransactionClient,
  request: AutomationMaterializationRequest,
  proposal: AutomationProposal,
) {
  const scenario = await tx.qualityJourneyScenarioRevision.findUnique({
    where: { scenarioRevisionId: proposal.scenarioRevisionId },
    include: {
      portfolioRevision: { include: { decisions: { where: { scenarioRevisionId: proposal.scenarioRevisionId } } } },
    },
  })
  if (
    !scenario ||
    scenario.portfolioRevision.journeyId !== request.journeyId ||
    scenario.portfolioRevision.targetProjectId !== request.targetProjectId
  )
    return null
  return scenario
}

async function createFailureMaterializationRecords(
  tx: Prisma.TransactionClient,
  request: AutomationMaterializationRequest,
  proposal: AutomationProposal,
  failure: { schemaVersion: string; failureKind: AutomationFailureKind; message: string },
  scenario: NonNullable<Awaited<ReturnType<typeof loadFailureScenario>>>,
  decision: NonNullable<Awaited<ReturnType<typeof loadFailureScenario>>>['portfolioRevision']['decisions'][number],
) {
  const materializationId = idFor(
    'failed-materialization',
    request.journeyId,
    proposal.scenarioRevisionId,
    request.expectedInputHash,
    request.idempotencyKey,
  )
  const artifactJson = {
    ...failure,
    materializationId,
    scenarioRevisionId: proposal.scenarioRevisionId,
    portfolioRevisionId: scenario.portfolioRevision.artifactRevisionId,
  }
  const artifact = await tx.qualityJourneyArtifact.create({
    data: {
      id: idFor('failed-artifact', materializationId),
      identityKey: `AUTOMATION_FAILURE:${proposal.scenarioRevisionId}:${request.expectedInputHash}:${request.idempotencyKey}`,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: scenario.portfolioRevision.cycleId,
      kind: 'AUTOMATION_FAILURE',
      artifactId: materializationId,
      contentHash: hash(artifactJson),
      artifactJson: json(artifactJson),
    },
  })
  await tx.qualityJourneyAutomationMaterialization.create({
    data: {
      id: materializationId,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: scenario.portfolioRevision.cycleId,
      scenarioRevisionId: scenario.scenarioRevisionId,
      scenarioContentHash: scenario.contentHash,
      portfolioRevisionId: scenario.portfolioRevision.artifactRevisionId,
      portfolioRecordId: scenario.portfolioRevision.id,
      portfolioContentHash: scenario.portfolioRevision.contentHash,
      decisionId: decision.id,
      decisionHash: decision.contentHash,
      workItemId: request.workItemId,
      attemptId: request.attemptId,
      leaseId: request.leaseId,
      ownerTokenHash: tokenHash(request.ownerToken),
      inputHash: request.expectedInputHash,
      idempotencyKey: `${request.idempotencyKey}:${proposal.scenarioRevisionId}`,
      requestHash: hash({ ...request, scenarios: [proposal] }),
      materializationHash: materializationContentHash(request, proposal),
      status: 'FAILED',
      failureKind: failure.failureKind,
      failureJson: json(failure),
      artifactRecordId: artifact.id,
      artifactJson: json(artifactJson),
    },
  })
}

async function persistFailureForScenario(
  tx: Prisma.TransactionClient,
  request: AutomationMaterializationRequest,
  proposal: AutomationProposal,
  failure: { schemaVersion: string; failureKind: AutomationFailureKind; message: string },
) {
  const scenario = await loadFailureScenario(tx, request, proposal)
  if (!scenario) return
  const replayKey = `${request.idempotencyKey}:${proposal.scenarioRevisionId}`
  if (
    await tx.qualityJourneyAutomationMaterialization.findFirst({
      where: { journeyId: request.journeyId, idempotencyKey: replayKey },
    })
  )
    return
  const decision = scenario.portfolioRevision.decisions.find(candidate => candidate.decision === 'APPROVED')
  if (!decision) return
  await createFailureMaterializationRecords(tx, request, proposal, failure, scenario, decision)
}

async function persistAutomationFailure(
  request: ReturnType<typeof automationMaterializationRequestSchema.parse>,
  error: unknown,
  client: PrismaClient,
  coordinatorSession: CoordinatorSessionCredentials | undefined,
) {
  const failureKind = classifyAutomationFailure(error)
  const message = error instanceof Error ? error.message : 'Automator materialization failed.'
  const failure = { schemaVersion: 'appraise.quality-journey/v1', failureKind, message }
  await client.$transaction(tx =>
    withJourneyBusinessWriteJoinInTransaction(tx, request, coordinatorSession, async beforeWrite => {
      // Recheck original legacy diagnostic eligibility before the M03 ownership writer.
      await assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(tx, request)
      await assertCoordinatorMutationSession(coordinatorSession, request, tx)
      await beforeWrite(tx, request)
      await tx.qualityJourneyWorkAttempt.updateMany({
        where: { id: request.attemptId, workItemId: request.workItemId, status: { not: 'COMPLETED' } },
        data: { failureJson: json(failure) },
      })
      const failedScenarioRevisionIds =
        error instanceof ServiceError && Array.isArray(error.details?.failedScenarioRevisionIds)
          ? new Set(error.details.failedScenarioRevisionIds.filter((value): value is string => typeof value === 'string'))
          : null
      const diagnosis = {
        schemaVersion: 'appraise.quality-journey/v1',
        failure,
        scenarios: request.scenarios
          .map(proposal => ({
            scenarioRevisionId: proposal.scenarioRevisionId,
            disposition: failedScenarioRevisionIds?.has(proposal.scenarioRevisionId) ? 'FAILED' : 'VALID_ROLLED_BACK',
          }))
          .sort((left, right) => left.scenarioRevisionId.localeCompare(right.scenarioRevisionId)),
      }
      await tx.qualityJourneyAutomationRequestReceipt.create({
        data: {
          id: idFor('request-failure', request.journeyId, request.attemptId, request.idempotencyKey),
          journeyId: request.journeyId,
          workItemId: request.workItemId,
          attemptId: request.attemptId,
          ownerTokenHash: tokenHash(request.ownerToken),
          idempotencyKey: request.idempotencyKey,
          requestHash: hash(request),
          status: 'FAILED',
          resultJson: json(diagnosis),
        },
      })
      // A request-level failure has no trustworthy per-scenario attribution.
      // Keep only the attempt diagnosis rather than fabricating failures for
      // scenarios that may have been valid.
      if (failedScenarioRevisionIds)
        for (const proposal of request.scenarios)
          if (failedScenarioRevisionIds.has(proposal.scenarioRevisionId))
            await persistFailureForScenario(tx, request, proposal, failure)
    }),
  )
  return failureKind
}

function assertCurrentMaterializationScope(
  request: AutomationMaterializationRequest,
  compiled: Awaited<ReturnType<typeof scope>>,
) {
  if (request.expectedInputHash !== compiled.inputHash || request.expectedScopeHash !== compiled.scopeHash)
    throw new ServiceError('Automator materialization input authority is stale or forged.', 'CONFLICT')
}

function assertAuthorizedAutomatorAttempt(
  item: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyWorkItem']['findFirst']>>,
  attempt: Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyWorkAttempt']['findUnique']>>,
) {
  if (!item) throw new ServiceError('Automator materialization work item authority is invalid.', 'UNAUTHORIZED')
  if (!attempt || attempt.workItemId !== item.id)
    throw new ServiceError('Automator materialization attempt authority is invalid.', 'UNAUTHORIZED')
  return attempt
}

function assertCurrentAutomatorLease(
  request: AutomationMaterializationRequest,
  attempt: NonNullable<Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyWorkAttempt']['findUnique']>>>,
) {
  const external = attempt.executionMode === externalAnalyzerAdmissionProtocol
  const expectedOwnerHash = external ? externalAssignmentSecretHash(request.ownerToken) : tokenHash(request.ownerToken)
  if (attempt.leaseId !== request.leaseId || attempt.ownerTokenHash !== expectedOwnerHash)
    throw new ServiceError('Automator materialization lease authority is invalid.', 'UNAUTHORIZED')
  if (attempt.leaseExpiresAt <= new Date())
    throw new ServiceError('Automator materialization lease has expired.', 'UNAUTHORIZED')
  if (!external && !attempt.spawnReceiptHash)
    throw new ServiceError('Automator materialization requires a validated Factory receipt.', 'UNAUTHORIZED')
}

function assertCompleteApprovedScenarioCoverage(request: AutomationMaterializationRequest, approved: ApprovedInput) {
  const approvedRows = approvedScenarios(approved)
  const requested = new Set(request.scenarios.map(scenario => scenario.scenarioRevisionId))
  if (
    request.scenarios.length !== approvedRows.length ||
    approvedRows.some(scenario => !requested.has(scenario.scenarioRevisionId))
  )
    throw new ServiceError('Automator materialization must cover every exact approved Scenario revision.', 'CONFLICT')
  return approvedRows
}

async function findTerminalAutomatorReplay(
  request: AutomationMaterializationRequest,
  attempt: NonNullable<Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyWorkAttempt']['findUnique']>>>,
  approvedRows: ApprovedScenario[],
  tx: Prisma.TransactionClient,
) {
  const requestReceipt = await tx.qualityJourneyAutomationRequestReceipt.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: request.journeyId, idempotencyKey: request.idempotencyKey } },
  })
  if (requestReceipt) throwRequestReceiptReplay(request, requestReceipt)
  const replayKeys = request.scenarios.map(proposal => `${request.idempotencyKey}:${proposal.scenarioRevisionId}`)
  const receipts = await tx.qualityJourneyAutomationMaterialization.findMany({
    where: { journeyId: request.journeyId, idempotencyKey: { in: replayKeys } },
    include: { preparedCapsule: true },
  })
  if (!receipts.length) return null
  assertTerminalReplayAuthority(request, attempt, receipts)
  const matching = terminalReplayReceiptsForRequest(request, receipts)
  if (!matching) return null
  if (receipts.length !== approvedRows.length)
    throw new ServiceError('Automator materialization idempotency key was reused with different input.', 'CONFLICT')
  throwTerminalReplayFailure(receipts)
  return receipts.sort((left, right) => left.scenarioRevisionId.localeCompare(right.scenarioRevisionId))
}

function throwRequestReceiptReplay(
  request: AutomationMaterializationRequest,
  receipt: { attemptId: string; ownerTokenHash: string; requestHash: string; resultJson: string },
): never {
  if (receipt.attemptId !== request.attemptId || receipt.ownerTokenHash !== tokenHash(request.ownerToken))
    throw new ServiceError('Automator materialization lease authority is invalid.', 'UNAUTHORIZED')
  if (receipt.requestHash !== hash(request))
    throw new ServiceError('Automator materialization idempotency key was reused with different input.', 'CONFLICT')
  const diagnosis = JSON.parse(receipt.resultJson) as {
    failure?: { message?: string; failureKind?: string }
    scenarios?: unknown[]
  }
  throw new ServiceError(
    diagnosis.failure?.message ?? 'Automator materialization previously failed.',
    'CONFLICT',
    409,
    {
      failureKind: diagnosis.failure?.failureKind ?? 'AUTOMATION_ERROR',
      scenarios: diagnosis.scenarios ?? [],
      replayed: true,
    },
  )
}

type AutomationReplayReceipt = Awaited<
  ReturnType<Prisma.TransactionClient['qualityJourneyAutomationMaterialization']['findMany']>
>[number]

function assertTerminalReplayAuthority(
  request: AutomationMaterializationRequest,
  attempt: NonNullable<Awaited<ReturnType<Prisma.TransactionClient['qualityJourneyWorkAttempt']['findUnique']>>>,
  receipts: AutomationReplayReceipt[],
) {
  const receiptOwnerTokenHash = tokenHash(request.ownerToken)
  const attemptOwnerTokenHash =
    attempt.executionMode === externalAnalyzerAdmissionProtocol
      ? externalAssignmentSecretHash(request.ownerToken)
      : receiptOwnerTokenHash
  if (
    attempt.ownerTokenHash !== attemptOwnerTokenHash ||
    receipts.some(receipt => receipt.ownerTokenHash !== receiptOwnerTokenHash)
  )
    throw new ServiceError('Automator materialization lease authority is invalid.', 'UNAUTHORIZED')
  if (receipts.some(receipt => receipt.attemptId !== request.attemptId))
    throw new ServiceError('Automator materialization attempt authority is invalid.', 'UNAUTHORIZED')
}

function terminalReplayReceiptsForRequest(
  request: AutomationMaterializationRequest,
  receipts: AutomationReplayReceipt[],
) {
  const byKey = new Map(receipts.map(receipt => [receipt.idempotencyKey, receipt]))
  for (const proposal of request.scenarios) {
    const receipt = byKey.get(`${request.idempotencyKey}:${proposal.scenarioRevisionId}`)
    const requestHash = hash({ ...request, scenarios: [proposal] })
    if (!receipt || receipt.requestHash !== requestHash)
      throw new ServiceError('Automator materialization idempotency key was reused with different input.', 'CONFLICT')
    if (receipt.status !== 'MATERIALIZED' && receipt.status !== 'FAILED') return null
  }
  return receipts
}

function throwTerminalReplayFailure(receipts: AutomationReplayReceipt[]) {
  const failed = receipts.find(receipt => receipt.status === 'FAILED')
  if (failed) {
    const failure = failed.failureJson ? (JSON.parse(failed.failureJson) as { message?: string }) : null
    throw new ServiceError(
      failure?.message ?? 'Automator materialization previously failed for this exact request.',
      'CONFLICT',
      409,
      { failureKind: failed.failureKind ?? 'AUTOMATION_ERROR', replayed: true },
    )
  }
}

async function authorizeMaterializationRequest(
  request: ReturnType<typeof automationMaterializationRequestSchema.parse>,
  tx: Prisma.TransactionClient,
) {
  const approved = await approvedInput(request.journeyId, request.targetProjectId, tx)
  const compiled = await scope(approved, tx)
  assertCurrentMaterializationScope(request, compiled)
  const item = await tx.qualityJourneyWorkItem.findFirst({
    where: {
      id: request.workItemId,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      role: 'AUTOMATOR',
      inputHash: compiled.inputHash,
    },
  })
  const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: request.attemptId } })
  const authorizedAttempt = assertAuthorizedAutomatorAttempt(item, attempt)
  const approvedRows = assertCompleteApprovedScenarioCoverage(request, approved)
  const replay = await findTerminalAutomatorReplay(request, authorizedAttempt, approvedRows, tx)
  if (replay) return { approved, compiled, approvedRows, replay }
  assertCurrentAutomatorLease(request, authorizedAttempt)
  return { approved, compiled, approvedRows, replay: null }
}

async function planAuthorizedScenarios(
  request: AutomationMaterializationRequest, approvedRows: ApprovedScenario[], resources: AutomationResourceAuthority,
  tx: Prisma.TransactionClient, ownScope: E2BusinessScope | null,
) {
  const plans: PlannedMaterialization[] = []
  const pending: Array<{ scenario: ApprovedScenario; proposal: AutomationProposal; requestHash: string }> = []
  // Every immutable consumed-key conflict precedes consumer references and planning.
  for (const proposal of [...request.scenarios].sort((left, right) => left.scenarioRevisionId.localeCompare(right.scenarioRevisionId))) {
    const scenario = approvedRows.find(candidate => candidate.scenarioRevisionId === proposal.scenarioRevisionId)!
    const requestHash = hash({ ...request, scenarios: [proposal] })
    const replay = await findMaterializationReplay(request, scenario, proposal, requestHash,
      `${request.idempotencyKey}:${scenario.scenarioRevisionId}`, tx)
    if (replay) {
      if (ownScope) await validateRetainedAutomationMaterialization(tx, ownScope, replay)
      plans.push({ scenario, proposal, requestHash, replay, fresh: null })
    } else pending.push({ scenario, proposal, requestHash })
  }
  if (pending.length) {
    const [module, definitions, locators] = await loadMaterializationReferences(request, resources, tx)
    if (!module) throw new ServiceError('Materialization requires the frozen target-owned destination module.', 'CONFLICT')
    assertFrozenResourceContent(resources, module, definitions, locators)
    const readyDefinitions = readyDefinitionIndex(definitions)
    const knownLocators = new Set(locators.map(locator => locator.id))
    const targets = new Map<string, PlannedMaterializationTarget>()
    const failedScenarioRevisionIds: string[] = []
    let first: ServiceError | null = null
    for (const { scenario, proposal, requestHash } of pending) {
      try {
        const intent = parseAndValidateScenarioIntent(scenario, proposal)
        const mappedSteps = materializeSteps(proposal, intent, readyDefinitions, knownLocators, resources.operationReferences)
        const materializationId = idFor('materialization', request.journeyId, scenario.scenarioRevisionId, request.expectedInputHash)
        const target = await planMaterializationTarget(request, intent, mappedSteps, materializationId,
          module.id, resources, tx, ownScope, targets)
        plans.push({ scenario, proposal, requestHash, replay: null, fresh: { materializationId, mappedSteps, target } })
      } catch (error) {
        failedScenarioRevisionIds.push(proposal.scenarioRevisionId)
        if (!first) first = error instanceof ServiceError ? error : new ServiceError('Automator proposal validation failed.', 'CONFLICT')
      }
    }
    if (first) throw new ServiceError(first.message, first.code, first.statusCode,
      { ...first.details, failedScenarioRevisionIds: failedScenarioRevisionIds.sort() })
  }
  return plans.sort((left, right) => left.proposal.scenarioRevisionId.localeCompare(right.proposal.scenarioRevisionId))
}

async function materializeAuthorizedScenarios(
  request: AutomationMaterializationRequest, approved: ApprovedInput, resources: AutomationResourceAuthority,
  plans: PlannedMaterialization[], tx: Prisma.TransactionClient, beforeWrite: BeforeJourneyBusinessWrite,
  ownScope: E2BusinessScope | null,
) {
  const targets = new Map<string, PlannedMaterializationTarget>()
  for (const plan of plans) if (plan.fresh?.target.fresh) targets.set(plan.fresh.target.semanticHash, plan.fresh.target)
  const newRoots: SharedResourceMutationKey[] = []
  for (const target of targets.values()) newRoots.push(
    { kind: 'TEST_SUITE', resourceId: target.suite.id }, { kind: 'TEST_CASE', resourceId: target.testCase.id })
  newRoots.sort((left, right) => left.kind.localeCompare(right.kind) || left.resourceId.localeCompare(right.resourceId))
  // The unchanged Module parent is an FK read, not a mutable collection effect.
  // Fresh nested steps belong to their new Case roots. No existing target is changed.
  await beforeWrite(tx, request)
  await prepareSharedResourceMutationInTransaction(tx, request.targetProjectId, { existing: [], newRoots, deleted: [] })
  const results: MaterializationResult[] = []
  const insertedTargets = new Set<string>()
  for (const plan of plans) results.push(await materializeOne(request, approved, resources, plan, tx, beforeWrite, ownScope, insertedTargets))
  return results
}

function assertCompletedAutomatorResult(request: AutomationMaterializationRequest) {
  if (request.result.role !== 'AUTOMATOR' || request.result.status !== 'COMPLETED')
    throw new ServiceError('Automator materialization requires a completed Automator worker result.', 'CONFLICT')
}

function materializedOutputReferences(results: MaterializationResult[]): WorkerResultEnvelope['outputs'] {
  return results
    .flatMap(({ materialization }) => [
      {
        kind: 'TEST_SUITE' as const,
        artifactId: materialization.suiteId!,
        contentHash: hash({ id: materialization.suiteId }),
      },
      {
        kind: 'TEST_CASE' as const,
        artifactId: materialization.testCaseId!,
        contentHash: hash({ id: materialization.testCaseId }),
      },
      {
        kind: 'RUNTIME_CAPSULE' as const,
        artifactId: materialization.preparedCapsule!.id,
        contentHash: materialization.preparedCapsule!.capsuleHash,
      },
    ])
    .sort((left, right) => json(left).localeCompare(json(right)))
}

function assertSubmittedMaterializationOutputs(
  request: AutomationMaterializationRequest,
  expectedOutputs: WorkerResultEnvelope['outputs'],
) {
  const submittedOutputs = request.result.outputs
    .map(output => ({ kind: output.kind, artifactId: output.artifactId, contentHash: output.contentHash }))
    .sort((left, right) => json(left).localeCompare(json(right)))
  if (json(expectedOutputs) !== json(submittedOutputs))
    throw new ServiceError(
      'Automator worker result must reference exactly the materialized suite, case, and prepared capsule artifacts.',
      'CONFLICT',
    )
}

async function completeMaterializedAutomatorWork(
  request: AutomationMaterializationRequest,
  tx: Prisma.TransactionClient,
  beforeWrite: BeforeJourneyBusinessWrite,
  queueAttemptTerminal: QueueAttemptTerminal,
  coordinatorSession?: CoordinatorSessionCredentials,
) {
  return completeAutomatorWorkWithBusinessJoinInTransaction(
    {
      ...(typeof coordinatorSession === 'object' ? coordinatorSession : {}),
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      workItemId: request.workItemId,
      leaseId: request.leaseId,
      ownerToken: request.ownerToken,
      result: request.result,
    },
    tx,
    beforeWrite,
    queueAttemptTerminal,
  )
}

async function assertManagedMaterializationAssignment(
  request: AutomationMaterializationRequest,
  journey: QualityJourney,
  tx: Prisma.TransactionClient,
  deriveManagedOutputs: boolean,
  replayed: boolean,
) {
  if (!deriveManagedOutputs && (replayed || journey.hostingMode !== 'APP_SERVER_LOCAL_V1')) return
  const item = await tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: request.workItemId } })
  await readInternalAutomatorAssignment(journey, item, tx)
}

function materializedAutomationResult(
  request: AutomationMaterializationRequest,
  results: MaterializationResult[],
  deriveManagedOutputs: boolean,
) {
  assertCompletedAutomatorResult(request)
  const outputs = materializedOutputReferences(results)
  if (deriveManagedOutputs)
    return { ...request, result: workerResultEnvelopeSchema.parse({ ...request.result, outputs }) }
  assertSubmittedMaterializationOutputs(request, outputs)
  return request
}

async function materializeQualityJourneyApprovedScenariosInTransaction(
  request: AutomationMaterializationRequest,
  coordinatorSession: CoordinatorSessionCredentials | undefined,
  tx: Prisma.TransactionClient,
  beforeWrite: BeforeJourneyBusinessWrite,
  queueAttemptTerminal: QueueAttemptTerminal,
  observeLegacyDiagnosticEligibility?: () => void,
  deriveManagedOutputs = false,
) {
  await assertCoordinatorMutationSession(coordinatorSession, request, tx)
  const { approved, compiled, approvedRows, replay } = await authorizeMaterializationRequest(request, tx)
  await assertManagedMaterializationAssignment(request, approved.journey, tx, deriveManagedOutputs, Boolean(replay))
  const ownScope = await automationSharedUseScope(tx, request, coordinatorSession)
  await validateSelectedAutomationResources(tx, ownScope, compiled.resources)
  if (replay) {
    if (ownScope) for (const materialization of replay) await validateRetainedAutomationMaterialization(tx, ownScope, materialization)
    // Legacy exact replay exposes the already retained frozen receipt metadata;
    // it does not dereference a live target or mint an authoritative Use.
    return {
      replayed: true,
      stage: 'AUTOMATION' as const,
      materializations: replay,
      completion: { replayed: true, workItemId: request.workItemId, status: 'COMPLETED' as const },
    }
  }
  if (!ownScope) observeLegacyDiagnosticEligibility?.()
  // Retain the staged E2 terminal gate until integrated verification and exact review.
  await assertJourneyBusinessGroupSupportsNoInvalidationInTransaction(tx, request)
  const plans = await planAuthorizedScenarios(request, approvedRows, compiled.resources, tx, ownScope)
  const results = await materializeAuthorizedScenarios(request, approved, compiled.resources, plans, tx, beforeWrite, ownScope)
  await verifyRemediationChanged(approved, results, tx)
  const completedRequest = materializedAutomationResult(request, results, deriveManagedOutputs)
  await validateSelectedAutomationResources(tx, ownScope, compiled.resources)
  if (ownScope) for (const result of results) await validateRetainedAutomationMaterialization(tx, ownScope, result.materialization)
  const completion = await completeMaterializedAutomatorWork(
    completedRequest,
    tx,
    beforeWrite,
    queueAttemptTerminal,
    coordinatorSession,
  )
  return {
    replayed: results.every(result => result.replayed),
    stage: 'AUTOMATION' as const,
    materializations: results.map(result => result.materialization),
    completion,
  }
}

export async function materializeQualityJourneyApprovedScenarios(
  input: unknown,
  client: PrismaClient = prisma,
  coordinatorSession?: CoordinatorSessionCredentials,
) {
  coordinatorSession = snapshotAutomationCoordinatorCredentials(coordinatorSession)
  const request = automationMaterializationRequestSchema.parse(input)
  let originalLegacyDiagnosticEligibility = false
  try {
    return await client.$transaction(tx =>
      withJourneyBusinessWriteJoinInTransaction(
        tx,
        request,
        coordinatorSession,
        async (beforeWrite, queueAttemptTerminal) => {
          const attempt = await tx.qualityJourneyWorkAttempt.findUnique({ where: { id: request.attemptId } })
          if (attempt?.executionMode === externalAnalyzerAdmissionProtocol)
            throw new ServiceError(
              'EXTERNAL_V1 Automator attempts must use the versioned external materialization operation.',
              'UNAUTHORIZED',
            )
          return materializeQualityJourneyApprovedScenariosInTransaction(
            request,
            coordinatorSession,
            tx,
            beforeWrite,
            queueAttemptTerminal,
            () => {
              originalLegacyDiagnosticEligibility = true
            },
          )
        },
      ),
    )
  } catch (error) {
    if (!originalLegacyDiagnosticEligibility) throw error
    if (
      error instanceof ServiceError &&
      (error.details?.replayed === true || error.message.includes('idempotency key was reused'))
    )
      throw error
    const failureKind = await persistAutomationFailure(request, error, client, coordinatorSession)
    if (error instanceof ServiceError)
      throw new ServiceError(error.message, error.code, error.statusCode, { ...error.details, failureKind })
    throw error
  }
}

export async function materializeExternalQualityJourneyApprovedScenarios(
  input: unknown,
  principal: ExternalAnalyzerProjectPrincipal,
  client: PrismaClient = prisma,
  coordinatorSession?: CoordinatorSessionCredentials,
) {
  return acceptExternalAutomation(input, principal, client, coordinatorSession, false)
}

/** Trusted managed ingress. Appraise derives output identities inside the acceptance transaction. */
export function materializeInternalQualityJourneyApprovedScenarios(
  input: unknown,
  principal: ExternalAnalyzerProjectPrincipal,
  client: PrismaClient,
  coordinatorSession: CoordinatorSessionCredentials,
) {
  return acceptExternalAutomation(input, principal, client, coordinatorSession, true)
}

async function acceptExternalAutomation(
  input: unknown,
  principal: ExternalAnalyzerProjectPrincipal,
  client: PrismaClient,
  coordinatorSession: CoordinatorSessionCredentials | undefined,
  deriveManagedOutputs: boolean,
) {
  coordinatorSession = snapshotAutomationCoordinatorCredentials(coordinatorSession)
  const request = externalAutomationMaterializationRequestSchema.parse(input)
  const { canonical, acceptance } = projectExternalQualityJourneySubmission(
    request,
    { role: 'AUTOMATOR', operation: 'AUTOMATION_MATERIALIZE' },
    principal,
    coordinatorSession,
  )
  const normalized = automationMaterializationRequestSchema.parse(canonical)
  return client.$transaction(async tx => {
    const accepted = await acceptExternalQualityJourneySubmissionInTransaction(
      deriveManagedOutputs ? { ...acceptance, payload: { managed: true, request: acceptance.payload } } : acceptance,
      tx,
      (beforeWrite, queueAttemptTerminal) =>
        materializeQualityJourneyApprovedScenariosInTransaction(
          normalized,
          coordinatorSession,
          tx,
          beforeWrite,
          queueAttemptTerminal,
          undefined,
          deriveManagedOutputs,
        ),
    )
    if (accepted.replayed) {
      const ownScope = await automationSharedUseScope(tx, normalized, coordinatorSession)
      if (ownScope) {
        if (accepted.outcome.materializations.length !== normalized.scenarios.length ||
          new Set(accepted.outcome.materializations.map(row => row.scenarioRevisionId)).size !== normalized.scenarios.length)
          throw new ServiceError('Retained Automator replay has incomplete scenario materializations.', 'CONFLICT')
        const discoveries = new Set<string>()
        for (const materialization of accepted.outcome.materializations) {
          const retained = await tx.qualityJourneyAutomationMaterialization.findUnique({ where: { id: materialization.id },
            select: { id: true, journeyId: true, targetProjectId: true, scenarioRevisionId: true, materializationHash: true,
              portfolioRecordId: true, portfolioRevisionId: true, portfolioContentHash: true } })
          if (!retained || retained.id !== materialization.id || retained.journeyId !== normalized.journeyId ||
            retained.targetProjectId !== normalized.targetProjectId || retained.materializationHash !== materialization.materializationHash ||
            retained.scenarioRevisionId !== materialization.scenarioRevisionId ||
            !normalized.scenarios.some(proposal => proposal.scenarioRevisionId === retained.scenarioRevisionId))
            throw new ServiceError('Retained Automator replay has foreign or changed materialization identity.', 'CONFLICT')
          const portfolio = await tx.qualityJourneyScenarioPortfolioRevision.findUnique({
            where: { id: retained.portfolioRecordId },
            select: { journeyId: true, targetProjectId: true, discoveryRevisionId: true, artifactRevisionId: true, contentHash: true },
          })
          if (!portfolio || portfolio.journeyId !== normalized.journeyId || portfolio.targetProjectId !== normalized.targetProjectId ||
            portfolio.artifactRevisionId !== retained.portfolioRevisionId || portfolio.contentHash !== retained.portfolioContentHash)
            throw new ServiceError('Retained Automator replay has foreign or missing Discovery selection lineage.', 'CONFLICT')
          if (!discoveries.has(portfolio.discoveryRevisionId)) {
            const discovery = await tx.qualityJourneyDiscoveryRevision.findUnique({
              where: { id: portfolio.discoveryRevisionId }, select: { resourceResolutionHash: true },
            })
            const selected = await resolveResourceResolutionUseRequestInTransaction(tx, { scope: ownScope,
              discoveryRevisionId: portfolio.discoveryRevisionId, resourceResolutionHash: discovery?.resourceResolutionHash ?? '' })
            await validateActiveSharedResourceUseInTransaction(tx, selected)
            discoveries.add(portfolio.discoveryRevisionId)
          }
          await validateRetainedAutomationMaterialization(tx, ownScope, materialization)
        }
      }
      // Legacy acceptance replay remains the existing authenticated frozen
      // outcome projection. No live Suite/Case read or new legacy Use occurs.
    }
    return { ...accepted.outcome, replayed: accepted.replayed || accepted.outcome.replayed }
  })
}

export async function getQualityJourneyAutomationContext(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const journey = await client.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
    select: { id: true, stage: true },
  })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')

  // Once the journey has left AUTOMATION, this is a receipt reader. It must
  // not recompile current resource/catalog authority or use a later stage to
  // authorize materialization. The receipts are immutable historical context.
  if (journey.stage !== 'AUTOMATION') return readHistoricalAutomationContext(input, client)

  const approved = await approvedInput(input.journeyId, input.targetProjectId, client)
  const compiled = await scope(approved, client)
  const materializations = await client.qualityJourneyAutomationMaterialization.findMany({
    where: { journeyId: input.journeyId, cycleId: approved.journey.activeCycleId, inputHash: compiled.inputHash },
    include: { preparedCapsule: true },
    orderBy: { scenarioRevisionId: 'asc' },
  })
  return {
    inputHash: compiled.inputHash,
    inputHashes: [compiled.inputHash],
    scopeHash: compiled.scopeHash,
    remediation: approved.remediation ?? null,
    portfolioRevisionId: approved.portfolio.artifactRevisionId,
    scenarioRevisionIds: approvedScenarios(approved).map(s => s.scenarioRevisionId),
    materializations: materializations.filter(
      materialization => materialization.status !== 'MATERIALIZED' || materialization.preparedCapsule,
    ),
    failedMaterializations: materializations.filter(materialization => materialization.status === 'FAILED'),
  }
}

async function readHistoricalAutomationContext(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient,
) {
  const materializations = await client.qualityJourneyAutomationMaterialization.findMany({
    where: { journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    include: { preparedCapsule: true },
    orderBy: [{ createdAt: 'asc' }, { scenarioRevisionId: 'asc' }],
  })
  const inputHashes = [...new Set(materializations.map(materialization => materialization.inputHash))]
  const visibleMaterializations = materializations.filter(
    materialization => materialization.status !== 'MATERIALIZED' || materialization.preparedCapsule,
  )
  return {
    inputHash: inputHashes.at(-1) ?? 'historical:no-materialization-receipt',
    inputHashes,
    scopeHash: null,
    remediation: null,
    portfolioRevisionId: materializations.at(-1)?.portfolioRevisionId ?? null,
    scenarioRevisionIds: [
      ...new Set(materializations.map(materialization => materialization.scenarioRevisionId)),
    ].sort(),
    materializations: visibleMaterializations,
    failedMaterializations: materializations.filter(materialization => materialization.status === 'FAILED'),
  }
}

async function verifyRemediationChanged(
  approved: ApprovedInput,
  results: MaterializationResult[],
  tx: Prisma.TransactionClient,
) {
  const remediation = await qualityJourneyRemediationScope(approved.journey.id, approved.journey.activeCycleId, tx)
  if (!remediation) return
  const source = await tx.qualityJourneyExecutionCycle.findUniqueOrThrow({
    where: { id: remediation.sourceExecutionCycleId },
  })
  const frozen = JSON.parse(source.preparedCapsulesJson) as Array<{
    materializationId: string
    scenarioRevisionId: string
  }>
  for (const { materialization } of results) {
    const predecessorId = frozen.find(
      c => c.scenarioRevisionId === materialization.scenarioRevisionId,
    )?.materializationId
    if (!predecessorId) throw new ServiceError('Correction lacks predecessor materialization lineage.', 'CONFLICT')
    const predecessor = await tx.qualityJourneyAutomationMaterialization.findUniqueOrThrow({
      where: { id: predecessorId },
    })
    const before = JSON.parse(predecessor.artifactJson)
    const after = JSON.parse(materialization.artifactJson)
    if (hash(before.steps) === hash(after.steps))
      throw new ServiceError('Unchanged automation requires a rerun, not an automation correction.', 'CONFLICT')
    const link = {
      source: { kind: 'RUNTIME_CAPSULE', artifactId: materialization.id, contentHash: hash(after) },
      target: { kind: 'RUNTIME_CAPSULE', artifactId: predecessor.id, contentHash: hash(before) },
      relation: 'SUPERSEDES',
    }
    await tx.qualityJourneyArtifactLink.create({
      data: {
        id: idFor('remediation-link', materialization.id),
        journeyId: approved.journey.id,
        targetProjectId: approved.journey.targetProjectId,
        cycleId: approved.journey.activeCycleId,
        relation: link.relation,
        sourceJson: json(link.source),
        targetJson: json(link.target),
        linkHash: hash(link),
      },
    })
  }
}

registerInternalScenarioAutomationReadiness('AUTOMATOR', readInternalAutomatorAssignment)
