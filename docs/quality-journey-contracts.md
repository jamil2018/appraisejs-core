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
- `quality-journey-analysis-service.ts` owns the coordinator-service control plane for assignment-bound Analyzer
  submission, immutable Q&A, publication, revision requests, and exact approval. Six typed coordinator/MCP operations
  expose that boundary, while the project-scoped Quality Journeys screens expose only user-authorized controls.
- `discovery-contracts.ts` defines strict provenance-bound Target Observation and Resource Resolution Bundles,
  canonical ordering, requirement coverage, ranked classifications, confidence/stability, and revalidation policy.
- `quality-journey-discovery-service.ts` freezes Phase 4 registry authority, issues the two least-privilege assignments,
  accepts only their specialized output envelopes, completes the join, and owns revalidation and retry lineage.
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
- Prisma migration `20260903120000_add_quality_journey_discovery_control_plane` adds the active discovery pointer,
  immutable discovery revisions, fixed Scout and Resource Explorer work-item links, frozen scope and input hashes,
  independent outputs, completion/invalidation state, and single-successor retry lineage.

## Lifecycle

The normal stage path is:

`INTAKE -> ANALYSIS -> ANALYSIS_REVIEW -> DISCOVERY -> SCENARIO_DESIGN -> SCENARIO_REVIEW -> AUTOMATION -> EXECUTION -> TRIAGE -> REPORT_REVIEW -> CLOSED`

Analysis, scenario, and report decisions bind exact immutable revisions. A changed upstream revision invalidates only
the approvals and downstream artifacts whose reviewed scope changed. Material execution still requires the existing
conditional execution-consent and credential-authorization gates.

## Phase 3 analysis control plane

A Requirement Analyzer submits an Analysis Charter only
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
Phase 4 uses registry version 3 for the Scout and Resource Explorer approval input and Resource Explorer network
isolation. Versions 1 and 2 retain their original role and capability-profile digests for persisted authorizations.
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
attempting to create another row.

The public Phase 3 surface adds `quality_journey_analysis_get`, `quality_journey_analysis_submit`,
`quality_journey_analysis_answer`, `quality_journey_analysis_publish`,
`quality_journey_analysis_revision_request`, and `quality_journey_analysis_decide`. Its route path owns the journey
identity and resolves the target reference server-side; strict request bodies reject caller `journeyId`,
`targetProjectId`, `actor`, and `command` fields. The coordinator constructs `USER` and `RUNNER` command semantics
itself. A revision request must bind the active, published charter, exact content hash, and current Q&A review hash;
the publication's historical review hash is retained for stale-decision detection, so a later answer correction can
still enter the immutable successor loop.

## Phase 4 discovery control plane

Exact analysis approval creates one active discovery revision in the approval transaction. Appraise derives its
authority from the journey target: existing environments, target-owned locator groups and locators, visible ready Step
Definitions, and the canonical operation registry. The compiler fails closed without an environment, a route-bearing
locator group, or any finite resource inventory. It never derives scope from requirement prose and never grants a
wildcard. The revision stores registry hashes, role-specific scope and input hashes, the approved requirement-set hash,
and exact analysis revision and decision identities.

Journeys already persisted at `DISCOVERY` before Phase 4 are upgraded during their first work claim. This runtime
migration recompiles real target and catalog authority; the SQL migration deliberately does not invent frozen hashes
or broad placeholder scope.

## Phase 5 scenario review control plane

Phase 5 persists immutable Scenario Portfolio and Scenario Revision records after an exact completed discovery
revision. Each portfolio records its coverage rationale plus explicit dependency, branch, and shared-setup graph
semantics; React Flow renders only those declared edges. Each scenario separates behavioral intent from feasibility
enrichment and layout, with independent hashes. Scout observation IDs and Resource Explorer resource assumptions are checked against the frozen discovery
bundle; no Designer submission can invent those facts.

`quality_journey_scenarios_start`, `quality_journey_scenarios_submit`, `quality_journey_scenarios_publish`,
`quality_journey_scenarios_comment`, `quality_journey_scenarios_comment_dispose`, `quality_journey_scenarios_decide`, and
`quality_journey_scenarios_revision_request` are specialized operations. The generic command path rejects their
lifecycle commands. Review comments are append-only and may be scoped to an exact scenario revision; public HTTP and
MCP boundaries derive the `USER` actor rather than trusting a caller-provided identity. Scenario
decisions are append-only/idempotent, with rejected decisions requiring feedback. A review remains in
`SCENARIO_REVIEW` until every scenario is classified; only then can the approved subset advance when it covers every
mandatory approved requirement. The final portfolio stores the approved-intent, coverage, and decision-set hashes.

