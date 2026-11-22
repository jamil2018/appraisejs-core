'use client'

import { Badge } from '@/components/ui/badge'
import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { formatDateTime } from '@/lib/utils'
import { TestCasePickerRow } from '@/types/test-case-picker'
import { ColumnDef } from '@tanstack/react-table'

export const testCaseDataColumns: ColumnDef<TestCasePickerRow>[] = [
  {
    accessorKey: 'title',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
    cell: ({ row }) => <div className="min-w-[14rem] font-medium">{row.original.title}</div>,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => (
      <div className="max-w-xl whitespace-normal text-sm text-muted-foreground">
        {row.original.description?.trim() || '-'}
      </div>
    ),
  },
  {
    accessorKey: 'tags',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const tags = row.original.tags || []
      return (
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
        </div>
      )
    },
  },
  {
    accessorKey: 'steps',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Steps" />,
    cell: ({ row }) => <div>{row.original.steps.length}</div>,
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created At" />,
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
    cell: ({ row }) => formatDateTime(row.original.updatedAt),
  },
]

export const testCaseSelectionColumn = createDataTableSelectionColumn<TestCasePickerRow>(row => row.title)

export const testCasePickerColumns: ColumnDef<TestCasePickerRow>[] = [testCaseSelectionColumn, ...testCaseDataColumns]
