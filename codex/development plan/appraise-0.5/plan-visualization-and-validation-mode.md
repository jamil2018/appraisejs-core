# AppraiseJS 0.5 Final Incremental Plan

## Summary

Deliver 0.5 through independently mergeable subtasks. YAML files under `appraise/plans/` are the canonical workflow record; SQLite projects them for querying. Validation status and evidence remain authoritative only when backed by existing Appraise test runs.

## Milestone 1: Freeze the Artifact Contract

### 1.1 Define V1 Schema and Lifecycle

- Define strict framework-neutral types for plans, tasks, validations, comments, and evidence.
- Reference environments by unique name, not database ID.
- Validation targets contain exact tag expressions with OR semantics.
- Use structured comment targets such as `{ type: "validation", id: "login-valid" }`.
- Use UTC ISO timestamps, lowercase kebab-case IDs, and lowercase browser names.
- Allow only:
  - `draft → awaiting_review`
  - `awaiting_review → approved | changes_requested`
  - `changes_requested → awaiting_review`
  - `approved → in_progress | ready_for_validation`
  - `in_progress → ready_for_validation`
  - `ready_for_validation | failed_validation → validated | failed_validation`
- Require at least one task and one required validation before submission for review.

**Done:** Schema, lifecycle table, sample YAML, and exhaustive schema tests agree.

### 1.2 Define Runtime-Owned Fields

- Task state and editable plan content may be agent-authored.
- Validation status, evidence, and terminal plan status must match linked `TestRun` records.
- External files claiming unverified passed evidence produce a semantic sync error.
- Latest evidence attempt determines validation status; historical evidence remains append-only.
- Optional validation failure does not fail the plan.

**Done:** Runtime ownership and rerun behavior are documented and tested.

### 1.3 Add Safe YAML Parsing

- Add YAML parsing with duplicate-key rejection, bounded aliases, and a 1 MB file limit.
- Reject `.yml`, unknown versions, duplicate child IDs, unsafe paths, invalid timestamps, and unknown critical fields.
- Reserve an `extensions` object for non-critical future metadata.
- Return YAML syntax, schema, and semantic errors separately.

**Depends:** 1.1  
**Done:** Malformed and hostile fixtures fail with file and field locations.

## Milestone 2: Artifact Storage

### 2.1 Add Plan Path Helpers

- Store only `<lowercase-plan-id>.yaml` under `appraise/plans/`.
- Require filename and artifact ID to match.
- Resolve symlinks and reject traversal outside the project plan directory.
- Create the directory lazily and add an empty scaffold placeholder.

**Depends:** 1.3

### 2.2 Add Artifact Repository

- Implement list, read, create, and compare-and-write operations.
- Use same-directory temporary files and atomic replacement.
- Serialize deterministically with LF endings.
- Return a SHA-256 content hash without storing it in YAML.
- Reject overwrites and stale hashes.

**Depends:** 2.1  
**Done:** Round-trip, stale-write, interrupted-write, and Windows path tests pass.

### 2.3 Add Mutation Locking

- Serialize writes per plan using lock files under ignored `.tmp/plan-locks`.
- Add stale-lock recovery and bounded lock acquisition.
- Background evidence reconciliation retries against the latest artifact instead of overwriting comments or task edits.

**Depends:** 2.2

## Milestone 3: Shared App/CLI Contract

### 3.1 Add Contract Generation

- Keep the canonical contract in framework-neutral root source.
- Add a script that copies the contract into generated CLI source before `packages/appraisejs` builds.
- Generated files must not be manually edited.
- Add a CI test that fails when the generated CLI copy is stale.

**Depends:** Milestones 1–2  
**Done:** Root and CLI tests execute identical schema fixtures without publishing another package.

## Milestone 4: Database Projection and Sync

### 4.1 Add Prisma Models

Add `Plan`, `PlanTask`, `PlanValidation`, `PlanReviewComment`, and `PlanEvidence`.

