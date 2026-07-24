# Unified Step Definition Authoring, Registration, And Execution

## Status

Implementation in progress for AppraiseJS 0.5. The shared registry, human draft editor, reviewed-extension pipeline,
and bounded agent authoring surface are implemented. Later consumer cutover and legacy-authority removal remain.

### Implementation checkpoint (2026-07-22)

Work completed on `codex/unified-step-definition-migration`:

- Recorded the unified Step Definition architecture and introduced shared runtime contracts for definitions,
  projections, bindings, and built-in registrations.
- Added Step Definition persistence, migration support, registry services, deterministic built-in registration, and
  focused registry/synchronization coverage.
- Routed built-in operation projections and setup synchronization through the new definition source while preserving
  the generated Cucumber runtime imports required by `npm run setup`.
- Added generated-step linting and regression coverage for duplicate imports, and made setup regenerate projections
  before synchronizing them.
- Updated active architecture, automation-sync, scaffold, runtime, and generated-artifact documentation for the
  foundation delivered so far.

Continuation state:

- Tranches 0-2 are foundation-complete only. The 2026-07-22 continuation audit confirmed that populated-database
  migration/rollback coverage is still incomplete and that the enabled Template Step creator remains a legacy writer,
  so Checkpoints 1 and 2 are not fully accepted yet.
- Tranche 3.1 now exposes draft create/read/revise/delete/validate/preview/review/publish and definition deprecation
  through thin Server Actions and matching HTTP adapters over the shared registry, with optimistic-revision, request
  validation, standard error-envelope, cache-invalidation, and exact publication-input coverage.
- Tranches 3 and 4 now provide a four-phase resumable editor (define, connect, verify, publish), deterministic
  generated contracts, contained reviewed-handler staging and behavioral conformance, exact
  review/publication/version/deprecation services, bounded MCP draft tools, and one-identity registry search. Required
  authoring data gates draft persistence and forward navigation. Execution source and runtime controls are
  progressively disclosed as advanced settings while preserving the recommended custom-code and Node.js defaults;
  the human form derives registry capability metadata from that runtime rather than accepting arbitrary capability
  text. Human and agent clients use the same registry boundary.
- The agent lifecycle is covered through agent-command provenance, exact human review, publication, unified discovery,
  and receipt-bound reviewed artifacts. Full external-workspace lifecycle certification remains part of release
  rollout evidence rather than permanent app-specific fixtures.
- Tranche 5.1 has a partial publication-safety foundation: the shared package now validates exact ready composition
  closures, cycles, exact typed input/output selectors and directional compatibility, prior-output references, and
  deterministic diagnostics before registry publication writes. Step Block backfill, human/MCP composition
  authoring, capsule/runtime execution, and consumer cutover remain outstanding.
- The 2026-07-24 CI repair completed the public coordinator boundary for all Step Definition MCP tools, moved
  Prisma-backed Step Definition service construction out of the API adapter, generated the current coordinator
  operation inventory, and removed every migration-added Fallow suppression through bounded editor, extension,
  release-check, swarm parser, lock, and ledger extractions. The four-phase editor and reviewed-extension behavior are
  unchanged, and the scaffold was regenerated from canonical root sources.
- CI-equivalent local verification after that repair passed 246 unit-test files with 1,054 tests, 50 focused
  Step Definition/coordinator tests, 13 swarm harness tests, the production build, the create-appraisejs test/build
  gates, and the release CI, coordinator-reference, generated-artifact, and package-content checks. The earlier
  release job failure was only the aggregate result of the repaired Root app and security/quality failures.
- Tranches 6-7 have not started. Consumer cutover, legacy-authority removal, rollout, and deletion gates remain
  outstanding.
- Resume with the remaining Tranche 5 composition backfill, authoring, and runtime work before consumer cutover. Do
  not restore legacy Template Step creation as independent authoring authority.

Checkpoint commits:

- `9bdb8af8` establishes the unified registry foundation.
- `60e22569` adds generated Step Definition lint protection.
- `d2391339` regenerates operation projections before synchronization.
- `150ca341` preserves generated runtime imports during `npm run setup`.
- `5f10203a` exposes shared human/API draft transitions.
- `71124740` adds reviewed extension artifacts and immutable publication binding.
- `bc569006` validates exact Step Definition composition closures and typed mappings before publication.

This plan corrects the remaining identity split after
`04-unified-operation-catalog-human-agent-authoring-and-capsule-compilation.md`. Migration `04` successfully unified
built-in execution semantics, handlers, generated Cucumber wrappers, agent operation descriptors, and capsule
compilation. It did not complete entity unification: persisted `TemplateStep` rows still own the human identity while
versioned operations own the agent and execution identity, and nullable mapping fields connect the two.

This plan supersedes migration `04` wherever that plan treats a Template Step as an independently identified human
projection of an operation. It preserves migration `04` decisions about trusted handlers, immutable reviewed
capsules, canonical typed inputs, registry-first reuse, readable Gherkin, and one implementation per executable
capability.

## Executive Summary

AppraiseJS must have one shared, versioned `StepDefinition` entity for every reusable behavior. Built-in, human-created,
and agent-created definitions use the same schema, publication contract, registry, discovery index, invocation model,
and execution-resolution path. A definition has one stable reference and multiple projections; it does not have a
human identity linked to a separate agent identity.

The target guarantee is:

> If a step is ready, a human can discover and author it, an agent can discover and author it, Appraise can validate
> its typed invocation, and the runtime can execute it without translating through another semantic identity.

All ready definitions remain shared across projects, matching the current Template Step library. Provenance records
how a definition entered the registry and which authority published it; provenance does not scope visibility. A
project-specific behavior that is unsuitable for the shared library remains a reviewed extension and is not silently
promoted into a shared Step Definition.

Human forms and agent commands are equal draft-authoring clients. Neither directly inserts ready registry rows.
Appraise alone transitions a draft to an immutable ready version after the same semantic, projection, execution,
integrity, and conformance contracts pass. The lifecycle is deliberately small: `draft -> ready -> deprecated`.

