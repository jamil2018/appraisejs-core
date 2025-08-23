'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { TestCase, TestCaseStep } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import { deleteTestCaseAction } from '@/actions/test-case/test-case-actions'
import TableActions from '@/components/table/table-actions'
import { formatDateTime } from '@/lib/utils'

export const testCaseTableCols: ColumnDef<TestCase & { steps: TestCaseStep[] }>[] = [
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
    accessorKey: 'id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
  },
  {
    accessorKey: 'title',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
  },
  {
    accessorKey: 'steps',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Steps" />,
    cell: ({ row }) => {
      const testCase = row.original
      return <div>{testCase.steps.length}</div>
    },
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
      const testCase = row.original

      return (
        <TableActions
          modifyLink={`/test-cases/modify/${testCase.id}`}
          deleteHandler={() => deleteTestCaseAction([testCase.id])}
        />
      )
    },
  },
]
