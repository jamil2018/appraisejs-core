# Coordinator API and MCP Contract

AppraiseJS 0.5 permits one stable coordinator identity to own a plan. Subagents remain internal to that coordinator
and do not register directly.

## Project Identity and Transport

- The local credential file is `.appraisejs/coordinator.json`. The directory is Git-ignored, created with mode `0700`,
  and the file with mode `0600`.
- The project fingerprint is SHA-256 over the canonical `realpath` project directory and optional package name.
- `package.json` is optional. Generic directories are valid coordinator projects. When the file exists it must be
  valid JSON, and `name`, when present, must be a string.
- API requests send `Authorization: Bearer <token>` and `X-Appraise-Project: <fingerprint>`.
- Only `localhost`, `127.0.0.1`, and `::1` request URLs, Host headers, and Origins are accepted.
- Request bodies are limited to 1 MiB.
- MCP supports stdio and Streamable HTTP. Stdout is reserved for stdio MCP protocol traffic; diagnostics go to stderr.
- MCP failures are returned to the MCP client and never invoke a CLI fallback.
- A coordinator is bound to one canonical project. A different project fingerprint returns `project-mismatch`
  with the requested and server fingerprints; an invalid token for the matching project remains `UNAUTHORIZED`.
- Local diagnostic and ownership responses may include the canonical project path. Tokens are never returned.

## Diagnostics and Recovery

`appraisejs doctor --json` initializes local identity before evaluating it and classifies failures as identity
bootstrap, transport, HTTP response, authentication, or project mismatch errors. Transport failures include the
configured endpoint and sanitized original cause. A hostname alternative is not presented as the cause unless an
actual probe produced transport evidence.

After correcting identity, endpoint, or project binding, restart or reconnect the MCP client so tool discovery uses
fresh credentials. Bootstrap failures print the diagnostic category and the `appraisejs doctor --json` recovery
command to stderr.

Online CLI plan creation accepts files inside `--cwd` after resolving both paths through `realpath`. External,
traversal, and symlink-resolved external files are blocked before an API request. Use
`--allow-external-plan-file` only for intentional cross-project submission; the create response then includes an
`external-plan-source` warning. Create responses include the coordinator fingerprint, canonical project path, and
canonical source path when supplied by the CLI.

## Lease Defaults and Recovery

- A coordinator lease lasts 30 seconds and is renewed through heartbeat.
- Reconnect requires the same coordinator ID and current connection ID.
- A different identity is rejected while the lease is active unless the user has approved takeover.
- An expired lease may be acquired without takeover approval.
- Objective plans retain independent plan-scoped leases and lifecycle completion. Objective dependencies are bounded
  coordination metadata, not cross-plan mutation authority.

Phase 6 coordination operations are available through coordinator HTTP, the package client, and MCP:

- `POST /objectives` / `objective_create` creates a content-addressed objective with milestones, plan dependencies,
  plan-size enforcement, and impacted-path scopes.
- `POST /plans/:planId/snapshot` / `plan_lifecycle_snapshot` creates an Appraise-owned state snapshot by event sequence.
- `POST /plans/:planId/continuation-package` / `plan_continuation_package_create` combines that authoritative snapshot
  with a bounded agent narrative and provenance.
- `POST /coordination-slo` / `coordination_slo_evaluate` evaluates response, retry, approval, operation, and active-time
  budgets while excluding genuine human-review time.
- A heartbeat after expiry fails; the coordinator must register again.

## Durable Events

Events have a monotonically increasing sequence per plan. Reads and long-poll delivery never acknowledge an event.
The coordinator acknowledges a sequence explicitly, and repeated acknowledgement is idempotent.
Cumulative acknowledgement is serialized and bounded per plan; independent plans do not block one another.

Delivery is at least once: an unacknowledged event is returned again. `plan_cancelled` supersedes earlier,
unacknowledged progression events, marks the projected lifecycle as `cancelled`, and remains terminal after
acknowledgement. Event ordering is authoritative by sequence, not timestamp.

The current event vocabulary includes:

- `plan_graph_processing_started`
- `plan_review_ready`
- `plan_approved`
- `plan_changes_requested`
- `plan_revision_submitted`
- `validation_preparation_started`
- `validation_changes_requested`
- `task_updated`
- `plan_cancelled`
- `implementation_checkpoint`
- `implementation_feedback_applied`
- `implementation_paused`
- `implementation_resumed`
- `validation_failed`
- `validation_passed`
- `plan_completed`

