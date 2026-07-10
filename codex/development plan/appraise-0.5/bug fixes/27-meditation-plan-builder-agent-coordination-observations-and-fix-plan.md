# Meditation Plan Builder Agent Coordination Observations And Fix Plan

> **Status: Superseded as an implementation plan.** Retained as audit evidence and regression input. The combined
> architectural migration authority is
> `../architectural-migrations/01-agent-authored-validation-ast-and-appraise-runtime-migration.md`.

## Summary

AppraiseJS can coordinate an agent through a complete application build, but the successful result currently depends
on expert intervention and temporary Appraise-side repairs. In this live 2026-07-10/11 evaluation, Appraise owned the
plan review, validation review, baseline, implementation groups, task state, managed implementation validation, and
completion-readiness gates for a new meditation breathing application. The agent implemented and verified all five
plan tasks, and Appraise ultimately recorded a full-assurance managed passing run with one expected and matched test
case.

The coordination model is therefore viable. The default happy path is not yet reliable or efficient enough for an end
user. Planning misclassified the brief twice, runtime preflight missed several deterministic failures, baseline repair
discarded visible attempt history, standalone implementation runs omitted expected test-case associations, event
acknowledgement could saturate the server, and final completion UI/hash contracts contradicted completion readiness.

This document records the run as an experience report and defines the smallest ordered fix plan needed to make the
same workflow complete without maintainer-level source inspection or temporary hub patches.

## Scope And Relationship To Existing Plans

This plan is the audit-specific consolidation and delta for the meditation run. It complements rather than replaces:

- `20-run-experience-rectification-plan.md`: plan-bound runtime isolation, lifecycle ownership, completed logs, and
  concise MCP response foundations.
- `22-implementation-validation-test-run-association.md`: managed implementation validation binding and assurance.
- `25-plan-builder-requirement-fidelity-and-token-efficiency.md`: requirement traceability, domain classification,
  compact responses, and standby efficiency.
- `26-plan-builder-end-to-end-runtime-recovery-and-efficiency.md`: generated runtime consistency, deterministic
  preflight, invalid-evidence recovery, and release-level end-to-end acceptance.

Where those plans already define the right structural fix, this plan adds concrete regression cases and acceptance
evidence from the meditation workflow. New work should be implemented once in the canonical service or contract, not
as parallel special cases.

## Audit Evidence

### Plan And Target

- Target workspace: `/private/tmp/appraisejs-meditation-breathing-happy-path-20260710`
- Target project ID: `ec8c432e-3034-408f-bb9e-45537eeeb477`
- Plan ID: `pln_01kx6ect05hj81tk76pmx423zb`
- Plan revision: `1`
- Plan URL: `http://127.0.0.1:3000/plans/pln_01kx6ect05hj81tk76pmx423zb`
- Appraise URL: `appraise://plans/pln_01kx6ect05hj81tk76pmx423zb`
- Final plan hash: `sha256:3cd838937d70a733928d5949ef11fc369a3f2dac990983008cf30cdf234dd4d3`
- Final validation hash: `sha256:35c03dae7a691462f987a5e3b8aef68ec1f7e603db7c13cb9c560d029470cc2b`
- Completion evidence hash: `sha256:348b7df612affb68680d43de58ecf64443b8d249e5626f676a0aad3eaec483df`

### Final Product And Verification

- Final target commit: `a19b5c0b3583d9a268949aa5a7370fc7b5c92c8d`
- All five Appraise tasks reached `verified`.
- Unit/component verification: 11/11 tests passed.
- Typecheck, ESLint, production Vite build, and React Doctor passed.
- React Doctor improved from 71/100 to 100/100 during implementation.
- Passing implementation validation ID:
  `implementation-validation-complete-the-meditation-breathing-exercise-accessibly-chromium-local-20260710194441`
- Passing TestRun: `62a59be3-034c-4d18-8c5c-717c14d11c5b`
- Managed evidence: full assurance, valid evidence health, one expected case, one feature, one matched scenario, and
  2/2 Cucumber steps passed.
