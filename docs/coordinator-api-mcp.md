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

The HTTP adapter resolves method and path metadata through the typed canonical operation table in
`src/services/coordinator/coordinator-operation-registry.ts`. Authentication and target-project scope guards run
before dispatch; registry entries cannot opt out of either boundary. Unknown method/path combinations share the same
bounded not-found envelope.

All routes are under `/api/internal/coordinator`. The generated operation inventory is
`docs/generated/coordinator-operation-reference.md`; it is the authoritative method/path and MCP availability list and
must be refreshed with `npm run generate:coordinator-reference`. Do not hand-edit the generated file.

The create response includes coordinator ownership metadata and the stable review URL only after
`plan_review_ready` is durably appended.

## MCP Surface

The public MCP contract is defined once by `packages/appraisejs/src/mcp/registry.ts` and composed from project,
planning, validation, baseline, implementation, runtime, diagnostic, and resource domain registries. Both stdio and
Streamable HTTP create request-scoped servers from that registry; HTTP identity, project binding, abort state, and
transport objects are never cached. Immutable contract definitions are reused process-wide and duplicate, empty, or
unknown definitions fail before startup completes.

`packages/appraisejs/src/mcp-contract.fixture.json` is the generated, schema-bearing contract snapshot. The current
default surface contains 73 tools and 16 resources. Enabling `APPRAISE_EXPERIMENTAL_PROVIDER_RUNS` adds seven tools and
two resources, for 80 tools and 18 resources. These current counts supersede the earlier audit snapshot because the
source contract includes the action/locator contract resources and conditional provider surface. Regenerate and verify
the snapshot with `npm --prefix packages/appraisejs run build:mcp-contract` and the package tests. Use
`npm --prefix packages/appraisejs run benchmark:mcp-registry` for repeatable registry allocation evidence.

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

The generated reference lists every default and provider-experimental resource and tool, with each tool mapped to a
coordinator operation or an explicitly documented local MCP boundary. Stable workflow resources include
`appraise://agent-guide`, `appraise://workflow/planning`, `appraise://workflow/validation-preparation`, and
`appraise://workflow/standby`. Plan-bound templates include `appraise://plans/{planId}`,
`appraise://plans/{planId}/validation-context`, and `appraise://plans/{planId}/validation-draft`; the validation-draft
template resolves through the bounded draft-context coordinator operation.

`template_step_search` and `template_step_match` share one server-side ranked
resolver. It scores semantic intent and parameter compatibility, applies a confidence threshold, returns bounded
explained alternatives when no confident match exists, and includes resolver-call, fallback, rank, candidate-count,
and response-size-oriented metrics without returning the full validation context. Returned template-step candidates
include descriptions, signatures, ordered parameters, and group metadata. Selection order is semantic template step,
allowlisted structured operation, then a justified custom step; the fallback contract and allowlists are documented in
`docs/reusable-playwright-template-steps.md`.

Managed validation submission is bound to both the immutable AST operation hash and the latest `reviewStateHash`.
`validation_review_reconcile` is the only legal `review_ready` recovery: it verifies immutable compile content and
idempotently refreshes the current review-state receipt without emitting another review-ready event.

Human-facing links use `APPRAISE_BROWSER_ORIGIN` when configured; otherwise loopback URLs are normalized to
`localhost`. Plan links include the bound `project` query parameter. Review mutations authorize against the plan's
stored target-project ownership and reject a conflicting active-project cookie instead of requiring cookie state.

`baseline_retry` requires `reason` and `expectedValidationHash`. It is the supported recovery from invalid
baseline-review evidence: historical attempts remain immutable and validation approvals/runtime projections are
invalidated for fresh review.

`validation_context_read` accepts `resourceTypes`, `query`, `limit`, and `sinceHash`. Search tools use these bounded
server-side filters instead of fetching the full context; unchanged scoped reads return `notModified` with the same
`contextHash`.

Large lifecycle and run tools accept `responseMode: "summary" | "evidenceOnly" | "blockersOnly" | "linksOnly" |
"full"` where supported. The default is `summary`; agents should request `full` only when the bounded IDs, links,
blockers, and next action are insufficient.

Lifecycle summary mutations preserve their action result rather than returning an empty object. Implementation
summaries include runnable task IDs, approved groups, task/run counts, compact run identities, checkpoint or receipt,
readiness, structured blockers, and exactly one next action when those fields apply. Full task maps and validation
artifacts remain available only through explicit `full` mode.

