# Scripts Quality Refactor Plan

## Summary
- Scope this first pass to the root [`scripts/`](/Users/hasnat/Projects/appraise/scripts) directory only.
- Centralize shared script helpers in [`src/lib/sync/`](/Users/hasnat/Projects/appraise/src/lib/sync) so `scripts/` becomes thin orchestration code.
- Reuse and extract from existing `src/lib` code instead of creating parallel helpers:
  - [`src/lib/gherkin-parser.ts`](/Users/hasnat/Projects/appraise/src/lib/gherkin-parser.ts)
  - [`src/lib/tag-utils.ts`](/Users/hasnat/Projects/appraise/src/lib/tag-utils.ts)
  - [`src/lib/template-sync-utils.ts`](/Users/hasnat/Projects/appraise/src/lib/template-sync-utils.ts)
  - [`src/lib/sync/sync-executor.ts`](/Users/hasnat/Projects/appraise/src/lib/sync/sync-executor.ts)
  - [`src/lib/sync/sync-pending-counts.ts`](/Users/hasnat/Projects/appraise/src/lib/sync/sync-pending-counts.ts), which already contains private copies of many duplicated helpers that should be extracted and shared.

## Key Changes
- Create a central helper layout under `src/lib/sync`:
  - `sync-runtime` helpers for standard start/end logging, error handling, exit-code decisions, Prisma disconnect handling, and summary rendering.
  - `sync-feature-helpers` for `splitTagLine`, `normalizeTagExpression`, `extractTestSuiteNameFromFilename`, `extractFeatureLevelTags`, `parseScenarioTitle`, and related set-comparison helpers.
  - `sync-step-helpers` for `scanStepFiles`, `parseGroupJSDoc`, `signatureToRegex`, and Gherkin parameter extraction.
  - `sync-result-types` for shared summary/result counters and list sections used by multiple scripts.
- Extract reusable logic from `sync-pending-counts.ts` into those shared modules first, then update both `sync-pending-counts.ts` and the scripts to consume the extracted exports.
- Refactor the root sync scripts to use the shared helpers:
  - Feature-backed: [`scripts/sync-tags.ts`](/Users/hasnat/Projects/appraise/scripts/sync-tags.ts), [`scripts/sync-test-suites.ts`](/Users/hasnat/Projects/appraise/scripts/sync-test-suites.ts), [`scripts/sync-test-cases.ts`](/Users/hasnat/Projects/appraise/scripts/sync-test-cases.ts)
  - Step-backed: [`scripts/sync-template-step-groups.ts`](/Users/hasnat/Projects/appraise/scripts/sync-template-step-groups.ts), [`scripts/sync-template-steps.ts`](/Users/hasnat/Projects/appraise/scripts/sync-template-steps.ts)
  - Remaining sync scripts: break large reconcile functions into scan/load, diff, apply, orphan cleanup, and summary/report phases.
- Preserve behavior:
  - Keep current script filenames, CLI usage, sync IDs, and execution order.
  - Preserve the `📊 Sync Summary:` output contract unless `sync-all.ts` is updated in the same pass to use a new shared formatter.
- Add comments only where logic is non-obvious:
  - Scenario title parsing workaround.
  - Step signature matching and parameter extraction.
  - Deletion guards for referenced entities.
  - Any assumptions relied on by `sync-all.ts` summary aggregation.

## Unit Test Plan
- Add root-level unit test support for the app package.
  - The root package does not currently have Vitest installed or a unit-test script.
  - Add `vitest` to the root `devDependencies`.
  - Add a root test script such as `test:unit` and run it with Vitest in Node mode.
- Structure the refactor to make unit testing practical.
  - Move pure parsing, normalization, diffing, and reconciliation decisions into exported helpers under `src/lib/sync`.
  - Separate filesystem/database access from reconciliation logic via small injected adapters or repository interfaces.
  - Keep script entrypoints thin so tests target reusable logic instead of invoking `process.exit`.
- Add unit tests for helper modules in `src/lib/sync/**/*.test.ts`.
  - Feature helper tests:
    - split multiple tags on one line
    - normalize identifier tags with and without `@`
    - derive test-suite names from feature filenames
    - parse scenario titles with and without `[Title]` prefixes
  - Step helper tests:
    - parse valid and invalid group JSDoc blocks
    - convert signatures to regex correctly for `{string}`, `{int}`, `{boolean}`, `{number}`
    - extract Gherkin step parameters in correct order
  - Summary/runtime helper tests:
    - preserve the `Sync Summary` output shape expected by `sync-all.ts`
    - parse and aggregate summary counts correctly if parser logic moves
- Add reconciliation unit tests for each sync family using in-memory fake repositories and temporary fixture inputs.
  - Addition cases:
    - new filesystem entities create new DB entities
    - related links are created correctly, such as tags, module associations, step-group associations
  - Modification cases:
    - changed descriptions, tags, URLs, routes, parameters, or signatures trigger updates
    - no-op inputs remain idempotent and count as existing/up-to-date
  - Removal cases:
    - orphaned DB entities are deleted when filesystem source is absent
    - guarded deletes are skipped when dependent records exist
  - Error cases:
    - malformed input files produce deterministic errors
    - missing dependent entities or invalid metadata are reported cleanly
- Cover entity families explicitly.
  - Environments: add, update, delete, skip delete when test runs exist.
  - Tags: add new tags, update wrong tag type, delete orphaned tags.
  - Modules: add nested paths, preserve parent creation order, delete orphaned modules safely.
  - Test suites: add/update/delete suites and tag associations.
  - Test cases: add/update/delete cases, preserve identifier tags, verify step matching behavior.
  - Template step groups: add/update/delete groups and skip deletion when template steps still reference them.
  - Template steps: add/update/delete steps, normalize function definitions, and preserve parameter order/type mapping.
- Use temp workspace fixtures where filesystem shape matters.
  - Create fixture directories/files under temp paths for feature files, locator maps, environments, and step files.
  - Mock or inject path providers rather than depending on `process.cwd()` directly inside tested logic.
- Keep runtime smoke tests in addition to unit tests.
  - Unit tests validate add/modify/remove behavior deterministically.
  - A smaller smoke suite still runs actual scripts against the local workspace/database to validate wiring.

## Verification Plan
- Static checks after refactor:
  - Run `npx tsc -p tsconfig.json --noEmit`.
  - Run ESLint on changed `scripts/`, `src/lib/sync/`, and new test files.
  - Run full `npm run lint` as a regression check.
- Baseline note:
  - `tsc` currently passes.
  - Full lint currently fails on 5 unrelated existing errors outside `scripts/`, so acceptance for this pass is no new lint failures in touched files unless those baseline issues are fixed too.
- Test execution after implementation:
  - Run the new root unit-test command.
  - Run representative runtime smoke checks for `sync-environments`, `sync-tags` or `sync-test-suites`, `sync-template-step-groups`, `sync-template-steps`, and `sync-all`.
  - Re-run at least one feature-backed script and one step-backed script to confirm idempotent second-run behavior.
  - Confirm `sync-all.ts` still aggregates child summaries correctly.

## Assumptions And Defaults
- Template mirror directories remain out of scope for this first pass.
- Shared helpers belong in `src/lib/sync`, not in `scripts/`.
- Existing helper code in `sync-pending-counts.ts` is the first extraction source when equivalent logic is needed.
- Unit tests should target extracted sync logic and adapters, not raw script entrypoints with `process.exit`.
