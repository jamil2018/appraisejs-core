import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  admit: vi.fn(),
  compile: vi.fn(),
  outcome: vi.fn(),
  session: vi.fn(),
  historical: vi.fn(),
  physical: vi.fn(),
  delivery: vi.fn(),
  start: vi.fn(),
}))
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./quality-journey-service', () => ({
  claimExternalQualityJourneyAnalysisFollowup: mocks.claim,
  admitExternalQualityJourneyWork: mocks.admit,
  ensureQualityJourneyAnalysisFollowupInTransaction: mocks.compile,
  readExternalQualityJourneySubmissionOutcome: mocks.outcome,
}))
vi.mock('./quality-journey-coordinator-session', () => ({ assertCurrentCoordinatorSession: mocks.session }))
vi.mock('./quality-journey-provider-recovery', () => ({
  assertHistoricalHubQuiescent: mocks.historical,
  assertProviderReplacementSafe: mocks.physical,
}))
vi.mock('./quality-journey-analysis-delivery', () => ({ createQualityJourneyAnalysisFixtureDelivery: mocks.delivery }))
import {
  advanceQualityJourneyAnalysisFollowup,
  analysisFollowupOperationKeys,
  type AnalysisFollowupSchedulerInput,
} from './quality-journey-analysis-scheduler'

