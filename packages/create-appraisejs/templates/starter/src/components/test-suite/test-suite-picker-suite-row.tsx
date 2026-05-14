'use client'

import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { getFilterTags } from '@/lib/tag-filters'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'
import { CheckedState } from '@radix-ui/react-checkbox'
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react'

type TestSuitePickerSuiteRowProps = {
  testSuite: TestSuitePickerRow
  currentSelection: TestSuiteSelection | undefined
  isExpanded: boolean
  onToggleExpand: (suiteId: string) => void
  onSuiteSelection: (suite: TestSuitePickerRow, checked: boolean) => void
  onChildSelection: (suite: TestSuitePickerRow, testCaseId: string, checked: boolean) => void
}

// fallow-ignore-next-line complexity
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
  const suiteTags = getFilterTags(testSuite.tags)

  return (
    <div className="bg-background">
      <div className="flex items-start gap-3 p-4">
        <Checkbox
          checked={suiteCheckedState}
          onCheckedChange={checked => onSuiteSelection(testSuite, !!checked)}
          disabled={childIds.length === 0}
          aria-label={`Select suite ${testSuite.name}`}
          className="mt-1"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-left"
              onClick={() => onToggleExpand(testSuite.id)}
            >
              {isExpanded ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <span className="font-semibold">{testSuite.name}</span>
            </button>
            <Badge variant="outline" className="gap-1">
              <FolderTree className="size-3.5" />
              {testSuite.module.name}
            </Badge>
            <Badge variant="secondary">{childIds.length} test cases</Badge>
            {selectionCount > 0 && (
              <Badge variant={currentSelection?.runAll ? 'default' : 'secondary'}>
                {currentSelection?.runAll ? 'Full suite selected' : `${selectionCount} selected`}
              </Badge>
            )}
          </div>

          <p className="mt-2 text-sm text-muted-foreground">
            {testSuite.description?.trim() || 'No description provided.'}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {suiteTags.length > 0 ? (
              suiteTags.map(tag => (
                <Badge key={tag.id} variant="outline">
                  {tag.name}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No filter tags</span>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="bg-muted/20 border-t px-4 py-3">
          {testSuite.testCases.length > 0 ? (
            <div className="space-y-2">
              {testSuite.testCases.map(testCase => {
                const testCaseTags = getFilterTags(testCase.tags)
                const checked =
                  currentSelection?.runAll || currentSelection?.testCaseIds.includes(testCase.id) || false

                const testCaseCheckboxId = `test-suite-${testSuite.id}-test-case-${testCase.id}`

                return (
                  <label
                    key={testCase.id}
                    htmlFor={testCaseCheckboxId}
                    className={cn(
                      'flex items-start gap-3 rounded-md border bg-background px-3 py-3',
                      checked && 'border-primary/40',
                    )}
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
              })}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-background px-4 py-6 text-sm text-muted-foreground">
              This suite has no test cases yet and cannot be selected.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const TestSuitePickerSuiteRow = memo(TestSuitePickerSuiteRowInner)

TestSuitePickerSuiteRow.displayName = 'TestSuitePickerSuiteRow'
