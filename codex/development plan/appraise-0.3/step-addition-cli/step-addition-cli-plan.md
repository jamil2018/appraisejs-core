# Template Step Installer CLI

## Summary

- Add a new published CLI package, exposed as `appraisejs`, so v1 installation is shadcn-style: `npx appraisejs@latest add step <group-slug>/<step-slug>`.
- Keep the existing Appraise sync model intact: the installer writes step source into `automation/steps`, then runs `sync-template-step-groups` followed by `sync-template-steps`.
- Use a GitHub-backed registry manifest as the catalog source. Store the registry in this repo under a dedicated registry directory and generate it from the canonical `automation/steps/**/*.step.ts` files to avoid maintaining two sources of truth.
- Do not change Prisma schema or UI pages. Success is defined as “step appears in the local DB after sync, therefore it is already visible in the existing Template Steps UI.”

## Key Changes

- Add a new package under `packages/appraisejs` that:
  - validates the target cwd is an Appraise project
  - fetches the GitHub manifest over HTTPS
  - resolves one registry entry by slug
  - downloads the step source fragment for that entry
  - invokes a project-local installer script in the target app
- Add a project-local script `scripts/install-template-step.ts` and wire an internal package script such as `appraisejs:install-step` so the external CLI can execute local TypeScript reliably across `npm`/`pnpm`/`yarn`/`bun`.
- Reuse the current file-first automation model in the local installer script:
  - if the target group file does not exist, create it with the existing placeholder/group-JSDoc helper
  - merge the downloaded step into the correct group file by `signature`
  - preserve existing imports and existing steps in that file
  - run `sync-template-step-groups` and then `sync-template-steps`
- Extend the scaffold/template sync path so generated projects include:
  - the new local installer script
  - the internal `appraisejs:install-step` script
  - package-manager rewriting for that script in `create-appraisejs`
- Add a registry build script that scans the canonical local step files and emits:
  - a manifest JSON
  - one source fragment per installable step containing only the step call/function body, not the whole group file
- Add docs for:
  - user-facing install command
  - project prerequisites
  - registry override knobs for development/testing

## Public Interfaces

- New user command:
  - `npx appraisejs@latest add step <group-slug>/<step-slug>`
- Supported v1 flags:
  - `--cwd <path>` to target a project directory
  - `--overwrite` to replace an existing conflicting step with the same signature
  - `--dry-run` to print intended actions without writing files or running sync
  - `--registry-url <url>` and `--branch <ref>` for non-default registry testing
- New internal project script:
  - `appraisejs:install-step`
  - Purpose: accept a downloaded payload from the external CLI, perform local file merge, then run the two sync scripts
- Registry contract:

  ```ts
  type StepRegistryManifest = {
    version: 1
    generatedAt: string
    steps: RegistryStepEntry[]
  }

  type RegistryStepEntry = {
    slug: string
    sourcePath: string
    sourceSha256: string
    signature: string
    name: string
    description: string | null
    icon: TemplateStepIcon
    group: {
      slug: string
      name: string
      description: string | null
      type: TemplateStepGroupType
    }
  }
  ```

- Conflict policy:
  - treat `signature` as the stable identity, matching current `sync-template-steps`
  - identical existing step => no-op success
  - same signature with different source => fail unless `--overwrite` is passed

## Test Plan

- Registry generation:
  - builds manifest entries correctly from existing `automation/steps` files
  - emits stable slugs, source paths, metadata, and checksums
- External CLI:
  - resolves a valid slug and downloads the correct payload
  - rejects missing slugs with a clear error
  - validates non-Appraise directories and missing local install prerequisites
  - passes `--overwrite`, `--dry-run`, and cwd correctly to the local script
- Local installer script:
  - creates a missing group file, installs the step, and runs both syncs in order
  - appends a step into an existing group file without removing unrelated steps/imports
  - no-ops on reinstall of identical content
  - fails safely on signature conflict without `--overwrite`
  - surfaces sync failures with non-zero exit and a clear failure summary
- Scaffold/template integration:
  - generated projects include the local installer script and rewritten package-manager-aware script
  - `create-appraisejs` tests cover script rewriting for `npm`/`pnpm`/`yarn`/`bun`
- End-to-end:
  - create a temp Appraise project fixture, run `appraisejs add step ...`, then verify the installed step exists in SQLite and is returned by the existing template-step service/query path

## Assumptions

- V1 supports installing individual steps only, not whole groups, updates, removals, or listing/searching the catalog.
- The registry is public and GitHub-hosted; private repo auth is out of scope for v1.
- The registry lives in this repo and is generated from the canonical local `automation/steps` files, so maintainers edit steps once.
- The target Appraise project has already installed dependencies and can run local sync scripts.
- If a same-named group exists in the opposite folder (`actions` vs `validations`), v1 treats that as a conflict and aborts rather than auto-moving files.