const input = (): AnalysisFollowupSchedulerInput => ({
  journeyId: 'journey',
  targetProjectId: 'project',
  coordinatorSessionId: 'session',
  coordinatorGeneration: 1,
  coordinatorPrincipalId: 'project-principal',
  principal: { principalId: 'project-principal', assurance: 'PROJECT_CREDENTIAL_ONLY' },
  assignmentSecret: 'original-secret-01234567890123456789',
  expected: {
    workItemId: 'work',
    cycleId: 'cycle',
    version: 2,
    inputHash: hashCanonical('input'),
    authorizationId: 'authorization',
    causeHash: hashCanonical('cause'),
  },
  fixture: { fixturePath: '/never-executed/mock-fixture.mjs' },
})
function fixture(receipt = false, status = 'WORKER_REQUESTED') {
  const tx = { qualityJourneyProviderSlot: { findUnique: vi.fn().mockResolvedValue(null) } }
  const client = {
    $transaction: async (cb: (tx: unknown) => unknown) => cb(tx),
    qualityJourneyExternalWorkClaimReceipt: { findUnique: vi.fn().mockResolvedValue(receipt ? {} : null) },
    qualityJourneyProviderRun: { findUnique: vi.fn().mockResolvedValue(null) },
    qualityJourneyProviderDispatchIntent: { findUnique: vi.fn() },
  }
  mocks.claim.mockResolvedValue({
    workItem: { id: 'work' },
    attempt: {
      id: 'attempt',
      status,
      externalAdmissionId: status === 'IN_PROGRESS' ? 'admission' : null,
      leaseId: 'lease',
      leaseExpiresAt: new Date(Date.now() + 60_000),
    },
    assignment: { assignmentId: 'assignment' },
    assignmentGeneration: 1,
  })
  return { tx, client, db: client as unknown as PrismaClient }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({
    journey: { hostingMode: 'APP_SERVER_LOCAL_V1', status: 'ACTIVE' },
    session: { id: 'session' },
  })
  mocks.compile.mockResolvedValue({ status: 'ISSUED', expected: input().expected })
  mocks.outcome.mockRejectedValue(new ServiceError('No durable outcome.', 'NOT_FOUND'))
  mocks.delivery.mockResolvedValue({ start: mocks.start })
  mocks.start.mockResolvedValue({ status: 'ACCEPTED' })
})
describe('bounded Analysis scheduler (mocked authority and delivery)', () => {
  it('uses stable keys across restarts while changing session/cause changes keys', () => {
    expect(analysisFollowupOperationKeys(input())).toEqual(analysisFollowupOperationKeys(structuredClone(input())))
    expect(analysisFollowupOperationKeys({ ...input(), coordinatorGeneration: 2 })).not.toEqual(
      analysisFollowupOperationKeys(input()),
    )
  })
  it.each(['', 'a'.repeat(31), 'a'.repeat(2001)])(
    'does not recover or replace an invalid original secret',
    async secret => {
      const f = fixture()
      const request = input()
      request.assignmentSecret = secret
      expect(await advanceQualityJourneyAnalysisFollowup(request, f.db)).toMatchObject({
        phase: 'RECOVERY_REQUIRED',
        reason: 'ORIGINAL_ASSIGNMENT_CREDENTIAL_REQUIRED',
      })
      expect(f.client.qualityJourneyExternalWorkClaimReceipt.findUnique).not.toHaveBeenCalled()
      expect(mocks.claim).not.toHaveBeenCalled()
    },
  )
  it('refuses a different current project principal before any receipt or attempt read', async () => {
    const f = fixture(),
      request = input()
    request.principal.principalId = 'other-principal'
    expect(await advanceQualityJourneyAnalysisFollowup(request, f.db)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      reason: 'CURRENT_PROJECT_PRINCIPAL_REQUIRED',
    })
    expect(f.client.qualityJourneyExternalWorkClaimReceipt.findUnique).not.toHaveBeenCalled()
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it.each(['WAITING_FOR_HUMAN', 'AUTHORITY_BLOCKED', 'OBSERVED'])(
    'creates no claim/run when compiler says %s',
    async status => {
      const f = fixture()
      mocks.compile.mockResolvedValue({ status, expected: null })
      expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
        phase: 'WAITING',
        reason: status,
      })
      expect(mocks.claim).not.toHaveBeenCalled()
      expect(mocks.delivery).not.toHaveBeenCalled()
    },
  )
  it('creates no attempt while a foreign hub slot is occupied', async () => {
    const f = fixture()
    f.tx.qualityJourneyProviderSlot.findUnique.mockResolvedValue({ intentId: 'foreign-intent' })
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'WAITING',
      reason: 'PHYSICAL_RECONCILIATION_REQUIRED',
    })
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
  it('parks stale expected identity before a claim', async () => {
    const f = fixture()
    mocks.compile.mockResolvedValue({ status: 'ISSUED', expected: { ...input().expected, version: 9 } })
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      reason: 'STALE_EXPECTED_WORK',
    })
    expect(mocks.claim).not.toHaveBeenCalled()
  })
  it('does exactly the claim step and returns without admitting or launching', async () => {
    const f = fixture()
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'CLAIMED',
      attemptId: 'attempt',
    })
    expect(mocks.claim).toHaveBeenCalledTimes(1)
    expect(mocks.admit).not.toHaveBeenCalled()
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
  it('replays the original claim credential before admitting the same assignment', async () => {
    const f = fixture(true)
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'ADMITTED',
      attemptId: 'attempt',
    })
    expect(mocks.claim.mock.calls[0]![0].assignmentSecret).toBe(input().assignmentSecret)
    expect(mocks.admit).toHaveBeenCalledTimes(1)
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
  it('observes a durable accepted outcome without touching occupied physical ownership', async () => {
    const f = fixture(true, 'COMPLETED')
    mocks.outcome.mockResolvedValue({ outcome: { accepted: true } })
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'OBSERVED',
      reason: 'CANONICAL_ACCEPTANCE_REPLAY',
    })
    expect(mocks.compile).not.toHaveBeenCalled()
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
  it('parks an armed run without reconstructing a permit', async () => {
    const f = fixture(true, 'IN_PROGRESS')
    f.client.qualityJourneyProviderRun.findUnique.mockResolvedValue({ id: 'run', status: 'UNKNOWN' })
    f.client.qualityJourneyProviderDispatchIntent.findUnique.mockResolvedValue({ sendBoundaryId: 'consumed' })
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      reason: 'ARMED_OR_AMBIGUOUS_PROVIDER_RUN',
    })
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
  it('captures the exact real factory result in a preowned cell before start without cloning the observer', async () => {
    const f = fixture(true, 'IN_PROGRESS')
    const actualDelivery = { start: mocks.start }
    mocks.delivery.mockResolvedValue(actualDelivery)
    const cell: { actual: unknown } = { actual: undefined }
    mocks.start.mockImplementation(async () => {
      expect(cell.actual).toBe(actualDelivery)
      return { status: 'ACCEPTED' }
    })
    const observer = {
      retainDelivery(delivery: unknown) {
        cell.actual = delivery
      },
    }
    expect((await advanceQualityJourneyAnalysisFollowup(input(), f.db, observer)).phase).toBe('DELIVERY')
    expect(cell.actual).toBe(actualDelivery)
    expect(mocks.delivery).toHaveBeenCalledTimes(1)
  })
  it('retains the actual delivery when observation throws and invokes neither start nor retry', async () => {
    const f = fixture(true, 'IN_PROGRESS')
    const actualDelivery = { start: mocks.start }
    mocks.delivery.mockResolvedValue(actualDelivery)
    const cell: { actual: unknown } = { actual: undefined }
    const observer = {
      retainDelivery(delivery: unknown) {
        cell.actual = delivery
        throw new Error('inert observer failure')
      },
    }
    await expect(advanceQualityJourneyAnalysisFollowup(input(), f.db, observer)).rejects.toThrow('observer failure')
    expect(cell.actual).toBe(actualDelivery)
    expect(mocks.delivery).toHaveBeenCalledTimes(1)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it('hands an admitted exact assignment to the existing fixture adapter', async () => {
    const f = fixture(true, 'IN_PROGRESS')
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'DELIVERY',
      result: { status: 'ACCEPTED' },
      runtimeQualified: false,
    })
    expect(mocks.delivery.mock.calls[0]![0]).toMatchObject({
      attemptId: 'attempt',
      assignmentSecret: input().assignmentSecret,
      idempotencyKey: analysisFollowupOperationKeys(input()).prepare,
    })
    expect(mocks.start).toHaveBeenCalledTimes(1)
  })
})

