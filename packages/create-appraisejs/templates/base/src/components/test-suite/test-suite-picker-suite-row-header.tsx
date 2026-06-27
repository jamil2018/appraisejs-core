'use client'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { getFilterTags } from '@/lib/tag-filters'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'
import type { CheckedState } from '@radix-ui/react-checkbox'
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-react'

type TestSuitePickerSuiteRowHeaderProps = {
  testSuite: TestSuitePickerRow
  currentSelection: TestSuiteSelection | undefined
  isExpanded: boolean
  suiteCheckedState: CheckedState
  childCount: number
  selectionCount: number
  onToggleExpand: (suiteId: string) => void
  onSuiteSelection: (suite: TestSuitePickerRow, checked: boolean) => void
}

export function TestSuitePickerSuiteRowHeader({
  testSuite,
  currentSelection,
  isExpanded,
  suiteCheckedState,
  childCount,
  selectionCount,
  onToggleExpand,
  onSuiteSelection,
}: TestSuitePickerSuiteRowHeaderProps) {
  const suiteTags = getFilterTags(testSuite.tags)

  return (
    <div className="flex items-start gap-3 p-4">
      <Checkbox
        checked={suiteCheckedState}
        onCheckedChange={checked => onSuiteSelection(testSuite, !!checked)}
        disabled={childCount === 0}
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
          <Badge variant="secondary">{childCount} test cases</Badge>
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
  )
}
