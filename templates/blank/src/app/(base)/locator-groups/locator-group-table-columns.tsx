'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { LocatorGroup, Module } from '@prisma/client'
import { formatDateTime } from '@/lib/utils'
import { deleteLocatorGroupAction } from '@/actions/locator-groups/locator-group-actions'
import { Badge } from '@/components/ui/badge'

export const locatorGroupTableCols: ColumnDef<LocatorGroup & { module: Module }>[] = [
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
    accessorKey: 'module.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Module" />,
    cell: ({ row }) => {
      const locatorGroup = row.original
      return <Badge variant="outline">{locatorGroup.module?.name}</Badge>
    },
  },
  {
    accessorKey: 'route',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Route" />,
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
      const locatorGroup = row.original
      return (
        <TableActions
          modifyLink={`/locator-groups/modify/${locatorGroup.id}`}
          deleteHandler={() => deleteLocatorGroupAction([locatorGroup.id])}
        />
      )
    },
  },
]
