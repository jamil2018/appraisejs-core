# AppraiseJS 0.5 Final Architecture and Implementation Plan

## Summary

AppraiseJS 0.5 introduces a Git-native, file-first workflow for agent-generated implementation plans.

The release combines:

- **MCP** as the primary two-way communication channel between AppraiseJS and coding harnesses.
- **Skills** as harness-specific workflow instructions.
- **CLI** for MCP bootstrap, diagnostics, scripting, and explicit fallback.
- **YAML** under `appraise/plans/` as the canonical plan record.
- **SQLite** as the query projection, coordination store, and durable event outbox.
- Existing Appraise test runs as the only authoritative validation evidence.

All communication adapters must use one application-service layer:

```text
UI server actions -------+
Internal HTTP API -------+--> Plan application services
                         |      |--> Artifact repository (YAML)
MCP bridge --> HTTP API -+      |--> Prisma projection
CLI online --> HTTP API -+      |--> Durable event outbox
                                +--> Existing test-run services
```

The normal coding-harness path is:

```text
Skill --> MCP --> Internal API --> Application services
```

Skills orchestrate MCP calls but contain no business logic. CLI fallback is explicit and must not silently replace an
active MCP workflow.

## Architectural Rules

### Adapter Boundaries

- UI server actions parse input, call application services, map responses, and revalidate routes.
- Internal API routes authenticate, parse requests, call the same services, and map HTTP responses.
- MCP tools translate protocol calls into internal API requests.
- Online CLI commands call the same internal API as the MCP bridge.
- Skills define call order, stopping conditions, checkpoints, and recovery behavior only.
- Prisma, artifact files, lifecycle rules, locks, and test-run services cannot be accessed directly from MCP, CLI,
  skills, or UI components.

### Permitted Offline CLI Behavior

Without a running Appraise server, the CLI may only:

- Start the MCP bridge.
- Run diagnostics.
- Create a new `draft` artifact using the generated canonical contract.
- Validate artifact syntax locally.

Offline CLI operations cannot approve, revise, claim, start, update tasks, acknowledge events, or run validations.

### Consistency Rules

- Lifecycle transitions exist in one transition service.
- Agent ownership exists in one coordination service.
- Artifact locking and concurrency exist in one repository.
- Event creation and acknowledgement exist in one outbox service.
- Validation submission and evidence reconciliation exist in plan/test-run services.
- Equivalent UI, API, MCP, and CLI operations must produce identical domain results.
- No adapter may silently retry a stale mutation with a newer hash.
- YAML is the source of truth for portable plan content and lifecycle state.
- SQLite operational records such as leases and event delivery metadata are rebuildable or recoverable from canonical
  state where specified.

## Milestone 1: Plan Contract

### 1.1 Define the V1 Artifact

Include:

- Version, stable ID, title, goal, revision, timestamps, and lifecycle status.
- Owning agent ID.
- Ordered tasks with acceptance criteria and status.
- Required and optional validations.
- Append-only review comments.
- Test-run-backed evidence.
- Reserved `extensions` metadata.

Use:

- Lowercase kebab-case IDs.
- UTC ISO timestamps.
- Environment names rather than database IDs.
- Lowercase browser names.
- Exact Appraise tag expressions.
- Structured comment targets such as `{ type: "validation", id: "login-valid" }`.

**Acceptance criteria**

- Valid artifacts normalize successfully.
- Duplicate IDs, invalid statuses, invalid targets, and unknown versions are rejected.
- Schema tests cover every status and field rule.

### 1.2 Define Lifecycle Rules

Support:

- `draft -> awaiting_review`
- `awaiting_review -> approved | changes_requested | cancelled`
- `changes_requested -> awaiting_review | cancelled`
- `approved -> in_progress | changes_requested | cancelled`
- `in_progress -> ready_for_validation | changes_requested | cancelled`
- `ready_for_validation -> validated | failed_validation | changes_requested`
- `failed_validation -> ready_for_validation | changes_requested`

Rules:

