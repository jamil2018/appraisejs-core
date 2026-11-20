import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  scoped: vi.fn(),
  frozen: vi.fn(),
  operator: vi.fn(),
  bytes: vi.fn(),
  task: vi.fn(),
}))
vi.mock('./quality-journey-coordinator-session', () => ({
  assertCurrentCoordinatorSession: mocks.current,
  readScopedQualityJourney: mocks.scoped,
}))
vi.mock('./quality-journey-triage-service', () => ({
  readInternalTriagerAssignment: mocks.frozen,
  prepareQualityJourneyTriage: vi.fn(),
}))
vi.mock('./app-managed-operator-triage', async importOriginal => ({
  ...(await importOriginal<typeof import('./app-managed-operator-triage')>()),
  hasOperatorPreparation: mocks.operator,
}))
vi.mock('./app-managed-triage-task', () => ({ prepareAppManagedTriageTask: mocks.task }))
vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mocks.bytes
  },
}))
import { operatorTriage } from './app-managed-triage-service'

const digest = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const bytes = Buffer.from(
  JSON.stringify([
    {
      uri: 'test.feature',
      name: 'Checkout',
      elements: [
        { name: 'Confirm order', type: 'scenario', steps: [{ name: 'Confirm order', result: { status: 'passed' } }] },
      ],
    },
  ]),
)
const stateHash = `sha256:${'a'.repeat(64)}`
const inputHash = `sha256:${'b'.repeat(64)}`
const input = { journeyId: 'journey-1', targetProjectId: 'project-1', expectedStateHash: stateHash }
const journey = {
  id: input.journeyId,
  targetProjectId: input.targetProjectId,
  hostingMode: 'APP_SERVER_LOCAL_V1',
  status: 'ACTIVE',
  stage: 'TRIAGE',
  stateHash,
  activeCycleId: 'cycle-1',
  activeWorkItemIdsJson: '["triager-1"]',
  currentCoordinatorSessionId: 'session-1',
  blockerIdsJson: '[]',
  unresolvedQuestionIdsJson: '[]',
}
let client: PrismaClient
let findRun: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  mocks.current.mockResolvedValue({ journey })
  mocks.scoped.mockResolvedValue(journey)
  mocks.operator.mockResolvedValue(true)
  mocks.bytes.mockResolvedValue({ bytes })
  mocks.frozen.mockResolvedValue({
    ...input,
    inputHash,
    cycleId: 'cycle-1',
    executionCycleId: 'execution-1',
    analysis: { content: { requirements: [] } },
    scenarios: [{ revisionId: 'scenario-1', intent: { title: 'Checkout', requirementIds: [] } }],
    runs: [
      {
        testRunId: 'test-run-1',
        runId: 'runtime-run-1',
        scenarioRevisionId: 'scenario-1',
        evidenceReceiptId: 'receipt-1',
        evidence: {
          status: 'COMPLETED',
          result: 'PASSED',
          evidenceHealth: 'valid',
          missingArtifacts: [],
          artifacts: [{ kind: 'report', size: bytes.byteLength, contentHash: digest(bytes) }],
        },
      },
    ],
  })
  findRun = vi.fn().mockResolvedValue({ id: 'test-run-1' })
  const tx = { qualityJourneyWorkItem: { findMany: vi.fn().mockResolvedValue([{ id: 'triager-1' }]) } }
  client = {
    $transaction: (call: (value: unknown) => unknown) => call(tx),
    testRun: { findFirst: findRun },
    qualityJourneyCoordinatorSession: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ ownerPrincipalId: 'appraise-local:project-1', generation: 1, id: 'session-1' }),
    },
    qualityJourneyTriageAssignment: { findFirst: vi.fn().mockResolvedValue({ id: 'assignment-1' }) },
  } as unknown as PrismaClient
})

describe('operator report preview without a worker lease', () => {
  it('reads frozen same-project bytes and returns review evidence without claim or admission', async () => {
    const result = await operatorTriage(input, null, client)
    expect(result).toMatchObject({
      inputHash,
      expectedStateHash: stateHash,
      runs: [{ testRunId: 'test-run-1', passed: true }],
    })
    expect(findRun).toHaveBeenCalledWith({
      where: { id: 'test-run-1', runId: 'runtime-run-1', targetProjectId: 'project-1' },
      select: { id: true },
    })
    expect(mocks.bytes).toHaveBeenCalledWith({
      runId: 'runtime-run-1',
      kind: 'report',
      expectedTargetProjectId: 'project-1',
    })
    expect(mocks.task).not.toHaveBeenCalled()
    expect(mocks.frozen).toHaveBeenCalledTimes(2)
  })
  it('refuses changed report bytes before returning a review or claiming an attempt', async () => {
    mocks.bytes.mockResolvedValue({ bytes: Buffer.from('changed report') })
    await expect(operatorTriage(input, null, client)).rejects.toThrow('frozen receipt')
    expect(mocks.task).not.toHaveBeenCalled()
  })
  it('refuses a foreign or changed run identity before accessing bytes', async () => {
    findRun.mockResolvedValue(null)
    await expect(operatorTriage(input, null, client)).rejects.toThrow('run identity changed')
    expect(mocks.bytes).not.toHaveBeenCalled()
    expect(mocks.task).not.toHaveBeenCalled()
  })
  it('rechecks current ownership and state after reading bytes', async () => {
    mocks.current
      .mockResolvedValueOnce({ journey })
      .mockResolvedValueOnce({ journey })
      .mockResolvedValueOnce({ journey: { ...journey, stateHash: inputHash } })
    await expect(operatorTriage(input, null, client)).rejects.toThrow('changed during review')
    expect(mocks.task).not.toHaveBeenCalled()
  })
})
