# Quality Journey Role-Based Workflow Plan

## Purpose

Build a user-facing **Quality Journey** that takes a requirement from analysis through approved test design,
execution, triage, reporting, and closure. Appraise owns the durable lifecycle, artifacts, approvals, evidence, and
state transitions. Specialized agents perform bounded work through replaceable assignments; no agent connection or
conversation owns journey state.

This roadmap evolves the existing Quality Operating System and coordinator capabilities into a coherent product
experience. It preserves existing Appraise approval and validation gates while removing brittle agent-to-agent and
stage-to-stage handoffs.

## Target User Flow

1. The user submits a requirement.
2. A Requirement Analyzer prepares an Analysis Charter in Appraise.
3. The user reviews the charter, answers its questions, and requests revisions until both sides are satisfied.
4. After analysis approval, a Scout observes relevant target facts while a Resource Explorer searches reusable
   Appraise-owned assets.
5. A Test Scenario Designer uses the approved analysis and those fact bundles to propose a scenario portfolio through
   the existing React Flow-based test-case experience.
6. The user approves or rejects scenarios individually or as a portfolio, with structured feedback.
7. An Automator materializes approved scenarios into executable suites, cases, steps, and runtime inputs without
   changing their behavioral intent.
8. The managed execution runtime runs the approved scenarios. The user can inspect the live and completed run in
   Appraise.
9. An independent Triager attributes failures and publishes a Test Report Analysis with evidence and a postmortem.
10. The user reviews the report and either starts a remediation/rerun cycle or closes the Quality Journey.
11. Closure with known failures or limitations requires explicit, recorded risk acceptance.

Every journey artifact remains individually addressable after the active session: analysis revisions, questions and
answers, scenario portfolios, suites, cases, runs, evidence, triage decisions, reports, approvals, and closure.

## Product Principles

- **Appraise owns authority.** Agents propose commands and artifacts; Appraise validates preconditions and commits
  transitions.
- **Artifacts are durable and revisioned.** Conversation context is never the only copy of user intent or evidence.
- **Graphs are views, not storage authorities.** React Flow projects canonical requirements and scenarios into an
  understandable review surface.
- **Workers are replaceable.** A disconnected or newly connected agent resumes from an Appraise-issued work item and
  current session projection, not a replayed transcript.
- **Roles are capability contracts.** Each role has explicit permitted inputs, tools, outputs, mutations, and negative
  authority; a role name alone grants nothing.
- **Provider requests are model-neutral.** The Agent Factory requests a capability profile and records the provider's
  effective worker properties without binding the journey to provider-specific model names.
- **The Runner is deterministic.** Routine graph advancement, retries, leases, gate pauses, and recovery do not depend
  on a general reasoning agent.
- **Approval applies to exact revisions.** Later changes invalidate only the approvals whose reviewed scope changed.
- **Commands are idempotent and concurrency-safe.** Retries cannot duplicate artifacts or advance a stage twice.
- **Execution is reproducible.** Runs retain exact approved scenario, runtime capsule, environment, and evidence
  lineage.
- **Failures are attributed explicitly.** Target defects, validation-design defects, infrastructure boundaries, and
  inconclusive results remain distinguishable.

## Control Architecture

The Quality Journey has four cooperating control layers:

1. **Appraise lifecycle authority** stores the canonical graph, artifacts, hashes, approvals, evidence, permissions,
   and transitions.
2. **Quality Journey Coordinator** communicates with the user, explains state, resolves exceptional routing, and
   escalates decisions without becoming lifecycle authority.
3. **Journey Runner** deterministically finds eligible graph nodes, requests workers, tracks leases and attempts,
   validates result envelopes, retries safely, pauses at gates, and submits permitted commands to Appraise.
4. **Agent Factory** translates Appraise-issued assignments and provider-neutral capability profiles into bounded
   provider workers and records what the host actually enforced.

The Factory creates workers; Appraise creates authority. The Runner invokes the Factory for an eligible work item but
cannot broaden that item's scope. The provider selects an available model that satisfies the requested capability
profile; model identity is runtime evidence, not part of the durable journey contract.

