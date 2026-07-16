// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { usePlanReviewController } from './use-plan-review-controller'

describe('usePlanReviewController', () => {
  it('uses one success, error, and thrown-error command path', async () => {
    const refresh = vi.fn()
    const { result } = renderHook(() => usePlanReviewController(refresh))

    await act(async () => result.current.runCommand(async () => ({ success: true }), 'Saved.'))
    expect(result.current.message).toEqual({ tone: 'success', text: 'Saved.' })
    expect(refresh).toHaveBeenCalledOnce()

    await act(async () => result.current.runCommand(async () => ({ success: false, error: 'Rejected.' }), 'Saved.'))
    expect(result.current.message).toEqual({ tone: 'error', text: 'Rejected.' })

    await act(async () =>
      result.current.runCommand(async () => {
        throw new Error('Network unavailable.')
      }, 'Saved.'),
    )
    expect(result.current.message).toEqual({ tone: 'error', text: 'Network unavailable.' })
  })

  it('marks validation drift with its replay recovery', async () => {
    const { result } = renderHook(() => usePlanReviewController(vi.fn()))
    await act(async () =>
      result.current.runCommand(
        async () => ({
          success: false,
          error: 'Validation files changed after approval or baseline execution',
        }),
        'Saved.',
        { recovery: 'validation-drift' },
      ),
    )
    expect(result.current.message?.recovery).toBe('validation-drift')
  })
})
