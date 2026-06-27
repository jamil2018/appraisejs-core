# Scaffold Template Sync

This document helps agents work safely with AppraiseJS scaffold templates.

## Mental Model

The root app is the canonical source for scaffolded app behavior. `create-appraisejs` stores one full package-owned
base template plus small flavor overlays for starter and blank projects. Do not manually patch generated template
contents when a root/base source change should flow through template preparation.

## Key Locations

- Root app source: `src/`, `automation/`, `prisma/`, `public/`, `scripts/`, root config files
- Shared template exclusion rules: `src/lib/template-sync-utils.ts`
- Scaffold package: `packages/create-appraisejs`
- Published base template: `packages/create-appraisejs/templates/base`
- Published flavor overlays: `packages/create-appraisejs/templates/flavors/starter`, `packages/create-appraisejs/templates/flavors/blank`

## Sync Flow

1. Make behavior changes in the root/base source first.
2. Run `npm --prefix packages/create-appraisejs run prepare-template`.
3. Review the base template and flavor overlay diffs before finishing.

`prepare-template` intentionally resets scaffold artifacts, including report output, the environment file, and the
locator map starter shape. Preserve those reset rules unless the task explicitly changes scaffold seeding behavior.

Prepared scaffold databases may contain authored starter assets, but they must not contain machine-local coordinator
credentials, leases, personal layouts, durable event rows, test runs, or reports. Template preparation verifies this
invariant before publishing the bundled starter and blank templates.

## When Direct Template Edits Are Acceptable

Direct edits can be appropriate for template-only metadata, README content, scaffold packaging behavior, or files that
template preparation intentionally preserves. Check `packages/create-appraisejs/scripts/prepare-template.ts` before
assuming a file is template-only.

## Validation

- For root-to-template or scaffold package changes, run `npm --prefix packages/create-appraisejs run prepare-template`.
- For CLI/package behavior changes, consider `npm --prefix packages/create-appraisejs run test`.
- For broad template changes, consider `npm --prefix packages/create-appraisejs run build`.
- Review prepared database verification whenever a new machine-local or runtime-only Prisma model is added.

## Never Do

- Do not edit `packages/create-appraisejs/templates/base` or flavor overlays instead of changing root source.
- Do not preserve local report output in scaffold templates unless the task requires fixture changes.
- Do not reintroduce duplicate full starter and blank app template trees.
