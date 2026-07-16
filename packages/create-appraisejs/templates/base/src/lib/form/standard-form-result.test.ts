import { describe, expect, it, vi } from 'vitest'

import { toast } from '@/hooks/use-toast'
import { handleStandardFormResult } from './standard-form-result'

vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn() }))

describe('handleStandardFormResult', () => {
  it('notifies and continues after success', () => {
    const onSuccess = vi.fn()
    handleStandardFormResult({
      status: 200,
      successTitle: 'Saved',
      successMessage: 'Record saved',
      errorMessage: 'unused',
      onSuccess,
    })
    expect(toast).toHaveBeenCalledWith({ title: 'Saved', description: 'Record saved' })
    expect(onSuccess).toHaveBeenCalledOnce()
  })

  it('reports mapped client and server errors without continuing', () => {
    const onSuccess = vi.fn()
    for (const status of [400, 500]) {
      handleStandardFormResult({
        status,
        successTitle: 'unused',
        successMessage: 'unused',
        errorMessage: 'Unable to save',
        onSuccess,
      })
    }
    expect(toast).toHaveBeenCalledTimes(2)
    expect(toast).toHaveBeenLastCalledWith({
      title: 'Error',
      description: 'Unable to save',
      variant: 'destructive',
    })
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
