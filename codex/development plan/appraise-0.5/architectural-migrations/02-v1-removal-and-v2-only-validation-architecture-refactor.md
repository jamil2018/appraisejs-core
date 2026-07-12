# V1 Removal And V2-Only Validation Architecture Refactor

## Status

Proposed for AppraiseJS 0.5. Awaiting human review before implementation.

This plan supersedes the compatibility and strangler-migration decisions in
`01-agent-authored-validation-ast-and-appraise-runtime-migration.md` wherever that document preserves v1 validation
authoring, mixed v1/v2 artifacts, target-workspace managed execution, or backward compatibility for experimental v1
data. Migration 01 remains historical evidence for the v2 Validation AST and immutable runtime-capsule architecture.

## Executive Summary

AppraiseJS currently contains two managed-validation architectures:

1. An experimental v1 workflow based on `appraise.validation/v1`, validation drafts, generated `automation/` files,
   target-workspace runtime projection, and legacy TestRun execution.
2. The intended v2 workflow based on reviewed Validation AST publish operations, exact provenance, Appraise-owned
   immutable runtime capsules, bounded preflight, and capsule-owned evidence.

The v2 runtime was added without removing v1. Live MCP resources, skills, active documentation, setup scripts, error
messages, tests, and scaffold copies still advertise v1 as the preferred happy path. Baseline and implementation
services then branch per validation node between legacy and capsule execution. This dual architecture repeatedly sends
agents into obsolete runtime behavior and produces familiar failures involving target-local loaders, missing imports,
tag selection, stale TestRuns, target-path drift, and unavailable diagnostics.

V1 was experimental and was not released to end users. There is no requirement to preserve v1 plans, validations,
TestRuns, generated files, API compatibility, or mixed artifacts. The refactor will therefore remove v1 completely,
purge all affected data and files, and make v2 the only managed-validation architecture.

The result must be smaller than the current system. This is a deletion-oriented refactor, not a compatibility layer,
adapter, silent converter, or second migration framework.

## Non-Negotiable Decision

> Every Appraise-managed validation is a reviewed v2 Validation AST publication and every Appraise-managed test run
> executes an exact Appraise-owned immutable runtime capsule.

Consequences:

- No managed validation may exist without exact v2 provenance.
- No managed TestRun may exist without a RuntimeCapsule and execution attempt.
- New or existing lifecycle code may not fall back to target-workspace managed execution.
- V1 plans, validations, decisions, attempts, runs, evidence, and generated files are deleted rather than upgraded.
- Mixed v1/v2 plans are deleted as a whole and must be recreated through v2.
- V1 MCP, HTTP, package-client, CLI, skill, UI, documentation, test, and scaffold contracts are removed.
- Repository export remains optional distribution and never becomes execution authority.
- Manual test management remains a separate product capability and must not be confused with managed plan validation.

## Why Complete Removal Is Required

The current transition failed at the routing boundary, not because v2 capsules were fundamentally unavailable.

The live MCP validation workflow currently declares `validation_draft_publish` and `appraise.validation/v1` as the
preferred contract. The installed validation-preparation skill repeats that guidance. Setup and harness scripts expect
`validation_publish`. Error recovery redirects malformed requests back to the v1 workflow. Tests assert those choices.
When an agent follows the advertised contract, the created validation lacks v2 provenance, and baseline and
implementation services deliberately route it through legacy target-workspace execution.

Earlier agents repaired the resulting symptoms because:

- the MCP resource was presented as authoritative;
- historical architectural plans were not part of the normal routing path;
- v2 tools appeared adjacent to, rather than replacing, the v1 workflow;
- validation review did not expose execution mode or provenance;
- v1 publication and approval succeeded without warnings;
- legacy TestRun diagnostics were incomplete or returned opaque 404 responses;
- familiar import, tag, path, and runtime failures looked like local artifact defects;
- compatibility tests signaled that mixed execution was intentional product behavior.

Removing v1 from all discovery and execution surfaces is therefore necessary for correctness and agent reliability.

## Scope

### In scope

- Destructive inventory and purge of all v1-affected plans and artifacts.
- Mandatory v2 provenance for every managed validation.
- Mandatory RuntimeCapsule ownership for every managed TestRun.
- Removal of v1 authoring, publication, review, execution, diagnostics, recovery, and compatibility contracts.
- Removal of mixed v1/v2 routing from baseline and implementation validation.
- Removal of target-workspace managed runtime projection.
- Separation of v2 canonical entity projection from obsolete runtime materialization.
- Separation of manual TestRun execution from Appraise-managed validation execution.
- MCP, package client, CLI, HTTP, UI, documentation, skill, harness, test, and scaffold cleanup.
- Removal of stale historical v1 plans from the shipped repository.
- Static-analysis-driven cleanup of code orphaned specifically by v1 removal.
- A literal fresh-target lifecycle proving the v2-only architecture end to end.

