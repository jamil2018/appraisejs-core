import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const events = vi.hoisted(() => [] as string[])
const owner = vi.hoisted(() => ({ beforeWrite: vi.fn(), queue: vi.fn() }))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('@/lib/operation-catalog', () => ({ defaultOperationDefinitions: [] }))
vi.mock('./quality-journey-remediation-scope', () => ({ qualityJourneyRemediationScope: vi.fn(async () => null) }))
vi.mock('./quality-journey-coordinator-session', () => ({ assertCoordinatorMutationSession: vi.fn(async () => { events.push('auth.m03') }) }))
vi.mock('./quality-journey-business-write-join', () => ({
  readJourneyBusinessEnrollmentKindInTransaction: vi.fn(async () => 'E2_REQUIRES_VALIDATION'),
  assertJourneyBusinessGroupSupportsNoInvalidationInTransaction: vi.fn(async () => { throw new Error('UNSUPPORTED_E2_INVALIDATION') }),
  withJourneyBusinessWriteJoinInTransaction: vi.fn(async (tx, _scope, _credentials, body) => body(owner.beforeWrite, owner.queue)),
}))
vi.mock('./quality-journey-service', () => ({
  acceptExternalQualityJourneySubmissionInTransaction: vi.fn(), completeAutomatorWorkWithBusinessJoinInTransaction: vi.fn(),
  issueQualityJourneySpecializedWorkItemWithBusinessJoinInTransaction: vi.fn(), setQualityJourneyActiveWorkItemsWithBusinessJoinInTransaction: vi.fn(),
  externalAnalyzerAdmissionProtocol: 'EXTERNAL_V1', externalAssignmentSecretHash: vi.fn(),
}))
vi.mock('./quality-journey-shared-resource-guard-service', () => ({ prepareSharedResourceMutationInTransaction: vi.fn() }))
vi.mock('./quality-journey-shared-resource-use-service', () => ({
  resolveResourceResolutionUseRequestInTransaction: vi.fn(async (_tx, input) => { events.push('rr.resolve'); return { ...input, source: { sourceKind: 'RESOURCE_RESOLUTION' } } }),
  resolveAutomationMaterializationUseRequestInTransaction: vi.fn(async (_tx, input) => { events.push('materialization.resolve'); return { ...input, source: { sourceKind: 'AUTOMATION_MATERIALIZATION' } } }),
  validateActiveSharedResourceUseInTransaction: vi.fn(async (_tx, input) => { events.push(`active.${input.source.sourceKind}`) }),
  validateAutomationMaterializationOwnersInTransaction: vi.fn(async (_tx, input) => { events.push(`owners.${input.targetBindingId}`) }),
  acquireSharedResourceUseInBusinessGroupInTransaction: vi.fn(),
}))

import { canonicalContractJson as json } from '@/lib/catalog-contracts'
import { automationMaterializationRequestSchema, hashAutomationMaterialization as hash } from '@/lib/quality-journey/automation-contracts'
import { resourceResolutionBundleSchema } from '@/lib/quality-journey/discovery-contracts'
import { materializeExternalQualityJourneyApprovedScenarios, materializeQualityJourneyApprovedScenarios } from './quality-journey-automation-service'
import { assertJourneyBusinessGroupSupportsNoInvalidationInTransaction, readJourneyBusinessEnrollmentKindInTransaction } from './quality-journey-business-write-join'
import { acceptExternalQualityJourneySubmissionInTransaction } from './quality-journey-service'
import { prepareSharedResourceMutationInTransaction } from './quality-journey-shared-resource-guard-service'
import { acquireSharedResourceUseInBusinessGroupInTransaction, resolveResourceResolutionUseRequestInTransaction,
  validateActiveSharedResourceUseInTransaction, validateAutomationMaterializationOwnersInTransaction } from './quality-journey-shared-resource-use-service'

const H = (character: string) => `sha256:${character.repeat(64)}`
const credentials = { journeyId: 'journey-one', targetProjectId: 'target-one', coordinatorSessionId: 'session-one',
  coordinatorGeneration: 3, coordinatorPrincipalId: 'principal-one' }

/** Ordering-only public-entry double. Real schemas/hash functions; source validators,
 * business join, M03 auth, and SQL are explicitly mocked. The E2 barrier is NOT bypassed. */
