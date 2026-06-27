'use client'

import { deleteTestCaseAction } from '@/actions/test-case/test-case-actions'
import { testCaseDataColumns, testCaseSelectionColumn } from '@/components/test-case/test-case-columns'
import TableActions from '@/components/table/table-actions'
import { TestCasePickerRow } from '@/types/test-case-picker'
import { ColumnDef } from '@tanstack/react-table'

export const testCaseTableCols: ColumnDef<TestCasePickerRow>[] = [
  testCaseSelectionColumn,
  ...testCaseDataColumns,
  {
    id: 'actions',
    cell: ({ row }) => {
      const testCase = row.original

      return (
        <TableActions
          modifyLink={`/test-cases/modify/${testCase.id}`}
          deleteHandler={() => deleteTestCaseAction([testCase.id])}
        />
      )
    },
  },
]
