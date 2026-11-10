import type { Prisma, QualityJourneySharedResourceClaim, QualityJourneySharedResourceUse } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./quality-journey-coordinator-session', () => ({ assertCurrentCoordinatorSession: vi.fn(), assertCoordinatorAttemptSession: vi.fn() }))
vi.mock('./quality-journey-e2-retirement-service', () => ({ assertE2BusinessAdmission: vi.fn(), commitE2RetirementRequest: vi.fn() }))
vi.mock('./quality-journey-shared-resource-descriptor-service', () => ({ resolveSharedResourceDescriptors: vi.fn() }))
vi.mock('@/lib/operation-catalog', () => ({ defaultOperationDefinitions: [] }))

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { automationScenarioMaterializationSchema, hashAutomationMaterialization, hashAutomationTargetBinding } from '@/lib/quality-journey/automation-contracts'
import { M06_MATERIALIZATION_ARTIFACT_VERSION } from '@/lib/quality-journey/materialization-source-contract'
import { sharedResourceDigest, sharedSourceDigest } from '@/lib/quality-journey/shared-resource-contract'
import { assertCoordinatorAttemptSession, assertCurrentCoordinatorSession } from './quality-journey-coordinator-session'
import { assertE2BusinessAdmission, commitE2RetirementRequest, type E2BusinessScope } from './quality-journey-e2-retirement-service'
import { resolveSharedResourceDescriptors, type SharedResourceDescriptorKey, type SharedResourceDescriptorResult } from './quality-journey-shared-resource-descriptor-service'
import { buildSharedResourceClaimPlan, resolveAutomationMaterializationUseRequestInTransaction, validateAutomationMaterializationOwnersInTransaction } from './quality-journey-shared-resource-use-service'

const H = (character: string) => `sha256:${character.repeat(64)}`
const targetProjectId = 'target-owner-census'
const scope: E2BusinessScope = { journeyId: 'journey-caller', targetProjectId, coordinatorSessionId: 'session-caller', generation: 9,
  credentials: { journeyId: 'journey-caller', targetProjectId, coordinatorSessionId: 'session-caller', coordinatorGeneration: 9,
    coordinatorPrincipalId: 'principal-caller', coordinatorHandoffId: 'handoff-caller' } }
function descriptor(keys: readonly SharedResourceDescriptorKey[]): SharedResourceDescriptorResult {
  const ordered = [...keys].sort((left, right) => left.kind.localeCompare(right.kind) || left.resourceId.localeCompare(right.resourceId))
  return { protocol: 'M06_SHARED_DESCRIPTOR_V1', keys: ordered,
    dependencyDigest: sharedResourceDigest('M06_TEST_OWNER_DESCRIPTOR_V1', ordered),
    resources: ordered.map(key => ({ ...key, dependencyDigest: sharedResourceDigest('M06_TEST_OWNER_RESOURCE_V1', key) })) }
}

