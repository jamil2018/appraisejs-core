'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { TestRun, TestRunTestCase } from '@prisma/client'
import { deleteTestRunAction } from '@/actions/test-run/test-run-actions'
import { formatDateTime } from '@/lib/utils'

export const testRunTableCols: ColumnDef<TestRun & { testCases: TestRunTestCase[] }>[] = [
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
    accessorKey: 'runId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Run ID" />,
  },
  {
    accessorKey: 'startedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Started At" />,
    cell: ({ row }) => {
      return formatDateTime(row.original.startedAt)
    },
  },
  {
    accessorKey: 'completedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Completed At" />,
    cell: ({ row }) => {
      return formatDateTime(row.original.completedAt)
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
  },
  {
    accessorKey: 'result',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Result" />,
  },
  {
    accessorKey: 'testCases',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Cases" />,
    cell: ({ row }) => {
      const testCases = row.original.testCases
      return <div>{testCases.length}</div>
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
      const testRunData = row.original
      return (
        <TableActions
          modifyLink={`/test-runs/modify/${testRunData.id}`}
          deleteHandler={() => deleteTestRunAction([testRunData.id])}
        />
      )
    },
  },
]
