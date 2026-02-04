'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import TableActions from '@/components/table/table-actions'
import { Tag, TestCase, TestCaseMetrics } from '@prisma/client'
import { deleteTestCaseAction } from '@/actions/test-case/test-case-actions'
import { formatDateTime } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'

export const testCasesMetricTableCols: ColumnDef<TestCaseMetrics & { testCase: TestCase & { tags: Tag[] } }>[] =
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
      id: 'testCase.title',
      accessorKey: 'testCase.title',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Test Case Title" />,
      cell: ({ row }) => {
        const testCase = row.original.testCase
        return <div>{testCase.title}</div>
      },
    },
    {
      accessorKey: 'testCase.description',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Test Case Description" />,
      cell: ({ row }) => {
        const testCase = row.original.testCase
        return <div>{testCase.description}</div>
      },
    },
    {
      accessorKey: 'consecutiveFailures',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Consecutive Failures" />,
    },
    {
      accessorKey: 'failureRate',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Failure Rate" />,
      cell: ({ row }) => {
        const testCaseMetrics = row.original
        return <div>{testCaseMetrics.failureRate * 100}%</div>
      },
    },
    {
      accessorKey: 'totalRecentRuns',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total Recent Runs" />,
      cell: ({ row }) => {
        const testCaseMetrics = row.original
        return <div>{testCaseMetrics.totalRecentRuns}</div>
      },
    },
    {
      accessorKey: 'failedRecentRuns',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Failed Recent Runs" />,
      cell: ({ row }) => {
        const testCaseMetrics = row.original
        return <div>{testCaseMetrics.failedRecentRuns}</div>
      },
    },
    {
      accessorKey: 'lastExecutedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Executed At" />,
      cell: ({ row }) => {
        const testCaseMetrics = row.original
        return <div>{testCaseMetrics.lastExecutedAt ? formatDateTime(testCaseMetrics.lastExecutedAt) : '-'}</div>
      },
    },
    {
      accessorKey: 'lastFailedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Failed At" />,
      cell: ({ row }) => {
        const testCaseMetrics = row.original
        return <div>{testCaseMetrics.lastFailedAt ? formatDateTime(testCaseMetrics.lastFailedAt) : '-'}</div>
      },
    },
    {
      accessorKey: 'lastPassedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Passed At" />,
      cell: ({ row }) => {
        const testCaseMetrics = row.original
        return <div>{testCaseMetrics.lastPassedAt ? formatDateTime(testCaseMetrics.lastPassedAt) : '-'}</div>
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const testCaseId = row.original.testCaseId
        return (
          <TableActions
            modifyLink={`/test-cases/modify/${testCaseId}`}
            deleteHandler={() => deleteTestCaseAction([testCaseId])}
          />
        )
      },
    },
  ]
