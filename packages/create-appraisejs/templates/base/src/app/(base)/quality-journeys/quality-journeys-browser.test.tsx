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
  activeCycleId: 'cycle-1',
  activeRevisionIds: { journey: 'journey-revision-1' },
  unresolvedQuestionIds: [],
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  requirement: { id: 'requirement-1', revision: 1, contentHash: 'sha256:abc', summary: 'Checkout accepts cards' },
  analysisRevisionCount: 1,
  activeBlockerCount: 0,
  requestedExecutionConsentCount: 0,
}

describe('QualityJourneysBrowser', () => {
  it('filters compact requirement summaries without exposing requirement JSON', async () => {
    const user = userEvent.setup()
    render(<QualityJourneysBrowser items={[journey]} projectId="project one" />)

    expect(screen.getByText('Checkout accepts cards')).toBeInTheDocument()
    expect(screen.getByText('Next: Review the proposed test approach')).toBeInTheDocument()
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Quality Journey journey-1' })).toHaveAttribute(
      'href',
      '/quality-journeys/journey-1?project=project%20one',
    )

    await user.type(screen.getByRole('searchbox', { name: 'Search Quality Journeys' }), 'missing')
    expect(screen.getByRole('status')).toHaveTextContent('No Quality Journeys match')
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
