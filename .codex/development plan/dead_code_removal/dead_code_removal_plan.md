# Prune Unused Server Actions in Live App

## Summary

Prune `src/actions/**` down to the server actions that are actually used by the live app under `src/**`, and remove the disabled `reviews` placeholder routes/components at the same time. Do not touch `templates/default` or `packages/create-appraisejs/templates/default` in this pass.

## Key Changes

- Remove entire dead action domains with no live consumers:
  - `review`: remove the action module and the disabled `src/app/(base)/reviews/**` placeholder route tree.
  - `user`: remove `getAllUsersAction` and, if it becomes orphaned, its supporting service/schema code.
  - `conflict`: remove `resolveConflictsAction` and any now-unused supporting code.
- Keep currently active feature modules, but delete dead exports inside them:
  - `environments`: remove `checkEnvironmentNameUniqueAction`.
  - `locator-groups`: remove `getLocatorGroupFileContentAction`, `regenerateAllLocatorGroupFilesAction`.
  - `locator-picker`: remove `closeLocatorPickerSessionAction`.
  - `locator`: remove legacy `createLocatorAction`, `updateLocatorAction`, `getUngroupedLocatorsAction`; keep `getAllLocatorsAction`, `getLocatorByIdAction`, `deleteLocatorAction`, `syncLocatorsFromFilesAction`.
  - `reports`: remove action-layer `storeReportFromFile`, `getReportByTestRunIdAction`; keep the underlying report service path because test-run execution uses the service directly.
  - `test-run`: remove `storeTestRunLogsAction`, `updateTestRunTestCaseStatusAction`, `getMostRecentTestRunAction`.
- Preserve all action exports that are still imported by current routes/components:
  - `dashboard`, `modules`, `tags`, `template-step-group`, `template-step`, `template-test-case`, `test-case`, `test-suite`, `test-run` core CRUD/runtime actions, `reports` read actions, `settings/sync`, `locator-picker` start/get/save, `locator` read/delete/sync, `environments` CRUD, `locator-groups` CRUD + uniqueness.
- After action removal, delete only supporting artifacts that become unreachable:
  - dead schema imports
  - dead service helpers
  - dead exported type aliases such as the review action alias if no consumer remains

## Public API / Interface Changes

- Remove the unused server-action exports listed above from `src/actions/**`.
- Remove the disabled `/reviews` route family from the live app.
- No changes to active route behavior or the currently surfaced feature flows.

## Test Plan

- Before changes, confirm the verification commands for this repo remain:
  - `npm run validate` for unit tests
  - `npm run build` for the production build
- After pruning, run `npm run validate` and fix any stale imports, type drift, or orphaned test assumptions caused by removed actions.
- After tests pass, run `npm run build` and fix any build-time failures from deleted exports, route removal, or server/client boundary issues.
- Do a final import/reference sweep to confirm every remaining `src/actions/**` export is referenced by live app runtime code or an intentional internal runtime flow.
- Smoke-check the surfaced areas most affected by the prune:
  - dashboard
  - test suites, test cases, test runs, reports
  - template steps, template step groups, template test cases
  - locators, locator groups, modules, environments, tags
  - settings

## Assumptions

- “Actively used by the app” means referenced by live runtime code under `src/**`, not by template copies, tests, or old scaffolding.
- Template parity is intentionally deferred.
- Disabled `reviews` placeholders should be removed with their dead actions in this prune.
- If an action has zero live references and no API/runtime caller, it should be removed even if its underlying service remains useful internally.