A Designer submission also binds the claimed Assignment Manifest's input and authorization-scope hashes and carries a
completed `WorkerResultEnvelope` whose output references exactly the submitted portfolio and scenario revisions.
Factory authorization, spawn receipt, role digest, lease, and input hash are revalidated by the common completion
path before any scenario record is committed. A requested revision makes the predecessor immutable, persists durable
feedback, and reissues the Designer from canonical predecessor artifacts only. Decisions carry forward only where a
successor keeps the same stable scenario ID and behavioral-intent hash; enrichment or graph-layout changes cannot
manufacture or invalidate that human decision. Open blocking comments prevent approval until explicitly disposed, and
every comment mutation advances the exact review hash.

The Scout work item may observe only its frozen environment IDs and routes through read-only target access. Its
Assignment Manifest preserves each environment ID-to-origin binding instead of exposing independently sorted lists. Its Target
Observation Bundle binds a snapshot, evidence receipts, environment and route, confidence and rationale, stability and
rationale, and explicit revalidation triggers. The Resource Explorer work item receives only finite stable resource
and operation IDs and has no target or network access. Its Resource Resolution Bundle covers every approved
requirement and classifies ranked candidates as reusable, incompatible, stale, or cross-target, or records an explicit
missing capability. Service validation checks resource ID, kind, and frozen owning target against the inventory, so an
imported cross-target resource cannot be relabelled as local or attributed to another project.

Each submission binds the exact work item, in-progress attempt, authorization, lease owner, input hash, assignment
scope hash, and immutable upstream artifact set. Output is compare-and-swap immutable with exact idempotent replay.
Parallel submissions write separate columns and converge on one completion hash and one `DISCOVERY_COMPLETED` event;
completion deliberately remains in `DISCOVERY` until Phase 5 defines scenario-design authority. Generic Factory result
completion rejects Scout and Resource Explorer output, and generic lifecycle commands reject `RETRY_DISCOVERY`.

Revalidation recompiles current authority and invalidates the active revision on analysis or registry drift. A retry
is allowed only for an active terminal or invalidated revision, has one idempotent successor, supersedes the predecessor,
revokes and cancels its remaining claim authority, and issues two fresh work items. It copies neither output bundle nor
worker transcript and retains the exact approved analysis unless a future explicit analysis revision is separately
authorized.

## Phase 6 approved-scenario materialization

The Automator receives one specialized assignment compiled from the exact approved Scenario Portfolio, each approved
Scenario Revision and decision, and the canonical operation catalog hash. `quality_journey_automation_materialize`
requires its current work item, attempt, lease owner, Factory receipt, input hash, and scope hash. It refuses
partial, rejected, superseded, cross-target, or hash-drifted inputs. Generic completion rejects `AUTOMATOR` so a
worker cannot publish a generic result in place of the materialization record.

For every accepted scenario, Appraise persistently records the decision, target-owned suite/case/step identities,
the selected ready Step Definition and canonical operation for every source scenario step, `MATERIALIZES` links, and
a typed immutable prepared-capsule manifest. Replays use the exact `(journey, scenario revision, input hash)` key and
reuse the durable result. Phase 6 never writes `TestRun` or `RuntimeCapsule`, nor does it alter
`RuntimeCapsule.testRunId`; managed execution remains exclusively behind the Phase 7 `START_EXECUTION` gate. Missing
module or compatible ready Step Definition authority is a classified materialization conflict and cannot advance the
journey beyond `AUTOMATION`.

The shared completed-worker envelope permits at most 1,536 outputs: the complete, non-aggregated Phase 6 result for
up to 512 approved scenarios (one suite, case, and prepared capsule per scenario). The MCP ingress applies the same
bound, so a complete 86- or 512-scenario result is neither truncated nor accepted through a broader adapter path.

Resource Explorer freezes canonical hashes for the full compatible operation descriptors, including inputs, effects,
and handler fields. An Automator proposal may select only an operation `(id, version)` that the completed Resource
Resolution Bundle marked compatible; catalog descriptor drift changes the assignment hash and is rejected before any
materialization write.

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

The original journey kernel surface is exposed through `quality_journey_create`, `quality_journey_get`, `quality_journey_resume`,
`quality_journey_command_submit`, `quality_journey_work_claim`, `quality_journey_work_dispatch`,
`quality_journey_work_complete`, `quality_journey_work_cancel`,
`quality_journey_work_revoke`, `quality_journey_factory_evidence_inspect`, and `quality_journey_artifacts_list`.
Generic `quality_journey_work_complete` is not a semantic-output bypass: Scout and Resource Explorer work must use the
Discovery Bundle boundary, Test Scenario Designer work must use the Scenario Portfolio boundary, and Automator work
must use the approved-scenario materialization boundary.
`quality_journey_command_submit` remains available for the original kernel commands, but the public coordinator and
MCP boundary reject `PUBLISH_ANALYSIS`, `REQUEST_ANALYSIS_REVISION`, and `DECIDE_ANALYSIS`: each must use its typed
Phase 3 operation so publication, revision, and approval retain their specialized authority and exact-review gates.
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

