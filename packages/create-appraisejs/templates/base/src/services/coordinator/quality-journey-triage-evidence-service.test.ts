import { createHash } from 'node:crypto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { hashRuntimeCapsuleBytes, hashRuntimeCapsuleValue } from '@/lib/runtime-capsule'

const mocks = vi.hoisted(() => ({
  assignmentFindFirst: vi.fn(),
  journeyFindFirst: vi.fn(),
  receiptFindFirst: vi.fn(),
  readBytes: vi.fn(),
}))

vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mocks.readBytes
  },
}))

import { readQualityJourneyTriageEvidence } from './quality-journey-triage-evidence-service'

const bytes = Buffer.from('sealed triage report')
const capsuleHash = hashRuntimeCapsuleValue({ capsule: 'triage-1' })
const manifestHash = hashRuntimeCapsuleValue({ manifest: 'triage-1' })
const ownerToken = 'owner-token'
const ownerTokenHash = createHash('sha256').update(ownerToken).digest('hex')

function receipt(artifacts = [{ kind: 'report', contentHash: hashRuntimeCapsuleBytes(bytes), size: bytes.length }]) {
  const evidence = {
    schemaVersion: 'appraise.quality-journey/v1',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    executionCycleId: 'execution-1',
    cycleId: 'cycle-1',
    preparedCapsuleId: 'prepared-1',
    preparedCapsulesHash: hashRuntimeCapsuleValue({ prepared: '1' }),
    testRunId: 'test-run-1',
    runId: 'run-1',
    runtimeCapsuleId: 'capsule-1',
    runtimeCapsuleHash: capsuleHash,
    manifestHash,
    environmentSnapshotHash: hashRuntimeCapsuleValue({ environment: '1' }),
    status: 'COMPLETED',
    result: 'FAILED',
    evidenceHealth: 'valid',
    attemptId: null,
    artifacts,
    missingArtifacts: [],
  }
  return {
    id: 'receipt-1',
    testRunId: 'test-run-1',
    receiptHash: hashRuntimeCapsuleValue(evidence),
    evidenceJson: JSON.stringify(evidence),
    executionCycle: {
      id: 'execution-1',
      cycleId: 'cycle-1',
      testRuns: [
        {
          testRunId: 'test-run-1',
          runId: 'run-1',
          testRun: {
            id: 'test-run-1',
            targetProjectId: 'target-1',
            runtimeCapsule: { id: 'capsule-1', testRunId: 'test-run-1', capsuleHash, manifestHash },
          },
        },
      ],
    },
  }
}

function authority(overrides: Record<string, unknown> = {}) {
  const attempt = {
    id: 'attempt-1',
    attempt: 1,
    workItemId: 'work-1',
    leaseId: 'lease-1',
    ownerTokenHash,
    status: 'IN_PROGRESS',
    leaseExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
    spawnReceiptHash: hashRuntimeCapsuleValue({ receipt: '1' }),
    spawnReceiptJson: JSON.stringify({ receipt: '1' }),
    authorizationId: 'authorization-1',
    authorization: {
      id: 'authorization-1',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      workItemId: 'work-1',
      role: 'TRIAGER',
      revokedAt: null,
      cancelledAt: null,
    },
  }
  const item = {
    id: 'work-1',
    role: 'TRIAGER',
    status: 'IN_PROGRESS',
    currentAttempt: 1,
    attempts: [attempt],
  }
  return {
    journey: { id: 'journey-1', stage: 'TRIAGE', activeCycleId: 'cycle-1', activeWorkItemIdsJson: '["work-1"]' },
    assignment: {
      workItemId: 'work-1',
      inputJson: JSON.stringify({ cycleId: 'cycle-1', runs: [{ evidenceReceiptId: 'receipt-1' }] }),
      workItem: item,
    },
    ...overrides,
  }
}

function authorityWithAttempt(overrides: Record<string, unknown>) {
  const value = authority()
  return {
    ...value,
    assignment: {
      ...value.assignment,
      workItem: {
        ...value.assignment.workItem,
        ...('currentAttempt' in overrides ? { currentAttempt: overrides.currentAttempt } : {}),
        attempts: [{ ...value.assignment.workItem.attempts[0], ...overrides }],
      },
    },
  }
}