describe('actual prepared-run classification before fixture construction', () => {
  const prepared = () => ({
    id: 'run',
    status: 'PREPARED',
    terminalReconciledAt: null,
    unresolvedRetentionAt: new Date(Date.now() + 60_000),
  })
  const pending = () => ({
    status: 'PENDING',
    claimExpiresAt: null,
    sendBoundaryId: null,
    armedAt: null,
    reconciledAt: null,
    invalidatedAt: null,
  })
  it.each([
    'missing-intent',
    'run-status',
    'terminal',
    'expired-retention',
    'send-boundary',
    'armed',
    'reconciled',
    'invalidated',
  ])('parks %s without factory/start', async marker => {
    const f = fixture(true, 'IN_PROGRESS'),
      run = prepared(),
      intent = pending()
    if (marker === 'run-status') run.status = 'UNKNOWN'
    if (marker === 'terminal') Object.assign(run, { terminalReconciledAt: new Date() })
    if (marker === 'expired-retention') run.unresolvedRetentionAt = new Date(0)
    if (marker === 'send-boundary') Object.assign(intent, { sendBoundaryId: 'boundary' })
    if (marker === 'armed') Object.assign(intent, { armedAt: new Date() })
    if (marker === 'reconciled') Object.assign(intent, { reconciledAt: new Date() })
    if (marker === 'invalidated') Object.assign(intent, { invalidatedAt: new Date() })
    f.client.qualityJourneyProviderRun.findUnique.mockResolvedValue(run)
    f.client.qualityJourneyProviderDispatchIntent.findUnique.mockResolvedValue(
      marker === 'missing-intent' ? null : intent,
    )
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      reason: 'ARMED_OR_AMBIGUOUS_PROVIDER_RUN',
    })
    expect(mocks.delivery).not.toHaveBeenCalled()
    expect(mocks.start).not.toHaveBeenCalled()
  })
  it('allows the same unarmed preparation and parks its original active claim', async () => {
    const f = fixture(true, 'IN_PROGRESS')
    f.client.qualityJourneyProviderRun.findUnique.mockResolvedValue(prepared())
    f.client.qualityJourneyProviderDispatchIntent.findUnique.mockResolvedValue(pending())
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({ phase: 'DELIVERY' })
    mocks.delivery.mockClear()
    mocks.start.mockClear()
    f.client.qualityJourneyProviderDispatchIntent.findUnique.mockResolvedValue({
      ...pending(),
      status: 'CLAIMED',
      claimExpiresAt: new Date(Date.now() + 60_000),
    })
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'WAITING',
      reason: 'ORIGINAL_INTENT_CLAIM_ACTIVE',
    })
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
})

