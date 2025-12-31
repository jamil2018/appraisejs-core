'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  ReportTestCase,
  TestRunTestCase,
  TestCase,
  Tag,
  ReportScenario,
  StepStatus,
  TestRunTestCaseResult,
} from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { ViewLogsButton } from './view-logs-button'
import { CheckCircle, XCircle, Clock } from 'lucide-react'

type ReportTestCaseWithRelations = ReportTestCase & {
  testRunTestCase: TestRunTestCase & {
    testCase: TestCase & { tags?: Tag[] }
  }
  reportScenario:
    | (ReportScenario & {
        tags: Array<{ tagName: string }>
        steps: Array<{
          id: string
          keyword: string
          name: string
          status: StepStatus
          duration: string
          errorMessage: string | null
          errorTrace: string | null
          order: number
        }>
        hooks: Array<{
          id: string
          keyword: string
          status: StepStatus
          duration: string
          errorMessage: string | null
          errorTrace: string | null
        }>
      })
    | null
}

const testRunTestCaseResultToBadge = (result: TestRunTestCaseResult) => {
  switch (result) {
    case TestRunTestCaseResult.PASSED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-green-700 bg-green-700/10 py-1 text-sm text-green-500"
        >
          <CheckCircle className="h-4 w-4" />
          PASSED
        </Badge>
      )
    case TestRunTestCaseResult.FAILED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-red-700 bg-red-700/10 py-1 text-sm text-red-500"
        >
          <XCircle className="h-4 w-4" />
          FAILED
        </Badge>
      )
    case TestRunTestCaseResult.UNTESTED:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-yellow-700 bg-yellow-700/10 py-1 text-sm text-yellow-500"
        >
          <Clock className="h-4 w-4" />
          UNTESTED
        </Badge>
      )
    default:
      return (
        <Badge
          variant="outline"
          className="flex items-center gap-2 rounded-xl border-orange-700 bg-orange-700/10 py-1 text-sm text-orange-500"
        >
          <Clock className="h-4 w-4" />
          UNKNOWN
        </Badge>
      )
  }
}

export const reportViewTableCols: ColumnDef<ReportTestCaseWithRelations>[] = [
  {
    id: 'result',
    accessorFn: row => row.testRunTestCase.result || '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Result" />,
    cell: ({ row }) => {
      return testRunTestCaseResultToBadge(row.original.testRunTestCase.result)
    },
  },
  {
    id: 'testCaseTitle',
    accessorFn: row => row.testRunTestCase.testCase.title || '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Case Title" />,
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.testRunTestCase.testCase.title}</div>
    },
  },
  {
    id: 'duration',
    accessorFn: row => (row.duration ? Number(row.duration) : 0),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => {
      if (!row.original.duration) return <div>-</div>
      const durationMs = Math.round(Number(row.original.duration) / 1000000)
      return <div>{durationMs}ms</div>
    },
  },
  {
    id: 'tags',
    accessorFn: row => {
      const tags = row.testRunTestCase.testCase.tags || []
      return tags.map(tag => tag.name).join(' ')
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const tags = row.original.testRunTestCase.testCase.tags || []
      return (
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
        </div>
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const reportTestCase = row.original
      return <ViewLogsButton reportScenario={reportTestCase.reportScenario} />
    },
  },
]
