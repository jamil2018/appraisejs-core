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
`npm run validate:migrations` applies all 73 migrations and preserves retained-schema data and foreign keys. The
cross-database fixture uses different local IDs while producing the same portable snapshot, exercises every authored
aggregate, preserves exact Step references/parameters/flow ownership, and excludes runtime environment secrets.

## Phase 2 — Publication and consumption

- [ ] Implement explicit publication preview and staged/journaled filesystem installation.
- [ ] Implement three-way comparison, whole-record resolution, and dependency-closed prepared reviews.
- [ ] Implement atomic apply with stale checks, idempotency, baselines, before-images, and receipts.
- [ ] Deliver initial Collaboration UI and shared service contracts.
- [ ] Verify conflict outcomes, no partial import, external edit preservation, and publication crash recovery.

## Phase 3 — Archive and recovery

- [ ] Add archive metadata and prevent destructive deletion of collaboration-managed entities.
- [ ] Implement persistent explicit tombstones, restore, reserved names, and reviewed dependency resolution.
- [ ] Update active selectors/queries while preserving historical and frozen-execution relationships.
- [ ] Implement guarded inverse operations and published-correction guidance.
- [ ] Verify skipped tombstone commits, archive/restore graph integrity, run/report history, and stale undo.

## Phase 4 — Journey reuse

- [ ] Add allowlisted reuse projection and versioned local content library.
- [ ] Create fresh unlinked drafts from pinned shared briefs.
- [ ] Provide analysis/scenario seeds to normally authorized local assignments.
- [ ] Re-establish local requirement/discovery traceability and preserve normal approval gates.
- [ ] Verify source updates do not rewrite existing consumers and foreign records grant no authority.

## Phase 5 — Bounded Git management

- [ ] Add canonical repository inspection and bounded Git execution with sanitized diagnostics.
- [ ] Implement fetch/pinned revisions and clean fast-forward preparation/integration.
- [ ] Implement exact-file commit and authorized remote/ref/range push without consuming unrelated staging.
- [ ] Add shared-repository locks, cross-system journals, uncertain-result lookup, and restart recovery.
- [ ] Verify real Git fixtures for external edits, worktrees, hooks, rejected pushes, and crash boundaries.

## Phase 6 — Persistent queue and standing authorization

- [ ] Add durable task/attempt states, trigger coalescing, supersession, and idempotent scheduling.
- [ ] Implement scoped policy grants, revocation, exact decisions, and trusted principal provenance.
- [ ] Add local observations, five-minute remote checks, backoff, and startup/reconnect reconciliation.
- [ ] Implement leases/heartbeats/fencing, cancellation, and one-mutator constraints.
- [ ] Add meaningful-change notifications and persistent progress/decision UI.
- [ ] Verify fake-time scheduling, competing workers, stale permissions, and resumed accepted operations.

## Phase 7 — Agent connection and organized handoff

- [ ] Implement connection setup, observed capability registration, and connection-health reporting.
- [ ] Add worker claim/heartbeat/completion operations and state-driven recovery responses.
- [ ] Add single-use scoped tickets and a verified native host adapter where supported.
- [ ] Add one-action interactive fallback and honest queued state when no worker is connected.
- [ ] Resume the same operation automatically after a user decision.
- [ ] Demonstrate real-agent handling, interruption/reconnect, replacement-worker recovery, and ticket replay denial.
- [ ] Run Phase 9 release checks before shipping the first collaboration release.

## Phase 8 — Agent-assisted divergent reconciliation

- [ ] Prepare divergent merges in isolated temporary worktrees under shared-repository coordination.
- [ ] Accept structured whole-record agent proposals and validate the complete Git/database result.
- [ ] Bind final integration to exact reviewed state; hand off out-of-scope code conflicts explicitly.
- [ ] Verify source staleness, invalid proposals, foreign-file conflicts, and recovery/cleanup.
- [ ] Repeat Phase 9 checks for this expanded release.

## Phase 9 — Release integration

- [ ] Complete UI and CLI/MCP parity and truthful tool effect annotations.
- [ ] Generate canonical contracts, setup capabilities, and operation documentation.
- [ ] Correct stale export/authority docs and document collaboration setup, recovery, and user permissions.
- [ ] Rehearse additive migration on populated databases without resets or identity loss.
- [ ] Sync root source to scaffold templates and update affected Graphify outputs.
- [ ] Run focused lint/formatting, integration/browser tests, lifecycle/runtime regressions, and build.
- [ ] Run applicable package/scaffold, Fallow, React Doctor, MCP-reference, and harness checks.
- [ ] Complete independent persistence/security review against the final immutable implementation.
- [ ] Record exact validation evidence, remaining limitations, and the end-to-end collaboration demonstration.
