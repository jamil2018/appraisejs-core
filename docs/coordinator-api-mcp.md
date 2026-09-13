# Coordinator API and MCP

The coordinator exposes Quality Journey lifecycle operations plus general project, environment, runtime, locator,
Step Definition, and project-bound repository collaboration operations. Quality Journey remains the only
Appraise-owned agent quality workflow; repository collaboration has no Journey authority.

Repository collaboration tools use the `collaboration_*` family. Every request names a target that the coordinator
resolves to its own binding; callers never supply a binding ID, repository command, remote/ref override, trusted
principal, or reviewer provenance. Public `collaboration_prepare` accepts only `RECEIVE` and `PUBLISH`. RECEIVE
fetches its operation-owned ref, pins both revisions, and classifies the relationship. Only an Appraise-content-only
divergence creates an internal RECONCILE operation; its isolated proposal worktree is persisted before it can be
claimed. `collaboration_work_complete` accepts one complete record set only. It produces review material, clears the
lease, and never makes it executable. `collaboration_handoff_redeem` consumes a one-time ticket atomically to return
a short-lived synthetic worker session, fenced work-completion credentials, and the existing sanitized assignment;
it never returns ticket scope, repository path/ref, or reviewer capability. `collaboration_execute` performs only
the exact prepared database operation or one fixed persisted Git step after acceptance. Worker tools expose observed
registration, fenced leases, a sanitized operation-owned assignment, and one-time handoff redemption; they do not
claim wake capability or create a reviewer decision. `collaboration_undo_prepare` is guarded by the stored
database before-image and an exact current-state check.

`collaboration_policy_update` and `collaboration_decide` are receipt-protected MCP mutations. Their strict input
schemas require a local UI-issued one-action `authorityReceipt`; the MCP adapter removes it from the request object
and sends it only as `X-Appraise-Authority-Receipt`. Treat that field as a secret tool argument: do not place it in
prompts, notes, shell arguments, environment, or coordinator configuration. The direct CLI remains available with
`--authority-receipt-file` (the file contains only the receipt).

For divergent reconciliation, the receipt-protected direct `collaboration_decide` request names the exact canonical
`reviewDigest` and either ACCEPTs or REJECTs it. ACCEPT persists one designated proposal artifact and its digest;
derived merge/database execution reads that artifact only, never the latest proposal. REJECT cleans the exact
operation-owned proposal worktree or blocks and retains it for recovery. Final cleanup must prove that both the
original proposal and merge worktrees are absent.

After a receipt-protected decision reaches `READY`, Appraise advances the bounded persisted plan without requiring a
caller to name or repeat individual Git/database steps. If the process crashes between the durable decision and that
continuation, the process-local scheduler discovers eligible `READY` operations on its next startup/tick and resumes
only their current permission-checked steps. A running or ambiguous boundary remains on the conservative recovery
path; scheduler discovery never guesses past it.

Execution requests remain version-fenced. Retrying a lost `collaboration_execute` response can return a persisted
result only for the request version that produced the current operation version; it cannot invoke the next step or
repeat an external effect. Applying Git work with no persisted request intent/fence is a conservative recovery block,
not a best-effort replay. Remote-ref transport failures are reported as unavailable rather than as an absent branch.
Coordinator error envelopes report `not_started`/`not_committed` for schema, authentication, permission, and other
failures before an effect boundary. They report `unknown` with `collaboration_get`/`read_state_then_retry` only when
the request has explicitly crossed a durable or external effect boundary. In particular, a RECEIVE failure after its
operation-owned fetch ref is durable carries that generated operation ID so the caller can read the exact state;
endpoint names alone never imply an unknown outcome.

A coordinator project-fingerprint mismatch is rejected by the transport guard before endpoint dispatch. It returns a
409 `CONFLICT` / `state_conflict` envelope with `operationOutcome=not_started`,
`targetOutcome=not_committed`, and `details.boundary=project_identity`; the request cannot consume a Journey handoff
ticket or start another durable effect.

Journey operations are grouped under `quality/journeys/**` in the coordinator API and `quality_journey_*` in MCP.
Every mutation is scoped to an exact target and Journey and remains subject to the Journey's durable review,
authorization, evidence, and closure invariants.

Codex plugin compatibility is a host setup plane, not a coordinator lifecycle operation. Package command
`appraisejs agent compatibility` observes local marketplace/plugin/MCP registration state, while authenticated
`project_diagnostic` remains authoritative for hub identity, authentication, selected-target binding, current-task
tool/resource sentinels, and MCP surface version/contract hash. Neither result admits a role or advances a Journey.

The retained `EXTERNAL_V1` admission slice is a separate, opt-in contract for an already-running eligible role:
Requirement Analyzer, Scout, Resource Explorer, Test Scenario Designer, Automator, or Triager.
`quality_journey_external_work_claim_v1` and `quality_journey_external_work_admit_v1` are the role-neutral native
MCP operations; the Analyzer names remain compatibility adapters. Claim persists an exact request and receipt binding
the route-derived project-credential principal, role, Journey, target, authorization/input hash, assignment,
generation, lease, secret verifier, and idempotency key. Admission atomically moves only that binding to `IN_PROGRESS`
and records `hostIsolation: NOT_ATTESTED`; neither operation identifies a person, Codex task, or isolated host.