Validation-resource proposal summaries return compact AST-ready locator bindings and explicit environment references
without repeating target, module, or locator-group metadata. Implementation mutations omit historical baseline
attempt bodies when current implementation-run identities are available.

Environment proposals may include `expectedPageTitle`. Loopback origins are logically reserved across target projects,
so another project cannot silently reuse the same local port. Immediately before baseline preparation, Appraise probes
loopback environments: an unavailable origin remains legal for an expected-red baseline, a matching target/title is
verified, and a conflicting title or registered target fails with a bounded `ENVIRONMENT_IDENTITY_MISMATCH` diagnostic
and an available replacement base URL when one can be reserved.

Planning creation, plan/validation review loops, validation context, and Validation AST check, preview, and compile
use the same response-mode vocabulary. Summary responses retain status, lifecycle, task/content hashes, preview and
receipt hashes, integrity blockers, cursors, and next action while omitting repeated candidate/context payloads. Full
mode remains available for explicit diagnostics. Summary budgets are 2,000 estimated tokens for plan creation or
agent-authored plan creation, 300 for an unchanged wait, and 1,500 for validation context or mutation.

Validation-context summary responses return resource counts and search guidance instead of serializing shared resource
libraries. Agents should use `resourceTypes`, `query`, and a small `limit`, or the dedicated template-step, Step Block,
and locator search tools, to fetch only the candidates required for the current AST node. Use `full` only for an
explicit bounded diagnostic.

`planning_session_create` accepts the same complete, agent-authored plan contract as `plan_create`. AppraiseJS validates
task IDs, dependency references, implementation-group references, and artifact structure, but it does not classify the
product or infer tasks from brief prose. This keeps planning intelligence with the connected agent while Appraise owns
durability, review readiness, lifecycle gates, hashes, and project binding. The initial plan-review handoff contains
the complete URL/hash/cursor evidence once per
revision. A later `plan_review_loop` or approval wait with no new events returns `status: "pending_unchanged"` and
only the plan ID, cursors, recommended wait, and next action; `handoffMarkdown` is never duplicated under a second
field.

Run evidence tools:

- `test_run_preflight` checks required target, environment, plan/validation binding, and runtime projection inputs
  before creating a run.
- `test_run_read` returns a bounded `RunEvidenceSummary` with `testRunPageId`, `executionRunId`, `planId`,
  `validationId`, `reportUrl`, `logsUrl`, `evidenceHealth`, blockers, counts, and `nextAllowedAction`.
- For a target-bound plan, pass `planId` to `test_run_read` and `test_run_diagnose`; the client derives the
  authoritative target-project scope from that plan instead of incorrectly applying the hub fingerprint.
- `test_run_diagnose` discriminates legacy evidence from managed capsules. Legacy runs return concise root cause,
  missing artifacts, log excerpt, and next action. Capsule runs return the bounded durable attempt/preflight/evidence
  DTO with fixed recovery actions and selected-target ownership scope; human CLI and exact JSON/MCP modes share it.
  Foreign or missing ownership is opaque 404, integrity conflict is opaque 409, and HTTP diagnostics are `no-store`.

The bounded hub route is `GET /api/test-runs/:runId/diagnostics`; it is intentionally outside the coordinator lease
route table and is hub-only in Appraise 0.5.

`project_diagnostic` is also the unified agent preflight. Its optional `observedTools`, `observedResources`, and
`expectedTargetWorkspacePath` inputs compare the immutable current-task snapshot and intended target binding against
the running Appraise server. The response keeps application/identity, active MCP transport, current-task capability,
and target-binding layers distinct. With no observed snapshot it returns `needs_observation` instead of claiming the
client is ready. It also includes bounded capability metadata for stale-server checks: package version, MCP surface
version, server start time, capability counts, workflow sentinel tools/resources, and the full capability resource
link. `appraise://project` retains the complete workflow-critical tool and resource lists. Recovery text identifies
missing or stale native MCP capabilities. The tool response projects compact layer statuses and missing sentinels;
when all layers and the explicit target binding are ready, its next action advances directly to
`planning_session_create` instead of asking the agent to choose the already-bound target again.