/** Full canonical typed source, not a mocked reconstruction or synthesized credential. */
function owner(tag: string, suiteId = 'suite-a', testCaseId = 'case-a', bindingId = 'binding-a') {
  const journeyId = `journey-${tag}`
  const proposal = automationScenarioMaterializationSchema.parse({ scenarioRevisionId: `scenario-${tag}`, steps: [{
    sourceScenarioStepId: `step-${tag}`, stepDefinition: { id: 'definition-owner', version: '1', definitionHash: H('c') },
    operation: { id: 'operation-owner', version: '1', handler: { id: 'handler-owner', version: '1', contentHash: H('d') } },
    parameters: [], testData: [], locatorRequirements: [],
  }] })
  const packet = { schemaVersion: 'appraise.quality-journey/v1' as const, targetProjectId, moduleId: 'module-owner',
    suite: { id: suiteId, name: `Suite ${suiteId}`, description: null },
    testCase: { id: testCaseId, title: `Case ${testCaseId}`, description: 'Synthetic owner case description', steps: [{ order: 0, gherkinStep: 'Given an owner',
      label: 'owner', icon: 'MOUSE', invocationJson: '{}' }] } }
  const manifest = { schemaVersion: packet.schemaVersion, kind: 'PREPARED_RUNTIME_CAPSULE', materializationId: `materialization-${tag}`,
    sourceScenarioRevisionId: proposal.scenarioRevisionId, sourceScenarioContentHash: H('e'), suiteId, testCaseId,
    steps: proposal.steps.map(step => ({ stepId: step.sourceScenarioStepId, definition: step.stepDefinition,
      operation: step.operation, parameters: step.parameters, testData: step.testData, locatorRequirements: step.locatorRequirements })),
    dataRequirements: [], locatorRequirements: [], decision: { id: `decision-${tag}`, contentHash: H('f') },
    portfolioRevisionId: `portfolio-${tag}`, portfolioHash: H('1') }
  const row = { id: manifest.materializationId, journeyId, targetProjectId, cycleId: `cycle-${tag}`,
    scenarioRevisionId: proposal.scenarioRevisionId, scenarioContentHash: manifest.sourceScenarioContentHash,
    portfolioRevisionId: manifest.portfolioRevisionId, portfolioContentHash: manifest.portfolioHash,
    decisionId: manifest.decision.id, decisionHash: manifest.decision.contentHash, workItemId: `work-${tag}`,
    attemptId: `attempt-${tag}`, leaseId: `lease-${tag}`, inputHash: H('2'),
    materializationHash: hashAutomationMaterialization({ journeyId, targetProjectId, expectedInputHash: H('2'), expectedScopeHash: H('3'),
      workItemId: `work-${tag}`, attemptId: `attempt-${tag}`, leaseId: `lease-${tag}`, scenario: proposal }),
    status: 'MATERIALIZED', sourceProofVersion: M06_MATERIALIZATION_ARTIFACT_VERSION, suiteId, testCaseId,
    artifactRecordId: `artifact-${tag}`, artifactJson: canonicalContractJson(manifest) }
  const targetBinding = { id: bindingId, journeyId: 'journey-creator-is-not-an-owner', targetProjectId, suiteId, testCaseId,
    semanticHash: hashAutomationMaterialization({ schemaVersion: packet.schemaVersion, targetProjectId, moduleId: packet.moduleId,
      suite: { name: packet.suite.name, description: packet.suite.description },
      testCase: { title: packet.testCase.title, description: packet.testCase.description, steps: packet.testCase.steps } }),
    suiteHash: hashAutomationMaterialization({ targetProjectId, moduleId: packet.moduleId, suite: packet.suite }),
    testCaseHash: hashAutomationTargetBinding(packet), stepHash: hashAutomationMaterialization(packet.testCase.steps),
    bindingJson: canonicalContractJson(packet), resourceHashJson: '[]' }
  const sessionBinding = { journeyId, targetProjectId, sessionId: `session-${tag}`, coordinatorGeneration: 2,
    workItemId: row.workItemId, leaseId: row.leaseId, inputHash: row.inputHash, role: 'AUTOMATOR',
    assignmentGeneration: 1, authorizationId: `authorization-${tag}` }
  const proof = { materializationId: row.id, expectedScopeHash: H('3'), reconstructionVersion: M06_MATERIALIZATION_ARTIFACT_VERSION }
  const artifact = { id: row.artifactRecordId, journeyId, targetProjectId, cycleId: row.cycleId, kind: 'RUNTIME_CAPSULE',
    artifactId: row.id, contentHash: hashAutomationMaterialization(manifest), artifactJson: row.artifactJson }
  const keys: SharedResourceDescriptorKey[] = [{ kind: 'MODULE', resourceId: packet.moduleId },
    { kind: 'TEST_SUITE', resourceId: suiteId }, { kind: 'TEST_CASE', resourceId: testCaseId }]
  const plan = buildSharedResourceClaimPlan({ journeyId, targetProjectId, coordinatorSessionId: sessionBinding.sessionId,
    generation: sessionBinding.coordinatorGeneration, sourceKind: 'AUTOMATION_MATERIALIZATION', sourceOwnerId: row.id,
    sourceDigest: sharedSourceDigest({ sourceKind: 'AUTOMATION_MATERIALIZATION', sourceOwnerId: row.id, sourceHash: row.materializationHash }) }, descriptor(keys))
  const use: QualityJourneySharedResourceUse = { id: plan.id, journeyId, targetProjectId,
    coordinatorSessionId: plan.coordinatorSessionId, generation: plan.generation, sourceKind: plan.sourceKind,
    sourceOwnerId: row.id, sourceDigest: plan.sourceDigest, dependencyDigest: plan.dependencyDigest,
    claimSetDigest: plan.claimSetDigest, claimSetCount: plan.claimSetCount, state: 'ACTIVE', version: 1,
    createdAt: new Date(0), releasedAt: null, releaseEvidenceDigest: null, releaseReason: null }
  const claims: QualityJourneySharedResourceClaim[] = plan.claims.map(claim => ({ ...claim, state: 'ACTIVE', claimEpoch: 1,
    createdAt: new Date(0), releaseEpoch: null, releasedAt: null, releaseEvidenceDigest: null, releaseReason: null }))
  return { row, targetBinding, sessionBinding, artifact, proof, packet, use, claims }
}

