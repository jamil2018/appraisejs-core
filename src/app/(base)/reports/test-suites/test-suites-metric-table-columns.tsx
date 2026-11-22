'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import TableActions from '@/components/table/table-actions'
import { Tag, TestCase, TestSuite, TestSuiteMetrics } from '@prisma/client'
import { formatDateTime } from '@/lib/utils'
import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import { deleteTestSuiteAction } from '@/actions/test-suite/test-suite-actions'

export const testSuitesMetricTableCols: ColumnDef<
  TestSuiteMetrics & { testSuite: TestSuite & { tags: Tag[]; testCases: TestCase[] } }
>[] = [
  createDataTableSelectionColumn<TestSuiteMetrics & { testSuite: TestSuite & { tags: Tag[]; testCases: TestCase[] } }>(
    row => row.testSuite.name,
  ),
  {
    id: 'testSuite.name',
    accessorKey: 'testSuite.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Suite Name" />,
    cell: ({ row }) => {
      const testSuite = row.original.testSuite
      return <div>{testSuite.name}</div>
    },
  },
  {
    accessorKey: 'testSuite.description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Suite Description" />,
    cell: ({ row }) => {
      const testSuite = row.original.testSuite
      return <div>{testSuite.description}</div>
    },
  },
  {
    accessorKey: 'testSuite.testCases.length',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Test Cases" />,
    cell: ({ row }) => {
      const testSuite = row.original.testSuite
      return <div>{testSuite.testCases.length}</div>
    },
  },
  {
    accessorKey: 'lastExecutedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Last Executed At" />,
    cell: ({ row }) => {
      const testSuiteMetrics = row.original
      return <div>{formatDateTime(testSuiteMetrics.lastExecutedAt)}</div>
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const testSuite = row.original.testSuite
      return (
        <TableActions
          rowName={testSuite.name}
          modifyLink={`/test-suites/modify/${testSuite.id}`}
          deleteHandler={() => deleteTestSuiteAction([testSuite.id])}
        />
      )
    },
  },
]
