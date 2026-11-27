// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CollaborationReviewCard } from './collaboration-review-card'

const review = {
  kind: 'RECORDS' as const,
  targetProjectId: 'project-1',
  operationId: 'operation-1',
  intent: 'RECEIVE' as const,
  expectedVersion: 2,
  preparedDigest: `sha256:${'a'.repeat(64)}`,
  reviewItems: [{ recordKey: 'module:one', disposition: 'CONFLICT' }],
}

describe('CollaborationReviewCard', () => {
  it('requires exact visible scope confirmation and resets on changed operation', () => {
    const onDecision = vi.fn()
    const { rerender } = render(<CollaborationReviewCard onDecision={onDecision} review={review} />)
    const decision = screen.getByRole('button', { name: 'Use all incoming' })
    expect(decision).toBeDisabled()
    expect(screen.getByText('module:one')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed this exact operation/i }))
    expect(decision).toBeEnabled()
    rerender(<CollaborationReviewCard onDecision={onDecision} review={{ ...review, operationId: 'operation-2' }} />)
    expect(decision).toBeDisabled()
    fireEvent.click(decision)
    expect(onDecision).not.toHaveBeenCalled()
  })
})
