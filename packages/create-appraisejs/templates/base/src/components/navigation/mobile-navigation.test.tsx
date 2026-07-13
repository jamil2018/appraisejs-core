// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import MobileNavigation from './mobile-navigation'

vi.mock('next/navigation', () => ({
  usePathname: () => '/reports',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('./nav-command', () => ({
  default: () => <button type="button">Search</button>,
}))

describe('MobileNavigation', () => {
  it('opens the compact navigation menu and marks the active route', async () => {
    const user = userEvent.setup()
    render(<MobileNavigation />)

    await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))

    expect(screen.getByRole('dialog', { name: 'Navigation menu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page')
  })
})
