# Todo Plan Builder Coverage Retry, Validation Compile Atomicity, and Token Efficiency

## Status

Ready for implementation against the current `appraise-0.5` architecture as inspected on 2026-07-14.

This revision preserves the 2026-07-13 happy-path audit evidence while accounting for the project-isolation work now
present on `codex/core-project-isolation`. Project-owned validation resources are already scoped by
`targetProjectId`, Template Steps and Template Step Groups are shared-library resources, and MCP response modes and
token-budget constants already exist. Those foundations must be extended rather than replaced.

The release-blocking defects remain unresolved:

- Validation AST publication can write an `awaiting_validation_review` plan artifact before canonical projection
  succeeds.
- Proposed locator resources can conflict with canonical projection ownership/module expectations.
- Planning retry feedback does not affect generated task shape.
- Validation review standby can infer readiness from lifecycle without a review-ready publication event and receipt.

## Goal

Make the normal fresh-target workflow complete successfully and efficiently:

`planning_session_create -> exact plan review -> validation resource proposal -> AST check -> exact preview -> AST compile -> exact validation review -> baseline -> implementation -> managed validation -> final completion`

The workflow must remain Appraise-owned, project-isolated, content-addressed, recoverable, and compact enough for
long-running agent coordination.

## Non-goals

- Do not reintroduce managed-v1 validation compatibility.
- Do not make target `automation/` files authoritative execution inputs.
- Do not weaken exact plan, validation, baseline, or completion review gates.
- Do not make Template Steps or Template Step Groups project-owned; they are intentionally shared library resources.
- Do not permit cross-project fallback when a project-owned resource lookup fails.
- Do not repair inconsistent lifecycle state by writing plan YAML, SQLite, or event rows outside Appraise services.

## Current Architecture Baseline

The implementation must preserve these current contracts:

1. Plans are bound to one `TargetProject`; coordinator operations derive trusted scope from the plan projection.
2. Modules, suites, cases, Step Blocks, locator groups, locators, environments, tags, case templates, TestRuns, and
   reports are project-owned.
3. Template Steps and Template Step Groups are shared-library resources visible to every project.
4. Validation context queries project-owned resources at the Prisma boundary and returns shared Template Steps
   separately.
5. Validation AST publication uses `ValidationAstPublishOperation` as its durable journal and emits
   `validation_review_ready` exactly once.
6. Managed execution consumes the immutable Appraise-owned runtime capsule, not target-generated runtime files.
7. MCP already exposes response modes `summary`, `evidenceOnly`, `blockersOnly`, `linksOnly`, and `full`, with initial
   response-token budget constants. New work extends this contract.

## Audit Evidence

- Target workspace: `/private/tmp/appraise-todo-happy-20260713-Ycnbnu`
- Target project: `e890d2d2-e4b2-4123-9cb0-c40c2ad8acd8`
- Plan: `pln_01kxdgrhsp8z6wssqdya4vyjzx`
- Plan review URL: `http://127.0.0.1:3000/plans/pln_01kxdgrhsp8z6wssqdya4vyjzx`
- Validation review URL:
  `http://127.0.0.1:3000/plans/pln_01kxdgrhsp8z6wssqdya4vyjzx?review=validation`
- Approved plan content hash: `sha256:b66524e6981cc7f1f24b8e23ebb481a2a5231efc38f8fb3224f085efa6252388`
- Approved preview receipt: `sha256:a8ef31f5d092fb580b94775b4d191ea04f4e8aaf912c14de16d8323bc34c20cb`
- Preview hash: `sha256:46a6702d2feb9357ca76c35f76617e6ac62c69b0b589b30f13908f44c1fe4d1e`
- Projection hash: `sha256:71dae95a4248400bd7e4771ec99bbf4d84cdb69a60d840f1f583e6fadf4d6778`
- Runtime input hash: `sha256:02a3c2be6e112e13382ccdecca807088a8a09b870125d68fd40a0bb2ad0752ba`
- Compile failure:
  `Validation projection conflicts with existing LocatorGroup "apr-96ee8f9af20fe163d93936b6".`