- Review submission requires at least one task and one required validation.
- Approval requires all blocking comments to be resolved.
- Approval applies to one exact artifact revision and content hash.
- Any structural edit invalidates previous approval.
- Runtime-owned evidence and terminal validation status cannot be agent-claimed.
- `validated` cannot be set manually.
- Structural editing is blocked during active implementation and validation unless changes are requested.

**Acceptance criteria**

- Every allowed and rejected transition has tests.
- A stale or revoked approval cannot start implementation.
- Invalid externally authored runtime state produces a semantic sync error.

**Depends on:** 1.1

### 1.3 Add Safe YAML Handling

- Reject duplicate keys, excessive aliases, files over 1 MB, unknown versions, duplicate IDs, invalid timestamps, and
  unsafe paths.
- Accept only `<plan-id>.yaml`, with the filename matching the artifact ID.
- Distinguish YAML syntax, schema, and semantic errors.
- Serialize deterministically with LF endings.
- Preserve append-only comment and evidence ordering.

**Acceptance criteria**

- Parse/serialize round trips preserve plan meaning.
- Malformed and hostile fixtures return actionable file and field locations.

**Depends on:** 1.1

### 1.4 Freeze the Public Contract

Document:

- Canonical location and a complete example artifact.
- Lifecycle and ownership rules.
- Review comment behavior.
- Runtime-owned fields.
- Revision and content-hash concurrency.
- Git expectations.
- Extension rules.

Later schema, lifecycle, event, authentication, or MCP contract changes require an explicit versioned revision before
dependent work proceeds.

**Depends on:** 1.1-1.3

## Milestone 2: Artifact Repository

### 2.1 Add Path-Safe Storage

- Resolve `appraise/plans` from the real project root.
- Reject traversal and symlink escapes.
- Create the directory lazily.
- Add an empty scaffold placeholder.

**Depends on:** 1.3

### 2.2 Add Atomic Operations

Implement:

- List.
- Read.
- Create without overwrite.
- Compare-and-write update.
- File deletion detection.
- SHA-256 content hashes.

Use same-directory temporary files and atomic replacement.

**Acceptance criteria**

- Failed writes cannot corrupt existing plans.
- Stale revision or hash mutations are rejected.
- Windows path behavior is tested.

**Depends on:** 2.1

### 2.3 Add Per-Plan Locks

- Store ignored lock files under `.tmp/plan-locks`.
- Add bounded acquisition and stale-lock recovery.
- Serialize UI, API, MCP, CLI, sync, and reconciliation writes per plan.
- Background reconciliation retries from the latest artifact rather than overwriting comments or task edits.

**Depends on:** 2.2

## Milestone 3: Shared Contract Distribution

### 3.1 Generate Package Contract Code

- Keep canonical framework-neutral types and schemas in root source.
- Generate package-compatible copies into `packages/appraisejs` before its build.
- Add a drift check that fails when generated package code is stale.
- Generated package files cannot be manually edited.
- Do not introduce a second published package for 0.5.

**Depends on:** Milestones 1-2

### 3.2 Add Contract Compatibility Tests

Run identical fixtures against root and package builds, including:

- Valid artifacts.
- Malformed YAML.
- Lifecycle inputs.
- Comments and targets.
- Validation settings.
- Evidence and runtime-owned fields.

**Acceptance criteria**

- Root and package builds accept and reject the same fixtures.
- Package contract code has no Next.js, Prisma, or `@/` alias dependency.

**Depends on:** 3.1

## Milestone 4: Application-Service Foundation

### 4.1 Define Service Interfaces

Create explicit application services for:

- Artifact queries and synchronization.
- Plan lifecycle and structural editing.
- Review comments.
- Agent ownership.
- Durable events.
- Task updates.
- Validation orchestration.
- Evidence reconciliation.

Use typed commands and typed outcomes rather than adapter-specific response objects.

**Depends on:** Milestones 1-2

### 4.2 Define Error Contracts

Use stable domain errors:

