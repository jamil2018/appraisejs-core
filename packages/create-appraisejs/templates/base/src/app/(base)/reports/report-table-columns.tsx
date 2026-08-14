'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { TagType } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import Link from 'next/link'
import { formatDuration } from './report-detail-helpers'
import type { ReportWithRelations } from '@/types/report'
import { TestRunResultBadge, TestRunStatusBadge } from '@/components/test-run/test-run-report-badges'

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
      return <TestRunStatusBadge status={row.original.testRun.status} />
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
      const tags = row.original.testRun.tags.filter(tag => tag.type === TagType.FILTER) || []
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
      return <TestRunResultBadge result={row.original.testRun.result} />
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const report = row.original
      return (
        <Link href={`/reports/${report.id}`}>
          <Button variant="outline" size="sm" className="flex items-center gap-2">
            <Eye className="size-4" />
            View
          </Button>
        </Link>
      )
    },
  },
]