- The lifecycle reached `validation_passed` and completion review reported `ready: true` with no blockers, optional
  failures, or remarks.

### Appraise Registration Behavior

Appraise successfully registered explicitly published Appraise validation artifacts:

- one projected module;
- one test suite;
- one test case;
- one Gherkin feature;
- one custom TypeScript step file;
- the required browser/environment matrix.

Appraise then selected and executed that registered scenario in baseline and implementation validation. It did not
automatically discover or register the target's Vitest/component tests. Those tests were task-verification evidence,
not Appraise test entities. This boundary is acceptable if the UI and agent contract explain it clearly.

## What Worked

1. `project_diagnostic` verified reachability, authentication, identity, and contract compatibility.
2. `project_add` registered an empty external workspace and wrote its continuity marker.
3. The supported `plan_create` fallback produced a fully covered plan after natural-language planning failed.
4. Exact revision approval worked through the Appraise browser UI.
5. Validation draft authoring, projection, review, approval, and event sequencing worked once artifacts were valid.
6. Invalid baseline evidence was not falsely accepted as passing evidence.
7. Valid pre-implementation failure evidence could be acknowledged and accepted as a baseline.
8. Appraise enforced implementation groups, dependencies, runnable tasks, and separate implemented/verified states.
9. Coordinator interruption could recover safely after lease expiry without takeover.
10. Managed implementation validation bound a real TestRun and, after association repair, produced full-assurance
    evidence.
11. Completion review aggregated verified tasks, commits, validations, evidence links, and readiness.

## Defects And Root Causes

### P0: Dev-Server Bundling Corrupts Cucumber Binary Resolution

`src/lib/executor/local-executor-adapter.ts` uses `createRequire(import.meta.url)` in server code. Under Turbopack the
resolved CLI path contained literal `[project]`; under Webpack/RSC it contained literal `(rsc)`. Runtime preflight
reported the correct physical binary, but execution used the compiled virtual path and failed before producing a
report.

Temporary audit repair: resolve the Appraise-owned binary from a stable hub/package root. This repair was reverted
after the run.

### P0: Canonical Identifier Tags And Lookup Use Different Name Formats

Projection created canonical identifier tag names such as `@ts_meditation-breathing-workflows`.
`getIdentifierTagByPrefix(tags, 'ts_')` checked `Tag.name.startsWith('ts_')`, ignored the canonical tag, created or
selected a legacy hashed suite tag, and launched Cucumber with an expression absent from the generated feature. The
managed process exited zero with zero scenarios, correctly yielding `invalid_empty_run`.

Temporary audit repair: normalize one optional leading `@` during identifier lookup. This repair was reverted after
the run.

### P0: Standalone Plan-Bound Runs Do Not Create Expected Test-Case Rows

`createStandaloneTargetTestRun` creates the TestRun and schedules execution with `testRunTestCases: []`, even when
`planId`, `validationId`, `implementationValidationRunId`, and exact `@tc_...` expressions are present. The scenario
can execute and report, but evidence finalization returns `invalid_missing_test_cases` and scenario events cannot
update a matching TestRunTestCase.

Temporary audit repair: resolve exact case identifiers to canonical projected cases/suites, create TestRunTestCase
rows atomically, and schedule with those links. This repair was reverted after the run.

### P0: Runtime Preflight Does Not Execute The Real Runtime Contract

Preflight passed before each of these deterministic failures:

- compiled virtual Cucumber binary path;
- missing target `ts-node/esm` resolution;
- duplicate hub/target Cucumber instances;
- tag expression selecting zero scenarios;
- references-only target `tsconfig.json` rejecting top-level await;
- missing TestRunTestCase associations.

Preflight currently proves pieces of configuration, not the exact binary/cwd/config/import/tag/association packet that
the managed runner will use.

### P1: Natural-Language Planning Misclassifies Ordinary Vocabulary

`planning_session_create` first returned an under-scoped plan with uncovered accessibility. A retry interpreted the
word `task` as evidence for a todo application and produced todo CRUD work for a meditation brief. The supported
`plan_create` fallback was required to obtain the correct five-task plan. Requirement coverage caught the omission,
but domain selection remained too sensitive to incidental vocabulary.

