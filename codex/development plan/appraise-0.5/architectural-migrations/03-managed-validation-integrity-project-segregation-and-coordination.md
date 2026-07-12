# Managed Validation Integrity, Project Segregation, And Coordination

## Status

Proposed implementation plan. Human review is required before implementation.

This plan follows the v1-removal work in
`02-v1-removal-and-v2-only-validation-architecture-refactor.md`. The surviving managed-validation architecture is now
the only architecture and must no longer be described as "v2" in active product contracts.

## Executive Summary

A fresh external-target audit proved that AppraiseJS can register an empty workspace, create and review a plan, wait
for exact UI approval, and begin managed validation preparation without creating target `automation/` files or
starting implementation. It also exposed architectural gaps that prevent a trustworthy red-to-green validation run:

1. agents can claim broad task and quality coverage without a reviewable coverage argument;
2. validation context advertises resource proposal schemas without a callable proposal submission path;
3. target-project segregation is incomplete across locators, environments, modules, suites, cases, templates, runs,
   reports, and other authored or execution entities;
4. environment identities returned by context do not match identities accepted by AST checking;
5. planning-session generation can ignore explicit requirements and repeat an unchanged generic candidate;
6. active contracts retain migration-era `v2`, version, and phase terminology;
7. hash responses do not clearly separate reviewed content from mutable lifecycle state;
8. delegated subagents lack a durable, bounded way to prove user-authorized external-target operations;
9. active documentation still contains mixed-architecture language.

The solution must preserve the intelligence boundary: the coding agent proposes validation meaning, the human judges
adequacy, and Appraise verifies referential integrity, completeness, scope, provenance, lifecycle authority, and exact
review binding. Appraise must not pretend to infer arbitrary product semantics independently.

## Audit Evidence

- Target workspace: `/private/tmp/appraise-v2-audit-todo-2026-07-13`
- Target project ID: `af04c4cc-d02b-4c42-8f9d-1b13d63e3489`
- Plan ID: `pln_01kxbx9r3s3bce3zyde78vk8de`
- Review-ready plan hash: `sha256:8311aa55c360114975927c110de9f1dfcc40fdf0a38354c093f93e3b66f861ba`
- Rejected AST receipt: `sha256:4013f2531903a6dee490555c34676334bc2bf8c180840fae7c6d5d090de953de`
- Target state after audit: `.appraisejs/project.json` only; no application or `automation/` files
- Lifecycle reached: `preparing_validations`
- Correctly unused operations: `validation_ast_compile`, baseline, implementation, completion

The rejected AST claimed all five plan tasks and accessibility, persistence, and responsive concerns while containing
only navigation, page-ready, reload, and page-ready actions. Appraise returned a valid preview with no warnings. The
evaluator rejected it rather than manufacturing inadequate evidence.

## Non-Negotiable Product Decisions

### Managed validation naming

- Active product vocabulary must not call the surviving architecture "v2".
- The canonical contract identity is `appraise.validation-ast`.
- Its first supported schema is `schemaVersion: 1`.
- The removed `appraise.validation/v1` artifact family is unrelated and remains deleted.
- Durable provenance uses stable domain terms, not migration phases such as `phase2_review_only` or
  `phase3_capsule`.

### Intelligence and evidence boundary

- The coding agent authors coverage claims and rationales.
- The human reviewer decides whether those claims are adequate.
- Appraise validates references, completeness, consistency, scope, provenance, and exact review binding.
- Appraise may emit deterministic warnings for structurally suspicious claims but must not present heuristics as
  autonomous semantic truth.

### Resource ownership

- Managed validation resources are Appraise-owned database entities.
- Agents must not create target-workspace locator, environment, feature, or step files for managed execution.
- An empty target may legitimately have proposed locator signatures before the corresponding UI exists.
- Missing product behavior is expected baseline evidence, not an authoring failure, after resource binding succeeds.

### Project segregation

