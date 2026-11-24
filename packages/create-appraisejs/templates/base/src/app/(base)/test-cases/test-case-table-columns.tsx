'use client'

import { MessagesSquare } from 'lucide-react'
import Link from 'next/link'

import { deleteTestCaseAction } from '@/actions/test-case/test-case-actions'
import { testCaseDataColumns, testCaseSelectionColumn } from '@/components/test-case/test-case-columns'
import TableActions from '@/components/table/table-actions'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { conversationContextHref } from '@/lib/conversation/chat-context'
import { journeyRecordBriefHref } from '@/lib/quality-journey/record-context'
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
          rowName={testCase.title}
          modifyLink={`/test-cases/modify/${testCase.id}`}
          deleteHandler={() => deleteTestCaseAction([testCase.id])}
        >
          {testCase.targetProjectId && (
            <DropdownMenuItem
              render={
                <Link href={journeyRecordBriefHref(testCase.targetProjectId, { kind: 'test-case', id: testCase.id })} />
              }
              nativeButton={false}
            >
              <MessagesSquare aria-hidden="true" /> Use in a Journey
            </DropdownMenuItem>
          )}
          {testCase.targetProjectId && (
            <DropdownMenuItem
              render={
                <Link
                  href={conversationContextHref(testCase.targetProjectId, { kind: 'test-case', id: testCase.id })}
                />
              }
              nativeButton={false}
            >
              <MessagesSquare aria-hidden="true" /> Discuss in chat
            </DropdownMenuItem>
          )}
        </TableActions>
      )
    },
  },
]
