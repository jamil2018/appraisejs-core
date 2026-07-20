# Unified Operation Catalog, Human-Agent Authoring, And Capsule Compilation

## Status

Implemented and certified for AppraiseJS 0.5 on 2026-07-20.

The cutover provides 125 canonical operations, 125 trusted handlers, 125 generated human projections, 125 agent
projections, zero pending ledger rows, and zero surface exceptions. Built-in Cucumber files are generated delegation
wrappers, the old action catalog is a read-only compatibility projection, new Validation AST/runtime publications use
operation references, and capsules seal the reviewed operation closure. The deterministic receipt at
`config/operation-architecture-certification.json` has status `certified`; compatibility readers remain only for
historical `action`, `templateStepName`, and runtime-input-v1 evidence.

This plan follows:

- `02-v1-removal-and-v2-only-validation-architecture-refactor.md`, which established reviewed Validation ASTs and
  Appraise-owned immutable runtime capsules as the managed execution authority;
- `03-managed-validation-integrity-project-segregation-and-coordination.md`, which strengthened project ownership,
  review binding, coverage arguments, and capsule integrity; and
- `../agent tooling/rich-reusable-playwright-template-step-library.md`, which expanded the human-oriented reusable
  template-step catalog.

It does not undo capsule isolation or return managed execution authority to target-workspace automation files.

## Executive Summary

AppraiseJS currently exposes two independently evolving browser-automation systems:

1. The human-oriented template-step system provides 116 reusable Cucumber steps across 24 groups, Step Blocks,
   template test cases, UI authoring, source fragments, registry installation, and database synchronization.
2. The agent-oriented managed Validation AST system provides a smaller typed action catalog and generates an
   immutable capsule binding module whose hardcoded dispatcher reimplements overlapping Playwright operations.

The split was understandable: legacy template steps optimize for readable Gherkin and interactive authoring, while
managed actions optimize for bounded discovery, typed inputs, exact locator references, reviewable intent, and
immutable execution. The mistake is allowing those authoring surfaces to own different semantic catalogs and handler
implementations.

The target architecture introduces one versioned operation model and one trusted implementation per capability.
Human-readable template steps and agent-authored AST steps become projections into the same canonical
`OperationInvocation`. Managed capsules freeze the exact reviewed operation definitions and handler hashes instead of
generating a second dispatcher. Human and agent surfaces retain different ergonomics, but they create equivalent
logical test artifacts and execute the same operation semantics.

This is a staged compatibility migration. It must preserve existing human-authored test cases, Step Blocks, template
test cases, managed validation publications, review receipts, runtime-capsule immutability, project segregation, and
manual test management while eliminating permanent dual-write or dual-dispatch behavior.

## Confirmed Architectural Drift

### Independent definitions

- `automation/steps/actions/**/*.step.ts` and `automation/steps/validations/**/*.step.ts` are the canonical legacy
  sources for the human template-step registry.
- `src/lib/action-catalog/default-catalog.ts` separately defines managed action identities, schemas, examples,
  capabilities, and assertion concerns.
- `src/lib/runtime-capsule/binding-generator.ts` separately implements managed action execution through a hardcoded
  switch.
- `packages/cucumber-runtime/src/template-step-operations.ts` contains another bounded Playwright operation layer for
  structured human-template fallbacks.

### Overlapping behavior

Common behaviors such as navigation, reload, click, fill, keyboard input, focus, viewport sizing, waits, visibility,
checked state, field value, and text assertions exist in both systems under different names and schemas. Some managed
actions, such as clean-console, clean-network, horizontal-overflow, accessibility, and persistence assertions, have no
exact human template-step equivalent. Conversely, most of the 116 human template steps have no first-class managed
action equivalent.

### Contract mismatch

- The managed Validation AST schema accepts only `action: { id, version, inputs }`.
- `template_step_search` and `template_step_match` can recommend a human reusable step, but the AST cannot reference
  that result.
- The authoring context says to select semantic template steps first while starter submissions and recipes emit
  managed action IDs.
- Canonical projection stores an action identity in the field named `templateStepName`, obscuring the distinction.
- Agents therefore follow the only executable managed contract and bypass the richer template-step catalog even when
  discovery works correctly.

### Drift symptoms

- A fix in a legacy template-step handler does not repair the capsule action with equivalent semantics.
- A capsule fix does not repair human-authored test execution.
- Catalog capability counts differ without a machine-readable explanation.
- Search results may recommend artifacts the caller cannot legally place in its target schema.
- Tests use sample-application vocabulary to protect framework contracts, making generic regressions appear
  app-specific and encouraging fixture proliferation.
- Registry rebuilds and scaffold synchronization magnify small source changes into large generated diffs.

## Non-Negotiable Decisions

### One semantic operation authority

Every built-in executable behavior has one stable operation identity, one versioned input/output contract, and one
trusted handler implementation. Human signatures, icons, descriptions, search aliases, agent examples, Step Blocks,
and capsule bindings are projections or compositions of that operation; none may reimplement it.

### Different authoring surfaces, equivalent logical artifacts

Humans may author through readable Gherkin, forms, flow graphs, Template Steps, Step Blocks, and template test cases.
Agents may author through typed operation IDs, bounded search, structured inputs, locator references, stored values,
and Validation ASTs. Both compile to the same canonical invocation sequence before execution or review.

Equivalent logical artifacts do not require identical source text. Human Gherkin remains presentation. The canonical
operation reference, typed inputs, outputs, locator bindings, order, and content hashes are execution authority.

### Capsules compile; they do not invent

The capsule compiler may register frozen Gherkin expressions and package reviewed operation handlers. It may not own
a parallel switch statement or synthesize new Playwright semantics. A capsule binds exact operation descriptor hashes,
handler hashes, locator snapshots, runtime identity, and extension reviews.

