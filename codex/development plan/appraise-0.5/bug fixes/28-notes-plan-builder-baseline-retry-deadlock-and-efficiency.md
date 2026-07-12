# Notes Plan Builder Baseline Retry Deadlock And Efficiency

## Summary

Make the AppraiseJS plan-builder lifecycle recoverable and compact for a simple local notes application. This plan is
based on a live 2026-07-12 subagent run through the real MCP workflow and Appraise browser review gates.

The run reached plan approval, validation publication and approval, managed baseline execution, Appraise-owned
validation repair, and a second validation approval. It could not legally continue because the second
`baseline_start` reused a TestRun name reserved by the failed first attempt. The API returned a uniqueness error but
exposed neither an idempotent existing-run result nor a retry name. `baseline_reconcile` then rejected the plan because
no baseline was running. Baseline acceptance, implementation, final managed validation, completion review, and final
sign-off were therefore unreachable without bypassing Appraise-owned gates.

This plan complements bug-fix plans 25 and 26. It does not repeat their broad runtime and payload work; it adds the
exact retry deadlock, run-read consistency gap, negation-sensitive classification failure, missing locator validation,
and event-cursor behavior proven by this run.

## Audit Evidence

- Target: `/private/tmp/appraisejs-simple-notes-plan-builder-e2e-20260712`
- Plan: `pln_01kxaw8z2pejj5d3pb6319vptx`
- Plan revision: 1
- Plan hash: `sha256:d03fa3d1bd1f372cf102af6960d5247449f230fde5614b73e681a90c151ffae3`
- Plan review: exact revision approved in the Appraise browser UI
- Validation artifact: `appraise/plans/validations/pln_01kxaw8z2pejj5d3pb6319vptx.validation.yaml`
- Runtime manifest: `automation/features/simple-notes-happy-path.feature`
- First failed TestRun: `52ae1958-148b-4d49-848e-888b2f17c1bc`
- First baseline result: `validation_harness_failure`; lifecycle returned to `validation_changes_requested`
- Repaired validation: one locator group, ten locators, explicit locator bindings, four reused shared step files
- Repaired Gherkin hash: `sha256:55fcd2bee2b214ed02d73bacca4e92ba5eb9d1c59c79ebae7b63175f868ad5d5`
- Repaired validation review: approved in the Appraise browser UI
- Terminal `baseline_start` error: `A test run with this name already exists. Please choose a different name.`
- Terminal `baseline_reconcile` error: `The plan is not running baselines.`

No invalid baseline was accepted, and no implementation or completion state was fabricated outside Appraise.

## Findings

### P0: Baseline Retry Is Deadlocked By A Reserved TestRun Name

The first failed baseline preserves its TestRun, as it should. After validation repair and exact reapproval, the next
`baseline_start` generates the same unique TestRun name. The database rejects creation, but the tool has no caller
input for a name, attempt ordinal, retry key, or existing run. The failure occurs before baseline-running state is
entered, so `baseline_reconcile` cannot recover it.

Expected behavior is either idempotent reuse for the same exact execution intent or an attempt-unique TestRun name
for a new validation hash/revision. A uniqueness conflict must return structured recovery metadata rather than a
generic validation string.

### P0: Emitted Baseline TestRun IDs Are Not Readable Through Evidence Tools

The first `baseline_start` emitted TestRun ID `52ae1958-148b-4d49-848e-888b2f17c1bc`. Both `test_run_read` and
`test_run_diagnose` returned `404 NOT_FOUND` for that exact ID. The supported evidence path could not explain the
harness failure even though baseline reconciliation knew about the attempt.

Baseline creation, evidence reads, diagnosis, and UI links must use one canonical TestRun identity. Every emitted ID
must be immediately readable, including failed, cancelled, and pre-registration attempts.

### P0: Locator-Dependent Validations Pass Check And Preflight Without Locators

The initially approved validation contained no locator groups and no locators, while every fill, click, and assertion
step called `resolveLocator` by name. `validation_draft_check`, publication, and runtime preflight all passed. The
missing bindings surfaced only during managed baseline execution.

The validation compiler must reject any locator-bearing step whose locator ID/name cannot be resolved uniquely in
the exact projected capsule. Review-ready and preflight-ready must mean the same thing as runtime-ready.

### P1: Natural-Language Classification Is Negation-Insensitive

`planning_session_create` classified a local notes CRUD brief as an external-API information app. Clarifying that it
was "not an API app" increased API confidence, indicating keyword scoring without negation scope. Candidate tasks
focused on location/query, API integration, and results rendering. Reminder-domain requirement IDs such as
`reminder-title` and `reminder-notes` also leaked into the notes assessment.

The coverage gate correctly prevented publication, but the recovery required a second failed planning attempt and a
manual structured `plan_create` fallback.

