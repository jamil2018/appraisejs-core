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

TypeScript sync scripts execute once through TSX with the temporary workspace configuration. A failed child
propagates its error without a second loader attempt, including failures after partial fixture writes. The outer
seed preparation retains its existing local seed fallback; offline verification must keep both repository seed
database candidates absent when fresh migration and sync are required.

`prepare-template` intentionally resets scaffold artifacts, including report output, the environment file, and the
locator map starter shape. Preserve those reset rules unless the task explicitly changes scaffold seeding behavior.
It also copies `.fallowrc.json` and `config/` so scaffolded release and quality scripts always ship with the ratchet
baselines and release-readiness contract they reference.

Every `graphify-out/` directory is excluded from the prepared template. Repository graphs support AppraiseJS
development and should not increase the installed scaffold or published `create-appraisejs` package size.

Repository-only parity harnesses that reach across package boundaries are also excluded from the prepared template.
For example, the Scenario Portfolio MCP parity corpus compares root canonical source with the independently published
MCP package; generated applications retain their self-contained tests and must not import the producer repository.
The Quality OS certifier resolves repository-only suites only when their files exist, so generated apps never attempt
to run excluded parity tests or record them in their certification receipt.

The repository's swarm-routing configuration, agents, ledger utilities, development-harness catalogs, learning records,
and harness-only commands are also excluded.
Phase-0 and managed-Journey qualification scripts, fixtures, tests, and experimental worker gateways are likewise
repository-only. Template preparation excludes those exact path families while retaining canonical Journey services,
contracts, migrations, and product tests.
The M06 custody controllers under `scripts/test-harness/m06/` and their four repository SQLite test entrypoints
are also excluded. Those fixtures depend on producer-owned generated clients, exact child-process tools and local
evidence. The local `.orig` backup of the custody integration matrix is also excluded without removing or changing the backup. Canonical source custody services, contracts and migrations remain part of the generated app. Native patch preparers10–15, source-bound assembly tests, native session bridge factories and the cross-package CLI collaboration fixture are also repository-only; reusable native source owner/protocol and MCP acceptance modules remain included. These boundaries are checked through both repository-relative and copy-relative paths; package exclusion evidence still requires canonical template preparation and actual packed inventory checks.

Generated projects retain their own bundled `check:harness` command, which verifies that this repository-only
orchestration surface has not leaked into the scaffold.

Prepared scaffold databases may contain authored starter assets, but they must not contain machine-local coordinator
credentials, leases, personal layouts, durable event rows, test runs, or reports. Template preparation verifies this
invariant before publishing the bundled starter and blank templates. They must also contain zero `TargetProject`
rows so a generated app cannot inherit the producer machine's repository or temporary build path.
The M04 runtime check also requires zero provider runs, dispatch intents, observations, and wake intents, including
any persisted thread or turn handles on those records. A provider hub slot may exist only when all ownership fields
are empty: `providerRunId`, `intentId`, `sendBoundaryId`, and `reservedAt` must be null. An idle singleton is allowed;
no provider correlation or occupied slot is seeded into either flavor.

Starter and blank currently share the same schema and Step Definition seed inputs. Template preparation therefore
migrates and seeds one canonical temporary database, copies it to both flavor overlays, and verifies each composed
flavor independently. Preparation fails before reuse if the registered Step Definition readiness inputs diverge.

## When Direct Template Edits Are Acceptable

Direct edits can be appropriate for template-only metadata, README content, scaffold packaging behavior, or files that
template preparation intentionally preserves. Check `packages/create-appraisejs/scripts/prepare-template.ts` before
assuming a file is template-only.

Generated projects retain the guarded `npm run migrate-db` and startup scripts described in
[Quality Journey compatibility](quality-journey-compatibility.md). Unknown storage is refused before readiness writes;
the preparation workflow does not weaken that guard or reset a user database.
The C3.2 producer-package reinstall/migration fixture is repository-only; generated apps retain the self-contained
storage guard and its focused tests without importing the producer CLI source.

Preparation refuses incomplete or changed migration inputs against the checked-in integrity inventory before
copying root/base source; it never regenerates the inventory. Package validation compares the actual packed
scaffold's migration names and SQL hashes with canonical source. The package-owned `scaffold-README.md` is copied
to the generated project's README so first-setup and recovery instructions ship with the app.

## Validation

- For root-to-template or scaffold package changes, run `npm --prefix packages/create-appraisejs run prepare-template`.
- For CLI/package behavior changes, consider `npm --prefix packages/create-appraisejs run test`.
- For broad template changes, consider `npm --prefix packages/create-appraisejs run build`.
- In a clean checkout or package CI job, install both root and `packages/create-appraisejs` dependencies before the
  package build. Template preparation executes the root-owned Prisma migration and sync toolchain because root source
  remains canonical; it does not fall back to an untracked development database in release CI.
- Repository secret checks build and inspect a temporary database from canonical migrations. They do not require or
  mutate an ignored developer database, and they remove the temporary database after inspection.
- Review prepared database verification whenever a new machine-local or runtime-only Prisma model is added.

## Never Do

- Do not edit `packages/create-appraisejs/templates/base` or flavor overlays instead of changing root source.
- Do not preserve local report output in scaffold templates unless the task requires fixture changes.
- Do not reintroduce duplicate full starter and blank app template trees.

The M03 host-session backfill rehearsal is repository-only because it invokes `scripts/tests/` fixtures. Its Vitest wrapper is excluded alongside the historical compatibility rehearsal. Generated projects retain the canonical migration, session services and self-contained session service tests; no historical qualification runtime roots or fixtures are bundled.

M05 process smoke and its owned-child fixture are repository-only, as are the real-child tests that depend on it. Preparation retains the internal supervisor/transport runtime and self-contained transport tests, and does not seed process or provider state.

M06 Analysis fixture delivery, its owned child and smoke remain repository-only. The internal canonical Analysis continuation observer is synchronized normally; it cannot dispatch or reconcile a provider. Fixture exclusion does not change the production dispatch refusal.