The six canonical semantic worker roles are Requirement Analyzer, Scout, Resource Explorer, Test Scenario Designer,
Automator, and Triager. Coordinator, Runner, Factory, managed execution runtime, and optional independent review are
control or assurance components rather than additional semantic roles.

## Roles and Negative Authority

### Quality Journey Coordinator

The coordinator is a product-facing facade, not a source of lifecycle authority. It observes Appraise state, assigns
bounded work through the Runner, explains progress, and proposes the next permitted command. It cannot manufacture
approval from conversation, silently expand a work item, or commit lifecycle state outside Appraise.

### Requirement Analyzer

Turns the user's request into a revisioned Analysis Charter containing objectives, scope, actors, obligations,
constraints, assumptions, risks, acceptance signals, exclusions, and unresolved questions. It cannot approve its own
analysis, explore the target, design automation, or infer that unanswered required questions are resolved.

### Scout

Observes bounded target facts needed for scenario design or automation, such as page structure, visible content,
behavior, navigation, accessibility semantics, and locator candidates. Every observation records target snapshot,
page/environment identity, evidence, confidence, stability, and revalidation policy. A Scout cannot create reusable
Appraise resources, change scenario intent, approve artifacts, or attribute test failures.

### Resource Explorer

Searches Appraise-owned operations, Step Definitions, locators, templates, data, examples, and prior scenarios. It
returns ranked stable resource IDs, compatibility explanations, rejected candidates, and explicit missing-capability
declarations. It cannot browse or modify the target, mutate catalog resources, or decide behavioral coverage.

### Test Scenario Designer

Creates the scenario portfolio, coverage rationale, dependency/order relationships, data needs, expected outcomes,
and traceability to approved requirements. Scenario planning separates behavioral intent from implementation
feasibility: target facts and resource candidates may enrich realization without silently changing approved intent.
The designer cannot invent target facts, create automation, or approve its own portfolio.

### Automator

Materializes approved scenario revisions into Appraise-owned suites, cases, canonical operation invocations, data,
locators, and runtime capsules. It must reuse compatible Resource Explorer results before declaring missing
capability. It cannot change approved scenario intent, approve its implementation, or attribute final failures.

### Triager

Independently analyzes approved scenarios, sealed runtime results, evidence, and known infrastructure boundaries. It
attributes outcomes, records confidence and competing hypotheses, recommends remediation or rerun scope, and drafts
the Test Report Analysis. It cannot modify automation while attributing the same run or rewrite historical results.

### Journey Runner

Drives the dependency graph under the Coordinator. It schedules only Appraise-eligible work, requests bounded workers
from the Factory, maintains leases and heartbeats, records attempts and replacements, validates typed results, and
pauses for human decisions. It cannot perform semantic role work, reinterpret outputs, bypass gates, or manufacture
approval.

### Optional Independent Reviewer

Evaluates consequential or weakly verified artifacts at deliberately stabilized boundaries. It is not invoked after
every edit and is not a seventh routine journey worker. Its decision is bound to the exact reviewed revision and
evidence set, and it receives no producer narrative beyond the minimum accepted artifacts and evidence.

## Agent Factory Contracts

The Agent Factory operates through four versioned contracts:

1. **Role Definition** declares purpose, provider-neutral capability profile, permitted tools and commands, forbidden
   capabilities, readable and writable artifact kinds, output schemas, and behavioral invariants.
2. **Assignment Manifest** binds one work item to exact journey, target, input revisions, allowed resources and routes,
   writable outputs, state hash, lease, idempotency key, and completion criteria.
3. **Spawn Specification and Receipt** records the requested profile and the provider's effective model, reasoning
   level, tools, filesystem/network scope, context boundary, and any requested property that remains unverified or
   unsupported.
4. **Worker Result Envelope** binds outputs, evidence receipts, blockers, assumptions, unresolved questions, attempt,
   input hash, and role-contract digest to the originating work item.