describe('offline scheduler conflict diagnostics', () => {
  it.each([
    ['Expected Analysis follow-up work identity is stale.', 'M06_CONFLICT_69725F5B92D7C8F4'],
    ['Analysis charter does not trace supplied intake fields: objective.', 'M06_CONFLICT_TRACEABILITY_FIELDS'],
    ['Analysis charter does not trace supplied intake fields: context, objective.', 'M06_CONFLICT_UNCLASSIFIED'],
    ['PRIVATE-PAYLOAD work item identity conflicts with frozen authority.', 'M06_CONFLICT_SPECIALIZED_IDENTITY'],
    ['Quality Journey worker dispatch was blocked: PRIVATE-PAYLOAD', 'M06_CONFLICT_WORKER_DISPATCH_BLOCKED'],
    ['Quality Journey worker result is invalid: PRIVATE-PAYLOAD', 'M06_CONFLICT_WORKER_RESULT_INVALID'],
    [
      'Quality Journey worker dispatch was blocked: PRIVATE-PAYLOAD work item identity conflicts with frozen authority.',
      'M06_CONFLICT_AMBIGUOUS_SPECIALIZED_WORKER',
    ],
    [
      'Quality Journey worker result is invalid: PRIVATE-PAYLOAD work item identity conflicts with frozen authority.',
      'M06_CONFLICT_AMBIGUOUS_SPECIALIZED_WORKER',
    ],
    ['PRIVATE-PAYLOAD unknown conflict', 'M06_CONFLICT_UNCLASSIFIED'],
  ])('preserves the conflict recovery and exposes only its fixed class for %s', async (message, classification) => {
    const f = fixture()
    mocks.claim.mockRejectedValue(new ServiceError(message, 'CONFLICT'))
    const result = await advanceQualityJourneyAnalysisFollowup(input(), f.db)
    expect(result).toEqual({
      phase: 'RECOVERY_REQUIRED',
      reason: 'CONFLICT',
      expected: input().expected,
      runtimeQualified: false,
      fixtureConflictClass: classification,
    })
    expect(JSON.stringify(result)).not.toContain('PRIVATE-PAYLOAD')
    expect(f.client.qualityJourneyExternalWorkClaimReceipt.findUnique).toHaveBeenCalledTimes(1)
    expect(mocks.claim).toHaveBeenCalledTimes(1)
    expect(mocks.admit).not.toHaveBeenCalled()
    expect(mocks.delivery).not.toHaveBeenCalled()
  })
  it('does not invoke an accessor message while classifying a conflict', async () => {
    const f = fixture()
    const error = new ServiceError('Unobserved message.', 'CONFLICT')
    let getterCalls = 0
    Object.defineProperty(error, 'message', {
      get() {
        getterCalls += 1
        throw new Error('Message getter invoked.')
      },
    })
    mocks.claim.mockRejectedValue(error)
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toMatchObject({
      phase: 'RECOVERY_REQUIRED',
      reason: 'CONFLICT',
      fixtureConflictClass: 'M06_CONFLICT_UNCLASSIFIED',
    })
    expect(getterCalls).toBe(0)
  })
  it.each(['UNAUTHORIZED', 'NOT_FOUND'] as const)('preserves %s recovery without a conflict field', async code => {
    const f = fixture()
    mocks.claim.mockRejectedValue(new ServiceError('PRIVATE-PAYLOAD', code))
    expect(await advanceQualityJourneyAnalysisFollowup(input(), f.db)).toEqual({
      phase: 'RECOVERY_REQUIRED',
      reason: code,
      expected: input().expected,
      runtimeQualified: false,
    })
  })
  it('rethrows the exact unexpected error', async () => {
    const f = fixture()
    const error = new Error('Unexpected offline failure.')
    mocks.claim.mockRejectedValue(error)
    await expect(advanceQualityJourneyAnalysisFollowup(input(), f.db)).rejects.toBe(error)
  })
})
