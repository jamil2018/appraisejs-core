// @vitest-environment jsdom

import { render, screen, waitFor, within } from '@testing-library/react'
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
  it('names each row menu and preserves keyboard navigation', async () => {
    const user = userEvent.setup()

    render(
      <table>
        <tbody>
          {['Checkout flow', 'Login flow'].map(name => (
            <tr key={name}>
              <td>{name}</td>
              <td>
                <TableActions rowName={name} modifyLink={`/test-cases/${name}`} deleteHandler={vi.fn()} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>,
    )

    const checkoutMenu = within(screen.getByRole('row', { name: /Checkout flow/ })).getByRole('button', {
      name: 'Actions for Checkout flow',
    })
    const loginMenu = within(screen.getByRole('row', { name: /Login flow/ })).getByRole('button', {
      name: 'Actions for Login flow',
    })

    await user.tab()
    expect(checkoutMenu).toHaveFocus()
    await user.tab()
    expect(loginMenu).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(loginMenu).toHaveFocus()
  })

  it('restores interactivity after deleting from the row actions menu', async () => {
    const user = userEvent.setup()
    const deleteHandler = vi.fn().mockResolvedValue({
      status: 200,
      message: 'Deleted',
    })

    render(<TableActions rowName="Checkout flow" deleteHandler={deleteHandler} />)

    await user.click(screen.getByRole('button', { name: 'Actions for Checkout flow' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteHandler).toHaveBeenCalledTimes(1)
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    expect(document.body.style.pointerEvents).not.toBe('none')

    await user.click(screen.getByRole('button', { name: 'Actions for Checkout flow' }))
    expect(await screen.findByText('Actions')).toBeInTheDocument()
  })
})
