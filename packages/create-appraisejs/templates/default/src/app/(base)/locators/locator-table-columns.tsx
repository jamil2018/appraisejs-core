'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { Locator, LocatorGroup, ConflictResolution } from '@prisma/client'
import { deleteLocatorAction } from '@/actions/locator/locator-actions'
import { formatDateTime } from '@/lib/utils'

export const locatorTableCols: ColumnDef<Locator & { locatorGroup: LocatorGroup; conflicts: ConflictResolution[] }>[] =
  [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="mr-2"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="mr-2"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
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
            modifyLink={`/locators/modify/${locator.id}`}
            deleteHandler={() => deleteLocatorAction([locator.id])}
          />
        )
      },
    },
  ]