Each diagnostic call writes its exact preflight snapshot through the authenticated `POST /diagnostic/preflight`
coordinator operation. Receipts are append-only and idempotent by coordinator plus content hash, optionally bound to
the registered target project, and returned with a direct `/projects?preflight=<receipt>` URL. The Projects UI renders
the four layers without recomputing or inferring the immutable client snapshot. The MCP E2E certification exercises
both hub-bound and registered-target ready receipts against the real server and UI.

### Validation AST recovery

`validation_ast_check` is read-only and both check and preview require the authoritative plan to remain in a
validation-preparation lifecycle. Preview returns exact `previewHash`, `contextHash`, and `receiptHash` values and
records one deduplicated, bounded `validation_ast_previewed` plan event. The plan review UI renders that event's
scenario steps, actions, coverage claims, blockers, and semantic warnings before compilation; it never treats the
event as approval or executable authority.
`validation_ast_compile` accepts only that exact receipt and prepares a durable idempotent publish operation before
writing artifacts or projecting canonical entities.

Preview semantic checks add advisory warnings for contradictory persistence claims, including observations performed
before reload and observations of an entity that an earlier step appears to remove. Warnings remain reviewable and do
not replace deterministic compiler blockers or human approval.

On success, compile responses include the exact project-scoped `review=validation` browser URL, the Appraise resource
URL, and validation-review standby guidance. No additional plan read is required to discover the review surface.

Stale plan, target, catalog, locator, environment, extension-policy, preview, projection, or artifact hashes return a
conflict. Re-read context and preview rather than retrying with an old receipt. A retry with the same exact inputs
resumes the same operation; changed inputs require a new preview. Recovery advances only through adjacent prepared,
artifacts-written, projected, and review-ready phases. It never executes generated code or bypasses validation review.
After `review_ready`, continue through the ordinary Appraise-owned validation review gate.

### Named hash families

Hashes use recursively key-sorted JSON with a domain discriminator before SHA-256 digesting. `planContentHash`
covers reviewed plan fields except lifecycle, `reviewBindingHash` binds that content hash to its revision, and
`planStateHash` binds content hash, revision, and lifecycle. Lifecycle-only transitions preserve `planContentHash`
and change `planStateHash`. Plan events persist the previous and resulting state hashes, stable content hash,
revision, sequence, and actor.

The plan response temporarily retains `contentHash` as an alias of `planContentHash`; new integrations must use the
named field. Validation-publication, runtime-input, and completion-receipt hashes keep their explicit domain names
and cover their complete canonical contract payloads. Stale writes report expected and current named hashes.

## Lifecycle Ownership

### Planning responsibility boundary

The connected agent converts the user brief and repository context into plan tasks, acceptance criteria, validation
intent, dependency edges, and implementation groups. `planning_session_create` and `plan_create` accept that explicit
plan and reject malformed references through the plan schema. AppraiseJS does not use product-domain classifiers,
keyword templates, or deterministic task synthesis. Human reviewers correct omissions through the normal Appraise plan
review and revision loop.

Use one normal writer for each workflow surface. User/Appraise UI owns review decisions: plan approval and change
requests, validation node and changed-file decisions, validation review submission, baseline acceptance and
acknowledgements, regression-pass justification, cancellation interrupts, and final completion approval. MCP tools that
write those decisions are relays for explicit Appraise/user intent.

The connected agent owns execution mechanics after each review gate opens the next phase: validation preparation and
publish, `baseline_start`, `baseline_reconcile`, `implementation_start`, implementation checkpoints, implementation
task progress, and implementation validation reconciliation.

Bounded catalog and event reads are explicit: `actions_list.limit` accepts 1-100, and `plan_events_read` defaults to
compact event envelopes containing sequence/type plus cursor metadata. Request `responseMode: "full"` only when an
event payload is required for a bounded diagnostic. Baseline reconciliation summaries retain `currentValidationHash`
so a repair can call `baseline_retry` without a stale-hash discovery round trip.

`implementation_group_approve` is the authoritative group-entry checkpoint. Its response immediately recommends
`implementation_task_update` for one returned runnable task; clients should not issue a duplicate `before_group`
checkpoint. Eligibility conflicts return structured `GROUP_APPROVAL_REQUIRED` or `PREDECESSOR_NOT_VERIFIED` blocker
objects with exact recovery inputs.

Managed implementation validation follows this sequence:

```text
implementation_validation_start -> implementation_validation_reconcile -> implementation_completion_review
```

Managed capsules now start automatically, so current callers do not invoke `test_run` again. Start responses expose
both the implementation validation run `id` and canonical public `testRunId`; `implementation_validation_reconcile`
accepts either identity and normalizes it to the implementation run before persisting reconciliation evidence.