- Browser evidence after failure: lifecycle badge `awaiting validation review`, Validations tab
  `No validation artifact has been published for this plan revision.`, no approval control, and no console errors.

The audit stopped at this real blocker. No lifecycle gate was bypassed.

## Architecture Decisions

### A1. Review readiness is a committed publication invariant

`awaiting_validation_review` is valid only when all of the following agree:

- the plan artifact lifecycle;
- the `PlanProjection` lifecycle and state hash;
- a review-ready `ValidationAstPublishOperation`;
- the exact published validation and review artifact hashes;
- exactly one `validation_review_ready` event bound to that operation.

No reader or wait tool may infer review readiness from only one representation.

### A2. Prepared publication does not advance lifecycle

The prepared operation stores desired final content, but the live plan artifact and projection remain
`preparing_validations` or `validation_changes_requested` until canonical projection succeeds. The final transition
must update the plan artifact, projection lifecycle/hash, operation phase, and event through one recoverable commit
protocol.

SQLite and filesystem writes cannot share a database transaction, so the journal must distinguish staged content from
authoritative published content and provide deterministic roll-forward or rollback behavior.

### A3. Proposed resource identity is preserved through compilation

Validation resource proposal and canonical projection must share one resource-identity contract. The compiler reuses
compatible project-owned modules, locator groups, locators, and environments without reparenting them. It rejects
foreign-project resources and incompatible same-project resources during `validation_ast_check`, before exact preview
approval.

Every locator-bearing response exposes both the persistent ID and the AST reference. Agents do not construct prefixes.

### A4. Retry repairs task shape, not descriptive context

Planning retries apply normalized omission resolutions and requirement deferrals to deterministic task synthesis.
Task shape has a separate hash from goal/description/context so prose-only changes cannot masquerade as coverage
repairs.

### A5. Compact responses are the default extension of the existing response-mode contract

Existing response modes remain public API. Planning, wait loops, validation context, AST check, preview, and compile
must adopt them consistently. `summary` is the default; `full` is explicit. Content-addressed detail resources replace
duplicated embedded payloads.

## Implementation Tasks

### Task 1: Lock the failed-publication invariant with regression tests

**Description:** Add failing tests that reproduce the audit before changing publication code. Cover a canonical
projection conflict after journal preparation and prove the currently inconsistent representations.

**Acceptance criteria:**

- A fixture creates a fresh target, proposes locator resources, approves an exact preview, and forces the audited
  locator-group conflict.
- The desired assertion requires the live plan artifact and projection to remain at the pre-review lifecycle, with no
  `validation_review_ready` event.
- A second test proves exact replay neither duplicates the operation/event nor hides the original failure phase.

**Likely files:**

- `src/services/coordinator/validation-ast-operation-service.integration.test.ts`
- `src/services/coordinator/validation-ast-publish-orchestrator.integration.test.ts`
- `src/test/validation-ast-test-fixtures.ts`
- matching scaffold copies produced by template sync

**Verification:**

- `npx vitest run src/services/coordinator/validation-ast-operation-service.integration.test.ts`
- `npx vitest run src/services/coordinator/validation-ast-publish-orchestrator.integration.test.ts`

**Dependencies:** None
**Scope:** Medium

### Task 2: Keep prepared artifacts lifecycle-neutral

**Description:** Change AST compilation preparation so staged plan content retains the current lifecycle. Separate
staged validation/review content from the final review-ready plan transition.

**Acceptance criteria:**

- `compileValidationAstForPlan` does not serialize `awaiting_validation_review` before projection.
- A failure in `prepared` or `artifacts_written` leaves every authoritative plan read at the prior lifecycle.
- Stored journal hashes remain deterministic and replayable.

**Likely files:**

- `src/services/coordinator/validation-ast-operation-service.ts`
- `src/services/coordinator/validation-ast-publish-journal-service.ts`
- their focused tests

**Verification:**

