# ADR-0001: Use One Operation Authority For Human And Agent Test Authoring

## Status

Accepted on 2026-07-20.

## Context

AppraiseJS has two built-in browser-automation catalogs. Human authoring selects reusable Template Steps and Step
Blocks backed by Cucumber source. Managed agent authoring selects typed action IDs that a runtime-capsule generator
executes through its own Playwright switch. The two surfaces overlap but differ in coverage, input shapes, naming, and
implementation. A template-step search result cannot be represented directly in the current managed Validation AST,
and a fix to one handler does not repair its counterpart.

The managed runtime must remain Appraise-owned, immutable, content addressed, project scoped, and independent of
target-workspace automation. Human-readable Gherkin, the Template Step library, Step Blocks, manual execution, and
historical reviewed capsules must remain usable.

## Decision

AppraiseJS will use one versioned `OperationDefinition` and one trusted `OperationHandler` for every built-in
executable behavior. Human and agent authoring are projections over the same canonical `OperationInvocation`:

- Human projections own readable Cucumber expressions, labels, icons, groups, and deterministic parameter adapters.
- Agent projections own bounded typed discovery, examples, search metadata, and exact operation references.
- Compositions own ordered, bounded, acyclic operation graphs; they do not contain Playwright behavior.
- Managed capsules seal only the reviewed descriptors, handler closure, locator snapshot, and runtime identities.
- Existing `browser.*` identities remain canonical where their semantics are suitable. Legacy step slugs and
  signatures become compatibility aliases or human projection identities.

Operation descriptor hashes cover every field that affects selection, validation, review, or execution, excluding
wall-clock and other generated metadata. Handler hashes bind executable bytes separately. Canonical JSON sorts object
keys while preserving array order. New reviewed artifacts store canonical identities and hashes, never aliases,
mutable Template Step IDs, source paths, or executable input.

The shared contract accepts only bounded JSON-compatible values plus typed references. Values are capped by string,
array, object-depth, and node-count limits. Functions, callbacks, regex objects, arbitrary source, filesystem output
paths, and evaluation payloads are rejected. Every operation declares both surface states: a projection is present or
an explicit approved exception explains the gap.

The migration remained additive until parity was certified. Historical publications and completed capsules remain pinned to
their original generator. In-flight publications stay pinned unless invalidated and reviewed again. Legacy custom
source remains manual-only until it is deliberately mapped to a built-in, bounded structured operation, reviewed
composition, or reviewed extension.

## Compatibility And Cutover

The compatibility window has one reader for old managed `action` references and aliases, but new reviewed artifacts
normalize to operation references. Old public discovery tools may remain bounded aliases temporarily, returning the
canonical operation identity and a deprecation notice. They are not independent writers.

Authority changes occur in this order:

1. Freeze unilateral additions and generate the complete capability ledger.
2. Add and certify the operation contracts, registry, and trusted handlers.
3. Switch human built-in authoring to canonical single-write while retaining readable projections.
4. Switch agent authoring and new publications to canonical single-write.
5. Switch only new reviewed capsules to the sealed shared-handler generator.
6. Migrate custom behavior deliberately and remove duplicate dispatchers after certification.

Rollback may restore an earlier writer only for artifacts that have not been accepted under a later review receipt.
Completed evidence is never rewritten or reinterpreted.

## Alternatives Considered

### Use legacy Template Step source as managed capsule authority

Rejected. Arbitrary project TypeScript imports, mutable locator resolution, and target-workspace files would weaken
review binding, isolation, and content-addressed capsule integrity.

### Retain two catalogs and add synchronization

Rejected. Synchronization preserves two semantic owners and turns disagreement into a timing problem. A generated
copy can be a projection, but there must be one authored definition and one handler.

### Generate managed handlers from Gherkin source

Rejected. Cucumber source mixes presentation, imports, runtime access, and implementation. Transforming arbitrary
TypeScript into trusted capsule code is not a bounded or reviewable compiler contract.

### Reduce all behavior to arbitrary structured Playwright calls

Rejected. A generic invocation surface loses semantic search, evidence intent, stable error classification,
capability policy, and useful human review. Structured operations remain bounded fallback operations in the same
kernel and cannot shadow a semantic operation without an explicit reason.

### Reduce the human library to the smaller managed action catalog

Rejected. This would discard existing capability coverage and create a lowest-common-denominator product. Every
built-in is projected to both surfaces or carries an explicit reviewed exception.

## Consequences

- A behavior fix is made once and applies to human and managed execution adapters.
- Human and agent artifacts can be compared by canonical invocation graph instead of source wording.
- Operation additions require descriptor, handler, human/agent projection state, conformance coverage, and drift-ledger
  updates in one change.
- Capsule materialization becomes simpler but must seal a deterministic handler closure and verify additional hashes.
- Compatibility readers remain for historical field names, but built-in executable legacy bodies and independent
  catalog writers have been removed.
- Existing custom source is not automatically promoted to managed execution, so some users must choose a deliberate
  migration action.

## Enforcement

`npm run release:check:operation-drift` verifies that the checked capability ledger accounts exactly once for every
human projection and compatibility action alias. `npm run release:check:operation-projections` enforces generated
wrapper purity and exact descriptor/handler closure. `npm run operation:certify -- --require-complete` requires one
handler, both projections, alias uniqueness, and sealed capsule eligibility for every active operation.

The implementation plan and edge-case inventory remain in
`codex/development plan/appraise-0.5/architectural-migrations/04-unified-operation-catalog-human-agent-authoring-and-capsule-compilation.md`.