Appraise is a deterministic projection and governance system. Humans and external coding agents supply semantic
intent, examples, parameter meaning, and executable behavior. Appraise parses explicit structures, validates
contracts, generates projections and typed boilerplate, compiles user-authored handlers, enforces authority, and
publishes immutable artifacts. It does not require or embed an inference provider. Direct use of a future user's
ChatGPT or other subscription requires a separately designed and approved adapter and is not part of this migration.

## Confirmed Root Cause

### Two durable identities remain

- `TemplateStep.id` is referenced by test cases, template test cases, Step Blocks, UI forms, readable signatures, and
  database projections.
- `operationId@version` is referenced by Validation ASTs, descriptor hashes, agent discovery, trusted handlers, and
  capsules.
- `operationId`, `operationVersion`, `operationDescriptorHash`, `humanProjectionId`, and
  `operationMigrationState` attach the two systems but do not make them one entity.

### The split leaks into every boundary

- Discovery returns both `humanStep` and `agentOperation` so callers can reconstruct one conceptual capability.
- Canonical projection resolves an operation reference back to a Template Step using a non-unique database lookup.
- Human-created Template Steps can be discovered but are marked `handler-migration-required` and cannot be placed in
  the managed AST.
- Step Blocks can be discovered but are marked `composition-migration-required` and likewise cannot be authored as
  canonical managed invocations.
- Compatibility contracts overload `templateStepName` with canonical operation references and retain `action` as an
  alternate name for `operation`.
- Mapping drift, naming drift, descriptor drift, and handler drift need separate repair paths because no single entity
  owns the complete contract.

### Why incremental adapters are no longer sufficient

The mapping layer was a safe compatibility bridge while built-in handlers and capsules were unified. Continuing to
extend it would make nullable mapping state a permanent part of the product model. Combined search alone cannot make
a result authorable, projectable, executable, or integrity-bound. The entity and publication boundary must now be
unified.

## Non-Negotiable Decisions

### One identity, multiple projections

Every published behavior has exactly one versioned reference, such as `browser.viewport.set@1`. Human wording, agent
guidance, Cucumber expressions, forms, documentation, registry packages, and capsule bindings are projections or
consumers of that reference. A projection cannot introduce another semantic identity.

### Built-in and custom definitions use the same design

Built-in source registration, human form authoring, and agent command authoring produce the same canonical draft
schema and pass the same publication validator. Origin changes authorization and regeneration policy only; it does not
change entity shape, discovery behavior, invocation semantics, or readiness guarantees.

### Ready definitions are globally shared

Ready Step Definitions belong to one shared library. They do not carry project visibility. References from project
test cases, plans, publications, and capsules retain their normal project ownership, but the referenced definition is
global and versioned.

### Provenance is audit information, not scope

Provenance records creation method, creator, review authority, source reference, timestamps, and publication receipt.
It determines whether future changes originate from source sync or interactive versioning. It must never be used as
an implicit project filter.

### Three lifecycle states only

- `draft`: mutable and non-executable; it may be incomplete.
- `ready`: immutable and guaranteed to satisfy human, agent, projection, execution, and integrity contracts.
- `deprecated`: immutable and still resolvable for historical consumers, with an explicit reason and optional
  replacement.

There is no separately published `defined` state. Metadata-complete but execution-unbound work remains a draft.

### Humans and agents author; Appraise publishes

The human form and agent MCP commands create and revise drafts through the same application service. Neither client
may write registry tables, generated wrappers, handlers, or ready state directly. Appraise validates and atomically
publishes a version after the required review authority is satisfied.

### Appraise projects; it does not infer

Appraise may deterministically parse placeholders, generate schemas and TypeScript types, check exact and structural
conflicts, validate compatibility, compile code, run conformance tests, and render projections. It may not invent
descriptions, infer parameter meaning, generate semantic aliases, claim conceptual equivalence, recommend behavior
from prose, or generate implementation logic. Humans or external agents author those values through the same draft
contract. Any future inference adapter is optional, provider-isolated, and outside this plan.

### Published versions are immutable

Any semantic, input, projection, execution, or search-metadata change creates a new draft version. Existing test
artifacts and evidence continue to resolve their exact historical version and hashes.

### No executable source in metadata

Definitions reference trusted operation handlers, reviewed extensions, or ready compositions. They do not persist
arbitrary TypeScript function bodies as database metadata. Existing `functionDefinition` behavior is migrated or
quarantined, not normalized into the new contract.

### User code is a reviewed artifact

The wizard supports user-written handler code as a first-class path, but source and compiled bytes belong to a
separately versioned reviewed extension artifact. The Step Definition stores only the exact execution binding and
hashes. Appraise generates the handler contract and boilerplate mechanically from reviewed metadata; it never writes
the behavior itself or overwrites the user's implementation when metadata changes.

## Goals

- Replace dual Template Step and operation identity with one shared versioned Step Definition identity.
- Make ready mean equally discoverable and authorable by humans and agents and deterministically executable by the
  runtime.
- Generate all projections and registries from one canonical definition.
- Give human forms and agent tools the same draft, validation, preview, and publication semantics.
- Preserve readable Gherkin, Template Step groups, Step Blocks, template test cases, manual test cases, typed managed
  ASTs, trusted handlers, and immutable capsules.
- Migrate all current built-ins without changing their visible wording or executable behavior.
- Classify and migrate existing custom steps without granting trust to arbitrary source.
- Eliminate mapping-state-driven discovery and runtime selection.
- Move semantic search terms, aliases, examples, and input vocabulary into the definition that owns them.
- Add an executable-readiness receipt before a definition becomes ready.
- Preserve historical artifacts and compatibility readers through a bounded, observable deprecation window.

## Out Of Scope

- Project-scoping the shared Step Definition registry.
- Automatically publishing product-specific target-workspace behavior globally.
- Automatically trusting arbitrary custom TypeScript.
- Replacing Cucumber, Playwright, the trusted operation-handler package, or immutable runtime capsules.
- Inferring validation coverage or task graphs from Step Definition metadata.
- Rewriting completed historical evidence or mutable in-place upgrades of published references.
- Removing human authoring in favor of mandatory agent availability.
- Built-in LLM inference, semantic suggestion services, or direct use of a user's hosted-chat subscription.

## Canonical Vocabulary

