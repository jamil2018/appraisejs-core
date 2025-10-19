'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { Environment, Tag, TestRun, TestRunResult, TestRunStatus, TestRunTestCase } from '@prisma/client'
import { deleteTestRunAction } from '@/actions/test-run/test-run-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { CheckCircle, ListEnd, LoaderCircle, XCircle } from 'lucide-react'

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
        [TestRunStatus.COMPLETED]: 'bg-green-700',
        [TestRunStatus.CANCELLED]: 'bg-red-500',
      }
      const statusIconMap = {
        [TestRunStatus.QUEUED]: <ListEnd className="h-4 w-4" />,
        [TestRunStatus.RUNNING]: <LoaderCircle className="h-4 w-4 animate-spin" />,
        [TestRunStatus.COMPLETED]: <CheckCircle className="h-4 w-4" />,
        [TestRunStatus.CANCELLED]: <XCircle className="h-4 w-4" />,
      }
      const statusTextMap = {
        [TestRunStatus.QUEUED]: 'Queued',
        [TestRunStatus.RUNNING]: 'Running',
        [TestRunStatus.COMPLETED]: 'Completed',
        [TestRunStatus.CANCELLED]: 'Cancelled',
      }
      return (
        <Badge variant="outline" className={`${statusColorMap[status]} py-1`}>
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
      return <div>{tags.map(tag => tag.name).join(', ')}</div>
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
    accessorKey: 'updatedAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
    cell: ({ row }) => {
      return formatDateTime(row.original.updatedAt)
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
        <TableActions
          modifyLink={`/test-runs/modify/${testRunData.id}`}
          deleteHandler={() => deleteTestRunAction([testRunData.id])}
        />
      )
    },
  },
]
