'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Tag } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import TableActions from '@/components/table/table-actions'
import { deleteTagAction } from '@/actions/tags/tag-actions'
import { formatDateTime } from '@/lib/utils'
import { withProjectScope } from '@/lib/project-scope'

export const tagTableCols: ColumnDef<Tag>[] = [
  createDataTableSelectionColumn<Tag>(row => row.name),
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'tagExpression',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tag Expression" />,
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
      const tag = row.original
      return (
        <TableActions
          rowName={tag.name}
          modifyLink={withProjectScope(`/tags/modify/${tag.id}`, tag.targetProjectId)}
          deleteHandler={() => deleteTagAction([tag.id])}
        />
      )
    },
  },
]