- Every project-sensitive read and write defaults to the active target project.
- Missing project ownership never implies global visibility.
- Cross-project reuse requires an explicit global-library or import/share contract.
- Execution evidence must retain an unbroken target → plan → publication → validation → capsule → TestRun binding.

### Hash semantics

- Reviewed content hashes change only when reviewed content changes.
- Lifecycle transitions change state hashes, not reviewed content hashes.
- Every returned hash has a domain-specific name.
- Content changes require revision advancement and fresh review.

### Delegated authority

- Transcript inheritance is not an authorization protocol.
- Appraise issues durable, bounded, target- and operation-scoped delegation receipts.
- Delegation never substitutes for plan, validation, baseline, or completion review gates.

## Target Architecture

### Project scope model

All entities declare one of these scopes:

1. `system`: built-in actions, runtime adapters, and internal schemas;
2. `global_library`: explicitly promoted reusable templates and Step Blocks;
3. `project`: entities owned by one `TargetProject`;
4. `publication`: immutable reviewed plan/validation projection entities;
5. `runtime`: capsules, TestRuns, attempts, logs, reports, traces, and screenshots.

Project-owned entities carry a required `targetProjectId`. Publication entities carry target, plan, and publication
identity. Runtime entities carry target, plan, publication, validation, and TestRun identity transitively.

### Validation preparation flow

```text
validation_context_read
  → validation_resources_propose
  → Appraise validates target scope and proposal graph
  → accepted locator/environment/entity IDs
  → refreshed validation context
  → validation_ast_check
  → validation_ast_preview with coverage argument
  → exact human review
  → validation_ast_compile
  → immutable canonical publication and runtime capsule
```

### Coverage argument

Each claimed task and quality concern includes:

- covered acceptance criteria or concern identifier;
- scenario IDs;
- stimulus step IDs;
- observation/assertion step IDs;
- agent-authored rationale;
- coverage state: `covered`, `partial`, `deferred`, or `uncovered`;
- optional limitation or deferral explanation.

Appraise verifies that referenced tasks, criteria, concerns, scenarios, and steps exist; required entries have an
explicit state; claimed observations reference observable actions; and the exact mapping is receipt-bound. The UI
presents the mapping for human judgment.

### Hash families

- `planContentHash`: reviewable plan content only;
- `reviewBindingHash`: plan revision plus exact reviewed content;
- `planStateHash`: mutable lifecycle state;
- `validationPublicationHash`: reviewed AST, coverage, and resolved resource graph;
- `runtimeInputHash`: immutable capsule inputs;
- `completionReceiptHash`: final evidence and event sequence.

State transitions record `previousStateHash`, `stateHash`, `planContentHash`, and event sequence. Event acknowledgement
does not change reviewed content hashes.

### Delegation receipt

A delegation receipt binds:

- parent and delegated coordinator identities;
- target project and canonical-path fingerprint;
- allowed and prohibited operations;
- purpose;
- issue, expiry, and revocation state;
- nonce and signature or server-verifiable digest;
- consumption history.

Planning-only delegation cannot authorize validation preparation, baseline, or implementation unless those
permissions are explicitly added and the normal lifecycle gates have opened.

## Implementation Tranches

## Tranche 0: Freeze Contracts And Add Regression Fixtures

### Task 0.1: Capture the fresh-target audit as backend fixtures

Add focused fixtures reproducing the accepted plan, empty target, unrelated-resource leakage, environment identity
mismatch, and inadequate coverage claim. Do not persist temporary audit workspace paths in production data.

**Acceptance criteria**

- Tests reproduce each confirmed defect before its fix.
- The fixture creates no target `automation/` files.
- The inadequate AST remains uncompiled unless an exact test-only review receipt is supplied.

### Task 0.2: Define canonical terminology and compatibility boundary

Document the one surviving managed-validation vocabulary and enumerate every active `v2`, `phase2`, `phase3`, and
mixed-flow identifier that must be renamed.

**Acceptance criteria**

