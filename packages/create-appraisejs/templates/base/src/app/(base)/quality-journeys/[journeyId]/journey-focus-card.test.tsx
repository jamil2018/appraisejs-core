// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { JourneyFocusCard } from './journey-focus-card'
import { selectJourneyFocus } from './journey-focus-projection'

const analysis = {
  revision: 3,
  scope: ['Guest checkout', 'Order confirmation'],
  acceptanceSignals: ['Purchase succeeds', 'Order number appears'],
  reviewHash: 'sha256:review-three',
}

describe('Journey focus projection', () => {
  it('shows a required question before the approach review', () => {
    const focus = selectJourneyFocus({
      stage: 'ANALYSIS_REVIEW',
      openQuestion: 'Should guest checkout require an email?',
      analysis,
      scenarioCount: 0,
    })
    expect(focus.kind).toBe('question')
    expect(focus.destination).toBe('analysis')
    expect(focus.summary).toContain('guest checkout')
  })

  it('shows the reviewed revision and full proposed scope', () => {
    const focus = selectJourneyFocus({ stage: 'ANALYSIS_REVIEW', analysis, scenarioCount: 0 })
    expect(focus.kind).toBe('proposed-checks')
    expect(focus.details).toEqual([
      'In scope Guest checkout',
      'In scope Order confirmation',
      'Review hash sha256:review-three',
    ])
    render(<JourneyFocusCard focus={focus} />)
    expect(screen.getByRole('article', { name: 'Proposed checks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review this version' })).toHaveAttribute('href', '#analysis')
    expect(screen.getByText('Review hash sha256:review-three')).toBeInTheDocument()
  })

  it('gives a requested exact consent priority over other stage content', () => {
    const focus = selectJourneyFocus({
      stage: 'AUTOMATION',
      scenarioCount: 2,
      requestedConsent: {
        reason: 'Run checkout checks in staging',
        target: 'START_EXECUTION:staging:CHROMIUM',
        preparedScenarioCount: 2,
        effects: ['BROWSER'],
        scopeHash: 'sha256:scope-one',
      },
    })
    expect(focus.kind).toBe('run-permission')
    expect(focus.destination).toBe('execution')
    expect(focus.details).toContain('Scope hash sha256:scope-one')
  })

  it('uses the scenario review and recorded report as distinct tasks', () => {
    const scenarios = selectJourneyFocus({
      stage: 'SCENARIO_REVIEW',
      scenarioCount: 4,
      scenarioReviewHash: 'sha256:scenario-review',
    })
    expect(scenarios).toMatchObject({ kind: 'review-changes', destination: 'scenarios' })
    expect(scenarios.details).toContain('Review hash sha256:scenario-review')

    const report = selectJourneyFocus({
      stage: 'REPORT_REVIEW',
      scenarioCount: 4,
      report: { findingCount: 3, unresolvedCount: 1 },
    })
    expect(report).toMatchObject({
      kind: 'result-evidence',
      destination: 'triage',
      summary: '3 recorded findings, 1 unresolved.',
    })
  })
})