Analysis answers are append-only linear chains per exact question. The first answer is the only permitted root; every
correction must name the sole current head, and a database uniqueness constraint prevents competing correction
successors. A successor charter may resolve a predecessor question only by naming that current head, never a corrected
historical answer. Once a user requests a revision, predecessor answers freeze until the receipt-validated Analyzer
submits the successor; that preserves the immutable artifact set authorized for the fresh worker. The new unpublished
successor accepts its own questions and answers after submission.

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

## Phase 7 managed execution and reruns

Execution consumes exact approved Phase 6 materializations and immutable prepared capsule/binding content. A durable
execution reservation binds the Journey, cycle, scenario, prepared capsule, target, environment snapshot, browser
and TestRun before launch. The managed capsule compiler verifies exact resource hashes and seals execution bytes;
mutable catalog content cannot silently replace approved input. Hash drift blocks execution.

Journey-specific consent binds the exact execution scope. The known harmless operation subset can execute without
a routine human gate; credential-consuming operations, mutations and unclassified effects require a recorded UI grant.
Configured but unused credentials do not add a gate. The consent scope identifies each risky operation and its reason. Consent and rerun
approval are separate decisions. A rerun proposal records selected scenario revisions, predecessor receipts and a
reason, then user approval permits one immutable successor cycle. It does not assert that a defect has been fixed.

Runtime ownership uses the existing capsule attempt state machine. Replaying a start cannot grant a second worker
execution authority. Missing process ownership remains visible and blocks duplicate launch. Terminal evidence
receipts bind runtime output bytes and capsule lineage; cancellation or missing artifacts cannot masquerade as a
successful validated run. Reports and semantic attribution remain Phase 8 work.

SQLite guards preserve execution-cycle snapshots, TestRun binding identity, consent scope, rerun proposal scope and
sealed receipts. Status transitions remain mutable; historical execution inputs and evidence are append-only.

## Phase 8 triage and report review

Triage starts only for the active terminal execution cycle after every linked TestRun has a sealed Evidence Receipt.
Appraise compiles a narrow, content-addressed Triager input from the accepted Analysis Charter, exact approved Scenario
revisions, frozen execution-capsule bindings, and sealed evidence. It excludes Automator or producer narratives,
credentials, mutable run summaries, and broad artifact-library access. A report submission binds its `inputHash` to
that frozen source; its content hash is exactly `hash({ report, source: assignment.input })`.

A Triager can dereference only a report or log named by an exact sealed Evidence Receipt, not an artifact path. The
read service resolves the Journey target and requires the active specialized Triager assignment, live Factory-backed
lease, and unrevoked authorization to name a receipt in its frozen input. It validates receipt and capsule identity,
then checks artifact bytes and size against the receipt descriptor through the managed artifact access service and
rechecks that authority after I/O. It exposes text pages up to 64 KiB from artifacts no larger than 2 MiB; traces and
other binary evidence remain outside this surface.

The Triager may submit only an immutable Test Report Analysis revision through its leased assignment. Findings retain
their TestRun, receipt, scenario, requirement, attribution kind, confidence, competing hypotheses, unresolved state,
and postmortem. `TARGET_DEFECT` is the only attribution that may name `FAILED`; every other attribution remains a
non-target outcome. Coverage, residual risks, and recommendations are complete report content, never mutable review
fields.

`REPORT_REVIEW` is local Appraise UI authority over one exact active report hash and Journey state hash. A revision
request records full-report feedback and creates a fresh Triager input with only the predecessor report and that
feedback added. An automation-correction approval requires the exact report's bounded remediation proposal and the
same hash-bound review envelope. Its successor cycle scope binds the report revision and hash, source execution cycle,
finding IDs, scenario revision IDs, and correction scope without rewriting execution evidence.

A rerun proposed while the Journey is in `REPORT_REVIEW` derives the active report revision and content hash on the
server and persists both with the rerun proposal. Rerun approval and start re-read that exact active report binding and
the proposal's source execution cycle; a changed, reviewed, replaced, or cross-cycle report makes the proposal stale.
MCP can read triage context, prepare a Triager assignment, and submit a report. It cannot request a report revision
or approve remediation.
