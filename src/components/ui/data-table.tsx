'use client'

import {
  ColumnDef,
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
import { randomBytes } from 'crypto'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './dropdown-menu'

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  filterColumn: string
  filterPlaceholder: string
  createLink?: string
  modifyLink?: string
  deleteAction?: (id: string[]) => Promise<ActionResponse>
  multiOptionCreateButton?: boolean
  createButtonOptions?: {
    label: string
    link: string
    icon?: React.ReactNode
  }[]
  viewLink?: string
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
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState({})
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

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
    getRowId: () => {
      return randomBytes(16).toString('hex')
    },
  })

  const deleteHandler = async () => {
    const selectedIds = table.getSelectedRowModel().rows.map(row => (row.original as { id: string }).id)
    if (deleteAction) {
      const res = await deleteAction(selectedIds)
      if (res.status === 200) {
        toast({
          title: 'Item(s) deleted successfully',
        })
      } else {
        toast({
          title: 'Error deleting item(s)',
          description: res.message,
        })
      }
    }
  }

  return (
    <div className="mb-10">
      <div className="flex justify-end">
        <div className="mb-4 flex gap-2">
          {createLink && (
            <Button variant="default" size="icon">
              <Link href={createLink}>
                <PlusCircle className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {multiOptionCreateButton && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="default" size="icon">
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Create Test Case</DropdownMenuLabel>
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
          {modifyLink && (
            <Button
              variant="outline"
              size="icon"
              disabled={table.getSelectedRowModel().rows.length === 0 || table.getSelectedRowModel().rows.length > 1}
            >
              <Link
                href={`${modifyLink}/${
                  table.getSelectedRowModel().rows.length > 0
                    ? (
                        table.getSelectedRowModel().rows[0].original as {
                          id: string
                        }
                      ).id
                    : ''
                }`}
              >
                <Pencil className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {viewLink && (
            <Button
              variant="outline"
              size="icon"
              disabled={table.getSelectedRowModel().rows.length === 0 || table.getSelectedRowModel().rows.length > 1}
            >
              <Link
                href={`${viewLink}/${
                  table.getSelectedRowModel().rows.length > 0
                    ? (
                        table.getSelectedRowModel().rows[0].original as {
                          id: string
                        }
                      ).id
                    : ''
                }`}
              >
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
          )}
          {deleteAction && (
            <DeletePrompt
              isDisabled={table.getSelectedRowModel().rows.length === 0}
              dialogTitle="Delete Item"
              dialogDescription="Please confirm your action"
              confirmationText="Are you sure you want to delete the selected item(s)?"
              deleteHandler={deleteHandler}
            />
          )}
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center">
          <Search className="mr-2 h-6 w-6" />
          <Input
            placeholder={filterPlaceholder}
            value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ''}
            onChange={event => table.getColumn(filterColumn)?.setFilterValue(event.target.value)}
            className="max-w-sm"
          />
        </div>
        <DataTableViewOptions table={table} />
      </div>
      <div className="mb-4 rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map(header => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                  ))}
                </TableRow>
              ))
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
      <DataTablePagination table={table} />
    </div>
  )
}
