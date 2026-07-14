# Validation Review Decision Integrity Deadlock and Plan Builder Efficiency

## Status

Ready for implementation against the current `appraise-0.5` architecture as audited on 2026-07-14.

This plan is based on a literal fresh-target happy-path run. The run used the native Appraise MCP workflow and browser
UI review gates. It stopped only when a deterministic Appraise-owned lifecycle deadlock left no legal native recovery.
No raw JSON-RPC, database edit, artifact edit, or chat-only approval was used to bypass a gate.

## Goal

Make the complete delegated plan-builder flow truthful, recoverable, project-safe, and materially less expensive:

`brief -> plan review -> validation authoring -> validation review -> baseline -> implementation -> managed final validation -> completion approval`

The same literal regression must finish at `completed`, with browser evidence for human decisions and Appraise-managed
`TestRun` evidence for baseline and final validation.

## Audit Evidence

- Target: `/private/tmp/appraisejs-plan-builder-todo-20260714`
- Target project: `c612d32b-9b47-40fd-9f7b-017c0863d633`
- Plan: `pln_01kxep39q4g9yd8q6rpntcqkqk`
- Working project-scoped URL:
  `http://localhost:3000/plans/pln_01kxep39q4g9yd8q6rpntcqkqk?project=c612d32b-9b47-40fd-9f7b-017c0863d633`
- Plan content hash: `sha256:3133ad0029e5d27e24ad21f6954b0c096d063a536ca3b7792c17db538e150ff6`
- Validation preview receipt: `sha256:2182cdfef52c03a0ad4740182a296931da5a5bd4790028d47f2f917f05dbd19a`
- Publication operation: `astpub_2182cdfef52c03a0ad4740182a296931da5a5bd4790028d47f2f917f05dbd19a`
- Operation hash: `sha256:16e2749a73b2bdd372f8f2db42a0fe2dfa8344f57990da5a35b6136d780a7500`
- Validation review became ready at event sequence 6.
- Plan approval and validation-node approval were submitted through the browser UI.
- Terminal lifecycle: `awaiting_validation_review`.

## Confirmed Defects

### P0: A valid validation decision invalidates publication integrity

Approving the managed validation node legitimately mutates the validation artifact and canonical projection. The
integrity audit then compares those mutable reviewed representations byte-for-byte with the compile-time
`ValidationAstPublishOperation.validationHash` and `validationProjectionJson`.

The UI simultaneously reported that validation evidence was ready and disabled **Submit validation review** with:

`Validation publication integrity is blocked: validation_artifact_hash, validation_projection_hash.`

Exact compile replay was not a recovery path: `validation_ast_compile` rejected the request because the plan was no
longer `preparing_validations`. The operation was already `review_ready`, while repair is supported only for
`prepared`, `artifacts_written`, or `projected`. Baseline, implementation, final validation, and completion were
therefore unreachable.

### P1: Requirement coverage can be falsely green

The explicit keyboard-accessibility and responsive-layout requirements could not be expressed by the discovered
browser action catalog. Coverage reported keyboard behavior as partial and responsive behavior as uncovered, yet
`validation_ast_check` and preview returned `valid=true`, `blockers=[]`, and `warnings=[]`.

### P1: Browser handoff URLs are not self-contained

The returned bare `127.0.0.1` review URL returned a server error in a clean browser because no active project was
selected. Adding `?project=` made the page readable, but approval still failed on the `127.0.0.1` origin because the
mutation depended on a `localhost`-scoped active-project cookie. The same project-scoped URL on `localhost` worked.

### P1: Planning retry feedback is opaque and ineffective

The first plan placed responsive behavior only in validation intent. A retry explicitly requesting acceptance-criteria
coverage preserved the same task shape and returned `unchanged_retry_rejected` without a useful candidate diff or a
direct repair choice.

### P2: Summary responses omit their required handoff

- Plan creation summary instructed the agent to present URLs and hashes but omitted them, forcing another full read.
- AST compile summary omitted review URLs and the operation hash, forcing event reads and manual URL reconstruction.
- Full wait/context responses repeated complete plan and task representations after the information was already known.

### P2: Validation authoring requires excessive discovery

Action discovery required a parent-category read, child-category listing, five separate action-list calls, and a
descriptor read. The public schema also failed to make the `astRef` locator rule, coverage mappings, and
expected-failure `environmentId` contract sufficiently explicit.

## Architecture Decisions

1. Compile-time publication content and review-time decisions are separate hash domains. Immutable compiled content
   remains protected; mutable approvals cannot be compared as if they were compile output.
2. Validation review readiness is receipt-backed, but a legitimate decision must preserve or advance a canonical
   review-state receipt rather than corrupt the publication receipt.
3. Every human-facing URL is canonical-origin and target-project scoped. Reads and mutations resolve the same trusted
   project binding; cookies are convenience state, never the sole mutation authority.
4. Explicit plan requirements may not silently map to uncovered runtime validation. `uncovered` blocks review;
   `partial` requires an explicit deferral or exact human acknowledgement.
5. Summary mutations return the complete one-time handoff. Subsequent unchanged waits are cursor-only deltas.

## Implementation Plan

### Phase 1: Reproduce the review-decision deadlock

- Add an integration test for compile -> review ready -> validation node approval -> integrity audit -> validation
  review submission.
- Assert that legitimate node and file decisions cannot create `validation_artifact_hash` or
  `validation_projection_hash` mismatches.
- Add a `review_ready` recovery test so a crash or pre-existing inconsistent row has one exact, idempotent legal action.

