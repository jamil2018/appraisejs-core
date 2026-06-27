// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import TableActions from './table-actions'

const { toast } = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

describe('TableActions', () => {
  it('restores interactivity after deleting from the row actions menu', async () => {
    const user = userEvent.setup()
    const deleteHandler = vi.fn().mockResolvedValue({
      status: 200,
      message: 'Deleted',
    })

    render(<TableActions deleteHandler={deleteHandler} />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    await user.click(screen.getByText('Delete'))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteHandler).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(document.body.style.pointerEvents).not.toBe('none')

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })
})