### Registry-first applies to both humans and agents

The selection order is:

1. a semantic built-in operation with the desired human or agent projection;
2. a bounded structured operation from the same operation kernel;
3. a reviewed reusable composition such as a Step Block;
4. a justified custom operation only when the canonical registry cannot express the behavior.

### No lowest-common-denominator catalog

Capabilities available to only one surface must be projected to the other surface or carry an explicit, reviewable
surface exception. The migration must expand coverage rather than removing rich human capabilities to match the
smaller managed catalog.

### No app-specific framework tests

Permanent tests protect operation contracts, projections, migration behavior, integrity, and lifecycle gates. Sample
apps may provide end-to-end certification evidence, but new app names do not justify new framework fixtures unless
they isolate a previously unrepresented protocol or browser behavior.

## Goals

- Make one operation catalog discoverable by humans, agents, UI, MCP, packages, and capsule compilation.
- Preserve human-readable Gherkin and the current flow-graph authoring experience.
- Give agents compact typed discovery with exact compatibility and next-action guidance.
- Reach at least the current 116-step semantic capability coverage on both authoring surfaces.
- Eliminate duplicate handlers and hardcoded capsule dispatch.
- Preserve exact reviewed capsule execution, content-addressed storage, and target-project isolation.
- Migrate existing built-in Template Steps, TestCaseSteps, TemplateTestCaseSteps, and StepBlockSteps without changing
  their user-visible meaning.
- Provide a safe classification and migration path for custom legacy template-step source.
- Make drift a CI failure rather than a happy-path discovery.
- Reduce registry, timestamp, scaffold, and graph churn caused by semantically unchanged rebuilds.

## Out Of Scope

- Replacing Cucumber or Playwright.
- Returning managed execution to target-workspace `automation/` files.
- Removing manual test management, Step Blocks, template test cases, or readable Gherkin.
- Automatically trusting arbitrary legacy TypeScript as a managed capsule handler.
- Inferring product-specific task graphs or validation meaning from prose.
- Provider-native remote execution.
- Rewriting historical managed capsules or changing evidence that has already been reviewed and completed.
- Maintaining two permanent public authoring schemas after migration.

## Terminology

- **Operation Definition:** versioned semantic contract for one executable behavior.
- **Operation Handler:** trusted implementation of an Operation Definition for a runtime.
- **Operation Invocation:** operation reference plus typed inputs, optional stored output, and presentation metadata.
- **Human Projection:** Cucumber expression, parameter adapters, label, icon, group, and documentation for an operation.
- **Agent Projection:** compact typed descriptor, categories, capabilities, examples, and search metadata.
- **Composition:** ordered, parameterized sequence of Operation Invocations, including Step Blocks.
- **Surface Exception:** explicit reason an operation cannot yet be authored or represented on one surface.
- **Legacy Custom Step:** user-authored template-step source without a trusted canonical operation mapping.

## Target Architecture

```text
Human authoring                                       Agent authoring
Gherkin / UI / flow graph / Step Block               Validation AST / MCP
             |                                                |
             +-------------------+----------------------------+
                                 |
                                 v
                     Canonical Operation Invocation
                  operation ref + typed inputs + outputs
                                 |
                                 v
                    Versioned Operation Registry
          descriptor + projections + handler identities + hashes
                         /                       \
                        v                         v
             Manual/runtime projection       Managed capsule compiler
             readable Cucumber binding       frozen reviewed bindings
                        \                         /
                         +-----------+-----------+
                                     v
                          Shared trusted handlers
                                     |
                                     v
                         Playwright / Cucumber runtime
```

## Canonical Contracts

### Operation Definition

The exact schema will be finalized in an ADR, but it must cover at least:

```ts
type OperationDefinition = {
  id: string
  version: string
  title: string
  description: string
  categories: string[]
  capabilities: string[]
  runtime: 'browser' | 'api' | 'node' | 'database'
  inputs: OperationInput[]
  outputs: OperationOutput[]
  assertionConcerns: string[]
  evidenceSemantics?: EvidenceSemantics
  securityClass: 'built-in' | 'bounded-structured' | 'reviewed-extension'
  handler: { id: string; version: string; contentHash: string }
  humanProjections: HumanOperationProjection[]
  agentProjection: AgentOperationProjection
  aliases: CompatibilityAlias[]
  deprecated: boolean
  replacement?: { id: string; version: string }
}
```

The descriptor hash excludes generated timestamps and includes every field that can affect selection, validation,
review, or execution. The handler hash binds executable bytes independently from display metadata.

### Operation Invocation

```ts
type OperationInvocation = {
  operation: { id: string; version: string; descriptorHash: string }
  inputs: Record<string, OperationValue>
  store?: { output: string; as: string }
  presentation?: {
    keyword: 'Given' | 'When' | 'Then' | 'And'
    description: string
    humanProjectionId?: string
  }
}
```

`OperationValue` must support bounded strings, numbers, booleans, JSON, locator references, environment references,
stored-value references, file/artifact references, and reviewed-extension references without allowing executable input.

### Human projections

A human projection defines a Cucumber expression and a deterministic parameter adapter into canonical inputs. More
than one readable phrase may project to one operation. A projection cannot contain business logic or call Playwright
directly. Existing signatures remain stable compatibility aliases where possible.

### Agent projections

Agent discovery exposes the same operation identity, typed inputs, output/store behavior, categories, capabilities,
examples, assertion concerns, deprecation, compatibility, and bounded search terms. It must not expose source code,
absolute paths, environment values, or unbounded manifests.

### Handler registry

