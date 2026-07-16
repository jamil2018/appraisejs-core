import { TestRunResult, TestRunStatus } from '@prisma/client'

export type TestRunTerminalOutcome = 'passed' | 'failed' | 'cancelled'
export type ExecutionAttemptTerminalState = 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type TestRunTerminalArtifacts = {
  logPath?: string | null
  reportPath?: string | null
  runtimeCapsuleId?: string | null
}

const TRANSITION_SOURCES: Record<TestRunTerminalOutcome, ReadonlySet<TestRunStatus>> = {
  passed: new Set([TestRunStatus.RUNNING]),
  failed: new Set([TestRunStatus.QUEUED, TestRunStatus.RUNNING]),
  cancelled: new Set([TestRunStatus.QUEUED, TestRunStatus.RUNNING, TestRunStatus.CANCELLING]),
}

const TERMINAL_STATE: Record<
  TestRunTerminalOutcome,
  { status: TestRunStatus; result: TestRunResult; attemptState: ExecutionAttemptTerminalState }
> = {
  passed: { status: TestRunStatus.COMPLETED, result: TestRunResult.PASSED, attemptState: 'COMPLETED' },
  failed: { status: TestRunStatus.COMPLETED, result: TestRunResult.FAILED, attemptState: 'FAILED' },
  cancelled: { status: TestRunStatus.CANCELLED, result: TestRunResult.CANCELLED, attemptState: 'CANCELLED' },
}

export function resolveTestRunTerminalState(input: {
  currentStatus: TestRunStatus
  currentResult: TestRunResult
  outcome: TestRunTerminalOutcome
  managed: boolean
  artifacts: TestRunTerminalArtifacts
}) {
  const state = TERMINAL_STATE[input.outcome]
  if (input.currentStatus === state.status && input.currentResult === state.result) {
    return { ...state, shouldPersist: false }
  }
  if (!TRANSITION_SOURCES[input.outcome].has(input.currentStatus)) {
    throw new Error(`Invalid test-run terminal transition: ${input.currentStatus} -> ${state.status}/${state.result}.`)
  }
  if (input.managed && !input.artifacts.logPath) throw new Error('Managed terminal test runs require a log artifact.')
  if (input.managed && !input.artifacts.runtimeCapsuleId) {
    throw new Error('Managed terminal test runs require a runtime capsule.')
  }
  if (input.outcome === 'passed' && !input.artifacts.reportPath) {
    throw new Error('Passed test runs require a report artifact.')
  }
  return { ...state, shouldPersist: true }
}
