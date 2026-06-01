# Inline Test Suite Creation From Test Case Form

## Summary
Add inline test suite creation to the shared `TestCaseForm` used by both:
- `Create Test Case`
- `Create Test Case From Template`

The test suite selector will gain an icon-only add button. Clicking it opens a dialog that renders the existing `TestSuiteForm`. On successful suite creation, the dialog closes, the new suite is appended to the local selector options, and its ID is added to the current test case’s selected suite IDs without refreshing the page.

## Key Changes
- Extend the two test case entry pages to fetch the extra data required by `TestSuiteForm`:
  - all existing test cases
  - all modules
  - existing tags are already fetched
- Pass those new datasets into `TestCaseForm` so the modal can render the full suite form without additional client fetches.

- Update `TestCaseForm` to manage test suite options in local state instead of treating `testSuites` as immutable props.
  - Initialize local `availableTestSuites` from props.
  - Keep `selectedTestSuites` separate.
  - Add an inline action beside the `Test Suites` multi-select:
    - icon button with add icon
    - accessible label such as `Create test suite`
  - Do not use `router.refresh()` after suite creation, because that would discard unsaved test case edits.

- Introduce a dedicated dialog wrapper for inline suite creation.
  - Render a large, scrollable `Dialog` containing `TestSuiteForm`.
  - Open/close state lives in `TestCaseForm`.
  - On success:
    - append the returned suite to `availableTestSuites` if it is not already present
    - add the returned suite ID to `selectedTestSuites`
    - close the dialog
    - show the existing success toast from the suite form

- Make `TestSuiteForm` reusable in both page and dialog contexts.
  - Keep the current page behavior as the default.
  - Add an optional success callback prop, e.g. `onSuccess?: (suite: TestSuite) => void | Promise<void>`.
  - Add an optional redirect control, e.g. `redirectPath?: string | null`, defaulting to `/test-suites`.
  - In dialog mode, submit should not navigate away; it should invoke `onSuccess` with the created suite and remain on the current test case page.

- Update `createTestSuiteAction` to return the created suite in `data` on success.
  - Keep existing validation and `revalidatePath('/test-suites')`.
  - Reuse the returned suite object for immediate client-side selection instead of refetching.

## Public API / Interface Changes
- `TestCaseForm` props gain:
  - `testCases: TestCasePickerRow[]`
  - `moduleList: Module[]`
- `TestSuiteForm` props gain:
  - `onSuccess?: (suite: TestSuite) => void | Promise<void>`
  - `redirectPath?: string | null`
- `createTestSuiteAction` success payload changes from message-only to include:
  - `data: createdTestSuite`

## Test Plan
- `TestCaseForm` component test:
  - renders add button beside the suite selector
  - opens the suite creation dialog
  - successful inline suite creation appends the new suite option and selects it automatically
  - does not navigate away from the test case page after inline suite creation
- `TestCaseForm` failure test:
  - failed suite creation leaves dialog open and does not change selected suites
- `TestSuiteForm` test:
  - in default page mode, still redirects to `/test-suites`
  - in dialog mode (`redirectPath={null}`), does not redirect and calls `onSuccess` with returned suite data
- Route/page smoke coverage:
  - both `test-cases/create` and `test-cases/create-from-template/generate/[id]` pass the new `testCases` and `moduleList` props into `TestCaseForm`

## Assumptions
- Scope is `src/` only; template/scaffold copies are out of scope.
- `Create Test Case From Template` already uses the shared `TestCaseForm`, so one implementation there covers both requested entry points.
- The modal uses the existing full `TestSuiteForm`, not a simplified mini-form.
- Selecting the newly created suite only updates local test case form state immediately; the actual test case-to-suite relationship is persisted when the user saves the test case itself.