Future lifecycle sessions may add event types without changing delivery semantics. Approval events must be acknowledged
only after the transition they permit succeeds. New blocking feedback must invalidate an approval that has not started
its permitted transition.

`plan_changes_requested` is emitted after a human explicitly submits open blocking plan-review remarks as a change
request. `plan_wait_for_approval` returns `status: "changes_requested"` for that event and directs the coordinator to
read `plan_review_read` before revising.

## Internal API

`POST /api/internal/coordinator/legacy-automation-imports/preview` parses the connected target's legacy automation into
a deterministic, source-traceable proposal. It performs no mutation and always requires human review plus explicit
catalog/locator resolution before the normal Validation AST compiler can accept a separately authored submission. The
equivalent MCP tool is `legacy_automation_import_preview`.

All routes are under `/api/internal/coordinator`.

| Method | Path                                                      | Purpose                                                             |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `POST` | `/register`                                               | Acquire, reconnect, or take over a coordinator lease                |
| `POST` | `/repository-exports`                                     | Enqueue an exact-publication repository export                      |
| `POST` | `/repository-exports/<job-id>`                            | Run, retry, or explicitly resolve an export conflict                |
| `GET`  | `/actions/categories`                                     | List progressive action category summaries                          |
| `GET`  | `/actions`                                                | List bounded, deterministically filtered actions                    |
| `GET`  | `/actions/read`                                           | Read exact versioned action descriptors                             |
| `GET`  | `/locator-graph`                                          | Query the bounded read-only locator graph                           |
| `GET`  | `/locator-graph/visual`                                   | Read the human projection of the locator graph                      |
| `POST` | `/heartbeat`                                              | Renew a coordinator lease                                           |
| `POST` | `/plans`                                                  | Create a structured plan                                            |
| `GET`  | `/plans/:planId`                                          | Read the plan and exact content hash                                |
| `GET`  | `/plans/:planId/review`                                   | Read review hash, remarks, links, and recovery guidance             |
| `PUT`  | `/plans/:planId`                                          | Submit a higher revision with an expected hash                      |
| `POST` | `/plans/:planId/start`                                    | Start validation preparation after plan approval                    |
| `POST` | `/plans/:planId/tasks/:taskId`                            | Publish a task progress event                                       |
| `GET`  | `/plans/:planId/events`                                   | Read events; `after` and `wait=true` are supported                  |
| `POST` | `/plans/:planId/events/ack`                               | Acknowledge one sequence                                            |
| `POST` | `/plans/:planId/validations/publish`                      | Persist validation artifacts and enter validation review            |
| `POST` | `/plans/:planId/validations/feedback`                     | Route validation feedback to validation or plan review              |
| `POST` | `/plans/:planId/baseline/start`                           | Agent-owned start of required baseline execution                    |
| `POST` | `/plans/:planId/baseline/reconcile`                       | Agent-owned baseline evidence reconciliation                        |
| `POST` | `/plans/:planId/baseline/cancel`                          | Cancel active baseline runs                                         |
| `POST` | `/plans/:planId/baseline/failures/:attemptId/acknowledge` | Acknowledge unrelated baseline failure evidence                     |
| `POST` | `/plans/:planId/baseline/regressions/:attemptId/justify`  | Justify accepted regression-pass evidence                           |
| `POST` | `/plans/:planId/baseline/accept`                          | Accept complete baseline evidence                                   |
| `POST` | `/plans/:planId/implementation/start`                     | Agent-owned implementation unlock after baseline                    |
| `POST` | `/plans/:planId/implementation/checkpoint`                | Poll a named implementation checkpoint                              |
| `POST` | `/plans/:planId/implementation/tasks/:taskId`             | Transition a task state                                             |
| `POST` | `/plans/:planId/implementation/feedback`                  | Analyze or apply confirmed blocking feedback                        |
| `POST` | `/plans/:planId/implementation/control`                   | Pause, resume, or cancel implementation                             |
| `POST` | `/plans/:planId/implementation/validations`               | Record exceptional manual reduced-assurance evidence                |
| `POST` | `/plans/:planId/implementation/validations/start`         | Create managed implementation validation run intents                |
| `POST` | `/plans/:planId/implementation/validations/reconcile`     | Reconcile managed implementation validations from runs              |
| `GET`  | `/plans/:planId/completion`                               | Read the final completion review                                    |
| `POST` | `/plans/:planId/implementation/complete`                  | Apply explicit final user approval                                  |
| `POST` | `/delegated/validation-ast-submissions`                   | Verify authorization and store a non-compiling AST inbox submission |
| `POST` | `/plans/:planId/validations/ast/check`                    | Check against authoritative target context                          |
| `POST` | `/plans/:planId/validations/ast/preview`                  | Return bounded preview and exact context receipt                    |
| `POST` | `/plans/:planId/validations/ast/compile`                  | Project only the exact successful preview into canonical entities   |

