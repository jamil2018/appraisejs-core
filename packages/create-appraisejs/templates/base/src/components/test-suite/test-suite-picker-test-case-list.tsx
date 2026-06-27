'use client'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { getFilterTags } from '@/lib/tag-filters'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'

type TestSuitePickerTestCaseListProps = {
  testSuite: TestSuitePickerRow
  currentSelection: TestSuiteSelection | undefined
  onChildSelection: (suite: TestSuitePickerRow, testCaseId: string, checked: boolean) => void
}

function TestSuitePickerTestCaseRow({
  testSuite,
  testCase,
  checked,
  onChildSelection,
}: {
  testSuite: TestSuitePickerRow
  testCase: TestSuitePickerRow['testCases'][number]
  checked: boolean
  onChildSelection: (suite: TestSuitePickerRow, testCaseId: string, checked: boolean) => void
}) {
  const testCaseTags = getFilterTags(testCase.tags)
  const testCaseCheckboxId = `test-suite-${testSuite.id}-test-case-${testCase.id}`

  return (
    <label
      htmlFor={testCaseCheckboxId}
      className={cn('flex items-start gap-3 rounded-md border bg-background px-3 py-3', checked && 'border-primary/40')}
    >
      <Checkbox
        id={testCaseCheckboxId}
        checked={checked}
        onCheckedChange={value => onChildSelection(testSuite, testCase.id, !!value)}
        aria-label={`Select test case ${testCase.title}`}
        className="mt-1"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{testCase.title}</span>
          <Badge variant="secondary">{testCase.steps.length} steps</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {testCase.description?.trim() || 'No description provided.'}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {testCaseTags.length > 0 ? (
            testCaseTags.map(tag => (
              <Badge key={tag.id} variant="outline">
                {tag.name}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">No filter tags</span>
          )}
        </div>
      </div>
    </label>
  )
}

export function TestSuitePickerTestCaseList({
  testSuite,
  currentSelection,
  onChildSelection,
}: TestSuitePickerTestCaseListProps) {
  if (testSuite.testCases.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
        This suite has no test cases yet and cannot be selected.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {testSuite.testCases.map(testCase => {
        const checked = currentSelection?.runAll || currentSelection?.testCaseIds.includes(testCase.id) || false

        return (
          <TestSuitePickerTestCaseRow
            key={testCase.id}
            testSuite={testSuite}
            testCase={testCase}
            checked={checked}
            onChildSelection={onChildSelection}
          />
        )
      })}
    </div>
  )
}
