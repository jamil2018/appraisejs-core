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
2. A Requirement Analyst prepares an Analysis Charter in Appraise.
3. The user reviews the charter, answers its questions, and requests revisions until both sides are satisfied.
4. A Scenario Designer proposes a scenario portfolio using the existing React Flow-based test-case experience.
5. The user approves or rejects scenarios individually or as a portfolio, with structured feedback.
6. Approved scenarios are materialized into executable suites, cases, and steps.
7. A Test Executor runs the approved scenarios. The user can inspect the live and completed run in Appraise.
8. A Result Triager attributes failures and publishes a Test Report Analysis with evidence and a postmortem.
9. The user reviews the report and either starts a remediation/rerun cycle or closes the Quality Journey.
10. Closure with known failures or limitations requires explicit, recorded risk acceptance.

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
- **Approval applies to exact revisions.** Later changes invalidate only the approvals whose reviewed scope changed.
- **Commands are idempotent and concurrency-safe.** Retries cannot duplicate artifacts or advance a stage twice.
- **Execution is reproducible.** Runs retain exact approved scenario, runtime capsule, environment, and evidence
  lineage.
- **Failures are attributed explicitly.** Target defects, validation-design defects, infrastructure boundaries, and
  inconclusive results remain distinguishable.

## Roles

### Quality Journey Coordinator

The coordinator is a product-facing facade, not a source of lifecycle authority. It observes Appraise state, assigns
bounded work, explains progress, and proposes the next permitted command.

### Requirement Analyst

Turns the user's request into a revisioned Analysis Charter containing objectives, scope, actors, obligations,
constraints, assumptions, risks, acceptance signals, exclusions, and unresolved questions.

### Target Explorer

Collects bounded facts about the target needed to resolve analysis or scenario-design questions. Exploration evidence
is linked to the request that authorized it and does not silently expand scope.

### Scenario Designer

Creates the scenario portfolio, coverage rationale, dependency/order relationships, data needs, expected outcomes,
and traceability to approved requirements.

### Test Implementer

Materializes approved scenario revisions into Appraise-owned suites, cases, canonical operation invocations, data,
locators, and runtime capsules without changing scenario intent.

### Test Executor

Starts and observes approved runs, reports execution boundaries, and records sealed runtime evidence. It cannot alter
approved design while executing it.

### Result Triager

Analyzes results and evidence, attributes failures, recommends remediation or rerun scope, and drafts the Test Report
Analysis.

### Independent Reviewer

Evaluates consequential or weakly verified artifacts at deliberately stabilized boundaries. It is not invoked after
every edit, and its decision is bound to the exact reviewed revision and evidence set.

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
- `JourneyWorkItem`: role, inputs, allowed outputs, status, attempt, lease, and replacement lineage.
- `JourneyArtifactLink`: typed relationships among requirements, scenarios, cases, runs, evidence, findings, and reports.
- `JourneyCycle`: immutable remediation/rerun-cycle boundary with predecessor and successor lineage.
- `TestReportAnalysisRevision`: triage, coverage, attribution, residual risk, recommendations, and evidence references.
- `JourneyClosure`: terminal decision, exact accepted report, unresolved items, and optional explicit risk acceptance.

IDs remain stable; content changes create new revisions. Derived projections may be rebuilt from canonical records.

## Session and State Architecture

Appraise maintains a server-side evaluation session projection for each Quality Journey. An incoming agent receives:

- journey and target identity;
- current stage, active revision IDs, and active cycle;
- permitted next commands;
- unresolved questions and blockers;
- active or reclaimable work items;
- relevant artifact links and compact evidence references;
- the latest canonical state hash.

The state hash identifies the authoritative projection, not an agent's private session. Mutating commands include the
expected hash and an idempotency key. Appraise atomically validates authorization, lifecycle preconditions, artifact
revision, and expected hash before committing the command and returning the successor projection and hash.

A stale hash produces a structured conflict with the latest projection; it does not destroy the agent session or
require hidden context recovery. Read-only operations do not require optimistic-concurrency ownership. Long work uses
leased work items and command reservations so an agent may reconnect or be replaced safely.

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

`INTAKE -> ANALYSIS -> ANALYSIS_REVIEW -> SCENARIO_DESIGN -> SCENARIO_REVIEW -> MATERIALIZATION -> EXECUTION -> TRIAGE -> REPORT_REVIEW -> CLOSED`

Permitted loops include:

- analysis feedback to a new Analysis Charter revision;
- scenario feedback to a new portfolio or scenario revision;
- materialization defects back to materialization without altering approved intent;
- triage-approved remediation into a new immutable journey cycle;
- selected scenario reruns with explicit predecessor lineage;
- report feedback to a new Test Report Analysis revision.

Every transition is an Appraise command with explicit preconditions. No role may infer approval from chat, skip a
stage, overwrite a reviewed revision, or manufacture target binding. Blocked states identify the responsible actor,
reason, required action, and safe resumption command.

## Phased Delivery Plan

### Phase 0 - Contracts, Terminology, and Golden Fixtures

