# ADR-0003: Add Appraise-owned Quality Journeys for agent coordination

## Status

Accepted for phased delivery

## Date

2026-08-25

## Context

AppraiseJS already owns the durable domain artifacts and approval gates for requirements, validation design,
realization, remote evaluation scope, publication, credential authorization, managed execution, evidence, and final
decisions. Human users normally advance those gates through a stateful UI. Agent callers instead have to move exact
identifiers, hashes, preflight packets, environment partitions, idempotency keys, and authorization handoffs across
many independent operations.

The SauceDemo clean-room stress run showed that this caller-managed continuity is the dominant source of agent
failure. Equivalent intent could be rejected because the caller reconstructed a stale or differently canonicalized
packet, and a new agent could not safely resume without receiving conversational history. Weakening approval hashes
would reduce integrity without correcting that ownership problem.

## Decision

Add an Appraise-owned, target-scoped Quality Journey as an orchestration and continuation layer over the existing
domain services.

The Quality Journey Role-Based Workflow contract supersedes the provisional `evaluation_session_*` naming in this
ADR. `QualityJourney` is the durable product concept; a server-side session is only a role-scoped projection of that
authority. The executable Phase 0 contracts and transition tables live under `src/lib/quality-journey/` and are
documented in `docs/quality-journey-contracts.md`.

The merged Quality Operating System domain model is the baseline under this layer: methodology-bound requirement
analysis, validation-design revisions, execution consent, evidence-backed findings, and attribution remain separate
authorities. Their existence does not constitute a session and does not make a host agent the lifecycle owner.

The session does not replace Quality Plan revisions, approvals, remote scopes, publications, Assessments, evidence,
or decisions. Those records remain authoritative. A session revision contains only allowlisted references to those
records, their public hashes, the derived lifecycle phase, blockers, and the actions currently permitted. Appraise
computes the canonical projection and its state hash.

Every session mutation uses compare-and-swap semantics:

```json
{
  "sessionId": "...",
  "expectedStateHash": "sha256:...",
  "idempotencyKey": "...",
  "action": "prepare"
}
```

Reads may request the latest head. Mutations must name the exact head the caller observed. If another caller has
advanced the session, Appraise returns `SESSION_STATE_ADVANCED` with the current safe projection and a read/resume
action. It never silently applies a command to a newer state.

The hash uses a versioned, domain-separated canonical representation. It includes session and target identity,
phase, authoritative artifact references and public hashes, active blockers, and permitted action identifiers. It
excludes credentials and secret-derived values, timestamps, response modes, caller formatting, discovery order,
idempotency keys, transient errors, and conversational data.

Session commands use typed action contracts. A generic unvalidated state-patch operation will not be exposed.
Appraise derives remote environment partitions, realizations, publication selection, and resumable authorization
handoffs through existing canonical services. Approval commands continue to bind the exact requirements, design, or
evidence hash required by the underlying gate.

Session transition execution uses a durable command reservation and deterministic reconciliation protocol. Domain
services remain idempotent authorities. A reserved transition that is interrupted is reconciled from the exact
domain command receipt before the session head advances; the session never claims a transition that the domain
authority did not commit.

Multi-agent execution uses Appraise-owned role work items projected from the session head. Requirement analysts,
target explorers, validation designers, validation implementers, executors, evidence analysts, and independent
reviewers receive role-scoped inputs and may submit only immutable, hash-bound outputs. Appraise validates those
outputs and alone performs lifecycle transitions. Workers do not share a mutable evaluation transcript, cannot
approve their own artifacts, and can be replaced by a zero-context worker that resumes from the latest safe session
projection.

## Public surface

The target Phase 1 surface is intentionally small:

- `quality_journey_create`
- `quality_journey_get`
- `quality_journey_resume`
- `quality_journey_command_submit`
- `quality_journey_work_claim`
- `quality_journey_work_complete`
- `quality_journey_artifacts_list`

`quality_journey_command_submit` is a discriminated union of versioned commands such as requirement submission,
exact-revision approval, discovery, scenario approval, preparation, managed execution, reporting, remediation, and
closure. `quality_journey_get` returns the current stage, state hash, authoritative links, blockers, allowed commands,
and next recommended command. Full internal realization packets, environment snapshots, publication internals, and
credential values are never returned. The provisional `evaluation_session_*` names were never implemented and do
not receive compatibility aliases.

## Alternatives considered

### Relax state hashing

Rejected. Exact hashes are necessary for approvals, replay protection, publication identity, evidence integrity, and
decisions. The problem is caller ownership of canonical packets, not the existence of hashes.

### Store all lifecycle state in one session row

Rejected. This would create a second source of truth beside Quality Plans, scopes, Assessments, and evidence. Session
state must be derived from authoritative domain records and preserved as append-only transition receipts.

### Return the globally latest session to every new connection

Rejected. Multiple targets and evaluations may be active concurrently. Agents must select an authorized target-scoped
session explicitly; only then may they read its latest head.

### Immediately remove the existing MCP operations

Rejected. Existing UI, integrations, and recovery paths require a compatibility period. The session façade will be
introduced additively, proven against current operations, and made the preferred agent path before low-level mutation
operations are deprecated.

## Consequences

- A new agent can resume from Appraise state without receiving the previous agent's transcript.
- Stale concurrent agents fail with a typed state-advanced response rather than producing ambiguous hash failures.
- Approval and evidence hashes remain exact, while incidental caller data no longer participates in continuity.
- The coordinator gains a single bounded state projection and recovery path.
- Session orchestration adds persistence, recovery, compatibility, and migration work; it must not duplicate domain
  business rules.
- Distinct agent roles improve separation of concerns, but their prompts, models, and narration are execution details;
  only Appraise-owned work items, hashes, evidence, and decisions are durable lifecycle state.
- Existing low-level operations remain supported until parity, UI cutover, scaffold synchronization, and clean-room
  agent validation are complete.