function fixture(terminal = true) {
  const scenario = { stableScenarioId: 'stable-one', scenarioRevisionId: 'scenario-one', behavioralIntentJson: '{}',
    behavioralIntentHash: H('a'), contentHash: H('b'), decisions: [{ id: 'decision-one', decision: 'APPROVED', contentHash: H('c') }] }
  const portfolio = { id: 'portfolio-one', artifactId: 'portfolio-artifact-one', artifactRevisionId: 'portfolio-revision-one',
    discoveryRevisionId: 'discovery-one', contentHash: H('d'), approvedIntentHash: H('e'), decisionSetHash: H('f'),
    journeyId: credentials.journeyId, targetProjectId: credentials.targetProjectId, status: 'APPROVED', scenarios: [scenario] }
  const bundle = resourceResolutionBundleSchema.parse({ schemaVersion: 'appraise.quality-journey/v1',
    journeyId: credentials.journeyId, targetProjectId: credentials.targetProjectId, cycleId: 'cycle-one',
    analysisRevision: { artifactId: 'charter-one', revisionId: 'analysis-one', contentHash: H('1') },
    analysisApproval: { artifactId: 'approval-one', contentHash: H('2') }, workItemId: 'resource-work-one',
    attemptId: 'resource-attempt-one', authorizationId: 'authorization-one', inputHash: H('3'), assignmentScopeHash: H('4'),
    approvedRequirementSetHash: H('5'), inputArtifacts: [
      { kind: 'ANALYSIS_CHARTER_REVISION', artifactId: 'charter-one', revisionId: 'analysis-one', contentHash: H('1') },
      { kind: 'JOURNEY_APPROVAL', artifactId: 'approval-one', contentHash: H('2') },
    ], evidenceReceipts: [{ artifactId: 'evidence-one', contentHash: H('6') }], bundleId: 'bundle-one',
    resolvedAt: '2026-10-26T00:00:00.000Z', destinationModuleId: 'module-one', approvedRequirementIds: ['requirement-one'],
    reusable: [{ resourceId: 'module:module-one', resourceKind: 'MODULE', requirementId: 'requirement-one', rank: 1,
      reasonCode: 'COMPATIBLE', explanation: 'Synthetic compatible destination.', evidenceReceiptIds: ['evidence-one'] }],
    incompatible: [], stale: [], crossTarget: [], missing: [],
  })
  const resourceResolutionHash = hash(bundle)
  const frozen = { journeyId: credentials.journeyId, targetProjectId: credentials.targetProjectId, cycleId: 'cycle-one',
    portfolioRevisionId: portfolio.artifactRevisionId, portfolioHash: portfolio.contentHash, approvedIntentHash: portfolio.approvedIntentHash,
    decisionSetHash: portfolio.decisionSetHash, resourceResolutionHash, destinationModuleId: 'module-one', allowedResourceIds: ['module:module-one'],
    scenarioDecisions: [{ scenarioRevisionId: scenario.scenarioRevisionId, contentHash: scenario.contentHash,
      behavioralIntentHash: scenario.behavioralIntentHash, decisionId: 'decision-one', decisionHash: H('c') }], operationCatalogHash: hash([]) }
  const request = automationMaterializationRequestSchema.parse({ journeyId: credentials.journeyId, targetProjectId: credentials.targetProjectId,
    workItemId: 'work-one', attemptId: 'attempt-one', leaseId: 'lease-one', ownerToken: 'synthetic-owner-token', idempotencyKey: 'key-one',
    expectedInputHash: hash(frozen), expectedScopeHash: hash({ ...frozen, scope: 'automator-materialization/v1' }),
    scenarios: [{ scenarioRevisionId: 'scenario-one', steps: [{ sourceScenarioStepId: 'step-one',
      stepDefinition: { id: 'definition-one', version: '1', definitionHash: H('7') },
      operation: { id: 'operation-one', version: '1', handler: { id: 'handler-one', version: '1', contentHash: H('8') } },
      parameters: [], testData: [], locatorRequirements: [] }] }],
    result: { schemaVersion: 'appraise.quality-journey/v1', assignmentId: 'assignment-one', workItemId: 'work-one', attemptId: 'attempt-one',
      roleContractDigest: H('9'), inputHash: hash(frozen), role: 'AUTOMATOR', status: 'COMPLETED', outputs: [], evidenceReceipts: [],
      assumptions: [], blockers: [], unresolvedQuestions: [], submittedAt: '2026-10-26T00:00:00.000Z' },
  })
  const receipt = { id: 'materialization-one', journeyId: request.journeyId, targetProjectId: request.targetProjectId,
    attemptId: request.attemptId, requestHash: hash({ ...request, scenarios: request.scenarios }),
    idempotencyKey: 'key-one:scenario-one', ownerTokenHash: createHash('sha256').update(request.ownerToken).digest('hex'),
    scenarioRevisionId: 'scenario-one', materializationHash: H('a'), portfolioRecordId: portfolio.id, portfolioRevisionId: portfolio.artifactRevisionId, portfolioContentHash: portfolio.contentHash, status: 'MATERIALIZED',
    preparedCapsule: { id: 'prepared-one' } }
  const consume = vi.fn(async () => { throw new Error('UNEXPECTED_DOMAIN_CONSUMER') })
  const write = vi.fn(async () => { throw new Error('UNEXPECTED_SQL_WRITE') })
  const models = {
    qualityJourney: { findFirst: vi.fn(async () => ({ id: request.journeyId, targetProjectId: request.targetProjectId, stage: 'AUTOMATION',
      activeCycleId: 'cycle-one', activeScenarioPortfolioRevisionId: portfolio.id })) },
    qualityJourneyScenarioPortfolioRevision: { findUnique: vi.fn(async () => portfolio) },
    qualityJourneyDiscoveryRevision: { findUnique: vi.fn(async () => ({ journeyId: request.journeyId, targetProjectId: request.targetProjectId,
      status: 'COMPLETED', resourceResolutionHash, resourceResolutionJson: json(bundle) })),
      findUniqueOrThrow: vi.fn(async () => ({ resourceScopeJson: json({ resources: [{ id: 'module:module-one', contentHash: H('b') }] }) })) },
    qualityJourneyWorkItem: { findFirst: vi.fn(async () => ({ id: request.workItemId })) },
    qualityJourneyWorkAttempt: { findUnique: vi.fn(async () => ({ id: request.attemptId, workItemId: request.workItemId, executionMode: 'MANAGED',
      ownerTokenHash: receipt.ownerTokenHash, leaseId: request.leaseId, leaseExpiresAt: new Date('2099-01-01T00:00:00Z'), spawnReceiptHash: H('c') })) },
    qualityJourneyAutomationRequestReceipt: { findUnique: vi.fn(async () => null) },
    qualityJourneyAutomationMaterialization: { findMany: vi.fn(async () => terminal ? [receipt] : []), findUnique: vi.fn(async () => receipt), create: write },
    qualityJourneyAutomationMaterializationBinding: { findMany: vi.fn(async () => [{ materializationId: receipt.id, bindingId: 'binding-one' }]), create: write },
    module: { findFirst: consume }, locator: { findMany: consume }, stepDefinition: { findMany: consume },
    testCase: { findFirst: consume, create: write }, testSuite: { create: write },
    qualityJourneyArtifact: { create: write }, qualityJourneyPreparedRuntimeCapsule: { create: write }, qualityJourneyArtifactLink: { createMany: write },
  }
  const client = { $transaction: vi.fn(async (body: (tx: typeof models) => Promise<unknown>) => body(models)) } as unknown as PrismaClient
  return { request, receipt, client, models, consume, write,
    run: () => materializeQualityJourneyApprovedScenarios(request, client, credentials),
    external: () => {
      const { ownerToken: _ownerToken, idempotencyKey: _internalKey, ...rest } = request
      return materializeExternalQualityJourneyApprovedScenarios({ ...rest, assignmentId: 'external-assignment-one', assignmentGeneration: 1,
        assignmentSecret: 'synthetic-external-assignment-secret-only', idempotencyKey: 'external-key-one' },
        { principalId: 'principal-one', assurance: 'PROJECT_AUTHENTICATED' } as never, client, credentials)
    } }
}

