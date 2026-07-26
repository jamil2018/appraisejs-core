# Unified Operation Catalog Migration Checklist

Source plan:
`codex/development plan/appraise-0.5/architectural-migrations/04-unified-operation-catalog-human-agent-authoring-and-capsule-compilation.md`

Planning status: awaiting human review. Do not implement until approved.

## Tranche 0: Freeze And Inventory

- [ ] Add the temporary unilateral-capability change boundary.
- [ ] Generate and review the complete template/action/handler/capsule capability ledger.
- [ ] Resolve every ambiguous, composite, missing, and conflicting mapping.
- [ ] Checkpoint: 100% catalog accounting and no new independent capability additions.

## Tranche 1: Canonical Operation Kernel

- [ ] Write and approve the operation architecture ADR.
- [ ] Define canonical descriptor, invocation, value, projection, handler, composition, alias, exception, and evidence schemas.
- [ ] Create the runtime-neutral operation registry package.
- [ ] Checkpoint: deterministic contract hashes approved; existing production paths unchanged.

## Tranche 2: Shared Trusted Handlers

- [ ] Extract primitive page, locator, assertion, observer, storage, and evidence handlers.
- [ ] Model event-driven and composite operations with explicit concurrency semantics.
- [ ] Route bounded structured operations through the same kernel.
- [ ] Checkpoint: characterization, browser-concurrency, and negative-security tests pass.

## Tranche 3: Human Projection Migration

- [ ] Generate built-in human projections and registry fragments from canonical operations.
- [ ] Backfill TestCase, TemplateTestCase, TemplateStep, and Step Block mappings safely.
- [ ] Switch new human-authored built-ins to canonical single-write.
- [ ] Checkpoint: stable signatures, UI parity, Step Block parity, and manual execution through shared handlers.

## Tranche 4: Agent Projection Migration

- [ ] Replace the managed action catalog with the unified agent projection.
- [ ] Revise Validation AST and reviewed-composition references.
- [ ] Unify MCP discovery, starter recipes, errors, skills, docs, and bounded telemetry.
- [ ] Checkpoint: human and agent parity suite produces equivalent canonical invocation graphs.

## Tranche 5: Capsule Compilation

- [ ] Replace hardcoded capsule dispatch with sealed shared-handler delegation.
- [ ] Add cross-surface execution and evidence conformance.
- [ ] Implement explicit old/new capsule-generator cutover for in-flight plans.
- [ ] Checkpoint: fresh managed lifecycle passes with exact descriptor and handler hashes.

## Tranche 6: Custom Migration And Duplicate Removal

- [ ] Classify and migrate legacy custom template steps without auto-trusting source.
- [ ] Remove old built-in template bodies, duplicate action definitions, and capsule dispatch.
- [ ] Update active architecture, lifecycle, runtime, MCP, scaffold, ownership, and reusable-step docs.
- [ ] Checkpoint: one catalog, one handler layer, one invocation model, and one build path remain.

## Tranche 7: Certification And Release

- [ ] Add catalog/projection/handler/capsule/drift certification with a durable receipt.
- [ ] Complete equivalent human and delegated-agent lifecycle certifications.
- [ ] Confirm new defects become generic contract tests rather than app-specific fixtures.
- [ ] Run focused tests and cross-browser conformance.
- [ ] Prepare scaffold and package registry outputs after canonical source stabilizes.
- [ ] Run root/package validation, builds, harness, quality ratchets, release checks, and `git diff --check`.
- [ ] Refresh Graphify only after authored and synchronized source is final.
- [ ] Final checkpoint: human approval of certification, compatibility removal, and release readiness.