- `NOT_FOUND`
- `VALIDATION`
- `INVALID_TRANSITION`
- `STALE_REVISION`
- `OWNERSHIP_CONFLICT`
- `PLAN_PAUSED`
- `AUTHENTICATION`
- `PROJECT_MISMATCH`
- `ACTIVE_OPERATION`
- `INTERNAL`

Adapters map these errors without changing their meaning.

**Depends on:** 4.1

### 4.3 Add Architectural Boundary Tests

Prevent:

- MCP or CLI imports of Prisma and root services.
- UI component imports of repositories.
- Services returning `ActionResponse`, `NextResponse`, or MCP response objects.
- Duplicate lifecycle transition tables.
- Direct adapter writes to YAML or SQLite.
- Skills containing executable business rules.

**Depends on:** 4.1-4.2

## Milestone 5: Database Projection and Coordination

### 5.1 Add Projection Models

Add:

- `Plan`
- `PlanTask`
- `PlanValidation`
- `PlanReviewComment`
- `PlanEvidence`

Store:

- Artifact path, version, revision, hash, and modification time.
- Stable artifact IDs and child order.
- Validation configuration and latest state.
- Evidence links to existing `TestRun` records.

**Acceptance criteria**

- Migration works for fresh and existing 0.4 databases.
- Plan deletion cascades only through plan projection records.

**Depends on:** 1.1

### 5.2 Add Coordination Models

Add:

- `AgentClient`
- `PlanAgentBinding`
- `PlanEvent`

Track:

- Stable agent identity and harness metadata.
- Connection lease and heartbeat.
- One owning agent per plan.
- Monotonic per-plan event sequence.
- Delivery and acknowledgement state.
- Artifact revision and hash associated with each event.

Prevent duplicate events with an idempotency key covering plan, owner, revision, and event type.

**Depends on:** 5.1

### 5.3 Link Validations to Test Runs

- Add nullable plan-validation and attempt metadata to `TestRun`.
- Use `onDelete: SetNull`.
- Preserve test runs and reports after plan or validation deletion.

**Depends on:** 5.1

### 5.4 Add Transactional Projection

- Upsert stable child records instead of deleting and recreating them.
- Remove only projections missing from the latest valid artifact.
- Verify runtime-owned evidence against linked test runs.
- Roll back complete projection failures.
- Never write YAML from projection code.

**Depends on:** 5.1-5.3

### 5.5 Add Read-Through Sync

- Add `sync-plans` to the sync registry, Settings UI, pending counts, and `sync-all`.
- Reconcile files before plan list, detail, API, CLI, and MCP reads.
- Reconcile all changed plans for list reads and only the requested plan for detail/status reads.
- Skip unchanged files by content hash.
- Preserve the last valid projection as stale when parsing fails.
- Show invalid files separately rather than silently hiding them.
- Remove deleted projections without deleting linked test runs.

**Acceptance criteria**

- Create, update, delete, malformed, mixed-validity, stale, and idempotency tests pass.

**Depends on:** 5.4

## Milestone 6: Plan UI

### 6.1 Add Plan Query Service

Return:

- Plan summaries and details.
- Artifact health and sync errors.
- Task and validation summaries.
- Owner-agent connection state.
- Review comments.
- Event delivery state.
- Latest and historical evidence.

Follow existing server action and service conventions.

**Depends on:** 5.5

### 6.2 Add `/plans`

Show:

- Title and lifecycle status.
- Owner agent.
- Task and validation counts.
- Validation health.
- Modification time.
- Pending event state.
- Stale or invalid warnings.
- Empty-state generation instructions.

Add navigation and command-palette entries.

**Depends on:** 6.1

### 6.3 Add `/plans/[planId]`

Show:

- Goal.
- Tasks.
- Validations.
- Review history.
- Agent and event status.
- Evidence and test-run links.
- Artifact metadata and sync issues.

Disable mutation controls when the current artifact is invalid or stale.

**Depends on:** 6.1

### 6.4 Add Direct Plan Editing

