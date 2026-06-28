# AppraiseJS 0.5: Agent Plan Review and TDD Validation

## Purpose

AppraiseJS 0.5 is a local-first review and validation surface for coding-agent implementation plans. A coding agent
drafts and revises the plan; AppraiseJS renders it as a graph and accessible list, collects human remarks, enforces
approval gates, coordinates TDD validation preparation, and records Appraise test-run evidence.

This document is the authoritative product workflow and implementation dependency map. The smaller documents in this
directory are assignable implementation plans. If a session plan conflicts with this document, update the contract
here before implementation continues.

## Product Workflow

```text
User asks coordinator agent to plan with the AppraiseJS skill
  -> agent creates a structured plan through MCP
  -> AppraiseJS stores it and prepares graph/list views
  -> agent receives review-ready event and shows stable plan URL
  -> user adds blocking/non-blocking remarks
  -> agent revises until user approves exact plan revision
  -> agent creates executable validation tests, without product implementation
  -> user reviews validation nodes and every flagged changed file
  -> AppraiseJS runs baseline combinations
  -> user accepts expected-failure baseline and acknowledges unrelated failures
  -> agent implements with checkpoint polling and task/group validation
  -> AppraiseJS runs fresh required validations
  -> user performs final completion review
  -> unresolved non-blocking remarks and optional failures become follow-up decisions
```

## Non-Negotiable Decisions

### Authorship and review

- The coordinator agent authors plan structure. Humans add remarks; they do not directly edit tasks, edges, or
  validations.
- Remarks are append-only threads targeting stable nodes or a separate plan-wide review section.
- Only unresolved blocking remarks prevent progression.
- The agent may mark a remark `addressed` or `disputed`; only the user may resolve, dismiss, or downgrade it.
- Unresolved non-blocking remarks remain visible and are presented after implementation as follow-up, dismissal, or
  leave-open choices.
- Approval binds to the exact revision and content hashes displayed. Stale approval attempts fail.

### Plan graph

- The structured plan is canonical; the graph and list are derived review surfaces.
- The stable URL may exist during graph processing, but the agent presents it only after `plan_review_ready`.
- Repeated graph failure falls back to the fully functional list view.
- Node coordinates are presentation metadata and never affect plan approval.
- Personal layouts remain local. Explicitly published shared layouts use a Git-tracked sidecar and are never committed
  or pushed automatically.

### Validation-first development

- Plan approval does not permit implementation. It permits validation preparation.
- Validation preparation may change test definitions, fixtures, and test infrastructure, but not product code without
  per-file user approval.
- Users approve validation nodes and each `production` or `requires_review` file independently.
- File approval binds to the exact content hash and is revoked by further modification.
- Every new-behavior validation declares browser/environment-scoped expected failure signatures before baseline runs.
- All required combinations need accepted baselines before implementation.
- Expected behavioral failures are valid TDD baselines. Undefined steps, setup failures, infrastructure failures,
  unexpected timeouts, and unmatched failures are not.
- Pre-existing unrelated failures require user acknowledgement. The acknowledgement carries forward only while the
  failure signature remains unchanged.

### Implementation and completion

- Tasks have explicit typed edges: `depends_on`, `validated_by`, `produces`, and `sequence_hint`.
- Dependency cycles are invalid. Independent tasks may run in parallel through coordinator-managed subagents.
- The plan may declare implementation groups whose validations run after the group rather than each task.
- The coordinator checks durable events before and after every task/group, before validation runs, and before declaring
  completion.
- A queued user change shows when the agent will next acknowledge it.
- Blocking feedback pauses the affected task and transitive dependents; plan-wide feedback may pause the whole plan.
- Task implementation and verification are separate: `implemented` is not `verified`.
- Required validations must pass in fresh Appraise test runs, and baseline regressions must remain healthy.
- Passing validation produces `validation_passed`; only explicit user sign-off produces `completed`.

### Coordination

- One stable coordinator agent owns a plan at a time. Subagents are internal to the harness, with optional provenance
  reported by the coordinator.
- Coordinator reconnect uses a lease and stable identity. Takeover by another identity requires user approval.
- Events are durable, at-least-once, and monotonically sequenced per plan.
- Cancellation supersedes earlier unacknowledged progression events.
- AppraiseJS never silently falls back from MCP to CLI and never commits or pushes Git changes.

### Git and storage

- Git is recommended, not mandatory. Non-Git projects use lower-assurance filesystem snapshots with persistent warnings.
- Dirty worktrees are supported by recording the baseline commit plus dirty-file hashes.
- AppraiseJS independently calculates changed files and reconciles them with the agent manifest.
- Undeclared changed files block validation approval.
- Approved artifacts should be committed before implementation; users may explicitly accept reduced reproducibility.
- Git conflicts disable approval and progression. The agent may propose a resolution; only the user accepts it.
- One plan belongs to one project fingerprint. Related repositories may be referenced by external plan URLs.