### P1: Semantic Template Resolution And Exact Search Disagree

`template_step_match` returned no match for straightforward intents such as filling a labeled field or clicking a
button. Exact `template_step_search` found suitable shared templates. The agent needed roughly twelve discovery calls
instead of one bounded ranked resolution request.

### P1: Lifecycle Responses Are Artifact-Sized Instead Of Delta-Sized

`validation_draft_publish` returned more than 11,000 tokens and duplicated the complete draft inside the published
artifact before concise gate metadata. `baseline_start` and `baseline_reconcile` likewise returned the full plan and
validation tree. Large payloads were truncated at the point where IDs, lifecycle, blockers, and next actions mattered.

### P1: Event Cursor Results Can Surface Stale State Before Newer State

After validation repair, a review loop surfaced an older `validation_changes_requested` event even though a newer
`validation_review_ready` event existed. A second cursor call was required to discover the actionable state. Cursor
reads should return all bounded events after the supplied sequence in order and derive status from the newest
unhandled lifecycle event.

### P2: UI Review Decisions Need Explicit Pending Feedback

After approving validation evidence, the button disabled before the server result was durably reflected. A reload
performed too quickly still showed `No decision`; a later reload showed `approved`. The UI should expose a pending
state and confirm success or a structured failure without requiring timing-dependent reloads.

## Goals

1. A failed baseline followed by validation repair can always start a fresh managed baseline.
2. Every TestRun ID returned by lifecycle tools is readable and diagnosable immediately.
3. Draft check, publish preflight, and runtime enforce identical locator-resolution rules.
4. Local CRUD/editor briefs cannot be promoted as API applications because of negated keywords.
5. Template intent resolution normally completes in one bounded call.
6. Default lifecycle responses contain only new state, evidence summaries, links, blockers, and next actions.
7. Cursor-based standby never hides a newer actionable event behind older delivered state.

## Non-Goals

- Deleting or rewriting historical failed TestRuns.
- Allowing agents to choose arbitrary run names as the normal workflow.
- Weakening plan, validation, baseline, implementation, or completion gates.
- Accepting manual reduced-assurance evidence for required browser validation.
- Patching generated automation files instead of canonical validation source.

## Implementation Plan

### Phase 1: Remove The Lifecycle Deadlock

#### Task 1: Introduce A Durable Baseline Execution Identity

Define a content-addressed execution key from plan ID, validation artifact hash, environment/browser matrix, and
attempt ordinal. Store it with the baseline attempt and TestRun. Replaying the same start request must return the
existing queued/running attempt; starting after a repaired validation hash must allocate the next attempt and a unique
display name.

**Acceptance criteria:**

- Concurrent identical `baseline_start` calls create at most one TestRun.
- Replays return the existing attempt with `reused: true` and the canonical TestRun ID.
- A repaired/reapproved validation creates a new attempt without a name collision.
- Historical attempts remain immutable and linked to their exact validation hash.

**Verification:** focused baseline service/API/MCP concurrency and retry tests.

#### Task 2: Return Structured Conflict Recovery

Replace the generic unique-name error with a typed result containing the existing attempt/TestRun, lifecycle state,
whether reconcile is legal, and the exact next action. If a legacy conflicting row cannot be bound safely, return an
explicit repair action rather than leaving the plan between states.

**Acceptance criteria:**

- No baseline-start conflict is returned as an unstructured validation message.
- Every conflict result supplies one legal next action.
- `baseline_reconcile` can reconcile a recoverable existing attempt or explains the exact repair transition.

**Dependencies:** Task 1.

#### Task 3: Unify TestRun Identity Across Start, Read, Diagnose, And UI

Trace the TestRun identifier returned by baseline creation through persistence, evidence adapters, MCP tools, and UI
links. Make read/diagnose support terminal harness failures and attempts that fail around process registration.

**Acceptance criteria:**

- Every TestRun ID emitted by `baseline_start` is immediately readable.
- `test_run_diagnose` returns bounded root-cause evidence for the failed attempt.
- API, MCP, report/log URLs, and UI all address the same canonical ID.

### Checkpoint: Retry Recovery

- Run `failed baseline -> validation repair -> reapproval -> baseline_start` twice.
- Confirm the first replay is idempotent and the repaired validation receives a new attempt.
- Confirm both historical TestRuns remain readable.

### Phase 2: Fail Invalid Validation Before Review

#### Task 4: Add Shared Locator Resolution Validation

Extract one validator used by draft check, publish, review submission, preflight, and runtime projection. Inspect every
step parameter that consumes a locator and require exactly one compatible locator in the projected resources.

**Acceptance criteria:**

