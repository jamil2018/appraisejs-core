# Todo Plan Builder Coverage Retry, Validation Compile Atomicity, and Token Efficiency

## Status

Proposed from a live happy-path audit on 2026-07-13. The run reached exact plan approval and exact Validation AST
preview approval, but could not reach validation review, baseline, implementation, or completion because the supported
validation compile path left the plan in an inconsistent partial state.

## Audit Scope and Evidence

The audit started the root AppraiseJS web app and MCP sidecar, delegated a simple todo-app brief to an isolated agent
workspace, and used only native Appraise lifecycle tools plus the real browser review UI.

- Target workspace: `/private/tmp/appraise-todo-happy-20260713-Ycnbnu`
- Plan: `pln_01kxdgrhsp8z6wssqdya4vyjzx`
- Plan review URL: `http://127.0.0.1:3000/plans/pln_01kxdgrhsp8z6wssqdya4vyjzx`
- Validation review URL:
  `http://127.0.0.1:3000/plans/pln_01kxdgrhsp8z6wssqdya4vyjzx?review=validation`
- Approved plan content hash: `sha256:b66524e6981cc7f1f24b8e23ebb481a2a5231efc38f8fb3224f085efa6252388`
- Approved validation preview receipt:
  `sha256:a8ef31f5d092fb580b94775b4d191ea04f4e8aaf912c14de16d8323bc34c20cb`
- Preview hash: `sha256:46a6702d2feb9357ca76c35f76617e6ac62c69b0b589b30f13908f44c1fe4d1e`
- Projection hash: `sha256:71dae95a4248400bd7e4771ec99bbf4d84cdb69a60d840f1f583e6fadf4d6778`
- Runtime input hash: `sha256:02a3c2be6e112e13382ccdecca807088a8a09b870125d68fd40a0bb2ad0752ba`

The plan was approved through the browser UI. The UI reported `plan approved`, displayed the exact approved revision,
and produced no console errors. The Validation AST check and preview were valid and covered one local Chromium happy
path with 12 steps: accessible input, add, visibility, completion toggle, Completed and All filtering, reload
persistence, and deletion.

The exact compile failed twice with:

> Validation projection conflicts with existing LocatorGroup "apr-96ee8f9af20fe163d93936b6".

After the failure, `plan_read` and the browser displayed `awaiting_validation_review`, but no
`validation_review_ready` event existed and the UI said `No validation artifact has been published for this plan
revision.` No approval or supported repair action was available. The audit stopped at that real lifecycle blocker
rather than bypassing Appraise-owned validation review.

## Defects

### P0: Failed Validation AST compile publishes a split-brain lifecycle

`compileValidationAstForPlan` prepares plan artifact content with lifecycle `awaiting_validation_review` before the
canonical projection succeeds. The publish orchestrator writes plan, validation, and review artifacts in its
`prepared` phase, then projects canonical entities. A projection conflict therefore leaves the filesystem plan
artifact advanced even though the database projection, state hash, and event stream remain at validation preparation.

Consequences:

- `plan_read`, review loops, artifact-backed UI, and database/event consumers disagree about lifecycle.
- `validation_review_loop` recommends indefinite standby despite the absence of a review-ready event.
- The browser advertises validation review while showing no published artifact or approval control.
- Retrying the exact receipt repeats the conflict and supplies no supported repair path.

### P0: Fresh-target locator proposal is incompatible with canonical AST projection

The supported flow creates target-bound locator groups and locators through `validation_resources_propose`. The AST
compiler then attempts to project referenced groups under its generated validation module. Canonical projection
rejects the already-existing locator group because its `moduleId` differs. The AST schema has no supported binding
that tells the compiler to reuse the proposed target module/group ownership.

This makes the documented propose -> check -> preview -> compile path structurally fail for a fresh target whenever a
validation uses locators.

### P1: Coverage retry cannot change generated tasks

The first `planning_session_create` candidate omitted filtering and responsive requirements, under-covered
accessibility, and invented editing behavior not requested by the brief. The supported retry supplied
`previousCandidateHash`, explicit omission resolutions, and additional plan context, but task synthesis reran solely
from the original brief. It returned the same task shape and uncovered IDs. The candidate hash changed only because
the added context changed the description, which also bypassed the unchanged-candidate guard.

