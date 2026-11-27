'use client'

import {
  ColumnDef,
  type Table as TanStackTable,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type VisibilityState,
} from '@tanstack/react-table'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useRef } from 'react'
import { DataTablePagination } from './data-table-pagination'
import { DataTableViewOptions } from './data-table-view-options'
import { Eye, Pencil, PlusCircle, Search, X } from 'lucide-react'
import { Button } from './button'
import Link from 'next/link'
import { toast } from '@/hooks/use-toast'
import { ActionResponse } from '@/types/form/actionHandler'
import DeletePrompt from '../user-prompt/delete-prompt'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { useDataTableView } from './use-data-table-view'
import { withProjectScope } from '@/lib/project-scope'

type DataTableRowLike = {
  id?: string
  conflicts?: unknown[]
}

type DataTableCreateButtonOption = {
  label: string
  link: string
  icon?: React.ReactNode
}

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  filterColumn: string
  filterPlaceholder: string
  tableLabel: string
  createLink?: string
  modifyLink?: string
  modifyLinkProjectId?: string
  deleteAction?: (id: string[]) => Promise<ActionResponse>
  multiOptionCreateButton?: boolean
  createButtonOptions?: DataTableCreateButtonOption[]
  createMenuLabel?: string
  viewLink?: string
  showSelectedRows?: boolean
  density?: 'standard' | 'compact'
  initialColumnVisibility?: VisibilityState
  viewKey?: string
  getRowId?: (row: TData, index: number) => string
}

function hasDataTableRowShape(value: unknown): value is DataTableRowLike {
  return typeof value === 'object' && value !== null
}

function getResolvedRowId<TData>(row: TData, index: number, getRowId?: (row: TData, index: number) => string) {
  if (getRowId) {
    return getRowId(row, index)
  }

  if (hasDataTableRowShape(row) && typeof row.id === 'string') {
    return row.id
  }

  return `row-${index}`
}

function getEntityId<TData>(row: TData, index: number, getRowId?: (row: TData, index: number) => string) {
  if (getRowId) {
    return getRowId(row, index)
  }

  if (hasDataTableRowShape(row) && typeof row.id === 'string') {
    return row.id
  }

  return null
}

function rowHasConflicts(value: unknown) {
  return hasDataTableRowShape(value) && Array.isArray(value.conflicts) && value.conflicts.length > 0
}

function selectionForActions<TData>(table: TanStackTable<TData>, density: DataTableProps<TData, unknown>['density']) {
  return density === 'compact' ? table.getFilteredSelectedRowModel().rows : table.getSelectedRowModel().rows
}

