'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Report, Tag, ReportTestCase, TestRun, TestRunTestCase, TestCase } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { deleteTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export const reportTableCols: ColumnDef<
  Report & {
    testRun: TestRun
    tags?: Tag[]
    reportTestCases: (ReportTestCase & { testRunTestCase: TestRunTestCase; testCase: TestCase & { tags?: Tag[] } })[]
  }
>[] = [
  {
    accessorKey: 'reportTestCases.testRunTestCase.status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.reportTestCases[0]
      return <Badge variant="outline">{reportTestCase.testRunTestCase.status}</Badge>
    },
  },
  {
    accessorKey: 'reportTestCases.testCase.title',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Case" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.reportTestCases[0]
      return <div>{reportTestCase.testCase.title}</div>
    },
  },
  {
    accessorKey: 'tags',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.reportTestCases[0]
      const tags = reportTestCase.testCase.tags || []
      return (
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
        </div>
      )
    },
  },
  {
    accessorKey: 'reportTestCases.duration',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.reportTestCases[0]
      return <div>{reportTestCase.duration}ms</div>
    },
  },
]