Handlers live in an Appraise-owned runtime package with no dependency on UI, Prisma, target automation files, or a
mutable global locator cache. The registry validates that every built-in descriptor resolves to exactly one handler,
every handler is referenced, and every supported runtime has a declared adapter.

Handlers receive a bounded execution context containing the current page/runtime, resolved input values, a frozen
locator resolver, stored-value access, evidence recorders, and cancellation/timeout controls. Handler code owns
Playwright behavior; projections only adapt inputs.

## Artifact And Authority Model

### Human-authored tests

- `TemplateStep` becomes a human projection record tied to an exact operation reference.
- `TestCaseStep` and `TemplateTestCaseStep` retain readable Gherkin and stable UI identities while storing or deriving
  the canonical invocation.
- Step Blocks become versioned compositions of canonical invocations; their hashes include ordered operation refs and
  parameter mappings.
- Manual execution may continue using mutable current project locators, but it executes shared handlers and records
  the resolved operation and locator identities in evidence.

### Agent-authored managed validations

- Validation AST steps reference canonical operation IDs directly.
- Search, starter submissions, recipes, schema examples, and compiler errors use the same operation contract.
- AST check validates descriptor version/hash, inputs, outputs, capabilities, locator compatibility, evidence
  semantics, surface support, and deprecation.
- Canonical plan projection replaces misleading `templateStepName` action storage with an explicit operation reference.

### Managed capsules

- The reviewed runtime input lists exact operation descriptor and handler identities.
- Materialization includes only the selected handler module closure, or a deterministic reviewed registry bundle.
- The generated binding module registers frozen Gherkin text and delegates to the sealed handler registry.
- Preflight verifies descriptor hashes, handler hashes, capsule generator identity, runtime package identity, locator
  snapshot, selected cases, and absence of unresolved compatibility aliases.
- Existing completed capsules remain readable and executable only under their original generator version; they are
  never silently rewritten.

### Optional repository export

Export renders human-readable features and projections from canonical invocations. Exported files remain distribution
artifacts, not managed execution authority, and must carry source hashes that identify the canonical operation graph.

## Capability Coverage Model

Build a generated coverage ledger containing one row per operation and legacy template step:

| Field               | Meaning                                                       |
| ------------------- | ------------------------------------------------------------- |
| canonical operation | Exact `id@version` and descriptor hash                        |
| legacy steps        | Mapped slugs and Cucumber signatures                          |
| human authoring     | `native`, `composition`, `structured`, or explicit exception  |
| agent authoring     | `native`, `composition`, `structured`, or explicit exception  |
| capsule execution   | Exact handler identity or reviewed-extension requirement      |
| manual execution    | Exact handler identity or compatibility adapter               |
| inputs/outputs      | Compatibility and conversion status                           |
| evidence semantics  | Assertion/observer behavior and required artifacts            |
| migration state     | mapped, needs split, needs merge, custom, deprecated, blocked |

CI fails when a built-in operation lacks a handler, a human or agent projection lacks an approved exception, two
active definitions claim the same identity, an alias is ambiguous, a projection changes inputs incompatibly, or a
catalog rebuild changes semantic hashes without reviewed source changes.

The initial ledger must classify all 116 current template steps, all managed actions, both structured-operation
fallbacks, built-in runtime observers, Step Block composition behavior, and custom-extension capabilities.

## Edge Cases The Architecture Must Handle

### Parameter and locator semantics

- Parameter ordering differences between Cucumber signatures and named agent inputs.
- Boolean wording such as “should/should not” versus explicit expected values.
- Locator ID, name, group, module, version, selector strategy, and frozen-selector resolution.
- Optional inputs, defaults, numeric units, bounds, enums, JSON depth/size, and unknown options.
- Multiple locator inputs, collections, coordinates, frames, popups, tabs, and page-level operations.
- Stored values referenced inside nested structured inputs.
- Sensitive environment references that must never be serialized into descriptors or evidence.

### Async and event-driven behavior

- Dialog, popup, download, request, and response listeners that must be armed before the triggering operation.
- Composite operations such as “click and wait for download” that cannot be represented as naïve sequential steps
  without changing timing semantics.
- Cancellation, timeout propagation, page replacement, tab switching, and cleanup after handler failure.
- Network-idle and runtime-cleanliness assertions that must observe a complete scenario window without hanging on
  applications with intentional long-lived connections.

These behaviors may be atomic operations or explicitly modeled compositions with concurrency semantics. The plan must
not flatten them into unsafe ordinary sequences.

### Assertions and evidence

- Exact versus contains matching, missing elements, hidden versus detached state, and Playwright auto-wait behavior.
- Console errors, uncaught page errors, failed requests, HTTP error responses, accessibility evidence, responsive
  overflow, persistence, downloads, screenshots, traces, and stored diagnostics.
- Assertion concerns used by validation coverage and authoring profiles.
- Hooks remain runtime evidence and never inflate authored-step counts.
- Equivalent human and agent invocations must produce equivalent result and evidence classifications.

### Compositions

- Step Block parameter maps, nested composition, cycle rejection, maximum depth/step count, output-name collisions,
  locator ownership, and deterministic expansion.
- Version pinning so an edited Step Block cannot mutate an approved validation or historical test run.
- Search may recommend a composition, but review and capsules must show its fully expanded operation graph and source
  composition identity.

### Custom and legacy source

- Built-in registry fragments migrate automatically only when their mappings are exact.
- User-created legacy template-step TypeScript remains manual-only until classified and reviewed.
- A migration assistant may parse signatures and propose operation mappings, but cannot treat arbitrary source as
  trusted managed execution.
