# Quality Journey Contracts

Quality Journey is Appraise's durable, target-scoped workflow from requirement intake through analysis, discovery,
scenario review, automation, managed execution, triage, report review, and closure. Appraise owns the lifecycle state,
artifact revisions, approvals, evidence, commands, and transitions. Coordinator conversation and worker sessions are
never lifecycle authority.

The executable Quality Journey foundation is in `src/lib/quality-journey/`:

- `contracts.ts` defines versioned strict schemas for stages, roles, artifacts, assignments, provider-neutral
  capability requests, spawn receipts, worker results, commands, conflicts, and closure.
- `role-definitions.ts` defines the six semantic roles and their negative authority. Coordinator, Runner, Factory,
  managed runtime, and optional independent review are control or assurance components, not semantic worker roles.
- `agent-factory.ts` implements the Phase 2 provider-neutral Factory boundary. It creates least-privilege spawn requests,
  resolves role/profile authority from the canonical registries, binds assignments to their exact version and digest,
  validates structured effective boundary and tool receipts, rejects forged or stale results, and creates replacement
  assignment projections without transcript fields.
- `lifecycle.ts` defines normal stage transitions, actors, required artifacts, forbidden capabilities, failure codes,
  work-item transitions, and role eligibility.
- `state.ts` defines the domain-separated canonical state hash input. Timestamps, idempotency keys, credentials,
  response formatting, discovery order, and conversation are deliberately excluded.
- `golden-fixtures.ts` exports the shared fixtures that later kernel, API, UI, and MCP tests must consume.
  Its current validator checks command stage, actor, successor-state-hash sequencing, and individual work-item
  transitions. Phase 0 still needs full cross-step replay for spawn, closure, attribution, and continuous work state.
- `kernel.ts` provides the pure deterministic command kernel. It enforces journey scope, exact-state
  compare-and-swap, actor/stage transitions, immutable idempotency replay, changed-request conflicts, successor
  projections, and append-only lifecycle events without treating conversation as authority.
- `runner.ts` derives stage-role eligibility, stable work-item identities, complete node projections, and deterministic
  active-lease expiry from Appraise state.
- `quality-journey-service.ts` persists the authoritative projection, immutable revisions/cycles/commands/events and
  artifact links, blockers, work-item authorization, assignment manifests, spawn requests and receipts, attempt
  replacement lineage, lease authority, hard attempt ceilings, cancellation/revocation state, and exact result
  envelopes. Compare-and-swap state mutation, command/event creation, work claims, dispatch, receipt recording,
  completion, expiry, cancellation, revocation, and replacement are transactional.
- `analysis-contracts.ts` defines the strict Phase 3 Analysis Charter, question, answer, successor, and canonical-hash
  payloads. Stable requirement IDs are charter content, never generated from a revision hash.
- `quality-journey-analysis-service.ts` adds the private coordinator-service control plane for assignment-bound
  Analyzer submission, immutable Q&A, publication, and exact approval. It is deliberately not yet an action, MCP,
  or UI surface.
- Prisma migration `20260828140000_add_quality_journey_phase_1` establishes the durable aggregate and database-enforced
  append-only lifecycle history. Prepared scaffold databases contain the schema but no journey, event, or lease state.
- Prisma migration `20260828150000_add_quality_journey_factory_lineage` adds immutable work-item authorization and
  append-only Factory assignment/request/receipt lineage to those durable attempts.
- Prisma migration `20260828160000_complete_quality_journey_factory_phase_2` adds hard attempt ceilings, terminal
  cancellation/revocation state, durable dispatch reservations, and replacement-projection lineage. Existing recovered
  authorizations receive one attempt; newly issued authorizations receive three.
- Prisma migration `20260901090000_add_quality_journey_analysis_control_plane` adds insert-only analysis revision,
  question, answer, publication, and approval records. Each points to an immutable `QualityJourneyArtifact` payload;
  publication and approval therefore never update the reviewed charter in place.