type Owner = ReturnType<typeof owner>
type Query = { take?: number; orderBy?: unknown; select?: unknown; where: { id?: string | { in: string[] }; materializationId?: string | { in: string[] };
  bindingId?: { in: string[] }; attemptId?: string; useId?: string;
  OR?: Array<{ suiteId?: { in: string[] }; testCaseId?: { in: string[] }; id?: string }> } }
const inIds = (predicate: string | { in: string[] } | undefined, id: string) => typeof predicate === 'string' ? predicate === id : !!predicate?.in.includes(id)
const matchingRoots = (where: Query['where'], row: { id: string; suiteId: string; testCaseId: string }) =>
  where.id ? inIds(where.id, row.id) : !!where.OR?.some(term =>
    term.suiteId?.in.includes(row.suiteId) || term.testCaseId?.in.includes(row.testCaseId))
const fixtures: Array<{ writes: string[] }> = []

/** Read-only in-memory transaction double. No Prisma instance, database or process. */
function fixture(owners: Owner[] = [owner('a'), owner('b')]) {
  const writes: string[] = []
  fixtures.push({ writes })
  const bindings = [...new Map(owners.map(value => [value.targetBinding.id, value.targetBinding])).values()]
  const rows = owners.map(value => value.row)
  const associations = owners.map(value => ({ materializationId: value.row.id, bindingId: value.targetBinding.id }))
  const write = (name: string) => vi.fn(async () => { writes.push(name); throw new Error('UNEXPECTED_WRITE') })
  const readOnly = <T extends object>(name: string, reads: T) => ({ ...reads, create: write(`${name}.create`),
    update: write(`${name}.update`), updateMany: write(`${name}.updateMany`), delete: write(`${name}.delete`),
    deleteMany: write(`${name}.deleteMany`), upsert: write(`${name}.upsert`) })
  const models = {
    qualityJourneyAutomationTargetBinding: readOnly('binding', {
      findUnique: vi.fn(async ({ where }: Query) => bindings.find(value => value.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: Query) => bindings.filter(value => matchingRoots(where, value))),
    }),
    qualityJourneyAutomationMaterialization: readOnly('materialization', {
      findUnique: vi.fn(async ({ where }: Query) => rows.find(value => value.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: Query) => rows.filter(value => matchingRoots(where, value))),
    }),
    qualityJourneyAutomationMaterializationBinding: readOnly('association', {
      findMany: vi.fn(async ({ where }: Query) => associations.filter(value => where.bindingId ?
        inIds(where.bindingId, value.bindingId) : inIds(where.materializationId, value.materializationId))),
    }),
    qualityJourneyAutomationMaterializationSourceProof: readOnly('proof', {
      findUnique: vi.fn(async ({ where }: Query) => owners.find(value => value.row.id === where.materializationId)?.proof ?? null),
    }),
    qualityJourneyArtifact: readOnly('artifact', {
      findUnique: vi.fn(async ({ where }: Query) => owners.find(value => value.artifact.id === where.id)?.artifact ?? null),
    }),
    qualityJourneyWorkAttemptSessionBinding: readOnly('attemptBinding', {
      findUnique: vi.fn(async ({ where }: Query) => owners.find(value => value.row.attemptId === where.attemptId)?.sessionBinding ?? null),
    }),
    qualityJourneyWorkAttempt: readOnly('attempt', {
      findUnique: vi.fn(async ({ where }: Query) => {
        const value = owners.find(item => item.row.attemptId === where.id)
        return value ? { workItemId: value.row.workItemId, leaseId: value.row.leaseId,
          assignmentGeneration: 1, authorizationId: value.sessionBinding.authorizationId } : null
      }),
    }),
    qualityJourneyWorkItem: readOnly('work', {
      findUnique: vi.fn(async ({ where }: Query) => {
        const value = owners.find(item => item.row.workItemId === where.id)
        return value ? { journeyId: value.row.journeyId, targetProjectId, cycleId: value.row.cycleId, role: 'AUTOMATOR', inputHash: value.row.inputHash } : null
      }),
    }),
    qualityJourneyWorkAuthorization: readOnly('authorization', {
      findUnique: vi.fn(async ({ where }: Query) => {
        const value = owners.find(item => item.sessionBinding.authorizationId === where.id)
        return value ? { journeyId: value.row.journeyId, targetProjectId, workItemId: value.row.workItemId, role: 'AUTOMATOR' } : null
      }),
    }),
    qualityJourney: readOnly('journey', {
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ activeCycleId: owners.find(value => value.row.journeyId === where.id)?.row.cycleId })),
    }),
    testSuite: readOnly('suite', {
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select: { testCases: { where: { id: string } } } }) => {
        const value = owners.find(item => item.packet.suite.id === where.id)
        return value ? { ...value.packet.suite, targetProjectId, moduleId: value.packet.moduleId,
          testCases: [{ id: select.testCases.where.id }] } : null
      }),
    }),
    testCase: readOnly('case', {
      findUnique: vi.fn(async ({ where }: Query) => {
        const value = owners.find(item => item.packet.testCase.id === where.id)
        return value ? { ...value.packet.testCase, targetProjectId } : null
      }),
    }),
    testCaseStep: readOnly('step', {
      findMany: vi.fn(async ({ where }: { where: { testCaseId: string } }) => owners.find(value =>
        value.packet.testCase.id === where.testCaseId)?.packet.testCase.steps.map(step => ({ ...step, testCaseId: where.testCaseId })) ?? []),
    }),
    qualityJourneySharedResourceUse: readOnly('use', {
      findMany: vi.fn(async ({ where }: Query) => owners.filter(value => value.use.id === where.OR?.[0]?.id).map(value => value.use)),
      findFirst: vi.fn(async () => null),
    }),
    qualityJourneySharedResourceClaim: readOnly('claim', {
      findMany: vi.fn(async ({ where }: Query) => owners.find(value => value.use.id === where.useId)?.claims ?? []),
      findFirst: vi.fn(async () => null),
    }),
    qualityJourneySharedResourceCoverage: readOnly('coverage', {
      findUnique: vi.fn(async ({ where }: { where: { targetProjectId_kind_protocolVersion: { kind: string } } }) => ({
        targetProjectId, kind: where.targetProjectId_kind_protocolVersion.kind, protocolVersion: 1, state: 'COMPLETE', epoch: 1,
        createdAt: new Date(0), completedAt: new Date(0), writerClosureDigest: 'a'.repeat(64), readerClosureDigest: 'b'.repeat(64),
        sourceUniverseDigest: 'c'.repeat(64), reconciliationDigest: 'd'.repeat(64), proofKind: 'RECONCILED_V1',
      })),
    }),
    qualityJourneySharedResourceGuard: readOnly('guard', {
      findUnique: vi.fn(async ({ where }: { where: { targetProjectId_kind_resourceId: SharedResourceDescriptorKey } }) => ({
        ...where.targetProjectId_kind_resourceId, targetProjectId, epoch: 1, createdAt: new Date(0), coverageState: 'COMPLETE_V1',
        coverageDigest: 'e'.repeat(64), resourceState: 'LIVE', deletedAt: null,
      })),
    }),
  }
  return { owners, bindings, rows, associations, writes, models, tx: models as unknown as Prisma.TransactionClient,
    validate: (supplied = scope) => validateAutomationMaterializationOwnersInTransaction(models as unknown as Prisma.TransactionClient,
      { scope: supplied, targetBindingId: 'binding-a' }) }
}

