'use client'

import { PickerBrowseDialogFrame, PickerBrowseTriggerButton } from '@/components/ui/picker-browse-shell'
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
import { useReducer } from 'react'
import { cn } from '@/lib/utils'
import {
  createSelectionState,
  getSavedTestCases,
  getSelectedIdsFromRowSelection,
  getSelectionSummaryLabel,
  testCaseMatchesQuery,
} from './test-case-picker-helpers'

type Updater<T> = T | ((prev: T) => T)

function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater
}

type TestCasePickerProps = {
  testCases: TestCasePickerRow[]
  selectedIds: string[]
  onSave: (selectedIds: string[]) => void
  triggerPlaceholder: string
  dialogTitle: string
  dialogDescription: string
  selectedLabel: string
}

const defaultPagination: PaginationState = {
  pageIndex: 0,
  pageSize: 10,
}

type PickerState = {
  open: boolean
  sorting: SortingState
  columnFilters: ColumnFiltersState
  globalFilter: string
  rowSelection: RowSelectionState
  pagination: PaginationState
}

type PickerAction =
  | { type: 'openDialog'; selectedIds: string[] }
  | { type: 'setOpen'; open: boolean }
  | { type: 'setSorting'; updater: Updater<SortingState> }
  | { type: 'setColumnFilters'; updater: Updater<ColumnFiltersState> }
  | { type: 'setGlobalFilter'; updater: Updater<string> }
  | { type: 'setPagination'; updater: Updater<PaginationState> }
  | { type: 'setRowSelection'; updater: Updater<RowSelectionState> }

function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case 'openDialog':
      return {
        ...state,
        open: true,
        rowSelection: createSelectionState(action.selectedIds),
        columnFilters: [],
        globalFilter: '',
        pagination: { ...state.pagination, pageIndex: 0 },
      }
    case 'setOpen':
      return { ...state, open: action.open }
    case 'setSorting':
      return { ...state, sorting: applyUpdater(action.updater, state.sorting) }
    case 'setColumnFilters':
      return { ...state, columnFilters: applyUpdater(action.updater, state.columnFilters) }
    case 'setGlobalFilter':
      return { ...state, globalFilter: applyUpdater(action.updater, state.globalFilter) }
    case 'setPagination':
      return { ...state, pagination: applyUpdater(action.updater, state.pagination) }
    case 'setRowSelection':
      return { ...state, rowSelection: applyUpdater(action.updater, state.rowSelection) }
    default:
      return state
  }
}

function createInitialPickerState(selectedIds: string[]): PickerState {
  return {
    open: false,
    sorting: [],
    columnFilters: [],
    globalFilter: '',
    rowSelection: createSelectionState(selectedIds),
    pagination: { ...defaultPagination },
  }
}

function TestCasePicker({
  testCases,
  selectedIds,
  onSave,
  triggerPlaceholder,
  dialogTitle,
  dialogDescription,
  selectedLabel,
}: TestCasePickerProps) {
  const [state, dispatch] = useReducer(pickerReducer, selectedIds, createInitialPickerState)
  const { open, sorting, columnFilters, globalFilter, rowSelection, pagination } = state

  const openDialog = () => {
    dispatch({ type: 'openDialog', selectedIds })
  }

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's useReactTable returns unstable refs; React Compiler skips memoization
  const table = useReactTable({
    data: testCases,
    columns: testCasePickerColumns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: updater => dispatch({ type: 'setSorting', updater }),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: updater => dispatch({ type: 'setColumnFilters', updater }),
    onGlobalFilterChange: updater => dispatch({ type: 'setGlobalFilter', updater }),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onPaginationChange: updater => dispatch({ type: 'setPagination', updater }),
    onRowSelectionChange: updater => dispatch({ type: 'setRowSelection', updater }),
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
    dispatch({ type: 'setOpen', open: false })
  }

  return (
    <div className="flex flex-col gap-3">
      <PickerBrowseTriggerButton
        selected={selectedIds.length > 0}
        summaryWhenSelected={`${selectedIds.length} ${selectionSummaryLabel.toLowerCase()} selected`}
        placeholder={triggerPlaceholder}
        onClick={openDialog}
      />

      <PickerBrowseDialogFrame
        open={open}
        onOpenChange={nextOpen => dispatch({ type: 'setOpen', open: nextOpen })}
        title={dialogTitle}
        description={dialogDescription}
        searchValue={globalFilter}
        onSearchChange={value => table.setGlobalFilter(value)}
        searchPlaceholder="Search by title, description, or tag..."
        summaryAside={`${table.getSelectedRowModel().rows.length} selected`}
        onCancel={() => dispatch({ type: 'setOpen', open: false })}
        onSave={saveDraftSelection}
      >
        <ScrollArea className="h-[420px] rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map(headerGroup => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
      </PickerBrowseDialogFrame>

      {savedTestCases.length > 0 && (
        <div className="bg-muted/20 rounded-md border">
          <div className="border-b px-4 py-3 text-sm font-medium">{selectedLabel}</div>
          <ScrollArea className={cn(shouldConstrainSavedListHeight && 'h-56')}>
            <div className="space-y-3 p-4">
              {savedTestCases.map(testCase => (
                <div key={testCase.id} className="rounded-md border bg-background p-3">
                  <div className="mb-1 text-sm font-semibold">{testCase.title}</div>
                  <p className="text-xs text-muted-foreground">
                    {testCase.description?.trim() || 'No description provided.'}
                  </p>
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
