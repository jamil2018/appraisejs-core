# Desktop UX Phase 5 evidence

Date: 2026-09-08

## Implemented

- The Journey detail page now presents the current next action and pending human decisions together as its dominant focus region. The duplicate pending-decisions card was removed from the activity sidebar; blockers and the durable event timeline remain there.
- Stage, next actor, required action, secondary attention, and decision requirements remain explicit. Journey identity remains available through the keyboard-operable technical-details disclosure.
- The Step Definition registry now composes category filtering with identifier, version, title, description, signature, and group search.
- Card and compact views share the same filtered definition objects and exact `id@version` keys. The compact view keeps source ownership and category visible while placing description, keyword, and input metadata in a native details disclosure.
- View selection is intentionally route-local component state. Switching views preserves the active search and category without adding preference persistence.

## Verification

- Focused Step Definition registry tests: 4 passed, including combined filters, view switching, exact version identity, and source-managed labeling.
- Focused Journey detail tests: 10 passed, including required-question precedence and pending review disclosure.
- Full unit suite: 232 files and 1,028 tests passed.
- Full browser E2E suite: 36 tests passed. This covered Journey waiting, report-review, execution, closed-state navigation, keyboard-oriented controls, and the root/scaffold terminology repair.
- Production build passed; `create-appraisejs` package tests passed (12 files, 73 tests).
- Release readiness passed all 14 active findings and every named command.
- Canonical root changes were synchronized to `packages/create-appraisejs/templates/base`; Graphify was regenerated for changed `src` and `scripts` scopes.

## Release-gate repairs found during validation

- Phase 4 renamed the interface to `Case Templates`, but root E2E expectations still used the former headings and field label. The canonical E2E tests and scaffold copy now assert the shipped vocabulary.
- Removal of the retired Quality OS authority removed release finding A-15, while the ledger validator still required A-01 through A-15. The validator and its tests now enforce the active A-01 through A-14 inventory.
- A deferred focus-return timeout could outlive its React test environment and fail a later release-gate unit run. The effect now cancels its timeout during cleanup.

## Browser evidence boundary

The full Playwright E2E run is the observed browser evidence for this phase. The in-app Browser could not be used because the Mac remained locked, so no manual screenshot comparison is claimed. Automated state coverage does not substitute for the intended-user study reserved for Phase 6.
