import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const authority = vi.hoisted(() => ({ current: vi.fn(), attempt: vi.fn() }))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./quality-journey-coordinator-session', () => ({
  assertCurrentCoordinatorSession: authority.current,
  assertCoordinatorAttemptSession: authority.attempt,
  assertCoordinatorRecoverySession: vi.fn(),
}))
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { compileAnalysisFollowupDescriptor } from './quality-journey-analysis-followup'
import { listQualityJourneyWakeWork } from './quality-journey-wake-service'

const scope = {
  journeyId: 'journey',
  targetProjectId: 'project',
  coordinatorSessionId: 'session',
  coordinatorGeneration: 1,
  coordinatorPrincipalId: 'principal',
}
function fixture() {
  const descriptor = compileAnalysisFollowupDescriptor({
    schemaVersion: 'appraise.analysis-followup-descriptor/v1',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'cycle',
    workItemId: 'work',
    predecessor: {
      revisionId: 'A',
      artifact: {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: 'charter',
        revisionId: 'A',
        contentHash: hashCanonical('A'),
      },
      attemptId: 'attempt-1',
      authorizationId: 'auth-1',
      inputHash: hashCanonical('initial'),
    },
    requirement: {
      kind: 'JOURNEY_REVISION',
      artifactId: 'requirement',
      revisionId: 'requirement',
      contentHash: hashCanonical('requirement'),
    },
    questions: [],
    feedback: null,
    cause: { eventId: 'human-event', sequence: 4 },
    advisoryInputRefs: [],
    advisoryDigest: hashCanonical([]),
    roleContractDigest: hashCanonical('role'),
  })
  const issuance = {
    schemaVersion: 'appraise.analysis-followup-issuance/v1',
    descriptor: descriptor.descriptor,
    inputHash: descriptor.inputHash,
    causeHash: descriptor.causeHash,
    workItemId: 'work',
    authorizationId: 'auth-2',
    issuedWorkItemVersion: 7,
  }
  const item = {
    id: 'work',
    cycleId: 'cycle',
    inputHash: descriptor.inputHash,
    roleContractDigest: hashCanonical('role'),
    status: 'ELIGIBLE',
    version: 7,
    currentAttempt: 1,
    authorizations: [{ id: 'auth-2', maxAttempts: 3, revokedAt: null, cancelledAt: null }],
    attempts: [] as Record<string, unknown>[],
  }
  const tx = {
    qualityJourneyEvent: {
      findFirst: vi.fn().mockResolvedValue({ sequence: 8 }),
      findMany: vi.fn().mockResolvedValue([{ payloadJson: JSON.stringify(issuance) }]),
    },
    qualityJourneyWorkAttempt: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(1) },
    qualityJourneyWorkItem: { findMany: vi.fn().mockResolvedValue([item]) },
    qualityJourneyProviderDispatchIntent: { findMany: vi.fn().mockResolvedValue([]) },
    qualityJourneyWakeIntent: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return {
    descriptor,
    issuance,
    item,
    tx,
    client: { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as PrismaClient,
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  authority.current.mockResolvedValue({
    journey: {
      id: 'journey',
      targetProjectId: 'project',
      hostingMode: 'APP_SERVER_LOCAL_V1',
      status: 'ACTIVE',
      stage: 'ANALYSIS',
      activeCycleId: 'cycle',
      unresolvedQuestionIdsJson: '[]',
      blockerIdsJson: '[]',
    },
    session: { id: 'session' },
  })
})
describe('canonical Analysis wake hints', () => {
  it('finds exact eligible work after every notification was already acknowledged', async () => {
    const f = fixture()
    const result = await listQualityJourneyWakeWork(scope, f.client)
    expect(result.pending).toEqual([])
    expect(result.analysisFollowups).toEqual([
      {
        expected: {
          workItemId: 'work',
          cycleId: 'cycle',
          version: 7,
          inputHash: f.descriptor.inputHash,
          authorizationId: 'auth-2',
          causeHash: f.descriptor.causeHash,
        },
        workStatus: 'ELIGIBLE',
        observedWorkItemVersion: 7,
        attemptId: null,
        phase: 'ELIGIBLE',
      },
    ])
  })
  it('keeps issued version stable while exposing the observed claimed version separately', async () => {
    const f = fixture()
    f.item.status = 'WORKER_REQUESTED'
    f.item.version = 8
    f.item.currentAttempt = 2
    f.item.attempts.push({
      id: 'attempt-2',
      attempt: 2,
      authorizationId: 'auth-2',
      executionMode: 'EXTERNAL_V1',
      externalPrincipalId: 'principal',
      leaseExpiresAt: new Date(Date.now() + 60_000),
      cancelledAt: null,
    })
    expect((await listQualityJourneyWakeWork(scope, f.client)).analysisFollowups[0]).toMatchObject({
      expected: { version: 7 },
      observedWorkItemVersion: 8,
      phase: 'CLAIMED',
      attemptId: 'attempt-2',
    })
  })
  it('reports lifetime-exhausted eligible work as authority blocked without a dispatch hint', async () => {
    const f = fixture()
    f.item.currentAttempt = 3
    f.tx.qualityJourneyWorkAttempt.count.mockResolvedValue(3)
    const result = await listQualityJourneyWakeWork(scope, f.client)
    expect(result.analysisFollowups).toEqual([])
    expect(result.analysisFollowupBlocks).toEqual([{ workItemId: 'work', reason: 'AUTHORITY_BLOCKED' }])
  })

  it('does not reinterpret unrecorded legacy/initial work as a follow-up', async () => {
    const f = fixture()
    f.tx.qualityJourneyEvent.findMany.mockResolvedValue([])
    expect((await listQualityJourneyWakeWork(scope, f.client)).analysisFollowups).toEqual([])
  })
  it('refuses duplicate authorization issuance instead of selecting a newest event', async () => {
    const f = fixture()
    f.tx.qualityJourneyEvent.findMany.mockResolvedValue([
      { payloadJson: JSON.stringify(f.issuance) },
      { payloadJson: JSON.stringify(f.issuance) },
    ])
    await expect(listQualityJourneyWakeWork(scope, f.client)).rejects.toThrow(/requires recovery/)
  })
  it.each(['missing', 'duplicate', 'revoked', 'cancelled'])(
    'fences %s authorization before budget or attempt reads',
    async kind => {
      const f = fixture()
      if (kind === 'missing') f.item.authorizations = []
      else if (kind === 'duplicate') f.item.authorizations.push({ ...f.item.authorizations[0]! })
      else
        Object.assign(
          f.item.authorizations[0]!,
          kind === 'revoked' ? { revokedAt: new Date() } : { cancelledAt: new Date() },
        )
      expect((await listQualityJourneyWakeWork(scope, f.client)).analysisFollowups).toEqual([])
      expect(f.tx.qualityJourneyWorkAttempt.count).not.toHaveBeenCalled()
      expect(authority.attempt).not.toHaveBeenCalled()
    },
  )
  it.each(['input', 'cycle', 'role'])('refuses a stale %s binding before attempt-session authority', async kind => {
    const f = fixture()
    if (kind === 'input') f.item.inputHash = hashCanonical('stale')
    else if (kind === 'cycle') f.item.cycleId = 'stale'
    else f.item.roleContractDigest = hashCanonical('stale')
    if (kind === 'cycle') {
      const current = await authority.current()
      current.journey.activeCycleId = 'stale'
      authority.current.mockResolvedValue(current)
    }
    expect((await listQualityJourneyWakeWork(scope, f.client)).analysisFollowups).toEqual([])
    expect(authority.attempt).not.toHaveBeenCalled()
  })
  it('returns no work hints during an unresolved human wait', async () => {
    const f = fixture()
    const current = await authority.current()
    current.journey.unresolvedQuestionIdsJson = '["q"]'
    authority.current.mockResolvedValue(current)
    expect((await listQualityJourneyWakeWork(scope, f.client)).analysisFollowups).toEqual([])
    expect(f.tx.qualityJourneyWorkItem.findMany).not.toHaveBeenCalled()
  })
})
