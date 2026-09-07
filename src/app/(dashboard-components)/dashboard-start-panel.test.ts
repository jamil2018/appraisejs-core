import { describe, expect, it } from 'vitest'

import { getDashboardExperienceState } from './dashboard-start-panel'

const metrics = {
  testCasesCount: 0,
  testSuitesCount: 0,
  stepDefinitionsCount: 12,
  runningTestRunsCount: 0,
  completedTestRunsCount: 0,
  qualityJourneysCount: 0,
}

describe('getDashboardExperienceState', () => {
  it('keeps a fresh workspace distinct from global reusable definitions', () => {
    expect(getDashboardExperienceState(metrics)).toBe('empty')
  })

  it('does not call authored but never-run work healthy', () => {
    expect(getDashboardExperienceState({ ...metrics, testSuitesCount: 1 })).toBe('untested')
  })

  it('shows the populated state only after a completed run', () => {
    expect(getDashboardExperienceState({ ...metrics, qualityJourneysCount: 1, completedTestRunsCount: 1 })).toBe(
      'populated',
    )
  })
})
