"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";
import TableActions from "@/components/table/table-actions";
import { deleteTemplateStepAction } from "@/actions/template-step/template-step-actions";
import { TemplateStep, TemplateStepParameter } from "@prisma/client";
import { formatDateTime } from "@/lib/utils";

export const templateStepTableCols: ColumnDef<TemplateStep>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="mr-2"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="mr-2"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="ID" />
    ),
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    accessorKey: "description",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
  },
  {
    accessorKey: "icon",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Icon" />
    ),
  },
  {
    accessorKey: "type",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
  },
  {
    accessorKey: "parameters",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Parameters" />
    ),
    cell: ({ row }) => {
      const parameters = row.original as TemplateStep & {
        parameters: TemplateStepParameter[];
      };
      return parameters.parameters
        .map((parameter: TemplateStepParameter) => parameter.name)
        .join(", ");
    },
  },
  {
    accessorKey: "signature",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Signature" />
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created At" />
    ),
    cell: ({ row }) => {
      return formatDateTime(row.original.createdAt);
    },
  },
  {
    accessorKey: "updatedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Updated At" />
    ),
    cell: ({ row }) => {
      return formatDateTime(row.original.updatedAt);
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const templateStep = row.original;
      return (
        <TableActions
          modifyLink={`/template-steps/modify/${templateStep.id}`}
          deleteHandler={() => deleteTemplateStepAction([templateStep.id])}
        />
      );
    },
  },
];