- Unmapped custom source can be rewritten as a composition, bounded structured operation, or reviewed extension.
- Custom operation promotion to a shared library requires explicit ownership, versioning, capability policy, review,
  and collision checks.
- Removing or deprecating custom operations must not orphan historical cases or capsules.

### Compatibility and history

- Existing TemplateStep IDs and foreign keys remain stable during mapping.
- Existing managed publications and completed capsules retain their original immutable hashes and generator version.
- In-progress managed plans either finish on the old generator or are explicitly invalidated and re-reviewed; they are
  never silently mixed across generators.
- Registry aliases resolve only at authoring/migration time. Reviewed invocations and capsules contain canonical IDs.
- Rollback must preserve the old reader until every new write is proven readable, but only one writer may be active at
  a time.

### Distribution and generated output

- Root sources remain canonical; scaffold copies are prepared only after focused source validation.
- Registry manifests omit or stabilize timestamps so unchanged content produces no diff.
- Generated fragments, manifests, docs, schemas, scaffold copies, and Graphify outputs are reviewed separately from
  authored source.
- Generated output cannot become an alternative source of operation truth.

## Data Model Migration

The exact Prisma changes require an ADR and migration prototype, but the migration must support these states:

1. **Mapped built-in:** existing `TemplateStep` points to an exact canonical operation and human projection.
2. **Mapped composition:** existing step behavior expands to multiple canonical invocations with preserved atomic or
   concurrency semantics.
3. **Manual-only custom:** existing source remains usable by legacy manual execution but is rejected for new managed
   validation.
4. **Reviewed custom operation:** project/global ownership and exact extension review authorize shared execution.
5. **Deprecated alias:** existing records remain readable while new authoring selects the replacement operation.

Prefer additive nullable mapping columns and mapping tables during the bounded transition. Backfill deterministically,
verify referential parity, switch new writes to canonical invocations, then make canonical references mandatory and
remove obsolete function-definition authority. Do not maintain indefinite bidirectional synchronization.

The migration must inventory and preserve:

- `TemplateStep`, `TemplateStepParameter`, and `TemplateStepGroup`;
- `TestCaseStep` and its parameters;
- `TemplateTestCaseStep` and its parameters;
- `StepBlockStep.parameterMap` and ordering;
- shared versus project-owned resource ownership;
- generated registry slugs, signatures, source hashes, and installed fragments; and
- historical plan projections, publications, runtime inputs, capsules, and evidence.

## MCP, CLI, UI, And Agent Experience

### Unified discovery

Replace competing action and template-step discovery with one operation discovery domain:

- `operation_categories`
- `operation_search`
- `operation_read`
- bounded `appraise://operations` and contract resources

During migration, old tools remain aliases that return canonical operation identities and a deprecation notice. They
must not return results that the managed AST cannot represent.

Search ranking considers intent, exact phrases, parameter compatibility, required input types, outputs/store needs,
assertion concerns, runtime, capabilities, surface support, deprecation, and project ownership. Responses include one
recommended operation, bounded alternatives, why each matched, missing required bindings, and the exact legal next
action.

### Human authoring

- UI forms continue to present readable names, signatures, icons, groups, and parameters.
- Advanced users may inspect the canonical operation identity and compatibility status.
- Step Blocks and template test cases compose the same operations available to agents.
- Creating custom behavior first shows reusable and structured matches, then requires a gap justification and review.

### Agent authoring

- Validation starter submissions and recipes contain valid canonical operation references.
- AST schemas accept canonical operations and reviewed compositions; they never accept source paths as execution
  authority.
- Compile errors distinguish unknown operation, unsupported surface, incompatible locator, invalid input, stale hash,
  deprecated alias, missing output, and custom-review requirement.
- Compact responses keep operation IDs, descriptor hashes when needed, binding gaps, and one next action without
  returning the entire catalog.

### Drift telemetry

Record bounded metrics for discovery calls, selected rank, fallback usage, structured-operation usage, custom-gap
justifications, compile rejections by code, deprecated aliases, surface exceptions, and human-versus-agent coverage.
Never record secrets, full test content, selectors, arbitrary source, or unbounded prompts.

## Success Measures And Drift Budget

The migration is not successful merely because both surfaces compile. Certification must prove:

- 100% of current built-in template steps and managed actions have a reviewed ledger disposition.
- 100% of active built-in operations have one handler and both human and agent projections, except explicitly approved
  surface exceptions.
- Zero reviewed capsules contain unresolved aliases, mutable TemplateStep IDs, target source paths, or independently
  generated Playwright dispatch logic.
- Zero unilateral catalog additions pass CI.
- Equivalent human and agent parity cases resolve to the same ordered operation references and compatible typed inputs.
- Simple CRUD happy paths complete without a custom extension or structured fallback unless the product genuinely uses
  an uncommon browser primitive.
- Operation search returns a usable exact or compatible result within a bounded response and without fetching the full
  catalog for the standard parity suite.
- Compatibility-alias and legacy manual-only usage trend downward and have explicit removal or retention decisions.
- Semantically unchanged registry builds produce zero authored, manifest, scaffold, or documentation diff.
- New lifecycle audits add generic contract fixtures only when they expose a new protocol, browser primitive, security
  boundary, or lifecycle state—not merely a new sample application.

Capture the pre-migration baseline for search calls, returned tokens, fallback rate, custom-extension proposals,
compile retries, authoring duration, and human interventions before setting numeric regression thresholds. The first
certified unified run establishes the ratchet; later changes may improve these values but must not worsen them without
an explicit reviewed exception.

## Delivery Dependency Map

Tasks follow the dependency order below. “Large” entries are delivery groups and must be split by operation family or
consumer into reviewable PR-sized slices; the checkpoint remains the authority boundary.

