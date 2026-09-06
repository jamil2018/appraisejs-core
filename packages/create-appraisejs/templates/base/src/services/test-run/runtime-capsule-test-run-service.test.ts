import { TestRunStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { RuntimeCapsuleTestRunService } from './runtime-capsule-test-run-service'

function queuedRun(input: { intent: 'INDEPENDENT' | 'QUALITY_JOURNEY'; journeyBound: boolean }) {
  return {
    id: 'run-db',
    runId: 'run-public',
    targetProjectId: 'target',
    environmentId: 'environment',
    intent: input.intent,
    status: TestRunStatus.QUEUED,
    environment: { id: 'environment' },
    targetProject: { kind: 'LOCAL_WORKSPACE' },
    testCases: [],
    runtimeCapsuleExecutionAttempt: null,
    qualityJourneyExecutionBinding: input.journeyBound ? { id: 'binding' } : null,
  }
}

describe('TestRun Journey authority invariants', () => {
  it('rejects Journey intent without an exact Journey execution binding', async () => {
    const client = {
      testRun: { findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun({ intent: 'QUALITY_JOURNEY', journeyBound: false })) },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startJourneyPrepared({ testRunDbId: 'run-db' }),
    ).rejects.toThrow('specialized frozen execution boundary')
  })

  it('rejects a Journey binding on an independent diagnostic run', async () => {
    const client = {
      testRun: { findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun({ intent: 'INDEPENDENT', journeyBound: true })) },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startIndependentAuthored({ testRunDbId: 'run-db' }),
    ).rejects.toThrow('specialized frozen execution boundary')
  })

  it('rejects independent intent at the Journey execution boundary', async () => {
    const client = {
      testRun: { findUniqueOrThrow: vi.fn().mockResolvedValue(queuedRun({ intent: 'INDEPENDENT', journeyBound: true })) },
    }
    await expect(
      new RuntimeCapsuleTestRunService(client as never).startJourneyPrepared({ testRunDbId: 'run-db' }),
    ).rejects.toThrow('invalid execution intent')
  })
})
