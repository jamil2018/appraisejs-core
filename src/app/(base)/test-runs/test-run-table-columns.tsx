'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import TableActions from '@/components/table/table-actions'
import { BrowserEngine, Environment, Tag, TagType, TestRun, TestRunStatus, TestRunTestCase } from '@prisma/client'
import { cancelTestRunAction, deleteTestRunAction } from '@/actions/test-run/test-run-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Compass, Flame } from 'lucide-react'
import { TestRunResultBadge, TestRunStatusBadge } from '@/components/test-run/test-run-report-badges'
import { getEvidenceHealthMeta } from '@/components/test-run/test-run-details-helpers'

const BrowserEngineIcon = {
  [BrowserEngine.CHROMIUM]: (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M10.88 21.94 15.46 14" />
      <path d="M21.17 8H12" />
      <path d="M3.95 6.06 8.54 14" />
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  [BrowserEngine.FIREFOX]: <Flame className="size-4" />,
  [BrowserEngine.WEBKIT]: <Compass className="size-4" />,
}

export const testRunTableCols: ColumnDef<
  TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment }
>[] = [
  createDataTableSelectionColumn<TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment }>(
    row => row.name,
  ),
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'runId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Run ID" />,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => <TestRunStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: 'result',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Result" />,
    cell: ({ row }) => <TestRunResultBadge result={row.original.result} />,
  },
  {
    accessorKey: 'evidenceHealth',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Evidence" />,
    cell: ({ row }) => {
      const meta = getEvidenceHealthMeta(row.original.evidenceHealth)
      const Icon = meta.icon
      return (
        <Badge className={`${meta.badgeClassName ?? ''} w-full text-center`}>
          <Icon className="mr-1 size-4" />
          <span>{meta.label}</span>
        </Badge>
      )
    },
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
    accessorKey: 'testWorkersCount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Test Workers Count" />,
  },
  {
    accessorKey: 'browserEngine',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Browser Engine" />,
    cell: ({ row }) => {
      const browserEngine = row.original.browserEngine
      return (
        <Badge variant="outline" className="w-fit gap-1">
          <span className="mr-2">{BrowserEngineIcon[browserEngine]}</span>
          <span>{browserEngine.charAt(0).toUpperCase() + browserEngine.slice(1).toLowerCase()}</span>
        </Badge>
      )
    },
  },
  {
    accessorKey: 'environment.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Environment" />,
  },
  {
    accessorKey: 'tags',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const tags = row.original.tags
      const filterTags = tags.filter(tag => tag.type === TagType.FILTER)
      return (
        <div className="flex flex-wrap gap-1">
          {filterTags.length > 0 ? filterTags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
        </div>
      )
    },
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
    id: 'actions',
    cell: ({ row }) => {
      const testRunData = row.original
      return (
        <div>
          <TableActions
            rowName={testRunData.name}
            viewLink={`/test-runs/${testRunData.id}`}
            deleteHandler={() => deleteTestRunAction([testRunData.id])}
            cancelHandler={() => cancelTestRunAction(testRunData.runId)}
            showCancelButton={
              testRunData.status === TestRunStatus.RUNNING ||
              testRunData.status === TestRunStatus.QUEUED ||
              testRunData.status === TestRunStatus.CANCELLING
            }
            cancelButtonDisabled={testRunData.status === TestRunStatus.CANCELLING}
            deleteButtonDisabled={
              testRunData.status === TestRunStatus.CANCELLING || testRunData.status === TestRunStatus.RUNNING
            }
          />
        </div>
      )
    },
  },
]
