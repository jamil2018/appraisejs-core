# React Doctor And Fallow Quality Improvement Plan

## Summary

- Goal: improve AppraiseJS code quality with React Doctor and Fallow working together, without score-padding shortcuts.
- React Doctor owns React/UI quality: React 19 API usage, rendering correctness, state/effect patterns, accessibility, bundle hints, server await hints, and Tailwind/design-system warnings.
- Fallow owns codebase intelligence: dead code, duplicate exports, dependency placement, circular imports, unresolved imports, duplication, and complexity/health targets.
- Do not add exclusions, rule disables, broad overrides, inline suppressions, or CI bypasses to improve either tool score.
- Edit root/base source first. If shared source affects templates, propagate with the existing sync workflow instead of patching copied files directly.

## Current Tool Configuration

### React Doctor

- Config file: `react-doctor.config.json`
- Effective command: `npm run quality:react-doctor`
- Script expands to: `react-doctor . --project appraisejs --offline --full`
- Current config:
  - `deadCode: false`
  - `failOn: "error"`
  - ignored files: `templates/**`, `packages/**`, `automation/**`
- Config decision:
  - Keep `deadCode: false` because Fallow owns dead-code/dependency analysis.
  - Keep template/package/automation ignores because those are copied, package, or generated surfaces rather than the root app React/UI gate.
  - Do not add `ignore.rules`, broad `ignore.files`, or `ignore.overrides` to lower warning counts.

### Fallow

- Config file: `.fallowrc.json`
- Effective command: `npm run quality:fallow`
- CI command: `npm run quality:fallow:ci`
- Authored strict entry scope:
  - `src/app/(base)/**/*.{ts,tsx}`
  - `scripts/**/*.{ts,tsx,js,mjs,cjs}`
- Ignored generated/copied/package surfaces:
  - `.next/**`
  - `.fallow/**`
  - `automation/**`
  - `docs/**`
  - `packages/**`
  - `public/**`
  - `templates/**`
- Warning-level broader root app surfaces:
  - `src/actions/**`
  - `src/app/(dashboard-components)/**`
  - `src/app/api/**`
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
  - `src/components/**`
  - `src/lib/**`
  - `src/services/**`
  - `src/types/**`
  - and the other shared root app folders already listed in `.fallowrc.json`
- Config decision:
  - Keep this split. It preserves the authored quality gate for `src/app/(base)` and `scripts`, while still surfacing shared-app risk without treating generated or copied surfaces as strict authored scope.
  - Keep `ignoreDependencies` for `@codemirror/lang-jinja`, `@faker-js/faker`, and `dotenv` unless live Fallow tracing proves they are removable.

## Verified Baselines

- React Doctor baseline:
  - Score: `69 / 100`
  - Result: `570 issues across 123/213 files`
  - Category counts:
    - Architecture: `451`
    - Performance: `34`
    - Correctness: `27`
    - State & Effects: `25`
    - Accessibility: `12`
    - Bundle Size: `11`
    - Server: `8`
    - Next.js: `2`
- React Doctor scan-count check:
  - The `213` scanned files match root app `.tsx/.jsx` files after ignoring `templates/**`, `packages/**`, and `automation/**`.
  - Plain `.ts` helper/script coverage is intentionally handled by Fallow, TypeScript, Vitest, and ESLint rather than React Doctor.
- Fallow baseline:
  - Config loads from `.fallowrc.json`.
  - `fallow list --files` discovers `486` files.
  - Current dead-code/dependency graph is nearly clean: `1` issue, a duplicate export named `formOpts`.
  - Health target output reports `110` functions above threshold: `19` critical, `28` high, `63` moderate.
  - Fallow reports a package entry warning for `../../scripts/build-step-registry.ts`; investigate the package script/export path instead of suppressing it.

## Guardrails

- Do not improve quality numbers by:
  - adding new exclusions,
  - disabling rules,
  - weakening CI,
  - moving files out of scope,
  - adding blanket inline suppressions,
  - hiding template drift by editing copied template files directly.
- Keep CI order:
  - Fallow quality gate,
  - React Doctor,
  - lint,
  - build.
- Keep React Doctor and Fallow responsibilities separate:
  - Do not re-enable React Doctor dead-code analysis while Fallow owns it.
  - Do not expand Fallow strict authored scope into generated templates or package copies.