## Canonical Artifacts

Suggested Git-tracked structure:

```text
appraise/plans/<plan-id>.yaml
appraise/plans/reviews/<plan-id>.review.yaml
appraise/plans/validations/<plan-id>.validation.yaml
appraise/plans/layouts/<plan-id>.layout.json
```

- Plan YAML: goal, tasks, typed edges, implementation groups, acceptance criteria, validation intent, lifecycle, revision.
- Review sidecar: append-only threads, resolutions, revision decisions, file reviews, and final sign-off.
- Validation sidecar: executable references, matrix, expected failure signatures, approvals, and baseline decisions.
- Layout sidecar: shared positions only.
- SQLite: projections, leases, personal layouts, event delivery, and runtime coordination.
- Existing `TestRun` records: baseline, intermediate, and completion evidence.
- Git-backed history stores lightweight revision metadata and relies on Git for old content. Non-Git projects retain
  complete local snapshots.

## Lifecycle

```text
draft
  -> awaiting_plan_review
  -> changes_requested | plan_approved | cancelled
plan_approved
  -> preparing_validations
  -> awaiting_validation_review
  -> validation_changes_requested | validations_approved
validations_approved
  -> baseline_running
  -> baseline_review
  -> baseline_changes_requested | baseline_accepted
baseline_accepted
  -> in_progress
  -> paused | changes_requested | ready_for_validation
ready_for_validation
  -> validating
  -> failed_validation | validation_passed
validation_passed
  -> changes_requested | completed
```

`paused` is reversible and retains valid approvals. `cancelled` is terminal; restarting creates a new revision or
derived plan. Structural plan feedback reopens plan approval. Validation-definition feedback reopens validation review
and baseline. Implementation-only feedback reruns impacted validations.

## Assignable Session Plans

| Order | Plan                                                                                               | Scope                                                    | Depends on |
| ----- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| 1     | [01-contract-and-artifacts.md](01-contract-and-artifacts.md)                                       | Versioned contracts, lifecycle, safe sidecars            | None       |
| 2     | [02-storage-projection-and-sync.md](02-storage-projection-and-sync.md)                             | Atomic repository, Prisma projection, Git/snapshot sync  | 01         |
| 3     | [03-plan-review-and-visualizer.md](03-plan-review-and-visualizer.md)                               | Graph/list, remarks, approval, layouts                   | 01-02      |
| 4     | [04-coordinator-events-api-and-mcp.md](04-coordinator-events-api-and-mcp.md)                       | Identity, leases, outbox, API, MCP                       | 01-02      |
| 5     | [05-validation-preparation-and-file-review.md](05-validation-preparation-and-file-review.md)       | Test generation gate, diff classification, file approval | 01-04      |
| 6     | [06-baseline-execution-and-acceptance.md](06-baseline-execution-and-acceptance.md)                 | Expected failures, baseline runs, acknowledgement        | 05         |
| 7     | [07-implementation-checkpoints-and-completion.md](07-implementation-checkpoints-and-completion.md) | Task execution, pauses, evidence, final sign-off         | 04, 06     |
| 8     | [08-cli-skills-and-recovery.md](08-cli-skills-and-recovery.md)                                     | CLI, harness skills, reconnect and fallback              | 04, 06-07  |
| 9     | [09-integration-scaffolds-and-release.md](09-integration-scaffolds-and-release.md)                 | Parity, failure recovery, docs, scaffold sync, release   | 01-08      |

Sessions 3 and 4 may run in parallel after plans 1-2. Other sessions should respect the listed dependencies. Contract
changes discovered later must return to plan 1 and increment the public contract version before dependent work resumes.

## Session Assignment Protocol

- Assign one numbered plan to one coordinator session at a time.
- Do not start until every dependency is merged or available in the session's worktree.
- Read this master document, the assigned session plan, `AGENTS.md`, and the repository docs named by the touched
  subsystem before editing.
- Keep business rules in application services. UI actions, API routes, MCP tools, CLI commands, and skills remain thin.
- Change canonical root source first. Do not edit generated automation output or scaffold copies directly.
- Add focused tests with each slice and leave the repository buildable at the handoff.
- Before handoff, run focused ESLint, Prettier, and Vitest checks; add Prisma, package, Playwright, Cucumber, build, and
  scaffold checks when the session scope requires them.
- Report changed areas, commands and results, migrations or generated files, unresolved risks, and any contract change
  required from an earlier session.
- Preserve unrelated worktree changes and do not commit or push unless the user explicitly requests it.

## Deferred Beyond 0.5

- Direct contributor/subagent connections.
- Multiple independent coordinators mutating one plan.
- Cryptographic approval signatures.
- Multi-repository orchestration beyond external links.
- Automatic Git commit or push.
- Shared-layout visual merge tooling.
- Automatic semantic identity rewriting for replaced nodes.
