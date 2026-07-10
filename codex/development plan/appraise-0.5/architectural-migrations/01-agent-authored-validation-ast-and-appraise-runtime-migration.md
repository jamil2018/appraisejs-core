# Agent-Authored Validation AST And Appraise Runtime Migration

## Status

Proposed architectural migration for AppraiseJS 0.5.

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

### Checkpoint: Safe Legacy Operation

- Existing plans cannot falsely complete or lose trusted evidence.
- A one-case plan-bound run creates one expected/matched case.
- Historical event acknowledgement cannot saturate the server.
- No migration work depends on temporary audit patches.

### Phase 1: Catalog And AST Contracts

#### Task 1.1: Define Versioned Action Catalog Contracts

Implement category summaries, progressive action listing, exact descriptor reads, hashes, deprecation, examples, and
deterministic filtering. Add resources and MCP/CLI endpoints without changing existing authoring.

#### Task 1.2: Define Surface And Locator Graph Contracts

Implement surface, page, component, state, locator group, descriptor, and compatibility-edge contracts. Provide
bounded graph queries and a human visual projection backed by the same data.

#### Task 1.3: Define Validation AST And Extension Schemas

Add versioned AST, action reference, locator reference, stored value, matrix, quality concern, and custom extension
contracts with package parity and public documentation.

#### Task 1.4: Add Narrow Delegated Authorization Receipts

Bind permitted action class, target fingerprint, brief/plan hash, issuer, expiry, nonce, and maximum phase. Test target
mismatch, scope escalation, expiry, replay, and tampering.

### Checkpoint: Read-Only Discovery And Contract Stability

- An agent can discover relevant actions and locators without a full catalog dump.
- An action-resolved AST can represent the meditation validation without raw feature or step files.
- A context-isolated worker can submit the authorized AST without inheriting the entire conversation.

### Phase 2: Compatibility Compiler

#### Task 2.1: Implement AST Check And Preview

Validate references, types, state, compatibility, coverage, and runtime requirements. Return exact bounded entity,
Gherkin, locator, extension, and command-receipt previews.

#### Task 2.2: Compile AST Into Existing Canonical Entities

Atomically create current modules, suites, cases, ordered steps, locators, validation nodes, identifiers, and review
events. Keep legacy UI/read paths working.

#### Task 2.3: Add Controlled Custom Extension Compilation

Validate imports/capabilities, compile against the Appraise runtime, bind the correct Cucumber instance, and present
project-scoped extensions for exact review.

#### Task 2.4: Introduce Simple Happy-Path Authoring Profile

Define a profile contract the agent may select when composing the AST: one primary scenario, one environment/browser,
ordinary bounded waits, essential accessibility/persistence assertions, and advanced timing/matrices opt-in.

### Checkpoint: New Authoring Path

- The agent composes and publishes the meditation validation through catalogs and one AST operation.
- Appraise creates canonical entities without direct agent file writes.
- The first review contains exact post-compilation content and one coherent hash.
- No more than one custom extension is needed for the simple fixture.

### Phase 3: Immutable Runtime Capsules

#### Task 3.1: Build Content-Addressed Runtime Capsules

Materialize generated features, bindings, extensions, support, config, expected cases, and evidence paths under a
project-ID/validation-hash/run-ID-specific workspace. Add managed project manifests, database ownership checks,
filesystem containment guards, independent run locks, and orphan/missing-storage integrity states.

#### Task 3.2: Execute Predictive Preflight Against The Capsule

Verify physical binary identity, config load, compiler/loader compatibility, one Cucumber instance, tag selection,
expected cases, writable reports, and expected scenario count with the exact execution receipt.

#### Task 3.3: Migrate Baseline And Implementation Validation

Run both lifecycle phases from the same capsule contract. Remove target-local generated runtime dependency
requirements and preserve structured evidence health and recovery.

#### Task 3.4: Add Bounded Runtime Diagnostics

Expose sanitized command receipt, resolved identities, blockers, active/running state, and next recovery action without
returning complete artifacts by default.

### Checkpoint: Managed Execution Independence

- Baseline and implementation validation do not execute repository exports.
- Two registered targets with identical display names cannot read, overwrite, execute, export, or clean up each
  other's canonical revisions, capsules, reports, logs, or caches.
- Two validations and two concurrent runs for the same target use isolated immutable directories.
- Webpack, Turbopack, and production server builds resolve one stable Appraise runtime.
- Every deterministic runtime failure from the meditation audit is caught before execution.
- One expected case produces one matched full-assurance TestRun.

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