## Lifecycle

The normal stage path is:

`INTAKE -> ANALYSIS -> ANALYSIS_REVIEW -> DISCOVERY -> SCENARIO_DESIGN -> SCENARIO_REVIEW -> AUTOMATION -> EXECUTION -> TRIAGE -> REPORT_REVIEW -> CLOSED`

Analysis, scenario, and report decisions bind exact immutable revisions. A changed upstream revision invalidates only
the approvals and downstream artifacts whose reviewed scope changed. Material execution still requires the existing
conditional execution-consent and credential-authorization gates.

## Phase 3 analysis control plane

The first Phase 3 backend increment is intentionally narrow. A Requirement Analyzer submits an Analysis Charter only
through its current, receipt-validated `REQUIREMENT_ANALYZER` assignment and lease. Appraise atomically stores the
canonical charter and each unresolved question as immutable artifact payloads, records the analysis control rows, and
completes the assigned work item. The charter binds the active requirement revision and cycle; each obligation refers
to a unique, stable charter requirement ID. A successor must carry each predecessor requirement ID forward or mark it
retired, retains the retired-ID history, and cannot reuse a retired ID. `unresolvedQuestionIdsJson` is a derived
transactional projection of the relational required-question head, never caller authority. Submission provenance is
also relational: an analysis revision retains restrictive foreign keys to the exact completed Analyzer work item and
attempt that produced it.

A user may append an immutable answer or answer correction only for a question on the current analysis revision,
including before publication. Once approved, that revision rejects further answers: a changed analysis must go through the normal
`REQUEST_ANALYSIS_REVISION` loop and a successor Analyzer assignment. A successor may cite resolved answer artifact IDs
only from its immediate predecessor, preventing a hidden cross-revision answer import.
On that revision loop Appraise supersedes the completed Analyzer authorization with a new immutable authorization and
provides a fresh worker only the exact predecessor charter, questions, and answers as artifact references; it never
reuses a coordinator-held transcript or undisclosed database identifiers.
The accepted `REQUEST_ANALYSIS_REVISION.feedback` is itself stored as an immutable
`ANALYSIS_REVISION_FEEDBACK` artifact and is included in that assignment, so the fresh worker receives the exact user
instruction through Appraise-owned authority. Exact command replay preserves that one feedback artifact, while
changed idempotent input is rejected.
This added read authority is RoleDefinition registry version 2. Version 1 remains immutable and validates already
issued Factory authorizations against its original Analyzer scope.
The attempt ceiling is scoped to that immutable authorization, so legitimate semantic revision rounds do not consume
one another's retry allowance; work-attempt sequence numbers remain monotonic for audit lineage. An exhaustion
blocker records its authorization ID and authorization-local attempt count alongside that monotonic sequence.

The Runner publishes by submitting the existing `PUBLISH_ANALYSIS` command with exactly one matching Analysis Charter
artifact reference, and publication is blocked until every required question has an answer. The user approves through
the existing `DECIDE_ANALYSIS` command with the same exact reference and hash. Both the kernel command and the new
publication/decision record commit in one transaction. The coordinator derives a canonical review hash from the
charter and ordered immutable Q&A payloads and incorporates it in the authoritative state hash, so an answer or
correction invalidates a stale decision request. Approval fails while any required question for that exact revision has
no answer, and it also rejects a formerly published revision after a successor becomes active. Decision explicitly
compares the publication's stored review hash with the current canonical Q&A review hash, so a post-publication
correction is fail-closed even when the command's state-hash CAS is otherwise current. The review identity is stored
in a dedicated durable `analysisReviewHash` projection and contributes to the kernel state hash; it is not an entry in
the revision-ID map. Exact replay of the original
publish returns its immutable publication receipt even after a later Q&A correction; reusing that idempotency key
with changed input is rejected. Exact decision replay likewise returns its matching immutable decision rather than
attempting to create another row. These backend service operations are not yet exposed as
coordinator actions, MCP operations, or screens; those remain follow-on Phase 3 work.

