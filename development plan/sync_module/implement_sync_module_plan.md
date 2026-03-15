# Settings Sync UI With Dependency-Aware Execution

## Summary
Add a new top-level `/settings` page and expose it as its own navbar link, not under `Configuration`. The page will contain a `Sync` section that lets users run `sync-all` plus an individual trigger for every script currently included in `scripts/sync-all.ts`. Individual triggers must automatically execute any prerequisite syncs first, in the correct existing order.

## Key Changes
- Add a new base route at `/settings`.
- Make `Settings` a first-class navigation destination:
  - Add a standalone `Settings` nav link in [src/app/layout.tsx](/mnt/g/codes/appraise/src/app/layout.tsx)
  - Add `Settings` to the command palette in [src/components/navigation/nav-command.tsx](/mnt/g/codes/appraise/src/components/navigation/nav-command.tsx)
  - Do not place `Settings` inside the `Configuration` dropdown
- Build `/settings` with existing page patterns:
  - `PageHeader` + `HeaderSubtitle`
  - a `Card` for the `Sync` section
  - one primary `Run sync-all` action
  - one row per individual sync target with label, description, and action button
- Create a shared sync registry module as the single source of truth for:
  - the scripts included in `sync-all`
  - labels and descriptions shown in the UI
  - dependency relationships
  - dependency-resolved execution order
- Refactor [scripts/sync-all.ts](/mnt/g/codes/appraise/scripts/sync-all.ts) to consume the shared registry instead of owning a separate inline list, so the CLI and UI always stay aligned
- Include exactly these individual sync targets from today’s `sync-all` list:
  - `sync-modules`
  - `sync-environments`
  - `sync-tags`
  - `sync-template-step-groups`
  - `sync-template-steps`
  - `sync-locator-groups`
  - `sync-locators`
  - `sync-test-suites`
  - `sync-test-cases`
  - plus a distinct `sync-all` trigger
- Enforce dependency-aware execution for individual triggers:
  - `sync-locators` runs `sync-modules` -> `sync-locator-groups` -> `sync-locators`
  - `sync-template-steps` runs `sync-template-step-groups` -> `sync-template-steps`
  - `sync-test-suites` runs `sync-modules` -> `sync-tags` -> `sync-test-suites`
  - `sync-test-cases` runs all required prerequisites in deduplicated topological order before `sync-test-cases`
- Add a server action that:
  - accepts only allow-listed sync IDs
  - resolves the full prerequisite chain for the requested target
  - executes scripts sequentially in the resolved order
  - stops immediately on the first failure
  - returns the executed scripts, the failing script if any, exit code, duration, and parsed cause
- Keep the UI single-flight:
  - only one sync request at a time
  - disable all sync buttons while a run is active
  - show loading state on the active trigger
  - refresh the route after completion
- Toast behavior:
  - success toast for completed runs
  - destructive toast for failures
  - failure message must name the exact script that failed and include the parsed cause
  - for `sync-all`, any child script failure should fail the overall action

## Interfaces / Types
- Shared sync definition type:
  - `id`
  - `label`
  - `description`
  - `scriptFile`
  - `dependencies: string[]`
- Dependency resolver helper:
  - input: requested sync ID
  - output: deduplicated script IDs in valid execution order
- Server action response:
  - `requestedScriptId`
  - `executedScriptIds`
  - `success`
  - `failedScriptId?`
  - `exitCode?`
  - `durationMs`
  - `cause?`

## Test Plan
- Verify `/settings` is reachable from the standalone navbar link and from the command palette
- Verify `/settings` renders one trigger for each script in the shared registry plus `sync-all`
- Verify each individual trigger runs prerequisites first in the correct order
- Verify dependency chains are deduplicated for deeper targets like `sync-test-cases`
- Verify `sync-all` preserves its existing execution order after the shared-registry refactor
- Verify if a prerequisite fails, downstream scripts do not run and the toast names the prerequisite that failed
- Verify if the target script fails, the toast names that target script and its cause
- Verify invalid script IDs are rejected server-side
- Verify only one sync operation can run at a time in the UI
- Run lint after implementation and manually smoke-test one independent script, one chained script, and `sync-all`

## Assumptions
- Individual triggers should run prerequisites automatically so users never need to know dependency order
- Scope remains limited to the scripts currently included in `sync-all`
- The Settings page only needs a `Sync` section for now, but should be structured to support future settings sections
