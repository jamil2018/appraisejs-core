> 2026-10-20 follow-up: the missing `DATABASE_URL` build issue is resolved using a fresh disposable database and process-local environment. Build and headless tests passed; [successor evidence](m05-evidence/disposable-database-verification-02.json) records all 91 canonical migration checksums, unchanged empty provider state and log hashes. Renewed exact-artifact review is stored in `.appraisejs/m05-final-manifest-02.json` and `.appraisejs/m05-final-review-02.json`. The predecessor records below remain unchanged historical evidence; they do not describe the current build limitation.

# M05 local process supervision continuation

Date: 2026-10-20 (Asia/Dhaka). Current host authorization covers every M05 implementation slice, offline checks and owned fixture-process smoke; no real provider/app-server launch, authentication, inference, production dispatch, M06+, shipping or harness policy change.

Freshly fetched base is `9011b6b43f8bd45cf1e486cb363e890ec6c66d41`, the PR #304 cleanup merge containing shipped M04 via PR #303. Branch `codex/m05-supervise-local-process`, isolated worktree `/private/tmp/appraise-m05-supervise-local-process`. Original migration checkout, unrelated worktrees, approved plans, frozen M00, consumed allocations and historical outcomes are preserved. Earlier M04 preparation/no-shipping headers are historical; this additive continuation records the shipped state without rewriting them.

Plan: [bounded M05 invariants and slices](m05-supervision-plan-01.md). Implementation reference: [supervision behavior](../../docs/quality-journey-process-supervision.md). Evidence classification is owned local fixture process plus canonical disposable SQLite, not provider runtime qualification.

## Working process path before regression tests

Direct smoke succeeded in `/private/tmp/m05-first-working-04.log`; sanitized receipt `.appraisejs/m05-first-working-receipt-01.json`. It observed initialization, one start, exact thread/turn acknowledgement persistence, synchronous fencing, actual owned group drain and private-root removal. Reopening SQLite retained one run/intent and occupied unreconciled slot; canonical accepted artifacts remained zero and production entry refused. Only after this PASS were new regression suites authored.

Earlier diagnostic failures are retained: private execa stdio option conflict; sandbox refusal of process inspection; fixture comparison of macOS alias paths; Darwin-injected encoding metadata. Offline dependency setup used isolated worktree installs and copied read-only Prisma engine cache into a temporary cache rather than modifying the original checkout. No provider, external network call, authentication or model inference was used by fixtures.

## Implementation

S1: reusable trusted internal supervisor core, explicit per-turn owned child decision, separate fixture adapter, private isolated state/env/stdio, bounded framing and correlation, synchronous transport fencing and database-serialized writes.

S2: regression coverage for framing, fragmented UTF-8, malformed input/events, unexpected RPC, pending limits, partial writes/backpressure, cancellation, deadlines, crash/restart, stale authority, delayed sends and owned cleanup. Composed tests use actual migrated SQLite and local child processes; process failures never release the slot or create another start.

S3/S4 validation and exact-artifact review are recorded below when complete. M05 supplies no scheduler, role delivery loop, native auth, real provider launcher, public opt-in or consumed-permit release. Local process cleanup is separate from provider termination. Appraise remains lifecycle and artifact authority.

Runtime qualification remains false. M02 is accepted only for trusted-agent scripted native functional conformance with unobserved helper lifetime. GC3 remains REVISE/not passed, real inference remains consumed 3/3, and all historical UNKNOWN and unresolved cleanup remain unchanged.

## Final implementation and verification

S1–S4 are complete within repository/owned-fixture scope, subject to the matching independent review receipt described below. The reusable core uses trusted adapter wiring; production provider launching and dispatch still refuse. No actual Codex provider adapter or real-runtime qualification is claimed.

