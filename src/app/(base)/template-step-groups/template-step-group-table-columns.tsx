'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { TemplateStepGroup, TemplateStepGroupType } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { deleteTemplateStepGroupAction } from '@/actions/template-step-group/template-step-group-actions'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { CheckCheck, MousePointer2 } from 'lucide-react'

export const templateStepGroupTableCols: ColumnDef<TemplateStepGroup>[] = [
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
    accessorKey: 'type',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => {
      const templateStepGroup = row.original
      const icon =
        templateStepGroup.type === TemplateStepGroupType.ACTION ? (
          <MousePointer2 className="h-4 w-4" />
        ) : (
          <CheckCheck className="h-4 w-4" />
        )
      return (
        <Badge variant="outline" className="flex w-fit items-center gap-1">
          {icon}
          {templateStepGroup.type.charAt(0).toUpperCase() + templateStepGroup.type.slice(1).toLowerCase()}
        </Badge>
      )
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
      const templateStepGroup = row.original
      return (
        <TableActions
          modifyLink={`/template-step-groups/modify/${templateStepGroup.id}`}
          deleteHandler={() => deleteTemplateStepGroupAction([templateStepGroup.id])}
        />
      )
    },
  },
]