Capability profiles express properties such as `fast-observation`, `structured-analysis`, `high-judgment-design`,
`mechanical-implementation`, or `independent-attribution`. They may require minimum judgment, latency, context
isolation, and tool capabilities, but never name a provider model. High-risk work stops when a required runtime
boundary cannot be verified.

Workers receive no inherited conversation by default. Credentials, target access, filesystem writes, network scope,
and lifecycle commands follow least privilege. A replacement worker receives current Appraise artifacts and structured
attempt diagnostics, not an uncontrolled transcript replay.

## Role Work-Item Lifecycle

Each role uses the same durable structural loop:

`ELIGIBLE -> WORK_ITEM_ISSUED -> WORKER_REQUESTED -> WORKER_STARTED -> IN_PROGRESS -> OUTPUT_SUBMITTED -> OUTPUT_VALIDATED -> COMPLETED`

Alternative transitions cover `QUESTION_RAISED`, `WAITING_FOR_INPUT`, `BLOCKED`, `ESCALATED`, `LEASE_EXPIRED`,
`REPLACEMENT_REQUESTED`, `REVISION_REQUIRED`, `CANCELLED`, and `SUPERSEDED`. Multiple worker attempts remain local to
one role work item unless a published authoritative artifact changes. Changing an approved upstream artifact creates a
new revision and invalidates only its affected downstream graph.

## Durable Domain Model

Introduce or consolidate the following Appraise-owned concepts:

- `QualityJourney`: target, ownership, current stage, status, active cycle, closure state, and timestamps.
- `QualityJourneyRevision`: immutable journey-scope and requirement snapshots.
- `AnalysisCharterRevision`: immutable analysis content and traceability.
- `AnalysisQuestion` and `AnalysisAnswer`: structured Q&A with resolution state and revision lineage.
- `ScenarioPortfolioRevision`: immutable proposed scenario graph and coverage rationale.
- `ScenarioRevision`: individually reviewable scenario intent and requirement traceability.
- `JourneyApproval`: actor, decision, exact artifact revision, scope, feedback, and timestamp.
- `JourneyCommand`: idempotency key, expected state hash, preconditions, result, and successor projection.
- `RoleDefinition`: versioned capability, tool, data, output, and negative-authority contract.
- `ProviderCapabilityProfile`: model-neutral judgment, latency, context-isolation, and tool requirements.
- `JourneyWorkItem`: role contract, inputs, scope, allowed outputs, status, completion criteria, and current attempt.
- `WorkAttempt`: lease, heartbeat, provider request, replacement lineage, and terminal attempt outcome.
- `WorkerSpawnReceipt`: effective provider worker properties and explicit unverified or unsupported boundaries.
- `WorkerResultEnvelope`: typed outputs, evidence, assumptions, blockers, and originating contract/state hashes.
- `TargetObservationBundle`: Scout facts with provenance, confidence, stability, and revalidation requirements.
- `ResourceResolutionBundle`: ranked reusable resources, compatibility reasons, rejections, and capability gaps.
- `JourneyBlocker`: reason, evidence, responsible actor, affected nodes, required resolution, and safe resume command.
- `JourneyArtifactLink`: typed relationships among requirements, scenarios, cases, runs, evidence, findings, and reports.
- `JourneyCycle`: immutable remediation/rerun-cycle boundary with predecessor and successor lineage.
- `TestReportAnalysisRevision`: triage, coverage, attribution, residual risk, recommendations, and evidence references.
- `JourneyClosure`: terminal decision, exact accepted report, unresolved items, and optional explicit risk acceptance.

IDs remain stable; content changes create new revisions. Derived projections may be rebuilt from canonical records.

## Session and State Architecture

Appraise maintains a server-side evaluation session projection for each Quality Journey. The Runner and every incoming
worker receive only their appropriate projection. The Runner receives:

- journey and target identity;
- current stage, active revision IDs, and active cycle;
- permitted next commands;
- unresolved questions and blockers;
- active or reclaimable work items;
- relevant artifact links and compact evidence references;
- runnable graph nodes and gate state;
- the latest canonical state hash.

