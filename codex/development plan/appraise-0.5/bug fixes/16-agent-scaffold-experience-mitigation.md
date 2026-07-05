# Agent Scaffold Experience Mitigation

## Summary

Mitigate the rough edges observed while an agent used AppraiseJS MCP to scaffold a Weather Guy project. The MCP
lifecycle surface was reachable and useful, but the first generated plan was shaped like a todo app, validation review
approval from the app did not clearly release the agent from `awaiting_validation_review`, and validation artifact
authoring still pushed the agent toward AppraiseJS source inspection.

The goal is to make natural-language project scaffolding domain-aware, make validation approval unmistakably
Appraise-owned from the UI, and expose enough validation contract detail through MCP that agents do not need to inspect
core source files.

## Findings

- `planning_session_create` can produce an overfit scaffold plan. The current structured brief path recognizes rich app
  briefs, but its task template is still todo-shaped: model task data, implement CRUD/completion behavior, persist task
  state, and validate CRUD/persistence. For a weather app, those are false affordances.
- The existing MCP lifecycle tools are valuable: `project_diagnostic`, `project_add`, `planning_session_create`,
  `plan_revise`, `plan_review_loop`, `plan_start`, `validation_publish`, and validation decision tools all supported
  recovery.
- Validation review has a backend transition to `validations_approved`, but the UI flow can be ambiguous because
  approving validation nodes is not the same as submitting the revision-level validation review. A reviewer can believe
  the app approved validation while the agent still sees `awaiting_validation_review`.
- `validation_publish` exposes the strict schema, but the agent still needed to inspect AppraiseJS source files to build
  a confident artifact. That means MCP/resource guidance is still too hard to use under pressure.
- Non-git target workspaces are valid, but the evidence model should explicitly describe `gitCommit: null` and
  `reducedAssurance: true` so agents do not treat the condition as an unexpected failure.

## Key Changes

### Domain-Aware Plan Generation

- Replace the single todo-style structured task template with intent-aware templates:
  - Data CRUD app: entity model, create/edit/delete/list, persistence, validation.
  - API-backed information app: input/search, API integration, loading/error states, result rendering, validation.
  - Content editor or note app: editor state, document/list management, persistence, validation.
  - Operational dashboard: data source setup, filtering/sorting, summaries, empty/error states, validation.
  - Unknown or ambiguous app: return a concise reviewable plan without inventing CRUD/completion/persistence.
- Add a brief-to-task quality guard that blocks or downgrades generated plans when tasks introduce domain nouns or
  behaviors not present in the user brief.
- Preserve the review loop as the correction path, but make bad first drafts less likely so `plan_revise` is not doing
  avoidable cleanup.

### Weather Guy Regression Fixture

- Add a unit fixture for a Weather Guy-style brief.
- Assert generated tasks include weather-specific work such as location/search input, weather API integration, current
  conditions display, loading and error states, and focused validation.
- Assert generated tasks do not mention todo, generic task models, CRUD, completion toggles, or persistence unless the
  brief explicitly requests saved locations/history.

### Validation Approval UX

- Separate labels for evidence-level decisions and revision-level approval:
  - Per-node buttons should read like evidence decisions, for example `Approve evidence`.
  - The revision-level button should remain explicit, for example `Submit validation review`.
- When all required nodes and files are ready, show a clear readiness banner that says submitting the validation review
  emits `validations_approved` and unlocks baseline actions, not implementation.
- After a node/file decision succeeds, keep the user oriented by showing remaining blockers or the final submit action.
- Keep `validation_decide` as a supported agent-side escape hatch, but the browser UI must be sufficient for the full
  approval path.

### Browser Approval Regression Test

- Extend `e2e/plan-review.spec.ts` or add a focused validation-review spec that seeds a plan in
  `awaiting_validation_review` with one required validation and any required file approvals.
- Drive the real UI:
  - Open `/plans/<plan-id>?review=validation`.
  - Approve required validation evidence.
  - Approve required changed-file evidence when present.
  - Submit the validation review.
  - Assert the UI shows `validations approved` and baseline actions are visible.
  - Assert the persisted event stream contains `validations_approved`.
- Add a negative assertion that node approval alone does not move the plan out of `awaiting_validation_review`.

### MCP Validation Artifact Ergonomics

- Add or enrich a discoverable validation artifact template in `appraise://workflow/validation-preparation`.
- Include a ready-to-fill minimal JSON example with:
  - `version`, `planId`, `revision`, and `baseRevision`.
  - AppraiseJS-native validation nodes and authored artifacts.
  - `gherkinPaths`, `stepPaths`, executable metadata, matrix, expected failures, file evidence, manifest paths.
  - Empty initial `approvals`, `validationDecisions`, `baselineAttempts`, and `baselineAcknowledgements`.
  - `baselineDecision: "pending"`.
- Improve `validation_publish` schema failures so the returned error names the missing path and the next recovery step,
  rather than leaving agents with a generic `Required` failure.
- Add MCP tests proving the contract resource is sufficient without opening `packages/appraisejs/src/plan-file.ts` or
  `packages/appraisejs/src/mcp.ts`.

### Gitless Target Evidence

- Update `project_diagnostic` and validation-preparation guidance to describe non-git target workspaces explicitly.
- For non-git targets, return a recommended `baseRevision` shape with `gitCommit: null`, a snapshot hash, and
  `reducedAssurance: true`.
- Make validation-publish handoff language distinguish reduced assurance from validation failure.

## Test Plan

- Add MCP unit tests for Weather Guy and at least one other non-todo app brief.
- Keep the existing detailed todo fixture to ensure CRUD-specific plans still work when the brief actually asks for
  CRUD/completion/persistence.
- Add plan-generation negative tests that reject accidental todo/task vocabulary for API-backed app briefs.
- Add UI tests for evidence-level validation approval labels, readiness messaging, and disabled/enabled revision-level
  submit states.
- Add a Playwright validation-review approval test proving app-side approval emits `validations_approved` and exposes
  baseline actions.
- Add MCP/resource tests for the validation artifact template and improved `validation_publish` error recovery.
- If root `src` changes are made, run `npm --prefix packages/create-appraisejs run prepare-template` and inspect
  generated template diffs.

## Validation Commands

- `npx vitest run packages/appraisejs/src/mcp.test.ts`
- `npx vitest run src/services/coordinator/coordinator-validation-service.test.ts`
- `npx vitest run 'src/app/(base)/plans/[planId]/plan-review-workspace.test.tsx'`
- `npx playwright test e2e/plan-review.spec.ts`
- `npx prettier --check --ignore-unknown 'codex/development plan/appraise-0.5/bug fixes/16-agent-scaffold-experience-mitigation.md'`
- `npm run check:harness`

## Assumptions

- AppraiseJS remains MCP-first: provider-native flows can be additive, but plan review, validation review, baseline, and
  completion gates stay Appraise-owned.
- `plan_revise` remains the right correction mechanism for bad drafts, but first drafts should not encode a todo scaffold
  unless the brief is actually todo-like.
- Validation approval from the browser UI must be fully equivalent to the supported MCP transition, while still preserving
  separate evidence-level decisions.
- Gitless target workspaces are valid project targets, with lower assurance documented instead of hidden.