beforeEach(() => {
  fixtures.length = 0
  vi.clearAllMocks()
  vi.mocked(assertCurrentCoordinatorSession).mockResolvedValue({} as Awaited<ReturnType<typeof assertCurrentCoordinatorSession>>)
  vi.mocked(resolveSharedResourceDescriptors).mockImplementation(async (_tx, _target, keys) => descriptor(keys))
})
afterEach(() => {
  for (const value of fixtures) expect(value.writes).toEqual([])
  expect(assertE2BusinessAdmission).not.toHaveBeenCalled()
  expect(assertCoordinatorAttemptSession).not.toHaveBeenCalled()
  expect(commitE2RetirementRequest).not.toHaveBeenCalled()
})

describe('read-only complete Automation materialization owner validation', () => {
  it('accepts two independent same-target Journeys and authenticates only the original caller once', async () => {
    const f = fixture()
    await expect(f.validate()).resolves.toBeUndefined()
    expect(assertCurrentCoordinatorSession).toHaveBeenCalledTimes(1)
    expect(assertCurrentCoordinatorSession).toHaveBeenCalledWith(scope.credentials, f.tx)
    expect(f.models.qualityJourneySharedResourceUse.findMany).toHaveBeenCalledTimes(4)
    for (const model of [f.models.qualityJourneyAutomationTargetBinding, f.models.qualityJourneyAutomationMaterialization,
      f.models.qualityJourneyAutomationMaterializationBinding]) {
      for (const [query] of model.findMany.mock.calls) {
        expect(query.take).toBe(4097)
        expect(query.orderBy).toBeDefined()
        expect(query.where).not.toHaveProperty('targetProjectId')
        expect(query.where).not.toHaveProperty('status')
        expect(query.where).not.toHaveProperty('journeyId')
      }
    }
    expect(f.models.qualityJourneyWorkAttemptSessionBinding.findUnique).toHaveBeenCalledWith({ where: { attemptId: 'attempt-b' } })
  })

  it.each(['SUITE', 'CASE'] as const)('accepts valid distinct bindings overlapping only the %s root', async kind => {
    const f = fixture([owner('a'), owner('b', kind === 'SUITE' ? 'suite-a' : 'suite-b', kind === 'CASE' ? 'case-a' : 'case-b', 'binding-b')])
    await expect(f.validate()).resolves.toBeUndefined()
    const calls = f.models.qualityJourneyAutomationTargetBinding.findMany.mock.calls
    expect(calls.some(([query]) => query.where.OR?.length === 2)).toBe(true)
  })

  it.each(['SUITE', 'CASE'] as const)('discovers a stale owner on another binding through the %s root', async kind => {
    const other = owner('b', kind === 'SUITE' ? 'suite-a' : 'suite-b', kind === 'CASE' ? 'case-a' : 'case-b', 'binding-b')
    other.use.dependencyDigest = 'f'.repeat(64)
    await expect(fixture([owner('a'), other]).validate()).rejects.toMatchObject({ details: { reason: 'USE_CORRUPT_STALE_OR_RELEASED' } })
  })

  it.each(['SUITE', 'CASE'] as const)('finds a direct orphan materialization through the %s root', async kind => {
    const f = fixture([owner('a'), owner('orphan', kind === 'SUITE' ? 'suite-a' : 'suite-orphan', kind === 'CASE' ? 'case-a' : 'case-orphan', 'binding-orphan')])
    f.bindings.splice(1); f.associations.splice(1)
    await expect(f.validate()).rejects.toMatchObject({ details: { reason: 'AUTOMATION_OWNER_ORPHAN_OR_UNSUPPORTED_ASSOCIATIONS' } })
  })

  it('expands one-root aliases to discover a stale owner beyond the initial root pair', async () => {
    const final = owner('c', 'suite-b', 'case-c', 'binding-c'); final.claims.splice(0, 1)
    const f = fixture([owner('a'), owner('b', 'suite-b', 'case-a', 'binding-b'), final])
    await expect(f.validate()).rejects.toMatchObject({ details: { reason: 'CLAIM_SET_INCOMPLETE' } })
    expect(f.models.qualityJourneyWorkAttemptSessionBinding.findUnique).toHaveBeenCalledWith({ where: { attemptId: 'attempt-c' } })
  })

  it.each(['FOREIGN_BINDING', 'FOREIGN_RECEIPT', 'FAILED', 'MISSING_PROOF', 'MALFORMED_ROOT', 'ORPHAN_BINDING', 'MISMATCHED_EDGE'] as const)(
    'refuses an observed %s alias without filtering it away', async corruption => {
      const f = fixture()
      if (corruption === 'FOREIGN_BINDING') f.bindings[0]!.targetProjectId = 'target-foreign'
      if (corruption === 'FOREIGN_RECEIPT') f.rows[1]!.targetProjectId = 'target-foreign'
      if (corruption === 'FAILED') f.rows[1]!.status = 'FAILED'
      if (corruption === 'MISSING_PROOF') f.models.qualityJourneyAutomationMaterializationSourceProof.findUnique.mockResolvedValue(null)
      if (corruption === 'MALFORMED_ROOT') f.rows[1]!.suiteId = ''
      if (corruption === 'ORPHAN_BINDING') f.bindings.push({ ...f.bindings[0]!, id: 'binding-orphan' })
      if (corruption === 'MISMATCHED_EDGE') f.rows[1]!.testCaseId = 'case-mismatch'
      await expect(f.validate()).rejects.toThrow()
    })

  it.each(['PARTIAL', 'RELEASED_USE', 'RELEASED_CLAIM', 'DUPLICATE_CLAIM', 'DUPLICATE_USE', 'EPOCH', 'LINEAGE', 'OLD_CYCLE', 'LEGACY_PROVENANCE', 'MISSING_USE'] as const)(
    'refuses retained %s state', async corruption => {
      const f = fixture(); const other = f.owners[1]!
      if (corruption === 'PARTIAL') other.claims.splice(0, 1)
      if (corruption === 'RELEASED_USE') other.use.state = 'RELEASED'
      if (corruption === 'RELEASED_CLAIM') other.claims[0]!.state = 'RELEASED'
      if (corruption === 'DUPLICATE_CLAIM') other.claims[1] = { ...other.claims[0]! }
      if (corruption === 'DUPLICATE_USE') f.models.qualityJourneySharedResourceUse.findMany.mockImplementation(async () => [other.use, other.use])
      if (corruption === 'EPOCH') other.claims[0]!.claimEpoch = 2
      if (corruption === 'LINEAGE') other.sessionBinding.authorizationId = ''
      if (corruption === 'LEGACY_PROVENANCE') f.models.qualityJourneyWorkAttemptSessionBinding.findUnique.mockResolvedValue(null)
      if (corruption === 'MISSING_USE') f.models.qualityJourneySharedResourceUse.findMany.mockResolvedValue([])
      if (corruption === 'OLD_CYCLE') f.models.qualityJourney.findFirst.mockResolvedValue({ activeCycleId: 'cycle-old' })
      await expect(f.validate()).rejects.toThrow()
    })

  it('refuses missing or duplicate exact association endpoints', async () => {
    for (const duplicate of [false, true]) {
      const f = fixture()
      const original = f.models.qualityJourneyAutomationMaterialization.findMany.getMockImplementation()!
      f.models.qualityJourneyAutomationMaterialization.findMany.mockImplementation(async query => query.where.id ?
        (duplicate ? [f.rows[0]!, f.rows[0]!] : [f.rows[0]!]) : original(query))
      await expect(f.validate()).rejects.toThrow()
    }
  })

  it('refuses duplicate associations and a 4097 overflow sentinel', async () => {
    const duplicate = fixture(); duplicate.associations.push({ ...duplicate.associations[0]! })
    await expect(duplicate.validate()).rejects.toMatchObject({ details: { reason: 'AUTOMATION_OWNER_CENSUS_DUPLICATE' } })
    const overflow = fixture()
    overflow.models.qualityJourneyAutomationTargetBinding.findMany.mockResolvedValue(Array.from({ length: 4097 }, (_, index) =>
      ({ ...overflow.bindings[0]!, id: `binding-overflow-${index}` })))
    await expect(overflow.validate()).rejects.toMatchObject({ details: { reason: 'AUTOMATION_OWNER_CENSUS_OVERFLOW' } })
  })

  it('counts the combined typed root budget cumulatively rather than each kind separately', async () => {
    const f = fixture()
    const bindings = Array.from({ length: 4096 }, (_, index) => ({ ...f.bindings[0]!, id: `binding-budget-${index}`, testCaseId: `case-budget-${index}` }))
    bindings[0] = f.bindings[0]!
    f.bindings.splice(0, f.bindings.length, ...bindings)
    // Every newly reached binding has an edge and exact matching materialization;
    // combined roots still exceed 4096 before any source is consumed.
    const rows = bindings.map((binding, index) => ({ ...f.rows[0]!, id: `materialization-budget-${index}`, testCaseId: binding.testCaseId }))
    f.rows.splice(0, f.rows.length, ...rows)
    f.associations.splice(0, f.associations.length, ...rows.map((row, index) => ({ materializationId: row.id, bindingId: bindings[index]!.id })))
    await expect(f.validate()).rejects.toMatchObject({ details: { reason: 'AUTOMATION_OWNER_CENSUS_OVERFLOW' } })
  })

  it('rereads the full closed census and refuses an added orphan before returning', async () => {
    const f = fixture(); const original = f.models.qualityJourneyAutomationTargetBinding.findUnique.getMockImplementation()!
    let seeds = 0
    f.models.qualityJourneyAutomationTargetBinding.findUnique.mockImplementation(async query => {
      if (++seeds === 2) f.bindings.push({ ...f.bindings[0]!, id: 'binding-late-orphan' })
      return original(query)
    })
    await expect(f.validate()).rejects.toThrow()
  })

  it('refuses source and descriptor drift on final owner rereads', async () => {
    for (const changed of ['SOURCE', 'DESCRIPTOR'] as const) {
      const f = fixture([owner('a')])
      if (changed === 'SOURCE') {
        const original = f.models.qualityJourneyAutomationMaterialization.findUnique.getMockImplementation()!
        let reads = 0
        f.models.qualityJourneyAutomationMaterialization.findUnique.mockImplementation(async query => {
          if (++reads === 2) f.rows[0]!.artifactJson = '{}'
          return original(query)
        })
      } else {
        vi.mocked(resolveSharedResourceDescriptors).mockResolvedValueOnce(descriptor([
          { kind: 'MODULE', resourceId: 'module-owner' }, { kind: 'TEST_SUITE', resourceId: 'suite-a' }, { kind: 'TEST_CASE', resourceId: 'case-a' },
        ])).mockResolvedValueOnce({ ...descriptor([]), dependencyDigest: 'f'.repeat(64) })
      }
      await expect(f.validate()).rejects.toThrow()
    }
  })

  it('refuses original scope mismatch before inventory reads and authenticates failed credentials without foreign fallback', async () => {
    const f = fixture()
    await expect(f.validate({ ...scope, generation: 10 })).rejects.toMatchObject({ details: { reason: 'REQUEST_SCOPE' } })
    expect(f.models.qualityJourneyAutomationTargetBinding.findUnique).not.toHaveBeenCalled()
    vi.mocked(assertCurrentCoordinatorSession).mockRejectedValueOnce(new Error('CALLER_AUTH_REFUSED'))
    await expect(f.validate()).rejects.toThrow('CALLER_AUTH_REFUSED')
    expect(f.models.qualityJourneyAutomationTargetBinding.findUnique).not.toHaveBeenCalled()
    expect(assertCurrentCoordinatorSession).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a custom transaction cannot perform the typed scalar inventory', async () => {
    const f = fixture()
    const unsupported = { ...f.models, qualityJourneyAutomationMaterialization: { findUnique: f.models.qualityJourneyAutomationMaterialization.findUnique } }
    await expect(validateAutomationMaterializationOwnersInTransaction(unsupported as unknown as Prisma.TransactionClient,
      { scope, targetBindingId: 'binding-a' })).rejects.toMatchObject({ details: { reason: 'AUTOMATION_OWNER_CENSUS_CLIENT_UNSUPPORTED' } })
  })
})

