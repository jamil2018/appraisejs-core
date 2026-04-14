# Include Locator Companion in Synced Templates

## Summary
The current sync flow copies `packages/cucumber-runtime` into the template, but it does not copy `packages/locator-picker-companion`, even though the template already references it in `tsconfig.json`, `package.json`, and `src/lib/locator-picker/session-manager.ts`. On this branch, the recent test-suite files appear to already exist in both template trees; the only confirmed structural omission is the locator companion package.

## Implementation Changes
- Update [scripts/sync-appraise-base-template.ts](/Users/hasnat/Projects/appraise/scripts/sync-appraise-base-template.ts) to sync `packages/locator-picker-companion` into `templates/default/packages/locator-picker-companion`.
- Copy the companion package as a real package, not as ad hoc files: include `package.json`, `tsconfig.json`, `src/`, and `dist/`.
- Refactor the existing cucumber-runtime copy logic into a reusable internal-package sync helper so both internal packages are handled the same way and future package additions are harder to miss.
- Keep current exclusion behavior for junk (`node_modules`, `.next`, `.git`, etc.), but do not exclude the companion `dist/` output because the user wants the binaries shipped with the template.
- Update the generated template scripts in [scripts/sync-appraise-base-template.ts](/Users/hasnat/Projects/appraise/scripts/sync-appraise-base-template.ts) so `build:local` also runs `build:locator-picker-companion`, matching the root app’s build expectation instead of only building `cucumber-runtime`.
- Confirm [packages/create-appraisejs/scripts/sync-templates.ts](/Users/hasnat/Projects/appraise/packages/create-appraisejs/scripts/sync-templates.ts) does not strip the new package or its `dist/` files when copying `templates/default` into the bundled template. No exclusion change is expected unless the audit shows otherwise.
- Add an explicit audit step during implementation to compare recent root additions against what the sync script covers. Based on the current branch scan, no other newly added core files are structurally missing beyond the companion package; if the resync surfaces any mismatch, include those files in the same change.

## Test Plan
- Run the root-to-template sync and verify both template trees contain:
  - `packages/locator-picker-companion/package.json`
  - `packages/locator-picker-companion/tsconfig.json`
  - `packages/locator-picker-companion/src/cli.ts`
  - `packages/locator-picker-companion/dist/cli.js`
  - `packages/locator-picker-companion/dist/launcher.js`
- Verify `templates/default/package.json` and `packages/create-appraisejs/templates/default/package.json` include `build:locator-picker-companion` and that `build:local` invokes it.
- Add or update template-copy tests under `packages/create-appraisejs/src` so the packaged scaffold asserts the companion files are copied and retained.
- Re-run a recent-changes parity check against the current branch to confirm there are no other missing core files after the sync update.

## Assumptions
- “Template” means both `templates/default` and `packages/create-appraisejs/templates/default`; the fix must cover both sync stages.
- The required deliverable is the companion package plus its shipped binaries, not only source files.
- “Most recent changes” refers to the commits currently on this branch after the last template sync baseline; current exploration found no other missing core assets besides `packages/locator-picker-companion`.