| Task                         | Depends on         | Scope                   | Primary areas                                                        |
| ---------------------------- | ------------------ | ----------------------- | -------------------------------------------------------------------- |
| 0.1 drift boundary           | None               | Small                   | agent docs, harness/source-boundary check                            |
| 0.2 capability ledger        | 0.1                | Medium                  | registry parser, action catalog, capsule inventory, generated ledger |
| 1.1 ADR and contracts        | 0.2                | Medium                  | `docs/decisions`, operation schemas, canonical serialization         |
| 1.2 registry kernel          | 1.1                | Medium                  | shared runtime package, manifest builder, bounded readers            |
| 2.1 primitive handlers       | 1.2                | Large by family         | Cucumber runtime operations, assertions, observers, adapters         |
| 2.2 event/composite handlers | 1.2                | Large by family         | dialogs, popups, downloads, network events, tabs, frames             |
| 2.3 structured fallback      | 2.1                | Medium                  | structured operation schemas, stored values, security bounds         |
| 3.1 human projections        | 2.1, 2.2           | Large by group          | authored template metadata, generated wrappers, registry build       |
| 3.2 persistence backfill     | 1.1, 3.1           | Large by entity         | Prisma migration, Template Steps, cases, templates, Step Blocks      |
| 3.3 human single-write       | 3.2                | Large by flow           | services, UI authoring, sync/import, manual runtime adapter          |
| 4.1 agent projection         | 1.2, 2.1, 2.2      | Medium                  | operation search/read, MCP/package contract, aliases                 |
| 4.2 AST migration            | 4.1                | Large by compiler stage | AST schema, check, preview, compile, canonical projection            |
| 4.3 guidance and telemetry   | 4.1, 4.2           | Medium                  | MCP resources, skills, docs, response projection, metrics            |
| 5.1 capsule delegation       | 2.1, 2.2, 4.2      | Large by capsule layer  | materializer, binding registration, manifest, receipt, preflight     |
| 5.2 execution conformance    | 3.3, 5.1           | Medium                  | shared generic fixture, browser adapters, evidence comparison        |
| 5.3 generator cutover        | 5.1                | Medium                  | lifecycle services, retries, continuation, diagnostics               |
| 6.1 custom migration         | 3.2, 4.2, 5.1      | Large by custom class   | inventory, mapping assistant, extensions, ownership, review          |
| 6.2 duplicate removal        | 3.3, 4.3, 5.3, 6.1 | Medium                  | old definitions, switches, writers, compatibility aliases            |
| 6.3 current docs             | 6.2                | Medium                  | architecture, runtime, lifecycle, MCP, scaffold, ownership docs      |
| 7.1 certification gates      | 3.3, 4.3, 5.3, 6.1 | Medium                  | parity, drift, hashes, receipts, generated stability                 |
| 7.2 real lifecycle           | 7.1                | Medium                  | human UI flow, delegated-agent flow, managed evidence                |
| 7.3 release validation       | 6.2, 6.3, 7.2      | Medium                  | scaffold/package sync, quality gates, release checks, Graphify       |

After Task 1.2, handler families in Tasks 2.1 and 2.2 may proceed independently. Human projection groups may proceed
in parallel only after their handler family is accepted. AST and capsule authority cutovers remain sequential. Schema
migrations, single-writer switches, generator cutover, duplicate removal, and final synchronization must never run in
parallel against the same checkout or database.

## Implementation Tranches

## Tranche 0: Freeze Drift And Produce The Ledger

### Task 0.1: Add a temporary change boundary

Document that new browser capabilities must not be added independently to the legacy template catalog, managed action
catalog, or capsule switch while this migration is active. Urgent defects may be repaired in both paths with a linked
parity test, but net-new semantics wait for the canonical registry.

**Acceptance criteria:**

- Active agent docs identify the temporary boundary and canonical migration plan.
- CI or a focused check reports unilateral built-in additions.
- Existing user-defined custom steps remain allowed under their current manual-only rules.

**Verification:** `npm run check:harness` and a focused unilateral-addition fixture.

### Task 0.2: Generate the complete capability and migration ledger

Build a deterministic inventory from authored template-step sources, registry manifests, Prisma-backed mappings,
managed action descriptors, structured operations, custom-extension policy, and capsule dispatch cases.

**Acceptance criteria:**

- Every current template step and managed action appears exactly once.
- Exact, near, composite, missing, and conflicting mappings are distinguishable.
- Generated timestamps and file order cannot change the ledger hash.
- Human review resolves every non-exact mapping before handler migration.

**Verification:** registry parser tests, catalog tests, and a checked-in ledger snapshot with a stable hash.

### Checkpoint 0

- No new independent capabilities were introduced.
- The ledger accounts for 100% of both catalogs.
- Ambiguous mappings are human-reviewed before code movement.

## Tranche 1: Define The Canonical Operation Kernel

### Task 1.1: Record the operation architecture ADR and schemas

Define descriptor, invocation, value, projection, handler, composition, compatibility, surface-exception, and evidence
contracts. Decide versioning and content-hash boundaries explicitly.

**Acceptance criteria:**

- The ADR records rejected alternatives, including using legacy source as capsule authority, retaining two catalogs,
  generating handlers from Gherkin source, and reducing everything to arbitrary structured Playwright calls.
- Schemas reject executable inputs, ambiguous aliases, invalid versions, duplicate parameters, unknown outputs, and
  unbounded data.
- Canonical serialization is deterministic.

**Verification:** schema, canonicalization, negative-security, and version-compatibility tests.

### Task 1.2: Create the shared operation registry package

Introduce a runtime-neutral registry API that loads built-in definitions and validates exact descriptor/handler
coverage without importing Prisma, UI, MCP, or target files.

