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
- `agent-factory.ts` starts the Phase 2 provider-neutral Factory boundary. It creates least-privilege spawn requests,
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
  artifact links, blockers, work items, attempts, lease authority, and exact result envelopes. Compare-and-swap state
  mutation, command/event creation, work claims, completion, expiry, and replacement are transactional.
- Prisma migration `20260828140000_add_quality_journey_phase_1` establishes the durable aggregate and database-enforced
  append-only lifecycle history. Prepared scaffold databases contain the schema but no journey, event, or lease state.

## Lifecycle

The normal stage path is:

`INTAKE -> ANALYSIS -> ANALYSIS_REVIEW -> DISCOVERY -> SCENARIO_DESIGN -> SCENARIO_REVIEW -> AUTOMATION -> EXECUTION -> TRIAGE -> REPORT_REVIEW -> CLOSED`

Analysis, scenario, and report decisions bind exact immutable revisions. A changed upstream revision invalidates only
the approvals and downstream artifacts whose reviewed scope changed. Material execution still requires the existing
conditional execution-consent and credential-authorization gates.

Role work items use one durable attempt loop. Terminal states are `COMPLETED`, `CANCELLED`, and `SUPERSEDED`. Lease
expiry leads to a replacement attempt on the same work item; the replacement receives the current assignment-scoped
artifact projection and structured attempt diagnostics, not a transcript replay.

## Commands and conflicts

Mutations carry the exact `journeyId`, `targetProjectId`, `expectedStateHash`, and `idempotencyKey`. Appraise validates
authorization, artifact revision, lifecycle preconditions, and the expected hash atomically. A committed command
returns its successor stage and state hash. A stale command returns `STALE_STATE_HASH` with the current safe stage,
hash, and next commands and commits no lifecycle event. Reusing an idempotency key with changed canonical input is an
`IDEMPOTENCY_KEY_REUSED` conflict; an exact replay returns the original result.

Phase 1 exposes these contracts through `quality_journey_create`, `quality_journey_get`, `quality_journey_resume`,
`quality_journey_command_submit`, `quality_journey_work_claim`, `quality_journey_work_complete`, and
`quality_journey_artifacts_list`. The earlier proposed `evaluation_session_*` names are superseded before public
implementation; no compatibility aliases exist yet.

An identical command replay returns its original committed result and creates no second event. Reusing an idempotency
key with changed input conflicts. Competing commands from one predecessor hash can produce only one compare-and-swap
successor. `quality_journey_resume` reconstructs every semantic role node from durable stage/work-item/blocker state,
expires elapsed leases, and makes the same work item replacement-claimable without replaying a worker transcript.

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
as enforced, verified, unverified, or unsupported. A missing, unsupported, or unverifiable required boundary blocks
worker acceptance. Requested and effective context, filesystem, network, target, credential, and lifecycle-command
values are structured and effective values cannot exceed the assignment; effective tools must remain within the
assignment and profile.

Assignment issuance must use the registry-aware validator with the resolved Role Definition and capability profile.
The Phase 2 Factory additionally enforces exact registry version and digest binding. Registry-backed route, resource,
path, origin, and credential authorization and durable assignment/spawn-receipt persistence remain for the next Phase 2
slice. Schema parsing alone does not issue an assignment.

Worker results are accepted only when assignment, work item, attempt, role, role-contract digest, and current input hash
match the issued authority. Output artifact kinds must be permitted by both the semantic role and the exact assignment.
Replacement assignment construction parses the prior strict manifest and accepts a caller-supplied successor state,
artifact projection, and lease while rejecting hidden transcript fields. Durable Factory integration must establish
that those successor inputs came from current Appraise state before issuing the replacement to a provider.

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