Likely canonical files:

- `src/services/coordinator/managed-validation-integrity-audit.test.ts`
- `src/services/coordinator/validation-ast-publish-orchestrator.integration.test.ts`
- `src/services/plan-review/plan-review-service.test.ts`
- `src/test/validation-ast-test-fixtures.ts`

### Phase 2: Separate immutable publication and mutable review integrity

- Define explicit compile-content, review-decision, and current-review-state hashes.
- Update validation decision writes atomically with the current review-state receipt and projection.
- Audit immutable compiled nodes/resources against the publication operation while auditing approvals against the
  review-state receipt.
- Make validation review submission consume the exact current review receipt.
- Add a structured, hash-bound `review_ready` reconcile action that preserves history and emits no duplicate event.

Likely canonical files:

- `src/services/coordinator/managed-validation-integrity-audit.ts`
- `src/services/coordinator/coordinator-validation-service.ts`
- `src/services/coordinator/validation-ast-publish-journal-service.ts`
- `src/services/plan-review/plan-review-service.ts`
- `src/lib/validation-review/approval.ts`
- `prisma/schema.prisma` and a migration only if a durable receipt cannot be represented in existing operation/event data

### Phase 3: Enforce truthful requirement-to-validation coverage

- Validate coverage mappings against every non-deferred atomic plan requirement.
- Block preview/review when any explicit requirement is `uncovered`.
- Require an exact deferral/acknowledgement for `partial` coverage and surface the missing capability.
- Add standard browser actions for keyboard input/focus, checked state, value/text, absence, viewport changes, and
  overflow/layout assertions, or provide a reviewed extension path when a portable action is impossible.
- Display the requirement-to-validation matrix in the validation review UI.

Likely canonical files:

- `src/lib/validation-ast/schemas.ts`
- `src/lib/validation-ast/compiler.ts`
- `src/services/coordinator/coordinator-validation-ast-compiler-service.ts`
- action catalog/registry source and focused tests
- `src/app/(base)/plans/[planId]/validation-review-panel.tsx`

### Phase 4: Make project-bound browser handoffs reliable

- Centralize canonical browser URL construction using one configured origin.
- Include `targetProjectId` in every plan, validation, baseline, and completion review URL.
- Resolve trusted plan ownership for mutations and reject a conflicting query/cookie instead of requiring a matching
  host-specific cookie.
- Add clean-context browser tests for direct-link load and exact approval on both supported loopback spellings, or
  redirect all alternatives to one canonical origin.

Likely canonical files:

- coordinator response/link builders in `src/services/coordinator/*`
- `src/lib/active-project.ts`
- `src/app/(base)/plans/[planId]/page.tsx`
- plan review server actions and E2E tests

### Phase 5: Reduce planning and validation-authoring cost

- Return complete links, IDs, named hashes, cursors, and the single next action in the first summary mutation.
- Keep later unchanged waits below the existing 300-token ceiling and omit repeated brief/task/handoff bodies.
- Add one plan-intent-scoped discovery call returning relevant action descriptors, environment bindings, locator
  bindings, schema rules, and capability gaps.
- Publish an effective AST schema that explicitly documents `astRef`, persistent IDs, coverage mappings, and
  expected-failure environment identity.
- Make planning retry return atomic uncovered requirements, proposed task-shape diffs, and a bounded repair choice.
- Instrument response bytes, estimated tokens, call counts, agent-active time, and human-review time per phase.

Likely canonical files:

- `packages/appraisejs/src/mcp.ts`
- coordinator response contracts/services
- planning synthesis/retry services
- `docs/coordinator-api-mcp.md`
- `docs/agent-lifecycle-flow.md`
- `docs/agent-mcp-setup.md`

### Phase 6: Sync scaffolds and run the literal lifecycle regression

- Update current docs for the new hash, recovery, URL, coverage, and compact-response contracts.
- Run `npm --prefix packages/create-appraisejs run prepare-template`; do not hand-edit template output.
- Run focused unit/integration/E2E tests, harness validation, static analysis, and build.
- Repeat this exact fresh-target todo workflow through browser plan approval, exact validation preview, browser
  validation approval, managed baseline review/acceptance, implementation, managed final validation, and browser final
  completion approval.

The change is not complete until the literal plan reaches `completed` with valid Appraise-managed TestRun evidence and
the measured response/call budget is recorded.

## Validation Matrix

- `npx vitest run src/services/coordinator/managed-validation-integrity-audit.test.ts`
- `npx vitest run src/services/coordinator/validation-ast-publish-orchestrator.integration.test.ts`
- `npx vitest run src/services/plan-review/plan-review-service.test.ts`
- focused MCP contract/token-budget tests
- focused plan-review Playwright tests for clean direct links and review decisions
- `npm run check:harness`
- `npm run validate`
- `npm run quality:fallow:commit`
- `npm run quality:react-doctor:commit`
- `npm run build`
- `npm run graphify:auto` after safe source changes touch committed graph scopes

## Completion Criteria

- Validation approval cannot invalidate immutable publication integrity.
- A `review_ready` inconsistency has one legal, exact, idempotent recovery path.
- No explicit non-deferred requirement is silently uncovered.
- Review URLs load and mutate correctly in a clean browser without prior active-project state.
- Initial handoffs are complete; unchanged waits and repeated reads are compact deltas.
- The public AST contract is sufficient without source inspection.
- Root/base source, current docs, scaffold templates, and generated graph outputs agree.
- The literal fresh-target lifecycle reaches `completed`; a plan-only or validation-only green test is insufficient.