A role worker receives only its Assignment Manifest, allowed artifact projection, Role Definition, and current input
hash. It does not receive the Coordinator's full transcript, other roles' private reasoning, unrestricted project
state, or capabilities outside its contract.

The state hash identifies the authoritative projection, not an agent's private session. Mutating commands include the
expected hash and an idempotency key. Appraise atomically validates authorization, lifecycle preconditions, artifact
revision, and expected hash before committing the command and returning the successor projection and hash.

A stale hash produces a structured conflict with the latest projection; it does not destroy the agent session or
require hidden context recovery. Read-only operations do not require optimistic-concurrency ownership. Long work uses
leased work items and command reservations so an agent may reconnect or be replaced safely.

The Runner may schedule Scout and Resource Explorer work concurrently because they read independent authority
surfaces. Concurrent writes require non-overlapping Appraise scopes. The Runner treats provider selection and worker
replacement as attempt-level details rather than journey-state ownership.

## User Experience

### Journey Overview

A single route presents stage progress, current blockers, active role, pending user decisions, latest result, and
links to every artifact. The timeline exposes revisions and remediation cycles without flattening history.

### Requirement Analysis

The primary interface is a structured Analysis Charter and Q&A review. A lightweight graph may show relationships
among objectives, requirements, assumptions, risks, and unresolved questions when it improves comprehension. The
structured document remains fully usable without the graph.

### Scenario Planning

Reuse the existing React Flow test-case authoring experience as a review projection. Nodes represent scenarios or
scenario steps according to zoom level; edges communicate sequence, branching, shared setup, and requirement
coverage. Users can inspect details, comment, approve, or reject without directly mutating approved revisions.

### Execution and Reporting

The journey links to the normal Appraise test-run interface for live logs, evidence, and final metrics. The reporting
view combines coverage, outcomes, attribution, residual risk, recommendations, and linked evidence. A report revision
must identify the exact runs and scenario revisions it analyzes.

### Artifact Library

Each artifact has a stable route and revision history. Journey navigation provides filtered collections for analysis,
scenarios, suites/cases, runs, evidence, and reports. Closed journeys remain inspectable and exportable.

## Lifecycle and Gate Model

The normal path is:

`INTAKE -> ANALYSIS -> ANALYSIS_REVIEW -> DISCOVERY -> SCENARIO_DESIGN -> SCENARIO_REVIEW -> AUTOMATION -> EXECUTION -> TRIAGE -> REPORT_REVIEW -> CLOSED`

The three primary human gates are:

1. exact-revision Analysis Charter approval;
2. exact-revision scenario portfolio approval;
3. exact-report final assessment, remediation, risk acceptance, or closure.

Execution consent remains a conditional safety gate when runtime effects involve credentials, destructive actions,
financial impact, privacy, or other material risk. It is not presented as a routine fourth review stage for harmless
execution, but it is never bypassed when required.

Permitted loops include:

- analysis feedback to a new Analysis Charter revision;
- Scout or Resource Explorer questions to a bounded discovery retry without reopening approved analysis;
- scenario feedback to a new portfolio or scenario revision;
- automation defects back to automation without altering approved intent;
- triage-approved remediation into a new immutable journey cycle;
- selected scenario reruns with explicit predecessor lineage;
- report feedback to a new Test Report Analysis revision.

Every transition is an Appraise command with explicit preconditions. No role may infer approval from chat, skip a
stage, overwrite a reviewed revision, or manufacture target binding. Blocked states identify the responsible actor,
reason, required action, and safe resumption command.

## Phased Delivery Plan

### Phase 0 - Contracts, Terminology, and Golden Fixtures

Define the Quality Journey vocabulary, lifecycle state machine, six canonical Role Definitions, negative-authority
matrix, Assignment Manifest, capability-profile request, spawn receipt, result envelope, command envelopes, conflict
semantics, closure rules, and traceability invariants. Add golden end-to-end fixtures for happy path, revision loops,
reconnects, stale commands, partial approvals, worker replacement, unsupported provider boundaries, reruns, target
defects, validation-design defects, and risk-accepted closure.

