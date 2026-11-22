import type { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'

export function createDataTableSelectionColumn<TData>(getRowName: (row: TData) => string): ColumnDef<TData> {
  return {
    id: 'select',
    header: ({ table }) => {
      const checked = table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')

      return (
        <Checkbox
          checked={checked}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all on this page"
          className="mr-2"
        />
      )
    },
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={value => row.toggleSelected(!!value)}
        aria-label={`Select ${getRowName(row.original)}`}
        className="mr-2"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }
}