- Preserve stable database rows through compound uniqueness on plan and artifact IDs.
- Store artifact path, version, content hash, modification time, and child order.
- Link evidence to `TestRun`.
- Add a nullable `planValidationId` relation on `TestRun` with `onDelete: SetNull`.

**Done:** Migration works for fresh and existing 0.4 databases.

### 4.2 Project One Plan Transactionally

- Upsert children rather than deleting and recreating them.
- Delete only children removed from the latest valid artifact.
- Verify runtime-owned evidence against linked test runs.
- Roll back the full projection on failure.
- Never write YAML from projection code.

**Depends:** 4.1

### 4.3 Add Directory and Read-Through Sync

- Add `sync-plans` to the sync registry, Settings UI, pending counts, and `sync-all`.
- Plan list reads reconcile all changed files.
- Detail and CLI status reads reconcile only the requested file.
- Skip unchanged files by content hash.
- Invalid files remain untouched; last valid projections are marked stale and returned with sync issues.
- Deleted files remove projections but never delete linked test runs or reports.

**Depends:** 4.2  
**Done:** Create, update, delete, invalid, stale, and idempotency tests pass.

## Milestone 5: Read-Only UI

### 5.1 Add Plan Query Service

- Return plan summaries, details, sync issues, unresolved comments, latest evidence, and validation totals.
- Follow existing service/action error conventions.

### 5.2 Add `/plans`

- Show valid projections and a separate invalid-artifact section.
- Display status, counts, validation health, modification time, and stale warnings.
- Add main navigation and command-palette entries.

### 5.3 Add `/plans/[planId]`

- Show goal, tasks, validations, review history, evidence, and artifact metadata.
- Disable mutations when the current artifact is invalid or stale.
- Link evidence to existing test-run detail and artifact-download routes.

### 5.4 Add Read-Only Graph

- Derive goal, task, validation, and result nodes from detail data.
- Reuse existing React Flow primitives where compatible.
- Make state understandable without color and open an accessible detail panel on selection.

**Depends:** 5.3  
**Done:** Mapping and interaction tests cover empty, failed, pending, and validated states.

## Milestone 6: Review and Agent Mutations

### 6.1 Implement Transition Service

- Read and lock the latest artifact before mutation.
- Require the current content hash.
- Write YAML first, then refresh its projection.
- Block approval while unresolved review comments remain.
- Require request-changes actions to include a comment.

### 6.2 Implement Append-Only Comments

- Support plan, task, validation, and evidence targets.
- Add stable ID, author, message, creation time, resolution, and resolution time.
- UI/API writers may resolve comments but never edit or delete their original content.

### 6.3 Add Review UI

Add submit, approve, request-changes, comment, and resolve controls only when valid for the current lifecycle state.

### 6.4 Add Agent Mutation API

- Add operations to revise editable content, start implementation, and update task status.
- Revision replaces only goal/tasks/validations while preserving comments and evidence.
- Revising `changes_requested` returns the plan to `awaiting_review`.
- Reject task completion for unknown or removed tasks.

**Depends:** 6.1–6.2

## Milestone 7: CLI Workflow

### 7.1 Add Project Handshake

- Compute a project fingerprint from the real project-root path.
- Expose server version and fingerprint through a metadata endpoint.
- CLI compares it with `--cwd` before every API operation.
- Return `409` rather than touching a different project running on the configured port.

### 7.2 Add `appraisejs plan create`

- Support `--title`, `--id`, `--input`, `--cwd`, `--server-url`, and `--json`.
- Create locally without requiring the server.
- If the matching server is available, request targeted sync and return the plan URL.
- Never overwrite an existing artifact.

### 7.3 Add `appraisejs plan status`

- Perform the project handshake and targeted read-through sync.
- Return lifecycle state, hash, unresolved comments, task summary, validation summary, and implementation permission.
- Exit non-zero for unavailable, mismatched, missing, or invalid projects/plans.