Exit criteria:

- Active architecture and lifecycle documentation agree with source contracts.
- Transition tables define allowed actors, inputs, outputs, forbidden capabilities, and failure envelopes.
- Provider-neutral profiles contain no provider or model names.
- Golden fixtures can be consumed by later API, UI, and MCP tests.

### Phase 1 - Quality Journey Kernel and Deterministic Runner

Status: completed on 2026-08-28 in `codex/quality-journey-phase-1`. The delivered scope includes the durable aggregate,
immutable lifecycle history, transactional state/hash and idempotency enforcement, deterministic Runner projection,
work leases and replacement, immutable artifact publication, the seven coordinator/MCP operations, scaffold sync, and
the Phase 1 exit-criteria regression suite. Phase 2 remains the next delivery boundary.

Implement the durable journey, revision, command, work-item, lease, cycle, and artifact-link foundations. Add atomic
compare-and-swap transitions, idempotent command handling, successor projections, reconnect/reclaim behavior, and an
append-only lifecycle event stream. Implement the deterministic Runner's eligibility calculation, dependency
scheduling, gate pauses, attempt state machine, heartbeat/lease recovery, structured blockers, and safe resumption.

Expose a small coordinator API and MCP surface, including:

- `quality_journey_create`
- `quality_journey_get`
- `quality_journey_resume`
- `quality_journey_command_submit`
- `quality_journey_work_claim`
- `quality_journey_work_complete`
- `quality_journey_artifacts_list`

Exit criteria:

- Parallel and stale mutation tests prove one authoritative successor.
- The Runner can reconstruct every runnable, waiting, blocked, and terminal graph node from Appraise state alone.
- Retry tests prove commands and artifact publication are idempotent.
- Routine graph advancement requires no semantic Coordinator judgment.

### Phase 2 - Agent Factory and Capability Enforcement

Status: completed. Phase 2 now provides canonical-registry, version, and digest-bound Assignment Manifest validation;
provider-neutral least-privilege spawn requests; adapter-registry dispatch that blocks when no compatible adapter is
registered; durable idempotent adapter dispatch with private receipt ingress; structured fail-closed capability receipts; exact current-request
result-envelope enforcement; durable Factory persistence; hard atomic attempt ceilings; cancellation and terminal
revocation; coordinator/MCP control and read-only evidence operations; and server-derived replacement projections built
from authoritative current artifacts and work inputs.
Provider/model identity remains receipt-only and never changes Appraise authorization, assignment, replacement, or
spawn-request identity.

Implement versioned Role Definitions, provider-neutral profile resolution, Assignment Manifest issuance, least-privilege
spawn specifications, effective-property receipts, typed result validation, attempt budgets, cancellation, revocation,
and replacement-worker creation. The Factory must distinguish requested, enforced, verified, unverified, and
unsupported runtime properties.

Exit criteria:

- Factory requests never encode provider model names.
- A provider may change the selected model without changing journey or work-item identity.
- Workers receive only assignment-scoped tools, artifacts, target access, credentials, network, and filesystem rights.
- Required high-risk boundaries must be VERIFIED with evidence before a `STARTED` receipt is accepted.
- Replacement workers resume from authoritative current Appraise artifacts without hidden transcript replay; the
  projection hash and structured predecessor diagnostics are bound to the replacement lineage.
- Dispatch uses a durable deterministic idempotency key and adapter identity; failed dispatches may retry the same
  adapter/key while public coordinator callers cannot submit receipt evidence. Factory evidence exposes terminal refused
  receipts as hashes and status only.
- Forged, stale, cross-role, and out-of-scope result envelopes are rejected.

### Phase 3 - Analysis Charter and Requirement Q&A