- A checked inventory distinguishes active contract identifiers from historical migration references.
- No new active API, schema, UI, skill, or test uses architecture-generation terminology.

### Checkpoint 0

- Regression fixtures fail for the intended reasons.
- The rename inventory is human-reviewed before schema work begins.

## Tranche 1: Establish Global Project Segregation

### Task 1.1: Create the entity ownership matrix

Classify modules, suites, cases, steps, locator groups, locators, environments, tags, templates, Step Blocks,
publications, capsules, TestRuns, reports, evidence, and exports as system, global-library, project, publication, or
runtime scoped.

**Acceptance criteria**

- Every persistent model has an explicit ownership decision.
- Every intentionally global entity has a promotion or built-in origin contract.
- Unscoped legacy rows have a deterministic migration classification.

### Task 1.2: Add project ownership to project-sensitive models

Add required `targetProjectId` relations and project-scoped composite uniqueness where appropriate. Use staged
nullable-to-required migrations if existing data requires classification first.

**Acceptance criteria**

- Same names and keys may coexist in different projects.
- Cross-project relationships are rejected.
- Deletion and retention policies preserve reviewed publications and evidence intentionally.

### Task 1.3: Scope service, action, API, and MCP queries

Resolve target scope from the authenticated coordinator or plan binding. Reject conflicting caller-supplied project
identity and remove unscoped list/find helpers from project-sensitive flows.

**Acceptance criteria**

- Fresh-target context contains no unrelated project entities.
- Project-sensitive operations cannot read or mutate foreign resources by guessed ID.
- Every response exposes scope and provenance.

### Task 1.4: Implement explicit global sharing and import semantics

Support built-in/global assets and deliberate copy or immutable-reference imports. Record source, destination,
version/hash, sharing mode, actor, and propagation policy.

**Acceptance criteria**

- Foreign resources never appear as native project entities.
- Mutable global resources are frozen into reviewed publications before execution.
- UI and MCP distinguish project, global, imported, and system resources.

### Checkpoint 1

- Cross-project negative tests pass for every entity family.
- A two-project test proves identical local keys do not collide.
- Existing database migration is reviewed before destructive classification.

## Tranche 2: Add Appraise-Owned Resource Proposal Coordination

### Task 2.1: Define the resource proposal graph contract

Create a typed batch proposal covering routes/pages, locator groups, locators, selector signatures, environments, and
any required project-bound canonical entities.

**Acceptance criteria**

- Proposal references are internally resolvable in one request.
- Schemas declare the exact submission operation and required lifecycle.
- Proposal validation reports field, resource, target, and corrective action.

### Task 2.2: Implement `validation_resources_propose`

Add one discoverable MCP/API operation that validates and transactionally creates or updates target-bound resources,
then returns stable entity IDs and a refreshed context hash.

**Acceptance criteria**

- The operation is allowed only during the correct plan lifecycle.
- It cannot create resources for another target.
- Replay is idempotent through a content-bound key.
- Partial proposal graphs do not leave partial database state.

### Task 2.3: Align environment identity

Define the stable AST environment reference and return it explicitly alongside database ID and display name.

**Acceptance criteria**

- The exact context-returned reference passes AST check.
- Ambiguous name, ID, and key use returns actionable errors.
- Environment uniqueness is project-scoped.

### Task 2.4: Add proposal review and UI provenance

Show newly proposed resources, scope, selector signatures, and origin during validation review. Decide which resource
changes require separate approval versus inclusion in the exact validation receipt.

**Acceptance criteria**

- Human reviewers can distinguish new, reused, imported, and global resources.
- Review invalidates when a receipt-bound resource changes.

### Checkpoint 2

- A fresh empty target can propose todo-page locators through MCP without writing target files.
- The refreshed context contains only the target resources and explicitly global library assets.

## Tranche 3: Add Coverage Arguments And Human Review

### Task 3.1: Extend the AST with coverage mappings

Add task, acceptance-criterion, and quality-concern mappings with scenario, stimulus, observation, rationale, and
coverage-state fields.