### Out of scope unless separately approved

- Removing manual TestSuite, TestCase, Module, Locator, Tag, Environment, template-step, or Step Block features.
- Removing manual user-authored test execution.
- Replacing the v2 Validation AST schema with another semantic authoring model.
- Replacing runtime capsules or their internal versioned contracts.
- Removing optional transactional repository export.
- Removing plan `legacyPlanId` solely because its name contains `legacy`; that belongs to the separate plan-identity
  transition.
- Deleting every schema with `version: 1`; several v2 subsystems intentionally use version 1 of their own bounded
  serialization contracts.
- Unrelated Fallow findings or general UI cleanup.

## Architectural Boundaries To Preserve

### Manual test-management plane

Appraise may continue to let users manually create and manage suites, cases, steps, locators, tags, modules,
environments, templates, and manual TestRuns. These are product domains, not inherently v1 artifacts.

### V2 control plane

Appraise owns plans, reviewed AST publications, canonical logical validations, task coverage, exact provenance,
decisions, baseline state, implementation checkpoints, and completion evidence.

### V2 execution plane

Each managed run owns an immutable capsule beneath:

```text
.appraise/projects/<target-project-id>/runtime/<validation-hash>/<run-id>/
```

The capsule owns its command receipt, config, generated feature, bindings, support files, exact dependencies, logs,
reports, screenshots, traces, and evidence summary.

### Optional export plane

Repository export may write reviewed artifacts into a target only through a separate, receipt-bound, transactional
operation. Exported files are never imported as managed runtime authority.

## Confirmed Drift Inventory

### MCP and agent discovery

- `packages/appraisejs/src/mcp.ts` advertises `validation_draft_publish` as preferred.
- `appraise://workflow/validation-preparation` exposes the v1 artifact skeleton.
- V1 and v2 tools coexist without a mandatory routing distinction.
- MCP tests protect `appraise.validation/v1` as the preferred contract.
- `scripts/print-agent-config.mjs` advertises `validation_publish` as critical.
- `scripts/check-agent-harness.mjs` requires v1 capability text.
- Coordinator boundary allowlists include the v1 publication surface.

### Agent skills and active documentation

- `.agents/skills/appraise-validation-preparation/SKILL.md` instructs agents to create `automation/features` and
  `automation/steps`.
- `docs/agent-lifecycle-flow.md`, `docs/agent-mcp-setup.md`, and `docs/coordinator-api-mcp.md` describe v1 publication
  as the normal post-plan workflow.
- `docs/agent-real-subagent-audit-protocol.md` defines success by observing `validation_publish`.
- Error recovery in `src/lib/coordinator-api/contracts.ts` redirects agents toward the v1 workflow.

### Authoring and storage

- `src/services/coordinator/coordinator-validation-draft-service.ts` implements a complete competing authoring system.
- Drafts are stored under `appraise/plans/validation-drafts/`.
- Shared plan-contract and package schemas permit validation nodes without v2 provenance.
- V1 paths, changed-file evidence, runtime projections, and manifest paths remain part of the primary artifact shape.
- Package client methods and internal routes still publish or mutate v1 artifacts.

### Execution and evidence

- Baseline partitions validation nodes into legacy and v2 groups.
- Implementation validation repeats the same branch.
- Target runtime projection generates features, step imports, configs, and reports outside Appraise-owned capsule
  storage.
- TestRun services and artifact routes support managed-but-not-capsule-backed evidence.
- Capsule diagnostics and legacy diagnostics do not share one reliable public identity contract.
- The UI does not visibly reject or distinguish unprovenanced managed validations.

### Tests and scaffold

- Unit, integration, E2E, MCP, and package tests preserve v1 and mixed behavior.
- `packages/create-appraisejs/templates/base` contains root copies of the same legacy services, scripts, routes,
  schemas, tests, and docs-adjacent guidance.
- Historical v1 development plans remain searchable and can steer agents back toward obsolete behavior.

## Target End State

```text
Plan approved
    |
    v
Validation AST authoring from exact Appraise action and locator catalogs
    |
    v
validation_ast_check
    |
    v
validation_ast_preview + exact review receipt
    |
    v
validation_ast_compile + durable v2 publish operation
    |
    v
Human validation review and approval
    |
    v
Immutable Appraise-owned runtime capsule
    |
    +--> Baseline TestRun and evidence
    |
    +--> Implementation TestRun and evidence
    |
    v
Completion review and sign-off

Target repository
    +--> product implementation only
    +--> optional transactional export when explicitly requested
    +--> no Appraise-managed runtime artifacts
```