Status: completed on 2026-09-01 in `codex/quality-journey-phase-3`. The delivered scope includes immutable Analysis
Charter and Q&A lineage, stable downstream requirement IDs, exact publication/revision/approval gates, clean-room
Analyzer revision assignments, six typed coordinator/MCP analysis operations, and the project-scoped Quality Journey
intake, overview, and analysis-review screens. Phase 4 remains the next delivery boundary.

Build Analysis Charter creation, revision, publication, questions, answers, resolution, and exact-revision approval.
Add the Requirement Analyzer work-item loop and the first Journey Overview and analysis-review screens.

Exit criteria:

- A user can submit a requirement and complete a multi-round Q&A loop.
- Approval is blocked while required questions remain unresolved.
- Changing reviewed analysis creates a new revision and invalidates only affected approval.
- Every approved requirement can be addressed by stable ID downstream.
- The Analyzer cannot approve, target-explore, or automate through its assigned capabilities.

### Phase 4 - Scout and Resource Explorer Discovery

Status: completed on 2026-09-04 in `codex/quality-journey-phase-04`. The delivered scope includes strict observation
and resource-resolution contracts, an immutable discovery revision with frozen target and catalog authority, parallel
least-privilege Factory work items, specialized coordinator/MCP submission boundaries, compare-and-swap output join,
drift revalidation, and whole-revision retry lineage. Phase 5 remains the next delivery boundary.

Implement parallel Scout and Resource Explorer work items after analysis approval. Scout publishes provenance-bound
Target Observation Bundles. Resource Explorer publishes ranked Resource Resolution Bundles using stable Appraise IDs,
compatibility reasons, rejected candidates, and missing-capability declarations.

Exit criteria:

- Target observations include snapshot, route/environment, evidence, confidence, stability, and revalidation policy.
- Resource results distinguish reusable, incompatible, stale, cross-target, and missing assets.
- Scout cannot mutate Appraise catalogs; Resource Explorer cannot browse or mutate the target.
- Parallel attempts cannot overlap writes or broaden approved target scope.
- Discovery retries do not reopen analysis unless they reveal a genuine requirement ambiguity.

### Phase 5 - Scenario Portfolio and Graph Review

Status: implemented on 2026-09-04 in `codex/quality-journey-phase-05`. The delivery persists immutable scenario
portfolio and scenario revisions, separates behavioral-intent, feasibility-enrichment, and graph-layout hashes,
requires completed Scout and Resource Explorer provenance, supports accumulated partial decisions, and permits the
final transition only when every scenario is classified and approved scenarios cover every mandatory requirement.
The specialized coordinator/MCP boundary rejects all Phase 5 lifecycle commands from the generic command path.

Build the scenario portfolio and scenario revision model, requirement-coverage links, review comments, partial and
portfolio approval, and feedback-driven revision flow. Adapt the existing React Flow interface into a read/review
projection while preserving its established interaction language. Separate behavioral intent from feasibility
enrichment so implementation-only changes do not invalidate scenario approval.

Exit criteria:

- Every proposed scenario traces to one or more approved requirements or an explicit exploratory rationale.
- Users can understand sequence and coverage, inspect details, and approve or reject exact revisions.
- Graph and linear/detail views round-trip to the same canonical records.
- Approved scenarios cannot be silently changed by layout edits or regeneration.
- Scenario facts reference Scout observations and resource assumptions reference Resource Explorer results.

### Phase 6 - Automator and Approved Scenario Materialization

Status: implemented on 2026-09-05. The Automator receives an assignment compiled from exact approved Phase 5
decisions and materializes deterministic target-owned suites, cases, steps, and typed prepared capsules. Phase 6 is
preparation-only: no `TestRun` or legacy `RuntimeCapsule` is created or changed, and execution remains gated by
Phase 7.

Add deterministic conversion from approved scenarios into suites, cases, steps, data, locator requirements, and
runtime capsules through bounded Automator work items. Preserve explicit links between scenario revisions and
executable artifacts. Reuse compatible catalog resources before creating missing assets. Separate design defects from
target-observation staleness, resource gaps, and automation errors.

