'use client'

import TableActions from '@/components/table/table-actions'
import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import { deleteModuleAction } from '@/actions/modules/module-actions'
import { buildModulePath } from '@/lib/path-helpers/module-path'
import { formatDateTime } from '@/lib/utils'
import { ColumnDef } from '@tanstack/react-table'

import { type ModuleTableRow } from './module-helpers'

export const moduleTableCols: ColumnDef<ModuleTableRow>[] = [
  createDataTableSelectionColumn<ModuleTableRow>(row => row.name),
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'parent.name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Parent" />,
    cell: ({ row }) => {
      const parent = row.original.parent
      return <div>{parent?.name ?? '< root >'}</div>
    },
  },
  {
    id: 'path',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Path" />,
    cell: ({ row, table }) => {
      const path = buildModulePath(table.options.data, row.original)
      return <div className="font-mono text-sm">{path}</div>
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
      const moduleData = row.original
      return (
        <TableActions
          rowName={moduleData.name}
          modifyLink={`/modules/modify/${moduleData.id}`}
          deleteHandler={() => deleteModuleAction([moduleData.id])}
        />
      )
    },
  },
]
