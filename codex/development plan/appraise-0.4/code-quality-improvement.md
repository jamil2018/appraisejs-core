# Fallow Quality Gate Plan

## Summary

Set up Fallow as a repo-owned quality gate for only `src/app/(base)` and root `scripts`, then clean the real findings before enforcing it in CI and pre-commit. The unconfigured audit ran with Fallow `2.69.0` and found `3490` total repo-wide issues, mostly from copied/generated areas. Inside the requested scope, the notable findings are `2` unused files, `17` unused exports, `3` unused types, `86` complexity findings, and `173` duplication groups.

## Key Changes

- Add Fallow as a pinned dev dependency and add `.fallowrc.json` scoped to the authored quality surface:
  - analyze `src/app/(base)/**` and `scripts/**`
  - ignore copied/generated surfaces such as `automation/**`, `templates/**`, scaffold templates, package templates, and non-target app/source directories
  - keep dead-code, duplication, and health enabled; do not suppress real findings to make the gate pass
- Add npm scripts:
  - `quality:fallow`: full configured Fallow run
  - `quality:fallow:ci`: same run with `--fail-on-issues`
  - `quality:fallow:commit`: `fallow audit --base HEAD --fail-on-issues` for commit-time checks
- Update `.github/workflows/ci.yml` to run `npm run quality:fallow:ci` after install and before lint/build, so merges to `main` are blocked by configured Fallow failures.
- Add a versioned pre-commit setup using `simple-git-hooks`, wired from `package.json`, so every clone can install the same commit-time Fallow rule.

## Refactor Plan

- First fix scoped dead-code findings with tracing before deletion:
  - verify `scripts/protect-seeded-files.ts` and `src/app/(base)/locators/sync-locators-button.tsx`
  - trace unused exports/types in `scripts/lib/*`, locator helpers, report helpers, route helpers, template-step helpers, and suite helpers
- Refactor high-priority complexity without shortcut suppression:
  - split `scripts/lib/step-file-parser.ts`, `scripts/lib/jsdoc-parser.ts`, and complex sync-script functions into named parsing/normalization/persistence helpers
  - extract `src/app/(base)/test-cases/test-case-form.tsx` state/validation/submit logic into focused hooks/helpers
  - split high-impact helper files such as create-from-template helpers, route helpers, locator workspace helpers, suite/module/template-step helpers by domain responsibility
- Reduce real duplication only in authored scope:
  - consolidate repeated script parsing/setup/test-fixture patterns
  - ignore duplication caused solely by synced template copies through config, not inline suppressions
- When a base-source refactor affects synced scaffold/template output, edit the root/base source first, then run `npm run sync-template` and `npm --prefix packages/create-appraisejs run sync-templates`.

## Test Plan

- Verify config scope with:
  - `npm run quality:fallow`
  - `fallow list --files --format json --quiet` to confirm reported files are limited to `src/app/(base)` and `scripts`
- After refactors, run:
  - focused `npx vitest run ...` for every touched test/helper area
  - `npm run validate`
  - `npm run lint`
  - `npm run quality:fallow:ci`
- If sync propagation is needed, rerun the focused tests and Fallow after sync.

## Assumptions

- The final CI gate should fail on remaining scoped Fallow issues; no baseline will be used to hide known issues.
- Commit-time enforcement will use the selected versioned npm hook strategy.
- Fallow setup follows the official docs for installation/configuration and CI usage: [installation](https://docs.fallow.tools/installation), [quickstart/config example](https://docs.fallow.tools/quickstart), and [CI integration](https://docs.fallow.tools/quickstart).
