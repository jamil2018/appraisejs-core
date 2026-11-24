// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  getJourney: vi.fn(),
  getAnalysis: vi.fn(),
  getExecution: vi.fn(),
  getTriage: vi.fn(),
  getScenarios: vi.fn(),
}))

vi.mock('@/services/coordinator/quality-journey-service', () => ({ getQualityJourney: mocks.getJourney }))
vi.mock('@/services/coordinator/quality-journey-analysis-service', () => ({
  getQualityJourneyAnalysis: mocks.getAnalysis,
}))
vi.mock('@/services/coordinator/quality-journey-execution-service', () => ({
  getQualityJourneyExecution: mocks.getExecution,
}))
vi.mock('@/services/coordinator/quality-journey-triage-service', () => ({ getQualityJourneyTriage: mocks.getTriage }))
vi.mock('@/services/coordinator/quality-journey-scenario-service', () => ({
  getQualityJourneyScenarioPortfolio: mocks.getScenarios,
}))

import { JourneyChatFocus } from './journey-chat-focus'

describe('JourneyChatFocus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getJourney.mockResolvedValue({
      blockers: [],
      journey: {
        stage: 'REPORT_REVIEW',
        status: 'ACTIVE',
        hostingMode: 'APP_MANAGED',
        activeRevisionIds: { analysis: null },
        analysisReviewHash: null,
      },
    })
    mocks.getAnalysis.mockResolvedValue({ revisions: [] })
    mocks.getExecution.mockResolvedValue({ consents: [] })
    mocks.getTriage.mockResolvedValue({
      activeReportRevisionId: 'report-1',
      reports: [{ id: 'report-1', report: { findings: [{ unresolved: true }, { unresolved: false }] } }],
    })
  })

  it('reads the exact project scope and links recorded results to its Journey', async () => {
    render(await JourneyChatFocus({ projectId: 'project-1', journeyId: 'journey-1' }))

    const scope = { journeyId: 'journey-1', targetProjectId: 'project-1' }
    expect(mocks.getJourney).toHaveBeenCalledWith(scope)
    expect(mocks.getAnalysis).toHaveBeenCalledWith(scope)
    expect(mocks.getExecution).toHaveBeenCalledWith(scope)
    expect(mocks.getTriage).toHaveBeenCalledWith(scope)
    expect(screen.getByText('2 recorded findings, 1 unresolved.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open results' })).toHaveAttribute(
      'href',
      '/quality-journeys/journey-1?project=project-1#triage',
    )
  })

  it('does not read or render details when the Journey is absent from that project', async () => {
    mocks.getJourney.mockRejectedValue(new ServiceError('Journey not found', 'NOT_FOUND'))

    expect(await JourneyChatFocus({ projectId: 'other-project', journeyId: 'journey-1' })).toBeNull()
    expect(mocks.getAnalysis).not.toHaveBeenCalled()
    expect(mocks.getExecution).not.toHaveBeenCalled()
    expect(mocks.getTriage).not.toHaveBeenCalled()
  })
})