## Data Classification And Purge Rules

### V1-affected plan

A plan is v1-affected when any stored current or historical validation node lacks exact v2 provenance, has a
provenance schema other than v2, or is bound to a v1 publication/draft contract. Mixed plans are v1-affected in full.

### V2-valid plan

A plan is v2-valid only when every managed validation node has:

- `astProvenance.schemaVersion === "2"`;
- an existing `ValidationAstPublishOperation`;
- matching plan, target, AST, preview, projection, validation, runtime-input, and receipt hashes;
- a publish operation in a valid completed/review-ready phase;
- no v1 draft or legacy managed-runtime dependency.

### Managed TestRun

A TestRun is managed when it is bound to an Appraise plan validation, baseline attempt, or implementation validation.
Every retained managed TestRun must have a RuntimeCapsule and RuntimeCapsuleExecutionAttempt with matching ownership.

### Purge unit

The purge unit is the complete v1-affected plan ownership graph. Do not attempt to preserve a v2-looking node inside a
mixed plan. Partial preservation would retain ambiguous review, event, attempt, and evidence history.

### Purge contents

For every v1-affected plan, delete or tombstone as appropriate:

- plan projection, plan artifact, revisions, tasks, layouts, remarks, review decisions, events, and coordinator lease;
- v1 validation draft, published validation sidecar, validation decisions, approvals, feedback, and review state;
- baseline attempts, acknowledgements, decision events, repair attempts, and TestRun associations;
- implementation checkpoints, validation runs, evidence records, completion receipts, and sign-off state;
- managed TestRuns, TestRunTestCase rows, reports, logs, traces, screenshots, metrics derived solely from those runs,
  and artifact paths;
- provider runs or continuation packages whose authority is bound only to the deleted plan;
- plan-owned projected modules, suites, cases, steps, locator groups, locators, and identifier tags when no retained v2
  plan or manual user record references them;
- target `automation/features`, `automation/steps`, `automation/reports`, locator caches, generated configs, and mapping
  files produced by the v1 managed workflow;
- `appraise/plans/validation-drafts/<plan-id>*`, v1 validation sidecars, review sidecars, and orphaned manifest files;
- stale repository export jobs or receipts whose source publication belongs to the deleted plan.

### Purge safety requirements

- Provide an inventory-only dry run before deletion.
- Print counts and stable IDs, not tokens, secrets, full artifacts, or unbounded payloads.
- Refuse to run while affected managed executions are active.
- Use one database transaction for each plan graph or a bounded transaction batch with a durable purge journal.
- Resolve and validate every filesystem path against the owning Appraise or registered target root.
- Reject symlink escapes and foreign ownership.
- Make retries idempotent.
- Verify zero orphaned rows and zero owned files after completion.
- Do not preserve v1 evidence as v2 evidence.
- Do not silently convert v1 plans.

## Implementation Tranches

## Tranche 0: Freeze V1 Creation

### Task 0.1: Add the v2-only invariant at publication boundaries

**Description:** Reject any newly published managed validation that does not carry exact reviewed v2 provenance.

**Acceptance criteria:**

- New required and optional managed validations require v2 provenance.
- V1 draft and full-artifact publication cannot create new review-ready state.
- Errors direct callers to AST check/preview/compile and never to a v1 tool.

**Likely files:**

- `src/lib/plan-contract/schemas.ts`
- `src/services/coordinator/coordinator-validation-service.ts`
- `src/services/coordinator/validation-ast-operation-service.ts`
- corresponding focused tests

**Verification:**

- Focused schema and coordinator tests.
- Negative test proving an unprovenanced node cannot publish.
- Positive test proving a reviewed v2 operation still publishes idempotently.

### Task 0.2: Add the capsule-only invariant for managed TestRuns

**Description:** Prevent creation or progression of a managed baseline or implementation TestRun without a capsule.

**Acceptance criteria:**

- Managed runs require RuntimeCapsule ownership before execution.
- Manual TestRuns remain explicitly distinguishable and functional.
- No managed fallback invokes `local-executor-adapter`.

**Likely files:**

- `src/services/test-run/test-run-service.ts`
- `src/services/test-run/runtime-capsule-test-run-service.ts`
- `src/services/coordinator/coordinator-baseline-service.ts`
- `src/services/coordinator/coordinator-implementation-service.ts`

**Verification:**

- Focused TestRun, baseline, and implementation tests.
- Negative test for a managed run without a capsule.

### Checkpoint 0

- V1 can no longer be created.
- Existing v1 data remains readable only for the purge inventory.
- V2 literal capsule lifecycle remains green.

