'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  ReportTestCase,
  TestRunTestCase,
  TestCase,
  TestSuite,
  Tag,
  ReportScenario,
  StepStatus,
  TestRunTestCaseResult,
} from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/components/ui/badge'
import { ViewLogsButton } from './view-logs-button'
import { CheckCircle, XCircle, Clock } from 'lucide-react'
import { StatusBadge } from '@/components/ui/status-badge'

type ReportTestCaseWithRelations = ReportTestCase & {
  testRunTestCase: TestRunTestCase & {
    testCase: TestCase & { tags?: Tag[] }
    testSuite: TestSuite | null
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
      return <StatusBadge label="Passed" tone="success" icon={<CheckCircle />} />
    case TestRunTestCaseResult.FAILED:
      return <StatusBadge label="Failed" tone="danger" icon={<XCircle />} />
    case TestRunTestCaseResult.UNTESTED:
      return <StatusBadge label="Untested" tone="warning" icon={<Clock />} />
    default:
      return <StatusBadge label="Unknown" icon={<Clock />} />
  }
}

function parseDurationMs(duration: string) {
  const match = duration.trim().match(/^(\d+(?:\.\d+)?)(ms)?$/)
  if (!match) return undefined
  const value = Number(match[1])
  if (!Number.isFinite(value)) return undefined
  return match[2] ? value : value / 1_000_000
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
      return (
        <div>
          <div className="font-medium">{row.original.testRunTestCase.testCase.title}</div>
          {row.original.testRunTestCase.testSuite && (
            <div className="mt-1 text-xs text-muted-foreground">
              Suite: {row.original.testRunTestCase.testSuite.name}
            </div>
          )}
        </div>
      )
    },
  },
  {
    id: 'duration',
    accessorFn: row => parseDurationMs(row.duration),
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ getValue }) => {
      const durationMs = getValue<number | undefined>()
      if (durationMs === undefined) return <span className="text-muted-foreground">Unavailable</span>
      const duration = durationMs < 1000 ? `${Number(durationMs.toFixed(2))} ms` : `${(durationMs / 1000).toFixed(2)} s`
      return <span className="tabular-nums">{duration}</span>
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
