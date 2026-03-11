'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { Environment } from '@prisma/client'
import { deleteEnvironmentAction } from '@/actions/environments/environment-actions'
import { formatDateTime } from '@/lib/utils'

export const environmentTableCols: ColumnDef<Environment>[] = [
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
    accessorKey: 'baseUrl',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Base URL" />,
    cell: ({ row }) => {
      const baseUrl = row.original.baseUrl
      return (
        <div className="max-w-[200px] truncate font-mono text-sm" title={baseUrl}>
          {baseUrl}
        </div>
      )
    },
  },
  {
    accessorKey: 'apiBaseUrl',
    header: ({ column }) => <DataTableColumnHeader column={column} title="API Base URL" />,
    cell: ({ row }) => {
      const apiBaseUrl = row.original.apiBaseUrl
      return (
        <div className="max-w-[200px] truncate font-mono text-sm" title={apiBaseUrl || ''}>
          {apiBaseUrl || '-'}
        </div>
      )
    },
  },
  {
    accessorKey: 'username',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Username" />,
    cell: ({ row }) => {
      const username = row.original.username
      return <div className="max-w-[150px] truncate">{username || '-'}</div>
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
      const environmentData = row.original
      return (
        <TableActions
          modifyLink={`/environments/modify/${environmentData.id}`}
          deleteHandler={() => deleteEnvironmentAction([environmentData.id])}
        />
      )
    },
  },
]