## Tranche 1: Inventory And Purge Experimental V1 Data

### Task 1.1: Build a bounded v1 inventory service and dry-run command

**Description:** Identify every v1-affected plan, related database row, target path, and Appraise-owned artifact before
deletion.

**Acceptance criteria:**

- Classification detects missing, v1, stale, foreign, and broken provenance.
- Mixed plans are classified as v1-affected.
- Output is bounded, deterministic, and contains counts plus stable IDs.

**Likely files:**

- new `src/services/migration/v1-removal-inventory-service.ts`
- package CLI command wiring
- focused real-SQLite tests

**Verification:**

- Fixtures for pure v1, pure v2, mixed, orphaned, active-run, and foreign-path states.
- Repeated dry runs return the same inventory.

### Task 1.2: Implement the destructive database purge

**Description:** Delete the complete ownership graph for every approved v1-affected plan.

**Acceptance criteria:**

- Deletion is transactional or journaled, bounded, and idempotent.
- Active executions block deletion.
- Shared manual or retained v2 domain entities are not deleted.

**Likely files:**

- new `src/services/migration/v1-removal-purge-service.ts`
- Prisma migration or migration command support
- real-SQLite integration tests

**Verification:**

- Purge twice without error or additional mutation.
- Foreign/manual/v2 references survive.
- No orphaned plan, event, attempt, TestRun, report, or projection rows remain.

### Task 1.3: Purge owned filesystem artifacts safely

**Description:** Delete Appraise-owned v1 drafts and target files generated by managed v1 runs.

**Acceptance criteria:**

- Only inventory-approved owned paths are removed.
- Symlinks, escapes, and foreign files are rejected.
- Product source and manually authored tests are preserved.

**Likely files:**

- migration purge service
- existing containment helpers under `src/lib/runtime-capsule/`
- filesystem integration tests

**Verification:**

- Containment, symlink, replay, partial-failure, and foreign-file tests.

### Checkpoint 1: Human destructive-action gate

- Review dry-run counts, plan IDs, TestRun IDs, and path summaries.
- Confirm no released user data is present.
- Explicitly approve the purge execution.
- Run the purge and verify a zero-v1 postcondition.

## Tranche 2: Replace MCP, CLI, Package, And HTTP Contracts

### Task 2.1: Make the v2 workflow the only MCP happy path

**Description:** Rewrite the agent guide and validation-preparation resource around AST check, preview, compile, review,
and capsule execution.

**Acceptance criteria:**

- No MCP resource recommends v1 tools or `automation/` paths.
- Recommended next actions are bounded and v2-only.
- The happy path includes exact receipts and review gates.

**Likely files:**

- `packages/appraisejs/src/mcp.ts`
- `packages/appraisejs/src/mcp.test.ts`
- `packages/appraisejs/src/mcp.e2e.ts`

**Verification:**

- Contract snapshot tests.
- Response-budget tests.
- Tool discovery test from a clean client.

### Task 2.2: Remove v1 MCP tools and package-client methods

**Description:** Delete draft, node, file, metadata, and full-artifact publication operations.

**Remove:**

- `validation_draft_create`
- `validation_draft_read`
- `validation_draft_reset`
- `validation_node_upsert`
- `validation_node_delete`
- `validation_test_case_upsert`
- `validation_test_shape_propose`
- `validation_file_upsert`
- `validation_file_delete`
- v1 step-metadata mutation
- `validation_draft_check`
- `validation_draft_publish`
- legacy `validation_publish`
- legacy automation import preview if it exists solely for v1 migration

**Acceptance criteria:**

- Tools disappear from discovery, package types, client methods, and CLI help.
- No compatibility aliases remain.
- V2 tools remain source-compatible with the current capsule path.

**Likely files:**

- `packages/appraisejs/src/mcp.ts`
- `packages/appraisejs/src/coordinator-client.ts`
- `packages/appraisejs/src/cli.ts`
- `packages/appraisejs/src/plan-file.ts`

**Verification:**

- Package tests and type generation.
- Negative discovery assertions for every removed tool.

### Task 2.3: Remove v1 internal HTTP routes and error recovery

**Description:** Delete route dispatch, allowlist entries, request schemas, and recovery text for v1 operations.

**Acceptance criteria:**

- Removed endpoints return not found rather than compatibility behavior.
- Validation errors recommend only legal v2 recovery actions.
- Coordinator boundary tests describe the v2 surface exactly.

**Likely files:**

- `src/app/api/internal/coordinator/[...operation]/route.ts`
- `src/app/api/internal/coordinator/coordinator-boundary.test.ts`
- `src/lib/coordinator-api/contracts.ts`

**Verification:**

