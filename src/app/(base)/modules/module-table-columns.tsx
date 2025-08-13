"use client";

import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { ColumnDef } from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";
import TableActions from "@/components/table/table-actions";
import { Module } from "@prisma/client";
import { deleteModuleAction } from "@/actions/modules/module-actions";
import { buildModulePathFromParent } from "@/lib/path-helpers/module-path";
import { formatDateTime } from "@/lib/utils";

export const moduleTableCols: ColumnDef<
  Module & { parent: { name: string } }
>[] = [
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
    accessorKey: "parent.name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Parent" />
    ),
    cell: ({ row }) => {
      const parent = row.original.parent;
      return <div>{parent?.name ?? "< root >"}</div>;
    },
  },
  {
    id: "path",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Path" />
    ),
    cell: ({ row, table }) => {
      const modules = table.options.data as (Module & {
        parent: { name: string };
      })[];
      const currentModule = row.original;
      const path = buildModulePathFromParent(modules, currentModule);
      return <div className="font-mono text-sm">{path}</div>;
    },
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
      const moduleData = row.original;
      return (
        <TableActions
          modifyLink={`/modules/modify/${moduleData.id}`}
          deleteHandler={() => deleteModuleAction([moduleData.id])}
        />
      );
    },
  },
];
