import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
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
  preparedRuntimeCapsuleSchema,
  qualityJourneyWorkItemId,
  resourceResolutionBundleSchema,
  type AssignmentManifest,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import {
  completeAutomatorWorkInTransaction,
  issueQualityJourneySpecializedWorkItem,
  setQualityJourneyActiveWorkItems,
} from './quality-journey-service'

type Db = PrismaClient | Prisma.TransactionClient
const json = canonicalContractJson
const hash = hashAutomationMaterialization
const idFor = (kind: string, ...parts: string[]) =>
  `qja_${kind}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24)}`
const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex')

type ApprovedInput = {
  journey: {
    id: string
    targetProjectId: string
    activeCycleId: string
    stage: string
    activeScenarioPortfolioRevisionId: string | null
  }
  portfolio: {
    id: string
    artifactId: string
    artifactRevisionId: string
    discoveryRevisionId: string
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
  resourceResolutionHash: string
  destinationModuleId: string
  allowedResourceIds: string[]
  stepDefinitionReferences: Set<string>
  locatorIds: Set<string>
  operationReferences: Set<string>
  frozenResourceHashes: Array<{ id: string; contentHash: string }>
}

async function approvedInput(journeyId: string, targetProjectId: string, db: Db): Promise<ApprovedInput> {
  const journey = await db.qualityJourney.findFirst({ where: { id: journeyId, targetProjectId } })
  if (!journey) throw new ServiceError('Quality Journey not found.', 'NOT_FOUND')
  if (journey.stage !== 'AUTOMATION')
    throw new ServiceError('Automator materialization is not active for this journey.', 'CONFLICT')
  if (!journey.activeScenarioPortfolioRevisionId)
    throw new ServiceError('Automator materialization requires an active approved Scenario Portfolio.', 'CONFLICT')
  const portfolio = await db.qualityJourneyScenarioPortfolioRevision.findUnique({
    where: { id: journey.activeScenarioPortfolioRevisionId },
    include: { scenarios: { include: { decisions: true }, orderBy: { scenarioRevisionId: 'asc' } } },
  })
  if (
    !portfolio ||
    portfolio.journeyId !== journey.id ||
    portfolio.status !== 'APPROVED' ||
    !portfolio.approvedIntentHash
  )
    throw new ServiceError('Automator materialization requires the exact approved Scenario Portfolio.', 'CONFLICT')
  if (!portfolio.scenarios.some(s => s.decisions.some(decision => decision.decision === 'APPROVED')))
    throw new ServiceError(
      'Automator materialization requires at least one exact approved scenario decision.',
      'CONFLICT',
    )
  return { journey, portfolio }
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
    .sort((left, right) => left.id.localeCompare(right.id))
  if (frozenResourceHashes.length !== allowedResourceIds.length)
    throw new ServiceError('Automator materialization has incomplete frozen Resource Explorer authority.', 'CONFLICT')
  return {
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
) {
  const approved = await approvedInput(input.journeyId, input.targetProjectId, tx)
  const compiled = await scope(approved, tx)
  const workItemId = qualityJourneyWorkItemId(approved.journey.id, approved.journey.activeCycleId, 'AUTOMATOR')
  const item = await issueQualityJourneySpecializedWorkItem(
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
  )
  await setQualityJourneyActiveWorkItems(approved.journey.id, [item.id], tx)
  return { workItemId: item.id, inputHash: compiled.inputHash, scopeHash: compiled.scopeHash }
}

async function loadMaterializationReferences(
  request: AutomationMaterializationRequest,
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
    gherkinStep: mapped.source.action,
    label: mapped.source.expected,
    icon: 'VALIDATION' as const,
    invocationJson: canonicalStepDefinitionJson(mapped.invocation),
  }))
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
) {
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

async function ensureMaterializationTarget(
  request: AutomationMaterializationRequest,
  intent: ScenarioIntent,
  mappedSteps: MappedStep[],
  materializationId: string,
  suiteId: string,
  caseId: string,
  moduleId: string,
  resources: AutomationResourceAuthority,
  db: Prisma.TransactionClient,
) {
  const steps = expectedTargetSteps(mappedSteps)
  const provisional = targetBindingPacket(
    request.targetProjectId,
    moduleId,
    { id: suiteId, name: intent.title, description: intent.narrative },
    { id: caseId, title: intent.title, description: intent.narrative },
    steps,
  )
  const semanticHash = targetSemanticHash(provisional)
  const durable = await db.qualityJourneyAutomationTargetBinding.findFirst({
    where: { targetProjectId: request.targetProjectId, semanticHash },
  })
  if (durable)
    return resolveDurableTargetBinding(durable, request, intent, moduleId, steps, semanticHash, resources, db)
  const suite = await db.testSuite.create({
    data: {
      id: suiteId,
      name: intent.title,
      description: intent.narrative,
      moduleId,
      targetProjectId: request.targetProjectId,
    },
  })
  const testCase = await db.testCase.create({
    data: {
      id: caseId,
      title: intent.title,
      description: intent.narrative,
      targetProjectId: request.targetProjectId,
      TestSuite: { connect: { id: suite.id } },
      steps: {
        create: steps.map((step, index) => ({
          id: idFor('step', materializationId, String(index)),
          ...step,
        })),
      },
    },
  })
  const binding = targetBindingPacket(
    request.targetProjectId,
    moduleId,
    { id: suite.id, name: suite.name, description: suite.description },
    { id: testCase.id, title: testCase.title, description: testCase.description },
    steps,
  )
  return { suite, testCase, binding, semanticHash, targetBindingId: null }
}

async function materializeOne(
  request: ReturnType<typeof automationMaterializationRequestSchema.parse>,
  approved: ApprovedInput,
  resources: AutomationResourceAuthority,
  scenario: ApprovedInput['portfolio']['scenarios'][number],
  proposal: ReturnType<typeof automationMaterializationRequestSchema.parse>['scenarios'][number],
  db: Prisma.TransactionClient,
) {
  const decision = scenario.decisions.find(candidate => candidate.decision === 'APPROVED')!
  const requestHash = hash({ ...request, scenarios: [proposal] })
  const replayKey = `${request.idempotencyKey}:${scenario.scenarioRevisionId}`
  // Idempotency is checked before any mutable catalog lookup: a caller cannot
  // reinterpret a consumed key by submitting a malformed replacement packet.
  const replay = await findMaterializationReplay(request, scenario, proposal, requestHash, replayKey, db)
  if (replay) return { materialization: replay, replayed: true }

  const [module, definitions, locators] = await loadMaterializationReferences(request, resources, db)
  if (!module)
    throw new ServiceError('Materialization requires a target-owned module before creating a suite.', 'CONFLICT')
  assertFrozenResourceContent(resources, module, definitions, locators)
  const intent = parseAndValidateScenarioIntent(scenario, proposal)
  const readyDefinitions = readyDefinitionIndex(definitions)
  const knownLocators = new Set(locators.map(locator => locator.id))
  const mappedSteps = materializeSteps(proposal, intent, readyDefinitions, knownLocators, resources.operationReferences)
  const materializationId = idFor(
    'materialization',
    request.journeyId,
    scenario.scenarioRevisionId,
    request.expectedInputHash,
  )
  const suiteId = idFor('suite', materializationId)
  const caseId = idFor('case', materializationId)
  const { suite, testCase, binding, semanticHash, targetBindingId } = await ensureMaterializationTarget(
    request,
    intent,
    mappedSteps,
    materializationId,
    suiteId,
    caseId,
    module.id,
    resources,
    db,
  )
  return persistMaterialization(
    {
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
      resources,
    },
    mappedSteps,
    db,
  )
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
  targetBindingId: string | null
  resources: AutomationResourceAuthority
}

async function persistMaterialization(
  value: MaterializationPersistenceInput,
  mappedSteps: MappedStep[],
  db: Prisma.TransactionClient,
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
      suiteId: suite.id,
      testCaseId: testCase.id,
      artifactRecordId: artifact.id,
      artifactJson: json(artifactJson),
    },
  })
  const bindingHashes = targetHashes(binding)
  let resolvedTargetBindingId = targetBindingId
  if (!resolvedTargetBindingId) {
    try {
      const targetBinding = await db.qualityJourneyAutomationTargetBinding.create({
        data: {
          id: idFor('target-binding', materializationId),
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
      if (!isUniqueConflict(error)) throw error
      const concurrent = await db.qualityJourneyAutomationTargetBinding.findFirst({
        where: { targetProjectId: request.targetProjectId, semanticHash },
      })
      if (
        !concurrent ||
        concurrent.bindingJson !== json(binding) ||
        concurrent.suiteHash !== bindingHashes.suiteHash ||
        concurrent.testCaseHash !== bindingHashes.testCaseHash ||
        concurrent.stepHash !== bindingHashes.stepHash
      )
        throw new ServiceError(
          'Concurrent Automator materialization created an incompatible target binding.',
          'CONFLICT',
        )
      resolvedTargetBindingId = concurrent.id
    }
  }
  await db.qualityJourneyAutomationMaterializationBinding.create({
    data: { materializationId, bindingId: resolvedTargetBindingId },
  })
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
      linkHash: hash({ relation: 'MATERIALIZES', source, target }),
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
) {
  const failureKind = classifyAutomationFailure(error)
  const message = error instanceof Error ? error.message : 'Automator materialization failed.'
  const failure = { schemaVersion: 'appraise.quality-journey/v1', failureKind, message }
  await client.$transaction(async tx => {
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
  })
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
  if (attempt.leaseId !== request.leaseId || attempt.ownerTokenHash !== tokenHash(request.ownerToken))
    throw new ServiceError('Automator materialization lease authority is invalid.', 'UNAUTHORIZED')
  if (attempt.leaseExpiresAt <= new Date())
    throw new ServiceError('Automator materialization lease has expired.', 'UNAUTHORIZED')
  if (!attempt.spawnReceiptHash)
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
  const ownerTokenHash = tokenHash(request.ownerToken)
  if (attempt.ownerTokenHash !== ownerTokenHash || receipts.some(receipt => receipt.ownerTokenHash !== ownerTokenHash))
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

type MaterializationResult = Awaited<ReturnType<typeof materializeOne>>

async function validateAuthorizedScenarios(
  request: AutomationMaterializationRequest,
  approvedRows: ApprovedScenario[],
  resources: AutomationResourceAuthority,
  tx: Prisma.TransactionClient,
) {
  const [module, definitions, locators] = await loadMaterializationReferences(request, resources, tx)
  if (!module)
    throw new ServiceError('Materialization requires the frozen target-owned destination module.', 'CONFLICT')
  assertFrozenResourceContent(resources, module, definitions, locators)
  const readyDefinitions = readyDefinitionIndex(definitions)
  const knownLocators = new Set(locators.map(locator => locator.id))
  const failedScenarioRevisionIds: string[] = []
  let first: ServiceError | null = null
  for (const proposal of request.scenarios) {
    const scenario = approvedRows.find(candidate => candidate.scenarioRevisionId === proposal.scenarioRevisionId)!
    try {
      const intent = parseAndValidateScenarioIntent(scenario, proposal)
      materializeSteps(proposal, intent, readyDefinitions, knownLocators, resources.operationReferences)
    } catch (error) {
      failedScenarioRevisionIds.push(proposal.scenarioRevisionId)
      if (!first)
        first =
          error instanceof ServiceError ? error : new ServiceError('Automator proposal validation failed.', 'CONFLICT')
    }
  }
  if (first)
    throw new ServiceError(first.message, first.code, first.statusCode, {
      ...first.details,
      failedScenarioRevisionIds: failedScenarioRevisionIds.sort(),
    })
}

async function materializeAuthorizedScenarios(
  request: AutomationMaterializationRequest,
  approved: ApprovedInput,
  resources: AutomationResourceAuthority,
  approvedRows: ApprovedScenario[],
  tx: Prisma.TransactionClient,
) {
  const results: MaterializationResult[] = []
  for (const proposal of [...request.scenarios].sort((left, right) =>
    left.scenarioRevisionId.localeCompare(right.scenarioRevisionId),
  )) {
    const scenario = approvedRows.find(candidate => candidate.scenarioRevisionId === proposal.scenarioRevisionId)!
    results.push(await materializeOne(request, approved, resources, scenario, proposal, tx))
  }
  return results
}

function assertCompletedAutomatorResult(request: AutomationMaterializationRequest) {
  if (request.result.role !== 'AUTOMATOR' || request.result.status !== 'COMPLETED')
    throw new ServiceError('Automator materialization requires a completed Automator worker result.', 'CONFLICT')
}

function assertSubmittedMaterializationOutputs(
  request: AutomationMaterializationRequest,
  results: MaterializationResult[],
) {
  const expectedOutputs = results
    .flatMap(({ materialization }) => [
      { kind: 'TEST_SUITE', artifactId: materialization.suiteId!, contentHash: hash({ id: materialization.suiteId }) },
      {
        kind: 'TEST_CASE',
        artifactId: materialization.testCaseId!,
        contentHash: hash({ id: materialization.testCaseId }),
      },
      {
        kind: 'RUNTIME_CAPSULE',
        artifactId: materialization.preparedCapsule!.id,
        contentHash: materialization.preparedCapsule!.capsuleHash,
      },
    ])
    .sort((left, right) => json(left).localeCompare(json(right)))
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
) {
  return completeAutomatorWorkInTransaction(
    {
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      workItemId: request.workItemId,
      leaseId: request.leaseId,
      ownerToken: request.ownerToken,
      result: request.result,
    },
    tx,
  )
}

export async function materializeQualityJourneyApprovedScenarios(input: unknown, client: PrismaClient = prisma) {
  const request = automationMaterializationRequestSchema.parse(input)
  let authorizedFailureRecord = false
  try {
    return await client.$transaction(async tx => {
      const { approved, compiled, approvedRows, replay } = await authorizeMaterializationRequest(request, tx)
      authorizedFailureRecord = true
      if (replay)
        return {
          replayed: true,
          stage: 'AUTOMATION' as const,
          materializations: replay,
          completion: { replayed: true, workItemId: request.workItemId, status: 'COMPLETED' as const },
        }
      await validateAuthorizedScenarios(request, approvedRows, compiled.resources, tx)
      const results = await materializeAuthorizedScenarios(request, approved, compiled.resources, approvedRows, tx)
      assertCompletedAutomatorResult(request)
      assertSubmittedMaterializationOutputs(request, results)
      const completion = await completeMaterializedAutomatorWork(request, tx)
      // Completion removes the active Automator item but preserves AUTOMATION.
      // A later Phase 7 command is the only route to managed TestRun/RuntimeCapsule creation.
      return {
        replayed: results.every(result => result.replayed),
        stage: 'AUTOMATION' as const,
        materializations: results.map(result => result.materialization),
        completion,
      }
    })
  } catch (error) {
    if (!authorizedFailureRecord) throw error
    if (error instanceof ServiceError && error.details?.replayed === true) throw error
    const failureKind = await persistAutomationFailure(request, error, client)
    if (error instanceof ServiceError)
      throw new ServiceError(error.message, error.code, error.statusCode, { ...error.details, failureKind })
    throw error
  }
}

export async function getQualityJourneyAutomationContext(
  input: { journeyId: string; targetProjectId: string },
  client: PrismaClient = prisma,
) {
  const approved = await approvedInput(input.journeyId, input.targetProjectId, client)
  const compiled = await scope(approved, client)
  const materializations = await client.qualityJourneyAutomationMaterialization.findMany({
    where: { journeyId: input.journeyId, cycleId: approved.journey.activeCycleId, inputHash: compiled.inputHash },
    include: { preparedCapsule: true },
    orderBy: { scenarioRevisionId: 'asc' },
  })
  return {
    inputHash: compiled.inputHash,
    scopeHash: compiled.scopeHash,
    portfolioRevisionId: approved.portfolio.artifactRevisionId,
    scenarioRevisionIds: approvedScenarios(approved).map(s => s.scenarioRevisionId),
    materializations: materializations.filter(
      materialization => materialization.status !== 'MATERIALIZED' || materialization.preparedCapsule,
    ),
    failedMaterializations: materializations.filter(materialization => materialization.status === 'FAILED'),
  }
}