- Missing, duplicate, stale, and name/ID-mismatched locator references are blocking errors.
- Errors identify validation, case, step, requested locator, and the corrective tool/action.
- A locator-complete draft produces the same resolution map used by runtime projection.

#### Task 5: Add Exact-Capsule Preflight

Extend preflight to load the exact generated feature, shared imports, selector/tag expression, locator resources,
binary, config, environment, and report path used by the managed attempt.

**Acceptance criteria:**

- The original zero-locator audit fixture cannot report preflight `passed`.
- Preflight proves at least one expected scenario and every step/locator binding before review submission.
- The preflight receipt is hash-bound to the runtime capsule consumed by baseline start.

**Dependencies:** Task 4.

### Phase 3: Improve Planning Fidelity And Step Discovery

#### Task 6: Make Requirement Classification Negation-Aware

Tokenize domain signals with local negation scope and separate lifecycle/tooling language from product behavior. Add a
first-class local CRUD/editor candidate and prevent requirement IDs from crossing domains.

**Acceptance criteria:**

- "local notes app, not an API app" decreases rather than increases API confidence.
- Notes CRUD, persistence, ordering, search, accessibility, and tests are covered in the candidate plan.
- Reminder requirement IDs never appear in a notes-only assessment.
- Ambiguous briefs return compact clarification questions instead of a confidently wrong domain.

#### Task 7: Replace Split Matching With One Ranked Resolver

Back `template_step_match`, search, and validation shape proposal with one server-side ranked resolver that supports
semantic intent, exact terms, parameter compatibility, confidence thresholds, and explanations.

**Acceptance criteria:**

- Common fill, click, navigation, and assertion intents resolve in one call.
- Low-confidence matches return bounded alternatives instead of silent failure or unrelated reuse.
- Metrics record resolver calls, fallbacks, selected rank, and tokens/bytes returned.

### Phase 4: Make The Workflow Delta-Oriented

#### Task 8: Default Lifecycle Mutations To Compact Responses

Apply a consistent `summary | evidenceOnly | blockersOnly | linksOnly | full` contract to planning, validation publish,
baseline start/reconcile, and run diagnosis. Default to `summary`; require an explicit read for full artifacts.

**Acceptance criteria:**

- Publish returns hashes, counts, links, manifest paths, blockers, and next action without embedding the draft.
- Baseline mutations return attempt/TestRun IDs, evidence summary, lifecycle delta, and next action only.
- A one-validation happy path keeps every default response below an agreed byte/token budget.
- Truncation tests prove actionable metadata is never ordered after optional artifact bodies.

#### Task 9: Correct Cursor And Review-Decision Semantics

Return ordered bounded event batches after the supplied cursor, calculate status from the newest relevant event, and
make UI review mutations expose pending/success/error states.

**Acceptance criteria:**

- A newer review-ready event cannot be hidden by an older changes-requested event.
- Unchanged waits return only cursor/timing/next-action deltas.
- Evidence approval and review submission visibly confirm durable success without reload races.

### Checkpoint: Full Happy Path

Run a fresh simple-notes project through:

1. diagnostic and registration;
2. natural-language plan creation without structured fallback;
3. browser plan approval;
4. one-pass Appraise-native validation authoring and browser approval;
5. managed baseline and browser acceptance;
6. implementation checkpoints and task verification;
7. managed implementation validation with readable TestRun evidence;
8. completion review and exact final browser sign-off.

The release test must also inject a first baseline harness failure, repair validation, reapprove it, and prove the
second baseline reaches review. Capture response bytes, tool-call count, wall time split by owner, and tokens for both
the normal and recovery paths.

## Suggested Robustness Features

- Add a lifecycle health panel showing the latest event, legal owners/actions, attempt/TestRun identity, and recovery
  action without exposing the full plan payload.
- Add a pre-publication "explain runtime capsule" view with scenario selector, resolved locators, shared step imports,
  environment/browser matrix, and expected run count.
- Add a one-call `workflow_next_actions` resource/tool that returns only legal actions and blockers for the current
  lifecycle hash, reducing agent guesswork and repeated catalog reads.
- Add per-plan efficiency telemetry: response bytes, tool calls, unchanged waits, semantic-match fallbacks, active
  agent time, Appraise time, and human-review time.
- Add a reusable greenfield notes CRUD validation macro/Step Block so common plans can author a reviewable test shape
  with mapped inputs instead of many field-level mutations.

## Definition Of Done

- The terminal retry reproduction completes through final sign-off without manual database or generated-file edits.
- All new lifecycle behavior has service, API, MCP, and browser-level regression coverage.
- Invalid locator references fail before validation review.
- Failed TestRuns remain readable and diagnosable.
- Default response-size budgets and cursor-delta semantics are enforced in tests.
- Current lifecycle, MCP, runtime, and validation-authoring docs are updated in the same change set.