Role work items have an immutable authorization lineage and a separate durable attempt lineage. Each claim atomically
persists its Assignment Manifest, canonical spawn request, hashes, and any predecessor-attempt link. A claim with no
issued authorization fails closed. Explicit resume conservatively recovers authorization for active Phase 1 work from
Appraise-owned work-item fields and the current canonical role registry; callers cannot supply or broaden that scope.
Work items can be `COMPLETED`, `CANCELLED`, `SUPERSEDED`, or `BLOCKED`; `REFUSED` is a terminal attempt state that
blocks its work item. Lease expiry leads to a replacement attempt on the same work item with explicit predecessor
ancestry and no transcript replay. Replacement input derives canonically
from current work-item references, the active journey revision, and durable `QualityJourneyArtifact` records for the
same cycle; its projection hash and structured predecessor diagnostics are persisted. A late predecessor cannot complete
once a replacement is current.

## Commands and conflicts

Mutations carry the exact `journeyId`, `targetProjectId`, `expectedStateHash`, and `idempotencyKey`. Appraise validates
authorization, artifact revision, lifecycle preconditions, and the expected hash atomically. A committed command
returns its successor stage and state hash. A stale command returns `STALE_STATE_HASH` with the current safe stage,
hash, and next commands and commits no lifecycle event. Reusing an idempotency key with changed canonical input is an
`IDEMPOTENCY_KEY_REUSED` conflict; an exact replay returns the original result.

The journey kernel is exposed through `quality_journey_create`, `quality_journey_get`, `quality_journey_resume`,
`quality_journey_command_submit`, `quality_journey_work_claim`, `quality_journey_work_dispatch`,
`quality_journey_work_complete`, `quality_journey_work_cancel`,
`quality_journey_work_revoke`, `quality_journey_factory_evidence_inspect`, and `quality_journey_artifacts_list`.
Dispatch selects only a compatible registered provider-neutral adapter; no adapter blocks before execution. A durable
per-attempt dispatch key is the adapter idempotency key. Only an adapter-thrown
`AgentFactoryDispatchNotStartedError`—an explicit attestation that no worker was created—clears its in-flight
reservation and may retry the same adapter/key; a live concurrent retry observes `DISPATCH_PENDING`. Any generic or
unclassified adapter rejection is ambiguous. If the provider response is lost after dispatch begins, Appraise cannot
prove that no worker exists: lease recovery records
`DISPATCH_UNRESOLVED` and an `AMBIGUOUS_PROVIDER_DISPATCH` blocker, retains the adapter/key, and issues no replacement
until a future adapter-reconciliation capability exists. Receipt ingress requires both the exact lease owner token and
the durable dispatch reservation. Cancellation and revocation accept only the explicit
Appraise control actors `USER`, `COORDINATOR`, and `RUNNER`; no provider or worker actor is recognized.
Public dispatch responses are bounded to replay/status, work-item and attempt IDs, receipt ID/hash, and adapter ID as
applicable. They never return a receipt payload, boundary evidence, effective worker model/runtime, prompt, or key.

An identical command replay returns its original committed result and creates no second event. Reusing an idempotency
key with changed input conflicts. Competing commands from one predecessor hash can produce only one compare-and-swap
successor. `quality_journey_resume` reconstructs every semantic role node from durable stage/work-item/blocker state,
expires elapsed leases, and makes only eligible, non-ambiguous work with attempts remaining replacement-claimable
without replaying a worker transcript. It resolves an active Factory refusal blocker only when its current refused
attempt has budget remaining, then requests a replacement attempt with current artifact projection. An exhausted
authorization instead retains an `ATTEMPT_BUDGET_EXHAUSTED` blocker with safe-resume command `NONE`: a new journey or
future explicit re-authorization is required and `quality_journey_resume` cannot restart it.

## Role authority

