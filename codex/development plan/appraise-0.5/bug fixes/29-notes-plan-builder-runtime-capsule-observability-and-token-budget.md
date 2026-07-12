# Notes Plan Builder Runtime Capsule, Observability, And Token Budget

## Summary

Fix the defects found during a live 2026-07-12 happy-path evaluation of the AppraiseJS plan builder. The run used a
subagent, native MCP lifecycle tools, and the real browser review UI. It reached exact plan approval, validation
publication and approval, and managed baseline execution. It could not legally continue because validation preflight
approved one Appraise-owned Cucumber binary while baseline launched a different path containing the literal
`[project]` placeholder.

No baseline was accepted and no product implementation, final validation, completion review, or sign-off was
fabricated. The target remains at the Appraise-owned `validation_changes_requested` recovery gate.

## Audit Evidence

- Target workspace: `/tmp/appraise-simple-notes-e2e`
- Plan: `pln_01kxbcbrrpyffqpgeqstc36vqs`
- Plan revision: 1
- Plan hash: `sha256:b30709ce74e9a446a945753950353a6c1dbdf7f8bfc50c97cc52ba7d511d6578`
- Validation hash: `sha256:40c7851b26e5422d2f02dd2a1ec48020df1cfcdace5e9d24e766afcae8fe8164`
- Plan and validation decisions: approved through the live Appraise browser UI
- Baseline TestRun: `75bad261-4391-417f-8066-f4d21ad6a222`
- Preflight binary: `/Users/jamil/Personal Projects/appraisejs/node_modules/@cucumber/cucumber/bin/cucumber.js`
- Launched binary: `/Users/jamil/Personal Projects/appraisejs/[project]/node_modules/@cucumber/cucumber/bin/cucumber.js`
- Terminal process error: `MODULE_NOT_FOUND`
- Evidence API inconsistency: the UI logs route read the run, while `test_run_read` and `test_run_diagnose` returned
  404 for the same ID

## Findings

### P0: Preflight And Baseline Do Not Consume The Same Runtime Capsule

Validation review displayed a passing preflight for the real Appraise-owned Cucumber binary. The managed baseline
then launched a path with an unresolved `[project]` segment. A preflight receipt is therefore not proof of the exact
command baseline will execute.

### P0: Baseline Failure Recovery Returns Contradictory Actions

The first `baseline_reconcile` changed lifecycle to `validation_changes_requested` but recommended another
`baseline_reconcile`. The next call failed because the plan was no longer running baselines. Recovery must return one
legal next action derived after the lifecycle transition.

### P0: Managed TestRun Identity Is Inconsistent Across Surfaces

The plan UI and logs route recognized TestRun `75bad261-4391-417f-8066-f4d21ad6a222`, but MCP read and diagnosis
returned 404. Lifecycle tools, evidence services, UI routes, reports, and logs must share one canonical identity.

### P1: Validation Publication Errors Are Opaque

The first publication attempt returned only `Validation runtime preflight failed.` The actual problem was that
declared custom files were not physically present and hash-bound. No missing paths, hash mismatch, diagnostic ID, or
recovery action was returned.

### P1: Validation Authoring Contracts Create Avoidable Rework

- `validation_test_shape_propose` accepted a custom step path but generated a different slugged `stepPaths` value,
  creating a false missing-justification blocker.
- Locator references exposed by context were not imported into the proposed draft, causing seven avoidable
  missing-locator blockers.
- Empty optional values such as `stepBlockRef: ""` fail schema validation instead of being normalized or explained.

### P1: Fresh Targets Receive Cross-Project Validation Context

The new notes workspace received suites, cases, modules, and locators from unrelated projects. This creates stale
selector and name-collision risk while consuming thousands of tokens. Target-owned resources should be the default;
shared/global discovery should be explicit and ranked.

### P1: Default Responses Exceed Practical Token Budgets

Observed approximate response sizes:

- successful `project_diagnostic`: 6,000-8,000 tokens;
- `planning_session_create`: about 8,000 tokens;
- `validation_context_read`: more than 7,000 tokens;
- `validation_draft_check`: about 5,000 tokens even with zero blockers;
- full successful validation publication: more than 12,000 tokens.

The same plan, requirement assessment, target metadata, URLs, hashes, cursors, handoff Markdown, and standby guidance
were frequently repeated in multiple shapes. Summary mode also removed critical recovery identifiers, including the
baseline run ID.

## Implementation Plan

### Phase 1: Make Runtime Execution Content-Addressed

1. Build one immutable runtime capsule containing the exact Cucumber binary, config, working directory, feature and
   step paths, environment, selector, report path, and file hashes.
