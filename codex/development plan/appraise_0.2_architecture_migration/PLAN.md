# Replace `src/tests` With A Root `automation/` Workspace And Introduce A Local Executor Boundary

## Summary
Appraise is a Next.js application that lets users create automation assets from the UI. When users create or update entities such as environments, locator groups, locators, template step groups, template steps, test cases, and test suites, the application writes real files to disk. Those files form a Cucumber automation project that Appraise later executes through test runs.

Today those generated files live under `src/tests`. That is a problem because Next.js and the Turbo build pipeline treat anything under `src` as application source. During build, the output no longer preserves the exact folder contract that the Cucumber runner expects, so test execution breaks after build.

The goal of this change is to:
- rename the generated filesystem from `tests` to `automation` so its purpose is clear
- move all generated automation assets out of `src`
- keep the automation workspace at a fixed internal path with no user-facing configuration
- ensure `next build` does not rewrite, bundle, or collapse the automation workspace
- ensure the built app can still execute Cucumber using the generated automation assets
- shape the code so Appraise can later split into a UI service and an executor service

The fixed filesystem location is:
- `automation/` at repository root

The directory structure under that root remains:
- `automation/config`
- `automation/features`
- `automation/locators`
- `automation/mapping`
- `automation/reports`
- `automation/steps`

## Key Changes
- Rename the generated project from `src/tests` to root `automation/`.
  - This directory represents user-authored automation assets managed by Appraise.
  - It is not part of the Next application source tree.
  - It is not Appraise’s own test suite.

- Introduce a single internal path module for automation filesystem access.
  - Add a helper module such as `src/lib/automation/paths.ts`.
  - It returns the fixed repo-root paths for all automation subdirectories.
  - All code that reads or writes automation files must use this module.
  - No environment variable is introduced.

- Introduce an automation projection layer.
  - Add a service such as `AutomationProjectionService` that owns generation, regeneration, move, rename, and delete operations for automation files.
  - Server actions should depend on this service instead of directly manipulating files or paths.
  - This becomes the local implementation of the future UI-to-executor projection boundary.

- Introduce an executor interface now.
  - Add an interface such as `ExecutorAdapter`.
  - Implement `LocalExecutorAdapter` first.
  - Test-run server actions call the adapter instead of directly owning the Cucumber spawn flow.
  - This creates the seam for a future remote executor service.

- Split immutable runtime code from mutable generated automation assets.
  - Create `packages/cucumber-runtime` for stable execution code:
    - CLI entrypoint
    - hooks
    - world
    - parameter types
    - locator/environment/cache helpers
  - Keep generated features, steps, locators, config, and reports inside `automation/`.
  - Generated step files must import only from the runtime package surface.

- Remove app-runtime dependencies on the generated workspace.
  - Move process spawning infrastructure such as `spawner.util` into app runtime code.
  - `process-manager`, `test-run-executor`, and `test-run-actions` must not import from generated automation files.

## Server Actions To Modify
These action modules must be updated because they create, update, delete, or execute generated automation files.

- `src/actions/environments/environment-actions.ts`
  - Write `environments.json` to `automation/config/environments/environments.json`
  - Delegate environment projection to the automation projection layer

- `src/actions/locator-groups/locator-group-actions.ts`
  - Write locator group JSON files under `automation/locators/**`
  - Write locator map updates to `automation/mapping/locator-map.json`
  - Read locator group file content from the automation workspace

- `src/actions/locator/locator-actions.ts`
  - Regenerate locator JSON under `automation/locators/**`
  - Change `syncLocatorsFromFilesAction` to scan `automation/locators/**/*.json`

- `src/actions/template-step-group/template-step-group-actions.ts`
  - Generate step group files under `automation/steps/actions` and `automation/steps/validations`
  - Ensure generated imports use the runtime package public API

- `src/actions/template-step/template-step-actions.ts`
  - Add, update, and remove generated step definitions under `automation/steps/**`
  - Ensure generated content imports from `packages/cucumber-runtime`

- `src/actions/test-suite/test-suite-actions.ts`
  - Generate and delete feature files under `automation/features/**`

- `src/actions/test-case/test-case-actions.ts`
  - Regenerate affected feature files under `automation/features/**` after create, update, and delete

- `src/actions/test-run/test-run-actions.ts`
  - Stop importing spawn helpers from `@/tests/...`
  - Call `ExecutorAdapter`
  - Persist report, log, and trace paths under `automation/reports/**`

- `src/actions/reports/report-actions.ts`
  - Accept report files from `automation/reports/**` as the canonical output location

These modules should also be updated because they affect generated artifact correctness:

- `src/actions/modules/module-actions.ts`
  - Trigger full regeneration of path-dependent automation assets after module mutations

- `src/actions/tags/tag-actions.ts`
  - Trigger feature regeneration after tag create, update, or delete

These modules do not require direct automation-workspace changes in this migration:
- `template-test-case`
- `dashboard`
- `review`
- `conflict`
- `user`

## Implementation Changes
- Add `src/lib/automation/paths.ts`.
  - Expose helpers such as:
    - `getAutomationRoot()`
    - `getAutomationConfigDir()`
    - `getAutomationFeaturesDir()`
    - `getAutomationLocatorsDir()`
    - `getAutomationMappingDir()`
    - `getAutomationReportsDir()`
    - `getAutomationStepsDir()`