The create response includes coordinator ownership metadata and the stable review URL only after
`plan_review_ready` is durably appended.

## MCP Surface

For local development, `npm run dev` starts both the Next.js app and the Streamable HTTP MCP endpoint. The default
MCP URL is:

```bash
http://127.0.0.1:3010/mcp
```

Use `npm run setup:mcp` to print the current endpoint and stdio registration snippets. Override the MCP endpoint with
`APPRAISE_MCP_HOST`, `APPRAISE_MCP_PORT`, `APPRAISE_MCP_PATH`, and `APPRAISE_MCP_BASE_URL`.

Run only the HTTP MCP endpoint with:

```bash
npm run dev:mcp
```

For stdio-only MCP clients, register:

```bash
appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000
```

Resources:

- `appraise://actions/catalog`
- `appraise://actions/category/{categoryId}`
- `appraise://contracts/action-catalog`
- `appraise://contracts/locator-graph`
- `appraise://contracts/validation-ast`
- `appraise://contracts/delegated-authorization`
- `appraise://locator-graph/visual`

- `appraise://project`
- `appraise://target-projects`
- `appraise://agent-guide`
- `appraise://workflow/planning`
- `appraise://workflow/validation-preparation`
- `appraise://workflow/standby`
- `appraise://plans/{planId}`

Tools:

- `delegated_validation_ast_submit`
- `validation_ast_check`
- `validation_ast_preview`
- `validation_ast_compile`
- `validation_ast_extension_policy` returns the bounded versioned target-project capability/import policy and hash;
  the same discovery operation is available through HTTP, the package client, and `appraisejs validation ast-policy`.
- `validation_ast_extension_reviews` returns exact stored extension reviews plus the operation hash a decision must
  bind. The package exports typed review/result contracts and the CLI exposes `appraisejs validation ast-reviews`.
  Coordinator authentication is project-wide; an active coordinator lease is not required for compile.

- `action_categories_list`
- `actions_list`
- `actions_read`
- `locator_graph_query`
- `coordinator_register`
- `coordinator_heartbeat`
- `project_diagnostic`

- `project_add`
- `project_list`
- `planning_session_create`
- `plan_review_loop` when available for active bounded review and approval standby
- `plan_create`
- `test_run`
- `test_run_preflight`
- `test_run_read`
- `test_run_diagnose`
- `plan_read`
- `plan_review_read`
- `plan_wait_for_review`
- `plan_wait_for_approval`
- `plan_revise`
- `plan_start`
- `plan_task_update`
- `plan_events_read`
- `plan_event_acknowledge`
- `plan_events_acknowledge_through`
- `validation_context_read`
- `validation_draft_create`
- `validation_draft_read`
- `validation_draft_reset`
- `appraise_resources_list`
- `template_step_search`
- `template_step_match`
- `step_block_search`
- `locator_search`
- `validation_node_upsert`
- `validation_node_delete`
- `validation_test_case_upsert`
- `validation_test_shape_propose`
- `validation_file_upsert`
- `validation_file_delete`
- `validation_step_metadata_upsert`
- `validation_draft_check`
- `validation_draft_publish`
- `validation_publish`
- `validation_decide`
- `validation_file_approve`
- `validation_feedback_submit`
- `validation_review_submit`
- `validation_review_loop`
- `baseline_start`
- `baseline_reconcile`
- `baseline_cancel`
- `baseline_retry`
- `baseline_failure_acknowledge`
- `baseline_regression_justify`
- `baseline_accept`

Validation draft mutations return compact hashes, changed paths, counts, blockers, warnings, and the next action by
default. Use `validation_draft_read({ responseMode: 'full' })` only when the complete draft is required. Delete and
reset operations require the exact current `draftHash`.

`baseline_retry` requires `reason` and `expectedValidationHash`. It is the supported recovery from invalid
baseline-review evidence: historical attempts remain immutable and validation approvals/runtime projections are
invalidated for fresh review.

`validation_context_read` accepts `resourceTypes`, `query`, `limit`, and `sinceHash`. Search tools use these bounded
server-side filters instead of fetching the full context; unchanged scoped reads return `notModified` with the same
`contextHash`.

