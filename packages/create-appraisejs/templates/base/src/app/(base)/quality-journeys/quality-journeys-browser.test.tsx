// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ push: vi.fn(), copy: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('./quality-journey-actions', () => ({ copyQualityJourneyBriefToDraftAction: mocks.copy }))

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode
    href: string
    'aria-label'?: string
  }) => (
    <a aria-label={ariaLabel} href={href}>
      {children}
    </a>
  ),
}))

import { QualityJourneysBrowser } from './quality-journeys-browser'

const journey = {
  id: 'journey-1',
  stage: 'ANALYSIS_REVIEW',
  status: 'ACTIVE',
  hostingMode: 'APP_SERVER_LOCAL_V1',
  activeCycleId: 'cycle-1',
  activeRevisionIds: { journey: 'journey-revision-1' },
  unresolvedQuestionIds: [],
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  requirement: { id: 'requirement-1', revision: 1, contentHash: 'sha256:abc', summary: 'Checkout accepts cards' },
  analysisRevisionCount: 1,
  activeBlockerCount: 0,
  blockerResponsibleActor: null,
  requestedExecutionConsentCount: 0,
  handoff: {
    status: 'CONNECTED',
    launchedAt: null,
    connectedAt: new Date('2026-09-01T00:30:00.000Z'),
    expiresAt: new Date('2026-09-08T00:00:00.000Z'),
  },
}

describe('QualityJourneysBrowser', () => {
  it('filters compact requirement summaries without exposing requirement JSON', async () => {
    const user = userEvent.setup()
    render(<QualityJourneysBrowser items={[journey]} projectId="project one" />)

    expect(screen.getByText('Checkout accepts cards')).toBeInTheDocument()
    expect(screen.getByText('Requirements · Ready for review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Checkout accepts cards' })).toHaveAttribute(
      'href',
      '/quality-journeys/journey-1?project=project%20one',
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search Quality Journeys' }), 'missing')
    expect(screen.getByRole('status')).toHaveTextContent('No Quality Journeys match')
  })

  it('shows migration for legacy hosting while retaining the brief and detail link', () => {
    render(
      <QualityJourneysBrowser
        items={[{ ...journey, stage: 'ANALYSIS', analysisRevisionCount: 0, hostingMode: 'EXTERNAL_LEGACY' }]}
        projectId="project-1"
      />,
    )
    expect(screen.getByText(/Continue in Appraise/)).toBeInTheDocument()
    expect(screen.queryByText(/prompt|paste|open Codex/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy brief' })).toBeInTheDocument()
  })

  it('shows managed unavailability without claiming work is in progress', () => {
    render(
      <QualityJourneysBrowser
        items={[{ ...journey, stage: 'ANALYSIS', analysisRevisionCount: 0 }]}
        projectId="project-1"
      />,
    )
    expect(screen.getByText('Requirements')).toBeInTheDocument()
    expect(screen.queryByText('In progress')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Codex/ })).not.toBeInTheDocument()
  })

  it('explains how to create the first Quality Journey', () => {
    render(<QualityJourneysBrowser items={[]} projectId="project-1" />)

    expect(screen.getByText('No Quality Journeys yet')).toBeInTheDocument()
  })

  it('copies a brief into a draft rather than a linked follow-up', async () => {
    mocks.copy.mockResolvedValue({ success: true, data: { draft: { id: 'draft-copy' } } })
    const user = userEvent.setup()
    render(<QualityJourneysBrowser items={[journey]} projectId="project one" />)
    await user.click(screen.getByRole('button', { name: 'Copy brief' }))
    expect(mocks.copy).toHaveBeenCalledWith(expect.objectContaining({ journeyId: 'journey-1' }))
    expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/drafts/draft-copy?project=project%20one')
  })
})