function DataTableSearch<TData>({
  table,
  filterColumn,
  label,
}: {
  table: TanStackTable<TData>
  filterColumn: string
  label: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const column = table.getColumn(filterColumn)
  const value = String(column?.getFilterValue() ?? '')
  return (
    <div className="relative min-w-0 flex-[1_1_14rem] sm:max-w-md">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={input}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={event => column?.setFilterValue(event.target.value)}
        className="pl-9 pr-9"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 size-7 -translate-y-1/2 rounded-lg"
          aria-label="Clear search"
          onClick={() => {
            column?.setFilterValue('')
            input.current?.focus()
          }}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  tableLabel,
  createLink,
  multiOptionCreateButton,
  createButtonOptions,
  modifyLink,
  modifyLinkProjectId,
  viewLink,
  deleteAction,
  showSelectedRows = true,
  density = 'standard',
  initialColumnVisibility,
  viewKey,
  createMenuLabel = 'Create item',
  getRowId,
}: DataTableProps<TData, TValue>) {
  const { state, update, scrollRef } = useDataTableView(
    viewKey,
    initialColumnVisibility,
    density === 'compact' ? 20 : 10,
  )

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's useReactTable returns unstable refs; React Compiler skips memoization
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: update('sorting'),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: update('columnFilters'),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: update('pagination'),
    onRowSelectionChange: update('rowSelection'),
    onColumnVisibilityChange: update('columnVisibility'),
    state,
    getRowId: (row, index) => getResolvedRowId(row, index, getRowId),
  })

  const selectedRows = selectionForActions(table, density)
  const selectedIds = selectedRows.reduce<string[]>((ids, row) => {
    const value = getEntityId(row.original, row.index, getRowId)
    if (value !== null) {
      ids.push(value)
    }

    return ids
  }, [])
  const selectedRowCount = selectedRows.length
  const singleSelectedId = selectedRowCount === 1 ? (selectedIds[0] ?? null) : null

  const deleteHandler = async () => {
    if (!deleteAction || selectedIds.length === 0) {
      return false
    }

    const res = await deleteAction(selectedIds)
    if (res.status === 200) {
      toast({
        title: 'Item(s) deleted successfully',
      })
      return true
    }

    toast({
      title: 'Error deleting item(s)',
      description: res.message,
      variant: 'destructive',
    })

    return false
  }

  return (
    <div
      data-density={density}
      className="group/data-table min-w-0 space-y-3 rounded-xl border border-border bg-card p-3 data-[density=compact]:border-0 data-[density=compact]:bg-transparent data-[density=compact]:p-0 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <DataTableSearch table={table} filterColumn={filterColumn} label={filterPlaceholder} />
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <DataTableViewOptions table={table} />
          {createLink && (
            <Button
              variant="default"
              size="sm"
              aria-label="Create item"
              render={<Link href={createLink} />}
              nativeButton={false}
            >
              <PlusCircle className="size-4" aria-hidden="true" />
              Create
            </Button>
          )}
          {multiOptionCreateButton && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="default" size="sm" aria-label={createMenuLabel} />}>
                <PlusCircle className="size-4" aria-hidden="true" />
                Create
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{createMenuLabel}</DropdownMenuLabel>
                  {createButtonOptions?.map(option => (
                    <DropdownMenuItem key={option.label} render={<Link href={option.link} />} nativeButton={false}>
                      {option.icon}
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div
            className="contents data-[hidden=true]:hidden"
            data-hidden={density === 'compact' && selectedRowCount === 0}
          >
            {modifyLink &&
              (singleSelectedId ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Edit selected item"
                  render={
                    <Link
                      href={
                        modifyLinkProjectId
                          ? withProjectScope(`${modifyLink}/${singleSelectedId}`, modifyLinkProjectId)
                          : `${modifyLink}/${singleSelectedId}`
                      }
                    />
                  }
                  nativeButton={false}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                  <span className="sr-only">Edit selected item</span>
                </Button>
              ) : (
                <Button variant="outline" size="icon" aria-label="Edit selected item" disabled>
                  <Pencil className="size-4" aria-hidden="true" />
                  <span className="sr-only">Edit selected item</span>
                </Button>
              ))}
            {viewLink &&
              (singleSelectedId ? (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="View selected item"
                  render={<Link href={`${viewLink}/${singleSelectedId}`} />}
                  nativeButton={false}
                >
                  <Eye className="size-4" aria-hidden="true" />
                  <span className="sr-only">View selected item</span>
                </Button>
              ) : (
                <Button variant="outline" size="icon" aria-label="View selected item" disabled>
                  <Eye className="size-4" aria-hidden="true" />
                  <span className="sr-only">View selected item</span>
                </Button>
              ))}
            {deleteAction && (
              <DeletePrompt
                isDisabled={selectedIds.length === 0}
                dialogTitle="Delete Item"
                dialogDescription="Please confirm your action"
                confirmationText="Are you sure you want to delete the selected item(s)?"
                deleteHandler={deleteHandler}
                triggerLabel="Delete selected item(s)"
              />
            )}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <Table scrollLabel={tableLabel} scrollRef={scrollRef}>
          <TableHeader className="bg-secondary">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id} className="font-medium text-foreground">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => {
                return (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className={rowHasConflicts(row.original) ? 'bg-destructive/10' : ''}
                  >
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} className="group-data-[density=compact]/data-table:py-0.5">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-16 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination table={table} showSelectedRows={showSelectedRows} />
    </div>
  )
}