**Acceptance criteria**

- Every claimed ID resolves to reviewed plan content.
- Required tasks and concerns cannot silently disappear.
- Partial, deferred, and uncovered states remain representable and reviewable.

### Task 3.2: Add deterministic coverage integrity checks

Validate references, mapping completeness, observation action capability, and contradictions. Add conservative
heuristics as warnings, not semantic verdicts.

**Acceptance criteria**

- The audit AST cannot claim full coverage without per-item mappings and rationale.
- Heuristic warnings are clearly labeled and may be reviewed explicitly.
- Appraise does not claim to independently prove product semantics.

### Task 3.3: Build the coverage review matrix

Display plan item, agent rationale, scenarios, stimuli, observations, limitations, and status. Bind the decision to the
exact mapping hash.

**Acceptance criteria**

- Uncovered and partial items are visually prominent and keyboard accessible.
- Changed scenarios or mappings invalidate the affected review decision.
- The reviewer can reject or comment on a specific coverage claim.

### Checkpoint 3

- Human review can distinguish structurally valid from convincingly substantiated coverage.
- The original four-step audit AST is visibly inadequate without Appraise pretending to replace human judgment.

## Tranche 4: Normalize Contract And Provenance Vocabulary

### Task 4.1: Rename the public AST contract

Replace `appraise.validation-ast/v2` with `appraise.validation-ast` and define `schemaVersion: 1` as the first supported
schema of this distinct contract family.

### Task 4.2: Replace migration-phase provenance

Replace phase-based execution authority with stable publication and capsule terms. Preserve exact AST, preview,
projection, receipt, publication, and runtime-input hashes.

### Task 4.3: Align tools, resources, docs, UI, skills, and packages

Update contract resources to describe check, preview, exact review, and compile. Remove active mixed-flow language and
architecture-generation terminology.

**Acceptance criteria for Tranche 4**

- Active repository absence checks find no `appraise.validation-ast/v2`, `phase2_review_only`, `phase3_capsule`, or
  mixed managed execution guidance.
- Historical migration docs remain clearly historical.
- Tool names remain `validation_ast_check`, `validation_ast_preview`, and `validation_ast_compile`.

### Checkpoint 4

- Root and packaged contracts serialize the same canonical schema.
- Existing experimental rows are purged or explicitly migrated under a reviewed migration policy.

## Tranche 5: Make Hash Transitions Explicit

### Task 5.1: Define canonical hash inputs

Document canonical serialization and input fields for plan content, review binding, state, validation publication,
runtime input, and completion receipt hashes.

### Task 5.2: Separate content and state hashes in storage and responses

Replace ambiguous `hash` or `contentHash` fields where multiple meanings exist. Preserve plan content hash across
approval, start, event delivery, and acknowledgement.

### Task 5.3: Add transition receipts and stale-write diagnostics

Every state transition records previous/resulting state hashes, stable content hash, revision, event sequence, and
actor. Stale responses return expected and current named hashes.

**Acceptance criteria for Tranche 5**

- State-only transitions do not change `planContentHash`.
- Content changes advance revision and require fresh review.
- UI, MCP, service, and event payloads agree on hash names and values.

### Checkpoint 5

- The fresh-target plan approval/start sequence proves stable reviewed content and changing state hashes.
- Hash replay, stale revision, and concurrent transition tests pass.

## Tranche 6: Add Durable Bounded Delegation

### Task 6.1: Extend the existing delegated-authorization model

Inspect existing delegated nonce and authorization records before adding new models. Define a receipt that binds parent
and child coordinators, target, path fingerprint, purpose, permissions, prohibitions, expiry, nonce, and revocation.

### Task 6.2: Add delegation lifecycle operations

Implement create/read/revoke and verification. Require a receipt for delegated external-target mutations when trusted
authorization is otherwise unavailable.

### Task 6.3: Enforce least privilege across lifecycle gates