Exit criteria:

- Materialization consumes only approved scenario revisions.
- Repeated materialization with the same inputs is idempotent.
- Executable artifacts retain source-revision and operation-catalog lineage.
- Materialization failure cannot advance the journey to execution.
- The Automator cannot alter approved behavioral intent or write outside its assigned artifact scope.

### Phase 7 - Managed Execution and Remediation Cycles

Status: implemented on 2026-09-05. Managed execution reserves exact approved materializations and frozen target/
environment identity, exposes live runs, and seals terminal runtime evidence. Conditional consent names material
operations; approved selective reruns create individually inspectable successor cycles. Replay and cancellation
retain durable identity, while unavailable process ownership blocks duplicate execution. Phase 8 semantic triage
and remediation analysis remain gated.

Connect journey commands to existing Appraise test-run execution. Add live run visibility, sealed evidence linkage,
run completion projection, safe cancellation/reconnect behavior, selective rerun proposals, and immutable journey
cycles. Execution is a managed runtime capability driven by the Runner, not a semantic agent role.

Exit criteria:

- A run can start only from materialized artifacts tied to approved scenarios.
- Run identity, runtime capsule, target, environment, scenario revision, and evidence lineage are immutable.
- Disconnects do not orphan execution or grant another worker duplicate execution authority.
- Multiple remediation/rerun cycles remain individually inspectable.
- Conditional execution consent is enforced for material effects without adding a routine gate to harmless runs.

### Phase 8 - Independent Triage and Test Report Analysis

Status: implemented on 2026-09-05. Isolated registry-v5 Triager assignments freeze accepted analysis and scenario
lineage plus terminal sealed evidence. Specialized report publication accounts for every material outcome, preserves
unresolved attribution, and binds complete report/source hashes. Full-report feedback issues an immutable successor;
local approval of an explicit automation-correction scope creates a new cycle with new materializations and historical
supersession links. Unchanged automation uses the existing rerun path. Phase 9 closure remains gated.

Implement result attribution, finding linkage, postmortem structure, coverage summaries, residual-risk statements,
recommendations, and revisioned report review through isolated Triager work items. Enforce the distinction among
target defects, validation-design defects, automation errors, infrastructure boundaries, and inconclusive outcomes.
Give the Triager accepted artifacts and sealed evidence rather than the Automator's producer narrative.

Exit criteria:

- Every material failure has an explicit attribution or remains visibly unresolved.
- Reports reference exact runs, evidence, scenarios, requirements, and cycle.
- User feedback produces a new report revision without mutating prior analysis.
- Proposed remediation has an explicit scope and approval path.
- Correcting automation creates a new automation revision and run cycle without rewriting the historical result.

### Phase 9 - Closure and Artifact Library

Status: implemented on 2026-09-05. Exact local terminal review records a database-immutable closure receipt and
report approval atomically. Required gates remain non-waivable; all findings, non-passing coverage, and residual-risk
statements require explicit risk acceptance. Empty residual-risk lists explicitly support ordinary closure. Durable
artifact navigation/export and same-target linked follow-up intake preserve historical identity after closure.

Add terminal review, normal closure, risk-accepted closure, immutable closure receipts, journey export, and durable
artifact-library navigation. Closure records the exact approved report and unresolved items.

Exit criteria:

- Appraise blocks ordinary closure while required gates or unresolved blockers remain.
- Risk-accepted closure captures actor, rationale, known failures/limitations, and exact artifact revisions.
- Every journey artifact is directly accessible after closure.
- Closed journeys reject further mutation; follow-up work starts a linked new journey or explicitly permitted cycle.

### Phase 10 - Experience Convergence and Legacy Cutover

Status: implemented on 2026-09-06 in `codex/quality-journey-phase-10`. The delivery unifies stage navigation,
Runner/work-item/attempt and human-gate visibility, manual accessible progress refresh, responsive graph alternatives,
and metadata-only artifact search across UI/API/MCP. Exact relational legacy history is available through a read-only
compatibility projection without inferred Journey approval transfer. Superseded approval shortcuts are retired across
HTTP and UI; source intake requires explicit analysis. The release gate audits foreign keys, cross-Journey relational
ownership, active references, and generated artifacts. See `docs/quality-journey-experience-cutover.md` for boundaries,
verification, and rollback guidance.

