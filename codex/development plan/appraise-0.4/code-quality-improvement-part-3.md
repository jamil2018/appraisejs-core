# AppraiseJS Remaining Quality Cleanup Plan

## Summary
Continue from clean commit `6592411` using the **Hybrid** strategy: finish low-risk dead-code quick wins first, then handle medium Fallow health targets, then leave the high-risk component/service refactors for dedicated checkpoints.

Current baseline:
- `22` Fallow health targets remain.
- `103` dead-code/dependency issues remain.
- Working tree is clean.
- Continue making intermittent commits after each validated slice.

## Key Changes
1. **Quick Dead-Code Surface Cleanup**
   - Prune unused exports from `avatar.tsx`, `alert-dialog.tsx`, `navigation-menu.tsx`, and `module-path.ts`.
   - Before removal, verify each export with `rg` and Fallow trace where useful.
   - Prefer narrowing exports over deleting whole shadcn files unless the entire file is confidently unused.
   - Commit as: `Prune unused UI and path exports`.

2. **Medium Helper Splits**
   - Split `flow-diagram-helpers.ts` by responsibility while preserving the existing public barrel.
   - Split `test-suite-helpers.ts` into row guards, editable-suite guards/builders, form/display helpers, and table helpers.
   - Split `create-from-template-helpers.ts` into template selection, editable conversion, and resource row helpers.
   - Split `template-step-helpers.ts` into field/form helpers, parameter helpers, and row guards.
   - Add or update focused helper tests for each split.
   - Commit each subsystem separately.

3. **Coverage Before Risky Changes**
   - Add missing coverage for `test-run-details-guards.ts` before changing its guard logic.
   - Target the two complex guard functions directly with valid/invalid payload cases.
   - Commit as: `Cover test run detail guards`.

4. **Medium Complexity Extractions**
   - Refactor `gherkin-parser.ts` by extracting parsing subroutines from `parseFeatureFile`.
   - Refactor `task-spawner.ts`, `report-service.ts`, `sync-test-suites.ts`, `download/route.ts`, and `bidirectional-sync.ts` in separate commits.
   - Keep public function signatures stable unless tests prove a narrower internal API is safe.

5. **High-Risk Refactors Last**
   - Defer these until the smaller targets are done:
     - `test-case-form.tsx`
     - `create-locator-workspace-helpers.ts`
     - `dynamic-parameters.tsx`
     - `database-sync.ts`
     - `test-run-service.ts`
     - `metric-calculator.ts`
     - `template-step-file-manager-intelligent.ts`
   - Treat each as its own mini-plan and checkpoint because they touch broader user-facing or sync behavior.

## Test Plan
For every slice:
- Run the focused Vitest file(s) for the touched subsystem.
- Run `npm run lint`.
- Run `node_modules/.bin/fallow health --targets --format json --quiet --no-cache`.
- For dead-code slices, also run `node_modules/.bin/fallow dead-code --format json --quiet`.
- Run `npm run sync-template`, then `npm --prefix packages/create-appraisejs run sync-templates`.
- Re-run focused tests after sync.
- Commit with `--no-verify` only if the existing broader Fallow backlog still blocks the hook despite the slice being validated.

Before closing a larger batch:
- Run `npm run validate`.
- Record known unrelated failures separately if they remain unchanged.

## Assumptions
- Keep root/base source as the source of truth, then propagate through the template sync workflow.
- Preserve public barrel files during helper splits unless all callers are migrated safely.
- Do not fix unrelated validation failures unless they are caused by the current slice.
- Do not start large UI/service refactors until quick wins and medium helper splits are complete.
