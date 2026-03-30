// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from '@/components/ui/checkbox'

import { DataTable } from './data-table'

const { toast } = vi.hoisted(() => ({
  toast: vi.fn(),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

type TableRow = {
  id: string
  name: string
}

const columns: ColumnDef<TableRow>[] = [
  {
    id: 'select',
    header: 'Select',
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onCheckedChange={value => row.toggleSelected(Boolean(value))}
      />
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
]

describe('DataTable', () => {
  it('enables row actions from a single selected row and deletes the selected id', async () => {
    const user = userEvent.setup()
    const deleteAction = vi.fn().mockResolvedValue({
      status: 200,
      message: 'Deleted',
    })

    render(
      <DataTable
        columns={columns}
        data={[
          { id: 'row-1', name: 'Smoke' },
          { id: 'row-2', name: 'Regression' },
        ]}
        filterColumn="name"
        filterPlaceholder="Search names"
        modifyLink="/tags/modify"
        viewLink="/tags/view"
        deleteAction={deleteAction}
      />,
    )

    expect(screen.getByRole('button', { name: 'Edit selected item' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'View selected item' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Delete selected item(s)' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Select Smoke' }))

    expect(screen.getByRole('link', { name: 'Edit selected item' })).toHaveAttribute('href', '/tags/modify/row-1')
    expect(screen.getByRole('link', { name: 'View selected item' })).toHaveAttribute('href', '/tags/view/row-1')

    await user.click(screen.getByRole('button', { name: 'Delete selected item(s)' }))
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(deleteAction).toHaveBeenCalledWith(['row-1'])
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Item(s) deleted successfully',
    })
  })

  it('filters rows from the search input', async () => {
    const user = userEvent.setup()

    render(
      <DataTable
        columns={columns}
        data={[
          { id: 'row-1', name: 'Smoke' },
          { id: 'row-2', name: 'Regression' },
        ]}
        filterColumn="name"
        filterPlaceholder="Search names"
      />,
    )

    await user.type(screen.getByPlaceholderText('Search names'), 'missing')

    expect(screen.getByText('No results.')).toBeInTheDocument()
  })
})