- Final headless root run: 295 files passed, 1,724 tests passed, 62 skipped. This command selected the headless variants of existing dual-mode suites: 58 headed variants were excluded by the current user instruction and four existing skips remain. All 62 new M05 tests run without a browser UI.
- Focused M03–M05 SQLite/service/process checks passed; the final M05 suite is separately recorded in the verification receipt. AppraiseJS package: 295 passed; scaffold package: 98 passed. TypeScript and root Next/package builds pass. Full ESLint findings introduced during implementation were fixed; ten inherited warnings remain. Fallow reports zero introduced dead code, complexity or duplication; React Doctor retains inherited score 78 with 88 warnings.
- Canonical scaffold preparation succeeded, runtime file bytes match root source, and all four repository-only fixture/smoke paths are absent from the scaffold. All 91 migration names and SQL checksums match the packed scaffold. No schema/migration changed. Artifact policy, documentation links and harness/CI registry checks pass.
- The three affected Graphify scopes were regenerated through generators and validated for unique IDs and valid endpoints. Source/scripts trees needed documented HTML regeneration after the large-graph skip. Scripts used deterministic sequential AST extraction plus host extraction for two unchanged historical documents. Guarded freshness/shrink refusals were retained and never overridden. Final generator receipts describe exact output hashes; placeholders are not measured model usage.
- Original checkout remains clean at `c99a15013b771fa7bd41f95d0602afe9e20ecaca`; approved M00/M03/M04 plans and migration roadmap/todo bytes match the fetched base. Frozen M00 SHA-256 remains `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`. Nothing was pushed, merged or shipped; no original migration commits were carried wholesale into this worktree.

The final headless run follows two retained diagnostic broad runs: an unchanged CAPTCHA fixture timed out once and passed in isolation; an artificially short fixture request deadline could expire before readiness. The lost-turn-ack deadline is now separate from readiness, while frozen production and global test timeouts are unchanged. Independent review corrected premature turn-event handling, original-permit validation and cancellation at awaited phase boundaries. Private startup byte preservation and request/write-drain cancellation also have regressions. These corrections preserve uncertainty and do not grant replacement or slot release.

[Verification receipt](m05-evidence/implementation-verification-01.json) records exact local log hashes and observed facts. Whole-artifact identity and independent acceptance are bound outside tracked bytes in `.appraisejs/m05-final-manifest-01.json` and `.appraisejs/m05-final-review-01.json`; verify that receipt against the current artifact before relying on acceptance. This avoids a tracked review-hash cycle. Requested agent selectors and bounded-context arguments are provenance only; effective named-role/model/context/sandbox enforcement is not independently host-attested. Advisory lesson `lesson-d6c995761cc8a20c` captures startup-buffer and original-sender evidence; no harness policy, model, concurrency or quality gate changed.

Remaining gates: separately authorized real-binary/provider adapter/configuration and authentication work; exact native M03 session/authority and tool-boundary re-probes; effective provider/containment/helper-lifetime/termination evidence; later M06+ delivery and M11/M12 recovery/installation gates. Historical campaigns, runtime roots, consumed allocations, UNKNOWN outcomes and unresolved cleanup must not be replayed or reset. Passing local fixture cleanup does not prove real provider termination or release an uncertain occupied slot.

## Configured disposable-database build follow-up

The user authorized correcting the build environment, rerunning the build and headless tests, and renewing independent review. No product code, `.env` file, schema, template, provider launch or harness policy was changed. The complete predecessor artifact remained `cccd73edc34dc3db6278c14cf942c6aa4de43ad3783406a9afb3802fcc0c48f4` throughout validation; only this additive documentation and its successor evidence changed afterward.

A new mode-0700 temporary workspace received a SQLite database initialized by `node e2e/apply-migrations.mjs`. All 91 migration names/checksums match canonical source. The migration-owned local target row refers to this disposable storage. Provider runs, dispatch intents and hub slots are empty before and after validation. Both commands received the same absolute `file:` URL through process-local `DATABASE_URL`, with no fallback to a developer database:

- `npm run build`: exit 0; compilation, TypeScript, static generation and route output complete without the missing-URL or Prisma initialization error. Three broad-pattern warnings from unchanged source remain.
- `npm run validate:unit -- --testNamePattern '^(?!.*headless=false)'`: 295 files passed; 1,724 tests passed and 62 skipped. This retains the user's headless restriction: 58 headed variants are excluded and four existing skips remain.

The first preparation refused an overly strict assertion about the migration-owned target before any build ran. That diagnostic and its database remain preserved; corrected validation used a second fresh database. Earlier build/test logs and manifest/review 01 were not overwritten. The new receipt identifies the actual database, command logs and hashes for independent inspection.

This resolves the build's missing configuration issue. It verifies a configured static build and offline headless fixtures, not a running app-server or real provider. `runtimeQualified=false`; authentication, inference, effective containment/termination, production dispatch, M06+ and shipping remain outside this follow-up.