This can trap agents in an infinite `coverage_review_required` loop. The only successful continuation in the audit
was the documented `plan_create` fallback with a manually structured, coverage-complete plan.

### P1: Locator tools return IDs that the AST validator rejects

`validation_resources_propose` and `locator_search` return raw stable IDs such as `apr-...` and instruct the agent to
use the returned stable IDs. Validation AST locator bindings require graph references prefixed with `locator_`.
Neither response exposes an AST-ready `locatorRef`, so an otherwise reasonable submission fails with
`locator-reference-not-found` until the agent reverse-engineers the graph representation.

### P1: Scoped context and contract discovery are incomplete

- A scoped `validation_context_read` request for plan, target project, and environments returned only the generic
  message `Coordinator API failed` instead of a structured actionable error.
- The unscoped response included unrelated global resources and duplicated tasks under both `tasks` and
  `projectedTasks`.
- The managed Validation AST MCP resource returned only `{version, phases}` and omitted the schema or a discoverable
  schema link. The agent had to inspect repository source to understand the contract, which defeats self-describing
  MCP onboarding.

### P2: Review state is derived from lifecycle instead of durable readiness

The native validation review loop treated artifact lifecycle text as sufficient evidence of pending review even when
there was no `validation_review_ready` event, no validation artifact, and no review control. Review readiness must be
event- and receipt-backed, not inferred from one projection.

## Token and Flow Inefficiencies

The run repeatedly paid for the same information:

- `project_diagnostic` returned a large capability catalog with duplicated validation tool names.
- `coverage_review_required` repeated the full candidate plan and the full requirement assessment on every retry.
- `plan_create` echoed the complete submitted plan plus hub and target metadata when only identity, hashes, links,
  warnings, and next action were needed.
- `plan_review_loop` duplicated URLs and hashes across top-level fields, handoff markdown, standby presentation,
  links, and events.
- Unscoped validation context returned unrelated system resources and duplicated task collections.
- Validation preview repeated the full canonical projection and embedded a large escaped `runtimeInputJson`, even
  though human review needed a concise scenario/resource diff plus content-addressed links or optional detail calls.
- The eventless partial compile state directed the agent into indefinite long polling rather than returning a compact
  terminal repair response.

The common cause is the absence of response profiles. Tools optimize for carrying every possible handoff field in one
response, even when the same values are already content-addressed or were returned in the preceding call.

## Fix Plan

### Phase 1: Restore compile atomicity and recovery

1. Keep the authoritative plan lifecycle at `preparing_validations` until artifacts are written, canonical projection
   succeeds, ownership is verified, and the review-ready event can be committed.
2. Do not serialize `awaiting_validation_review` into the plan artifact during the `prepared` phase. Advance all
   lifecycle projections only in the final review-ready transition.
3. If filesystem journaling must precede database projection, write a non-authoritative prepared artifact or retain
   the old lifecycle, then finalize it after projection with a hash-bound compare-and-write.
4. Add a recovery state and native action for failed operations, returning operation ID, failed phase, blocker details,
   safe retry eligibility, and the exact repair action.
5. Make `plan_read`, UI badges, and review loops use one authoritative lifecycle snapshot and explicitly report
   projection drift instead of selecting whichever store is furthest ahead.
6. Require `validation_review_ready` event and exact publication receipt before review standby or approval controls
   become available.

Acceptance evidence:

- Inject a projection conflict after artifact preparation and prove plan lifecycle, state hash, and event sequence do
  not advance.
- Retry the same receipt after repair and prove one publication operation and one review-ready event result.
- Browser test confirms a failed compile displays a repairable preparation error, not an empty validation review.

### Phase 2: Make proposed resources compilable by construction

1. Define whether AST compilation reuses proposed module/group/locator entities or creates plan-owned projection
   entities. Encode that ownership rule in one canonical contract.
2. Add explicit module and locator-group bindings to the AST/context when reuse is intended.
3. Return both persistent IDs and AST-ready references from resource proposal/search, for example
   `{id, astRef, version, moduleId, groupId}`.
4. Validate module/group ownership compatibility during `validation_ast_check`, before preview approval.
5. Make preview show whether every resource will be reused, created, or rejected.