2. Make validation preflight execute or resolve the exact capsule consumed by `baseline_start`; persist a
   content-addressed receipt.
3. Reject unresolved placeholders before review with the field, source, resolved candidate, and corrective action.
4. Add regression fixtures for `[project]`, spaces in hub paths, empty target workspaces, and hub-owned binaries.

Acceptance criteria: a passed preflight and baseline command have identical binary/config/cwd values and capsule hash;
the reproduced literal-placeholder path cannot reach validation review.

### Phase 2: Unify Evidence Identity And Recovery

1. Trace the attempt/TestRun identity through baseline creation, persistence, logs/report routes, evidence summary,
   MCP read/diagnose, and UI links.
2. Make every emitted TestRun ID readable immediately, including pre-registration and harness-failure attempts.
3. Return bounded log excerpts, evidence health, report/log URLs, failed command component, and one legal recovery
   action from `test_run_diagnose`.
4. Calculate `nextAllowedAction` after the final lifecycle transition so reconcile never recommends an illegal call.

Acceptance criteria: the exact audit run fixture is readable from UI, logs, `test_run_read`, and
`test_run_diagnose`; a harness failure transitions to validation repair and recommends draft repair/publication, not
another reconcile.

### Phase 3: Make Validation Authoring One-Pass

1. Normalize absent optional refs and return field-level schema corrections.
2. Preserve or deterministically reconcile accepted custom step paths between proposals, cases, nodes, manifests,
   and justifications.
3. Import uniquely resolved locator refs from the selected target context, or return a bounded ambiguity choice
   before draft mutation.
4. Return structured preflight blockers with paths, expected/actual hashes, and repair calls.
5. Scope context to the target by default and expose shared resources through explicit search with provenance.

Acceptance criteria: the notes validation can be proposed, checked, published, and reviewed without corrective node
upserts, embedded-locator reconstruction, or filesystem-error inference.

### Phase 4: Enforce Delta-Oriented Response Budgets

1. Standardize `summary`, `blockersOnly`, `evidenceOnly`, and explicit `full` response modes across diagnostics,
   planning, validation, baseline, and run diagnosis.
2. Default mutations to summary responses containing lifecycle delta, IDs/hashes, counts, links, blockers, cursor,
   and exactly one next action.
3. Move full artifacts and catalogs behind content-addressed read resources; never duplicate structured handoff and
   rendered Markdown in one default response.
4. Keep critical IDs and recovery actions in every mode. Summary must be compact, not lossy.
5. Add response byte/token budgets and duplication-ratio tests to MCP contract tests.

Initial budgets: successful diagnostic below 1,000 tokens; plan creation below 2,000; unchanged waits below 300;
validation mutation below 1,500; baseline mutation/diagnosis below 1,500 unless full logs are explicitly requested.

### Phase 5: Re-run The Complete Release Scenario

Run a fresh notes app through diagnostic, natural-language planning, browser plan approval, one-pass validation
authoring, browser validation approval, managed baseline, browser baseline acceptance, implementation checkpoints,
managed final validation, completion review, and exact final browser sign-off.

Also inject one harness failure and prove repair, reapproval, and retry remain readable and recoverable. Capture tool
count, response bytes/tokens, retries, active agent time, Appraise processing time, and human-review time per gate.

## Suggested Features

- A compact lifecycle health card showing the current gate, owner, latest event, attempt/TestRun IDs, blockers, and
  only legal next actions.
- An "Explain runtime capsule" view comparing preflight and launch command inputs before approval.
- A target-scoped reusable-resource search with provenance, compatibility score, and an explicit shared/global toggle.
- A one-call `workflow_next_actions` tool keyed by lifecycle/content hash.
- Per-plan efficiency telemetry and budget warnings for response bytes, duplicate fields, unchanged waits, retries,
  and time by owner.
- A reusable accessible local-notes CRUD Step Block with mapped locators and persistence/order assertions.

## Definition Of Done

- The exact P0 reproduction reaches final sign-off without manual database edits or gate bypasses.
- Preflight and managed execution consume the same content-addressed capsule.
- All emitted run IDs are readable and diagnosable across MCP and UI.
- Validation authoring succeeds in one normal pass for a fresh target.
- Default response budgets are enforced by tests and critical recovery metadata is never omitted.
- Focused service, API, MCP, and browser tests cover normal and recovery paths.
- `docs/test-run-runtime.md`, `docs/agent-lifecycle-flow.md`, `docs/coordinator-api-mcp.md`, and relevant authoring
  guidance are updated with the corrected contracts.