Each role uses a dedicated external specialized ingress with the same canonical payload schema as its managed sibling:
Analysis Charter, Target Observation Bundle, Resource Resolution Bundle, Scenario Portfolio, approved-scenario
materialization, or Triager report. The specialized service validates its full payload and rechecks coordinator
generation, graph state, authorization, ownership, target/Journey, immutable input, and lease inside its write
transaction. It atomically commits the canonical artifact/transition with a durable external-submission acceptance
receipt. The receipt is replayable only to its authenticated principal and exact assignment/operation/payload identity;
conflicting reuse is rejected. `quality_journey_external_work_outcome_get_v1` is the read-only lost-ack reconciliation
operation and accepts the same binding plus role, operation, and idempotency key. Managed
`quality_journey_work_claim` and Factory receipt semantics remain unchanged.

Discovery browser sessions are local-UI operations rather than MCP capabilities. They are ephemeral human surfaces,
not worker authority or reusable credentials. The existing `quality_journey_target_observation_submit` and
`quality_journey_external_scout_target_observation_submit_v1` operations remain the only Scout submission paths.
Each submitted evidence descriptor must resolve transactionally to an immutable Appraise-issued discovery-browser
receipt for the exact Journey/target/cycle/revision/work-item/snapshot/route/environment and an Appraise-derived fact.
Unknown descriptors, host-browser artifacts, missing-access receipts and hash or scope mismatches fail before the
discovery bundle is persisted. Connection, assignment claim, browser availability, human access confirmation,
receipt issuance, submission acceptance and lifecycle advancement remain separate facts.

The Requirement Analyzer resolves the exact `JOURNEY_REVISION` supplied in its assignment as library entry
`REQUIREMENT_REVISION:<assignment.artifactId>` with `quality_journey_library_list` and
`quality_journey_artifact_get`. Its `artifactId` and `sourceContentHash` must equal the assignment artifact ID and
content hash; its display-ordinal `revisionId` is not the assignment database revision ID. After specialized
submission, `quality_journey_analysis_get` is the authoritative read for immutable revisions, questions, answers,
publication, and decision lineage. A recorded charter is not yet published or approved. Required questions stop the
external workflow until Appraise records human answers; revision feedback produces fresh Analyzer work, and a later
task must reread current Journey, Analysis, and event state before claim or continuation. The resume operation repairs
Appraise work state only and makes no liveness claim about an external Codex task.

Creation accepts the shared `QualityJourneyRequirement/v1` payload. Objective-only requests remain valid; structured
fields are canonicalized before hashing and persistence. Coordinator connections use
`GET quality/journeys/:journeyId/handoff?target=...` for safe inspection and
`POST quality/journeys/:journeyId/handoff/redeem` for one-time redemption. MCP exposes these as
`quality_journey_handoff_inspect` and `quality_journey_handoff_redeem`. Preparation and launch remain UI-only server
actions because the server validates the deep link and selects either the registered local workspace or a per-handoff
neutral host workspace for a qualified remote target. A redemption may optionally record the current Codex task ID,
but that identifier is observational recovery metadata, not a principal or authority. For mutable later stages,
Appraise persists an exact Journey/revision/target/work-attempt/dispatch/terminal-effect/pending-event snapshot and
rejects stale launch or redemption without consuming the ticket. There is deliberately no MCP takeover mutation: only
the local Journey UI can submit a short-lived request-identity-bound approval. It re-reads the snapshot, blocks
ambiguous dispatches and expired leases with a read-only recovery projection, atomically fences predecessor attempts,
reissues valid bounded authorization for the same logical work item in `REPLACEMENT_REQUESTED`, then fences
predecessor connected sessions before the successor is effective. After takeover, every coordinator-facing Journey
mutation (generic, work, and specialized) accepts only the effective coordinator handoff ID and monotonic generation,
and specialized services recheck that binding within their write transaction; old task sessions fail closed without
mutation. Replacement authorization preserves only remaining immutable attempt budget across its supersession lineage.
Journey-scoped `locator_ensure` is subject to the same route admission and transaction-local check; generic locator
operations without a Journey remain outside the coordinator-session protocol. Execution and triage MCP mutation
schemas (and triage sealed-evidence reads) carry that binding through to the coordinator rather than treating a stale
coordinator as a current worker.
Exact committed approval replay remains readable after supersession but
reports `current: false`. This coordinator-session handoff neither claims work nor grants C2 role execution authority. Stock Codex
currently reports known-task reopen as unsupported and Appraise prepares a fresh,
scoped recovery handoff instead.

`locator_search`, `locator_graph_query`, and `locator_ensure` accept `journeyId`. The coordinator verifies that
the Journey belongs to the requested target before reading or writing locator resources. `step_search` remains
generally available and may record optional Journey-bound search evidence.

Independent Test Runs use authored snapshots only. They are non-authoritative diagnostics and cannot be promoted into
Journey evidence.

The former requirement-analysis, validation-design, Quality Plan, Assessment, remote evaluation scope, legacy
execution-consent, methodology, certification, and compatibility operation families have been removed. Their API
paths, MCP tools, resources, schemas, exports, and projectors return ordinary not-found behavior and have no aliases.
The generated operation fixture and [operation reference](generated/coordinator-operation-reference.md) are the
machine-checked public inventory.