### P1: Delegated Authorization Is Not Portable

A context-isolated subagent could run diagnostics and register the target, but plan creation was rejected twice
because the risk layer did not trust authorization relayed by the coordinator. The run had to replace the worker with
one inheriting the entire user turn. This is brittle and token-expensive.

The system needs a narrow, signed/delegable authorization receipt containing action class, target fingerprint, brief
hash, issuer, and expiry. It must not require copying an entire conversation into every worker.

### P1: Validation Context Filtering Can Fail And The Fallback Is Excessive

A filtered `validation_context_read` caused `Cannot read properties of undefined (reading 'filter')` when an unknown
or unavailable resource type was requested. The MCP result reduced this to generic `Coordinator API failed`. The
unfiltered retry returned a large cross-project context. Exact template searches then returned zero for common
navigation/input/click intents even though related steps appeared in the broad context.

### P1: Validation Publish Can Change Content Without Updating Review Evidence Coherently

Publish rewrote the feature into canonical projection, changed its content hash, and retained the old declared patch.
The response did not expose one obvious top-level validation review hash or cursor. Reviewers can therefore see a
hash, patch, and physical file that refer to different moments unless they manually inspect the final artifact.

### P1: Baseline Repair Hides Historical Attempts

`baseline_retry` returned preserved failed attempts, but the supported draft-check/publish recovery produced a new
validation artifact with `baselineAttempts: []`. The durable TestRuns remained readable independently while the plan
UI said no baseline attempts had been submitted. Repeating repair repeatedly erased the plan-visible history.

### P1: Reconciliation Ordering Can Mislabel A Passing Run

A full-assurance passing managed run initially produced `failed_validation` because the validation task was still
`implemented`. Reconciliation of the same run after task verification produced `validation_passed`. Evidence result
and task readiness should be stored independently and resolved atomically, rather than emitting a misleading failure
for ordering alone.

### P1: Completion Surfaces And Hash Contracts Contradict Readiness

The completion review returned `ready: true`, five verified tasks, a full-assurance passing run, and three hashes. The
browser URL with `?review=implementation` rendered the original plan graph/revision approval panel and no completion
control. Native completion then:

1. rejected the plan hash and required the evidence hash without naming that distinction in the argument;
2. rejected an otherwise lowercase kebab-like reviewer ID without exposing the exact ID grammar;
3. rejected the evidence-hash retry with `Passing validations are required before completion`, contradicting the
   immediately preceding readiness result and `validation_passed` lifecycle.

The audit therefore reached completion readiness but could not durably write `completed` through the exposed UI or
native action.

### P1: Historical Event Acknowledgement Can Saturate The Server

After restart, the worker attempted to acknowledge sequences 43-72 in parallel. The batch did not return after about
70 seconds, subsequent coordinator registration and event reads stalled, and Appraise required a restart. The event
contract exposes one acknowledgement per event but no bounded cumulative acknowledgement or server-side concurrency
guard.

### P2: Commit Evidence Is Order-Dependent

Attaching a commit hash after a task reached `verified` was rejected as an illegal `verified -> verified` transition.
Evidence enrichment should be idempotent and independent from status transition when the status does not change.

### P2: Implementation Group Checkpoints Are Redundant

The agent had to call `before_group` before approval and again immediately after group approval. No state changed that
made the duplicate checkpoint informative. Group approval should satisfy or advance the initial checkpoint.

### P2: UI Actions Can Appear To Do Nothing

Validation review submission and baseline acknowledgement sometimes required a second click. Server logs confirmed
idempotent duplicate acknowledgement actions, but the UI did not disable the control, show pending state reliably, or
reflect acknowledgement after refresh.

### P2: Empty Targets Need Deterministic Validation Runtime Preparation

The empty target required the agent to add and install pinned Cucumber, Playwright, `ts-node`, and TypeScript packages
as reviewed test infrastructure. Sandbox network attempts hung silently before an approved network retry completed.
Appraise should either supply the runtime from the hub without duplicate-instance hazards or return one deterministic
target bootstrap packet before review.