Allow structural editing only in `draft`, `awaiting_review`, and `changes_requested`.

Editable content includes:

- Goal and descriptions.
- Task order, content, and acceptance criteria.
- Validation descriptions, required state, tags, environment, browser, and workers.

Every save:

1. Calls the lifecycle application service.
2. Locks and validates the artifact.
3. Increments its revision.
4. Invalidates prior approval.
5. Refreshes projection.

**Depends on:** 6.3

### 6.5 Add Review Controls

Add:

- Submit for review.
- Add comment.
- Mark comment addressed.
- Resolve comment.
- Request changes.
- Approve.
- Revoke approval.
- Cancel plan.

Requesting changes requires at least one open blocking comment. Original comment messages cannot be edited or deleted.

**Depends on:** 6.4

### 6.6 Add Plan Graph

- Derive goal, task, validation, and result nodes from plan query data.
- Reuse existing React Flow primitives where compatible.
- Provide accessible node state without relying only on color.
- Open node details on selection.
- Permit editing from node details only when lifecycle rules allow it.

**Depends on:** 6.3-6.5

## Milestone 7: Durable Event Outbox

### 7.1 Define Decision Events

Create:

- `plan_approved`
- `plan_changes_requested`
- `plan_cancelled`

Include:

- Event ID and monotonic sequence.
- Plan ID and revision.
- Reviewed artifact hash.
- Current plan snapshot.
- Relevant comments.
- Appraise plan URL.
- Creation timestamp.

**Depends on:** 5.2, 6.5

### 7.2 Make Decision Events Recoverable

Review decisions execute as:

1. Lock and update YAML.
2. Project the new revision.
3. Create the event idempotently.
4. Let read-through sync recreate a missing event after partial failure.

Because filesystem and database writes cannot share one transaction, recovery behavior is part of the public service
contract.

**Depends on:** 7.1

### 7.3 Enforce Delivery and Acknowledgement Semantics

- Deliver events at least once and in sequence.
- Reading or delivering an event does not acknowledge it.
- `start_plan` acknowledges approval only after a successful transition.
- `revise_plan` acknowledges a change request only after the revised artifact is saved.
- Disconnected agents receive pending events after reconnecting.
- A newer change request invalidates any unacknowledged approval.
- Duplicate delivery must remain harmless.

**Depends on:** 7.2

## Milestone 8: Authenticated Internal API

### 8.1 Add Project Identity

- Generate a project-local token under ignored `.appraise/`.
- Compute a project fingerprint from the real project-root path.
- Expose server version and fingerprint metadata.
- Reject wrong-project and invalid-token requests.
- Never include tokens in logs or API responses.

**Depends on:** 4.2

### 8.2 Add Thin API Routes

Expose service-backed routes for:

- Plan reads and synchronization.
- Plan creation and revision.
- Review submission and decisions.
- Agent registration and heartbeat.
- Pending event reads and acknowledgements.
- Plan start and task updates.
- Validation submission and status.

Routes contain authentication, parsing, service invocation, and response mapping only.

**Depends on:** 8.1 and the corresponding application services

### 8.3 Secure Local Communication

- Bind documented local endpoints to localhost.
- Validate `Origin` where applicable to prevent DNS rebinding.
- Apply request-size limits.
- Bound long-poll duration and concurrent waits.
- Return stable domain error codes for MCP and CLI mapping.

**Depends on:** 8.2

## Milestone 9: MCP Bridge

### 9.1 Add `appraisejs mcp`

```text
appraisejs mcp --cwd <project> --server-url <url> --agent-id <stable-id>
```

- Use the official TypeScript MCP SDK.
- Use stdio as the required 0.5 transport.
- Write only MCP protocol messages to stdout.
- Write diagnostics to stderr.
- Authenticate through the internal API.
- Require a stable configured agent ID.
- Reject duplicate live agent identities unless takeover is explicit.

**Depends on:** 3.1, 8.3

### 9.2 Add Agent Lease Management

