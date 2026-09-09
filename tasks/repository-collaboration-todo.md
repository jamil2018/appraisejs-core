# Repository collaboration implementation checklist

Canonical plan: [repository-collaboration-plan.md](./repository-collaboration-plan.md).

Mark a task complete only after its required verification; record evidence and blockers beneath the relevant phase.
Preserve unrelated changes and use a dedicated implementation branch.

## Phase 1 — Exchange identity and contracts

- [x] Inventory all authored dependencies and affected CRUD/search/run/materialization queries.
- [x] Add portable project/entity contracts, strict JSON format, normalization, and bounded file readers.
- [x] Add additive local bindings, ID mappings, baselines, and first-adoption validation.
- [x] Implement all authored aggregate projections, exact Step references, and local environment mappings.
- [x] Verify two-database round trips, identity isolation, input rejection, and canonical relationship ownership.

Evidence: `src/lib/repository-collaboration/*.test.ts` and
`src/services/repository-collaboration/projection-service.sqlite.integration.test.ts` pass (14 tests total);
`npm run validate:migrations` applies all 80 migrations and preserves retained-schema data and foreign keys. The
cross-database fixture uses different local IDs while producing the same portable snapshot, exercises every authored
aggregate, preserves exact Step references/parameters/flow ownership, and excludes runtime environment secrets.

## Phase 2 — Publication and consumption

- [x] Implement explicit publication preview and staged/journaled filesystem installation.
- [x] Implement three-way comparison, whole-record resolution, and dependency-closed prepared reviews.
- [x] Implement atomic apply with stale checks, idempotency, baselines, before-images, and receipts.
- [x] Deliver initial Collaboration UI and shared service contracts.
- [x] Verify conflict outcomes, no partial import, external edit preservation, and publication crash recovery.

Evidence: `operation-service.sqlite.integration.test.ts` and `filesystem.test.ts` pass 6 tests covering receive,
whole-record decisions, transactional rollback, stale/idempotency rejection, journaled publication, external edits,
and recovery. Collaboration action/navigation tests pass 8 focused checks; affected ESLint, Prettier, and TypeScript
checks pass. Interactive browser verification is retained as a Phase 9 release check because the preferred bundled
Browser skill is unavailable in this session.

## Phase 3 — Archive and recovery

- [x] Add archive metadata and prevent destructive deletion of collaboration-managed entities.
- [x] Implement persistent explicit tombstones, restore, reserved names, and reviewed dependency resolution.
- [x] Update active selectors/queries while preserving historical and frozen-execution relationships.
- [x] Implement guarded inverse operations and published-correction guidance.
- [x] Verify skipped tombstone commits, archive/restore graph integrity, run/report history, and stale undo.

Evidence: archive and authored-domain suites pass 31 focused tests for managed-delete refusal, active-only selection,
dependency review, unseen tombstones, exact restoration, preserved historical reads, and stale/published undo guards.

## Phase 4 — Journey reuse

- [x] Add allowlisted reuse projection and versioned local content library.
- [x] Create fresh unlinked drafts from pinned shared briefs.
- [x] Provide analysis/scenario seeds to normally authorized local assignments.
- [x] Re-establish local requirement/discovery traceability and preserve normal approval gates.
- [x] Verify source updates do not rewrite existing consumers and foreign records grant no authority.

Evidence: 17 focused draft, analysis, and reuse tests prove version-pinned fresh drafts, role-scoped advisory inputs,
lease/hash/lineage-bound reads, ordinary local authorization, source-version immutability, and no foreign authority.

## Phase 5 — Bounded Git management

- [x] Add canonical repository inspection and bounded Git execution with sanitized diagnostics.
- [x] Implement fetch/pinned revisions and state-ordered clean fast-forward preparation/integration.
- [x] Implement exact-file commit and authorized remote/ref/range push without consuming unrelated staging.
- [x] Add shared-repository locks, cross-system journals, uncertain-result lookup, and restart recovery.
- [x] Verify adversarial real Git fixtures for step ordering, external edits, worktrees, hooks, rejected pushes,
      unauthorized ranges, and crash boundaries.

Evidence: public callers cannot select Git steps or revisions. Preparation persists an ordered operation-owned plan;
execution derives and fences each next step, verifies current HEAD/ancestry and the complete collaboration-only
range, rejects absent remotes, and records immutable evidence. Hermetic bare-remote fixtures cover fetch pinning,
fast-forward receive, scoped commit/push, hooks, rejection/lost response, shared-common-directory locking, crashes,
and preservation of unrelated staged, unstaged, untracked, and ignored content.