- `implementation_start`
- `implementation_checkpoint`
- `implementation_task_update`
- `implementation_feedback`
- `implementation_control`
- `implementation_completion_review`
- `implementation_complete`

Large lifecycle and run tools accept `responseMode: "summary" | "evidenceOnly" | "blockersOnly" | "linksOnly" |
"full"` where supported. The default is `summary`; agents should request `full` only when the bounded IDs, links,
blockers, and next action are insufficient.

`planning_session_create` extracts explicit brief requirements before it creates a durable plan. Its response includes
`requirementAssessment` with scored domain candidates, task-surface coverage, and warnings. When any explicit
requirement is uncovered, it returns `status: "coverage_review_required"` with a candidate plan instead of creating a
review-ready revision. The initial plan-review handoff contains the complete URL/hash/cursor evidence once per
revision. A later `plan_review_loop` or approval wait with no new events returns `status: "pending_unchanged"` and
only the plan ID, cursors, recommended wait, and next action; `handoffMarkdown` is never duplicated under a second
field.

Run evidence tools:

- `test_run_preflight` checks required target, environment, plan/validation binding, and runtime projection inputs
  before creating a run.
- `test_run_read` returns a bounded `RunEvidenceSummary` with `testRunPageId`, `executionRunId`, `planId`,
  `validationId`, `reportUrl`, `logsUrl`, `evidenceHealth`, blockers, counts, and `nextAllowedAction`.
- `test_run_diagnose` discriminates legacy evidence from managed capsules. Legacy runs return concise root cause,
  missing artifacts, log excerpt, and next action. Capsule runs return the bounded durable attempt/preflight/evidence
  DTO with fixed recovery actions and selected-target ownership scope; human CLI and exact JSON/MCP modes share it.
  Foreign or missing ownership is opaque 404, integrity conflict is opaque 409, and HTTP diagnostics are `no-store`.

The bounded hub route is `GET /api/test-runs/:runId/diagnostics`; it is intentionally outside the coordinator lease
route table and is hub-only in Appraise 0.5.

`project_diagnostic` and `appraise://project` include capability metadata for stale-server checks: package version,
MCP surface version, server start time, workflow-critical tool names, workflow resource URIs, and recovery text for
missing or stale native MCP capabilities.

### Validation AST recovery

`validation_ast_check` and `validation_ast_preview` are read-only and require the authoritative plan to remain in a
validation-preparation lifecycle. Preview returns exact `previewHash`, `contextHash`, and `receiptHash` values.
`validation_ast_compile` accepts only that exact receipt and prepares a durable idempotent publish operation before
writing artifacts or projecting canonical entities.

Stale plan, target, catalog, locator, environment, extension-policy, preview, projection, or artifact hashes return a
conflict. Re-read context and preview rather than retrying with an old receipt. A retry with the same exact inputs
resumes the same operation; changed inputs require a new preview. Recovery advances only through adjacent prepared,
artifacts-written, projected, and review-ready phases. It never executes generated code or bypasses validation review.
After `review_ready`, continue through the ordinary Appraise-owned validation review gate.

## Lifecycle Ownership

Use one normal writer for each workflow surface. User/Appraise UI owns review decisions: plan approval and change
requests, validation node and changed-file decisions, validation review submission, baseline acceptance and
acknowledgements, regression-pass justification, cancellation interrupts, and final completion approval. MCP tools that
write those decisions are relays for explicit Appraise/user intent.

The connected agent owns execution mechanics after each review gate opens the next phase: validation preparation and
publish, `baseline_start`, `baseline_reconcile`, `implementation_start`, implementation checkpoints, implementation
task progress, and implementation validation reconciliation.

Managed implementation validation follows this sequence:

```text
implementation_validation_start -> test_run for each returned bound input -> implementation_validation_reconcile -> implementation_completion_review
```

Required runtime validations pass completion only when a fresh managed Appraise `TestRun` is bound to the
implementation validation run and has passed. Manual evidence through `implementation_validation_record` is retained as
explicit reduced-assurance evidence and must not be treated as ordinary managed runtime proof.

Plan-bound standalone `test_run` requests must include exact `expectedTestCases` suite/case associations. They are
created atomically with the run before scheduling. Implementation reconciliation accepts optional paired
`verifyTaskIds` and `idempotencyKey` fields for atomic evidence reconciliation and task verification.

