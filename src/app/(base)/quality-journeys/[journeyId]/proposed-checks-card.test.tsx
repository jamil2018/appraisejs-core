// @vitest-environment jsdom

import { EventType } from '@ag-ui/core'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ChatAnalysisReviewCard } from './proposed-checks-card'
import { analysisReviewEvent, readAnalysisReviewCall } from './proposed-checks-event'
import { analysisCriterionChanges } from './journey-focus-data'

const expected = {
  conversationId: '00000000-0000-4000-8000-000000000001',
  projectId: 'checkout-project',
  journeyId: 'qjy_checkout',
  revisionId: 'checkout-analysis-1',
  reviewHash: `sha256:${'ab'.repeat(32)}`,
}
const content = {
  ...expected,
  kind: 'proposed-checks' as const,
  revision: 1,
  includedScope: ['Guest checkout'],
  checks: ['A guest can buy one item.', 'An order confirmation appears.'],
}
const event = analysisReviewEvent(content)

describe('Proposed checks events', () => {
  it('rejects unsupported events, malformed cards and mismatched scope or review identity', () => {
    const withContent = (value: unknown) => ({ ...event, delta: JSON.stringify(value) })
    const events = [
      null,
      { ...event, type: EventType.CUSTOM },
      { ...event, toolCallName: 'unknown' },
      { ...event, toolCallId: 'unexpected' },
      { ...event, delta: '{' },
      withContent({ ...content, checks: [] }),
      withContent({ ...content, unintendedAction: 'approve' }),
      ...Object.keys(expected).map(field => withContent({ ...content, [field]: 'invalid' })),
      withContent({ ...content, conversationId: '00000000-0000-4000-8000-000000000002' }),
      withContent({ ...content, reviewHash: `sha256:${'bc'.repeat(32)}` }),
    ]

    for (const event of events) expect(readAnalysisReviewCall([event], expected)).toBeUndefined()
    render(
      <>
        <p>Saved checkout message</p>
        <ChatAnalysisReviewCard events={events} expected={expected} />
      </>,
    )
    expect(screen.getByText('Saved checkout message')).toBeVisible()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('renders one linked review with the published checks when the same event is delivered twice', () => {
    expect(readAnalysisReviewCall([event, event], expected)).toMatchObject({ id: event.toolCallId })
    render(<ChatAnalysisReviewCard events={[{ ...event, delta: '{}' }, event, event]} expected={expected} />)
    const card = screen.getByRole('article', { name: 'Proposed checks' })
    expect(within(card).getByRole('heading', { name: 'Proposed checks' })).toBeVisible()
    const list = within(card).getByRole('list', { name: 'Proposed checks' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual(content.checks)
    expect(within(card).getByText(/test approach revision 1/)).toBeVisible()
    expect(within(card).getByRole('link', { name: 'Review this version' })).toHaveAttribute(
      'href',
      '/quality-journeys/qjy_checkout?project=checkout-project#analysis',
    )
  })

  it('renders only the changed criterion and ignores a late event for the superseded review', () => {
    const confirmation = {
      obligationId: 'confirmation',
      requirementId: 'checkout',
      statement: 'The confirmation appears.',
      acceptanceSignals: ['The confirmation page is shown.'],
    }
    const item = { ...confirmation, obligationId: 'item', statement: 'Only the selected item is purchased.' }
    const revised = { ...confirmation, acceptanceSignals: ['The confirmation includes an order number.'] }
    const changes = analysisCriterionChanges([confirmation, item], [revised, item])
    const currentIdentity = { ...expected, revisionId: 'checkout-analysis-2', reviewHash: `sha256:${'bc'.repeat(32)}` }
    const currentEvent = analysisReviewEvent({
      ...currentIdentity,
      kind: 'review-changes',
      revision: 2,
      includedScope: content.includedScope,
      changes,
    })
    expect(readAnalysisReviewCall([event], currentIdentity)).toBeUndefined()
    render(<ChatAnalysisReviewCard events={[event, currentEvent, currentEvent, event]} expected={currentIdentity} />)
    const card = screen.getByRole('article', { name: 'Review changes' })
    expect(within(card).getByText('Test approach revision 2.')).toBeVisible()
    expect(within(card).getByText('The confirmation includes an order number.')).toBeVisible()
    expect(within(card).queryByText(item.statement)).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Proposed checks' })).not.toBeInTheDocument()
  })
})
