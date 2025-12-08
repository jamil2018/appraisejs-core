'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { Environment, Tag, TestRun, TestRunResult, TestRunStatus, TestRunTestCase } from '@prisma/client'
import { cancelTestRunAction, deleteTestRunAction } from '@/actions/test-run/test-run-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, ListEnd, LoaderCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    accessorKey: 'runId',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Run ID" />,
  },
  {
    accessorKey: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const status = row.original.status
      const statusColorMap = {
        [TestRunStatus.QUEUED]: 'bg-gray-500',
        [TestRunStatus.RUNNING]: 'bg-blue-500',
        [TestRunStatus.CANCELLING]: 'bg-orange-500',
        [TestRunStatus.COMPLETED]: 'bg-green-700',
        [TestRunStatus.CANCELLED]: 'bg-red-500',
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
        <Badge variant="outline" className={`${statusColorMap[status]} py-1`}>
          <span className="mr-1 text-white">{statusIconMap[status]}</span>
          <span className="text-white">{statusTextMap[status]}</span>
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
        [TestRunResult.PASSED]: 'bg-green-700',
        [TestRunResult.FAILED]: 'bg-red-500',
        [TestRunResult.CANCELLED]: 'bg-gray-500',
        [TestRunResult.PENDING]: 'bg-gray-500',
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
        <Badge variant="outline" className={`${resultColorMap[result]} py-1`}>
          <span className="mr-1 text-white">{resultIconMap[result]}</span>
          <span className="text-white">{resultTextMap[result]}</span>
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
      return (
        <div className="flex flex-wrap gap-1">
          {tags.length > 0 ? tags.map(tag => <Badge key={tag.id}>{tag.name}</Badge>) : '-'}
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