Define the Quality Journey vocabulary, lifecycle state machine, artifact/revision contracts, role permissions,
command envelopes, conflict semantics, closure rules, and traceability invariants. Add golden end-to-end fixtures for
happy path, revision loops, reconnects, stale commands, partial approvals, reruns, target defects, validation-design
defects, and risk-accepted closure.

Exit criteria:

- Active architecture and lifecycle documentation agree with source contracts.
- Transition tables define allowed actors, inputs, outputs, and failure envelopes.
- Golden fixtures can be consumed by later API, UI, and MCP tests.

### Phase 1 - Quality Journey Session Kernel

Implement the durable journey, revision, command, work-item, lease, cycle, and artifact-link foundations. Add atomic
compare-and-swap transitions, idempotent command handling, successor projections, reconnect/reclaim behavior, and an
append-only lifecycle event stream.

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
- A replacement agent can resume any nonterminal work item from Appraise state alone.
- Retry tests prove commands and artifact publication are idempotent.

### Phase 2 - Analysis Charter and Requirement Q&A

Build Analysis Charter creation, revision, publication, questions, answers, resolution, and exact-revision approval.
Add the analyst and explorer work-item contracts and the first Journey Overview and analysis-review screens.

Exit criteria:

- A user can submit a requirement and complete a multi-round Q&A loop.
- Approval is blocked while required questions remain unresolved.
- Changing reviewed analysis creates a new revision and invalidates only affected approval.
- Every approved requirement can be addressed by stable ID downstream.

### Phase 3 - Scenario Portfolio and Graph Review

Build the scenario portfolio and scenario revision model, requirement-coverage links, review comments, partial and
portfolio approval, and feedback-driven revision flow. Adapt the existing React Flow interface into a read/review
projection while preserving its established interaction language.

Exit criteria:

- Every proposed scenario traces to one or more approved requirements or an explicit exploratory rationale.
- Users can understand sequence and coverage, inspect details, and approve or reject exact revisions.
- Graph and linear/detail views round-trip to the same canonical records.
- Approved scenarios cannot be silently changed by layout edits or regeneration.

### Phase 4 - Approved Scenario Materialization

Add deterministic conversion from approved scenarios into suites, cases, steps, data, locator requirements, and
runtime capsules. Preserve explicit links between scenario revisions and executable artifacts. Separate design defects
from target-discovery work and materialization errors.

Exit criteria:

- Materialization consumes only approved scenario revisions.
- Repeated materialization with the same inputs is idempotent.
- Executable artifacts retain source-revision and operation-catalog lineage.
- Materialization failure cannot advance the journey to execution.

### Phase 5 - Execution and Remediation Cycles

Connect journey commands to existing Appraise test-run execution. Add live run visibility, sealed evidence linkage,
run completion projection, safe cancellation/reconnect behavior, selective rerun proposals, and immutable journey
cycles.

Exit criteria:

- A run can start only from materialized artifacts tied to approved scenarios.
- Run identity, runtime capsule, target, environment, scenario revision, and evidence lineage are immutable.
- Disconnects do not orphan execution or grant another worker duplicate execution authority.
- Multiple remediation/rerun cycles remain individually inspectable.

### Phase 6 - Triage and Test Report Analysis

Implement result attribution, finding linkage, postmortem structure, coverage summaries, residual-risk statements,
recommendations, and revisioned report review. Enforce the distinction among target defects, validation-design defects,
infrastructure boundaries, and inconclusive outcomes.

Exit criteria:

- Every material failure has an explicit attribution or remains visibly unresolved.
- Reports reference exact runs, evidence, scenarios, requirements, and cycle.
- User feedback produces a new report revision without mutating prior analysis.
- Proposed remediation has an explicit scope and approval path.

### Phase 7 - Closure and Artifact Library

Add terminal review, normal closure, risk-accepted closure, immutable closure receipts, journey export, and durable
artifact-library navigation. Closure records the exact approved report and unresolved items.

Exit criteria:

- Appraise blocks ordinary closure while required gates or unresolved blockers remain.
- Risk-accepted closure captures actor, rationale, known failures/limitations, and exact artifact revisions.
- Every journey artifact is directly accessible after closure.
- Closed journeys reject further mutation; follow-up work starts a linked new journey or explicitly permitted cycle.

### Phase 8 - Experience Convergence and Legacy Cutover

Unify route navigation, notifications, role progress, stage blockers, accessibility, responsive graph behavior, and
cross-artifact search. Migrate or project existing planning/validation records where lineage can be proven. Keep a
read-only compatibility path for records that cannot be safely upgraded, then remove superseded session-control
paths after negative cutover checks pass.

Exit criteria:

- The complete workflow is usable through both the Appraise UI and coordinator API/MCP surface.
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
- invalid role, stage, target, or artifact revision;
- approval of superseded content;
- partial scenario approval and rejected revisions;
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
- Cutover includes orphan scans, artifact referential checks, negative gate-bypass tests, and rollback guidance.

## Completion Definition

The roadmap is complete when a first-time user and replaceable role agents can carry a requirement through analysis,
scenario approval, implementation, execution, triage, report review, optional remediation cycles, and explicit closure
without relying on hidden conversation state; Appraise can prove every transition and artifact lineage; every artifact
remains individually accessible; and the stabilized root and scaffold releases pass the complete relevant validation
and independent final evaluation.