Completion receipts include the latest event sequence in their evidence hash. A stale completion mutation responds
with `staleEvidenceHash`, `currentEvidenceHash`, and `currentReceipt`; callers must obtain a new explicit final sign-off.

The canonical agent path is MCP-first: create or revise plans from the coding agent and let AppraiseJS reflect review,
validation, and approval state back into the app. Provider-native runs are experimental and disabled by default. When
`APPRAISE_EXPERIMENTAL_PROVIDER_RUNS=true` is set before startup, the MCP server also exposes
`appraise://providers`, `appraise://provider-runs`, `provider_list`, `provider_probe`, `provider_update`,
`provider_run_create`, `provider_run_read`, `provider_run_cancel`, and `provider_permission_decide`. Those tools expose
Appraise-owned execution attempts for orchestration clients, but they do not approve plan review, validation review,
baseline, implementation, or completion gates. Those lifecycle transitions remain owned by the existing Appraise
lifecycle tools and UI review surfaces.

`planning_session_create` requires explicit target selection for normal app briefs. Pass `targetWorkspacePath` for the
writable target workspace, or pass `targetMode: "hub"` only when the plan is intentionally scoped to the Appraise hub
checkout. When neither is provided, the tool returns `status: "target_required"` with target project candidates and
recovery guidance instead of silently creating a hub-scoped plan.

`plan_wait_for_approval` defaults to bounded poll behavior for ordinary agents. Pending approval returns
`status: "pending"`, browser URL, `appraise://` URL, goal, description, revision, lifecycle, content hash,
`currentAfterSequence`, `nextAfterSequence`, `recommendedWait`, and
`nextRequiredAgentBehavior: "standby_for_appraise_review"`. Agents must present those fields before entering or
continuing standby. No wait call before complete URL handoff; handoffs must include the complete direct browser URL.
Clients that can safely keep a request open may opt into `mode: "long_poll"` or provide `timeoutMs`.

When exposed by the MCP server, `plan_review_loop` is the preferred agent workflow tool because it keeps bounded
waiting active through `plan_review_ready`, approval, requested changes, and cancellation. Compact continuation state
should be treated as a long-review or host-limit fallback. A pending review or pending approval result means the agent
is still waiting on Appraise-owned lifecycle state; it is not completion.

Validation review approval emits `validations_approved`, matching the plan lifecycle. Legacy `validation_approved`
events may still appear in older streams, so readers should tolerate both names while new writers prefer the plural
event.

After `validation_preparation_started`, agents must generate AppraiseJS-native `ValidationArtifact` evidence before
validation review standby. `validation_publish` persists `appraise/plans/validations/<plan-id>.validation.yaml`,
emits `validation_review_ready`, moves the lifecycle to `awaiting_validation_review`, and returns a validation review
handoff containing the direct validation review URL, `appraise://` URL, revision, lifecycle, validation artifact path,
validation count, changed-file count, manifest paths, reused registry/template step paths, new custom step paths, and
the next review action.

The MCP surface must expose the validation artifact contract before an agent calls `validation_publish`. Agents should
read `appraise://workflow/validation-preparation` and the native `validation_publish` input schema for the required
`appraise.validation/v1` shape instead of inspecting AppraiseJS source files. The contract includes validation nodes,
AppraiseJS modules, test suites, test cases, ordered test steps, locator groups, locators, Gherkin paths, step paths,
executable metadata, browser/environment matrix, expected failures, changed-file evidence, manifest paths, approval
arrays, baseline arrays, and `baselineDecision`. Initial validation publishes should use empty `approvals`,
`validationDecisions`, `baselineAttempts`, and `baselineAcknowledgements`, with `baselineDecision: "pending"`.
AppraiseJS authored artifacts are the primary review and later execution surface; Playwright and generated feature
files are runtime evidence derived from those artifacts.

Validation preparation is registry-first. Agents should inspect or use existing registry/template steps for common web
workflows before creating custom step definitions. Custom steps must include a gap justification naming the missing
reusable capability and explaining why locators plus existing registry/template steps are insufficient.

`validation_draft_check`, `validation_draft_publish`, and runtime preflight use the same exact locator-resolution
validator. Locator-bearing parameters must resolve uniquely by canonical ID or name, ID/name pairs must agree, and
the resolved locator group must be present in the validation capsule. These failures are blocking and direct the
coordinator to `locator_search` before review publication.

## Local Smoke Test

With AppraiseJS running on port 3000:

```bash
npm run smoke:coordinator
```

The smoke test creates a minimal plan through the authenticated API and waits for its `plan_review_ready` event.
