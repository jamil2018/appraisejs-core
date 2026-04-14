import { describe, expect, it } from 'vitest'

import { getTestRunHeaderPollMode, matchesTestRunExitEvent } from './test-run-header-helpers'

describe('test-run-header helpers', () => {
  it('derives polling modes from run status and report availability', () => {
    expect(
      getTestRunHeaderPollMode({
        status: 'RUNNING',
        reports: [],
      } as never),
    ).toBe('status')
    expect(
      getTestRunHeaderPollMode({
        status: 'COMPLETED',
        reports: [],
      } as never),
    ).toBe('report')
    expect(
      getTestRunHeaderPollMode({
        status: 'COMPLETED',
        reports: [{ id: 'report-1' }],
      } as never),
    ).toBeNull()
  })

  it('matches exit events by run id', () => {
    expect(matchesTestRunExitEvent({ testRunId: 'run-1' }, 'run-1')).toBe(true)
    expect(matchesTestRunExitEvent({ testRunId: 'run-2' }, 'run-1')).toBe(false)
  })
})