**Acceptance criteria:**

- One operation identity resolves to one active version and handler per runtime.
- Catalog listing and reading are bounded and content-hash aware.
- No built-in definition exists without human and agent projection state.

**Verification:** focused package tests and deterministic manifest snapshot.

### Checkpoint 1

- Human approval of the ADR and contract hashes.
- Existing code continues using old paths; the new kernel is additive and not yet authoritative.

## Tranche 2: Consolidate Trusted Handlers

### Task 2.1: Extract primitive page, locator, assertion, observer, storage, and evidence handlers

Move Playwright behavior from template-step bodies, structured-operation switches, and capsule dispatch into the shared
handler package. Preserve exact semantics through characterization tests before deleting any implementation.

**Acceptance criteria:**

- Click, fill, navigation, keyboard, focus, viewport, waits, element assertions, and runtime-cleanliness operations use
  one handler each.
- Handlers accept frozen or live locator adapters without changing operation semantics.
- Error codes are stable and surface-specific wrappers add context without changing classification.

**Verification:** table-driven handler conformance across Chromium and mocked failure paths.

### Task 2.2: Model event-driven and composite handlers safely

Implement explicit concurrency semantics for dialogs, popups, downloads, request/response waits, tab/frame changes,
and operations that arm an event before a trigger.

**Acceptance criteria:**

- No event-driven operation is flattened into an unsafe sequential pair.
- Listener cleanup, timeout, cancellation, and partial failure are deterministic.
- Stored outputs are typed and collision checked.

**Verification:** focused real-browser tests for each concurrency family, using generic fixtures rather than sample
applications.

### Task 2.3: Unify structured-operation fallback

Make bounded structured operations call the same operation kernel and typed value resolver. Remove separate option and
argument policies after parity is proven.

**Acceptance criteria:**

- Allowlisted operations, bounds, stored references, and security rejections remain at least as strict as today.
- A structured fallback cannot shadow a semantic operation without an explicit reason.
- Arbitrary evaluation, callbacks, regex objects, filesystem output paths, and executable source remain forbidden.

**Verification:** existing structured-operation tests plus cross-projection parity cases.

### Checkpoint 2

- Shared handlers pass all characterization tests.
- No production authoring path has switched yet.
- Security review confirms no capability expansion through input parsing.

## Tranche 3: Project Human Authoring Onto Operations

### Task 3.1: Generate built-in human projections and registry fragments

Convert built-in template-step definitions into declarative human projections over canonical operations. Generate
Cucumber registration wrappers, public fragments, descriptions, icons, groups, parameters, and manifests.

**Acceptance criteria:**

- Existing stable signatures continue to parse and execute with equivalent semantics.
- Generated wrappers contain no Playwright business logic.
- Unchanged operation/projection content produces byte-identical generated output.
- The human catalog retains or improves its current 116-step capability coverage.

**Verification:** signature parity, registry-install, sync, manual test-case, and generated-diff tests.

### Task 3.2: Migrate Test Cases, template test cases, and Step Blocks

Add canonical operation/composition references while preserving existing IDs, labels, Gherkin, order, parameters,
flows, and ownership.

**Acceptance criteria:**

- Dry-run inventory precedes backfill.
- Exact mappings backfill idempotently; ambiguous/custom rows remain classified and untouched.
- Step Block cycles, depth, parameter maps, output conflicts, and version hashes are validated.
- Rollback can read every backfilled row with the old reader until the write cutover.

**Verification:** migration tests on seeded legacy, custom, orphaned, referenced, and mixed datasets.

### Task 3.3: Switch human authoring to canonical single-write

Update UI and services so new and edited built-in steps write canonical invocation authority while retaining readable
projections.

**Acceptance criteria:**

- There is one writer for built-in semantics.
- UI-created and imported Gherkin produce the same invocation hash when semantically equivalent.
- Manual execution uses shared handlers and reports canonical operation identities.

**Verification:** service tests, UI flow tests, sync round-trip tests, and one generic manual execution E2E.

### Checkpoint 3

- Existing human-authored tests execute through shared handlers.
- No managed capsule behavior has changed.
- User-visible signature and Step Block parity is approved.

## Tranche 4: Project Agent Authoring Onto Operations

### Task 4.1: Replace the managed action catalog with the unified operation projection

Keep compatible `browser.*` identities where they are already suitable and map legacy template slugs/signatures as
aliases. Expand agent-visible coverage to the reviewed operation ledger.

**Acceptance criteria:**

- Agent discovery can represent every built-in human capability or returns an explicit surface exception.
- Template-step and action search aliases converge on the same canonical result.
- Compact listing remains bounded and full descriptors remain hash-addressable.

**Verification:** MCP/package contract tests, ranking tests, token budgets, alias ambiguity tests, and coverage gate.

### Task 4.2: Revise Validation AST and composition references

Rename action-only fields to operation references and allow reviewed compositions without accepting source paths or
mutable template IDs as runtime authority.

**Acceptance criteria:**

- Starter ASTs, recipes, examples, search results, check, preview, compile, and error recovery use one schema.
- Old AST action references normalize deterministically during the bounded compatibility window.
- Canonical reviewed output contains no unresolved aliases or mutable composition references.

**Verification:** schema parity, compiler, preview, coverage, extension, and compatibility tests.

### Task 4.3: Align agent guidance and drift telemetry

Update MCP resources, skills, current docs, coordinator references, and responses. Track bounded selection/fallback
metrics without recording sensitive content.

**Acceptance criteria:**

- No active guidance tells agents to select a resource the AST cannot represent.
- Search returns exact binding gaps and one legal next action.
- Custom-operation proposals require a catalog-gap receipt or explicit human override.