// This independent synthetic caller input owns owner('a') in the in-memory
// fixture. It is not reconstructed from foreign retained rows or authenticated
// against a live session. The resolver returns inert metadata, not authority.
describe('Automation materialization Use request resolver typed-source boundary', () => {
  const originalOwnScope: E2BusinessScope = { journeyId: 'journey-a', targetProjectId: 'target-owner-census',
    coordinatorSessionId: 'session-a', generation: 2,
    credentials: { journeyId: 'journey-a', targetProjectId: 'target-owner-census', coordinatorSessionId: 'session-a',
      coordinatorGeneration: 2, coordinatorPrincipalId: 'synthetic-original-principal-a', coordinatorHandoffId: undefined } }
  const sourceKeys: SharedResourceDescriptorKey[] = [{ kind: 'MODULE', resourceId: 'module-owner' },
    { kind: 'TEST_CASE', resourceId: 'case-a' }, { kind: 'TEST_SUITE', resourceId: 'suite-a' }]
  const expectInertResolution = (f: ReturnType<typeof fixture>) => {
    expect(f.writes).toEqual([])
    expect(assertCurrentCoordinatorSession).not.toHaveBeenCalled()
    expect(f.models.qualityJourneySharedResourceUse.findMany).not.toHaveBeenCalled()
    expect(f.models.qualityJourneySharedResourceUse.findFirst).not.toHaveBeenCalled()
    expect(f.models.qualityJourneySharedResourceClaim.findMany).not.toHaveBeenCalled()
    expect(f.models.qualityJourneySharedResourceClaim.findFirst).not.toHaveBeenCalled()
    expect(f.models.qualityJourneySharedResourceCoverage.findUnique).not.toHaveBeenCalled()
    expect(f.models.qualityJourneySharedResourceGuard.findUnique).not.toHaveBeenCalled()
  }

  it('resolves exact retained typed source into a normal inert request with source-derived keys and digests', async () => {
    const f = fixture([owner('a')]); const row = f.owners[0]!.row
    const result = await resolveAutomationMaterializationUseRequestInTransaction(f.tx, {
      scope: originalOwnScope, materializationId: row.id, materializationHash: row.materializationHash,
    })
    expect(result).toEqual({ scope: originalOwnScope, source: { sourceKind: 'AUTOMATION_MATERIALIZATION',
      sourceOwnerId: row.id, expectedSourceDigest: sharedSourceDigest({ sourceKind: 'AUTOMATION_MATERIALIZATION',
        sourceOwnerId: row.id, sourceHash: row.materializationHash }) }, expectedDependencyDigest: descriptor(sourceKeys).dependencyDigest })
    expect(Object.keys(result).sort()).toEqual(['expectedDependencyDigest', 'scope', 'source'])
    expect(result.scope).not.toBe(originalOwnScope)
    expect(result.scope.credentials).not.toBe(originalOwnScope.credentials)
    expect(resolveSharedResourceDescriptors).toHaveBeenCalledExactlyOnceWith(f.tx, targetProjectId, sourceKeys)
    expect(f.models.qualityJourneyAutomationMaterializationSourceProof.findUnique).toHaveBeenCalledWith({ where: { materializationId: row.id } })
    expectInertResolution(f)
  })

  it('refuses malformed and wrong original materialization hashes without producing a request or effects', async () => {
    for (const materializationHash of ['sha256:not-a-digest', '0'.repeat(64), H('0')]) {
      const f = fixture([owner('a')]); const row = f.owners[0]!.row
      await expect(resolveAutomationMaterializationUseRequestInTransaction(f.tx, {
        scope: originalOwnScope, materializationId: row.id, materializationHash,
      })).rejects.toMatchObject({ details: { reason: 'MATERIALIZATION_SOURCE_DIGEST_STALE' } })
      if (materializationHash !== H('0')) expect(f.models.qualityJourneyAutomationMaterialization.findUnique).not.toHaveBeenCalled()
      expectInertResolution(f)
    }
    expect(resolveSharedResourceDescriptors).not.toHaveBeenCalled()
  })

  it('refuses a foreign retained owner and changed original source proof through real reconstruction', async () => {
    for (const corruption of ['FOREIGN_OWNER', 'CHANGED_SOURCE', 'CHANGED_PROOF'] as const) {
      const f = fixture([owner('a')]); const row = f.owners[0]!.row
      const input = { scope: originalOwnScope, materializationId: row.id, materializationHash: row.materializationHash }
      if (corruption === 'FOREIGN_OWNER') row.journeyId = 'journey-foreign'
      if (corruption === 'CHANGED_SOURCE') row.artifactJson = '{}'
      if (corruption === 'CHANGED_PROOF') f.owners[0]!.proof.expectedScopeHash = H('4')
      await expect(resolveAutomationMaterializationUseRequestInTransaction(f.tx, input)).rejects.toMatchObject({ details: {
        reason: corruption === 'FOREIGN_OWNER' ? 'MATERIALIZATION_SCOPE' : 'MATERIALIZATION_SOURCE_RECONSTRUCTION_REFUSED',
      } })
      expectInertResolution(f)
    }
    expect(resolveSharedResourceDescriptors).not.toHaveBeenCalled()
  })

  it('captures original scope credentials and source scalars before the first asynchronous retained read', async () => {
    const f = fixture([owner('a')]); const row = f.owners[0]!.row
    const supplied = { scope: { ...originalOwnScope, credentials: { ...originalOwnScope.credentials } },
      materializationId: row.id, materializationHash: row.materializationHash }
    const original = structuredClone(supplied)
    let release!: (value: Owner['row'] | null) => void
    const firstRead = new Promise<Owner['row'] | null>(resolve => { release = resolve })
    f.models.qualityJourneyAutomationMaterialization.findUnique.mockImplementationOnce(async () => firstRead)
    const pending = resolveAutomationMaterializationUseRequestInTransaction(f.tx, supplied)
    expect(f.models.qualityJourneyAutomationMaterialization.findUnique).toHaveBeenCalledWith({
      where: { id: original.materializationId }, select: expect.objectContaining({ id: true, journeyId: true, materializationHash: true }),
    })
    supplied.scope.journeyId = 'journey-mutated'; supplied.scope.targetProjectId = 'target-mutated'
    supplied.scope.coordinatorSessionId = 'session-mutated'; supplied.scope.generation = 99
    supplied.scope.credentials.journeyId = 'journey-mutated'; supplied.scope.credentials.targetProjectId = 'target-mutated'
    supplied.scope.credentials.coordinatorSessionId = 'session-mutated'; supplied.scope.credentials.coordinatorGeneration = 99
    supplied.scope.credentials.coordinatorPrincipalId = 'principal-mutated'; supplied.scope.credentials.coordinatorHandoffId = 'handoff-mutated'
    supplied.materializationId = 'materialization-mutated'; supplied.materializationHash = H('0')
    release(row)
    const result = await pending
    expect(result).toEqual({ scope: original.scope, source: { sourceKind: 'AUTOMATION_MATERIALIZATION',
      sourceOwnerId: original.materializationId, expectedSourceDigest: sharedSourceDigest({ sourceKind: 'AUTOMATION_MATERIALIZATION',
        sourceOwnerId: original.materializationId, sourceHash: original.materializationHash }) }, expectedDependencyDigest: descriptor(sourceKeys).dependencyDigest })
    expect(resolveSharedResourceDescriptors).toHaveBeenCalledExactlyOnceWith(f.tx, original.scope.targetProjectId, sourceKeys)
    expectInertResolution(f)
  })
})
