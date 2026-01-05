'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import {
  Report,
  Tag,
  ReportTestCase,
  TestRun,
  TestRunTestCase,
  TestCase,
  TestRunStatus,
  TestRunResult,
  Environment,
} from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, Clock, XCircle, Eye } from 'lucide-react'
import Link from 'next/link'

type ReportWithRelations = Report & {
  testRun: TestRun & {
    environment: Environment
    tags: Tag[]
  }
  testCases: (ReportTestCase & {
    testRunTestCase: TestRunTestCase & {
      testCase: TestCase & { tags?: Tag[] }
    }
  })[]
}

const formatDuration = (startDate: Date, endDate: Date | null) => {
  if (!endDate) return '-'
  const diffInMs = endDate.getTime() - startDate.getTime()
  const totalSeconds = Math.floor(diffInMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
}

const testRunStatusToBadge = (status: TestRunStatus) => {
  switch (status) {
    case TestRunStatus.COMPLETED:
      return (
        <Badge className="bg-primary">
          <CheckCircle className="mr-1 h-4 w-4" />
          Completed
        </Badge>
      )
    case TestRunStatus.CANCELLED:
      return (
        <Badge className="bg-pink-500 text-white">
          <XCircle className="mr-1 h-4 w-4" />
          Cancelled
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

const testRunResultToBadge = (result: TestRunResult) => {
  switch (result) {
    case TestRunResult.PASSED:
      return (
        <Badge className="bg-primary text-white">
          <CheckCircle className="mr-1 h-4 w-4" />
          Passed
        </Badge>
      )
    case TestRunResult.FAILED:
      return (
        <Badge className="bg-pink-500 text-white">
          <XCircle className="mr-1 h-4 w-4" />
          Failed
        </Badge>
      )
    case TestRunResult.CANCELLED:
      return (
        <Badge className="bg-gray-500 text-white">
          <XCircle className="mr-1 h-4 w-4" />
          Cancelled
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

export const reportTableCols: ColumnDef<ReportWithRelations>[] = [
  {
    id: 'testRunName',
    accessorFn: row => row.testRun.name || '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Run Name" />,
    cell: ({ row }) => {
      return <div className="font-medium">{row.original.testRun.name}</div>
    },
  },
  {
    id: 'testRunStatus',
    accessorFn: row => row.testRun.status || '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Run Status" />,
    cell: ({ row }) => {
      return testRunStatusToBadge(row.original.testRun.status)
    },
  },
  {
    id: 'tags',
    accessorFn: row => {
      const tags = row.testRun.tags || []
      return tags.map(tag => tag.name).join(' ')
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const tags = row.original.testRun.tags || []
      return (
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
        </div>
      )
    },
  },
  {
    id: 'environment',
    accessorFn: row => row.testRun.environment?.name || '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Environment" />,
    cell: ({ row }) => {
      return <div>{row.original.testRun.environment.name}</div>
    },
  },
  {
    id: 'duration',
    accessorFn: row => {
      const testRun = row.testRun
      if (!testRun.completedAt) return 0
      return testRun.completedAt.getTime() - testRun.startedAt.getTime()
    },
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => {
      const testRun = row.original.testRun
      return <div>{formatDuration(testRun.startedAt, testRun.completedAt)}</div>
    },
  },
  {
    id: 'totalTestCases',
    accessorFn: row => row.testCases.length,
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Test Cases Executed" />,
    cell: ({ row }) => {
      return <div>{row.original.testCases.length}</div>
    },
  },
  {
    id: 'testRunResult',
    accessorFn: row => row.testRun.result || '',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Run Result" />,
    cell: ({ row }) => {
      return testRunResultToBadge(row.original.testRun.result)
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const report = row.original
      return (
        <Link href={`/reports/${report.id}`}>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            View
          </Button>
        </Link>
      )
    },
  },
]