Required runtime validations pass completion only when a fresh managed Appraise `TestRun` is bound to the
implementation validation run and has passed. Manual evidence through `implementation_validation_record` is retained as
explicit reduced-assurance evidence and must not be treated as ordinary managed runtime proof.

Plan-bound standalone `test_run` requests must include exact `expectedTestCases` suite/case associations. They are
created atomically with the run before scheduling. Implementation reconciliation accepts optional paired
`verifyTaskIds` and `idempotencyKey` fields for atomic evidence reconciliation and task verification.

Completion receipts include the latest event sequence in their evidence hash. A stale completion mutation responds
with `staleEvidenceHash`, `currentEvidenceHash`, and `currentReceipt`; callers must obtain a new explicit final sign-off.

Completion approval journals a private transaction record before changing final artifacts. Each write is
idempotent and completion reads or approval replays recover interrupted validation, review, projection sync,
`plan_completed`, and terminal plan writes. The `completed` lifecycle is written last, so it always has the exact
final sign-off and completion event. Released evidence protection is valid after signed-off completion because the
managed run identities and all evidence and sign-off hashes remain immutable.

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

After `validation_preparation_started`, agents author a managed Validation AST from exact action and locator catalogs.
They call `validation_ast_check`, then `validation_ast_preview`, obtain exact human review of the preview receipt, and
call `validation_ast_compile`. Compilation creates canonical database entities and a durable publish operation with exact
AST, preview, receipt, projection, validation, and runtime-input hashes.
Exact preview review can be performed from the hash-bound MCP response; the browser validation-review surface is
created by compilation and is not a prerequisite for compile. Persisted validation approval still occurs only after
compile through the Appraise-owned validation review gate.
AST capability availability is derived from the current built-in action catalog for each runtime, so discovered browser
keyboard and viewport actions remain authorable without custom extensions.

Managed baseline and implementation runs execute only immutable Appraise-owned runtime capsules. Target repository
files are never managed execution authority; optional repository export is a separate receipt-bound operation.

## Local Smoke Test

Validation AST authoring is target-project scoped. Shared resources are returned only by explicit bounded search and
include provenance. Ambiguous locator or action matches block check/preview until the AST binds exact catalog identities.

`validation_context_read` also returns a bounded authoring bundle: approved intent and constraints, requirement and
task IDs, target metadata, reusable-resource counts, task/requirement coverage, registry-first recipes, an editable
AST starter, and a deterministic content-addressed JSON export accepted by `validation_ast_check`. Starter coverage is
deliberately `uncovered`; the agent remains the semantic author and must replace placeholder observations before
check/preview. A legacy or resource-only plan with no tasks keeps the surrounding authoring context available but
returns `astStarter.readiness: unavailable_no_plan_tasks`, a null submission, and no AST exchange. Missing greenfield
environment identity produces a review-required Appraise-resource proposal with no target-workspace mutation.

Plan event responses contain both the canonical `events` array and a derived `notifications` array. Each notification
keeps its source event sequence and identifies the responsible actor; event acknowledgement remains the only durable
consumption mechanism. The projection covers review readiness, requested changes, approvals, blocked attempts,
recovery or review readiness, and completion-signoff requirements without creating parallel lifecycle state.

Lifecycle and diagnostic tools support `summary`, `blockersOnly`, `evidenceOnly`, and explicit `full` modes. Default
mutations return lifecycle delta, critical IDs and hashes, counts, links, blockers, cursor state, and exactly one legal
next action. Contract tests enforce initial ceilings of 1,000 estimated tokens for diagnostics, 2,000 for plan creation,
300 for unchanged waits, and 1,500 for validation or baseline mutations. Compact modes never omit recovery IDs or
actions; full artifacts remain behind content-addressed reads.

With AppraiseJS running on port 3000:

```bash
npm run smoke:coordinator
```

The smoke test creates a minimal plan through the authenticated API and waits for its `plan_review_ready` event.
Validation publication and baseline start/reconcile apply the same contract. Summary responses keep lifecycle deltas,
canonical artifact hashes and paths, counts, attempt/TestRun identity, blockers, links, and the next legal action ahead of any
optional artifact body. Cursor reads are ascending, bounded, include the newest delivered event explicitly, and
unchanged plan or validation waits return only cursor, timing, and next-action deltas.