Acceptance evidence:

- Fresh target -> propose resources -> check -> preview -> compile succeeds with locator-bearing steps.
- Existing compatible resources are reused idempotently.
- Incompatible ownership fails at check with a structured repair recommendation, never after exact preview approval.

### Phase 3: Make coverage retry actually revise the candidate

1. Feed normalized `retryFeedback.addressed`, unresolved requirement IDs, deferrals, and plan context into task
   synthesis rather than only description construction.
2. Preserve a stable `taskShapeHash` separate from descriptive/context hashes so appended prose cannot bypass the
   unchanged-candidate guard.
3. Remove unrequested generic CRUD behaviors unless they are explicit requirements or clearly labeled review
   suggestions.
4. Add a deterministic repair pass that maps every uncovered requirement to an existing or new task and returns a
   compact task diff.
5. Cap retries and offer a structured edit/fallback action with the remaining omissions rather than an infinite loop.

Acceptance evidence:

- The audited todo brief produces filtering, responsive, accessibility, persistence, add, toggle, and delete coverage
  without inventing edit behavior.
- A retry changes task coverage, keeps resolved requirements resolved, and reports only the diff.
- An unchanged retry is rejected even when only plan context or description text changed.

### Phase 4: Introduce compact, progressive MCP responses

1. Add response profiles such as `compact`, `handoff`, and `debug`, defaulting normal agent loops to `compact`.
2. Return immutable payloads once with hashes and provide detail resources/tools for candidate plans, assessments,
   context, canonical projections, and runtime inputs.
3. Use delta responses for retries and unchanged waits: new events, changed requirements, cursor, elapsed time, and
   next action only.
4. Deduplicate capability catalogs, task collections, URLs, hashes, and presentation wrappers before serialization.
5. Return structured coordinator errors with code, phase, blocker type, retryability, and recommended action.
6. Add response byte/token budgets to MCP contract tests and coordination SLO reporting.

Suggested initial budgets:

- Unchanged wait: at most 1 KiB.
- Diagnostic success: at most 4 KiB unless `debug` is requested.
- Coverage retry: at most 6 KiB plus an optional content-addressed detail resource.
- Preview summary: at most 8 KiB; canonical projection and runtime JSON retrieved separately.

### Phase 5: Self-describing workflow and user-facing robustness

1. Publish the complete versioned Validation AST JSON Schema through an MCP resource and link it from the agent guide,
   check errors, and preview response.
2. Add a lifecycle integrity panel to plan review showing artifact, database projection, publish journal, and event
   agreement. Hide approval while integrity is not green.
3. Add a resumable operation card for failed validation publication with safe retry/repair guidance.
4. Add a plan-builder coverage matrix in the UI so users can see explicit requirements, inferred suggestions,
   deferrals, and task mappings before publication.
5. Add an agent trace view that collapses repeated payloads and measures bytes/tokens by lifecycle phase, separating
   active agent time from human review time.
6. Add an end-to-end synthetic project command that exercises fresh-target planning, exact review, managed validation,
   baseline, implementation, final validation, and completion with fault injection at each journal phase.

## Validation Matrix

- Unit: requirement extraction, task-shape hashing, retry synthesis, response compaction, locator reference mapping.
- Service integration: resource proposal through AST compile; ownership conflicts; journal phase recovery; event
  uniqueness; state-hash consistency.
- MCP contract: compact/default/debug response shapes, actionable errors, schema resource completeness, cursor deltas.
- Browser: plan approval, failed compile recovery UI, validation review visibility, approval control gating.
- Full lifecycle E2E: isolated fresh todo workspace through final completion with Appraise-managed TestRun evidence.
- Regression: scaffold sync via `npm --prefix packages/create-appraisejs run prepare-template`, focused lint/format/tests,
  `npm run validate`, build, harness checks, and Graphify auto-update for touched committed scopes.

## Recommended Delivery Order

Ship Phases 1 and 2 together as the release blocker: they restore lifecycle integrity and make the supported managed
validation path executable. Phase 3 restores the plan builder's advertised retry behavior. Phase 4 should follow
before broad agent adoption because repeated payloads dominate the flow's token cost. Phase 5 can then add operator
visibility and preventive tooling on top of consistent lifecycle state.
