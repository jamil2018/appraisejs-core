'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import TableActions from '@/components/table/table-actions'
import { deleteTemplateStepAction } from '@/actions/template-step/template-step-actions'
import { TemplateStep, TemplateStepParameter, TemplateStepType } from '@prisma/client'
import { formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { CheckCheck, MousePointer2 } from 'lucide-react'
import { KeyToIconTransformer } from '@/lib/transformers/key-to-icon-transformer'

export const templateStepTableCols: ColumnDef<TemplateStep>[] = [
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
    accessorKey: 'icon',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Icon" />,
    cell: ({ row }) => {
      const templateStep = row.original
      return (
        <Badge variant="outline" className="flex w-fit items-center gap-1">
          {KeyToIconTransformer(templateStep.icon, 'h-4 w-4')}
          {templateStep.icon.charAt(0).toUpperCase() + templateStep.icon.slice(1).toLowerCase()}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'type',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    cell: ({ row }) => {
      const templateStep = row.original
      const icon =
        templateStep.type === TemplateStepType.ACTION ? (
          <MousePointer2 className="h-4 w-4" />
        ) : (
          <CheckCheck className="h-4 w-4" />
        )
      return (
        <Badge variant="outline" className="flex w-fit items-center gap-1">
          {icon} {templateStep.type.charAt(0).toUpperCase() + templateStep.type.slice(1).toLowerCase()}
        </Badge>
      )
    },
  },
  {
    accessorKey: 'parameters',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Parameters" />,
    cell: ({ row }) => {
      const parameters = row.original as TemplateStep & {
        parameters: TemplateStepParameter[]
      }
      return parameters.parameters.map((parameter: TemplateStepParameter) => parameter.name).join(', ')
    },
  },
  {
    accessorKey: 'signature',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Signature" />,
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
      const templateStep = row.original
      return (
        <TableActions
          modifyLink={`/template-steps/modify/${templateStep.id}`}
          deleteHandler={() => deleteTemplateStepAction([templateStep.id])}
        />
      )
    },
  },
]