**Verification:** harness checks, generated coordinator reference checks, response token budgets, and policy tests.

### Checkpoint 4

- Human and agent authoring create equivalent canonical invocations for the parity suite.
- New managed publications use only canonical operation identities.
- Old managed publications remain readable but are not rewritten.

## Tranche 5: Make Capsules Freeze Shared Operations

### Task 5.1: Replace hardcoded capsule dispatch with sealed handler delegation

Materialize the exact reviewed operation handler closure and generate only expression registration plus delegation.

**Acceptance criteria:**

- `binding-generator.ts` contains no per-operation Playwright switch.
- Capsule manifests and command receipts bind descriptor, handler, registry, generator, and runtime hashes.
- Target automation and mutable locator caches remain inaccessible.
- Only operations referenced by the reviewed publication are executable in the capsule.

**Verification:** materializer, blob, receipt, preflight, containment, mutation, and dry-run tests.

### Task 5.2: Add cross-surface execution conformance

Execute equivalent human and agent invocations through manual and capsule adapters and compare observable results and
evidence classifications.

**Acceptance criteria:**

- Built-in parity is table-driven by operation, not by sample application.
- Expected differences such as frozen versus live locator resolution are explicit adapter assertions.
- Console/network/accessibility/responsive/persistence and event-driven evidence are covered.

**Verification:** generic browser fixture matrix across Chromium, Firefox, and WebKit where supported.

### Task 5.3: Define generator-version cutover for in-flight plans

Choose an explicit boundary for old and new capsule generators and prevent mixed execution within one reviewed
publication.

**Acceptance criteria:**

- Completed capsules remain immutable and diagnosable.
- In-flight publications either finish on their pinned generator or require explicit invalidation and re-review.
- Retry, continuation, baseline, implementation, and completion preserve generator identity.

**Verification:** lifecycle tests for old complete, old in-flight, new, retry, feedback, interruption, and rollback.

### Checkpoint 5

- Fresh managed lifecycle passes using sealed shared handlers.
- Mutation and cross-project attempts fail closed.
- Human review confirms exact operation and handler identities in validation review.

## Tranche 6: Migrate Custom Behavior And Remove Duplicate Authority

### Task 6.1: Classify and migrate legacy custom template steps

Provide inventory, suggested mappings, composition conversion, structured fallback conversion, and reviewed-extension
conversion without auto-trusting source.

**Acceptance criteria:**

- Every custom step receives a visible status and legal migration action.
- Manual-only custom behavior remains usable until deliberately migrated or deprecated.
- Managed use requires exact review and capability policy.
- Project/global ownership and name/signature collisions are enforced.

**Verification:** migration assistant, malicious-source, ownership, collision, and historical-reference tests.

### Task 6.2: Remove old dispatchers and dual catalog writers

After cutover evidence is accepted, delete the capsule switch, executable built-in template bodies, duplicate action
definitions, redundant structured policies, and misleading projection field names.

**Acceptance criteria:**

- Static analysis finds no built-in semantic implementation outside the handler registry.
- Old public tools either resolve through bounded aliases or are removed according to the compatibility decision.
- Generated output has one canonical build path.

**Verification:** Fallow, source-boundary lint, full tests, package builds, and artifact checks.

### Task 6.3: Update active architecture and operator documentation

Revise runtime, lifecycle, reusable-step, scaffold, MCP, generated-artifact, validation-matrix, and ownership docs. Create
or update the accepted ADR and mark superseded guidance clearly.

**Acceptance criteria:**

- Active docs distinguish operation authority, human/agent projections, composition, manual execution, and capsule
  compilation.
- No active doc calls legacy template files or the capsule generator an independent semantic authority.
- Historical plans remain historical and link to the accepted decision where useful.

**Verification:** `npm run check:harness`, reference generation, and focused doc-link checks.

### Checkpoint 6

- One catalog, one handler layer, one canonical invocation model, and one build path remain.
- Compatibility readers have a dated removal condition.
- No historical evidence or user-authored custom source was silently rewritten.

## Tranche 7: Certification And Release

### Task 7.1: Add architecture certification gates

Create a deterministic certification command covering catalog completeness, projection parity, handler closure,
generated-output stability, migration status, surface exceptions, and capsule sealing.

**Acceptance criteria:**

- CI fails on unilateral capability additions or semantic drift.
- Certification emits a bounded content-addressed receipt.
- Receipt counts operations, projections, handlers, aliases, exceptions, custom statuses, and parity cases.

**Verification:** intentional drift fixtures for every gate.

### Task 7.2: Run real human and delegated-agent lifecycle certification

Use one generic capability fixture and one real external target. Author equivalent coverage from the human UI and an
isolated agent, review both, execute baseline and implementation capsules, and complete the Appraise lifecycle.

**Acceptance criteria:**

- The agent creates no unnecessary custom operations.
- Human and agent artifacts resolve to the same canonical operation graph for equivalent intent.
- The whole lifecycle reaches terminal completion with valid managed evidence.
- Timing, search calls, fallbacks, token use, custom-gap attempts, and review interventions are recorded.
- Discovered defects become generic contract tests, not new app-specific suites.

**Verification:** `npm run certify:plan-builder`, the new operation certification command, and preserved lifecycle
receipt links.

### Task 7.3: Complete release validation and scaffold synchronization

Run focused checks first, then prepare the base scaffold, package registries, generated references, and Graphify only
after canonical source is stable.

**Verification:**