- Preserve behavior while refactoring. For risky state, render, form, server, or parsing changes, add or update focused tests before changing implementation.

## Implementation Plan

### 1. Baseline And Config Documentation

- Add or update a short plan/config note explaining the quality-tool boundary:
  - React Doctor: React/UI quality gate for root app UI files.
  - Fallow: dead-code, dependency, duplication, circularity, and complexity gate.
- Re-run config checks before changing code:
  - `node_modules/.bin/fallow config`
  - `node_modules/.bin/fallow list --files`
  - `npm run quality:react-doctor`
- Do not change either config unless the command output proves the current file coverage is wrong.

### 2. React Doctor Mechanical Design Cleanup

This is the highest-volume React Doctor cluster and has low behavioral risk.

- Replace redundant Tailwind size axes such as `w-4 h-4` with `size-4`.
  - Current count: `241`
  - Prioritize high-count files in layout, reports, test-case forms, test-run details, table columns, and shared UI primitives.
- Replace default Tailwind palette classes such as `gray-*`, `slate-*`, and `indigo-*` with existing project tokens or deliberate neutral choices.
  - Current count: `87`
  - Prioritize reports, test-case forms, logs modal, dynamic parameters, and navigation surfaces.
- Clean smaller design warnings:
  - redundant padding axes,
  - spacing applied directly to flex children,
  - three-period ellipses,
  - bold-heading utility misuse.
- Acceptance:
  - React Doctor architecture count drops substantially.
  - No config suppression is introduced.
  - Visible layouts still render cleanly in forms, reports, navigation, tables, and dialogs.

### 3. React Doctor React 19 Compatibility

