'use client'

import { useMemo, useState } from 'react'

import { PickerBrowseDialogFrame, PickerBrowseTriggerButton } from '@/components/ui/picker-browse-shell'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'

import {
  createDraftSelections,
  normalizeSuiteSelection,
  suiteMatchesQuery,
  type DraftSelectionMap,
} from './test-suite-picker-helpers'
import { TestSuitePickerSuiteRow } from './test-suite-picker-suite-row'

type TestSuitePickerProps = {
  testSuites: TestSuitePickerRow[]
  selectedSuites: TestSuiteSelection[]
  onSave: (selectedSuites: TestSuiteSelection[]) => void
  triggerPlaceholder: string
  dialogTitle: string
  dialogDescription: string
  selectedLabel: string
}

function TestSuitePicker({
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
      const nextSelectedIds = new Set(currentSelection?.runAll ? childIds : (currentSelection?.testCaseIds ?? []))

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
    const normalizedSelections = testSuites.reduce<TestSuiteSelection[]>((selections, testSuite) => {
      const selection = draftSelections[testSuite.id]
      if (selection !== null) {
        const normalizedSelection = normalizeSuiteSelection(testSuite, selection)
        if (normalizedSelection) {
          selections.push(normalizedSelection)
        }
      }

      return selections
    }, [])

    onSave(normalizedSelections)
    setOpen(false)
  }

  const savedSuites = selectedSuites.reduce<{ suite: TestSuitePickerRow; selection: TestSuiteSelection }[]>(
    (suites, selection) => {
      const suite = testSuites.find(testSuite => testSuite.id === selection.testSuiteId)
      if (!suite) {
        return suites
      }

      const normalizedSelection = normalizeSuiteSelection(suite, selection)
      if (normalizedSelection) {
        suites.push({
          suite,
          selection: normalizedSelection,
        })
      }

      return suites
    },
    [],
  )

  const selectionSummaryLabel = selectedLabel.replace(/^selected\s+/i, '')
  const shouldConstrainSavedListHeight = savedSuites.length > 2

  return (
    <div className="flex flex-col gap-3">
      <PickerBrowseTriggerButton
        selected={selectedSuites.length > 0}
        summaryWhenSelected={`${selectedSuites.length} ${selectionSummaryLabel.toLowerCase()} selected`}
        placeholder={triggerPlaceholder}
        onClick={openDialog}
      />

      <PickerBrowseDialogFrame
        open={open}
        onOpenChange={setOpen}
        title={dialogTitle}
        description={dialogDescription}
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search suites, modules, tags, or child test cases..."
        summaryAside={`${totalSelectedSuites} suites selected`}
        onCancel={() => setOpen(false)}
        onSave={saveDraftSelection}
      >
        <ScrollArea className="h-[480px] rounded-md border">
          <div className="divide-y">
            {filteredSuites.length > 0 ? (
              filteredSuites.map(testSuite => (
                <TestSuitePickerSuiteRow
                  key={testSuite.id}
                  testSuite={testSuite}
                  currentSelection={draftSelections[testSuite.id]}
                  isExpanded={expandedSuites[testSuite.id] ?? false}
                  onToggleExpand={toggleExpanded}
                  onSuiteSelection={updateSuiteSelection}
                  onChildSelection={updateChildSelection}
                />
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No test suites found.</div>
            )}
          </div>
        </ScrollArea>
      </PickerBrowseDialogFrame>

      {savedSuites.length > 0 && (
        <div className="bg-muted/20 rounded-md border">
          <div className="border-b px-4 py-3 text-sm font-medium">{selectedLabel}</div>
          <ScrollArea className={cn(shouldConstrainSavedListHeight && 'h-72')}>
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
