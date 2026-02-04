'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import {
  BrowserEngine,
  Environment,
  Tag,
  TagType,
  TestRun,
  TestRunResult,
  TestRunStatus,
  TestRunTestCase,
} from '@prisma/client'
import { cancelTestRunAction, deleteTestRunAction } from '@/actions/test-run/test-run-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, Compass, Flame, ListEnd, LoaderCircle, XCircle } from 'lucide-react'

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
      className="h-4 w-4"
    >
      <path d="M10.88 21.94 15.46 14" />
      <path d="M21.17 8H12" />
      <path d="M3.95 6.06 8.54 14" />
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  [BrowserEngine.FIREFOX]: <Flame className="h-4 w-4" />,
  [BrowserEngine.WEBKIT]: <Compass className="h-4 w-4" />,
}

export const testRunTableCols: ColumnDef<
  TestRun & { testCases: TestRunTestCase[]; tags: Tag[]; environment: Environment }
>[] = [
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
    cell: ({ row }) => {
      const status = row.original.status
      const statusColorMap = {
        [TestRunStatus.QUEUED]: 'bg-gray-500 text-white',
        [TestRunStatus.RUNNING]: 'bg-blue-500 text-white',
        [TestRunStatus.CANCELLING]: 'bg-orange-500 text-white',
        [TestRunStatus.COMPLETED]: 'bg-primary',
        [TestRunStatus.CANCELLED]: 'bg-pink-500 text-white',
      }
      const statusIconMap = {
        [TestRunStatus.QUEUED]: <ListEnd className="h-4 w-4" />,
        [TestRunStatus.RUNNING]: <LoaderCircle className="h-4 w-4 animate-spin" />,
        [TestRunStatus.CANCELLING]: <LoaderCircle className="h-4 w-4 animate-spin" />,
        [TestRunStatus.COMPLETED]: <CheckCircle className="h-4 w-4" />,
        [TestRunStatus.CANCELLED]: <XCircle className="h-4 w-4" />,
      }
      const statusTextMap = {
        [TestRunStatus.QUEUED]: 'Queued',
        [TestRunStatus.RUNNING]: 'Running',
        [TestRunStatus.CANCELLING]: 'Cancelling',
        [TestRunStatus.COMPLETED]: 'Completed',
        [TestRunStatus.CANCELLED]: 'Cancelled',
      }
      return (
        <Badge className={`${statusColorMap[status]} w-full text-center`}>
          <span className="mr-1">{statusIconMap[status]}</span>
          <span>{statusTextMap[status]}</span>
        </Badge>
      )
    },
  },
  {
    accessorKey: 'result',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Result" />,
    cell: ({ row }) => {
      const result = row.original.result
      const resultColorMap = {
        [TestRunResult.PASSED]: 'bg-primary',
        [TestRunResult.FAILED]: 'bg-pink-500 text-white',
        [TestRunResult.CANCELLED]: 'bg-gray-500 text-white',
        [TestRunResult.PENDING]: 'bg-yellow-500 text-white',
      }
      const resultIconMap = {
        [TestRunResult.PASSED]: <CheckCircle className="h-4 w-4" />,
        [TestRunResult.FAILED]: <XCircle className="h-4 w-4" />,
        [TestRunResult.CANCELLED]: <XCircle className="h-4 w-4" />,
        [TestRunResult.PENDING]: <LoaderCircle className="h-4 w-4 animate-spin" />,
      }
      const resultTextMap = {
        [TestRunResult.PASSED]: 'Passed',
        [TestRunResult.FAILED]: 'Failed',
        [TestRunResult.CANCELLED]: 'Cancelled',
        [TestRunResult.PENDING]: 'Pending',
      }
      return (
        <Badge className={`${resultColorMap[result]} w-full text-center`}>
          <span className="mr-1">{resultIconMap[result]}</span>
          <span>{resultTextMap[result]}</span>
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
      const browserEngineColorMap = {
        [BrowserEngine.CHROMIUM]: 'bg-blue-500 text-white',
        [BrowserEngine.FIREFOX]: 'bg-red-500 text-white',
        [BrowserEngine.WEBKIT]: 'bg-purple-500 text-white',
      }
      return (
        <Badge className={`${browserEngineColorMap[browserEngine]} w-fit`}>
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
