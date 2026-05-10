# AppraiseJS Quality Improvement Continuation Plan

## Summary

Continue the Fallow-driven quality work from the current branch, preserving the pattern already established: fix the highest-priority static-analysis targets first, avoid skipping large refactors, update base/root sources first, then propagate via template sync.

Current verified baseline:
- Fallow config now analyzes authored app code correctly: `448` files, including `src/app/api`, root app files, dashboard components, shared libs, services, and components.
- Ignored roots are limited to generated/static/template/package/doc outputs: `.next`, `.fallow`, `automation`, `docs`, `packages`, `public`, `templates`.
- `npm run quality:fallow:ci -- --summary` passes, with total Fallow issues reduced from `142` to `135`.
- Focused Vitest passed for touched helper/sync/page areas.
- `npm run lint` passes with one existing warning in `src/components/diagram/flow-diagram.tsx`.
- `npm run validate` still has known unrelated failures in `tag-service.test.ts` and `template-test-case-form.test.tsx`.

## What Has Been Done

- Added Fallow as a quality gate:
  - Added `.fallowrc.json`.
  - Added package scripts for Fallow quality checks.
  - Added CI integration.
  - Added simple-git-hooks pre-commit integration.
- Corrected Fallow ignore patterns:
  - Removed the bad broad `src/**` exclusion.
  - Confirmed authored `src` files are included in analysis.
- Refactored parser/sync complexity:
  - Split JSDoc parsing logic in `scripts/lib/jsdoc-parser.ts`.
  - Extracted step parsing helpers in `scripts/lib/step-file-parser.ts`.
  - Reduced complexity in `src/lib/sync/sync-pending-counts.ts`.
- Removed confirmed dead legacy code:
  - Deleted `src/lib/template-sync-utils.js` and synced deletion to templates.
- Reduced `TestCaseForm` complexity:
  - Extracted focused UI pieces for wizard progress and flow panel behavior.
- Split tag utilities:
  - Created focused tag identifier/filter helper modules.
  - Kept `tag-utils.ts` as a compatibility barrel.
  - Updated root imports to narrower modules.
- Split test-case route helper responsibilities:
  - Created focused editable-test-case, resource-row, and test-case-row helper modules.
  - Updated page/table callers to import focused helpers.
- Removed unused public exports from `src/components/ui/select.tsx`.
- Propagated base app changes with:
  - `npm run sync-template`
  - `npm --prefix packages/create-appraisejs run sync-templates`

## Next Pass

1. Reconfirm baseline before editing:
   - Run `node_modules/.bin/fallow config --format json --quiet`.
   - Run `node_modules/.bin/fallow list --files --format json --quiet --no-cache`.
   - Confirm authored `src/app/api`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/components`, `src/lib`, and `src/services` are still included.

2. Work Fallow targets in this priority order:
   - `src/lib/environment-file-utils.ts`: remove or internalize the 7 unused exports after confirming no dynamic/script usage.
   - `src/components/diagram/flow-diagram-helpers.ts`: split high-impact helper groups by responsibility, preserving React Flow behavior and existing tests.
   - `src/components/node-header.tsx`: remove the unused node header component surface if no live imports exist.
   - `src/lib/utils/template-step-file-manager.ts`: remove confirmed unused exports or delete the file if fully superseded.
   - `src/components/test-run/test-run-details-helpers.ts`: split helpers by formatting/status/progress concerns.
   - `src/components/ui/alert-dialog.tsx` and `src/components/ui/avatar.tsx`: prune unused shadcn exports only if no current or template callers import them.
   - `src/app/(base)/test-cases/create-from-template/create-from-template-helpers.ts`: split converter/row-narrowing/template-selection logic.
   - `src/lib/gherkin-parser.ts`: extract `parseFeatureFile` subroutines to reduce cognitive complexity.

3. Do not start with low-confidence mass deletion:
   - For dead files/components, first run `rg` against root `src`, `scripts`, and any known dynamic registries.
   - Delete only when static and repo search both agree, or when the file is obviously obsolete generated JS next to maintained TS.
   - Prefer narrowing exports over deleting shadcn component files that may be intentionally available for future UI work.

4. Sync rules:
   - Make source edits in root/base files first.
   - After any `src`, `scripts`, package script, or scaffold-relevant change, run `npm run sync-template`.
   - Then run `npm --prefix packages/create-appraisejs run sync-templates`.
   - Run the two sync commands sequentially, not in parallel, to avoid copy races.

## Test Plan

For each next-pass refactor:
- Run focused tests for the touched subsystem.
- Run `npm run lint`.
- Run `npm run quality:fallow:ci -- --summary`.
- Run `node_modules/.bin/fallow health --targets --format json --quiet --no-cache` and record the new top targets.
- Run `npm run validate` before closing the session, but treat the current `tag-service.test.ts` and `template-test-case-form.test.tsx` failures as existing blockers unless their output changes.

Suggested focused tests by target:
- `environment-file-utils.ts`: any environment service/sync tests plus direct helper tests if present.
- `flow-diagram-helpers.ts`: `src/components/diagram/flow-diagram-helpers.test.ts`, `flow-diagram.test.tsx`, and related node-form tests if imports change.
- `test-run-details-helpers.ts`: `src/components/test-run/test-run-details-helpers.test.ts` and `test-run-details.test.tsx`.
- `create-from-template-helpers.ts`: existing create-from-template helper/page tests.
- `gherkin-parser.ts`: `src/lib/gherkin-parser.test.ts`.

## Assumptions

- Continue prioritizing Fallow’s `health --targets` output over ad hoc cleanup.
- Keep the current Fallow override policy for now: broad authored code is included, but non-target dead-code findings remain warnings until deliberately cleaned.
- Do not fix the unrelated `npm run validate` failures unless a future session explicitly includes test repair.
- Do not remove generated/template files manually; use the established sync workflow.