- Task 1 tests pass through the artifact-written phase.
- Existing journal size, hash, stale-receipt, and idempotency tests remain green.

**Dependencies:** Task 1
**Scope:** Medium

### Task 3: Finalize publication through one integrity-checked transition

**Description:** Extend the publish journal so the final step compares the current plan artifact, writes the
review-ready plan content, updates projection lifecycle and hashes, records operation phase, and emits the exact event
without exposing an intermediate review-ready state.

**Acceptance criteria:**

- Successful publication produces one consistent review-ready snapshot and one event.
- Crash/replay at every journal phase converges to the same snapshot.
- A compare-and-write conflict returns a structured recoverable failure without advancing lifecycle.
- Operation failure records include operation ID, phase, blocker type, retryability, and next repair action.

**Likely files:**

- `src/services/coordinator/validation-ast-publish-orchestrator.ts`
- `src/services/coordinator/validation-ast-publish-journal-service.ts`
- `src/services/coordinator/coordinator-service.ts`
- focused integration tests

**Verification:**

- Injected crashes after preparation, artifact staging, projection, and finalization recover idempotently.
- State-hash and event-sequence assertions pass after every recovery.

**Dependencies:** Task 2
**Scope:** Medium

### Checkpoint A: Publication integrity

- [ ] Projection failure cannot expose `awaiting_validation_review`.
- [ ] Exact replay creates no duplicate operation or event.
- [ ] Existing validation publication and runtime-input integrity tests pass.
- [ ] Active lifecycle documentation matches the final journal protocol.

### Task 4: Define canonical project-owned resource bindings

**Description:** Add one internal binding type used by proposal, context, check, preview, and projection. It carries
persistent identity, AST identity, version, target project, module/group ancestry, and reuse/create disposition.

**Acceptance criteria:**

- Locator and locator-group results include `id`, `astRef`, `version`, `targetProjectId`, and ancestry IDs.
- Template Step references remain shared-library references and do not gain project ownership.
- Foreign-project and incompatible same-project bindings have distinct structured blocker codes.

**Likely files:**

- `src/lib/validation-ast/schemas.ts`
- `src/services/coordinator/validation-resource-proposal-service.ts`
- `src/services/coordinator/validation-authoring-context-service.ts`
- `packages/appraisejs/src/mcp.ts`
- focused contract tests

**Verification:**

- Proposal and search responses can be copied directly into a valid AST without prefix construction.
- Project-isolation tests prove no foreign resources are returned.

**Dependencies:** None; may be developed alongside Tasks 1-3 after the binding contract is agreed.
**Scope:** Medium

### Task 5: Reuse compatible proposed resources during canonical projection

**Description:** Teach check/preview/projection to preserve proposed module and locator-group ownership rather than
reparenting the group under a generated AST module.

**Acceptance criteria:**

- Fresh target -> propose -> check -> preview -> compile succeeds with locator-bearing steps.
- Existing compatible project-owned resources are reused idempotently with unchanged IDs and ancestry.
- Foreign-project, duplicate, or structurally incompatible resources fail during check, before preview approval.
- Canonical publication persists `targetProjectId` on all created project roots.

**Likely files:**

- `src/services/coordinator/validation-ast-compiler-service.ts`
- `src/services/coordinator/validation-ast-operation-service.ts`
- `src/services/coordinator/validation-canonical-projection-service.ts`
- `src/lib/validation-ast/canonical-projection.ts`
- focused unit and integration tests

**Verification:**

- The exact audit topology compiles without a locator-group conflict.
- Cross-project collision tests fail closed.
- Shared Template Step reuse remains green.

**Dependencies:** Task 4
**Scope:** Medium

### Checkpoint B: Fresh-target validation authoring

- [ ] Empty registered target can propose and compile locator-bearing managed validation.
- [ ] Preview clearly labels reused, created, and blocked resources.
- [ ] No caller constructs `locator_` or `group_` prefixes manually.
- [ ] Project ownership and shared-library invariants pass in root and scaffold tests.

