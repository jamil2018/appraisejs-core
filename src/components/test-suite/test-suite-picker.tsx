'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn } from '@/lib/utils'
import { getFilterTags } from '@/lib/tag-utils'
import { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'
import { CheckedState } from '@radix-ui/react-checkbox'
import { ChevronDown, ChevronRight, FolderTree, Search } from 'lucide-react'

type TestSuitePickerProps = {
  testSuites: TestSuitePickerRow[]
  selectedSuites: TestSuiteSelection[]
  onSave: (selectedSuites: TestSuiteSelection[]) => void
  triggerPlaceholder: string
  dialogTitle: string
  dialogDescription: string
  selectedLabel: string
}

type DraftSelectionMap = Record<string, TestSuiteSelection>

function createDraftSelections(selectedSuites: TestSuiteSelection[]): DraftSelectionMap {
  return selectedSuites.reduce<DraftSelectionMap>((acc, selection) => {
    acc[selection.testSuiteId] = {
      testSuiteId: selection.testSuiteId,
      runAll: selection.runAll,
      testCaseIds: selection.testCaseIds,
    }
    return acc
  }, {})
}

function normalizeSuiteSelection(testSuite: TestSuitePickerRow, selection: TestSuiteSelection): TestSuiteSelection | null {
  const childIds = testSuite.testCases.map(testCase => testCase.id)

  if (childIds.length === 0) {
    return null
  }

  if (selection.runAll) {
    return {
      testSuiteId: testSuite.id,
      runAll: true,
      testCaseIds: [],
    }
  }

  const selectedChildIds = selection.testCaseIds.filter(testCaseId => childIds.includes(testCaseId))
  if (selectedChildIds.length === 0) {
    return null
  }

  if (selectedChildIds.length === childIds.length) {
    return {
      testSuiteId: testSuite.id,
      runAll: true,
      testCaseIds: [],
    }
  }

  return {
    testSuiteId: testSuite.id,
    runAll: false,
    testCaseIds: selectedChildIds,
  }
}

function suiteMatchesQuery(testSuite: TestSuitePickerRow, query: string): boolean {
  if (!query) {
    return true
  }

  const normalizedQuery = query.toLowerCase()
  const searchableText = [
    testSuite.name,
    testSuite.description ?? '',
    testSuite.module.name,
    ...getFilterTags(testSuite.tags).map(tag => tag.name),
    ...testSuite.testCases.flatMap(testCase => [
      testCase.title,
      testCase.description ?? '',
      ...getFilterTags(testCase.tags).map(tag => tag.name),
    ]),
  ]
    .join(' ')
    .toLowerCase()

  return searchableText.includes(normalizedQuery)
}

export function TestSuitePicker({
  testSuites,
  selectedSuites,
  onSave,
  triggerPlaceholder,
  dialogTitle,
  dialogDescription,
  selectedLabel,
}: TestSuitePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draftSelections, setDraftSelections] = useState<DraftSelectionMap>(() => createDraftSelections(selectedSuites))
  const [expandedSuites, setExpandedSuites] = useState<Record<string, boolean>>({})

  const filteredSuites = useMemo(
    () => testSuites.filter(testSuite => suiteMatchesQuery(testSuite, query.trim())),
    [query, testSuites],
  )

  const totalSelectedSuites = Object.keys(draftSelections).length

  const openDialog = () => {
    setQuery('')
    setDraftSelections(createDraftSelections(selectedSuites))
    setExpandedSuites({})
    setOpen(true)
  }

  const toggleExpanded = (testSuiteId: string) => {
    setExpandedSuites(current => ({
      ...current,
      [testSuiteId]: !current[testSuiteId],
    }))
  }

  const updateSuiteSelection = (testSuite: TestSuitePickerRow, checked: boolean) => {
    setDraftSelections(current => {
      const next = { ...current }

      if (!checked) {
        delete next[testSuite.id]
        return next
      }

      next[testSuite.id] = {
        testSuiteId: testSuite.id,
        runAll: true,
        testCaseIds: [],
      }

      return next
    })
  }

  const updateChildSelection = (testSuite: TestSuitePickerRow, testCaseId: string, checked: boolean) => {
    setDraftSelections(current => {
      const childIds = testSuite.testCases.map(testCase => testCase.id)
      const currentSelection = current[testSuite.id]
      const nextSelectedIds = new Set(
        currentSelection?.runAll ? childIds : currentSelection?.testCaseIds ?? [],
      )

      if (checked) {
        nextSelectedIds.add(testCaseId)
      } else {
        nextSelectedIds.delete(testCaseId)
      }

      const next = { ...current }

      if (nextSelectedIds.size === 0) {
        delete next[testSuite.id]
        return next
      }

      if (nextSelectedIds.size === childIds.length) {
        next[testSuite.id] = {
          testSuiteId: testSuite.id,
          runAll: true,
          testCaseIds: [],
        }
        return next
      }

      next[testSuite.id] = {
        testSuiteId: testSuite.id,
        runAll: false,
        testCaseIds: Array.from(nextSelectedIds),
      }

      return next
    })
  }

  const saveDraftSelection = () => {
    const normalizedSelections = testSuites
      .map(testSuite => {
        const selection = draftSelections[testSuite.id]
        return selection ? normalizeSuiteSelection(testSuite, selection) : null
      })
      .filter((selection): selection is TestSuiteSelection => Boolean(selection))

    onSave(normalizedSelections)
    setOpen(false)
  }

  const savedSuites = selectedSuites
    .map(selection => {
      const suite = testSuites.find(testSuite => testSuite.id === selection.testSuiteId)
      if (!suite) {
        return null
      }

      return {
        suite,
        selection: normalizeSuiteSelection(suite, selection),
      }
    })
    .filter(
      (entry): entry is { suite: TestSuitePickerRow; selection: TestSuiteSelection } =>
        Boolean(entry?.suite && entry.selection),
    )

  const selectionSummaryLabel = selectedLabel.replace(/^selected\s+/i, '')

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="outline" className="justify-between" onClick={openDialog}>
        <span className={selectedSuites.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
          {selectedSuites.length > 0
            ? `${selectedSuites.length} ${selectionSummaryLabel.toLowerCase()} selected`
            : triggerPlaceholder}
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
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search suites, modules, tags, or child test cases..."
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground">{totalSelectedSuites} suites selected</div>
            </div>

            <ScrollArea className="h-[480px] rounded-md border">
              <div className="divide-y">
                {filteredSuites.length > 0 ? (
                  filteredSuites.map(testSuite => {
                    const currentSelection = draftSelections[testSuite.id]
                    const childIds = testSuite.testCases.map(testCase => testCase.id)
                    const selectedChildIds = currentSelection?.runAll ? childIds : currentSelection?.testCaseIds ?? []
                    const selectionCount = selectedChildIds.length
                    const isExpanded = expandedSuites[testSuite.id] ?? false
                    const suiteCheckedState: CheckedState =
                      selectionCount === 0 ? false : selectionCount === childIds.length ? true : 'indeterminate'
                    const suiteTags = getFilterTags(testSuite.tags)

                    return (
                      <div key={testSuite.id} className="bg-background">
                        <div className="flex items-start gap-3 px-4 py-4">
                          <Checkbox
                            checked={suiteCheckedState}
                            onCheckedChange={checked => updateSuiteSelection(testSuite, !!checked)}
                            disabled={childIds.length === 0}
                            aria-label={`Select suite ${testSuite.name}`}
                            className="mt-1"
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="inline-flex items-center gap-2 text-left"
                                onClick={() => toggleExpanded(testSuite.id)}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="font-semibold">{testSuite.name}</span>
                              </button>
                              <Badge variant="outline" className="gap-1">
                                <FolderTree className="h-3.5 w-3.5" />
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
                          <div className="border-t bg-muted/20 px-4 py-3">
                            {testSuite.testCases.length > 0 ? (
                              <div className="space-y-2">
                                {testSuite.testCases.map(testCase => {
                                  const testCaseTags = getFilterTags(testCase.tags)
                                  const checked =
                                    currentSelection?.runAll || currentSelection?.testCaseIds.includes(testCase.id) || false

                                  return (
                                    <label
                                      key={testCase.id}
                                      className={cn(
                                        'flex items-start gap-3 rounded-md border bg-background px-3 py-3',
                                        checked && 'border-primary/40',
                                      )}
                                    >
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={value => updateChildSelection(testSuite, testCase.id, !!value)}
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
                  })
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">No test suites found.</div>
                )}
              </div>
            </ScrollArea>
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

      {savedSuites.length > 0 && (
        <div className="rounded-md border bg-muted/20">
          <div className="border-b px-4 py-3 text-sm font-medium">{selectedLabel}</div>
          <ScrollArea className="max-h-72">
            <div className="space-y-3 p-4">
              {savedSuites.map(({ suite, selection }) => {
                const selectedChildren = selection.runAll
                  ? suite.testCases
                  : suite.testCases.filter(testCase => selection.testCaseIds.includes(testCase.id))

                return (
                  <div key={suite.id} className="rounded-md border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{suite.name}</span>
                      <Badge variant="outline">{suite.module.name}</Badge>
                      <Badge variant={selection.runAll ? 'default' : 'secondary'}>
                        {selection.runAll ? 'Full suite selected' : `${selectedChildren.length} test cases selected`}
                      </Badge>
                    </div>
                    {!selection.runAll && selectedChildren.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedChildren.map(testCase => (
                          <Badge key={testCase.id} variant="outline">
                            {testCase.title}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export default TestSuitePicker