- **Step Definition:** the single versioned semantic, authoring, and execution contract.
- **Step Reference:** `{ id, version, definitionHash }` identifying one immutable ready definition.
- **Human Projection:** readable title, description, Gherkin expression, group, keyword compatibility, and parameter
  bindings generated from or stored within the definition.
- **Agent Projection:** typed schema, compact summary, usage guidance, examples, capabilities, and search metadata for
  the same reference.
- **Execution Binding:** trusted operation handler, reviewed extension, or versioned composition used to execute the
  definition.
- **Step Invocation:** one Step Reference plus typed inputs, optional stored output, and presentation metadata.
- **Publication Receipt:** durable proof that all readiness contracts passed for an immutable version.
- **Compatibility Projection:** a temporary read model exposing a ready Step Definition through a legacy Template
  Step or operation-shaped API.

## Target Architecture

```text
Built-in source          Human creator              Agent command
      |                       |                           |
      +-----------------------+---------------------------+
                              |
                              v
                  Step Definition Draft Service
                  mutable draft + validation report
                              |
                       validate / preview
                              |
                    exact publication review
                              |
                              v
                 Atomic Step Publication Service
              semantic + projection + execution checks
                              |
                    publication receipt + hashes
                              |
                              v
                    Shared Step Registry
                 StepDefinition(id, version)
                  /          |           \
                 v           v            v
        Human projection  Agent projection  Execution binding
          Gherkin / UI      MCP / AST       handler/composition
                 \           |            /
                  +----------+-----------+
                             v
                    Canonical invocation
                             |
              manual runtime / reviewed capsule
```

## Canonical Contracts

### Step Definition

The schema must be shared by built-in registration, human endpoints, agent tools, packages, scaffold synchronization,
and runtime publication. The exact Zod and JSON Schema representation will be finalized in an ADR, but it must encode
at least:

```ts
type StepDefinition = {
  schemaVersion: '1'
  identity: {
    id: string
    version: string
    status: 'draft' | 'ready' | 'deprecated'
  }
  provenance: {
    creationMethod: 'built-in-source' | 'human-form' | 'agent-command' | 'migration'
    createdBy: string
    createdAt: string
    reviewedBy?: string
    sourceReference?: string
  }
  intent: {
    title: string
    description: string
    capabilities: string[]
    searchTerms: string[]
    examples: string[]
  }
  inputs: StepInputDefinition[]
  outputs: StepOutputDefinition[]
  human: {
    signature: string
    keywordCompatibility: Array<'Given' | 'When' | 'Then' | 'And'>
    parameterBindings: Array<{ placeholder: string; input: string }>
    groupId: string
  }
  agent: {
    summary: string
    usageGuidance: string
    examples: Array<{ intent: string; inputs: Record<string, unknown> }>
  }
  execution: StepExecutionBinding
  lifecycle: {
    supersedes?: StepIdentity
    deprecatedReason?: string
    replacement?: StepIdentity
  }
  integrity: {
    definitionHash: string
    humanProjectionHash: string
    agentContractHash: string
    executionHash: string
  }
}
```

### Inputs and outputs

```ts
type StepInputDefinition = {
  name: string
  label: string
  description: string
  type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'json'
    | 'locator'
    | 'environment-ref'
    | 'stored-value-ref'
    | 'artifact-ref'
    | 'reviewed-extension-ref'
  required: boolean
  defaultValue?: unknown
  examples: unknown[]
  aliases: string[]
  constraints?: {
    minimum?: number
    maximum?: number
    pattern?: string
    values?: unknown[]
  }
}

type StepOutputDefinition = {
  name: string
  description: string
  type: StepInputDefinition['type']
  storable: boolean
}
```

Input metadata is the authority for human controls, agent JSON Schema, AST checking, runtime argument validation,
documentation, and parameter compatibility. Signature parsing may create incomplete input drafts, but it may not
permanently infer types or meanings without review.

### Execution binding

```ts
type StepExecutionBinding =
  | {
      kind: 'operation'
      handlerId: string
      handlerVersion: string
      runtime: 'browser' | 'api' | 'node' | 'database'
    }
  | {
      kind: 'composition'
      steps: Array<{
        step: StepIdentity
        inputs: Record<string, InputExpression>
      }>
    }
  | {
      kind: 'reviewed-extension'
      extensionId: string
      extensionVersion: string
      exportName: string
      sourceHash: string
      runtime: 'browser' | 'api' | 'node' | 'database'
    }
  | { kind: 'unbound' }
```

`unbound` is valid only for drafts. Ready definitions resolve exactly one executable binding. Composition validation
must reject cycles, missing versions, incompatible mappings, deprecated dependencies unless acknowledged, and output
references that cannot be satisfied.

### Step invocation

```ts
type StepInvocation = {
  step: { id: string; version: string; definitionHash: string }
  inputs: Record<string, StepValue>
  store?: { output: string; as: string }
  presentation?: {
    keyword: 'Given' | 'When' | 'Then' | 'And'
    description?: string
  }
}
```

The Validation AST, human test-case projection, Step Block composition, template test case, runtime-input contract, and
capsule manifest converge on this invocation. `templateStepId`, `templateStepName`, `operationRef`, and legacy `action`
remain decoder inputs only during migration.

### Publication receipt

```ts
type StepPublicationReceipt = {
  step: StepIdentity
  definitionHash: string
  humanProjectionHash: string
  agentContractHash: string
  executionHash: string
  registryManifestHash: string
  conformanceRunId: string
  reviewAuthority: string
  publishedAt: string
}
```

The receipt is immutable and is returned by UI, API, MCP, sync, and release certification paths.

## Lifecycle And Transition Contracts

### Draft

Drafts are mutable authoring work. They may be incomplete, saved, previewed, validated, revised, or deleted. They do
not appear in executable discovery, cannot be referenced by a managed AST or ready composition, and do not generate
runtime wrappers or registry packages.

### Draft to ready

Publication is one atomic transition guarded by these contracts.

#### Identity contract

- The global ID and version are valid, unique, and unused.
- A published version is never mutated or replaced in place.
- Supersession and replacement references resolve without cycles.
- Reserved built-in namespaces require trusted source authority.

#### Semantic contract

