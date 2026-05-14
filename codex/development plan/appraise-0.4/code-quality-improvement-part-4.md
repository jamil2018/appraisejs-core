# React Doctor And Fallow Quality Improvement Plan

## Summary
- Improve AppraiseJS code quality with React Doctor and Fallow working together, without score-padding shortcuts.
- React Doctor owns React/UI quality: React 19 API usage, rendering correctness, state/effect patterns, accessibility, bundle hints, server await hints, and Tailwind/design-system warnings.
- Fallow owns codebase intelligence: dead code, duplicate exports, dependency placement, circular imports, unresolved imports, duplication, and complexity/health targets.
- Do not add exclusions, rule disables, broad overrides, inline suppressions, or CI bypasses to improve either tool score.
- Edit root/base source first. If shared source affects templates, propagate with `npm run sync-template` and `npm --prefix packages/create-appraisejs run sync-templates`.

## Tool Boundaries And Baselines
- React Doctor config stays focused on the root app UI gate:
  - `deadCode: false`
  - ignored files: `templates/**`, `packages/**`, `automation/**`
  - current baseline: `69 / 100`, `570 issues across 123/213 files`
  - `213` matches root app `.tsx/.jsx` coverage after copied/generated/package ignores.
- Fallow config stays focused on structural codebase intelligence:
  - strict authored entry scope: `src/app/(base)/**/*.{ts,tsx}` and `scripts/**/*.{ts,tsx,js,mjs,cjs}`
  - copied/generated/package ignores: `.next/**`, `.fallow/**`, `automation/**`, `docs/**`, `packages/**`, `public/**`, `templates/**`
  - current baseline: `486` files discovered, `1` duplicate export issue for `formOpts`, and `110` health targets above threshold.
- Keep CI order: Fallow quality gate, React Doctor, lint, build.
- Do not change either config unless command output proves current file coverage is wrong.

## Key Changes
- Document the tool boundary in the quality plan/config notes so future sessions do not re-enable overlapping dead-code analysis or move generated surfaces into strict scope.
- Reduce React Doctor architecture warnings first:
  - replace redundant Tailwind `w-* h-*` pairs with `size-*`,
  - replace default `gray-*`, `slate-*`, and `indigo-*` palette classes with project tokens or deliberate neutrals,
  - clean smaller design utility warnings without changing layout behavior.
- Refactor React 19 warnings in shared UI primitives:
  - remove deprecated `forwardRef` where regular ref props are compatible,
  - replace `useContext(...)` with `use(...)` only where semantics are equivalent,
  - preserve public component APIs.
- Fix React Doctor correctness and state issues:
  - replace index keys with stable identifiers,
  - remove render-time side effects,
  - fix hydration-sensitive dynamic time rendering without blanket `suppressHydrationWarning`,
  - simplify derived state/effects and form semantics.
- Address React Doctor performance, server, bundle, and a11y findings:
  - combine avoidable multi-pass array chains,
  - extract stable default array/object props,
  - parallelize independent awaits with `Promise.all`,
  - apply dynamic imports or `LazyMotion` only for real reported bundle impact,
  - fix labels, static click handlers, autofocus, empty headings, metadata, and unsafe markup.
- Resolve Fallow structural findings:
  - rename/canonicalize generic `formOpts` exports with domain-specific names and update imports,
  - investigate the `../../scripts/build-step-registry.ts` package-entry warning and fix the package path or remove stale metadata,
  - continue health/duplication cleanup on overlapping hotspots like flow diagram, dynamic parameters, test-case form, test-run details, picker components, and script parser/sync helpers.

## Test Plan
- Before code changes: run `node_modules/.bin/fallow config`, `node_modules/.bin/fallow list --files`, and `npm run quality:react-doctor`.
- After React/UI phases: run `npm run quality:react-doctor` plus focused `npx vitest run ...` tests for touched components.
- After Fallow structural phases: run `npm run quality:fallow:ci -- --summary` plus focused tests for touched helpers, scripts, services, or components.
- Before handoff: run `npm run quality:fallow:ci`, `npm run quality:react-doctor:ci`, `npm run validate`, `npm run lint`, and `npm run build`.
- If shared root/base source changes require propagation, run both sync scripts and then rerun relevant focused tests and both quality gates.
- For visible UI changes, verify reports, flow builder, forms, navigation, dialogs, tables, and test-run logs in browser.

## Assumptions And Defaults
- React Doctor remains the React/UI quality gate; Fallow remains the dead-code and structural-analysis gate.
- Plain `.ts` helper/script coverage is intentionally handled by Fallow, TypeScript, Vitest, and ESLint rather than React Doctor.
- Template directories and package copies are propagation targets, not authored refactor targets.
- Any future config change must increase clarity or correct coverage, never hide findings.
