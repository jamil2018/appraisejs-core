'use client'

import {
  ColumnDef,
  type RowSelectionState,
  flexRender,
  getCoreRowModel,
  useReactTable,
  SortingState,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/react-table'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useState } from 'react'
import { DataTablePagination } from './data-table-pagination'
import { DataTableViewOptions } from './data-table-view-options'
import { Eye, Pencil, PlusCircle, Search } from 'lucide-react'
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
  DropdownMenuTrigger,
} from './dropdown-menu'

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
  createLink?: string
  modifyLink?: string
  deleteAction?: (id: string[]) => Promise<ActionResponse>
  multiOptionCreateButton?: boolean
  createButtonOptions?: DataTableCreateButtonOption[]
  createMenuLabel?: string
  viewLink?: string
  showSelectedRows?: boolean
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

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder,
  createLink,
  multiOptionCreateButton,
  createButtonOptions,
  modifyLink,
  viewLink,
  deleteAction,
  showSelectedRows = true,
  createMenuLabel = 'Create item',
  getRowId,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's useReactTable returns unstable refs; React Compiler skips memoization
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      pagination,
    },
    getRowId: (row, index) => getResolvedRowId(row, index, getRowId),
  })

  const selectedRows = table.getSelectedRowModel().rows
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
    <div className="mb-10">
      <div className="flex justify-end">
        <div className="mb-4 flex gap-2">
          {createLink && (
            <Button variant="default" size="icon" aria-label="Create item" asChild>
              <Link href={createLink}>
                <PlusCircle className="size-4" aria-hidden="true" />
                <span className="sr-only">Create item</span>
              </Link>
            </Button>
          )}
          {multiOptionCreateButton && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="icon" aria-label={createMenuLabel}>
                  <PlusCircle className="size-4" aria-hidden="true" />
                  <span className="sr-only">{createMenuLabel}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>{createMenuLabel}</DropdownMenuLabel>
                {createButtonOptions?.map(option => (
                  <DropdownMenuItem key={option.label} asChild>
                    <Link href={option.link}>
                      {option.icon}
                      {option.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {modifyLink &&
            (singleSelectedId ? (
              <Button variant="outline" size="icon" aria-label="Edit selected item" asChild>
                <Link href={`${modifyLink}/${singleSelectedId}`}>
                  <Pencil className="size-4" aria-hidden="true" />
                  <span className="sr-only">Edit selected item</span>
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon" aria-label="Edit selected item" disabled>
                <Pencil className="size-4" aria-hidden="true" />
                <span className="sr-only">Edit selected item</span>
              </Button>
            ))}
          {viewLink &&
            (singleSelectedId ? (
              <Button variant="outline" size="icon" aria-label="View selected item" asChild>
                <Link href={`${viewLink}/${singleSelectedId}`}>
                  <Eye className="size-4" aria-hidden="true" />
                  <span className="sr-only">View selected item</span>
                </Link>
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
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <Search className="mr-2 size-6" />
          <Input
            placeholder={filterPlaceholder}
            value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ''}
            onChange={event => table.getColumn(filterColumn)?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <DataTableViewOptions table={table} />
      </div>
      <div className="mb-4">
        <Table>
          <TableHeader className="bg-white dark:bg-muted">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id} className="font-bold dark:text-white">
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
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
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
