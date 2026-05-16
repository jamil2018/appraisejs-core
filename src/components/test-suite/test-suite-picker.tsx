'use client'

import { useMemo, useReducer } from 'react'

import { PickerBrowseDialogFrame, PickerBrowseTriggerButton } from '@/components/ui/picker-browse-shell'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { TestSuitePickerRow, TestSuiteSelection } from '@/types/test-suite-picker'

import {
  applyChildCheckboxSelection,
  applySuiteCheckboxSelection,
  buildNormalizedSelectionsFromDraft,
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

type Updater<T> = T | ((prev: T) => T)

function applyUpdater<T>(updater: Updater<T>, prev: T): T {
  return typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater
}

type SuitePickerState = {
  open: boolean
  query: string
  draftSelections: DraftSelectionMap
  expandedSuites: Record<string, boolean>
}

type SuitePickerAction =
  | { type: 'openDialog'; selectedSuites: TestSuiteSelection[] }
  | { type: 'setOpen'; open: boolean }
  | { type: 'setQuery'; query: string }
  | { type: 'setDraftSelections'; updater: Updater<DraftSelectionMap> }
  | { type: 'toggleExpanded'; suiteId: string }

function suitePickerReducer(state: SuitePickerState, action: SuitePickerAction): SuitePickerState {
  switch (action.type) {
    case 'openDialog':
      return {
        open: true,
        query: '',
        draftSelections: createDraftSelections(action.selectedSuites),
        expandedSuites: {},
      }
    case 'setOpen':
      return { ...state, open: action.open }
    case 'setQuery':
      return { ...state, query: action.query }
    case 'setDraftSelections':
      return { ...state, draftSelections: applyUpdater(action.updater, state.draftSelections) }
    case 'toggleExpanded':
      return {
        ...state,
        expandedSuites: {
          ...state.expandedSuites,
          [action.suiteId]: !state.expandedSuites[action.suiteId],
        },
      }
    default:
      return state
  }
}

function createInitialSuitePickerState(): SuitePickerState {
  return {
    open: false,
    query: '',
    draftSelections: {},
    expandedSuites: {},
  }
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
  const [state, dispatch] = useReducer(suitePickerReducer, undefined, createInitialSuitePickerState)
  const { open, query, draftSelections, expandedSuites } = state

  const filteredSuites = useMemo(
    () => testSuites.filter(testSuite => suiteMatchesQuery(testSuite, query.trim())),
    [query, testSuites],
  )

  const totalSelectedSuites = Object.keys(draftSelections).length

  const openDialog = () => {
    dispatch({ type: 'openDialog', selectedSuites })
  }

  const updateSuiteSelection = (testSuite: TestSuitePickerRow, checked: boolean) => {
    dispatch({
      type: 'setDraftSelections',
      updater: current => applySuiteCheckboxSelection(current, testSuite, checked),
    })
  }

  const updateChildSelection = (testSuite: TestSuitePickerRow, testCaseId: string, checked: boolean) => {
    dispatch({
      type: 'setDraftSelections',
      updater: current => applyChildCheckboxSelection(current, testSuite, testCaseId, checked),
    })
  }

  const saveDraftSelection = () => {
    onSave(buildNormalizedSelectionsFromDraft(testSuites, draftSelections))
    dispatch({ type: 'setOpen', open: false })
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
        onOpenChange={nextOpen => dispatch({ type: 'setOpen', open: nextOpen })}
        title={dialogTitle}
        description={dialogDescription}
        searchValue={query}
        onSearchChange={value => dispatch({ type: 'setQuery', query: value })}
        searchPlaceholder="Search suites, modules, tags, or child test cases..."
        summaryAside={`${totalSelectedSuites} suites selected`}
        onCancel={() => dispatch({ type: 'setOpen', open: false })}
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
                  onToggleExpand={suiteId => dispatch({ type: 'toggleExpanded', suiteId })}
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