## Efficiency And Token Observations

- Baseline start/reconcile and validation publish repeatedly returned the full plan, full validation, file patches,
  attempts, and next-action data when only a transition delta was new.
- Repairing infrastructure required repeated approval of unchanged validation nodes and unchanged large lockfile
  evidence.
- Missing diagnostics forced source, database, physical file, generated config, and manual command inspection.
- Mechanical event acknowledgement, duplicate group checkpoints, and repeated review submission created many agent/UI
  round trips.
- The completion response contained all historical validation runs and paths even when only readiness, latest passing
  evidence, blockers, evidence hash, and next action were required.
- A 30-event backlog encouraged parallel acknowledgement and saturated the server.
- `invalid_missing_report` was returned while runs were still executing, making a transient state look like completed
  invalid evidence.
- The broad validation context and repeated unchanged patches are especially expensive because their content is
  stable and compressible by reference/hash.

## Product Additions Worth Building

### Coordination Timeline

Add a compact plan timeline that shows actor, phase, event, task/run ID, evidence health, and next owner. Collapse
retries by root-cause signature while preserving expandable history. This makes it possible to answer “is Appraise
coordinating the agent?” without reading raw event payloads.

### Agent Test Inventory

Separate three categories explicitly:

1. Appraise registered tests: canonical module/suite/case/step entities.
2. Appraise managed runs: TestRuns bound to registered cases and lifecycle validations.
3. Agent verification commands: Vitest, lint, typecheck, build, and quality tools recorded as task evidence.

Provide an opt-in importer that can register supported agent test manifests, but do not imply automatic discovery
when only command evidence was recorded.

### Simple Happy-Path Validation Mode

Offer a bounded authoring mode for coordination smoke tests: one required scenario, ordinary real-time waits, one
browser/environment, standard accessibility assertions, and minimal custom code. This should test lifecycle
coordination without turning the audit into a sophisticated timing-framework exercise.

### Executable Preflight Receipt

Return a hash-bound receipt for the exact command packet: binary, cwd, config, feature/import/support paths, resolved
package identities, tag expression, expected scenario/case IDs, and report destination. Baseline and implementation
execution must consume the same receipt or report drift.

## Implementation Plan

### Phase 1: Restore Runtime And Evidence Integrity

#### Task 1: Stabilize Appraise-Owned Binary Resolution

**Description:** Resolve the Cucumber CLI from an explicit, stable Appraise runtime root that survives Next.js
Webpack/RSC and Turbopack compilation.

**Acceptance criteria:**

- The physical CLI path never contains framework virtual segments such as `[project]` or `(rsc)`.
- Preflight and execution use the same resolved path.
- The same tests pass under Webpack dev, Turbopack dev, and production build execution.

**Verification:** focused executor unit tests plus a server-action/runtime integration test that spawns the CLI.

#### Task 2: Canonicalize Identifier Tags End To End

**Description:** Define one canonical storage and lookup representation for `ts_` and `tc_` tags and migrate or
ignore compatible legacy duplicates deterministically.

**Acceptance criteria:**

- Projection, database rows, feature text, TestRun selection, and report matching use the same identifiers.
- A projected one-case suite selects exactly one scenario.
- Existing names with or without a leading `@` resolve compatibly during migration.

**Verification:** tag-filter tests, projection tests, TestRun selection tests, and a generated-feature selection test.

#### Task 3: Create Expected Rows For Standalone Plan-Bound Runs

**Description:** When exact plan/validation identifiers are supplied, atomically resolve and create canonical
TestRunTestCase/TestSuite associations before execution.

**Acceptance criteria:**

- Bound runs contain all and only expected cases before spawning.
- Scenario events update the matching rows.
- Valid reports cannot fail solely because expected rows were omitted by the service.
- Unknown, duplicate, or ambiguous identifiers fail preflight before TestRun creation.

**Verification:** extend standalone TestRun service tests and managed implementation-validation E2E coverage.

### Checkpoint: Runtime Integrity