Planning delegation authorizes project registration and plan creation only. Later phases require explicit delegated
permissions and still require Appraise-owned approval events.

### Task 6.4: Add delegation UI and audit history

Show issuer, recipient, target, purpose, permissions, expiry, consumption, and revocation.

**Acceptance criteria for Tranche 6**

- An isolated subagent can create the authorized target plan using only a bounded receipt.
- Parent transcript inheritance is unnecessary.
- A planning-only receipt cannot start validation, baseline, or implementation.
- Revoked, expired, replayed, and wrong-target receipts fail closed.

### Checkpoint 6

- Security review covers confused deputy, replay, scope expansion, path substitution, and coordinator takeover.

## Tranche 7: Improve Planning Requirement Fidelity

### Task 7.1: Preserve explicit brief requirements in candidate generation

Track atomic requirements and verify candidate plans account for them as tasks, acceptance criteria, or explicit
deferrals.

### Task 7.2: Prevent unchanged retries

When retry feedback identifies omissions, require the next candidate to report how each omission was addressed or why
it remains unresolved.

### Task 7.3: Expose requirement coverage during plan review

Present brief requirement → plan item mappings so humans can detect generic or missing coverage before approval.

**Acceptance criteria for Tranche 7**

- Filtering and responsive requirements from the audit brief are not silently omitted.
- A retry cannot return an effectively identical candidate without an explicit explanation.

### Checkpoint 7

- Focused planning-session regression tests pass across todo, recipe, notes, and inventory briefs.

## Tranche 8: Baseline Semantics And End-To-End Acceptance

### Task 8.1: Classify pre-implementation baseline outcomes

Distinguish authoring, infrastructure, expected product baseline, unrelated existing failure, and unexpected pass.

### Task 8.2: Run the corrected fresh-target lifecycle

Register an empty target, propose resources through MCP, author and review coverage mappings, compile the canonical AST,
and run the capsule baseline. The missing application should produce expected product baseline failures tied to the
reviewed locator signatures.

### Task 8.3: Continue through implementation and completion

After baseline acceptance, implement the target, rerun the exact managed validations, reconcile passing evidence,
verify tasks, complete final review, and obtain explicit sign-off.

### Task 8.4: Assert containment and absence

Verify project isolation, no target managed automation, exact publication/capsule binding, no foreign evidence reuse,
and no active migration-era terminology.

### Final Checkpoint

- Fresh empty target reaches final sign-off through the canonical managed-validation lifecycle.
- All required evidence is Appraise-managed, project-bound, fresh, and full assurance.
- The real-subagent audit protocol passes with an isolated delegated agent.

## Migration Strategy

1. Inventory every existing entity with missing or ambiguous project scope.
2. Classify built-in seed assets separately from user-authored global and project-owned rows.
3. Require human approval before destructive deletion or ambiguous reassignment.
4. Backfill project ownership from plan, suite, run, publication, marker, or explicit import provenance only when
   deterministic.
5. Quarantine ambiguous rows rather than exposing them globally.
6. Add project-scoped uniqueness after backfill.
7. Rebuild scaffold databases only from canonical root seed sources.
8. Remove temporary migration commands after the accepted migration window.

## Required Tests

- schema migration against fresh, seeded, multi-project, and ambiguous legacy databases;
- cross-project read/write negative tests for every project-sensitive entity;
- global-library promotion and copy/reference import tests;
- resource proposal transaction, replay, lifecycle, scope, and review invalidation tests;
- environment context-to-AST identity tests;
- coverage mapping integrity and review UI accessibility tests;
- contract/provenance serialization and absence tests;
- hash stability and state-transition receipt tests;
- delegation expiry, revocation, replay, wrong-target, and privilege-escalation tests;
- planning requirement fidelity and changed-retry tests;
- capsule baseline expected-failure classification tests;
- full external-target lifecycle and scaffolded-app lifecycle tests.

## Release-Like Validation Matrix

