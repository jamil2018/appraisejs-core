'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { TestSuite, Tag, TestCase, Module } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { deleteTestSuiteAction } from '@/actions/test-suite/test-suite-actions'
import { formatDateTime } from '@/lib/utils'
export const testSuiteTableCols: ColumnDef<TestSuite & { tags?: Tag[]; module: Module; testCases: TestCase[] }>[] = [
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
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
  },
  {
    accessorKey: 'module.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Module" />,
  },
  {
    accessorKey: 'testCases.length',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Total Test Cases" />,
    cell: ({ row }) => {
      const testSuite = row.original
      return <div>{testSuite.testCases.length}</div>
    },
  },
  {
    accessorKey: 'tags',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tags" />,
    cell: ({ row }) => {
      const testSuite = row.original
      const tags = testSuite.tags || []
      return <div>{tags.length > 0 ? tags.map(tag => tag.name).join(', ') : '-'}</div>
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created At" />,
    cell: ({ row }) => {
      return formatDateTime(row.original.createdAt)
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
    id: 'actions',
    cell: ({ row }) => {
      const testSuite = row.original
      return (
        <TableActions
          modifyLink={`/test-suites/modify/${testSuite.id}`}
          deleteHandler={() => deleteTestSuiteAction([testSuite.id])}
        />
      )
    },
  },
]
