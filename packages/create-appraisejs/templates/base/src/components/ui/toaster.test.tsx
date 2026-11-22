// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { toast, useToast } from '@/hooks/use-toast'
import { Toaster } from './toaster'

function NotificationControl() {
  const { toast: notify } = useToast()
  return <button onClick={() => notify({ title: 'Saved', description: 'Your changes are ready.' })}>Save</button>
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('renders notifications from the existing hook and dismisses with the close control', async () => {
    const user = userEvent.setup()
    render(
      <>
        <NotificationControl />
        <Toaster />
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Your changes are ready.')).toBeInTheDocument()
    await user.hover(screen.getByRole('region', { name: 'Notifications' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument())
  })

  it('updates the same notification, preserves its variant, and supports programmatic dismissal', async () => {
    render(<Toaster />)
    let notification!: ReturnType<typeof toast>
    act(() => {
      notification = toast({ title: 'Failed', description: 'Try again.', variant: 'destructive', duration: 0 })
    })
    expect(screen.getByRole('heading', { name: 'Failed', hidden: true }).closest('[data-type]')).toHaveAttribute(
      'data-type',
      'destructive',
    )

    act(() => notification.update({ title: 'Still failed' }))
    expect(screen.queryByRole('heading', { name: 'Failed', hidden: true })).not.toBeInTheDocument()
    expect(screen.getAllByText('Try again.').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Still failed', hidden: true }).closest('[data-type]')).toHaveAttribute(
      'data-type',
      'destructive',
    )

    act(() => notification.dismiss())
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Still failed', hidden: true })).not.toBeInTheDocument(),
    )
  })

  it('replaces the previous notification without restoring it when the newest closes', async () => {
    render(<Toaster />)
    let newest!: ReturnType<typeof toast>
    act(() => {
      toast({ title: 'Earlier notice', duration: 0 })
    })
    act(() => {
      newest = toast({ title: 'Latest notice', duration: 0 })
    })
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Earlier notice', hidden: true })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('heading', { name: 'Latest notice', hidden: true })).toBeInTheDocument()
    act(() => newest.dismiss())
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Latest notice', hidden: true })).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('heading', { name: 'Earlier notice', hidden: true })).not.toBeInTheDocument()
  })

  it('automatically dismisses after the requested duration', async () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toast({ title: 'Temporary notice', duration: 1000 })
    })
    expect(screen.getByText('Temporary notice')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(screen.queryByText('Temporary notice')).not.toBeInTheDocument()
  })
})