- Route and boundary tests.
- Package client E2E tests.

### Task 2.4: Update setup and capability checks

**Description:** Replace v1 expected capabilities in setup, doctor, and harness checks.

**Acceptance criteria:**

- Fresh setup advertises AST and capsule-critical tools.
- Stale clients receive explicit reconnect guidance.
- Harness validation fails if v1 guidance reappears.

**Likely files:**

- `scripts/print-agent-config.mjs`
- `scripts/check-agent-harness.mjs`
- setup and harness tests

**Verification:**

- `npm run setup:agent`
- `npm run setup:mcp`
- `npm run check:harness`

### Checkpoint 2

- A fresh agent cannot discover or be instructed to use v1.
- Package and HTTP consumers cannot call v1.
- V2 publication remains reviewable and executable.

## Tranche 3: Delete V1 Authoring And Artifact Storage

### Task 3.1: Delete the validation draft service

**Description:** Remove the competing v1 authoring system and its routes, schemas, helpers, and tests.

**Acceptance criteria:**

- `coordinator-validation-draft-service.ts` is deleted.
- `appraise/plans/validation-drafts/` is no longer created or read.
- No v2 service imports a draft helper.

**Verification:**

- Typecheck and focused coordinator tests.
- Repository search for draft tool and directory identifiers.

### Task 3.2: Remove v1 artifact schemas and file-oriented fields from managed contracts

**Description:** Make managed validation types express v2 provenance and logical/capsule identity rather than repository
runtime paths.

**Acceptance criteria:**

- Managed schemas require v2 provenance.
- `runtimeProjections`, v1 changed-file runtime authority, and target-managed manifest fields are removed from managed
  execution contracts.
- Optional repository-export types remain separate.

**Likely files:**

- `src/lib/plan-contract/schemas.ts`
- `packages/appraisejs/src/plan-file.ts`
- validation AST canonical projection types

**Verification:**

- Contract parity tests.
- Negative schema tests for v1 artifacts.

### Task 3.3: Preserve reusable resolution only through v2

**Description:** Move any valuable action, template-step, Step Block, and locator resolution logic out of the deleted
draft service and into v2-owned modules.

**Acceptance criteria:**

- Resolver behavior has one implementation.
- No resolver returns target step paths as managed execution authority.
- AST authoring remains token-bounded and registry-first.

**Verification:**

- Resolver ranking and AST compilation tests.
- No duplicate resolution implementations remain.

### Checkpoint 3

- No v1 authoring code or storage remains.
- V2 authoring retains required registry and locator capabilities.
- Static analysis identifies newly orphaned code for later deletion.

## Tranche 4: Collapse Managed Execution Onto Capsules

### Task 4.1: Remove mixed baseline execution

**Description:** Delete legacy partitioning, target runtime preparation, and fallback TestRun creation from baseline.

**Acceptance criteria:**

- Baseline accepts only exact v2 publication provenance.
- Every baseline attempt is capsule-backed.
- No baseline branch invokes target runtime projection or local executor fallback.

**Likely files:**

- `src/services/coordinator/coordinator-baseline-service.ts`
- baseline tests and fixtures

**Verification:**

- Capsule baseline tests.
- Negative unprovenanced/missing-operation tests.

### Task 4.2: Remove mixed implementation validation

**Description:** Delete legacy preparation keys, manual managed-evidence fallbacks, and non-capsule required-validation
paths.

**Acceptance criteria:**

- Required implementation validation is capsule-backed.
- Manual evidence remains explicitly reduced assurance and cannot satisfy required validation.
- Reconciliation consumes one evidence model.

**Likely files:**

- `src/services/coordinator/coordinator-implementation-service.ts`
- implementation tests and fixtures

**Verification:**

- Managed implementation validation lifecycle tests.
- Completion-gate tests.

### Task 4.3: Separate manual TestRuns from managed TestRuns

**Description:** Make execution ownership explicit so manual product runs can continue without preserving legacy managed
behavior.

**Acceptance criteria:**

- Managed runs are capsule-only.
- Manual runs use a clearly separate creation and evidence path.
- Public summaries expose run ownership without ambiguous inference.

**Likely files:**

- `src/services/test-run/test-run-service.ts`
- `src/lib/executor/local-executor-adapter.ts`
- TestRun schemas and UI loaders

**Verification:**

- Manual-run E2E.
- Managed capsule lifecycle E2E.
- Negative cross-mode tests.

### Task 4.4: Unify managed diagnostics and artifact access

**Description:** Route every managed report, log, trace, screenshot, archive, and diagnostic through capsule ownership.

**Acceptance criteria:**