- Title, description, capabilities, search terms, and examples are complete.
- The definition represents one cohesive behavior.
- Duplicate and substantial-overlap analysis has no unresolved blocking result.
- Search metadata belongs to the definition rather than a resolver-local synonym table.

#### Input and output contract

- Every input and output has a stable name, type, description, and valid constraints.
- Defaults and examples pass the generated schema.
- Human placeholders bind exactly once to compatible inputs.
- Agent examples provide all required inputs and no unknown inputs.
- Stored outputs agree with the execution binding.

#### Human projection contract

- The signature parses and is globally non-conflicting under Cucumber matching rules.
- The group exists in the shared library.
- Keyword compatibility is explicit.
- Generated wrappers compile and contain delegation only, not executable behavior.
- Rendered examples are readable and round-trip to the expected typed invocation.

#### Agent projection contract

- JSON Schema and compact MCP projection generate deterministically.
- Usage guidance and examples validate.
- Discovery returns the same Step Reference shown by the human projection.
- Parameter aliases cannot shadow or ambiguously bind other inputs.

#### Execution contract

- The binding is not `unbound`.
- The trusted handler, reviewed extension, or ready composition resolves.
- Input/output schemas are compatible with the binding.
- Required runtime and evidence capabilities are declared.
- The binding passes generic conformance tests.
- Composition dependencies are ready and acyclic.

#### Integrity and authority contract

- Definition, projection, agent-contract, and execution hashes are deterministic.
- Exact review authority is bound to the reviewed draft hash.
- Generated outputs match the reviewed definition.
- The transaction can publish the definition, projections, execution binding, receipt, and manifest update together.

### Ready

Ready definitions are immutable, globally discoverable, human-authorable, agent-authorable, and executable. Editing
creates a new draft version. Exact historical versions remain resolvable for tests, publications, capsules, and
evidence.

### Ready to deprecated

Deprecation requires a reason, preserves resolution for existing references, records an optional ready replacement,
and changes default discovery behavior without changing historical hashes. New authoring warns or blocks according to
policy. Deprecation never deletes a referenced definition.

## Human Creator Architecture

### Metadata-to-code wizard

The primary human experience is a resumable, step-by-step **Create reusable step** wizard. It progressively constructs
one Step Definition and its reviewed execution binding:

1. **Identity and purpose:** the user supplies title, description, group, capabilities, search terms, and usage
   examples. Appraise validates completeness and exact/structural conflicts without generating semantic suggestions.
2. **Human sentence:** the user supplies the readable Gherkin expression. Appraise deterministically parses named
   placeholders into incomplete input records; it does not infer types or meanings.
3. **Typed contract:** the user supplies input/output types, descriptions, constraints, defaults, aliases, examples,
   and stored-output behavior. Appraise generates JSON Schema, TypeScript types, parameter adapters, and the agent
   invocation contract.
4. **Runtime capabilities:** the user selects browser/API/node/database runtime and the bounded context capabilities
   required by the implementation. Undeclared filesystem, process, network, environment, database, or Appraise
   internals are unavailable.
5. **Generated contract:** Appraise presents the deterministic handler interface and boilerplate produced from the
   preceding metadata. This is a checkpoint before implementation begins.
6. **Code:** the user writes the handler in a focused TypeScript editor with syntax highlighting, formatting,
   generated-type autocomplete, bounded API documentation, and compiler diagnostics. Appraise supplies no generated
   business logic.
7. **Examples and conformance:** explicit user-authored examples drive schema, module-load, capability, timeout,
   cancellation, input/output, and behavioral checks.
8. **Review and publish:** the reviewer sees the human projection, agent invocation, source and compiled artifacts,
   capabilities, hashes, conformance results, and exact draft diff before atomic publication.

The form is generated from the same draft schema used by MCP and must not maintain a second set of validation rules.
Placeholder edits use stable binding identifiers rather than fragile string replacement. Readiness, not internal
state terminology, organizes the UI; incomplete work autosaves as a draft and can be resumed.

### Generated and user-owned artifacts

Generated files and user code remain separate so metadata regeneration cannot overwrite implementation:

```text
step-extension-draft/
  definition.json   # Appraise-managed canonical metadata
  contract.ts       # Appraise-generated; safe to regenerate
  handler.ts        # user-managed implementation
  examples.json     # explicit reviewed examples
  manifest.json     # Appraise-generated binding and capability metadata
```

`handler.ts` imports generated input, output, and bounded-context types from `contract.ts`. Contract-affecting metadata
changes regenerate `contract.ts`, recompile `handler.ts`, invalidate prior conformance receipts, and route the user
back to Code or Tests. Display-only metadata changes still create a new immutable definition version but do not
silently change execution bytes.

### Custom handler pipeline

Appraise performs only deterministic processing:

```text
explicit metadata
  -> generated contract and handler skeleton
  -> user-authored implementation
  -> import and capability-policy validation
  -> TypeScript compilation in a controlled staging root
  -> input/output and module conformance
  -> explicit behavioral examples
  -> exact source and compiled hashes
  -> human code review
  -> reviewed-extension binding
```

Static checks alone are not a security boundary. Custom handler execution requires bounded runtime adapters,
cancellation, timeouts, path containment, dependency policy, and immutable reviewed artifacts. Executable source is
never embedded in `definitionJson` or a legacy `functionDefinition` field.

### Human API

```text
POST   /api/step-definitions/drafts
GET    /api/step-definitions/drafts/:draftId
PATCH  /api/step-definitions/drafts/:draftId
DELETE /api/step-definitions/drafts/:draftId
POST   /api/step-definitions/drafts/:draftId/validate
POST   /api/step-definitions/drafts/:draftId/preview
POST   /api/step-definitions/drafts/:draftId/review
POST   /api/step-definitions/drafts/:draftId/publish
POST   /api/step-definitions/:id/versions/:version/deprecate
```

Server Actions may adapt the form to these services, but business rules and transitions live in a shared application
service. Publish uses optimistic draft revision and exact reviewed hash checks.

## Agent Command Architecture

MCP exposes the same service capabilities with bounded responses:

```text
step_definition_draft_create
step_definition_draft_read
step_definition_draft_update
step_definition_draft_validate
step_definition_draft_preview
step_definition_draft_submit_for_review
step_definition_publish
step_definition_deprecate
```