beforeEach(() => {
  vi.clearAllMocks(); events.length = 0
  vi.mocked(readJourneyBusinessEnrollmentKindInTransaction).mockResolvedValue('E2_REQUIRES_VALIDATION')
  vi.mocked(validateActiveSharedResourceUseInTransaction).mockImplementation(async (_tx, input) => {
    events.push(`active.${input.source.sourceKind}`)
    return {} as never
  })
  vi.mocked(validateAutomationMaterializationOwnersInTransaction).mockImplementation(async (_tx, input) => { events.push(`owners.${input.targetBindingId}`) })
})

function expectNoEffects(f: ReturnType<typeof fixture>) {
  expect(f.consume).not.toHaveBeenCalled(); expect(f.write).not.toHaveBeenCalled()
  expect(owner.beforeWrite).not.toHaveBeenCalled(); expect(owner.queue).not.toHaveBeenCalled()
  expect(prepareSharedResourceMutationInTransaction).not.toHaveBeenCalled()
  expect(acquireSharedResourceUseInBusinessGroupInTransaction).not.toHaveBeenCalled()
}

describe('Automation R04 retained replay and staged refusal ordering', () => {
  it('readmits managed terminal replay through selected ACTIVE Use and full materialization owners before returning', async () => {
    const f = fixture(); await expect(f.run()).resolves.toMatchObject({ replayed: true })
    expect(events).toEqual(['auth.m03', 'rr.resolve', 'active.RESOURCE_RESOLUTION', 'materialization.resolve', 'active.AUTOMATION_MATERIALIZATION', 'owners.binding-one'])
    expectNoEffects(f)
  })

  it('refuses missing upstream ACTIVE proof before domain consumption or materialization-owner disclosure', async () => {
    const f = fixture(); vi.mocked(validateActiveSharedResourceUseInTransaction).mockRejectedValueOnce(new Error('UPSTREAM_NOT_ACTIVE'))
    await expect(f.run()).rejects.toThrow('UPSTREAM_NOT_ACTIVE')
    expect(validateAutomationMaterializationOwnersInTransaction).not.toHaveBeenCalled(); expectNoEffects(f)
  })

  it('refuses a malformed alias owner before exposing successful terminal replay', async () => {
    const f = fixture(); vi.mocked(validateAutomationMaterializationOwnersInTransaction).mockRejectedValueOnce(new Error('OWNER_ALIAS_REFUSED'))
    await expect(f.run()).rejects.toThrow('OWNER_ALIAS_REFUSED'); expectNoEffects(f)
  })

  it('preserves immutable idempotency conflict precedence over selected-use interpretation', async () => {
    const f = fixture(); f.receipt.requestHash = H('f')
    await expect(f.run()).rejects.toThrow('idempotency key was reused')
    expect(resolveResourceResolutionUseRequestInTransaction).not.toHaveBeenCalled(); expectNoEffects(f)
  })

  it('retains the production E2 terminal refusal before planning consumers and all business effects', async () => {
    const f = fixture(false)
    await expect(f.run()).rejects.toThrow('UNSUPPORTED_E2_INVALIDATION')
    expect(assertJourneyBusinessGroupSupportsNoInvalidationInTransaction).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['auth.m03', 'rr.resolve', 'active.RESOURCE_RESOLUTION']); expectNoEffects(f)
  })

  it('preserves authenticated legacy frozen-metadata replay without creating authoritative Uses or live target reads', async () => {
    const f = fixture(); vi.mocked(readJourneyBusinessEnrollmentKindInTransaction).mockResolvedValue('LEGACY')
    await expect(f.run()).resolves.toMatchObject({ replayed: true, materializations: [f.receipt] })
    expect(resolveResourceResolutionUseRequestInTransaction).not.toHaveBeenCalled()
    expect(validateAutomationMaterializationOwnersInTransaction).not.toHaveBeenCalled(); expectNoEffects(f)
  })

  it('readmits external retained acceptance when the generic acceptance path skips its effect callback', async () => {
    const f = fixture()
    vi.mocked(acceptExternalQualityJourneySubmissionInTransaction).mockResolvedValue({ replayed: true,
      outcome: { replayed: true, materializations: [f.receipt] } } as never)
    await expect(f.external()).resolves.toMatchObject({ replayed: true })
    expect(events).toEqual(['rr.resolve', 'active.RESOURCE_RESOLUTION', 'materialization.resolve', 'active.AUTOMATION_MATERIALIZATION', 'owners.binding-one'])
    expectNoEffects(f)
  })

  it('preserves legacy external frozen acceptance metadata without live target readmission', async () => {
    const f = fixture(); vi.mocked(readJourneyBusinessEnrollmentKindInTransaction).mockResolvedValue('LEGACY')
    vi.mocked(acceptExternalQualityJourneySubmissionInTransaction).mockResolvedValue({ replayed: true,
      outcome: { replayed: true, materializations: [f.receipt] } } as never)
    await expect(f.external()).resolves.toMatchObject({ replayed: true })
    expect(resolveResourceResolutionUseRequestInTransaction).not.toHaveBeenCalled()
    expect(validateAutomationMaterializationOwnersInTransaction).not.toHaveBeenCalled(); expectNoEffects(f)
  })

  it('refuses broken external retained owners before the accepted outcome can escape', async () => {
    const f = fixture()
    vi.mocked(acceptExternalQualityJourneySubmissionInTransaction).mockResolvedValue({ replayed: true,
      outcome: { replayed: true, materializations: [f.receipt] } } as never)
    vi.mocked(validateAutomationMaterializationOwnersInTransaction).mockRejectedValueOnce(new Error('EXTERNAL_OWNER_REFUSED'))
    await expect(f.external()).rejects.toThrow('EXTERNAL_OWNER_REFUSED'); expectNoEffects(f)
  })
})