| Role                   | Writes                              | Explicit negative authority                                         |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------- |
| Requirement Analyzer   | Analysis Charter and questions      | Cannot approve, observe the target, or automate                     |
| Scout                  | Observation bundles and evidence    | Cannot mutate catalogs, change intent, or attribute failures        |
| Resource Explorer      | Resource-resolution bundles         | Cannot browse the target, mutate catalogs, or decide coverage       |
| Test Scenario Designer | Scenario portfolio and revisions    | Cannot invent target facts, automate, or approve                    |
| Automator              | Suites, cases, and runtime capsules | Cannot change intent, approve implementation, or attribute failures |
| Triager                | Test Report Analysis                | Cannot modify automation, rewrite results, or approve closure       |

Capability-profile requests contain judgment, latency, isolation, tool, and runtime-boundary requirements but no
provider or model names. Factory spawn requests preserve that neutral profile and the exact assignment scope. Effective
model and runtime properties belong only in the attempt-level spawn receipt, where each requested boundary is recorded
as enforced, verified, unverified, or unsupported. Every configured high-risk runtime boundary must be `VERIFIED` with
evidence before a `STARTED` receipt is accepted; a missing, unsupported, or unverifiable required boundary blocks worker
acceptance. Effective reasoning must meet the requested ranking, effective latency may not exceed the requested
preference, requested/effective context, filesystem, network, target, credential, and lifecycle-command values are
structured and effective values cannot exceed the assignment; effective tools must satisfy required tools, exclude
forbidden tools, and remain within the assignment.

Assignment issuance uses the registry-aware validator with the resolved Role Definition and capability profile, and
enforces exact registry version and digest binding, including the role's readable input-artifact kinds. The durable
authorization record contains only assignment-scoped authority: it has no transcript, credential value, or provider model. A claim persists the concrete attempt manifest
and provider-neutral spawn request atomically. Only the selected adapter may return the receipt through the internal
dispatch path; no public coordinator operation accepts a receipt payload. The persisted dispatch key and adapter identity
make retries idempotent, including a retry after an adapter failure. Schema parsing alone does not issue an assignment.

Worker results are accepted only after a persisted, validated spawn receipt and when assignment, work item, attempt,
role, role-contract digest, and current input hash match the issued authority. Output artifact kinds must be permitted
by both the semantic role and the exact assignment. Replacement attempts retain durable predecessor ancestry; the
service derives successor artifact projection and input hash server-side rather than accepting caller transcript or
provider data. A structured `REFUSED` receipt is terminal evidence: it records a `REFUSED` attempt, blocks the work
item, and creates an actionable refusal-code blocker; it is never represented as in progress. Authorization cancellation
immediately invalidates active attempts; revocation is terminal and rejects late receipt/result/completion ingress.
Read-authorized `GET` Factory evidence exposes hashes, terminal state, and bounded operational dispatch metadata
(adapter ID, dispatch key, and reservation/start timestamps), never lease secrets, prompts, transcripts, credentials,
or raw worker output.

## Closure and traceability invariants

- Every artifact reference binds a stable artifact ID, exact revision where applicable, kind, and content hash.
- Every worker result binds the assignment, work item, attempt, role-contract digest, and input hash.
- Only approved scenario revisions may be materialized and executed.
- Run and report artifacts retain exact scenario, runtime capsule, target, environment, evidence, and cycle lineage.
- Target defects, validation-design defects, runtime defects, infrastructure boundaries, and inconclusive results
  remain distinct. Only attributed target defects may violate an obligation.
- Ordinary closure rejects unresolved items. Risk-accepted closure binds the exact report, actor, rationale, accepted
  unresolved items, and timestamp.
- Closed journeys are immutable. Follow-up work uses a linked new journey or an explicitly permitted new cycle.

The golden corpus covers the happy path, analysis revision, reconnect/reclaim, stale command, partial scenario
approval, worker replacement, unsupported provider boundary, remediation/rerun, target defect,
validation-design defect, and risk-accepted closure.