### Task 6: Make coverage retries produce deterministic task diffs

**Description:** Separate task synthesis from descriptive context and apply normalized retry resolutions to task
generation. Preserve the first candidate as the comparison base.

**Acceptance criteria:**

- `retryFeedback.addressed` and requirement deferrals alter requirement-to-task mappings deterministically.
- A `taskShapeHash` excludes goal, description, source-file prose, and plan context.
- The audited todo brief covers add, toggle, delete, filtering, persistence, responsive behavior, and accessibility
  without inventing edit behavior.
- Unchanged shape with unresolved omissions returns a bounded structured fallback instead of another identical full
  candidate.

**Likely files:**

- `packages/appraisejs/src/mcp.ts`
- `packages/appraisejs/src/mcp.test.ts`
- `src/lib/plan-contract/schemas.ts` only if the candidate contract persists the new hash/diff

**Verification:**

- Package MCP tests cover initial omission, repaired retry, prose-only retry, deferral, and retry cap.
- Existing intent classification tests remain green.

**Dependencies:** None
**Scope:** Medium

### Task 7: Make validation review standby receipt-backed

**Description:** Require a review-ready publication operation and event before validation review is reported as ready
or pending human decision. Detect inconsistent legacy/failed states and return a repair response.

**Acceptance criteria:**

- Lifecycle text without a matching review-ready operation, validation artifact, receipt, and event returns
  `integrity_blocked`, not `pending`.
- The response includes operation/failure evidence when available and one exact repair or diagnostic action.
- UI approval controls remain hidden until the same invariant passes.

**Likely files:**

- `packages/appraisejs/src/mcp.ts`
- `src/services/coordinator/coordinator-service.ts`
- `src/services/plan-review/plan-review-service.ts`
- `src/app/(base)/plans/[planId]/validation-review-panel.tsx`
- focused MCP, service, and component tests

**Verification:**

- Recreate the audit split state and confirm both MCP and UI display the integrity blocker.
- A valid publication continues to normal validation approval.

**Dependencies:** Task 3
**Scope:** Medium

### Checkpoint C: Planning and review control

- [ ] Coverage retry changes task shape or returns a bounded actionable fallback.
- [ ] Validation standby never waits indefinitely on an impossible event.
- [ ] Plan and validation human gates remain exact and Appraise-owned.

### Task 8: Extend compact response modes to planning and validation authoring

**Description:** Apply the existing response-mode vocabulary and measurement helpers to the token-heavy tools observed
in the audit. Default to `summary`; retain `full` for diagnostics.

**Acceptance criteria:**

- `planning_session_create`, `plan_create`, plan/validation review loops, validation context, AST check, preview, and
  compile accept the existing response-mode enum.
- Repeated content is replaced by hashes, compact diffs, cursors, and detail-resource links.
- Unchanged waits return only status, cursor, elapsed time, integrity state, and next action.
- Structured errors retain blocker evidence in every response mode.

**Likely files:**

- `packages/appraisejs/src/mcp.ts`
- `packages/appraisejs/src/mcp.test.ts`
- `docs/coordinator-api-mcp.md`
- MCP resource definitions for content-addressed details

**Verification:**

- Contract tests enforce these maximum estimated-token budgets in `summary` mode:
  - diagnostic: 1,000;
  - plan creation or coverage retry: 2,000;
  - unchanged wait: 300;
  - validation mutation/preview: 1,500.
- `full` mode preserves all evidence needed for debugging.

**Dependencies:** Tasks 6 and 7, so their final response contracts are compacted once.
**Scope:** Medium

### Task 9: Publish complete self-describing authoring contracts

**Description:** Make the managed Validation AST and resource-reference formats discoverable without repository-source
inspection.

**Acceptance criteria:**

- MCP exposes the complete versioned AST JSON Schema or a content-addressed resource containing it.
- Agent guide, check failures, proposal/search results, and preview responses link to the correct schema version.
- Schema examples use returned `astRef` values and current project/shared-library ownership rules.

**Likely files:**

