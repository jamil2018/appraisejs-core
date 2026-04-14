'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DataTablePagination } from '@/components/ui/data-table-pagination'
import { testCasePickerColumns } from '@/components/test-case/test-case-columns'
import { Badge } from '@/components/ui/badge'
import { TestCasePickerRow } from '@/types/test-case-picker'
import {
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  createSelectionState,
  getSavedTestCases,
  getSelectedIdsFromRowSelection,
  getSelectionSummaryLabel,
  testCaseMatchesQuery,
} from './test-case-picker-helpers'

type TestCasePickerProps = {
  testCases: TestCasePickerRow[]
  selectedIds: string[]
  onSave: (selectedIds: string[]) => void
  triggerPlaceholder: string
  dialogTitle: string
  dialogDescription: string
  selectedLabel: string
}

export function TestCasePicker({
  testCases,
  selectedIds,
  onSave,
  triggerPlaceholder,
  dialogTitle,
  dialogDescription,
  selectedLabel,
}: TestCasePickerProps) {
  const [open, setOpen] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(() => createSelectionState(selectedIds))
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  })

  const openDialog = () => {
    setRowSelection(createSelectionState(selectedIds))
    setColumnFilters([])
    setGlobalFilter('')
    setPagination(current => ({
      ...current,
      pageIndex: 0,
    }))
    setOpen(true)
  }

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's useReactTable returns unstable refs; React Compiler skips memoization
  const table = useReactTable({
    data: testCases,
    columns: testCasePickerColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: row => row.id,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
      pagination,
    },
    globalFilterFn: (row, _columnId, filterValue) => testCaseMatchesQuery(row.original, filterValue),
  })

  const savedTestCases = getSavedTestCases(testCases, selectedIds)
  const selectionSummaryLabel = getSelectionSummaryLabel(selectedLabel)
  const shouldConstrainSavedListHeight = savedTestCases.length > 3

  const saveDraftSelection = () => {
    const nextSelectedIds = getSelectedIdsFromRowSelection(testCases, rowSelection)

    onSave(nextSelectedIds)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" className="justify-between" onClick={openDialog}>
        <span className={selectedIds.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedIds.length > 0 ? `${selectedIds.length} ${selectionSummaryLabel.toLowerCase()} selected` : triggerPlaceholder}
        </span>
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Browse</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={globalFilter}
                  onChange={event => table.setGlobalFilter(event.target.value)}
                  placeholder="Search by title, description, or tag..."
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground">{table.getSelectedRowModel().rows.length} selected</div>
            </div>

            <ScrollArea className="h-[420px] rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  {table.getHeaderGroups().map(headerGroup => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map(header => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length > 0 ? (
                    table.getRowModel().rows.map(row => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}>
                        {row.getVisibleCells().map(cell => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={testCasePickerColumns.length} className="h-24 text-center">
                        No test cases found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <DataTablePagination table={table} showSelectedRows={false} />
          </div>

          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveDraftSelection}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {savedTestCases.length > 0 && (
        <div className="rounded-md border bg-muted/20">
          <div className="border-b px-4 py-3 text-sm font-medium">{selectedLabel}</div>
          <ScrollArea className={cn(shouldConstrainSavedListHeight && 'h-56')}>
            <div className="space-y-3 p-4">
              {savedTestCases.map(testCase => (
                <div key={testCase.id} className="rounded-md border bg-background p-3">
                  <div className="mb-1 text-sm font-semibold">{testCase.title}</div>
                  <p className="text-xs text-muted-foreground">{testCase.description?.trim() || 'No description provided.'}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="secondary">{testCase.steps.length} steps</Badge>
                    {testCase.tags.slice(0, 3).map(tag => (
                      <Badge key={tag.id} variant="outline">
                        {tag.name}
                      </Badge>
                    ))}
                    {testCase.tags.length > 3 && <Badge variant="outline">+{testCase.tags.length - 3} more</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export default TestCasePicker
