'use client'

import { deleteStepBlockAction } from '@/actions/step-block/step-block-actions'
import TableActions from '@/components/table/table-actions'
import { Badge } from '@/components/ui/badge'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import { formatDateTime } from '@/lib/utils'
import { ColumnDef } from '@tanstack/react-table'
import { Blocks } from 'lucide-react'

import type { StepBlockRow } from './step-block-helpers'

export const stepBlockTableCols: ColumnDef<StepBlockRow>[] = [
  createDataTableSelectionColumn(),
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'intent',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Intent" />,
  },
  {
    id: 'steps',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Steps" />,
    cell: ({ row }) => (
      <Badge variant="outline" className="flex w-fit items-center gap-1">
        <Blocks className="size-4" />
        {row.original.steps.length}
      </Badge>
    ),
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <TableActions
        modifyLink={`/step-blocks/modify/${row.original.id}`}
        deleteHandler={() => deleteStepBlockAction([row.original.id])}
      />
    ),
  },
]
