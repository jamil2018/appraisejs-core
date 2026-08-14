import { TestRunResult, TestRunStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { resolveTestRunTerminalState } from './terminal-state'

const artifacts = { logPath: 'run.log', reportPath: 'cucumber.json', runtimeCapsuleId: 'capsule-1' }

describe('test-run terminal state contract', () => {
  it.each([
    ['passed', TestRunStatus.COMPLETED, TestRunResult.PASSED, 'COMPLETED'],
    ['failed', TestRunStatus.COMPLETED, TestRunResult.FAILED, 'FAILED'],
    ['blocked', TestRunStatus.COMPLETED, TestRunResult.BLOCKED, 'COMPLETED'],
    ['cancelled', TestRunStatus.CANCELLED, TestRunResult.CANCELLED, 'CANCELLED'],
  ] as const)('maps %s through the shared terminal contract', (outcome, status, result, attemptState) => {
    expect(
      resolveTestRunTerminalState({
        currentStatus: TestRunStatus.RUNNING,
        currentResult: TestRunResult.PENDING,
        outcome,
        managed: true,
        artifacts,
      }),
    ).toEqual({ status, result, attemptState, shouldPersist: true })
  })

  it('is idempotent for an already-persisted terminal state', () => {
    expect(
      resolveTestRunTerminalState({
        currentStatus: TestRunStatus.CANCELLED,
        currentResult: TestRunResult.CANCELLED,
        outcome: 'cancelled',
        managed: false,
        artifacts: {},
      }).shouldPersist,
    ).toBe(false)
  })

  it('rejects illegal transitions and missing managed evidence', () => {
    expect(() =>
      resolveTestRunTerminalState({
        currentStatus: TestRunStatus.CANCELLING,
        currentResult: TestRunResult.PENDING,
        outcome: 'passed',
        managed: false,
        artifacts,
      }),
    ).toThrow('Invalid test-run terminal transition')
    expect(() =>
      resolveTestRunTerminalState({
        currentStatus: TestRunStatus.RUNNING,
        currentResult: TestRunResult.PENDING,
        outcome: 'failed',
        managed: true,
        artifacts: {},
      }),
    ).toThrow('require a log artifact')
  })

  it('rejects a conflicting result hidden behind the same terminal status', () => {
    expect(() =>
      resolveTestRunTerminalState({
        currentStatus: TestRunStatus.COMPLETED,
        currentResult: TestRunResult.FAILED,
        outcome: 'passed',
        managed: false,
        artifacts,
      }),
    ).toThrow('Invalid test-run terminal transition')
  })
})
