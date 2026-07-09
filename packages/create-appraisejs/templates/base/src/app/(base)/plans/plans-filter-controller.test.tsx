// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { PlansFilterController } from './plans-filter-controller'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/plans',
  useSearchParams: () => new URLSearchParams('tab=all&sort=recent'),
}))

describe('PlansFilterController', () => {
  beforeEach(() => {
    push.mockReset()
  })

  it('updates the status tab in the url', async () => {
    const user = userEvent.setup()
    render(<PlansFilterController />)

    await user.click(screen.getByRole('tab', { name: /awaiting review/i }))

    expect(push).toHaveBeenLastCalledWith('/plans?tab=awaiting_review&sort=recent')
  })

  it('debounces search query updates', async () => {
    const user = userEvent.setup()
    render(<PlansFilterController />)

    await user.type(screen.getByPlaceholderText(/search plans/i), 'auth')

    await waitFor(
      () => {
        expect(push).toHaveBeenLastCalledWith('/plans?tab=all&sort=recent&query=auth')
      },
      { timeout: 1000 },
    )
  })
})