- focused ESLint and Prettier checks after each tranche;
- coordinator, schema, AST, resource, coverage, capsule, TestRun, route, package, and scaffold tests;
- `npm run validate` in one uninterrupted run;
- `npm run lint`;
- `npm run build`;
- `npm run quality:fallow:commit`;
- `npm run quality:react-doctor:commit`;
- `npm run check:harness`;
- package tests and builds for `packages/appraisejs` and `packages/create-appraisejs`;
- Graphify update through the documented workflow when committed graph scopes change;
- manual browser review of project scope, resource proposal, coverage matrix, hash provenance, delegation, baseline,
  TestRun, and completion surfaces.

## Commit Strategy

Use one verified commit per checkpoint, with smaller commits inside a tranche when migrations and contracts should be
reviewed independently. Suggested sequence:

1. `test: capture managed validation integrity audit gaps`
2. `refactor: establish target project ownership boundaries`
3. `feat: add project scoped validation resource proposals`
4. `feat: add reviewable validation coverage arguments`
5. `refactor: normalize managed validation contracts`
6. `refactor: separate content and lifecycle state hashes`
7. `feat: add bounded delegated coordinator authority`
8. `fix: preserve explicit planning requirements`
9. `test: prove fresh target managed validation lifecycle`
10. `docs: document project scoped managed validation architecture`

## Risks And Mitigations

| Risk                                                         | Impact   | Mitigation                                                                                                      |
| ------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| Project scoping migration misclassifies existing entities    | High     | Dry-run inventory, deterministic provenance rules, quarantine ambiguity, human destructive gate                 |
| Global-library design recreates accidental global visibility | High     | Explicit promotion/import records and project-default queries                                                   |
| Coverage heuristics overclaim intelligence                   | High     | Treat agent rationale and human review as authority; heuristics are warnings only                               |
| Contract rename creates another compatibility layer          | High     | One-time experimental-data migration or purge; no parallel active aliases                                       |
| Hash changes break clients silently                          | High     | Named hash fields, compatibility diagnostics, package/root lockstep tests                                       |
| Delegation becomes a gate bypass                             | Critical | Least privilege, short expiry, revocation, target binding, signed nonce, lifecycle enforcement, security review |
| Proposal replay creates duplicate resources                  | Medium   | Content-bound idempotency and transactional graph writes                                                        |
| Baseline treats missing product as infrastructure failure    | High     | Explicit expected-product-failure classification and evidence tests                                             |

## Definition Of Done

- Every project-sensitive entity has explicit scope and provenance.
- Fresh-target context contains only project resources plus clearly labeled global/importable assets.
- Agents can propose and register validation resources through MCP without target files.
- Environment references returned by context are accepted unchanged by AST checking.
- Every coverage claim has a receipt-bound agent-authored argument visible to human review.
- Appraise validates integrity without claiming independent semantic intelligence.
- Active product contracts use `appraise.validation-ast` and stable domain vocabulary.
- Plan content hashes remain stable across state-only transitions.
- Isolated subagents can use bounded Appraise-owned delegation without transcript inheritance.
- Explicit brief requirements survive planning-session generation and revision.
- The empty-target baseline fails for expected missing product behavior from the exact reviewed capsule.
- The completed target passes the same reviewed managed validations.
- No foreign project evidence can satisfy another project's lifecycle.
- No managed target `automation/` files are created.
- One uninterrupted release-like validation matrix passes.
- A literal fresh-target audit reaches explicit final Appraise sign-off.

## Human Review Decisions Before Implementation

1. Approve the five-level scope model and global-library import semantics.
2. Approve batch `validation_resources_propose` over separate resource-specific tools.
3. Approve the coverage argument shape and the boundary between blockers and heuristic warnings.
4. Approve `appraise.validation-ast` with `schemaVersion: 1` and no active v2 alias.
5. Approve the named hash families and transition receipt shape.
6. Approve extension of the existing delegated-authorization model rather than a parallel mechanism.
7. Approve quarantine versus deletion policy for ambiguously scoped existing rows.