Agents must search ready definitions before creating a draft and provide a structured reuse/overlap justification.
The external coding agent may reason about and author metadata, bindings, compositions, examples, and handler code;
Appraise only accepts those as explicit draft fields and artifacts. Agent-originated publication requires the same
human review authority as an equivalent human-form draft unless an explicit delegated policy is introduced later.

`step_search` returns one Step Reference and its human, agent, and execution-readiness projections. It does not return
two identities that the caller must reconcile.

## Built-In Generation And Registration

Built-in source definitions use the public canonical schema and call the same registration application service under
`built-in-source` authority. The pipeline is:

```text
Canonical StepDefinition source
  -> schema and semantic validation
  -> handler compatibility and conformance
  -> human projection generation
  -> agent projection generation
  -> Cucumber delegation wrapper generation
  -> registry-package generation
  -> database synchronization
  -> publication receipt and manifest certification
```

Generated artifacts carry the same Step Reference and hashes. Database synchronization projects ready definitions;
it does not mint new identities. Re-running generation with unchanged semantic input produces no content drift.

## Persistence Model

The detailed Prisma schema will be finalized with migration fixtures. The intended authority is:

```prisma
model StepDefinition {
  id                    String
  version               String
  status                StepDefinitionStatus
  title                 String
  description           String
  definitionJson        String
  definitionHash        String
  humanProjectionHash   String?
  agentContractHash     String?
  executionHash         String?
  provenanceJson        String
  createdAt             DateTime @default(now())
  publishedAt           DateTime?
  deprecatedAt          DateTime?

  humanProjection       StepHumanProjection?
  executionBinding      StepExecutionBinding?
  publicationReceipt    StepPublicationReceipt?

  @@id([id, version])
  @@index([status, title])
}

model StepDefinitionDraft {
  id                    String @id
  proposedStepId        String
  proposedVersion       String
  revision              Int
  draftJson             String
  draftHash             String
  validationReportJson  String?
  reviewStateJson       String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model StepHumanProjection {
  stepId                String
  stepVersion           String
  signature             String
  groupId               String
  projectionJson        String
  projectionHash        String

  @@id([stepId, stepVersion])
  @@unique([signature])
}

model StepExecutionBinding {
  stepId                String
  stepVersion           String
  kind                  StepExecutionKind
  bindingJson           String
  bindingHash           String

  @@id([stepId, stepVersion])
}
```

Canonical JSON preserves forward-compatible structured metadata; selectively duplicated columns support proven query
and integrity needs. Database constraints enforce exact identity and projection uniqueness rather than relying on
`findFirst` conventions.

## Compatibility And Migration Strategy

### Classification

Existing rows are classified before mutation:

1. **Mapped built-in:** has a valid canonical operation mapping and generated human projection.
2. **Manual custom with reviewed executable binding:** eligible for a shared draft with a reviewed-extension binding.
3. **Manual custom used only for manual authoring:** migrated to an unbound draft and remains non-executable until
   completed.
4. **Orphaned or conflicting:** quarantined with explicit diagnostics; never guessed into a ready definition.

### Backfill

- Each current canonical built-in becomes one ready Step Definition preserving its operation reference.
- Existing human names, signatures, groups, icons, and parameter order become its human projection.
- Agent descriptors and examples become its agent metadata.
- Trusted handler identities become its execution binding.
- Existing database references receive an exact Step Reference without changing visible wording.
- Step Blocks become versioned compositions of Step Invocations.

### Compatibility window

- Legacy Template Step and operation APIs become read-only projections of ready Step Definitions.
- Compatibility decoders accept historical `action`, `operationRef`, `templateStepId`, and `templateStepName` inputs,
  resolve them to one Step Reference, and record usage.
- No new writes create or update independent Template Step or operation mapping authority.
- CI prevents new code from depending on legacy mapping fields outside the bounded compatibility module.
- Removal occurs only after usage telemetry and repository scans show zero active writers and supported consumers have
  migrated.

### Rollback

The migration remains rollback-safe until cutover by retaining legacy rows and deterministic back-reference data.
Rollback disables new publication, restores compatibility projections as primary reads, and leaves ready definitions
intact. Published historical versions and receipts are never deleted during rollback.

## Implementation Tranches

## Tranche 0: Freeze The Decision And Failure Fixtures

### Task 0.1: Record the Step Definition ADR

Document one identity/multiple projections, global sharing, provenance semantics, lifecycle states, immutable versions,
publication authority, and the rejected dual-identity alternative.

**Acceptance criteria**

- The ADR explicitly supersedes the independent Template Step identity portions of migration `04`.
- Built-in, human, and agent creation share one schema and publication service.
- Active docs use Step Definition, Step Reference, projection, binding, and invocation consistently.

**Verification**

- Focused Prettier and documentation-link checks pass.
- Architecture reviewers approve the identity and authority decisions before schema work.

### Task 0.2: Add dual-identity regression fixtures

Capture mapped built-ins, manual custom steps, duplicate operation mappings, stale descriptor hashes, Step Blocks,
template test cases, managed ASTs, historical runtime inputs, and custom reviewed extensions.

**Acceptance criteria**

- Fixtures reproduce discoverable-but-not-authorable results and nondeterministic projection risk.
- Historical artifacts remain readable throughout the migration.
- Permanent fixtures use generic capabilities rather than sample-application names.

**Verification**

- Focused service and contract tests fail for the intended pre-migration reasons.

### Checkpoint 0

- ADR and fixtures are approved.
- No production persistence change has started.

## Tranche 1: Introduce The Canonical Domain And Registry

### Task 1.1: Define shared schemas and hashes

Add Zod, JSON Schema, TypeScript, canonical-JSON, hashing, compatibility, and validation contracts for definitions,
drafts, invocations, bindings, projections, receipts, and lifecycle transitions.

**Acceptance criteria**

- One schema package is consumable by root services, MCP, packages, scaffold, and runtime code.
- Hash domains distinguish semantic definition, human projection, agent contract, and execution binding.
- Invalid placeholder, input, output, binding, version, and lifecycle combinations fail deterministically.

**Verification**

- Contract, canonicalization, and property-style round-trip tests pass.
- Package TypeScript builds pass.