function client() {
  return {
    qualityJourney: { findFirst: mocks.journeyFindFirst },
    qualityJourneyTriageAssignment: { findFirst: mocks.assignmentFindFirst },
    qualityJourneyExecutionEvidenceReceipt: { findFirst: mocks.receiptFindFirst },
  } as never
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    workItemId: 'work-1',
    attemptId: 'attempt-1',
    leaseId: 'lease-1',
    ownerToken,
    receiptId: 'receipt-1',
    artifactKind: 'report',
    ...overrides,
  }
}

describe('readQualityJourneyTriageEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const valid = authority()
    mocks.journeyFindFirst.mockResolvedValue(valid.journey)
    mocks.assignmentFindFirst.mockResolvedValue(valid.assignment)
    mocks.receiptFindFirst.mockResolvedValue(receipt())
    mocks.readBytes.mockResolvedValue({ bytes, contentType: 'application/json' })
  })

  it('returns a bounded text page only after verifying the active lease, sealed receipt, and bytes', async () => {
    await expect(readQualityJourneyTriageEvidence(request({ offset: 2, limit: 6 }), client())).resolves.toEqual({
      receiptId: 'receipt-1',
      artifactKind: 'report',
      contentHash: hashRuntimeCapsuleBytes(bytes),
      size: bytes.length,
      contentType: 'application/json',
      offset: 2,
      endOffset: 8,
      complete: false,
      text: 'aled t',
    })
    expect(mocks.readBytes).toHaveBeenCalledWith({
      runId: 'run-1',
      kind: 'report',
      expectedTargetProjectId: 'target-1',
    })
    expect(mocks.journeyFindFirst).toHaveBeenCalledTimes(2)
    expect(mocks.assignmentFindFirst).toHaveBeenCalledTimes(2)
  })

  it('does not dereference a receipt outside the exact journey target scope', async () => {
    mocks.receiptFindFirst.mockResolvedValue(null)

    await expect(readQualityJourneyTriageEvidence(request(), client())).rejects.toThrow('receipt not found')
    expect(mocks.readBytes).not.toHaveBeenCalled()
  })

  it('does not dereference an artifact absent from the sealed receipt', async () => {
    mocks.receiptFindFirst.mockResolvedValue(receipt([]))

    await expect(readQualityJourneyTriageEvidence(request({ artifactKind: 'log' }), client())).rejects.toThrow(
      'no requested artifact',
    )
    expect(mocks.readBytes).not.toHaveBeenCalled()
  })

  it('rejects bytes that differ from the sealed artifact hash or size', async () => {
    mocks.readBytes.mockResolvedValue({ bytes: Buffer.from('forged report'), contentType: 'application/json' })

    await expect(readQualityJourneyTriageEvidence(request(), client())).rejects.toThrow('differ from the sealed')
  })

  it.each([
    ['expired', () => authorityWithAttempt({ leaseExpiresAt: new Date('2000-01-01T00:00:00.000Z') })],
    ['replaced', () => authorityWithAttempt({ currentAttempt: 2 })],
    [
      'cross-assignment receipt',
      () =>
        authority({
          assignment: { ...authority().assignment, inputJson: JSON.stringify({ cycleId: 'cycle-1', runs: [] }) },
        }),
    ],
  ])('rejects %s lease or assignment authority before artifact I/O', async (_name, build) => {
    const invalid = build()
    mocks.journeyFindFirst.mockResolvedValue(invalid.journey)
    mocks.assignmentFindFirst.mockResolvedValue(invalid.assignment)

    await expect(readQualityJourneyTriageEvidence(request(), client())).rejects.toThrow('lease or receipt authority')
    expect(mocks.receiptFindFirst).not.toHaveBeenCalled()
    expect(mocks.readBytes).not.toHaveBeenCalled()
  })

  it('rejects a forged owner token before artifact I/O', async () => {
    await expect(readQualityJourneyTriageEvidence(request({ ownerToken: 'forged-token' }), client())).rejects.toThrow(
      'lease or receipt authority',
    )
    expect(mocks.receiptFindFirst).not.toHaveBeenCalled()
    expect(mocks.readBytes).not.toHaveBeenCalled()
  })
})