- Refactor deprecated React 19 API usage in shared UI primitives.
- Replace `forwardRef` only where React 19 regular `ref` props are compatible with existing call sites.
- Replace `useContext(...)` with `use(...)` only where semantics are equivalent and safe.
- Preserve public component APIs and existing imports.
- Prioritize shared primitives first:
  - `src/components/ui/alert.tsx`
  - `src/components/ui/command.tsx`
  - `src/components/ui/table.tsx`
  - `src/components/ui/select.tsx`
  - `src/components/ui/dropdown-menu.tsx`
  - `src/components/ui/card.tsx`
  - `src/components/ui/sheet.tsx`
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/chart.tsx`
- Acceptance:
  - Component tests and TypeScript checks pass.
  - Deprecated patterns are removed rather than hidden behind wrappers.

### 4. React Doctor Correctness, State, And Effects

- Replace array index keys with stable identifiers.
  - Current count: `13`
  - Start with reorderable/filterable lists such as log viewer, node option lists, and table actions.
- Fix render-time side effects.
  - Current count: `17`
  - Prioritize `src/components/diagram/dynamic-parameters.tsx` and `src/app/(base)/test-cases/test-case-form.tsx`.
- Fix hydration-sensitive time rendering.
  - Current count: `3`
  - Move dynamic client-only values into deterministic test data or client-only state/effects. Do not use blanket `suppressHydrationWarning`.
- Review form `preventDefault` warnings.
  - Current count: `8`
  - Convert to server actions where practical; otherwise use correct client-managed form semantics.
- Simplify state/effect warnings.
  - Remove derived `useState` when values can be computed during render.
  - Remove derived state effects by computing inline or using keyed resets.
  - Use `useReducer` only when related state transitions benefit from one reducer.
- Acceptance:
  - Existing flow builder, forms, logs, template forms, and table interactions behave the same.
  - Focused tests cover changed state, render, and form behavior.

### 5. React Doctor Performance, Server, Bundle, And Accessibility

- Combine `.map().filter()` and similar multi-pass chains into readable single-pass loops.
- Extract default array/object props to module-level constants.
- Parallelize independent server awaits with `Promise.all` while preserving error behavior.
- Use dynamic imports and `LazyMotion` only where React Doctor identifies real bundle impact.
- Fix accessibility warnings:
  - associate labels with controls,
  - replace clickable static elements with semantic controls,
  - remove unjustified autofocus,
  - fix empty headings.
- Clean remaining Next.js and markup findings:
  - add missing metadata,
  - replace or sanitize `dangerouslySetInnerHTML`,
  - fix unknown DOM properties.
- Acceptance:
  - React Doctor performance, accessibility, bundle, server, and Next.js counts move down without behavior regressions.

### 6. Fallow Structural Cleanup

- Resolve the current duplicate export issue for `formOpts`.
  - Prefer domain-specific export names in each form-options file over a shared generic `formOpts` export name.
  - Update imports at call sites rather than adding suppressions.
- Investigate the Fallow warning for `../../scripts/build-step-registry.ts`.
  - Find the package script or export referencing the parent-directory path.
  - Replace it with a valid project-local script path or remove the invalid entry if it is stale.
  - Do not suppress the warning.
- Continue Fallow health and duplication cleanup after the React Doctor quick wins.
  - Prioritize overlap hotspots where both tools report value, such as flow diagram, dynamic parameters, test-case form, test-run details, picker components, and script parser/sync helpers.
  - Extract shared parser/sync logic where duplication is real, especially around JSDoc and step-file parsing.
  - Split large functions by behavior, not by arbitrary line count.
- Acceptance:
  - Fallow dead-code/dependency issue count remains clean or decreases.
  - Duplicate export warning is resolved by naming/canonicalization.
  - Complexity/duplication improves through real extraction and simplification.

## Suggested Work Order

1. Verify tool configs and capture fresh baselines.
2. Apply React Doctor mechanical design cleanup.
3. Refactor shared UI primitives for React 19 compatibility.
4. Fix React Doctor correctness/state/effect issues.
5. Fix React Doctor performance/server/bundle/accessibility issues.
6. Resolve Fallow duplicate export and package-entry warning.
7. Continue Fallow health and duplication refactors on the highest-risk overlapping hotspots.
8. Sync templates if root/base shared source changed.
9. Run full verification.

## Verification Plan

- After config-sensitive changes:
  - `node_modules/.bin/fallow config`
  - `node_modules/.bin/fallow list --files`
  - `npm run quality:react-doctor`
- After React/UI phases:
  - `npm run quality:react-doctor`
  - focused `npx vitest run ...` commands for touched components.
- After Fallow structural phases:
  - `npm run quality:fallow:ci -- --summary`
  - focused tests for touched helpers, scripts, services, or components.
- Before final handoff:
  - `npm run quality:fallow:ci`
  - `npm run quality:react-doctor:ci`
  - `npm run validate`
  - `npm run lint`
  - `npm run build`
- If shared root/base source changes require propagation:
  - `npm run sync-template`
  - `npm --prefix packages/create-appraisejs run sync-templates`
  - rerun relevant focused tests and both quality gates.
- For visible UI changes:
  - run the dev server,
  - verify affected pages in browser,
  - focus on reports, flow builder, forms, navigation, dialogs, tables, and test-run logs.

## Initial Files To Inspect First

- React Doctor hotspots:
  - `src/app/(base)/test-cases/test-case-form.tsx`
  - `src/app/(base)/reports/[id]/page.tsx`
  - `src/components/diagram/flow-diagram.tsx`
  - `src/components/diagram/dynamic-parameters.tsx`
  - `src/components/test-run/test-run-details.tsx`
  - `src/components/test-run/log-viewer.tsx`
  - `src/components/test-suite/test-suite-picker.tsx`
  - `src/components/ui/multi-select-with-preview.tsx`
  - `src/components/ui/command.tsx`
  - `src/components/ui/select.tsx`
  - `src/components/ui/dialog.tsx`
  - `src/components/ui/table.tsx`
- Fallow hotspots:
  - form option constants that export `formOpts`,
  - package script/export path that references `../../scripts/build-step-registry.ts`,
  - `scripts/lib/jsdoc-parser.ts`,
  - `scripts/lib/step-file-parser.ts`,
  - `src/lib/sync/sync-pending-counts.ts`,
  - high-complexity overlapping UI files from the React Doctor list.

## Done Criteria

- React Doctor score improves through real code changes.
- Fallow issue counts remain clean or improve, especially duplicate exports and health/duplication targets.
- No new exclusions, rule disables, CI bypasses, or blanket suppressions are introduced.
- React Doctor and Fallow scopes remain complementary rather than overlapping dead-code analysis.
- Root/base source remains the source of truth.
- Scaffold templates are updated only through sync scripts.
- Changed behavior is covered by focused tests, with browser checks for visible UI surfaces.