### Task 1.2: Add Step Definition persistence

Introduce draft, immutable definition, human projection, execution binding, publication receipt, and compatibility
reference storage with exact uniqueness constraints.

**Acceptance criteria**

- `(id, version)` and ready human signatures cannot resolve ambiguously.
- Draft revision and reviewed hash support optimistic concurrency.
- Ready rows cannot be mutated through application services.

**Verification**

- Prisma migration applies to populated and empty fixture databases.
- Constraint and concurrency integration tests pass.

### Task 1.3: Implement the shared registry

Create one application service for draft CRUD, validation, preview, publication, deprecation, exact reads, bounded
listing, and manifest generation.

**Acceptance criteria**

- UI, MCP, sync, and tests use the same service boundary.
- Publication is atomic and returns a deterministic receipt.
- Registry reads never require Template Step-to-operation translation.

**Verification**

- Service integration tests cover success, conflict, stale review, failed conformance, and rollback.

### Checkpoint 1

- New domain and registry work alongside legacy reads.
- Full build and migration tests pass.

## Tranche 2: Convert Built-Ins To The Shared Definition Pipeline

### Task 2.1: Express current built-ins as Step Definitions

Move canonical source ownership to complete Step Definitions containing semantic, input/output, human, agent, and
execution metadata.

**Acceptance criteria**

- All current built-ins preserve stable references, visible wording, parameter order, and handler behavior.
- Semantic vocabulary is definition-owned; resolver-local concept hacks are removed after equivalent metadata exists.
- Every definition passes the same publication validator used by interactive drafts.

**Verification**

- Existing operation conformance coverage passes through the new domain.
- Snapshot comparison proves no unintended human signature or handler drift.

### Task 2.2: Generate every built-in projection from one source

Update operation projections, Cucumber wrappers, MCP catalogs, registry packages, database sync, docs, and scaffold
generation to consume ready Step Definitions.

**Acceptance criteria**

- Generated wrappers contain only binding/delegation logic.
- Repeated generation is deterministic and produces no timestamp-only churn.
- Each artifact embeds or references the same Step Reference and relevant hashes.

**Verification**

- Operation projection, drift, artifact, package, scaffold, and Graphify checks pass.

### Task 2.3: Backfill mapped built-ins

Create ready definitions and compatibility links for existing mapped Template Steps and dependent records.

**Acceptance criteria**

- Backfill is idempotent and detects duplicates or stale mappings rather than choosing `findFirst`.
- Existing tests, template tests, Step Blocks, and managed publications resolve the exact new reference.
- No historical evidence hash is rewritten.

**Verification**

- Populated-database migration tests and rollback rehearsal pass.

### Checkpoint 2

- All built-ins originate from complete Step Definitions.
- Legacy surfaces are read projections, not semantic authorities.

## Tranche 3: Deliver Human Draft Authoring End To End

### Task 3.1: Build draft Server Actions and API adapters

Expose draft create, read, revise, delete, validate, preview, review, publish, and deprecate operations through thin
adapters over the registry service.

**Acceptance criteria**

- Input parsing, authorization, revision checks, error envelopes, and cache invalidation follow current conventions.
- No endpoint writes legacy Template Step rows directly.
- Publish binds the exact reviewed draft hash.

**Verification**

- Server Action and route integration tests cover every transition and authority failure.

### Task 3.2: Replace the Template Step creator with a schema-driven draft editor

Build the metadata-to-code wizard: Identity/Purpose, Human Sentence, Typed Contract, Runtime Capabilities, Generated
Contract, Code, Examples/Conformance, and Review/Publish.

**Acceptance criteria**

- Named placeholders create stable input bindings and survive rename/reorder operations.
- Appraise generates types, schemas, parameter adapters, and handler boilerplate without inference or implementation
  logic.
- Generated contracts and user-owned handler source are separate, and metadata regeneration never overwrites code.
- Users can choose an existing handler, composition, reviewed extension, new user-authored handler, or unbound draft.
- The form displays human and agent projections, declared runtime capabilities, compiler diagnostics, conformance, and
  executable readiness before review.

**Verification**

- Component tests cover keyboard use, validation, placeholder editing, contract regeneration, source preservation,
  binding modes, compiler diagnostics, stale revisions, conformance routing, and preview.
- Accessibility audit and real-browser happy-path checks pass.

### Task 3.3: Compile and review user-authored handlers

Stage source under contained Appraise-owned paths, enforce import and capability policy, compile against generated
contracts, run explicit examples and generic conformance, and create a reviewed extension artifact.

**Acceptance criteria**

- Handler source cannot access undeclared runtime capabilities or escape the staging root.
- Definition metadata contains binding identities and hashes, never executable source.
- Contract-affecting metadata changes invalidate compilation and conformance until the user repairs the handler.
- Source, compiled bytes, declared capabilities, examples, and results are bound to exact review.

**Verification**

- Compile, forbidden-import, path-containment, capability, timeout, cancellation, tamper, source-preservation, and
  behavioral-example tests pass.

### Task 3.4: Add human review and immutable version creation

Provide exact draft-diff review, overlap resolution, publication checks, receipt display, new-version creation, and
deprecation flows.

**Acceptance criteria**

- A human can create and publish a shared ready definition without an agent.
- Editing ready content always creates a draft version.
- Failed publication leaves no partial registry or generated artifacts.

**Verification**

- Browser E2E covers metadata, generated boilerplate, user code, compile feedback, example execution, revise, review,
  publish, discover, invoke, version, and deprecate without an inference provider.

### Checkpoint 3

- Human-created ready definitions satisfy the same guarantees as built-ins.
- No direct legacy authoring path remains enabled.

## Tranche 4: Deliver Agent Draft Authoring End To End

### Task 4.1: Add bounded MCP draft tools

Expose draft create/read/update/validate/preview/review-submit/publish/deprecate through the shared service and update
MCP contracts, generated references, response projection, recipes, and skills.

**Acceptance criteria**

- Tools return compact structured blockers, hashes, and next actions.
- Creation requires prior search evidence and an overlap/reuse justification.
- Agent-originated drafts cannot bypass human publication authority.

**Verification**

- MCP contract, stdio, HTTP, restart/reconnect, and capability-snapshot tests pass.

