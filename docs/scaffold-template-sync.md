# Scaffold Template Sync

This document helps agents work safely with AppraiseJS scaffold templates.

## Mental Model

The root app is the canonical source for scaffolded app behavior. Template copies exist so `create-appraisejs` can
produce starter and blank projects. Do not manually patch template copies when a root/base source change should flow
through sync.

## Key Locations

- Root app source: `src/`, `automation/`, `prisma/`, `public/`, `scripts/`, root config files
- Root template sync script: `scripts/sync-appraise-base-template.ts`
- Shared template exclusion rules: `src/lib/template-sync-utils.ts`
- Synced root templates: `templates/`
- Scaffold package: `packages/create-appraisejs`
- Published scaffold templates: `packages/create-appraisejs/templates/`

## Sync Flow

1. Make behavior changes in the root/base source first.
2. Run `npm run sync-template` to update `templates/starter`.
3. When the scaffold package should inherit the change, run
   `npm --prefix packages/create-appraisejs run sync-templates`.
4. Review both root template and package template diffs before finishing.

`scripts/sync-appraise-base-template.ts` intentionally resets some starter artifacts, including report output and the
locator map starter shape. Preserve those reset rules unless the task explicitly changes scaffold seeding behavior.

Prepared scaffold databases may contain authored starter assets, but they must not contain machine-local coordinator
credentials, leases, personal layouts, durable event rows, test runs, or reports. Template preparation verifies this
invariant before publishing the bundled starter and blank templates.

## When Direct Template Edits Are Acceptable

Direct edits can be appropriate for template-only metadata, README content, scaffold packaging behavior, or files that
the sync script intentionally preserves. Check `scripts/sync-appraise-base-template.ts` before assuming a file is
template-only.

## Validation

- For root-to-template changes, run `npm run sync-template`.
- For scaffold package changes, run `npm --prefix packages/create-appraisejs run sync-templates`.
- For CLI/package behavior changes, consider `npm --prefix packages/create-appraisejs run test`.
- For broad template changes, consider `npm --prefix packages/create-appraisejs run build`.
- Review prepared database verification whenever a new machine-local or runtime-only Prisma model is added.

## Never Do

- Do not edit `templates/starter` or `packages/create-appraisejs/templates/starter` instead of changing root source.
- Do not preserve local report output in scaffold templates unless the task requires fixture changes.
- Do not update only one template layer when both root templates and package templates are expected to stay in sync.