- Register MCP connections through the coordination service.
- Update heartbeats.
- Expire disconnected leases.
- Permit the same stable agent ID to reconnect.
- Require explicit ownership transfer before a different agent claims an owned plan.

**Depends on:** 5.2, 9.1

### 9.3 Add MCP Resources

Expose:

- `appraise://plans`
- `appraise://plans/{planId}`
- `appraise://plans/{planId}/events`
- `appraise://plans/{planId}/evidence`

Resource-update notifications are an optimization and must not be the durable event-delivery mechanism.

**Depends on:** 9.1

### 9.4 Add Plan Tools

Add:

- `create_plan`
- `claim_plan`
- `get_plan`
- `list_plans`
- `submit_plan_for_review`
- `wait_for_plan_decision`
- `list_pending_plan_events`
- `revise_plan`
- `start_plan`
- `update_plan_task`
- `acknowledge_plan_event`

Every tool is a thin internal API client. Mutation tools require the latest artifact revision and hash.

**Depends on:** 7.3, 9.2

### 9.5 Add Active Waiting

`wait_for_plan_decision`:

- Operates only on plans owned by the caller.
- Uses bounded server-side long polling.
- Returns approval, changes requested, cancellation, or `no_decision`.
- Respects MCP request cancellation.
- Is repeated by the skill while waiting.
- Does not depend on experimental MCP Tasks.

**Depends on:** 9.4

### 9.6 Add Reconnection and Event Recovery

- Reconnect using the same stable agent ID.
- Read pending events before continuing.
- Recover current lifecycle and revision from YAML if operational event data was reset.
- Require explicit ownership transfer for another agent.

**Depends on:** 9.2-9.5

## Milestone 10: CLI

### 10.1 Add Setup and Diagnostics

Add:

- `appraisejs mcp`
- `appraisejs doctor`
- `appraisejs plan validate-file`

`doctor` checks:

- Project identity.
- Token availability and permissions.
- Server compatibility.
- MCP configuration.
- Artifact directory.
- Database migration state.

**Depends on:** 8.1, 9.1

### 10.2 Add Online Plan Commands

Add:

- `appraisejs plan create`
- `appraisejs plan status`
- `appraisejs plan revise`
- `appraisejs plan start`
- `appraisejs plan task set`
- `appraisejs plan validate`

Online commands call the same internal API as the MCP bridge and support machine-readable JSON output where useful.

**Depends on:** 8.2

### 10.3 Add Explicit Offline Creation

Permit:

```text
appraisejs plan create --offline
```

Offline creation may only create a new `draft` and must never overwrite an existing artifact. All other lifecycle
operations require the running application.

**Depends on:** 3.1

### 10.4 Prevent Silent Fallback

- MCP failures return actionable errors.
- Skills do not automatically switch to CLI.
- Users must explicitly select CLI fallback.
- CLI cannot impersonate an active MCP-owned agent without an explicit takeover operation.

**Depends on:** 9.2, 10.2

## Milestone 11: Coding Harness Skills

### 11.1 Add `/appraisejs-plan`

The skill:

1. Analyzes the requested change.
2. Calls `create_plan`.
3. Calls `submit_plan_for_review`.
4. Calls `wait_for_plan_decision`.
5. Does not implement while waiting.

**Depends on:** 9.5

### 11.2 Add `/appraisejs-continue`

The skill:

1. Lists pending events.
2. Rereads the current artifact.
3. Revises requested changes and resubmits, or calls `start_plan` for current approval.
4. Implements tasks in order.
5. Checks pending events before each task and before validation.
6. Updates task state through MCP.

A change request blocks further MCP task updates. AppraiseJS does not claim it can interrupt arbitrary code running
between checkpoints.

**Depends on:** 9.6

### 11.3 Add `/appraisejs-validate`

The skill:

1. Checks for newer plan events.
2. Runs validations through MCP.
3. Waits for terminal results.
4. Reports evidence and Appraise links.
5. Preserves failed validation status.

**Depends on:** 12.5