- Every returned managed TestRun ID is immediately readable and diagnosable.
- Managed diagnostics never return an unexplained legacy 404.
- Ownership and containment remain enforced.

**Likely files:**

- runtime capsule diagnostic service
- TestRun artifact gateway
- logs, reports, traces, screenshots, and download routes

**Verification:**

- Artifact route integration tests.
- Queued, running, failed-preflight, failed-spawn, completed, and cancelled states.

### Checkpoint 4

- Managed baseline and implementation execution have one code path.
- Manual TestRuns remain functional but cannot masquerade as managed evidence.
- Target workspaces receive no managed runtime files.

## Tranche 5: Split Canonical Projection From Runtime Materialization

### Task 5.1: Extract v2 canonical entity projection

**Description:** Preserve the v2 compiler's ability to create reviewable modules, suites, cases, steps, locators, and
identifier tags without retaining legacy runtime projection.

**Acceptance criteria:**

- Canonical entity projection has no filesystem or executor dependency.
- Ownership and collision checks remain exact.
- UI and report relationships continue to use canonical entities.

**Likely files:**

- split `src/services/coordinator/validation-runtime-projection-service.ts`
- validation AST compiler and operation services

**Verification:**

- Real-SQLite projection tests.
- Collision and idempotency tests.

### Task 5.2: Delete target-workspace managed runtime materialization

**Description:** Remove feature generation, step copying, runtime preflight, target report paths, and support-import
logic used solely by v1 managed execution.

**Acceptance criteria:**

- No managed service writes to target `automation/`.
- No target-local loader or dependency resolution is possible for managed runs.
- Repository export is the only managed feature that may intentionally write generated test artifacts to a target.

**Verification:**

- Fresh-target filesystem snapshot before and after a complete lifecycle.
- Repository search for target managed runtime helpers.

### Task 5.3: Remove obsolete runtime classifications and recovery actions

**Description:** Delete failure codes and next actions that exist only for legacy target runtime preparation.

**Acceptance criteria:**

- Remaining failure taxonomy maps to capsule preflight, execution, evidence, or product-test failures.
- No recovery tells agents to materialize target validation files.

**Verification:**

- Error contract tests and documentation review.

### Checkpoint 5

- Canonical projection is database/control-plane only.
- Capsule materialization is execution-plane only.
- Repository export is distribution-plane only.

## Tranche 6: UI, Skills, Documentation, And Audit Protocol

### Task 6.1: Enforce v2 provenance in review UI

**Description:** Make invalid managed state explicit and prevent approval of unprovenanced validation evidence.

**Acceptance criteria:**

- Review UI shows v2 publication and capsule identity.
- Unprovenanced managed nodes fail closed.
- No legacy/mixed decision controls remain.

**Verification:**

- Component and browser tests.
- Manual review of plan, validation, baseline, run, and completion pages.

### Task 6.2: Rewrite active agent documentation and skills

**Description:** Align every current guidance surface with the v2-only workflow.

**Likely files:**

- `.agents/skills/appraise-validation-preparation/SKILL.md`
- `.agents/skills/appraise-baseline/SKILL.md`
- `.agents/skills/appraise-implementation/SKILL.md`
- `docs/agent-lifecycle-flow.md`
- `docs/agent-mcp-setup.md`
- `docs/coordinator-api-mcp.md`
- `docs/test-run-runtime.md`
- `docs/agent-generated-artifacts.md`
- `docs/automation-sync-rules.md`
- `docs/validation-ast-contracts.md`

**Acceptance criteria:**

- No active guidance describes v1 as executable.
- Managed validation never instructs agents to create target automation files.
- Ownership boundaries are consistent across all docs.

**Verification:**

- `npm run check:harness`
- targeted terminology searches

### Task 6.3: Rewrite the real-subagent audit protocol

**Description:** Make a fresh v2-only lifecycle the canonical product regression.

**Acceptance criteria:**

- Audit observes AST check, preview, compile, review, capsule baseline, implementation validation, and completion.
- Audit fails if target automation files appear.
- Audit records response size, retries, and provenance evidence.

**Verification:**

- Run the protocol against a fresh empty target.

### Task 6.4: Delete stale v1 development plans

**Description:** Remove historical plans that prescribe v1 authoring or compatibility from the shipped repository.

**Acceptance criteria:**

- Git history remains the only historical source.
- Current plan references do not point to deleted documents.
- Surviving audits are retained only when they are clearly evidence, not executable guidance.

**Verification:**

- Link and harness checks.
- Repository-wide search for deleted filenames and v1 recommendations.

### Checkpoint 6

- Human and agent surfaces expose one architecture.
- The canonical audit exercises that architecture.
- Historical v1 guidance cannot be discovered as current instruction.