- Add `src/lib/automation/projection-service.ts`.
  - It should expose operations such as:
    - `syncEnvironments()`
    - `syncLocatorGroup(locatorGroupId)`
    - `deleteLocatorGroup(locatorGroupId)`
    - `syncLocatorMap()`
    - `syncTemplateStepGroup(groupId)`
    - `deleteTemplateStepGroup(groupId)`
    - `syncTemplateStep(stepId)`
    - `deleteTemplateStep(stepId)`
    - `generateFeature(testSuiteId)`
    - `deleteFeature(testSuiteId)`
    - `regenerateAllFeatures()`
    - `regenerateAllPathDependentArtifacts()`

- Update existing file utility modules to use automation paths.
  - `src/lib/environment-file-utils.ts`
  - `src/lib/locator-group-file-utils.ts`
  - `src/lib/feature-file-generator.ts`
  - `src/lib/utils/template-step-file-generator.ts`
  - `src/lib/utils/template-step-file-manager-intelligent.ts`
  - `src/lib/test-run/test-run-executor.ts`
  - `src/lib/test-run/winston-logger.ts`
  - Runtime cache/helper code that reads from the old `src/tests` tree

- Create `packages/cucumber-runtime`.
  - Move immutable execution code from the current generated tree into this package.
  - Build this package before `next build`.
  - Expose only the imports generated step files are allowed to use.

- Move app infrastructure out of the generated tree.
  - Move `spawner.util` to app runtime code
  - Update:
    - `src/lib/test-run/process-manager.ts`
    - `src/lib/test-run/test-run-executor.ts`
    - `src/actions/test-run/test-run-actions.ts`

- Add executor boundary.
  - Add `src/lib/executor/types.ts` with `ExecutorAdapter`
  - Add `src/lib/executor/local-executor-adapter.ts`
  - Make `test-run-actions.ts` depend on the adapter

- Add one-time migration logic.
  - If `src/tests` exists and `automation` does not, copy or move the subtree to `automation`
  - Preserve existing folder hierarchy and files
  - Migration must run before automation projection or execution logic depends on the new location

## Single-Agent Task Plan
1. Create the foundation.
   - Add the shared automation path module.
   - Add the executor interface types.
   - Define the automation projection service interface and local implementation shape.

2. Migrate low-level filesystem utilities.
   - Update environment, locator-group, feature, template-step, report/log, and runtime cache utilities to use `automation/**`.
   - Remove hard-coded `src/tests` paths from utility code.

3. Extract the immutable runtime.
   - Create `packages/cucumber-runtime`.
   - Move stable Cucumber runtime code into it.
   - Define the allowed import surface for generated step files.

4. Move app-owned runtime infrastructure.
   - Move process spawning out of the generated workspace.
   - Update process manager and local test-run executor to use app runtime code.

5. Migrate server actions sequentially.
   - Update environments, locator-groups, locators, template-step-groups, template-steps, test-suites, test-cases, modules, tags, test-runs, and reports to use the automation projection layer and executor adapter.
   - Do this in one branch and in dependency order to avoid conflicting edits.

6. Add migration and startup safety.
   - Add one-time migration from `src/tests` to `automation`.
   - Ensure required automation subdirectories are created if missing.

7. Remove old references and finalize.
   - Remove remaining `@/tests/...` imports and active `src/tests` path literals.
   - Keep only one-time migration references if needed.

8. Verify end to end.
   - Run static checks, build checks, and runtime checks.
   - Confirm the automation workspace remains intact before and after `next build`.

## Test Plan
- Static path check
  - Search the repo for active `src/tests` literals and confirm none remain outside one-time migration code.
  - Search the repo for active `@/tests/...` imports and confirm none remain.

- Utility and action contract check
  - Confirm each modified server action reads or writes only under `automation/**`.
  - Confirm generated step templates import only from approved runtime package exports.

- Filesystem projection check
  - Create or regenerate sample environments, locator groups, locators, template steps, test cases, and test suites.
  - Verify the resulting files appear in:
    - `automation/config/**`
    - `automation/locators/**`
    - `automation/mapping/**`
    - `automation/steps/**`
    - `automation/features/**`

- Build integrity check
  - Capture a recursive file listing or hash snapshot of `automation/**` before running `next build`.
  - Run `next build`.
  - Capture the same recursive file listing or hash snapshot of `automation/**` after the build.
  - Verify:
    - the `automation/` directory still exists at repo root
    - its directory structure is unchanged by the build
    - generated automation files were not moved into `.next`
    - the build did not delete, collapse, or rewrite the automation workspace unintentionally

- Post-build execution check
  - Run the built app in its built form.
  - Trigger a test run from the app.
  - Verify Cucumber reads from:
    - `automation/features/**/*.feature`
    - `automation/steps/**/*.step.ts`
    - `automation/config/environments/environments.json`
    - `automation/locators/**/*.json`
    - `automation/mapping/locator-map.json`
  - Verify outputs are written to `automation/reports/**`.

- Report and trace check
  - Confirm reports, logs, and traces are created under `automation/reports/**`.
  - Confirm report ingestion still succeeds from that location.

- Mutation regeneration check
  - Rename or reparent a module and confirm path-dependent automation assets are regenerated correctly.
  - Create, update, and delete tags and confirm generated feature tags are refreshed correctly.

- Migration check
  - Start from a repo containing `src/tests/**`.
  - Run the migration.
  - Verify the subtree is preserved under `automation/**`.
  - Verify subsequent app operations use `automation/**` only.

## Assumptions
- `automation/` is the permanent name for the generated user-authored automation workspace.
- No user-configurable path is required.
- Full regeneration is preferred over selective incremental updates for module and tag mutations in this phase.
- Near-term execution remains local, but the architecture should allow a later remote executor implementation without changing UI-facing behavior.
