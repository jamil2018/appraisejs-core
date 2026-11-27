'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'

import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import TableActions from '@/components/table/table-actions'
import { deleteLocatorAction } from '@/actions/locator/locator-actions'
import { formatDateTime } from '@/lib/utils'
import { withProjectScope } from '@/lib/project-scope'
import type { LocatorTableRow } from './locator-helpers'

export const locatorTableCols: ColumnDef<LocatorTableRow>[] = [
  createDataTableSelectionColumn<LocatorTableRow>(row => row.name),
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'value',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
  },
  {
    accessorKey: 'locatorGroup.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Locator Group" />,
    cell: ({ row }) => row.original.locatorGroup?.name ?? '-',
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created At" />,
    cell: ({ row }) => {
      return formatDateTime(row.original.createdAt)
    },
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
    cell: ({ row }) => {
      return formatDateTime(row.original.updatedAt)
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const locator = row.original
      return (
        <TableActions
          rowName={locator.name}
          modifyLink={withProjectScope(`/locators/modify/${locator.id}`, locator.targetProjectId)}
          deleteHandler={() => deleteLocatorAction([locator.id])}
        />
      )
    },
  },
]
