# Simplify create-appraisejs Template Storage

## Summary

Replace the current multi-copy scaffold system with one package-owned base template plus small flavor overlays. Remove
the root `templates/` artifact, remove remote template download support, and stop storing full duplicate `starter` and
`blank` template trees inside `create-appraisejs`.

## Key Changes

- Make `packages/create-appraisejs/templates/base` the only full scaffold app template.
- Add flavor-specific overlay directories for template choices:
  - `packages/create-appraisejs/templates/flavors/starter` contains bundled step files and the starter seeded DB.
  - `packages/create-appraisejs/templates/flavors/blank` contains only the blank seeded DB and any future blank-only
    files.
- Change scaffold creation to:
  - copy `templates/base` into the target project
  - overlay the selected flavor directory
  - run the existing package-manager script patching and optional setup flow
- Refactor `prepare-template` so it generates `base` directly from root source, prepares starter/blank DBs in temp
  workspaces, writes DBs into flavor overlays, and verifies both final composed template variants.
- Remove the root `templates/` directory and retire scripts/docs that describe root-to-package template copying.
- Remove remote scaffolding support entirely:
  - delete `download-repo` code/tests
  - remove remote config env vars and `useBundled` branching
  - simplify project creation so installed package contents are the only template source
- Preserve current generated app behavior: starter still includes bundled steps and seeded template step data; blank
  still excludes bundled steps and has no template step/group seed data.

## Test Plan

- Update and run `npm --prefix packages/create-appraisejs run test`.
- Add or update tests for composed template copying:
  - base files are copied for both starter and blank
  - starter overlay adds `automation/steps` and starter `prisma/dev.db`
  - blank overlay does not create `automation/steps` and uses blank `prisma/dev.db`
  - packaged `gitignore` still becomes `.gitignore`
  - package-lock copying still follows package-manager rules
- Run `npm --prefix packages/create-appraisejs run prepare-template` and verify:
  - root `templates/` is not recreated
  - no full `templates/starter` or `templates/blank` app trees remain
  - final composed starter/blank verification passes
- Run `npm --prefix packages/create-appraisejs run build` if local template prep succeeds.
- Run focused Prettier/ESLint checks on touched scripts, package source, tests, and docs.

## Assumptions

- Runtime remote template downloads are no longer needed.
- A flavor overlay can replace files from base, especially `prisma/dev.db`.
- The current starter/blank behavioral difference is limited to bundled step files and seeded DB contents.
- Future template variants should be represented as overlays, not full app copies.