- `packages/appraisejs/src/mcp.ts`
- `src/lib/validation-ast/schemas.ts`
- `docs/validation-ast-contracts.md`
- `docs/coordinator-api-mcp.md`
- contract tests

**Verification:**

- A schema-driven fixture builds a valid submission without importing AppraiseJS source modules.
- MCP resource snapshots fail when schema and runtime validator drift.

**Dependencies:** Task 4
**Scope:** Small to medium

### Task 10: Add lifecycle integrity diagnostics and recovery UI

**Description:** Surface publication journal/artifact/projection/event agreement in the plan review UI and coordinator
diagnostics. Provide safe recovery for operations stranded by earlier versions.

**Acceptance criteria:**

- Integrity status reports each representation's lifecycle/hash and the exact mismatch.
- Failed operations expose safe retry/repair only when journal preconditions permit it.
- Validation approval is disabled whenever integrity is not green.
- Recovery never deletes historical attempts or mutates a foreign project.

**Likely files:**

- `src/services/coordinator/managed-validation-integrity-audit.ts`
- `src/services/coordinator/coordinator-service.ts`
- `src/actions/plan-review/plan-review-actions.ts`
- `src/app/(base)/plans/[planId]/validation-review-panel.tsx`
- focused tests and active lifecycle docs

**Verification:**

- The stranded audit plan is diagnosed accurately.
- A repairable staged operation resumes; a non-repairable conflict remains blocked with preserved evidence.

**Dependencies:** Tasks 3 and 7
**Scope:** Medium

### Checkpoint D: Agent efficiency and operator recovery

- [ ] Summary-mode budgets pass.
- [ ] Full schemas are discoverable through MCP.
- [ ] UI and MCP show the same integrity status and repair action.
- [ ] No approval control appears for incomplete validation publication.

### Task 11: Prove the entire isolated todo lifecycle

**Description:** Add and run an agent-like happy-path test in a fresh target workspace using the public MCP contracts
and real review gates. Re-run the original manual audit after automated evidence is green.

**Acceptance criteria:**

- The flow reaches `completed` through plan approval, validation approval, accepted baseline, implementation,
  Appraise-managed TestRun validation, and exact final sign-off.
- Required runtime evidence has `evidenceHealth: valid` and remains target-bound.
- The run uses registry/shared Template Steps where compatible and records justified extensions only when necessary.
- Per-phase response measurements satisfy the summary-mode budgets.

**Likely files:**

- `docs/agent-real-subagent-audit-protocol.md`
- coordinator lifecycle E2E tests
- MCP E2E harness/tests
- no committed target-workspace artifacts unless the harness contract requires fixtures

**Verification:**

- Automated lifecycle E2E passes.
- Real isolated subagent audit completes without source inspection, direct state writes, or lifecycle bypass.
- Browser review pages show valid artifacts and clean console output at each human-owned gate.

**Dependencies:** Tasks 1-10
**Scope:** Medium

## Dependency Graph

```text
Task 1 -> Task 2 -> Task 3 -> Task 7 -> Task 8 -> Task 11
                    |          |                 ^
                    +-------> Task 10 -----------+

Task 4 -> Task 5 -------------------------------> Task 11
   |
   +-------> Task 9 ----------------------------> Task 11

Task 6 -----------------------------------------> Task 8
```

Tasks 1-3 and Task 4 may proceed in parallel after agreeing on the publication/resource-binding boundaries. Task 6
is independent. Tasks 5, 7, and 8 must follow their contract dependencies. Task 11 is the final integration gate.

## Required Documentation Updates

Update current docs in the same implementation slices; do not defer doc drift to the final task:

- `docs/agent-lifecycle-flow.md`: final publication invariant, integrity blocker, recovery ownership.
- `docs/coordinator-api-mcp.md`: retry/task-shape contract, response modes, budgets, structured errors.
- `docs/validation-ast-contracts.md`: staged versus authoritative publication and resource bindings.
- `docs/project-ownership-boundary.md`: reuse rules for project-owned validation resources and shared Template Steps.
- `docs/agent-real-subagent-audit-protocol.md`: full todo lifecycle and response measurement.
- `docs/scaffold-template-sync.md` only if the sync workflow itself changes.

