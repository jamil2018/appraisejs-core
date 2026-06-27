'use client'

import { memo } from 'react'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'
import type { CheckedState } from '@radix-ui/react-checkbox'

import { TestSuitePickerSuiteRowHeader } from './test-suite-picker-suite-row-header'
import { TestSuitePickerTestCaseList } from './test-suite-picker-test-case-list'

type TestSuitePickerSuiteRowProps = {
  testSuite: TestSuitePickerRow
  currentSelection: TestSuiteSelection | undefined
  isExpanded: boolean
  onToggleExpand: (suiteId: string) => void
  onSuiteSelection: (suite: TestSuitePickerRow, checked: boolean) => void
  onChildSelection: (suite: TestSuitePickerRow, testCaseId: string, checked: boolean) => void
}

function TestSuitePickerSuiteRowInner({
  testSuite,
  currentSelection,
  isExpanded,
  onToggleExpand,
  onSuiteSelection,
  onChildSelection,
}: TestSuitePickerSuiteRowProps) {
  const childIds = testSuite.testCases.map(testCase => testCase.id)
  const selectedChildIds = currentSelection?.runAll ? childIds : (currentSelection?.testCaseIds ?? [])
  const selectionCount = selectedChildIds.length
  const suiteCheckedState: CheckedState =
    selectionCount === 0 ? false : selectionCount === childIds.length ? true : 'indeterminate'

  return (
    <div className="bg-background">
      <TestSuitePickerSuiteRowHeader
        testSuite={testSuite}
        currentSelection={currentSelection}
        isExpanded={isExpanded}
        suiteCheckedState={suiteCheckedState}
        childCount={childIds.length}
        selectionCount={selectionCount}
        onToggleExpand={onToggleExpand}
        onSuiteSelection={onSuiteSelection}
      />

      {isExpanded ? (
        <div className="bg-muted/20 border-t px-4 py-3">
          <TestSuitePickerTestCaseList
            testSuite={testSuite}
            currentSelection={currentSelection}
            onChildSelection={onChildSelection}
          />
        </div>
      ) : null}
    </div>
  )
}

export const TestSuitePickerSuiteRow = memo(TestSuitePickerSuiteRowInner)

TestSuitePickerSuiteRow.displayName = 'TestSuitePickerSuiteRow'