## Tranche 7: Tests, Scaffold Sync, And De-Bloating

### Task 7.1: Delete v1 and mixed-flow tests

**Description:** Remove tests whose purpose is preserving obsolete behavior and replace only the necessary invariants
with v2 tests.

**Delete or rewrite coverage for:**

- v1 MCP preference;
- draft publication;
- target runtime projection;
- mixed baseline and implementation execution;
- legacy managed TestRun collision and retry behavior;
- v1 diagnostics and recovery;
- v1 schema acceptance.

**Acceptance criteria:**

- No test requires a removed symbol or behavior.
- V2 tests validate behavior rather than compatibility implementation details.

### Task 7.2: Sync canonical root changes into create-appraisejs

**Description:** Regenerate scaffold templates only after root deletion and validation are complete.

**Acceptance criteria:**

- Root and base template contain the same v2-only contracts.
- Removed files do not reappear after template preparation.

**Verification:**

- `npm --prefix packages/create-appraisejs run prepare-template`
- scaffold tests
- generated diff review

### Task 7.3: Remove newly orphaned code and dependencies

**Description:** Use static analysis after architectural deletion to remove pass-through wrappers, unused schemas,
helpers, fixtures, exports, imports, and dependencies made unreachable by v1 removal.

**Acceptance criteria:**

- Cleanup is limited to newly orphaned transition code.
- Unrelated pre-existing findings remain separately tracked.
- No circular or unresolved imports remain.

**Verification:**

- `npm run quality:fallow:commit`
- focused Fallow dead-code, duplication, and health reports
- dependency trace before package removal

### Task 7.4: Reduce oversized orchestration modules

**Description:** After branch deletion, split remaining MCP, baseline, implementation, and projection code by one clear
responsibility without recreating generalized compatibility dispatchers.

**Acceptance criteria:**

- Whole modes and branches are deleted rather than relocated.
- MCP resource definitions, tool registrations, and transport adapters are separated.
- Baseline and implementation services orchestrate capsule-only workflows.

**Verification:**

- Complexity and file-size comparison before and after.
- No behavior regression in v2 lifecycle tests.

### Checkpoint 7

- Scaffolded installations cannot expose v1.
- Static analysis confirms no new dead transition code.
- Code-size and complexity reduction is recorded.

## Tranche 8: Literal V2-Only Lifecycle Acceptance

### Task 8.1: Run a fresh external-target lifecycle

Use a new writable empty target with no package, dependencies, Git history, or `automation/` directory.

Execute:

1. Appraise startup and MCP capability validation.
2. Project diagnostic and registration.
3. Natural-language plan creation.
4. Real UI plan review and approval.
5. V2 AST authoring from bounded action and locator catalogs.
6. AST check and exact preview.
7. Human validation review.
8. AST compile and durable publish operation.
9. Capsule preparation and predictive preflight.
10. Managed baseline execution and evidence reconciliation.
11. Real UI baseline acceptance.
12. Implementation start and task checkpoints.
13. Capsule-backed implementation validation.
14. Completion review and exact final sign-off.

### Task 8.2: Assert architectural containment

**Required assertions:**

- The target receives no generated `automation/` files.
- Every validation node has exact v2 provenance.
- Every managed TestRun has one RuntimeCapsule and execution attempt.
- Every public TestRun ID is readable and diagnosable.
- Capsule preflight and execution consume the same sealed receipt.
- Exact expected cases, tags, scenarios, steps, reports, and evidence counts match.
- No MCP response or error recommends a removed tool.
- No manual evidence satisfies required managed validation.
- Final completion requires fresh valid managed evidence.

### Task 8.3: Run the full release-like validation matrix

**Focused and broad checks:**

- affected-file ESLint and Prettier;
- coordinator, validation AST, capsule, TestRun, route, package, and scaffold tests;
- `npm run check:harness`;
- `npm run validate`;
- `npm run test`;
- `npm run quality:fallow:commit`;
- `npm run quality:react-doctor:commit`;
- `npm run build`;
- `npm run graphify:auto` for committed graph scopes;
- `git diff --check`;
- migration application against a fresh database and a v1-fixture database.

### Final Checkpoint

The refactor is complete only after the literal lifecycle passes and the target workspace remains free of managed
runtime artifacts.

## Required Repository-Wide Absence Checks

Live source, current docs, skills, tests, and scaffold templates must contain no executable references to:

```text
validation_draft_create
validation_draft_read
validation_draft_reset
validation_node_upsert
validation_node_delete
validation_test_case_upsert
validation_test_shape_propose
validation_file_upsert
validation_file_delete
validation_draft_check
validation_draft_publish
validation_publish
appraise.validation/v1
appraise/plans/validation-drafts
```

