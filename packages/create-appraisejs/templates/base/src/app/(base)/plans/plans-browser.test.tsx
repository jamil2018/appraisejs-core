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
    slug: 'draft-plan',
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
    slug: 'review-plan',
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
    slug: 'changes-plan',
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

  it('searches display slugs while cards keep canonical plan links', async () => {
    const user = userEvent.setup()
    render(
      <PlansBrowser
        plans={[
          {
            ...plans[0]!,
            planId: 'pln_01jz7q1by2e4prv55bda9xf39m',
            slug: 'checkout-redesign',
            goal: 'Opaque ID plan',
          },
        ]}
      />,
    )

    await user.type(screen.getByRole('searchbox', { name: /search plans/i }), 'checkout-redesign')

    expect(screen.getByText('checkout-redesign')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /read the plan opaque id plan/i })).toHaveAttribute(
      'href',
      '/plans/pln_01jz7q1by2e4prv55bda9xf39m',
    )
  })

  it('uses the incoming query to seed slug search results', () => {
    render(
      <PlansBrowser
        initialQuery="review-plan"
        plans={[
          {
            ...plans[0]!,
            planId: 'pln_01jz7q1by2e4prv55bda9xf39n',
            slug: 'review-plan',
            goal: 'Seeded result',
          },
          plans[1]!,
        ]}
      />,
    )

    expect(screen.getByRole('searchbox', { name: /search plans/i })).toHaveValue('review-plan')
    expect(screen.getByText('Seeded result')).toBeInTheDocument()
    expect(screen.getByText('Review plan')).toBeInTheDocument()
    expect(screen.queryByText('Draft plan')).not.toBeInTheDocument()
  })
})