Unify route navigation, notifications, role progress, stage blockers, accessibility, responsive graph behavior, and
cross-artifact search. Migrate or project existing planning/validation records where lineage can be proven. Keep a
read-only compatibility path for records that cannot be safely upgraded, then remove superseded session-control
paths after negative cutover checks pass.

Exit criteria:

- The complete workflow is usable through both the Appraise UI and coordinator API/MCP surface.
- The UI distinguishes Coordinator status, Runner state, role work items, worker attempts, human gates, and blockers.
- Legacy paths cannot bypass Quality Journey gates or create competing lifecycle authority.
- Orphan and referential-integrity scans pass for migrated and generated artifacts.
- Active documentation, scaffold output, and release contracts describe the new workflow.

## Verification Strategy

During implementation, use deterministic checks proportionate to each phase: focused unit and integration tests,
state-machine invariants, schema/migration checks, API contract tests, linting, formatting, type/build checks, graph
projection round trips, accessibility checks, and browser verification of affected screens.

Do not run the full validation suite after every individual change. Run it once the cumulative implementation is
stable, including root and scaffold/package release checks where affected. Use an independent judge only at a durable,
consequential boundary or for the final stabilized artifact when residual uncertainty warrants it. Bind any judgment
to the exact commit/tree or diff, scope, acceptance criteria, and deterministic evidence; later changes within that
scope require revalidation.

Required negative coverage includes:

- stale hashes and concurrent commands;
- duplicate delivery and retry after timeout;
- worker disconnect, lease expiry, and replacement;
- provider profile resolution after available model names change;
- requested capability boundaries reported as unverified or unsupported;
- inherited-context leakage and unauthorized transcript replay;
- role attempts using forbidden tools, commands, targets, routes, artifacts, network origins, or filesystem paths;
- forged, stale, wrong-contract, and cross-work-item spawn receipts or result envelopes;
- invalid role, stage, target, or artifact revision;
- approval of superseded content;
- partial scenario approval and rejected revisions;
- Scout mutation of resource catalogs and Resource Explorer interaction with the target;
- Test Scenario Designer invention of target facts and Automator mutation of approved intent;
- Triager access to producer narrative or mutation of automation during attribution;
- execution from unapproved or rematerialized content;
- missing evidence or unattributed failures;
- closure with unresolved gates and closure with explicit risk acceptance;
- mutation after terminal closure;
- cross-project and cross-journey artifact access.

## Release and Migration Constraints

- Schema changes use forward migrations and explicit compatibility checks.
- Root/base source remains canonical for scaffolded-app changes; synchronize through the documented template workflow.
- Existing Quality OS certification, evidence-attribution, and Appraise-owned approval gates remain release-critical.
- Generated automation output is never a competing authoring or lifecycle authority.
- Public coordinator/MCP contracts are versioned or receive a documented compatibility window.
- Role Definitions, Assignment Manifests, provider capability profiles, spawn receipts, and result envelopes are
  versioned public contracts with digest-bound compatibility rules.
- Cutover includes orphan scans, artifact referential checks, negative gate-bypass tests, and rollback guidance.

## Completion Definition

The roadmap is complete when a first-time user can provide a requirement and the deterministic Runner can drive the
entire graph through provider-neutral Agent Factory requests and replaceable, least-privilege Requirement Analyzer,
Scout, Resource Explorer, Test Scenario Designer, Automator, and Triager workers; the three primary human gates and
conditional execution consent remain Appraise-owned; no stage relies on hidden conversation or provider model names;
Appraise can prove every transition, attempt, effective capability boundary, and artifact lineage; every artifact
remains individually accessible; and the stabilized root and scaffold releases pass the complete relevant validation
and independent final evaluation.
