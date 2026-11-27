'use client'

import { DataTableColumnHeader } from '@/components/ui/data-table-column-header'
import { TemplateTestCase, TemplateTestCaseStep } from '@prisma/client'
import { ColumnDef } from '@tanstack/react-table'

import { createDataTableSelectionColumn } from '@/components/ui/data-table-selection-column'
import TableActions from '@/components/table/table-actions'
import { deleteTemplateTestCaseAction } from '@/actions/template-test-case/template-test-case-actions'
import { formatDateTime } from '@/lib/utils'
import { withProjectScope } from '@/lib/project-scope'

export const templateTestCaseTableCols: ColumnDef<TemplateTestCase & { steps: TemplateTestCaseStep[] }>[] = [
  createDataTableSelectionColumn<TemplateTestCase & { steps: TemplateTestCaseStep[] }>(row => row.name),
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
  },
  {
    accessorKey: 'steps',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Steps" />,
    cell: ({ row }) => {
      const templateTestCase = row.original
      return <div>{templateTestCase.steps.length}</div>
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
      const templateTestCase = row.original
      return (
        <TableActions
          rowName={templateTestCase.name}
          modifyLink={withProjectScope(
            `/template-test-cases/modify/${templateTestCase.id}`,
            templateTestCase.targetProjectId,
          )}
          deleteHandler={() => deleteTemplateTestCaseAction([templateTestCase.id])}
        />
      )
    },
  },
]