- A fresh target executes one projected scenario with one expected/matched TestRunTestCase.
- No temporary source patch or manual database mutation is required.
- Evidence health is derived from the same canonical identifiers used to launch the run.

### Phase 2: Make Preflight Predictive

#### Task 4: Execute The Exact Runtime Packet During Preflight

Validate binary existence, package identity, config load, loader/compiler compatibility, step imports, tag selection,
expected case rows, writable report destination, and expected scenario count using the exact cwd and paths that
execution will consume.

Preflight must fail before review/baseline for every deterministic failure observed in this audit.

#### Task 5: Add Bounded Runtime Diagnostics

Persist and expose a sanitized, bounded command receipt containing resolved identifiers and paths. Add stable blocker
codes for binary resolution, loader resolution, duplicate Cucumber instances, zero selection, missing expected rows,
and compiler incompatibility. Never reduce these to generic `Coordinator API failed`.

### Phase 3: Repair Planning And Validation Authoring

#### Task 6: Harden Domain Classification And Requirement Coverage

Add the meditation brief as a regression fixture. Incidental words such as `task`, `notes`, or `timer` must not
override the dominant product domain. Accessibility, persistence, controls, configuration, and validation constraints
must remain covered in the first review-ready plan or return a bounded coverage-review result.

#### Task 7: Fix Filtered Resource Context And Reuse Ranking

Validate resource-type inputs, return structured unknown-type errors, scope results to the current project/plan by
default, and ensure common template capabilities found in context are also returned by semantic search/match.

#### Task 8: Bind Publish Patches To Canonical Post-Projection Content

Generate the review patch from the final canonical projection, expose one review content hash and event cursor at the
top level, and reject stale declared patches. A reviewer must never approve a hash and patch from different states.

### Checkpoint: Planning And Authoring

- The meditation brief creates the correct domain plan on the first call.
- Filtered context is bounded and common reusable steps are discoverable.
- Validation review displays exact post-projection files and hashes.

### Phase 4: Preserve Recovery And Coordination State

#### Task 9: Preserve Baseline Attempt History Across Repair

Make validation republish retain immutable attempt summaries and TestRun links, while resetting only decisions and
content-bound readiness that are actually stale. UI history must match durable TestRun history.

#### Task 10: Add Cumulative Event Acknowledgement

Add an idempotent `acknowledgeThroughSequence` operation with transaction/lease checks and a small response. Cap or
serialize concurrent per-event acknowledgements so a client cannot saturate the server.

#### Task 11: Remove Mechanical Duplicate Transitions

- Let group approval satisfy the initial `before_group` checkpoint.
- Permit idempotent commit evidence attachment without a status change.
- Reconcile task readiness and validation evidence atomically.
- Model active/running TestRuns separately from completed invalid evidence.

### Phase 5: Make Completion Trustworthy

#### Task 12: Unify Completion Readiness And Completion Mutation

Use one service-level readiness evaluator for review and completion. If review returns ready for an evidence hash,
completion with that hash must succeed unless a newer event changes state. Return an explicit stale-evidence error in
that case.

#### Task 13: Fix Completion UI Routing And Hash Labels

Render the completion panel for the returned implementation-review URL. Label and type plan hash, validation hash,
and completion evidence hash separately. Return the exact `approvedBy` grammar in tool schema/errors and disable the
action while submitting.

### Phase 6: Reduce Token And Latency Cost

#### Task 14: Default Lifecycle Responses To Delta/Evidence Modes

Default to compact responses containing IDs, phase/lifecycle, changed fields, blockers, links, cursor, evidence
summary, and next action. Full plans, artifacts, patches, historical runs, and rendered duplicate messages must be
opt-in.

#### Task 15: Deduplicate Review And Retry Payloads

Reference unchanged files by path/hash, return patches only when content changes, collapse historical failures by
signature, and let reviewers reapprove an unchanged artifact through a single hash-bound decision rather than
replaying every file.

### Phase 7: Productize The Fast Coordination Path

#### Task 16: Add Narrow Delegated Authorization Receipts

