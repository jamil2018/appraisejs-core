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
        <Badge className="bg-primary">
          <CheckCircle className="mr-1 h-4 w-4" />
          Passed
        </Badge>
      )
    case TestRunTestCaseResult.FAILED:
      return (
        <Badge className="bg-pink-500 text-white">
          <XCircle className="mr-1 h-4 w-4" />
          Failed
        </Badge>
      )
    case TestRunTestCaseResult.UNTESTED:
      return (
        <Badge className="bg-yellow-500 text-white">
          <Clock className="mr-1 h-4 w-4" />
          Untested
        </Badge>
      )
    default:
      return (
        <Badge className="bg-gray-500 text-white">
          <Clock className="mr-1 h-4 w-4" />
          Unknown
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
      const durationSeconds = (durationMs / 1000).toFixed(2)
      return <div>{durationSeconds}s</div>
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