### 11.4 Keep Skills Policy-Only

Skills must not:

- Reimplement lifecycle rules.
- Modify YAML directly.
- Write SQLite.
- Manufacture event acknowledgement.
- Infer approval from natural-language text.
- Claim validation without Appraise evidence.
- Silently call CLI after MCP failure.

**Depends on:** 11.1-11.3

## Milestone 12: Validation Runtime

### 12.1 Add Plan Test-Run Submission

- Resolve environments by unique name.
- Resolve exact artifact tag expressions.
- Reject missing or ambiguous matches.
- Reuse existing feature generation, executor, process manager, reports, and metrics.
- Map artifact browser names to existing Prisma enums.
- Enforce documented worker and validation-count limits.

**Depends on:** 5.3

### 12.2 Add Validation Attempts

- Create one `TestRun` per validation attempt.
- Generate collision-safe run names.
- Persist the plan-validation relationship before execution.
- Prevent duplicate active attempts.
- Preserve every rerun attempt.

**Depends on:** 12.1

### 12.3 Reconcile Evidence

- Derive state and totals from terminal test runs and reports.
- Append one evidence entry per attempt.
- Use the latest attempt for current validation state.
- Mark the plan `validated` only when all required validations pass.
- Required failed, cancelled, or interrupted runs fail the plan.
- Optional failures remain visible without failing the plan.
- If a plan or validation was removed, preserve the test run without recreating the deleted plan.

**Depends on:** 12.2

### 12.4 Recover Interrupted Runs

- Detect plan-linked runs left running without a registered process after a startup grace period.
- Mark them completed and failed.
- Add an interruption log.
- Reconcile failed evidence.
- Do not attempt OS-process reattachment.

**Depends on:** 12.3

### 12.5 Add MCP Validation Tools

Add:

- `run_plan_validations`
- `get_plan_validation_status`
- `wait_for_plan_validation`
- `rerun_plan_validation`

Require a current plan revision and an implementation state that permits validation.

**Depends on:** 9.4, 12.3

### 12.6 Add CLI Validation

Add:

```text
appraisejs plan validate <plan-id>
```

Support:

- `--required-only`
- `--detach`
- `--json`
- Polling interval.
- Optional timeout.

Ctrl+C stops polling but does not cancel active test runs.

**Depends on:** 10.2, 12.5

### 12.7 Add Validation and Evidence UI

- Add run and rerun controls.
- Show live and historical attempts.
- Link reports, downloads, traces, and screenshots.
- Drive graph result nodes from reconciled evidence.
- Do not expose manual passed or failed controls.

**Depends on:** 6.3, 12.3

## Milestone 13: Adapter Parity Testing

### 13.1 Add Contract-Level Test Matrix

For every shared operation, execute equivalent commands through supported adapters and compare:

- Resulting artifact.
- Lifecycle state.
- Projection.
- Event records.
- Domain error code.

Cover UI/action, internal API, MCP/API, and CLI/API paths.

**Depends on:** Milestones 6, 8, 9, and 10

### 13.2 Add Concurrency Tests

Cover:

- UI edit versus agent revision.
- Approval versus external file edit.
- Approval revocation versus `start_plan`.
- Duplicate MCP calls.
- MCP reconnect and event redelivery.
- Evidence reconciliation versus comments or task edits.
- Duplicate validation submission.
- Duplicate live connection for one stable agent ID.

**Depends on:** 13.1

### 13.3 Add Failure-Recovery Tests

Cover:

- Artifact write succeeds but event creation fails.
- Event delivery succeeds but acknowledgement fails.
- App restarts during long polling.
- MCP bridge terminates and reconnects.
- Wrong project or token.
- Invalid external YAML.
- Server restart during validation.
- Operational event data loss with lifecycle recovery from YAML.

**Depends on:** 13.1

## Milestone 14: Documentation, Demo, and Release

### 14.1 Document the Combined Workflow

Document:

```text
Skill --> MCP --> Internal API --> Application services
CLI -----------> Internal API --> Application services
UI ----------------------------> Application services
```

Explain:

- MCP primacy.
- Skill responsibilities.
- Explicit CLI fallback.
- YAML authority.
- Event delivery and acknowledgement.
- Reconnect behavior.
- Agent checkpoints and interruption limitations.
- Local project authentication and identity.

**Depends on:** Milestones 1-13

### 14.2 Build the Demo

Demonstrate:

- MCP plan creation.
- UI plan editing.
- Change request and agent revision.
- Approval and automatic continuation while waiting.
- Approval revocation before start.
- Mid-implementation pause at a checkpoint.
- Validation failure and successful rerun.
- Evidence inspection.
- MCP reconnection and pending-event recovery.

Use existing tagged test assets where possible rather than building an unrelated demo application.

**Depends on:** 14.1

### 14.3 Synchronize Scaffolds

- Update canonical root source first.
- Run `npm run sync-template`.
- Run `npm --prefix packages/create-appraisejs run sync-templates`.
- Include plan storage, migrations, APIs, UI, and MCP setup.
- Exclude local tokens, agent registrations, event rows, locks, and report output.
- Verify plan directories and local identity files are created safely during setup.

**Depends on:** 14.2

### 14.4 Run Release Validation

Run:

- Focused ESLint and Prettier checks after each handoff.
- Schema, service, API, MCP, CLI, and adapter-parity tests.
- Prisma validation, generation, and migration tests.
- Cucumber and Playwright validation.
- `npm run quality:fallow:commit`.
- `npm run quality:react-doctor:commit`.
- Root, CLI, and scaffold builds.
- Template diff review.

Resolve failures introduced by 0.5 before release.

**Depends on:** 14.3

## Handoff Rules

- Assign exactly one numbered subtask to an agent at a time.
- Do not begin until all listed dependencies are merged.
- Each handoff includes implementation, focused tests, and validation results.
- Adapters must remain thin.
- Business logic may only be added to application services.
- Generated contract files and scaffold copies cannot be edited directly.
- Do not edit generated automation output.
- Any schema, lifecycle, event, authentication, or MCP contract change requires an explicit contract revision.
- Preserve unrelated worktree changes.
- Report changed areas, commands run, failures, and newly discovered dependency issues.

## Release Boundaries

### Included

- Versioned plan artifacts.
- Safe parsing, storage, synchronization, and projection.
- Plan editing, review, comments, approval, cancellation, and visualization.
- Durable decision events.
- Local stdio MCP bridge and active waiting.
- Agent ownership, reconnection, and acknowledgement.
- Skills for planning, continuation, and validation.
- Explicit CLI setup, diagnostics, scripting, and fallback.
- Tag-based Appraise validation.
- Test-run-backed evidence.
- Documentation, demo, and scaffold synchronization.

### Excluded

- Automatic launch of terminated coding harnesses.
- Arbitrary interruption of agent code between checkpoints.
- Remote MCP hosting.
- Legacy MCP HTTP+SSE transport.
- Experimental MCP Tasks.
- Multi-agent execution of one plan.
- Cloud collaboration.
- Agent chat inside Appraise.
- TAC engine.
- Knowledge Spine.
- Non-technical Git abstraction.

## Completion Definition

AppraiseJS 0.5 is complete when:

1. The same domain rules govern UI, internal API, MCP, and CLI operations.
2. A coding agent can create and submit a plan through MCP.
3. AppraiseJS can sync, display, and allow users to edit that plan.
4. A user can request changes and the owning agent receives them.
5. The agent can revise and resubmit without losing review history.
6. A user can approve an exact plan revision.
7. The waiting or reconnected owning agent receives approval and atomically starts that revision.
8. Mid-implementation change requests block progress at the next MCP checkpoint.
9. The agent can run linked Appraise validations.
10. Test-run results become durable evidence.
11. AppraiseJS shows whether the implementation is validated or failed.
12. Adapter-parity tests prove that no communication surface has divergent behavior.
