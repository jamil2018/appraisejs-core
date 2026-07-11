# Agent-Authored Validation AST And Appraise Runtime Migration

## Status

In progress for AppraiseJS 0.5. Phases 0-2 are complete. Phase 3 Tasks 3.1 and 3.2 are complete and approved;
Tasks 3.3 and 3.4 and the Managed Execution Independence checkpoint are implemented and validated pending user
approval. Phase 3 is implemented and validated but is not human-approved.

### Implementation Progress

#### 2026-07-11: Phase 0 Event And Commit-Evidence Stabilization

- Branch: `codex/validation-ast-phase-0-safety`
- Commit: `df6a4ba4`
- Pull request: [#195](https://github.com/jamil2018/appraisejs-core/pull/195), targeting `appraise-0.5`
- Added idempotent cumulative plan-event acknowledgement through a delivered sequence across the coordinator service,
  internal HTTP contract, package client, and MCP tool surface.
- Made implementation commit-evidence attachment idempotent and independent of a no-op `implemented` task-state
  transition. Exact replays preserve the original evidence timestamp and do not append duplicate task events.
- Added coordinator regression coverage and updated active lifecycle/MCP documentation.
- Validation completed: 19 focused coordinator tests, 86 `packages/appraisejs` tests, agent harness check,
  `build:appraisejs`, Fallow commit gate, and React Doctor 100/100.
- Refreshed committed `src/graphify-out` projections. The initial terminal package refresh stopped at one documentation
  file; this was a workflow gap, not an API-key requirement. The Graphify skill's host-agent semantic extraction is the
  supported no-key continuation path.

This is a partial completion of Task 0.3. Bounded acknowledgement concurrency, atomic task/evidence reconciliation,
and persistent baseline attempt history remain open. Tasks 0.1 and 0.2 require an explicit follow-up audit against
the existing readiness, expected-association, and identifier-normalization implementations before the Phase 0
checkpoint can be marked complete.

#### 2026-07-11: Phase 0 Safety Checkpoint Completion In Progress

- Branch: `codex/validation-ast-phase-0-completion`
- Unified completion review and mutation around one event-sequence-bound receipt evaluator with structured stale
  receipt recovery and plan-scoped event-stream serialization.
- Added bounded per-plan cumulative acknowledgement admission while preserving cross-plan independence.
- Made plan-bound standalone TestRuns create exact expected suite/case associations atomically and canonicalized
  identifier storage with legacy leading-`@` lookup compatibility.
- Added combined idempotent implementation reconciliation that can update managed evidence and verify eligible tasks
  in one validation-artifact compare-and-write.
- Added immutable baseline-attempt facts plus append-only, monotonically sequenced state and decision events. Validation
  feedback now preserves prior attempt and acknowledgement history.
- Integrated validation passed: 83 focused root tests, 86 `packages/appraisejs` tests, 65 `create-appraisejs` tests,
  agent harness validation, scaffold migration preparation, and the production build. Root and Prisma Graphify outputs
  refreshed. Package graph semantic extraction uses Graphify's host-agent fallback when no Gemini/Google key is already
  configured; a missing key is not a limitation.
- Cross-filesystem/database outbox atomicity and unrecoverable pre-migration attempt backfill remain documented
  limitations for later migration infrastructure. The implemented safety checkpoint is bounded to the current
  single-process local coordinator and artifact compare-and-write architecture.

This document supersedes
`bug fixes/27-meditation-plan-builder-agent-coordination-observations-and-fix-plan.md` as the implementation authority.
Plan 27 remains the source audit and regression record. Existing plans 20, 22, 25, and 26 remain useful evidence;
their applicable requirements are consolidated here so implementation is not split between a legacy bug-fix program
and a new architecture.

## Executive Summary

The meditation application audit proved that AppraiseJS can coordinate an agent through planning, validation,
baseline, implementation, managed testing, and completion readiness. It also proved that the current file-oriented
workflow makes the agent work around Appraise instead of with it.

The root architectural deficiency is a split ownership model. Repository files under `automation/` currently act as
canonical validation source, generated projection, runtime input, review evidence, and reusable future automation.
At the same time, Appraise owns the database entities, lifecycle, review hashes, runner, and evidence classifications.
Those responsibilities cannot safely share one mutable filesystem namespace.

The migration establishes this boundary:

> Agents apply intelligence to product intent and compose explicit registered actions into a typed validation AST.
> Appraise exposes capabilities, validates and compiles the AST, owns canonical validation state and runtime
> materialization, executes immutable capsules, records evidence, and optionally exports generated artifacts to the
> target repository transactionally.

Appraise does not need an intelligence layer to infer which action matches prose. It progressively exposes action and
locator catalogs. The agent reads descriptions, selects exact versioned IDs, and submits an action-resolved AST.
Appraise behaves as a compiler and control plane, not as a semantic planner.

All Appraise-managed filesystem artifacts are segmented first by immutable `TargetProject.id`, then by immutable
validation hash and run/export identity. Project display names and paths remain metadata and never determine storage
locations.

## Decision

Adopt a strangler migration rather than a big-bang rewrite.

1. Fix the minimum control-plane and evidence invariants required to keep existing workflows safe.
2. Introduce versioned progressive catalogs and the validation AST alongside legacy authoring.
3. Compile the new AST into existing canonical entities initially.
4. Replace repository-based managed execution with immutable Appraise-owned runtime capsules.
5. Add durable transactional repository export as a distribution feature, never as managed runtime authority.
6. Import existing automation into reviewable AST proposals and deprecate direct generated-file mutation gradually.

Do not spend substantial effort optimizing legacy per-file authoring, target-local generated runtime dependencies,
or bidirectional synchronization that the migration will remove.

## Motivating Audit

### Successful outcome

- Target: `/private/tmp/appraisejs-meditation-breathing-happy-path-20260710`
- Plan: `pln_01kx6ect05hj81tk76pmx423zb`
- Five implementation tasks reached `verified`.
- Final target commit: `a19b5c0b3583d9a268949aa5a7370fc7b5c92c8d`
- Unit/component tests: 11/11 passed.
- Typecheck, lint, production build, and React Doctor 100/100 passed.
- Managed implementation TestRun: `62a59be3-034c-4d18-8c5c-717c14d11c5b`
- Managed evidence: full assurance, valid health, one expected/matched case, one scenario, 2/2 steps passed.
- Lifecycle reached `validation_passed` and completion review returned ready with no blockers.

### Temporary Appraise repairs required to prove the outcome

- Stable physical Cucumber binary resolution instead of compiled `[project]` or `(rsc)` paths.
- Optional-leading-`@` normalization for canonical identifier tags.
- Creation of expected TestRunTestCase/TestSuite links for standalone plan-bound runs.

All temporary source changes were reverted after evidence collection. They define required regression behavior, not a
shipped fix.

### Other proven failures

- Natural-language planning misclassified the meditation brief and required structured fallback.
- A context-isolated subagent could not use relayed user authorization.
- Filtered validation context failed generically; unfiltered fallback was excessive.
- Runtime preflight passed before multiple deterministic runtime failures.
- Target-local runtime preparation caused missing loaders and duplicate Cucumber instances.
- Publish rewrote feature content without one coherent top-level review hash/patch contract.
- Baseline repair removed attempts from plan-visible history.
- Repeated infrastructure repairs caused repeated unchanged human approvals.
- Event acknowledgement backlog saturated the server.
- Commit evidence and validation reconciliation were order-dependent.
- Completion review, UI, hashes, and mutation contradicted one another.
- Full lifecycle responses repeatedly returned unchanged plans, patches, histories, and rendered instructions.

## Root Cause

The current system conflates three planes.

### Repository source plane

The repository legitimately owns:

- product source;
- unit, component, integration, and repository-native E2E tests;
- explicitly authored custom test extensions;
- dependency and compiler configuration;
- source-control history.

### Appraise control plane

Appraise must own:

- plans, revisions, tasks, groups, and lifecycle;
- logical validation definitions;
- action and locator registries;
- modules, suites, cases, ordered action bindings, and environments;
- review decisions and content hashes;
- TestRun associations, evidence health, attempts, remarks, and completion readiness.

### Execution plane

One immutable TestRun must own:

- exact runtime manifest;
- generated Gherkin and action bindings;
- custom extension bundle;
- executable config, cwd, environment, and tag selection;
- expected case manifest;
- logs, reports, screenshots, and traces.

The existing `automation/` model mixes all three. The migration separates them explicitly.

## Target Architecture

```text
User intent and approved implementation plan
                    |
                    v
Progressive Appraise catalogs  <-----------------------------+
  - action categories                                       |
  - versioned action descriptors                            |
  - application surfaces                                    |
  - page/component/state locator groups                     |
                    |                                        |
                    v                                        |
Agent reasoning and action selection                         |
                    |                                        |
                    v                                        |
Action-resolved validation AST                               |
                    |                                        |
                    v                                        |
Appraise validation compiler                                 |
  - schema and reference validation                          |
  - deterministic entity creation                            |
  - locator/action compatibility                             |
  - review projection and exact hashes                       |
                    |                                        |
                    v                                        |
Canonical validation revision -------------------------------+
          |                              |
          v                              v
Immutable runtime capsule          Durable export outbox
          |                              |
          v                              v
Managed TestRun and evidence       Atomic repository export
```

## Project-Segmented Managed Storage

Moving generated automation into the AppraiseJS workspace requires project isolation as a first-class invariant.
Appraise must not recreate the current shared `automation/` namespace inside the hub.

### Managed storage root

Use an explicitly generated/private root such as `.appraise/projects/`, not the existing hub `automation/` directory:

```text
.appraise/
  projects/
    <target-project-id>/
      project.json
      canonical/
        validations/
          <validation-hash>/
            validation.json
            manifest.json
      runtime/
        <validation-hash>/
          <run-id>/
            manifest.json
            cucumber.mjs
            features/
            bindings/
            extensions/
            support/
            reports/
            logs/
      exports/
        <validation-hash>/
          manifest.json
          features/
          bindings/
          resources/
      cache/
```

The directory identity is the immutable `TargetProject.id`. `displayName`, `canonicalPath`, and fingerprint are
recorded in `project.json` and the database but never interpolated as directory names. Names can collide or change;
paths can move; neither event should rename managed history.

```ts
type ManagedProjectManifest = {
  schemaVersion: '1'
  projectId: string
  displayName: string
  canonicalPath: string
  fingerprint: string
  registeredAt: string
  lastVerifiedAt: string
}
```

### Isolation hierarchy

The required identity hierarchy is:

```text
target project ID
  canonical validation hash
    TestRun ID or export ID
```

Project segmentation prevents cross-project collisions. Validation-hash segmentation prevents two plans or revisions
for the same target from overwriting one another. Run-ID segmentation prevents baseline, implementation, retry, and
parallel runs from sharing mutable config, reports, or logs.

Plan IDs and revisions belong in manifests and lightweight database/filesystem indexes. Do not duplicate the same
runtime capsule beneath both plan and validation paths; the validation content hash is the execution identity.

### Database authority

The database remains authoritative for project registration, current revisions, plan relationships, lifecycle,
reviews, TestRuns, export jobs, and retention state. The managed filesystem is a content-addressed storage projection,
not a second database.

- A directory without a corresponding database record is orphaned storage and is never silently imported.
- A database row whose storage is missing is a structured integrity blocker with repair guidance.
- Every read verifies that project, validation, run, and export records belong to the requested target project.

### Project lifecycle

- **Rename:** update display metadata; do not rename the project directory.
- **Target path move:** update the canonical path only after fingerprint/identity verification; preserve project ID and
  history.
- **Re-registration:** reconnect the existing project ID only when identity evidence proves continuity. A matching
  display name is insufficient.
- **Detach/remove:** stop active access while retaining canonical revisions and evidence according to policy. Never
  delete immediately as a side effect of detachment.
- **Concurrent runs:** use independent run capsules and locks; no shared mutable generated config.
- **Garbage collection:** execute Appraise-owned retention jobs. Preserve manifests, receipts, and evidence summaries
  after large runtime blobs are removed.

### Filesystem security

Project IDs, content hashes, run IDs, and export IDs are schema-validated before path construction. Every resolved
path must be checked to remain under `.appraise/projects/<target-project-id>/`. User-controlled names, repository
paths, AST text, action IDs, and locator descriptions never become unchecked path segments.

Cross-project reads and writes require both filesystem containment and database ownership checks. Cleanup, export,
download, and report routes use the same guard.

## Architectural Principles

1. The agent owns semantic inference; Appraise owns deterministic compilation and lifecycle integrity.
2. The AST references exact action, locator, environment, and extension IDs; unresolved prose is non-executable
   annotation only.
3. Catalog discovery is progressive and categorical. Appraise never dumps the whole registry by default.
4. Locator discovery is scoped by application surface, page, component, and state.
5. Managed execution never depends on the repository export being present or current.
6. Generated files are projections, not canonical mutable source.
7. Custom code is an explicit, reviewed capability extension, not the easiest general authoring route.
8. Every lifecycle mutation is hash-bound, idempotent where safe, and produces a compact delta.
9. Runtime preflight and execution consume the same immutable command receipt.
10. Project size may grow indefinitely, but state and history required by any one agent or plan remain bounded.

## Progressive Action Catalog

### Discovery protocol

The first request returns only top-level categories, descriptions, child counts, action counts, and catalog hash.

```ts
type ActionCategorySummary = {
  id: string
  title: string
  description: string
  childCategoryCount: number
  actionCount: number
  contentHash: string
}
```

Example hierarchy:

```text
browser
  navigation
  mouse
  keyboard
  forms
  waits
  assertions
  accessibility
  storage
  network
  media
api
database
filesystem
```

The agent expands only relevant categories, receives compact action summaries, and requests full descriptors only for
selected candidates. Actions may appear in multiple categories but have one canonical ID and implementation.

### Action descriptor

```ts
type ActionDescriptor = {
  id: string
  version: string
  title: string
  description: string
  categories: string[]
  inputs: Array<{
    name: string
    type: string
    required: boolean
    description: string
    constraints?: Record<string, unknown>
  }>
  outputs: Array<{ name: string; type: string; description: string }>
  requirements: {
    runtime: 'browser' | 'api' | 'node' | 'database'
    capabilities: string[]
  }
  examples: Array<{ description: string; inputs: Record<string, unknown> }>
  deprecated: boolean
  replacementActionId?: string
  contentHash: string
}
```

Appraise may support exact deterministic filters such as category, capability, input type, runtime, deprecation, and
ID prefix. It does not claim to semantically choose an action for the agent.

### Catalog endpoints/resources

```text
action_categories_list(parentCategoryId?, knownCatalogHash?)
actions_list(categoryId, cursor?, limit?)
actions_read(actionRefs[])
appraise://actions/catalog
appraise://actions/category/<category-id>
```

Known hashes permit `unchanged` responses and prevent repeated catalog reads.

## Progressive Locator Catalog And Capability Graph

### Locator hierarchy

```text
application
  global surfaces
    shell
    primary navigation
    notifications
  pages
    route or logical surface
      component groups
        locators
        state-dependent locators
```

The agent first lists surfaces, expands one page or component, and reads exact locators only when composing the AST.

```ts
type LocatorDescriptor = {
  id: string
  version: string
  title: string
  scope: {
    surfaceId: string
    componentId?: string
    availableStates?: string[]
  }
  strategy: {
    type: 'role' | 'label' | 'test-id' | 'placeholder' | 'text' | 'css'
    value: Record<string, unknown>
  }
  compatibleActionCategories: string[]
  sourceEvidence?: {
    file?: string
    symbol?: string
    attribute?: string
  }
  contentHash: string
}
```

### Queryable graph

The same catalog is represented as structured nodes and edges:

- nodes: categories, actions, surfaces, components, locators, states, outputs, runtime capabilities;
- edges: `contains`, `belongs-to`, `available-when`, `requires`, `produces`, `compatible-with`, `transitions-to`,
  `conflicts-with`, and `deprecated-by`.

Agents query bounded subgraphs and compatibility paths. Humans may use an interactive visual projection. Agents do
not need to interpret a rendered image.

```text
surfaces_list()
locator_groups_list(surfaceId)
locators_list(groupId, state?, cursor?, limit?)
locators_read(locatorRefs[])
capability_path_query(fromId, relation, toType?)
```

## Agent-Authored Validation AST

### Ownership

The agent decides:

- which behavior deserves validation;
- scenario boundaries and meaningful assertions;
- appropriate quality concerns;
- action and locator selection;
- whether a real capability gap justifies custom code.

Appraise validates and compiles that decision. Appraise does not infer an application test plan from static source.

### Core schema

```ts
type ValidationAst = {
  schemaVersion: '1'
  id: string
  title: string
  purpose: string
  coversTaskIds: string[]
  matrix: Array<{ browser?: string; environmentId: string }>
  scenarios: Array<{
    id: string
    title: string
    description?: string
    steps: ValidationAstStep[]
  }>
  qualityConcerns: Array<'accessibility' | 'persistence' | 'responsive' | 'performance' | 'security'>
}

type ValidationAstStep = {
  id: string
  keyword: 'Given' | 'When' | 'Then' | 'And'
  description: string
  action: {
    id: string
    version: string
    inputs: Record<string, AstValue>
  }
  store?: { output: string; as: string }
}

type AstValue =
  | string
  | number
  | boolean
  | { ref: 'locator'; id: string; version: string }
  | { ref: 'environment'; key: string }
  | { ref: 'stored'; name: string }
  | { ref: 'custom-extension'; id: string; version: string }
```

Descriptions preserve semantic meaning for human review. Execution binds only to exact IDs and versions.

### AST operations

```text
validation_ast_check(expectedPlanHash, ast)
validation_ast_preview(expectedPlanHash, ast)
validation_ast_publish(expectedPlanHash, expectedPreviewHash, ast)
validation_ast_read(planId, revision)
```

`check` performs schema, reference, compatibility, state, and runtime preparation validation.

`preview` returns a bounded diff of entities, actions, locators, custom extensions, generated Gherkin, runtime receipt,
warnings, blockers, and content hashes.

`publish` atomically creates the canonical validation revision and review event. The agent does not make dozens of
per-file or per-node mutations.

## Custom Action Extensions

Custom code remains necessary for capabilities absent from the registry. It must be explicit and reviewed.

```ts
type CustomActionExtensionProposal = {
  id: string
  version: string
  title: string
  description: string
  reasonExistingActionsAreInsufficient: string
  inputs: Array<{ name: string; type: string; required: boolean }>
  outputs: Array<{ name: string; type: string }>
  requiredCapabilities: string[]
  implementation: {
    language: 'typescript'
    source: string
  }
}
```

Appraise validates imports and capabilities, compiles against the Appraise-owned runtime, binds the running Cucumber
instance, assigns stable IDs, presents an exact review diff, and registers the extension as project-scoped or global
only after approval.

Appraise should show the agent why custom code is needed. It must not use semantic inference to reject a proposal;
it may deterministically reject a custom extension that references capabilities already expressible by the exact
action composition submitted in the same AST.

## Validation Compiler

The compiler transforms an accepted AST into canonical logical entities and execution inputs.

### Compiler stages

1. Validate schema version and plan/task references.
2. Resolve exact action, locator, environment, and extension versions.
3. Validate input types, stored values, runtime requirements, state availability, and compatibility edges.
4. Assign collision-resistant canonical module, suite, case, step, and tag IDs.
5. Create expected TestRunTestCase/TestSuite manifest entries.
6. Generate human-readable Gherkin as a projection.
7. Generate runtime action bindings without requiring target-local Cucumber registration.
8. Produce one canonical validation content hash and exact review diff.
9. Build a preflight command receipt for the immutable runtime capsule.

### Determinism requirements

- Identical AST, catalog versions, target identity, and environment inputs produce identical canonical content hashes.
- Any dependency on mutable target source is named and hash-bound.
- Compiler warnings and blockers use stable codes and reference AST node IDs.
- The compiler never silently rewrites reviewed content after publication.

## Immutable Runtime Capsule

Managed baseline and implementation validation execute a capsule owned by one validation hash and TestRun.

```text
.appraise/projects/<target-project-id>/runtime/<validation-hash>/<run-id>/
  manifest.json
  cucumber.mjs
  features/
  bindings/
  extensions/
  support/
  reports/
  logs/
```

The capsule manifest includes:

- Appraise runtime and package identity;
- physical Cucumber binary path;
- config, cwd, environment keys, browser, and tag expression;
- exact action, locator, and extension versions;
- feature/import/support hashes;
- expected suite/case/scenario IDs and counts;
- report and evidence destinations.

Runtime preflight loads and dry-runs the exact capsule command receipt. Execution consumes that same receipt or
returns structured drift. The target repository does not install a second Cucumber instance merely to execute
Appraise-generated validation.

## Transactional Repository Export

Repository export preserves Git visibility and portability without becoming canonical runtime authority.

### Export policy

Projects choose:

- `disabled`: no generated repository export;
- `optional`: default; failures are visible but do not invalidate managed evidence;
- `required`: completion requires a successful export receipt for the exact validation hash.

### Durable flow

The canonical validation mutation and pending export job are committed in one database transaction through an outbox.
The job is bound to one target project ID and validation hash. An Appraise worker renders under that project's managed
staging root, validates every file and manifest, compares external modifications, performs an atomic swap, and saves
a receipt. Worker or client failure leaves the previous successful export intact.

```text
automation/
  authored/               # repository-owned custom source
  appraise/
    current.json
    revisions/
      <validation-hash>/
        manifest.json
        features/
        bindings/
        resources/
```

Generated files contain provenance markers and last-exported hashes. Appraise never silently overwrites externally
modified files. Conflicts offer diff, restore, import-as-proposal, new-revision export, or ownership transfer.

```ts
type ExportReceipt = {
  exportId: string
  projectId: string
  planId: string
  validationHash: string
  destination: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'conflict'
  fileCount: number
  manifestHash?: string
  previousExportId?: string
  attempts: number
  startedAt?: string
  completedAt?: string
  blockers: Array<{ code: string; message: string; path?: string }>
}
```

Exports trigger from canonical lifecycle events, not from an agent remembering an end-of-session command. Startup,
target reconnect, explicit retry, and completion review reconcile pending jobs.

## Large-Project Scaling And Handoff

Large objectives are decomposed into bounded independently completable plans. Appraise must not keep “the next
Facebook” in one ever-growing plan, event stream, lease, and completion artifact.

```text
Product objective
  milestone
    bounded plan
      implementation group
        task
```

Appraise owns authoritative compact handoff state: lifecycle, hashes, completed/runnable tasks, commits, trusted runs,
remarks, cursor, target identity, and exact next action. The agent supplies semantic narrative: decisions, code
landmarks, failed approaches, risks, and recommended next slice. Appraise validates factual references and labels
unverified narrative as commentary.

Event history is snapshot-compacted and archived by reference. Catalogs and artifacts are content-addressed. A fresh
agent receives a bounded continuation package rather than a replay of the conversation or complete event history.

## Critical Invariants To Fix Before Migration

These are not legacy polish. They protect both architectures and must be fixed first:

1. Completion review and completion mutation use one readiness evaluator and evidence-hash contract.
2. Plan-bound runs create exact expected TestRunTestCase/TestSuite associations atomically.
3. Identifier tags have one canonical representation across projection, selection, and reports.
4. Event acknowledgement supports idempotent cumulative acknowledgement and bounded concurrency.
5. Passing evidence and task readiness reconcile atomically without misleading intermediate failure.
6. Commit evidence attachment is idempotent and independent of no-op status transitions.
7. Baseline repair preserves immutable visible attempt history.
8. UI decisions expose pending state and prevent accidental double submission.
9. Delegated authorization uses a narrow signed receipt instead of full-context inheritance.
10. Lifecycle responses default to compact deltas and content-addressed references.

## Migration Plan

### Phase 0: Safety Stabilization

#### Task 0.1: Unify Completion Readiness And Mutation

Use one service evaluator. A ready completion review bound to an evidence hash must complete unless a newer event
changes state, in which case the mutation returns an explicit stale hash and current receipt.

#### Task 0.2: Repair Managed Evidence Associations And Identifier Integrity

Create expected case/suite rows before execution, canonicalize `ts_`/`tc_` tags, and add generated-feature selection
tests. Preserve compatibility for legacy leading-`@` or hashed identifiers during migration.

#### Task 0.3: Make Events And Evidence Updates Idempotent

Add `acknowledgeThroughSequence`, concurrency limits, idempotent commit attachment, atomic task/evidence
reconciliation, and persistent attempt history.

Progress: **in progress**. PR #195 implements cumulative acknowledgement and idempotent commit attachment. Concurrency
limits, artifact-level atomic reconciliation, and persistent attempt history are implemented on
`codex/validation-ast-phase-0-completion`; integrated validation passed.

### Checkpoint: Safe Legacy Operation

- Existing plans cannot falsely complete or lose trusted evidence.
- A one-case plan-bound run creates one expected/matched case.
- Historical event acknowledgement cannot saturate the server.
- No migration work depends on temporary audit patches.

### Phase 1: Catalog And AST Contracts

#### Task 1.1: Define Versioned Action Catalog Contracts

Implement category summaries, progressive action listing, exact descriptor reads, hashes, deprecation, examples, and
deterministic filtering. Add resources and MCP/CLI endpoints without changing existing authoring.

Progress: **implemented** on `codex/validation-ast-phase-1-contracts`. The canonical versioned contract, stable catalog
and descriptor hashes, category summaries with unchanged-hash responses, bounded deterministic listing and filters,
exact descriptor reads, examples, and deprecation/replacement validation are implemented under
`src/lib/action-catalog`. A canonical initial catalog projects supported browser runtime actions, with bounded HTTP,
MCP resource/tool, and CLI discovery adapters. Existing authoring remains unchanged; package/scaffold synchronization
and full integration validation are complete, including prepared-template migration application, root and package
tests, Playwright coverage, harness, production build, Fallow, and React Doctor review.

#### Task 1.2: Define Surface And Locator Graph Contracts

Implement surface, page, component, state, locator group, descriptor, and compatibility-edge contracts. Provide
bounded graph queries and a human visual projection backed by the same data.

Progress: **implemented** on `codex/validation-ast-phase-1-contracts`. Canonical versioned schemas
now cover surfaces (including page/global kinds), components, states, locator groups, locator descriptors, strategies,
compatibility edges, bounded query/page payloads, graph integrity, and a human visual projection derived from the same
structured graph. A deterministic read-only builder projects current routes, locator groups, and locators; bounded
HTTP, MCP, and CLI traversal adapters and the human visual projection are integrated without adding mutation paths.

#### Task 1.3: Define Validation AST And Extension Schemas

Add versioned AST, action reference, locator reference, stored value, matrix, quality concern, and custom extension
contracts with package parity and public documentation.

Progress: **implemented**. Canonical version 1 Zod contracts and public documentation now cover the AST, action and
locator references, stored/environment/custom-extension values, execution matrix, quality concerns, submission
envelope, and custom TypeScript extension proposals. Package-client TypeScript parity and MCP contract-resource
discovery are implemented. Executable check, preview, compilation, and publish operations are explicitly deferred to
Phase 2.

#### Task 1.4: Add Narrow Delegated Authorization Receipts

Bind permitted action class, target fingerprint, brief/plan hash, issuer, expiry, nonce, and maximum phase. Test target
mismatch, scope escalation, expiry, replay, and tampering.

Progress: **implemented**. A canonical signed receipt contract now binds every required claim and verifies signature,
target, plan hash, action class, phase ceiling, expiry, and caller-supplied atomic nonce consumption. Focused tests
cover mismatch, escalation, expiry, replay, and tampering. Durable unique nonce consumption and package/MCP contract
discovery are implemented. A bounded HTTP/MCP/CLI submission inbox verifies the exact check-phase authorization and
atomically consumes the nonce while storing the AST for later checking, without compiling or mutating validations.

### Checkpoint: Read-Only Discovery And Contract Stability

- An agent can discover relevant actions and locators without a full catalog dump.
- An action-resolved AST can represent the meditation validation without raw feature or step files.
- A context-isolated worker can submit the authorized AST without inheriting the entire conversation.

### Phase 2: Compatibility Compiler

#### Task 2.1: Implement AST Check And Preview

Validate references, types, state, compatibility, coverage, and runtime requirements. Return exact bounded entity,
Gherkin, locator, extension, and command-receipt previews.

Progress: **operationally integrated** on `codex/validation-ast-phase-1-contracts`. Canonical read-only check and
preview functions reuse the Phase 1 AST, action catalog, and locator graph contracts; validate exact plan/task,
reference, type, state, compatibility, coverage, environment, runtime, and capability requirements; and return bounded
deterministic entity, action, locator, extension, Gherkin, blocker, warning, hash, and command-receipt previews.
Authoritative plan-bound target context and bounded HTTP, MCP, CLI, and package-client adapters are integrated. No
canonical entities or runtime bindings are created by check or preview; those remain Tasks 2.2 and 2.3.

#### Task 2.2: Compile AST Into Existing Canonical Entities

Atomically create current modules, suites, cases, ordered steps, locators, validation nodes, identifiers, and review
events. Keep legacy UI/read paths working.

Progress: **implemented at the compatibility projection boundary**. A hash-bound compiler maps V1 AST scenarios into
the existing validation-node/module/suite/case/ordered-step shapes and reuses the legacy projector. Canonical database
entities, identifier tags, and `validation_ast_compiled` review evidence are written in one Prisma transaction, keeping
legacy UI/read paths intact. Runtime materialization/publication remains downstream, and custom extensions remain Task
2.3. Operational compile recomputes the exact successful preview/context receipt and rejects plan, catalog, graph,
environment, AST, or preview drift before projection while preserving unrelated validation state.
The final durable CAS runs inside the projection transaction before its first write, and preview/projection reuse the
same plan-and-target-scoped collision-resistant module, suite, case, step, locator, and Gherkin projection.
Canonical publication additionally uses a durable prepared-operation journal containing all serialized artifact and
projection inputs plus immutable extension-review hashes. Repository CAS, projection, and the exactly-once
validation-review lifecycle/event resume across crashes without entering runtime materialization.
The operation is anchored by restrictive PlanProjection/TargetProject foreign keys and a target fingerprint snapshot;
server-derived all-input hashes, payload bounds, adjacent phases, per-phase artifact/context checks, transaction-coupled
projection advancement, bounded failures, and operation-linked exactly-once events harden concurrent recovery.
One pure bounded canonical projection now supplies both review and compilation verbatim, including module, suite,
case, step, template, parameter, locator, matrix, executable/Gherkin path, Gherkin content, and exact projection hash.
Focused real-SQLite evidence covers preview-to-compile equality, preservation of existing validation state,
cross-plan ID isolation, receipt tamper rollback with no event/entity writes, and lifecycle-gate enforcement.
Public compile now prepares exact plan, validation, review, projection, receipt, and extension-review journal payloads
before projection and resumes by the receipt-derived idempotent operation ID; the immediate projector remains an
internal primitive rather than the public lifecycle path.

#### Task 2.3: Add Controlled Custom Extension Compilation

Validate imports/capabilities, compile against the Appraise runtime, bind the correct Cucumber instance, and present
project-scoped extensions for exact review.

Progress: **implemented at the review-only Phase 2 boundary**. The compiler validates proposals against the
authoritative target project's capability-to-import policy, rejects unknown capabilities, ungranted/static re-export
modules, dynamic/CommonJS loading, and dangerous globals, performs a strict real TypeScript check, and binds Cucumber
to the exact Appraise-owned module. Check/preview returns deterministic blockers or an exact project-bound review with
source/compiled hashes, capability/import manifest, source, compiled source, and Cucumber binding. Canonical compilation
verifies the reviewed hashes and persists the complete immutable reviews in the same transaction and event as the
Task 2.2 projection. This remains preview/review-only: execution is intentionally blocked until Phase 3 supplies an
isolated runtime capsule, and no generated runtime or target-repository files are written.

Security hardening now bounds submission collections, strings, action inputs, and source bytes before compiler work;
short-circuits policy failures; and type-checks against an allowlist-only virtual declaration host with no target/host
filesystem resolution. Module re-exports are rejected, identities are unique, and declared/proposed/referenced sets
must match. The authoritative versioned project policy and hash are receipt-bound and discoverable through HTTP, MCP,
CLI, and package-client surfaces. Execution is explicitly forbidden in Phase 2; isolation, runtime materialization,
and execution remain Phase 3 work and do not keep this review-only compilation task open.

#### Task 2.4: Introduce Simple Happy-Path Authoring Profile

Define a profile contract the agent may select when composing the AST: one primary scenario, one environment/browser,
ordinary bounded waits, essential accessibility/persistence assertions, and advanced timing/matrices opt-in.

Progress: **implemented at the authoring/check boundary**. A selectable version 1 `simple-happy-path` profile requires
one primary scenario, one environment/browser entry, explicit accessibility and persistence concerns, a `Then`
assertion, and waits no longer than 30 seconds. Advanced matrices and timing require explicit opt-ins. Profile choice
and opt-ins are preview/receipt/journal-bound and influence composition validation only; Appraise-owned review gates
remain unchanged and no Phase 3 execution or materialization is introduced.

The profile resolves registered action descriptors and assertion categories rather than trusting action IDs or concern
labels. Versioned catalog descriptors identify real accessibility/persistence assertion concerns and numeric input
units/bounds; timing is normalized from milliseconds or seconds before applying the 30-second cap. Focused bypass
tests prove assertion-like names, metadata-only concern claims, and millisecond values cannot evade the profile.

Review decisions and final submission are evidence-bound to the current `review_ready` operation hash and exact
extension artifact hashes, with immutable operation-linked decision events and stale-binding rejection. Phase 2
projections are marked `phase2_review_only`; implementation validation and every form, standalone, or plan-bound
TestRun selection denies their test cases from generic target-automation execution. The historical `phase3_capsule`
string remains parse-only for backward compatibility and never grants authority; Phase 3 execution requires exact v2
publish-operation provenance and an Appraise-owned runtime capsule.

The final approved-AST submission follows a canonical review-only branch: it advances lifecycle and records
operation-bound evidence without legacy runtime materialization, generated-file checks, environment preflight, or a
second projection. Real-SQLite evidence proves the approved meditation revision reaches `validations_approved` with
no `automation/` runtime output. Baseline and implementation execution retain `phase2_review_only` provenance and
gain authority only through the exact reviewed v2 publish operation and its Appraise-owned immutable runtime capsule.
The legacy `phase3_capsule` value remains parse-only and never grants execution. Immutable decision events use the
canonical `(publishOperationId, validationId)` key. Retries read the original event before
artifact writes, preserving reviewer, timestamp, decision, and content hash; final submission compares every field,
the operation hash, and sorted extension hashes exactly. Real-SQLite evidence retries with a different reviewer,
proves one identical artifact/event decision, and rejects tampered decision evidence.

### Checkpoint: New Authoring Path

Status: **complete**. Tasks 2.1-2.4 establish checked, reviewed, recoverable compilation and the simple happy-path
profile. The real-SQLite acceptance test
`src/services/coordinator/validation-ast-operation-service.integration.test.ts` now publishes one meditation
`simple-happy-path` submission through the authoritative action catalog and database-backed locator graph, check,
preview receipt, one public compile operation, durable journal, canonical projection, and `validation_review_ready`.
It proves the first review's persisted validation content equals the previewed post-compilation canonical node, the
artifact and event hashes agree with the single operation and receipt, the profile has one scenario and one
environment/browser with accessibility, persistence, and an explicit `Then`, and the fixture needs zero controlled
extensions (therefore no more than one). Focused evidence: the integration file passes 3/3 tests.

Final Phase 2 verification passes 151 root Vitest files (674 tests), 11 `appraisejs` package files (87 tests),
11 scaffold package files (65 tests), the 4-case scaffold end-to-end suite, and all 38 Playwright cases. Prisma validates
and applies all 35 migrations to fresh databases; canonical template preparation, root and scaffold production builds,
ESLint, focused Prettier, diff whitespace, agent harness, Fallow's new-only commit gate, and the React Doctor
`appraise-0.5` diff scan pass. Graphify refreshed the `src`, Prisma, and package graphs without an API key; endpoint
integrity is clean, with one inherited normalized-ID self-loop in the source graph recorded for Graphify follow-up.

- The agent composes and publishes the meditation validation through catalogs and one AST operation.
- Appraise creates canonical entities without direct agent file writes.
- The first review contains exact post-compilation content and one coherent hash.
- No more than one custom extension is needed for the simple fixture.

### Phase 3: Immutable Runtime Capsules

#### Task 3.1: Build Content-Addressed Runtime Capsules

Materialize generated features, bindings, extensions, support, config, expected cases, and evidence paths under a
project-ID/validation-hash/run-ID-specific workspace. Add managed project manifests, database ownership checks,
filesystem containment guards, independent run locks, and orphan/missing-storage integrity states.

Status: **complete and approved**. Reviewed Phase 2 publications now materialize deterministic feature, executable
binding, reviewed extension, support, config, and expected-case bytes into project-scoped content-addressed blobs and
independent immutable run-local copies. Canonical manifests bind exact publication/runtime-input provenance and only
become ready after database ownership, blob references, blob bytes, run-local bytes, hashes, sizes, and paths verify.
Anchored containment rejects traversal and symlink ancestors; renewable database leases serialize materialization and
reassert exact ownership before authority transitions. Managed `project.json` manifests use only immutable project IDs
for directories while safely refreshing verified display-name and canonical-path metadata.

Focused approval evidence passes 25 runtime-capsule tests across six files, including real SQLite isolation and
concurrency for duplicate display names, distinct validations, and concurrent runs; missing/corrupt/orphan and
cross-project ownership checks; blob and sibling-run mutation isolation; lease expiry/takeover; project-manifest
refresh/integrity; and an executed Cucumber browser step proving the exact frozen selector is used without target
automation or locator-cache state. At Task 3.1 approval, Task 3.2 predictive preflight and the Phase 3 checkpoint
remained open; the current task statuses below supersede that historical snapshot.

#### Task 3.2: Execute Predictive Preflight Against The Capsule

Verify physical binary identity, config load, compiler/loader compatibility, one Cucumber instance, tag selection,
expected cases, writable reports, and expected scenario count with the exact execution receipt.

Status: **complete and approved**. Each immutable capsule now contains a canonical sealed command receipt and runs a
fail-closed 13-stage predictive preflight under a whole-operation renewable database lease, followed by final capsule
integrity verification before readiness. Preflight executes without ambient environment inheritance or in-process
config evaluation and verifies publication ownership, filesystem integrity, Node/Cucumber/Appraise runtime identity,
one physical Cucumber instance, loader/compiler and frozen declaration authority, exact config and tag selection,
expected-case evidence, bounded writable outputs, and the real Cucumber dry-run result.

Focused approval evidence passes 36 runtime-capsule tests across ten files, including a real one-case dry run that
selects and matches exactly one reviewed scenario. At Task 3.2 approval, Tasks 3.3 and 3.4 and the Managed Execution
Independence checkpoint remained open; the current task statuses below supersede that historical snapshot.

#### Task 3.3: Migrate Baseline And Implementation Validation

Run both lifecycle phases from the same capsule contract. Remove target-local generated runtime dependency
requirements and preserve structured evidence health and recovery.

Status: **implemented and validated; pending user approval**. Reviewed v2 baseline and implementation validations now
prepare, preflight, execute, and reconcile from the same sealed Appraise-owned capsule contract, while mixed legacy
nodes retain their existing runtime path without contaminating capsule inputs. Durable preparation keys converge
concurrent and crash-replayed requests, deliberate retries receive a new ordinal, and guarded execution attempts make
cancel, interrupted-process recovery, and terminal replay deterministic.

The literal lifecycle E2E produced exactly one TestRun, one linked expected case, and one report; the run completed
`PASSED` with `valid` evidence health, its execution attempt completed, and baseline reconciliation classified the
evidence as `accepted_regression_pass`. The target workspace received no generated automation or runtime files.
Focused concurrency, duplicate-start, partial-batch cleanup, cancellation-before/during-spawn, missing-process
recovery, and idempotent terminal-attempt tests provide the surrounding failure-path evidence.

#### Task 3.4: Add Bounded Runtime Diagnostics

Expose sanitized command receipt, resolved identities, blockers, active/running state, and next recovery action without
returning complete artifacts by default.

Status: **implemented and validated; pending user approval**. Runtime capsule execution attempts now persist the canonical bounded preflight
result, hash, and check timestamp before spawn, allowing restart-stable diagnostics without process-memory authority.
The strict diagnostic projection exposes only stable attempt/preflight/evidence blocker codes, fixed recovery actions,
bounded status and counts, sanitized package identities and immutable hashes, and owned evidence links. It excludes
raw arguments, environment values, filesystem paths, process identity, owner tokens, failure text, secrets, complete
receipts/manifests, and artifact contents.

Target-scoped ownership is enforced before diagnostic or artifact reads. A trusted-root gateway verifies immutable
TestRun, target, capsule, manifest, receipt, and expected-case membership; rejects managed-root, ancestor, and final
symlinks; applies receipt/hard size and content-type bounds; and returns opaque 404/409 responses. HTTP, coordinator,
package client, MCP response modes, and CLI human/JSON surfaces share the bounded contract and selected-target scope.
Real SQLite restart, state, corruption, redaction, same-display-name isolation, and artifact containment tests plus
focused contract, route, package, MCP, and CLI checks provide validation evidence. Diagnostics remain hub-only in
Appraise 0.5 and are intentionally not synchronized into `create-appraisejs` templates.

### Checkpoint: Managed Execution Independence

Status: **implemented and validated; pending user approval**.

- Baseline and implementation validation do not execute repository exports.
- Two registered targets with identical display names cannot read, overwrite, execute, export, or clean up each
  other's canonical revisions, capsules, reports, logs, or caches.
- Two validations and two concurrent runs for the same target use isolated immutable directories.
- Webpack, Turbopack, and production server builds resolve one stable Appraise runtime.
- Every deterministic runtime failure from the meditation audit is caught before execution.
- One expected case produces one matched full-assurance TestRun.

The literal lifecycle E2E passed with one Appraise-owned capsule, one TestRun, one linked expected case, one report,
`PASSED` status, `valid` evidence health, a completed execution attempt, and `accepted_regression_pass` baseline
reconciliation. The target workspace received no generated automation, runtime, or locator-cache files. Security and
containment validation covered cross-project and same-display-name isolation, traversal and symlink rejection,
immutable manifest/receipt/expected-case ownership, bounded artifact reads, sanitized diagnostics, cancellation and
interrupted-process recovery, and deterministic terminal replay.

Final Phase 3 validation passed the production application and package builds, all 38 migrations, 764 root tests, 98
`packages/appraisejs` tests, and 65 `create-appraisejs` tests. Fallow reported zero introduced dead-code, complexity,
or duplication findings (`0/0/0`), and React Doctor reported no regression. Graphify refreshed the committed source,
Prisma, and package graphs to 3,498 nodes/9,106 edges, 928 nodes/2,058 edges, and 781 nodes/1,198 edges respectively,
with zero dangling endpoints; the source graph retains one inherited self-loop. These results establish the technical
checkpoint, while explicit user approval remains required before Phase 3 is marked complete and approved.

### Phase 4: Transactional Repository Export

#### Task 4.1: Implement Export Outbox And Worker

Create durable jobs from canonical lifecycle events, stage complete revisions, hash/validate manifests, atomically
swap within the target project's managed export root, retry safely, and persist project-bound receipts. Reject jobs
whose project ownership or destination identity has drifted.

#### Task 4.2: Implement External Modification And Conflict Handling

Compare current files with last-exported hashes and never overwrite external changes silently. Add diff and explicit
resolution actions.

#### Task 4.3: Add Export Policies And Completion Integration

Support disabled, optional, and required policies. Managed evidence remains independent; required policy blocks
completion only when the exact validation hash lacks a successful receipt.

### Checkpoint: Safe Git Distribution

- Agent interruption cannot skip or corrupt export.
- Failed export leaves the previous successful revision intact.
- Repository export is reproducible, reviewable, and never managed runtime authority.

### Phase 5: Import And Legacy Migration

#### Task 5.1: Parse Existing Automation Into AST Proposals

Import current feature, step, locator, and metadata files into a proposed AST with unresolved mappings and warnings.
Require human review before canonical conversion.

#### Task 5.2: Add Legacy Compatibility Export

Generate legacy-compatible artifacts from canonical AST revisions for existing CI and users during the transition.

#### Task 5.3: Deprecate Direct Generated Artifact Mutation

Warn on generated-file writes, document ownership markers, retain explicit authored extensions, and gradually retire
per-file canonical mutation and bidirectional generated-file synchronization.

### Checkpoint: Migration Compatibility

- Existing projects can preview migration without mutation.
- Imported validations retain traceability to original files.
- New and legacy workflows can coexist during a documented deprecation window.

### Phase 6: Bounded Coordination And Product Scaling

#### Task 6.1: Compact Lifecycle Responses And Event History

Default to delta/evidence modes, content-address unchanged artifacts, add cumulative acknowledgement, snapshot events,
and archive old history by reference.

#### Task 6.2: Add Hierarchical Objectives And Bounded Plans

Introduce objective/milestone/plan relationships, plan-size warnings, independent completion, scoped leases, and
impact-based regression selection.

#### Task 6.3: Add Durable Hybrid Handoffs

Appraise generates authoritative state; agents attach semantic narrative. Validate references, preserve provenance,
and launch fresh agents with bounded continuation packages.

#### Task 6.4: Enforce Coordination SLOs

Measure active Appraise/agent time separately from human review, response bytes, operations, retries, approvals, and
idle waits. Fail the small-fixture release test when budgets are exceeded.

## Migration Acceptance Tests

### Small application fixture

The meditation fixture must complete without source patches, database edits, server restarts, raw JSON-RPC fallback,
target-local duplicate Cucumber packages, repeated unchanged approval, or direct generated-file authoring.

Budgets excluding genuine human review:

| Phase                                   | Target | Hard ceiling |
| --------------------------------------- | -----: | -----------: |
| Diagnostic, registration, and planning  |  2 min |        5 min |
| Catalog discovery and AST compilation   |  3 min |        5 min |
| Validation review and runtime preflight |  3 min |        5 min |
| Baseline execution and reconciliation   |  3 min |        5 min |
| Agent implementation                    | 20 min |       30 min |
| Managed implementation validation       |  5 min |       10 min |
| Completion review and mutation          |  1 min |        3 min |
| End to end                              | 36 min |       45 min |

Additional budgets:

- one plan approval and one validation approval cycle;
- at most one automatic retry per phase;
- unchanged wait/ack response below 2 KB;
- lifecycle summary below 8 KB;
- cumulative acknowledgement below 2 seconds locally;
- no full catalog dump;
- no unchanged file patch repeated after first review.

### Large objective fixture

A synthetic multi-milestone application must prove that project size does not increase single-agent state without
bound. Each executable plan remains independently reviewable and completable. Handoffs contain snapshots and
references, not full project/event replay. Parallel subplans use scoped leases and explicit dependency contracts.

## Work To Stop Or Deprioritize

Do not make these major investments unless required for migration compatibility:

- expanding instructions for agents to hand-author generated feature and step files;
- target-local installation of Appraise-managed runtime dependencies;
- path-based reusable step semantics;
- broad bidirectional synchronization of generated artifacts;
- per-file validation mutation ergonomics;
- making repository `automation/` the canonical managed execution workspace;
- adding more heuristic semantic matching inside Appraise without an intelligence provider.

## Risks And Mitigations

| Risk                                                   | Impact | Mitigation                                                                                                |
| ------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------- |
| Migration scope expands indefinitely                   | High   | Gate phases with executable checkpoints and do not start export/import work before AST/compiler proof     |
| AST becomes another low-level file format              | High   | Keep action-resolved semantics, typed references, bounded preview, and one atomic publish operation       |
| Catalog taxonomy becomes unstable                      | Medium | Version categories/descriptors, permit multi-category membership, and use canonical IDs                   |
| Custom extensions become an unrestricted escape hatch  | High   | Capability declarations, isolated compilation, exact review, project scope, and registry reuse reporting  |
| Repository users reject generated revision directories | Medium | Project export policies, configurable retention, and legacy-compatible export adapter                     |
| Runtime capsules duplicate too much data               | Medium | Content-addressed shared blobs with immutable manifests and run-local references                          |
| Legacy workflow remains forever                        | High   | Publish deprecation milestones and make new projects use AST/compiler by default after Phase 3            |
| Large projects recreate monolithic coordination        | High   | Enforce bounded plan size, hierarchical milestones, snapshot handoffs, and per-plan completion            |
| Managed storage becomes a second source of truth       | High   | Keep SQLite authoritative; treat project directories as verified materializations with integrity states   |
| Project rename or path move loses validation history   | High   | Address storage only by immutable `TargetProject.id`; keep names and paths as mutable manifest metadata   |
| Cross-project traversal, export, or cleanup leaks data | High   | Validate every path segment, enforce root containment and database ownership, and test adversarial inputs |

## Documentation And Public Contract Work

Update in the same migration phases:

- `docs/agent-lifecycle-flow.md`
- `docs/coordinator-api-mcp.md`
- `docs/agent-task-recipes.md`
- `docs/agent-validation-matrix.md`
- `docs/automation-sync-rules.md`
- `docs/agent-generated-artifacts.md`
- `docs/test-run-runtime.md`
- package MCP capability guidance and schemas
- scaffold/template copies through the canonical sync workflow

Document ownership labels explicitly: repository-authored, Appraise-canonical, run-generated, and repository-exported.

## Definition Of Done

- Agents discover actions and locators progressively without bulk dumps or Appraise semantic inference.
- Agents submit action-resolved, versioned ASTs rather than writing canonical generated artifacts.
- Appraise deterministically compiles ASTs into exact reviewable canonical revisions.
- Managed baseline and implementation validation execute immutable Appraise-owned capsules.
- Expected cases, identifier tags, evidence health, attempts, and completion readiness remain consistent.
- Custom code uses controlled reviewed extensions bound to the Appraise runtime.
- Repository exports are durable, atomic, conflict-aware, and independent from managed execution.
- Existing automation can migrate through preview and explicit review.
- Every canonical revision, runtime capsule, export, cache, report, and log is segmented first by immutable
  `TargetProject.id`, then by validation hash and run/export identity where applicable.
- Project rename, path move, re-registration, detach, concurrent execution, retention, and orphan recovery preserve
  project identity and historical evidence without directory collisions.
- Filesystem containment and database ownership checks prevent cross-project reads, writes, execution, export,
  download, retention, and cleanup operations, including for two projects with identical display names and artifact
  filenames.
- Small-app coordination completes within the release budgets.
- Large objectives decompose into bounded plans and handoffs rather than unbounded agent context.
- Legacy direct generated-file authoring has a documented deprecation and removal path.