- Focused operation, projection, handler, compiler, materializer, MCP, UI, migration, and runtime tests.
- `npm --prefix packages/create-appraisejs run prepare-template`.
- `npm --prefix packages/appraisejs run test` and package build.
- `npm run validate`, `npm run build`, `npm run check:harness`.
- `npm run quality:fallow:commit`, `npm run quality:react-doctor:commit`.
- `npm run release:check:artifacts`, `npm run release:check:packages`.
- `npm run graphify:auto` only after authored and synchronized sources are final.
- `git diff --check` and generated-diff classification.

## Drift Prevention Gates

The finished architecture must enforce:

- **Definition gate:** every operation has one identity/version and valid content hash.
- **Handler gate:** every executable operation has one trusted handler; no orphan handlers exist.
- **Surface gate:** human and agent projections exist or an explicit approved exception explains why not.
- **Projection gate:** parameter adapters are total, typed, deterministic, and round-trip compatible.
- **Alias gate:** legacy names and signatures resolve unambiguously and never enter reviewed capsules.
- **Composition gate:** expansion is bounded, acyclic, version-pinned, and reviewable.
- **Capsule gate:** reviewed descriptor and handler hashes match the exact sealed bytes.
- **Custom gate:** custom behavior has ownership, gap justification, capability policy, exact review, and versioning.
- **Generated gate:** unchanged semantics produce byte-identical manifests, fragments, docs, scaffold copies, and hashes.
- **Test gate:** framework tests are contract- or capability-based; app-branded fixtures require explicit justification.
- **Documentation gate:** current docs and MCP resources are generated or validated against the same catalog.

## Rollout And Rollback Strategy

1. Inventory and freeze unilateral additions.
2. Add the operation kernel without switching writers.
3. Characterize and move handlers while old surfaces remain adapters.
4. Switch human authoring to canonical single-write.
5. Switch agent authoring and new publications to canonical single-write.
6. Switch only new reviewed capsules to the new generator version.
7. Migrate custom behavior deliberately.
8. Remove duplicate definitions and dispatch only after certification.

Each cutover has a feature/config boundary and a read-only rollback path. Rollback may restore the previous writer for
new artifacts only if no new-format artifact has been accepted under a later review receipt. It must never rewrite or
reinterpret completed evidence. Database migrations remain additive until the final duplicate-authority removal.

## Risks And Mitigations

| Risk                                                       | Impact   | Mitigation                                                                                                                 |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| “Unification” becomes a lowest-common-denominator API      | High     | Coverage ledger requires parity or explicit reviewed exceptions; migrate rich human capabilities into operations.          |
| Human Gherkin semantics change during mapping              | High     | Characterization tests, stable signatures, exact mapping review, and dry-run migration.                                    |
| Capsule isolation weakens by importing shared runtime code | Critical | Seal selected handler bytes and hashes; prohibit target imports and mutable global resolution; extend preflight integrity. |
| Event-driven steps become flaky                            | High     | Model atomic/concurrent handler semantics explicitly and test real browser event ordering.                                 |
| Arbitrary legacy source becomes trusted                    | Critical | Keep it manual-only until reviewed conversion; never auto-import executable source into capsules.                          |
| Existing foreign keys or Step Blocks are orphaned          | High     | Additive mappings, idempotent backfill, reference inventory, stable IDs, and rollback readers.                             |
| Agent discovery remains too large                          | Medium   | Bounded search/read, typed filters, compact recipes, known-hash responses, and ranked next actions.                        |
| Compatibility aliases become permanent                     | Medium   | Assign removal criteria, telemetry, deprecation receipts, and no alias storage in new reviewed artifacts.                  |
| Generated output overwhelms review                         | Medium   | Deterministic generation, timestamp elimination, staged sync, and authored/generated diff classification.                  |
| New sample app creates another fixture suite               | Medium   | Require contract-level reproduction and generic fixtures before accepting a permanent test.                                |
| Migration spans too many subsystems at once                | High     | Tranche checkpoints, single-writer cutovers, focused PRs, and human approval before each authority transition.             |

## Decisions Requiring Human Approval Before Implementation

The plan recommends these defaults:

1. Preserve suitable existing `browser.*` managed action IDs as canonical operation IDs to minimize publication and
   agent migration; map human step slugs/signatures as projections and aliases.
2. Keep readable `TemplateStep` records as human projections rather than deleting the human domain.
3. Treat built-in operation definitions and handlers as packaged Appraise source; treat user-created operations as
   versioned Appraise-owned reviewed resources.
4. Permit a short additive compatibility window but prohibit permanent dual writers or dispatchers.
5. Pin in-flight managed publications to their original capsule generator; require explicit re-review to cross the
   generator boundary.
6. Keep unmapped legacy custom source manual-only until deliberately converted.
7. Require full human/agent surface coverage for built-ins, with rare explicit exceptions rather than silent gaps.

Approval of this plan approves those defaults unless they are amended during review.

## Definition Of Done

- One canonical operation contract and handler authority exists.
- Every current built-in template step and managed action is mapped, migrated, deprecated, or explicitly excepted.
- Human and agent authoring can reach the same built-in capability set.
- Equivalent intent compiles to equivalent canonical invocation graphs.
- Capsules freeze reviewed shared handlers and contain no duplicate Playwright dispatcher.
- Existing test cases, Step Blocks, template test cases, custom source, publications, and evidence follow explicit safe
  migration rules.
- Unchanged catalog content generates no timestamp-only or ordering-only diffs.
- CI detects catalog, projection, handler, alias, composition, capsule, custom, generated, test-fixture, and doc drift.
- A real human flow and delegated-agent flow complete end to end with valid Appraise-owned evidence.
- Current architecture, lifecycle, runtime, reusable-step, MCP, scaffold, generated-artifact, and validation docs match
  the shipped system.
- Human review approves the certification receipt and compatibility removal conditions.
