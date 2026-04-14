# Add `starter` and `blank` Templates to `create-appraisejs`

## Summary

Implement two scaffold variants in `create-appraisejs`:

- `starter`: the current opinionated scaffold with core template steps included by default.
- `blank`: the same app scaffold, but with no bundled template steps; users add steps later through `appraisejs add step`.

Use two baked templates at scaffold time, not runtime stripping. For maintainability, generate `blank` as a derived artifact during template-prep from the canonical `starter` template, so copy/scaffold logic stays simple and deterministic.

## Key Changes

### 1. Public scaffolding interface

- Add a new template selection surface to `create-appraisejs`:
  - Interactive prompt for template choice.
  - `--template <starter|blank>` CLI flag for non-interactive usage.
- Default to `starter` when no flag is supplied and the prompt default is accepted.
- Extend `PromptAnswers` to include `template`.
- Add explicit validation for invalid `--template` values and show a clear error before any filesystem work.

### 2. Centralize template metadata and resolution

- Introduce a small template catalog module in `packages/create-appraisejs` that owns:
  - public ids: `starter`, `blank`
  - prompt labels/descriptions
  - bundled template directory resolution
  - remote template subpath resolution
- Keep template selection logic out of `cli.ts`, `prompts.ts`, and `create-project.ts` themselves; those files should consume the catalog/resolver.
- Preserve current remote override behavior:
  - if `CREATE_APPRAISE_TEMPLATE_SUBPATH` is set, it remains authoritative
  - otherwise the selected template decides the remote subpath
- Keep the current internal starter source path as `templates/default` for compatibility, and add `templates/blank` as the new minimal template. Public naming stays `starter`/`blank`.

### 3. Template generation strategy

- Keep the existing root template build flow as the canonical source for `starter`.
- Generalize the prep/sync pipeline so it produces both template outputs:
  - `starter` from the current prepared template
  - `blank` by copying the prepared starter template, removing bundled step files, then reseeding/resyncing the template DB so step-related data is empty
- Do not remove any non-step scaffold pieces from `blank`; it should still include:
  - app/dashboard code
  - local installer script
  - sync scripts
  - seeded DB
  - empty environments file
  - empty locator map
- Ensure `blank` has no bundled `automation/steps/**/*.step.ts` files and no starter template-step data left in the prepared database.
- Update package template sync so `packages/create-appraisejs/templates/...` contains both baked variants.

### 4. Scaffolding flow updates

- Thread the selected template from CLI args/prompt answers into `createProject`.
- Make bundled scaffolding copy the correct baked template directory.
- Make remote scaffolding fetch the correct subpath for the selected template.
- Keep package-manager patching and setup flow unchanged after template copy.
- Update success/help copy and README examples to mention `starter` vs `blank` and the new `--template` flag.

### 5. Validation and guardrails

- Extend template-prep validation to be variant-aware:
  - both variants must have seeded DB, packaged `gitignore`, empty locator map, no report artifacts
  - `starter` must still contain the bundled core step files
  - `blank` must contain no bundled step files
- Add a regression check so template prep fails if `blank` accidentally ships starter steps or if `starter` loses them.
- Remove or explicitly exclude stray OS artifacts such as `.DS_Store` from baked templates while touching the template pipeline.

## Test Plan

- `prompts.test.ts`
  - returns selected template in answers
  - defaults to `starter`
  - skips/uses prompt defaults correctly when `--template` is supplied
- new CLI arg parsing tests
  - accepts `--template starter`
  - accepts `--template blank`
  - rejects unsupported values with a clear error
- `create-project.test.ts`
  - bundled scaffold copies the selected template
  - remote scaffold resolves the correct template subpath from the selected template
  - explicit `CREATE_APPRAISE_TEMPLATE_SUBPATH` still overrides template mapping
- `copy-template.test.ts`
  - resolves/copies both baked template directories correctly
- `prepare-template-utils.test.ts`
  - starter validation requires bundled steps
  - blank validation requires zero bundled step files
- `cli.e2e.test.ts`
  - starter scaffold still contains core bundled steps
  - blank scaffold contains no bundled step files but still includes installer/sync prerequisites
- README/doc assertions can stay manual unless there is already a doc test hook

## Assumptions

- Public template names are `starter` and `blank`.
- `starter` remains the default scaffold.
- `blank` differs from `starter` only by omitting bundled template steps and the synced step data derived from them; all other scaffolded project capabilities remain aligned.
- The implementation will prefer prebuilt template variants over runtime mutation during scaffolding for readability, modularity, and lower regression risk.