### Task 4.2: Make unified search return one actionable identity

Rebuild `step_search` over the shared registry and one ranking engine using definition-owned intent metadata and typed
parameter compatibility.

**Acceptance criteria**

- Results contain one Step Reference with human, agent, and readiness projections.
- Only ready definitions are executable recommendations.
- Human UI search and MCP search produce equivalent ordering for the same query and filters.

**Verification**

- Cross-surface golden-query tests cover synonyms, examples, aliases, parameters, deprecation, and no-match behavior.

### Task 4.3: Validate a real agent-created definition lifecycle

Use a fresh external target and a real subagent to search, justify, draft, revise after human feedback, publish, use the
new definition in a Validation AST, execute baseline, and preserve evidence.

**Acceptance criteria**

- The agent never handles a separate Template Step and operation identity.
- Human review displays the same definition and inputs the agent submitted.
- Baseline executes the exact publication receipt-bound handler.

**Verification**

- Timed lifecycle evidence and coordination metrics are recorded without app-specific permanent framework fixtures.

### Checkpoint 4

- Human and agent creation are equivalent clients of the same domain.
- The complete agent happy path reaches execution.

## Tranche 5: Unify Compositions And Reviewed Extensions

### Task 5.1: Convert Step Blocks into versioned Step Definitions

Represent reusable compositions through `execution.kind = composition` and typed parent-to-child input/output mappings.

**Acceptance criteria**

- Step Blocks use the same shared identity, discovery, versioning, review, and invocation contracts.
- Publication detects cycles and incompatible mappings.
- Existing Step Block wording and ordered behavior are preserved through backfill.

**Verification**

- Composition unit, migration, UI, MCP, capsule, and runtime tests pass.

### Task 5.2: Route custom executable behavior through reviewed extensions

Allow a shared definition to bind a reviewed extension without storing executable source in definition metadata.

**Acceptance criteria**

- Extension identity, version, source hash, compiled hash, export, and runtime are review-bound.
- Extension revocation blocks new publications without breaking historical capsule evidence.
- Manual-only custom rows become drafts until an execution binding passes review.

**Verification**

- Security, tamper, revocation, compilation, and historical-resolution tests pass.

### Checkpoint 5

- Built-ins, custom handlers, and compositions follow one definition and publication model.

## Tranche 6: Migrate All Consumers To Step Invocation

### Task 6.1: Migrate authored test records

Update test cases, template test cases, flow diagrams, parameters, imports/exports, feature generation, and sync to store
or derive exact Step Invocations.

**Acceptance criteria**

- Human-readable Gherkin remains stable.
- Every executable authored step resolves one immutable Step Reference.
- Existing CRUD and bidirectional-sync behavior remains supported through bounded compatibility adapters.

**Verification**

- CRUD, feature generation, sync, import/export, and migrated-database tests pass.

### Task 6.2: Migrate Validation AST and canonical projection

Replace operation/action references with Step References and remove reverse Template Step lookup from the canonical
projection path.

**Acceptance criteria**

- New AST publications contain only Step Invocations.
- Historical schemas decode deterministically and record compatibility use.
- Projection cannot select among duplicate mappings or fall back by human name.

**Verification**

- AST check, preview, compile, publication, review, integrity, and historical fixture tests pass.

### Task 6.3: Migrate capsule and runtime contracts

Seal the exact ready definition closure, execution bindings, composition dependencies, locator snapshots, extension
reviews, and hashes into immutable capsules.

**Acceptance criteria**

- Capsule compilation resolves Step References directly.
- Manual and managed runtimes invoke the same trusted handler path.
- Runtime evidence records the Step Reference and publication hashes.

**Verification**

- Capsule conformance, tamper, runtime parity, baseline, retry, and evidence tests pass.

### Checkpoint 6

- All new authoring and execution paths use Step Invocations.
- Legacy identity fields are decoder-only.

## Tranche 7: Add Readiness, Observability, And Governance

### Task 7.1: Issue executable-readiness receipts

At publication, resolve definition metadata, projections, handler/composition closure, generated wrapper, runtime
adapter, and conformance evidence into a durable receipt.

**Acceptance criteria**

- A ready definition cannot later fail solely because its projection or handler was never registered.
- Baseline and implementation validation consume the receipt instead of rediscovering semantic identity.
- Stale registry manifests or revoked extensions produce precise blockers.

**Verification**

- Late-failure regression tests now fail at publication with actionable diagnostics.

### Task 7.2: Add discovery and authoring outcome telemetry

Record bounded query, ranking, selection, rejection, custom-draft fallback, validation failure, and execution outcome
events without storing secrets or unbounded prompts.

**Acceptance criteria**

- Metrics distinguish no-match, unusable-result, parameter mismatch, overlap, and runtime-readiness failures.
- Human and agent funnel performance can be compared using the same event vocabulary.
- Telemetry cannot silently change ranking or publication policy.

**Verification**

- Privacy, bounded-payload, metrics, and lifecycle correlation tests pass.

### Task 7.3: Add governance and permission boundaries

Enforce reserved namespaces, trusted handler registration, reviewed-extension authority, global-library publication,
deprecation, and source-owned regeneration rules.

**Acceptance criteria**

- Human and agent authors have equal draft semantics but cannot exceed their publication authority.
- Built-in sync cannot overwrite interactive definitions, and interactive tools cannot overwrite source-owned IDs.
- Every publication and deprecation has a durable actor and review trail.

**Verification**

- Authorization, namespace collision, replay, stale-review, and audit tests pass.

### Checkpoint 7

- Ready is an enforceable end-to-end guarantee with observable outcomes.

## Tranche 8: Cut Over, Remove Dual Authority, And Certify Release

### Task 8.1: Disable legacy writers

Remove direct Template Step creation/update semantics, operation mapping writes, and Step Block-specific semantic
authority. Retain explicit compatibility reads and historical decoders only.

**Acceptance criteria**

- Repository scans and CI guards reject new legacy-field writers.
- UI and MCP expose Step Definition vocabulary.
- Compatibility usage is measurable and documented with removal criteria.

**Verification**

- Static architecture certification and negative write-path tests pass.

### Task 8.2: Update active documentation, skills, packages, and scaffold