### 7.4 Add Agent Update Commands

Add:

- `appraisejs plan revise <id> --input <file> --hash <hash>`
- `appraisejs plan start <id> --hash <hash>`
- `appraisejs plan task set <plan-id> <task-id> --status <status> --hash <hash>`

**Done:** Human and JSON output, stale hashes, server loss, and project mismatch are tested.

## Milestone 8: Validation Runtime

### 8.1 Add Tag-Expression Test-Run Entry Point

- Resolve each artifact tag against exact `Tag.tagExpression` values.
- Reject missing or ambiguous matches.
- Resolve environment by unique name.
- Reuse existing feature generation, process manager, report parsing, and metrics.
- Map artifact browser names to existing Prisma enums.
- Bound workers and validation count to documented local-safe limits.

### 8.2 Submit Validation Runs

- Create one test run per validation for direct evidence mapping.
- Generate collision-safe run names.
- Persist `planValidationId` before execution.
- Reject duplicate active runs for the same validation.
- Launch required and optional validations; reruns create new attempts.

### 8.3 Reconcile Evidence

- Derive totals and status from terminal test runs and reports.
- Append one evidence item per test-run attempt.
- Mark the plan validated only when every required validation’s latest attempt passes.
- Treat failed, cancelled, and interrupted required runs as failed validation.
- If the plan file or validation was removed, retain the test run but do not recreate the plan or attach evidence.

### 8.4 Recover Interrupted Runs

- During polling, detect plan-linked runs that remain `RUNNING` without a registered process after a short startup grace period.
- Terminalize them as `COMPLETED/FAILED`, append an interruption log entry, and reconcile failed evidence.
- Do not attempt OS-process reattachment.

### 8.5 Add Validation API and CLI

- Add submit and polling endpoints protected by the project handshake.
- Add `appraisejs plan validate <id>` with `--json`, `--required-only`, `--detach`, polling interval, and optional timeout.
- Poll indefinitely by default; Ctrl+C stops polling but does not cancel active runs.
- Exit non-zero when required validation fails or the server becomes unavailable.

### 8.6 Add Validation UI

- Add start, run, and rerun controls.
- Show live linked runs and historical attempts.
- Never expose manual passed or failed controls.
- Refresh graph result nodes from reconciled evidence.

## Milestone 9: Skills, Scaffolding, and Release

### 9.1 Add Agent Skills

- `/appraisejs-plan`: create and sync a plan, return its link, then stop.
- `/appraisejs-continue`: inspect status, revise requested changes, start only after approval, and update tasks through CLI.
- `/appraisejs-validate`: run validation and preserve failed exit status.
- Every skill rereads status and hash immediately before mutation.

### 9.2 Add Documentation and Demo

- Document the artifact, review, implementation, validation, rerun, interruption, and troubleshooting flows.
- Use existing tagged tests for the demo where possible.
- Demonstrate passing, failing, and successful rerun evidence.

### 9.3 Synchronize Scaffolds

- Copy the root `appraise/` directory and canonical app changes through template sync.
- Run `create-appraisejs` template synchronization.
- Verify clean scaffolds create plans, migrate databases, sync, run validation, and exclude generated reports.

### 9.4 Release Validation

Run focused tests after every handoff, then complete:

- ESLint and Prettier checks.
- Prisma validation, generation, and migration tests.
- Root and CLI Vitest suites.
- Cucumber and Playwright validation.
- Fallow and React Doctor.
- Root, CLI, and scaffold builds.
- Template diff review.

## Handoff Rules

- Assign exactly one numbered subtask per agent.
- Do not begin a subtask until all listed dependencies are merged.
- Every handoff includes tests and reports changed files and commands.
- Agents must not edit generated automation output or generated CLI contract files.
- Contract changes discovered after Milestone 1 must be handled as an explicit contract revision before dependent work continues.
