import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { ServiceError } from '@/services/shared/errors'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'
import {
  getAppManagedAutomatorManualRecovery,
  observePendingManualAutomationRecovery,
  prepareAppManagedManualAutomationTask,
  requestAppManagedAutomatorManualRecovery,
} from './app-managed-automation-manual-recovery'

const mocks = vi.hoisted(() => ({
  readJourney: vi.fn(),
  assertCurrent: vi.fn(),
  assertRecovery: vi.fn(),
  assertAttempt: vi.fn(),
  beforeWrite: vi.fn(),
  readiness: vi.fn(),
  claim: vi.fn(),
  admit: vi.fn(),
  delivery: vi.fn(),
}))
vi.mock('./quality-journey-coordinator-session', () => ({
  readScopedQualityJourney: mocks.readJourney,
  assertCurrentCoordinatorSession: mocks.assertCurrent,
  assertCoordinatorRecoverySession: mocks.assertRecovery,
  assertCoordinatorAttemptSession: mocks.assertAttempt,
}))
vi.mock('./quality-journey-business-write-join', () => ({
  withJourneyBusinessWriteJoinInTransaction: (
    _tx: unknown,
    _owner: unknown,
    _scope: unknown,
    callback: (before: unknown) => unknown,
  ) => callback(mocks.beforeWrite),
  assertJourneyBusinessGroupSupportsNoInvalidationInTransaction: vi.fn(),
}))
vi.mock('./quality-journey-automation-service', () => ({ readInternalAutomatorAssignment: mocks.readiness }))
vi.mock('./quality-journey-service', () => ({
  claimExternalQualityJourneyWork: mocks.claim,
  admitExternalQualityJourneyWork: mocks.admit,
}))
vi.mock('./quality-journey-managed-role-delivery', () => ({ createManagedQualityJourneyRoleDelivery: mocks.delivery }))
vi.mock('./app-managed-analysis-credential', () => ({
  appManagedAnalysisCredential: vi.fn().mockResolvedValue('private-secret'),
}))

function fixture() {
  const scope = { journeyId: 'journey', targetProjectId: 'project' }
  const failure = {
    state: 'UNKNOWN',
    stage: 'NATIVE_SEND',
    senderCleanupVerified: false,
    canonicalSubmissionStarted: false,
    recoveryEligible: false,
    detail: 'cleanup unverified; private root retained',
  }
  const journey = {
    id: scope.journeyId,
    ...scope,
    hostingMode: 'APP_SERVER_LOCAL_V1',
    status: 'ACTIVE',
    stage: 'AUTOMATION',
    activeCycleId: 'cycle',
    activeWorkItemIdsJson: '["item"]',
    currentCoordinatorSessionId: 'session',
    stateHash: 'state',
    blockerIdsJson: '[]',
    unresolvedQuestionIdsJson: '[]',
  }
  const attempt = {
    id: 'original',
    workItemId: 'item',
    attempt: 1,
    status: 'IN_PROGRESS',
    executionMode: 'EXTERNAL_V1',
    externalPrincipalId: 'appraise-local:project',
    externalPrincipalAssurance: 'PROJECT_CREDENTIAL_ONLY',
    leaseExpiresAt: new Date(Date.now() - 1000),
    assignmentId: 'assignment',
    authorizationId: 'authorization',
    dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_AUTOMATOR',
    dispatchReservedAt: new Date(1000),
    dispatchStartedAt: new Date(1000),
    failureJson: canonicalContractJson(failure),
    resultJson: null,
    resultHash: null,
    spawnRequestJson: null,
    spawnReceiptJson: null,
    dispatchKey: null,
    workItem: {
      id: 'item',
      ...scope,
      cycleId: 'cycle',
      role: 'AUTOMATOR',
      currentAttempt: 1,
      status: 'IN_PROGRESS',
      version: 1,
    },
  }
  const authorization = { id: 'authorization', maxAttempts: 3, revokedAt: null, cancelledAt: null }
  const client = {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(client)),
    qualityJourneyCoordinatorSession: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: 'session', generation: 1, ownerPrincipalId: 'appraise-local:project' }),
    },
    qualityJourneyWorkAttempt: {
      findMany: vi.fn().mockResolvedValue([attempt]),
      findUnique: vi.fn().mockResolvedValue(attempt),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(1),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    qualityJourneyWorkAuthorization: { findFirst: vi.fn().mockResolvedValue(authorization) },
    qualityJourneyWorkItem: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    qualityJourneyExternalSubmissionAcceptance: { count: vi.fn().mockResolvedValue(0) },
    qualityJourneyAutomationMaterialization: { count: vi.fn().mockResolvedValue(0) },
    qualityJourneyProviderRun: { count: vi.fn().mockResolvedValue(0), findFirst: vi.fn().mockResolvedValue(null) },
    qualityJourneyEvent: {
      count: vi.fn().mockResolvedValue(3),
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  }
  mocks.readJourney.mockResolvedValue(journey)
  const input = {
    ...scope,
    expectedStateHash: 'state',
    attemptId: attempt.id,
    expectedFailureHash: hashCanonical(failure),
  }
  return { scope, input, failure, journey, attempt, authorization, client, db: client as unknown as PrismaClient }
}
beforeEach(() => {
  vi.clearAllMocks()
})

