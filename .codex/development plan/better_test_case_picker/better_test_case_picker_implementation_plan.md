# Better Test Case Picker for Test Suites and Test Runs

## Summary
Replace the current test-case dropdown/multiselect UX with a shared modal-based selector in:
- test suite create/modify forms
- test run create form, only in the `By Test Cases` path

Keep the existing submit payloads and server actions unchanged. Do not touch `templates/default` or `packages/create-appraisejs`.

## Implementation Changes
- Add a reusable client component for test-case picking that is driven by full test-case records, not `{label,value}` options.
- The new component should render:
  - a trigger button in place of the current picker
  - a dialog/modal with search, table view, multi-row checkbox selection, and a footer `Save` button
  - a compact selected-items panel below the field after save, constrained in height with a scrollbar
- Modal interaction model:
  - opening the modal starts from the last saved selection
  - row toggles update draft selection inside the modal
  - `Save` commits draft selection back to the form field
  - closing the modal without saving keeps the previously saved selection intact
- Reuse existing UI primitives where possible:
  - `Dialog`, `Input`, `Checkbox`, `ScrollArea`, `Table`, `Button`
  - existing TanStack table patterns
  - existing test-case list column rendering logic for shared cells where practical
- Rework test-case table column definitions so the picker can reuse the same visible data as the test-cases list page:
  - title
  - description
  - tags
  - steps count
  - created at
  - updated at
  - replace the list-page action column with picker selection checkboxes
- Keep the list-page table behavior intact while extracting shared cell/column helpers instead of duplicating rendering logic.

## Data and Form Integration
- Test suite forms:
  - replace `MultiSelectWithPreview` for `testCases`
  - feed the modal with full test-case records from `getAllTestCasesAction()`
  - continue storing selected values as `string[]`
- Test run form:
  - keep the `By Tags` path unchanged
  - replace only the `By Test Cases` picker with the modal
  - switch the create page data source from suite-derived test-case lists to the full test-case dataset so the modal can show the same details as the test-cases page and avoid duplicate suite-based flattening
  - continue storing selected values as `{ testCaseId: string }[]`
- Selected-items panel under each field:
  - compact scrollable container
  - show a short per-item summary, optimized for scanning rather than full table density
  - editing happens by reopening the modal; no separate inline remove affordance in this change

## Public Interfaces / Types
- Introduce a shared picker-facing test-case row type that includes the fields required by both the modal table and the compact selected list.
- Replace form props that currently accept bare `TestCase[]` or suite-derived minimal rows with the richer shared row shape where needed.
- Do not change Zod schemas, action signatures, database schema, or submitted payload format.

## Test Plan
- Test suite create:
  - open modal, search, select multiple cases, save, verify compact selected list updates
  - submit and confirm selected IDs reach the existing action shape
- Test suite modify:
  - open with preselected cases, verify modal reflects saved state
  - change selection, save, submit, verify updates persist
- Test run create:
  - `By Tags` continues to work unchanged
  - switch to `By Test Cases`, open modal, search/select/save, verify validation clears and payload remains `{ testCaseId }[]`
  - verify duplicate test cases do not appear in the modal
- Modal behavior:
  - close without saving and confirm prior saved selection remains
  - pagination/search/row selection all work together
  - selected-items panel stays height-limited and scrolls when long
- Regression checks:
  - test-cases list page still renders the same columns
  - no change to existing server-side validation or action responses

## Assumptions
- “both test case and test run window” means test suite forms and the test run form.
- Only `src/...` will be updated; template/package mirrors are intentionally out of scope.
- Test run picker should show all test cases, not only suite-linked ones.
- Matching the test-cases list page means matching its data columns, not reusing the actions column.
