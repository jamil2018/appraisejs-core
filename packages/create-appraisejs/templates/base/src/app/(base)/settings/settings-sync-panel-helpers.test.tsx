// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { formatExecutionSummary, formatFailureSummary, formatExecutionOrder } from './settings-sync-panel-helpers'

describe('settings-sync-panel helpers', () => {
  it('formats the sync-all execution summary', () => {
    expect(
      formatExecutionSummary({
        requestedScriptId: 'sync-all',
        executedScriptIds: ['sync-modules', 'sync-tags'],
        success: true,
        durationMs: 12,
      }),
    ).toBe('Completed 2 sync scripts successfully.')
  })

  it('formats a failed script summary with the failed script id and exit code', () => {
    expect(
      formatFailureSummary({
        requestedScriptId: 'sync-test-cases',
        executedScriptIds: ['sync-modules', 'sync-test-cases'],
        success: false,
        durationMs: 12,
        failedScriptId: 'sync-test-cases',
        exitCode: 1,
        cause: 'Step parsing failed',
      }),
    ).toBe('sync-test-cases (exit code 1) failed: Step parsing failed')
  })

  it('formats the requested execution order labels', () => {
    expect(formatExecutionOrder('sync-test-cases')).toBe(
      'Modules -> Tags -> Test Suites -> Step Definitions -> Test Cases',
    )
  })
})