## Validation Strategy

Use focused checks after every task and broader checks at each checkpoint.

### Focused checks

- `npx eslint <changed-source-files>`
- `npx prettier --check <changed-files>`
- `npx vitest run <changed-test-files>`
- `npm --prefix packages/appraisejs test -- <focused-filter>` when package MCP tests change

### Scaffold synchronization

Root/base source is canonical. After root changes are green:

1. Run `npm --prefix packages/create-appraisejs run prepare-template`.
2. Verify expected root/template parity.
3. Run the matching focused tests against the synchronized scaffold source where applicable.
4. Do not patch template or generated Graphify outputs by hand.

### Final validation

- `npm run lint`
- `npm run test`
- `npm run validate`
- `npm run quality:fallow:commit`
- `npm run quality:react-doctor:commit`
- `npm run check:harness`
- `npm run build`
- `npm run graphify:auto` when safe source changes touch committed graph scopes
- Full isolated lifecycle E2E and real subagent audit from Task 11

Environment-only failures must be separated from code failures with exact commands and logs. Hook failures introduced
by the implementation must be fixed; hooks must not be bypassed.

## Risks and Mitigations

| Risk                                                  | Impact                         | Mitigation                                                                                              |
| ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Filesystem and SQLite cannot commit atomically        | Critical lifecycle drift       | Treat filesystem content as staged until a journaled final compare-and-write; test every crash phase    |
| Ownership fix reintroduces cross-project visibility   | Critical data isolation breach | Query by `targetProjectId` at Prisma boundary and add foreign-project fixtures for every resource class |
| Shared Template Steps are accidentally project-scoped | High registry regression       | Keep shared-library type explicit and test reuse from multiple projects                                 |
| Retry synthesis becomes nondeterministic              | High review/hash instability   | Normalize feedback, isolate `taskShapeHash`, and snapshot exact task diffs                              |
| Compact mode drops required evidence                  | High unsafe automation         | Define required fields per mode and keep blocker/evidence hashes in every mode                          |
| Recovery mutates historical or foreign state          | Critical evidence loss         | Bind operation, target fingerprint, hashes, and ownership before exposing repair                        |
| Root/template divergence                              | High scaffold regression       | Edit root first and require template sync plus parity checks at checkpoints                             |

## Definition of Done

- All eleven tasks and four checkpoints are complete.
- The original todo brief completes through exact final sign-off in an isolated target.
- A failed compile cannot expose validation review readiness.
- Proposed locator resources compile without manual reference rewriting or ownership conflicts.
- Coverage retry changes task shape or returns a bounded actionable fallback.
- Summary response budgets pass without losing blocker or evidence hashes.
- MCP authoring contracts are self-describing.
- UI, coordinator reads, artifacts, publish journal, projection hashes, and events agree at every lifecycle gate.
- Project isolation and shared Template Step behavior remain intact.
- Root, synchronized scaffold, focused tests, full validation, static analysis, harness, build, and required Graphify
  updates pass.

## Recommended Commit Boundaries

1. `test: capture validation publication split-brain regression` — Task 1.
2. `fix: keep validation publication lifecycle atomic` — Tasks 2-3 plus Checkpoint A docs.
3. `feat: expose canonical validation resource bindings` — Task 4.
4. `fix: reuse project-owned validation resources during compile` — Task 5 plus Checkpoint B docs.
5. `fix: apply coverage retry feedback to task synthesis` — Task 6.
6. `fix: require receipt-backed validation review readiness` — Task 7.
7. `perf: compact planning and validation MCP responses` — Task 8.
8. `docs: publish self-describing validation authoring contracts` — Task 9.
9. `feat: expose managed validation integrity recovery` — Task 10.
10. `test: prove complete isolated todo lifecycle` — Task 11 and final evidence updates.