Update architecture, lifecycle, MCP, runtime, authoring, sync, generated-artifact, component, and scaffold documentation
and regenerate all required outputs from canonical source.

**Acceptance criteria**

- No active doc teaches two identities or direct ready-row creation.
- `create-appraisejs` produces the same registry and authoring behavior as the root app.
- Generated reference, MCP contract, package, scaffold, and Graphify outputs are current.

**Verification**

- Harness, documentation, artifact, package, scaffold, Graphify, and drift checks pass.

### Task 8.3: Run the release certification matrix

Certify built-in, human-created, agent-created, composition, reviewed-extension, migrated historical, deprecated, and
failure/recovery paths.

**Acceptance criteria**

- Every ready definition is human-discoverable, agent-discoverable, authorable through both surfaces, and executable.
- No test or runtime path translates between separate human and agent identities.
- Migration, rollback, restart, concurrency, tamper, and historical-resolution scenarios pass.

**Verification**

- `npm run validate`
- `npm run test`
- `npm run build`
- `npm run operation:certify` or its renamed Step Definition equivalent
- `npm run check:harness`
- `npm run release:check:artifacts`
- `npm run release:check:packages`
- `npm run graphify:auto`

### Checkpoint 8

- Dual semantic authority is removed.
- Release certification and human architecture review are complete.

## End-To-End Acceptance Matrix

| Path                         | Required outcome                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Built-in source              | Registers through the shared schema and produces all projections and one receipt                         |
| Human form                   | Drafts, validates, previews, reviews, publishes, discovers, authors, and executes one identity           |
| Agent MCP                    | Searches, justifies, drafts, revises, publishes after human approval, authors, and executes one identity |
| Composition                  | Publishes a typed acyclic composition and executes the same way from human and agent surfaces            |
| Reviewed extension           | Binds reviewed code and preserves exact source/compiled hashes in publication and capsule evidence       |
| Existing mapped row          | Backfills deterministically without changing visible wording or behavior                                 |
| Existing manual custom row   | Becomes a non-executable draft until its binding satisfies publication contracts                         |
| Historical AST/runtime input | Decodes to an exact Step Reference and records compatibility usage                                       |
| Version update               | Creates a new immutable version while old artifacts continue to resolve                                  |
| Deprecation                  | Hides or warns for new authoring while historical execution remains reproducible                         |
| Failure recovery             | Leaves no partial ready definition or generated-output drift after any failed publication stage          |

## Performance And Efficiency Requirements

- Registry manifests and generated projections are content-addressed and unchanged results are cacheable.
- `step_search` reads a precomputed shared index rather than loading and reinterpreting all projections per request.
- Search ranking is implemented once for UI and MCP.
- Draft validation supports incremental field feedback; full conformance runs only when affected contracts change.
- Publication generation is staged in temporary output and swapped atomically after validation.
- MCP responses remain bounded and expose exact follow-up reads rather than returning the full registry.
- Telemetry measures discovery-to-selection, selection-to-valid-AST, draft-to-ready, retries, and human-review time.

## Security And Integrity Requirements

- Definition metadata is inert data and cannot contain executable source.
- Trusted handler registration is source-controlled and namespace-protected.
- Reviewed extensions retain source, compiled, artifact, and review hashes.
- Publication authorization is bound to exact draft revision and hash.
- Composition expansion is bounded and cycle-safe.
- Generated files cannot escape configured roots.
- Ready and deprecated definitions are immutable.
- Historical execution resolves exact versions and never silently upgrades.
- Provenance and audit events contain bounded identifiers, not secrets or raw unbounded prompts.

## Risks And Mitigations

| Risk                                                 | Impact   | Mitigation                                                                                       |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| Migration changes visible human steps                | High     | Golden snapshots and populated-database comparison before cutover                                |
| Shared custom definition pollutes the global library | High     | Overlap review, publication authority, and keep product-specific behavior as reviewed extensions |
| Arbitrary custom code gains trust                    | Critical | No source in metadata; require reviewed-extension binding and exact hashes                       |
| Compatibility layer becomes permanent                | High     | Decoder-only boundary, telemetry, CI writer ban, and explicit removal thresholds                 |
| One schema becomes an oversized catch-all            | Medium   | Keep projections and bindings as focused subcontracts with one identity authority                |
| Form becomes too complex                             | Medium   | Progressive sections, agent suggestions, saveable drafts, actionable readiness blockers          |
| Agent publishing bypasses humans                     | High     | Same exact review gate regardless of authoring client                                            |
| Global signature collisions block migration          | High     | Preflight inventory, deterministic aliases, and explicit conflict review                         |
| Composition causes recursive or expensive execution  | High     | Publish-time cycle detection, bounded expansion, frozen dependency closure                       |
| Hash changes invalidate historical evidence          | Critical | New version creation and compatibility references; never rewrite completed evidence              |

## Definition Of Done

- One shared `StepDefinition(id, version)` is the semantic identity for built-ins, human-created steps, agent-created
  steps, and compositions.
- All ready definitions satisfy the complete publication contract and carry a receipt.
- Human and agent discovery return the same reference and equivalent ordering.
- Human and agent authoring create the same Step Invocation.
- Manual and managed execution use the same binding and handler semantics.
- No new writer treats Template Step or operation mapping fields as independent authority.
- Existing mapped built-ins migrate without visible or behavioral drift.
- Custom legacy behavior is explicitly migrated, drafted, or quarantined; none is silently trusted.
- Historical tests, publications, capsules, and evidence remain resolvable.
- UI, MCP, API, packages, scaffold, docs, generated artifacts, and Graphify outputs are current.
- Full validation and the real human/agent end-to-end certification matrix pass.

## Recommended Delivery Order

Implement sequentially through Tranches 0-2 to freeze the contract and migrate built-ins safely. Human and agent
authoring work in Tranches 3 and 4 may proceed in parallel only after the shared draft service is stable. Composition
and reviewed-extension work follows the same publication contract. Consumer migration, readiness receipts, and
cutover remain sequential because they change execution authority and historical compatibility.

Do not remove compatibility readers, change historical evidence, or enable ready publication until populated-database
migration, rollback, and complete human/agent execution certification have passed.