## Phase 6 — Persistent queue and standing authorization

- [x] Add durable task/attempt states, trigger coalescing, supersession, and idempotent scheduling.
- [x] Implement scoped policy grants, revocation, exact decisions, and trusted principal provenance.
- [x] Add local observations, five-minute remote checks, backoff, and startup/reconnect reconciliation.
- [x] Implement exclusive leases/heartbeats/fencing, cancellation, and one-mutator constraints.
- [x] Add meaningful-change notifications and persistent progress/decision UI.
- [x] Verify fake-time scheduling, simultaneous competing workers, stale permissions, and resumed accepted operations.

Evidence: migrated-SQLite and fake-time coverage proves a healthy lease cannot be stolen, expired claims advance a
monotonic fencing token, stale heartbeats fail, due-only five-minute remote observations run from the status/startup
boundary, transient failures back off, cancellation and policy revocation fence later effects, and expired leases
recover on scheduler/claim.

## Phase 7 — Agent connection and organized handoff

- [x] Implement connection setup, observed capability registration, and connection-health reporting.
- [x] Add exclusive worker claim/heartbeat/completion operations and state-driven recovery responses.
- [x] Add single-use scoped tickets and a verified native host adapter where supported.
- [x] Add one-action interactive fallback and honest queued state when no worker is connected.
- [x] Resume the same operation automatically after a user decision.
- [x] Demonstrate real-agent handling through the public client, interruption/reconnect, replacement-worker recovery,
      and ticket replay denial.
- [x] Run Phase 9 release checks before shipping the first collaboration release.

Evidence: a real loopback HTTP integration drives the public package client through worker registration,
healthy-lease exclusion, heartbeat, fake-time expiry/replacement, stale-worker fencing, proposal-only completion, and
single-use ticket replay denial. The 3-flow public proof passes; native wake remains honestly unsupported and queued
interactive fallback remains available.

## Phase 8 — Agent-assisted divergent reconciliation

- [x] Prepare divergent merges in isolated temporary worktrees under shared-repository coordination.
- [x] Accept structured whole-record agent proposals and validate the complete Git/database result.
- [x] Bind and execute final integration against the exact reviewed Git/database state; hand off out-of-scope code
      conflicts explicitly.
- [x] Verify source staleness, invalid proposals, foreign-file conflicts, and recovery/cleanup.
- [x] Repeat Phase 9 checks for this expanded release.

Evidence: the persisted flow executes exact reviewed reconciliation through merge commit, local
fast-forward, atomic database materialization, guarded push, worktree cleanup, and finalization. Focused SQLite and
bare-remote coverage proves exact two-parent/snapshot results, version/digest progression, stale replay refusal,
database-only archive/restore routing, durable worktree recovery after crashes, replacement-worker fencing, and
fail-closed cleanup for foreign ordinary, ignored, symlinked, mismatched, or removal-refused content.

## Phase 9 — Release integration

- [x] Complete UI and CLI/MCP parity and truthful tool effect annotations.
- [x] Generate canonical contracts, setup capabilities, and operation documentation.
- [x] Correct stale export/authority docs and document collaboration setup, recovery, and user permissions.
- [x] Rehearse additive migration on populated databases without resets or identity loss.
- [x] Sync root source to scaffold templates and update affected Graphify outputs.
- [x] Run focused lint/formatting, integration/browser tests, lifecycle/runtime regressions, and build.
- [x] Run applicable package/scaffold, Fallow, React Doctor, MCP-reference, and harness checks.
- [x] Complete independent persistence/security review against the final immutable implementation.
- [x] Record exact validation evidence, remaining limitations, and the end-to-end collaboration demonstration.

Evidence: `npm run validate` passed 254 files / 1,155 unit and integration tests and 36 Chromium E2E tests. Production
build, TypeScript, migration rehearsal across 80 migrations, generated-artifact and package-content checks, package
tests (90 Appraise client and 80 scaffold tests), both package builds, Fallow, React Doctor, harness validation,
scaffold sync, and Graphify checks passed. The final independent judge returned PASS after disposable-repository
proofs for exact cleanup and retention of ordinary and ignored foreign evidence. Remaining limits are explicit: the
scheduler runs only with the Appraise service, native agent wake is not claimed, and ambiguous Git/cleanup state
blocks with evidence retained. Browser verification used the repository Playwright fallback because the preferred
bundled Browser skill was unavailable in this session.
