// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { usePlanReviewController } from './use-plan-review-controller'

const errorEnvelope = (overrides: Record<string, unknown> = {}) => ({
  schema: 'appraise.error/v1',
  errorId: '11111111-1111-4111-8111-111111111111',
  occurredAt: '2026-08-07T00:00:00.000Z',
  classification: 'state_conflict',
  code: 'state_conflict',
  message: 'Rejected.',
  httpStatus: 409,
  operation: { name: 'plan_review_action' },
  operationOutcome: 'not_committed',
  targetOutcome: 'not_evaluated',
  retry: { safe: false, strategy: 'read_state_then_retry' },
  ...overrides,
})

describe('usePlanReviewController', () => {
  it('uses one success, error, and thrown-error command path', async () => {
    const refresh = vi.fn()
    const { result } = renderHook(() => usePlanReviewController(refresh))

    await act(async () => result.current.runCommand(async () => ({ kind: 'appraise.ack/v1', ok: true }), 'Saved.'))
    expect(result.current.message).toEqual({ tone: 'success', text: 'Saved.' })
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())

    await act(async () => result.current.runCommand(async () => errorEnvelope(), 'Saved.'))
    expect(result.current.message).toEqual({ tone: 'error', text: 'Rejected.' })

    await act(async () =>
      result.current.runCommand(async () => {
        throw new Error('Network unavailable.')
      }, 'Saved.'),
    )
    expect(result.current.message).toEqual({ tone: 'error', text: 'The action could not be completed.' })
  })

  it('marks validation drift from the structured recovery code', async () => {
    const { result } = renderHook(() => usePlanReviewController(vi.fn()))
    await act(async () =>
      result.current.runCommand(async () => errorEnvelope({ code: 'validation_artifact_changed' }), 'Saved.', {
        recovery: 'validation-drift',
      }),
    )
    expect(result.current.message?.recovery).toBe('validation-drift')
  })

  it('does not accept legacy success and error shapes', async () => {
    const { result } = renderHook(() => usePlanReviewController(vi.fn()))
    await act(async () =>
      result.current.runCommand(async () => ({ success: false, error: 'Legacy response.' }), 'Saved.'),
    )
    expect(result.current.message).toEqual({ tone: 'error', text: 'The action returned an invalid Appraise response.' })
  })
})
