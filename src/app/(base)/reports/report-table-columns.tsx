'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { Report, Tag, ReportTestCase, TestRun, TestRunTestCase, TestCase } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

type ReportWithRelations = Report & {
  testRun: TestRun
  tags?: Tag[]
  testCases: (ReportTestCase & {
    testRunTestCase: TestRunTestCase & {
      testCase: TestCase & { tags?: Tag[] }
    }
  })[]
}

export const reportTableCols: ColumnDef<ReportWithRelations>[] = [
  {
    id: 'status',
    accessorFn: row => {
      const reportTestCase = row.testCases?.[0]
      return reportTestCase?.testRunTestCase?.status || ''
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.testCases?.[0]
      if (!reportTestCase) return <Badge variant="outline">-</Badge>
      return <Badge variant="outline">{reportTestCase.testRunTestCase.status}</Badge>
    },
  },
  {
    id: 'testCase',
    accessorFn: row => {
      const reportTestCase = row.testCases?.[0]
      return reportTestCase?.testRunTestCase?.testCase?.title || ''
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Case" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.testCases?.[0]
      if (!reportTestCase || !reportTestCase.testRunTestCase?.testCase) return <div>-</div>
      return <div>{reportTestCase.testRunTestCase.testCase.title}</div>
    },
  },
  {
    id: 'tags',
    accessorFn: row => {
      const reportTestCase = row.testCases?.[0]
      const tags = reportTestCase?.testRunTestCase?.testCase?.tags || []
      return tags.map(tag => tag.name).join(' ')
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.testCases?.[0]
      if (!reportTestCase || !reportTestCase.testRunTestCase?.testCase) return <div>-</div>
      const tags = reportTestCase.testRunTestCase.testCase.tags || []
      return (
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
        </div>
      )
    },
  },
  {
    id: 'duration',
    accessorFn: row => {
      const reportTestCase = row.testCases?.[0]
      return reportTestCase?.duration || 0
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => {
      const reportTestCase = row.original.testCases?.[0]
      if (!reportTestCase) return <div>-</div>
      return <div>{reportTestCase.duration}ms</div>
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const report = row.original
      return (
        <div>
          <TableActions
            viewLink={`/reports/${report.id}`}
            deleteHandler={async () => {
              // Reports are read-only, deletion not implemented
              return { status: 400, error: 'Reports cannot be deleted' }
            }}
            deleteButtonDisabled={true}
          />
        </div>
      )
    },
  },
]