Allowed exceptions must be zero unless a migration executable needs one internal detection constant. That constant
must not be exposed through MCP, docs, skills, UI, or normal services and should be deleted after the purge ships.

Additional structural checks:

- No managed service branches on `schemaVersion !== "2"`.
- No managed preparation key contains a `legacy:` variant.
- No managed next action recommends target file materialization.
- No mixed validation fixture remains.
- No managed artifact route infers ownership from the absence of a capsule.
- No target runtime report path is used by managed execution.

## Static Analysis Baseline

Before refactoring, Fallow reported:

- 16 dead-code findings;
- 3 unused files;
- 13 unused exports;
- no circular dependencies;
- no unresolved imports;
- 4.37% duplicated lines;
- 108 functions above configured complexity thresholds;
- health score 87.3/A, with the largest penalties from oversized units and coupling.

These values are comparison evidence, not authorization to mix unrelated cleanup into the refactor. Record the same
metrics after each deletion tranche. Newly orphaned v1 code should fall; unrelated pre-existing findings should remain
separate.

## Change And Commit Strategy

Use a dedicated `codex/` refactoring branch. Keep each tranche reviewable and reversible before the destructive purge
is approved.

Recommended commit sequence:

1. `refactor: require v2 provenance for managed validation`
2. `chore: inventory experimental v1 validation data`
3. `chore: purge experimental v1 plans and artifacts`
4. `refactor: remove v1 coordinator and MCP contracts`
5. `refactor: delete v1 validation authoring`
6. `refactor: make managed execution capsule only`
7. `refactor: separate canonical projection from runtime capsules`
8. `docs: make v2 the only Appraise validation workflow`
9. `test: replace mixed validation coverage with v2 lifecycle invariants`
10. `chore: sync v2-only scaffold templates`
11. `chore: remove orphaned v1 code and dependencies`

Complete file deletions may produce large diffs; keep behavioral changes and generated scaffold sync in separate commits.

## Risks And Mitigations

| Risk                                                         | Impact   | Mitigation                                                                        |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------- |
| Purge deletes manual or valid v2 entities                    | Critical | Purge by v1-affected plan graph, perform reference checks, require dry-run review |
| Mixed plan leaves ambiguous retained evidence                | Critical | Delete the entire mixed plan; do not preserve individual nodes                    |
| V1 remains callable through a hidden route or package method | High     | Absence tests across MCP, HTTP, CLI, package types, and coordinator allowlists    |
| Scaffold reintroduces removed source                         | High     | Root-first deletion followed by `prepare-template` and absence checks             |
| Manual test execution breaks                                 | High     | Explicit manual/managed ownership model and dedicated manual-run E2E              |
| V2 compiler loses useful registry resolution                 | High     | Extract reusable resolution before deleting the draft service                     |
| Repository export becomes runtime authority                  | High     | Keep export receipt-bound, optional, and excluded from capsule inputs             |
| Historical docs continue steering agents                     | Medium   | Delete obsolete v1 plans and validate current doc links                           |
| Deletion merely relocates compatibility code                 | High     | Review for removed modes and branches, not renamed adapters                       |
| Destructive migration cannot recover after interruption      | High     | Idempotent journal, bounded transactions, ownership verification, replay tests    |

## Definition Of Done

- Appraise exposes one managed-validation architecture.
- Every retained managed validation is an exact reviewed v2 AST publication.
- Every managed baseline and implementation validation is capsule-backed.
- No managed execution writes to target `automation/`.
- V1 plans and artifacts have been inventoried, approved for deletion, purged, and verified absent.
- No v1 MCP, HTTP, CLI, package, skill, documentation, UI, test, or scaffold contract remains.
- Manual test management and optional repository export remain functional and isolated.
- Managed TestRun diagnostics are complete for every lifecycle state.
- Static analysis shows transition-code reduction without new unresolved imports or cycles.
- The literal fresh-target lifecycle reaches final Appraise sign-off with valid evidence.

## Open Review Decisions

These decisions must be confirmed before implementation begins:

1. Whether the one-time purge command is retained as an internal maintenance command after successful removal or
   deleted in the same release.
2. Whether legacy automation import preview is removed completely or retained only as a general manual-test import
   feature under a non-managed contract.
3. Whether affected plan source YAML files are physically deleted or retained as inert audit records outside all
   sync/discovery roots. The recommended default is physical deletion because v1 was unreleased.
4. Whether manually authored target `automation/` files can be distinguished reliably from v1-generated files. When
   ownership cannot be proven, the purge must report the path for human review rather than delete it automatically.

The implementation must not start the destructive tranche until these decisions and the inventory output have human
approval.