**Description:** Let a user-authorized coordinator delegate a bounded planning or execution action to a subagent
without copying the complete conversation into the worker context or asking the user to repeat approval.

Define a short-lived receipt containing:

- permitted action class;
- target project fingerprint and canonical path;
- normalized brief or plan content hash;
- issuing user/coordinator identity;
- issued/expiry timestamps;
- optional maximum lifecycle phase;
- nonce and single-use or bounded-reuse semantics.

**Acceptance criteria:**

- A context-isolated subagent can create the authorized plan for the exact target and brief.
- The receipt cannot authorize a different target, materially different brief, later lifecycle phase, or expired
  action.
- Denials identify the mismatched receipt field without requiring full transcript replay.
- Receipt payloads exclude conversation text, secrets, and unrelated user context.

**Verification:**

- Risk/authorization tests for valid delegation, target mismatch, brief mismatch, phase escalation, expiry, replay,
  and tampering.
- MCP E2E test where the root agent delegates planning to a context-isolated worker using only the receipt.

**Dependencies:** Task 6.

#### Task 17: Bootstrap Empty-Target Runtime Deterministically

**Description:** Before validation review, produce and execute one deterministic runtime-preparation packet for an
empty target. Prefer an Appraise-owned runtime that does not require duplicate target Cucumber installations. When
target dependencies are necessary, declare exact packages, versions, files, commands, expected outputs, and network
requirements once.

**Acceptance criteria:**

- Empty-target preflight identifies every required binary, loader, compiler option, browser, and support package in
  one response.
- Managed execution cannot load two physical Cucumber instances.
- Dependency installation has bounded inactivity and total timeouts, emits progress, and returns a structured
  `network_access_required` or package-manager blocker instead of hanging silently.
- Retrying after network approval resumes the same preparation receipt instead of rebuilding validation state.
- Generated package and lockfile evidence is reviewed once and reused by hash while unchanged.

**Verification:**

- Empty-directory integration test with network disabled, then enabled.
- Timeout test proving a silent package-manager process is cancelled with actionable recovery.
- Runtime identity test proving CLI and support code use one Cucumber package instance.
- Fresh-target baseline and implementation validation both consume the same preparation receipt.

**Dependencies:** Tasks 1 and 4.

#### Task 18: Implement Simple Happy-Path Validation Mode

**Description:** Add an explicit validation-authoring mode for coordination smoke tests. It should favor one required
scenario, one browser/environment, ordinary bounded real-time waits, existing reusable steps, and minimal custom
code. Advanced clock control, multi-browser matrices, performance profiling, and exhaustive edge cases remain opt-in.

**Acceptance criteria:**

- The mode can validate a small browser application without Playwright clock APIs or custom timer infrastructure.
- The generated validation covers one primary product outcome plus essential accessibility and persistence behavior.
- The authoring response explains excluded advanced coverage and offers an explicit upgrade path.
- Simple mode creates no more than one custom step file unless preflight proves reusable steps are insufficient.
- The same exact validation runs for baseline and implementation evidence.

**Verification:**

- Meditation-app fixture using 1-second phases and bounded ordinary waits.
- Todo and static-content fixtures proving the mode is domain-independent.
- Regression test that advanced timing or matrix behavior is added only when explicitly requested.

**Dependencies:** Tasks 4, 7, and 8.

#### Task 19: Enforce Coordination Time And Operation SLOs

**Description:** Treat elapsed time, active tool operations, retries, approval cycles, response bytes, and idle waiting
as release-level product metrics. A technically successful run that exceeds the small-app budget must fail the
coordination acceptance test.

**Acceptance criteria:**

- Each lifecycle phase emits monotonic start/end timing and active-versus-human-wait duration.
- The release test distinguishes product execution, infrastructure recovery, network installation, human review, and
  idle standby time.
- Exceeding a phase or end-to-end service-level objective fails CI with the slowest operations and repeated payloads
  identified.
- Human review time is reported separately and does not hide excessive agent/Appraise processing time.
- At most one automatic retry per phase is allowed in the release fixture; further retries fail with the root-cause
  signature.

**Verification:**

