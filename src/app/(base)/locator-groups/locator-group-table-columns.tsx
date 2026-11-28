'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'

import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import TableActions from '@/components/table/table-actions'
import { LocatorGroup, Module } from '@prisma/client'
import { formatDateTime } from '@/lib/utils'
import { withProjectScope } from '@/lib/project-scope'
import { deleteLocatorGroupAction } from '@/actions/locator-groups/locator-group-actions'
import { Badge } from '@/components/ui/badge'

export const locatorGroupTableCols: ColumnDef<LocatorGroup & { module: Module }>[] = [
  createDataTableSelectionColumn<LocatorGroup & { module: Module }>(row => row.name),
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
          rowName={locatorGroup.name}
          modifyLink={withProjectScope(`/locator-groups/modify/${locatorGroup.id}`, locatorGroup.targetProjectId)}
          deleteHandler={() => deleteLocatorGroupAction([locatorGroup.id])}
        />
      )
    },
  },
]