describe('manual Automator recovery retains uncertain native effects', () => {
  it('fences only expired authority, preserves failure and dispatch markers, and archives exact evidence', async () => {
    const f = fixture()
    const result = await requestAppManagedAutomatorManualRecovery(f.input, f.db)
    expect(result).toMatchObject({ predecessorAttemptId: 'original', successorAttempt: 2, nativeSend: false })
    const data = f.client.qualityJourneyWorkAttempt.updateMany.mock.calls[0][0].data
    expect(data).toMatchObject({ status: 'CANCELLED', cancelledBy: 'appraise-local:project' })
    expect(data).not.toHaveProperty('failureJson')
    expect(data).not.toHaveProperty('dispatchReservedAt')
    expect(data).not.toHaveProperty('dispatchStartedAt')
    const payload = JSON.parse(f.client.qualityJourneyEvent.create.mock.calls[0][0].data.payloadJson)
    expect(payload).toMatchObject({
      cycleId: 'cycle',
      workItemId: 'item',
      predecessorAttemptId: 'original',
      predecessorAssignmentId: 'assignment',
      authorizationId: 'authorization',
      successorAttempt: 2,
      failureJson: f.attempt.failureJson,
      failureHash: f.input.expectedFailureHash,
      nativeOutcome: 'UNKNOWN',
      senderCleanupVerified: false,
      nativeSend: false,
    })
    expect(mocks.beforeWrite).toHaveBeenCalledOnce()
    expect(mocks.claim).not.toHaveBeenCalled()
    // Logical cancellation must continue to prevent native hub reuse.
    f.attempt.status = 'CANCELLED'
    await expect(assertHistoricalHubQuiescent(f.db as never)).rejects.toThrow('Historical provider dispatch')
  })

  it.each([
    [
      'live lease',
      (f: ReturnType<typeof fixture>) => {
        f.attempt.leaseExpiresAt = new Date(Date.now() + 60000)
      },
    ],
    [
      'wrong stage',
      (f: ReturnType<typeof fixture>) => {
        f.journey.stage = 'SCENARIO_DESIGN'
      },
    ],
    [
      'changed state',
      (f: ReturnType<typeof fixture>) => {
        f.input.expectedStateHash = 'stale'
      },
    ],
    [
      'changed failure',
      (f: ReturnType<typeof fixture>) => {
        f.input.expectedFailureHash = 'stale'
      },
    ],
    [
      'another principal',
      (f: ReturnType<typeof fixture>) => {
        f.attempt.externalPrincipalId = 'another'
      },
    ],
    [
      'superseded attempt',
      (f: ReturnType<typeof fixture>) => {
        f.attempt.workItem.currentAttempt = 2
      },
    ],
    [
      'accepted result',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.attempt, { resultJson: '{}' })
      },
    ],
    [
      'provider run',
      (f: ReturnType<typeof fixture>) => {
        f.client.qualityJourneyProviderRun.count.mockResolvedValue(1)
      },
    ],
    [
      'accepted submission',
      (f: ReturnType<typeof fixture>) => {
        f.client.qualityJourneyExternalSubmissionAcceptance.count.mockResolvedValue(1)
      },
    ],
    [
      'materialization',
      (f: ReturnType<typeof fixture>) => {
        f.client.qualityJourneyAutomationMaterialization.count.mockResolvedValue(1)
      },
    ],
    [
      'exhausted budget',
      (f: ReturnType<typeof fixture>) => {
        f.authorization.maxAttempts = 1
      },
    ],
    [
      'revoked authority',
      (f: ReturnType<typeof fixture>) => {
        Object.assign(f.authorization, { revokedAt: new Date() })
      },
    ],
    [
      'retained proposal',
      (f: ReturnType<typeof fixture>) => {
        f.attempt.failureJson = canonicalContractJson({ ...f.failure, candidate: {} })
      },
    ],
    [
      'verified cleanup',
      (f: ReturnType<typeof fixture>) => {
        f.attempt.failureJson = canonicalContractJson({ ...f.failure, senderCleanupVerified: true })
      },
    ],
  ])('rejects %s before mutation', async (_name, mutate) => {
    const f = fixture()
    mutate(f)
    await expect(requestAppManagedAutomatorManualRecovery(f.input, f.db)).rejects.toThrow()
    expect(mocks.beforeWrite).not.toHaveBeenCalled()
    expect(f.client.qualityJourneyWorkAttempt.updateMany).not.toHaveBeenCalled()
    expect(f.client.qualityJourneyEvent.create).not.toHaveBeenCalled()
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it('rejects stale coordinator authority and frozen input drift', async () => {
    const f = fixture()
    mocks.assertCurrent.mockRejectedValueOnce(new ServiceError('stale coordinator', 'UNAUTHORIZED'))
    await expect(requestAppManagedAutomatorManualRecovery(f.input, f.db)).rejects.toThrow('stale coordinator')
    mocks.readiness.mockRejectedValueOnce(new ServiceError('frozen input drift', 'CONFLICT'))
    await expect(requestAppManagedAutomatorManualRecovery(f.input, f.db)).rejects.toThrow('frozen input drift')
    expect(mocks.beforeWrite).not.toHaveBeenCalled()
  })

  it('keeps a stopped validation attempt fenced and only offers manual preparation within the original budget', async () => {
    const f = fixture()
    const failure = {
      ...f.failure,
      stage: 'OUTPUT_VALIDATION',
      reason: 'OUTPUT_VALIDATION_DID_NOT_COMPLETE',
      senderCleanupVerified: true,
    }
    f.attempt.failureJson = canonicalContractJson(failure)
    f.input.expectedFailureHash = hashCanonical(failure)
    f.attempt.leaseExpiresAt = new Date(Date.now() + 60_000)
    const observation = { ...f.scope, includeWaiting: true }
    expect(await getAppManagedAutomatorManualRecovery(observation, f.db)).toMatchObject({
      availableAt: f.attempt.leaseExpiresAt.toISOString(),
      senderCleanupVerified: true,
    })
    await expect(requestAppManagedAutomatorManualRecovery(f.input, f.db)).rejects.toThrow('expired')
    f.authorization.maxAttempts = 1
    expect(await getAppManagedAutomatorManualRecovery(observation, f.db)).toBeNull()
    f.authorization.maxAttempts = 3
    f.attempt.failureJson = canonicalContractJson({ ...failure, canonicalRecoveryCall: {} })
    expect(await getAppManagedAutomatorManualRecovery(observation, f.db)).toBeNull()
    f.attempt.failureJson = canonicalContractJson(failure)
    f.attempt.leaseExpiresAt = new Date(1)
    await expect(requestAppManagedAutomatorManualRecovery(f.input, f.db)).resolves.toMatchObject({ nativeSend: false })
    const event = JSON.parse(f.client.qualityJourneyEvent.create.mock.calls[0][0].data.payloadJson)
    expect(event).toMatchObject({ failureJson: f.attempt.failureJson, senderCleanupVerified: true, nativeSend: false })
  })

  it('does not offer recovery before expiry or after canonical acceptance', async () => {
    const f = fixture()
    expect(await getAppManagedAutomatorManualRecovery(f.scope, f.db)).toMatchObject({
      attemptId: 'original',
      failureHash: f.input.expectedFailureHash,
    })
    f.attempt.leaseExpiresAt = new Date(Date.now() + 10000)
    expect(await getAppManagedAutomatorManualRecovery(f.scope, f.db)).toBeNull()
    f.attempt.leaseExpiresAt = new Date(0)
    f.client.qualityJourneyExternalSubmissionAcceptance.count.mockResolvedValue(1)
    expect(await getAppManagedAutomatorManualRecovery(f.scope, f.db)).toBeNull()
  })

  it('requires an issued exact event before any successor claim', async () => {
    const f = fixture()
    await expect(
      prepareAppManagedManualAutomationTask({ ...f.scope, recoveryEventId: 'invented' }, f.db),
    ).rejects.toThrow('no exact issued recovery')
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it('observes a pending successor after refresh without issuing more authority', async () => {
    const f = fixture()
    await requestAppManagedAutomatorManualRecovery(f.input, f.db)
    const event = f.client.qualityJourneyEvent.create.mock.calls[0][0].data
    f.attempt.status = 'CANCELLED'
    f.attempt.workItem.status = 'REPLACEMENT_REQUESTED'
    f.client.qualityJourneyEvent.findMany.mockResolvedValue([event])
    expect(await observePendingManualAutomationRecovery(f.scope, f.db)).toMatchObject({
      eventId: event.id,
      predecessorAttemptId: 'original',
      successorAttempt: 2,
    })
    expect(mocks.claim).not.toHaveBeenCalled()
    const successor = {
      id: 'successor',
      attempt: 2,
      assignmentId: 'distinct-assignment',
      replacesAttemptId: 'original',
      status: 'IN_PROGRESS',
      leaseExpiresAt: new Date(Date.now() + 10000),
      dispatchReservedAt: null,
      dispatchStartedAt: null,
    }
    f.attempt.workItem.currentAttempt = 2
    f.attempt.workItem.status = 'IN_PROGRESS'
    f.client.qualityJourneyWorkAttempt.findFirst.mockResolvedValue(successor as never)
    expect(await observePendingManualAutomationRecovery(f.scope, f.db)).toMatchObject({
      successorAttemptId: 'successor',
      successorAssignmentId: 'distinct-assignment',
    })
    successor.dispatchStartedAt = new Date() as never
    expect(await observePendingManualAutomationRecovery(f.scope, f.db)).toBeNull()
  })
})