- Instrumented coordination fixture with deterministic local timing thresholds.
- Synthetic slow preflight, event acknowledgement, package install, review submission, and reconciliation tests.
- CI report containing total duration, per-phase duration, tool-call count, retries, approval cycles, and response
  bytes.

**Dependencies:** Tasks 10, 14, 15, 17, and 18.

## Release Acceptance Test

Add one automated external-workspace coordination test using a small browser app and a context-inheriting subagent or
equivalent coordinator client.

The release test must prove:

1. brief registration and correct first-pass plan coverage;
2. exact UI/API plan approval;
3. compact validation authoring and exact review;
4. predictive preflight;
5. valid baseline evidence with preserved attempt history;
6. implementation groups and five or fewer task transitions;
7. automatic creation of expected TestRunTestCase rows;
8. one full-assurance managed passing implementation run;
9. completion review and completion mutation succeed for the same evidence hash;
10. no server restart, source patch, manual database edit, raw JSON-RPC fallback, or repeated unchanged approval is
    required;
11. response-size and operation-count budgets are asserted.

Suggested budgets for this small fixture:

- one diagnostic and one planning call before review;
- one plan approval cycle;
- one validation approval cycle;
- at most one expected baseline run and one managed implementation run;
- no more than one automatic retry in any lifecycle phase;
- no full artifact repeated after the first handoff;
- unchanged wait/ack responses below 2 KB;
- summary lifecycle responses below 8 KB;
- cumulative event acknowledgement completes within 2 seconds locally.

Elapsed-time service-level objectives, excluding time when a human review gate is genuinely waiting for input:

| Phase                                        | Target | Hard release-test ceiling |
| -------------------------------------------- | -----: | ------------------------: |
| Diagnostic, registration, and planning       |  2 min |                     5 min |
| Validation preparation and runtime preflight |  5 min |                    10 min |
| Baseline execution and reconciliation        |  3 min |                     5 min |
| Agent implementation for the small fixture   | 20 min |                    30 min |
| Managed implementation validation            |  5 min |                    10 min |
| Completion review and mutation               |  1 min |                     3 min |
| End to end, excluding human review           | 36 min |                    45 min |

The fixture must also report human review time separately. A long human review may extend wall-clock duration but
must not consume repeated agent tokens or restart lifecycle operations while the event cursor is unchanged.

## Priorities And Dependencies

1. P0 Tasks 1-4 and 17: runtime, evidence integrity, and deterministic empty-target bootstrap.
2. P1 Tasks 6-10 and 16: correct planning, delegated authorization, exact review, and durable recovery.
3. P1 Tasks 12-13: completion consistency.
4. P1 Tasks 18-19: simple validation and enforceable coordination-time SLOs.
5. P2 Tasks 11, 14, and 15: round-trip and token efficiency.

Tasks 1-4 are sequential foundations. Tasks 6-8 and Tasks 9-11 can proceed in parallel after runtime contracts are
fixed. Task 17 starts after binary/preflight foundations; Task 18 starts after preflight and authoring contracts;
Task 19 closes the release gate after the runtime, response, and simple-validation work. Completion and
response-shaping work can proceed in parallel once the shared readiness/event contracts are stable.

## Definition Of Done

- Every temporary audit repair has a permanent tested replacement.
- The meditation coordination fixture completes from empty target to `completed` without maintainer intervention.
- Appraise visibly distinguishes registered tests, managed runs, and agent command evidence.
- Preflight catches all deterministic runtime failures from this audit.
- Attempt history and event state survive repair and coordinator restart.
- Completion review and mutation share one evidence-hash contract.
- A context-isolated worker can act through a narrow delegated authorization receipt without inheriting the full
  conversation.
- Empty-target dependency preparation fails fast on missing network access and never hangs silently.
- Simple happy-path validation completes without advanced clock control or unnecessary custom test infrastructure.
- The small-app release fixture completes in 45 minutes or less of non-human processing time and meets every
  per-phase ceiling.
- Compact response budgets and event acknowledgement latency are enforced in tests.
- Current lifecycle, runtime, MCP, and agent docs are updated in the same change set.
