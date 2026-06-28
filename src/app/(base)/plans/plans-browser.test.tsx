// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PlansBrowser, type PlansBrowserPlan } from './plans-browser'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

const plans: PlansBrowserPlan[] = [
  {
    planId: 'draft-plan',
    goal: 'Draft plan',
    description: 'A draft that has not been submitted.',
    lifecycle: 'draft',
    revision: 1,
    stale: false,
    conflicted: false,
    taskCount: 2,
    issueCount: 0,
    updatedAt: '2026-06-28T00:00:00.000Z',
    updatedAtLabel: 'today',
  },
  {
    planId: 'review-plan',
    goal: 'Review plan',
    description: 'A plan awaiting reviewer action.',
    lifecycle: 'awaiting_plan_review',
    revision: 3,
    stale: false,
    conflicted: false,
    taskCount: 4,
    issueCount: 0,
    updatedAt: '2026-06-28T00:00:00.000Z',
    updatedAtLabel: 'today',
  },
  {
    planId: 'changes-plan',
    goal: 'Changes requested plan',
    description: 'A plan waiting for author changes.',
    lifecycle: 'changes_requested',
    revision: 2,
    stale: false,
    conflicted: false,
    taskCount: 3,
    issueCount: 1,
    updatedAt: '2026-06-28T00:00:00.000Z',
    updatedAtLabel: 'today',
  },
]

describe('PlansBrowser', () => {
  it('keeps draft plans out of awaiting-review counts and filters', async () => {
    const user = userEvent.setup()
    render(<PlansBrowser plans={plans} />)

    const needsReviewCard = screen.getByText('Needs Review').closest('.rounded-lg')
    expect(needsReviewCard).not.toBeNull()
    expect(within(needsReviewCard as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(screen.getByText('Awaiting review or changes requested')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /awaiting review/i }))

    expect(screen.queryByText('Draft plan')).not.toBeInTheDocument()
    expect(screen.getByText('Review plan')).toBeInTheDocument()
    expect(screen.getByText('Changes requested plan')).toBeInTheDocument()
  })
})
