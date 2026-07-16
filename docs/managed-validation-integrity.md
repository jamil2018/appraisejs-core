# Managed Validation Integrity

Appraise-managed validation is project-bound from authoring through final evidence. The target project owns imported
or authored resources, validation proposals, canonical projections, publications, runtime capsules, TestRuns, and
completion evidence. Built-in resources are system seeds; cross-project reuse requires an explicit copy or reference
import ledger entry. Missing ownership fails closed outside compatibility-only test doubles.

## Authoring and review

`validation_context_read` returns only target-visible resources and stable environment references.
`validation_resources_propose` transactionally creates target-owned modules, suites, cases, locators, and environments
with provenance and idempotent replay. Validation AST coverage arguments map requirements to scenarios, stimulus
steps, observation steps, rationale, state, and limitations. Broad claims without assertion-capable observations are
rejected; partial and uncovered mappings remain prominent in the review UI.

The canonical contract identity is `appraise.validation-ast`, schema version `1`. Check and preview are read-only;
compile writes the reviewed publication and runtime-input binding. Runtime capsules execute from Appraise storage and
must not create managed `automation/` output in the target.

## Identity and transitions

Plan identity uses three named hashes:

- `planContentHash` covers reviewed plan fields except lifecycle;
- `reviewBindingHash` binds content to its revision;
- `planStateHash` binds content, revision, and lifecycle.

Every plan event records previous/resulting state hashes, stable content hash, revision, sequence, and actor. A
lifecycle-only transition preserves reviewed content. Stale writes report expected and current named hashes.

## Delegation

Durable coordinator receipts bind parent and isolated recipient identities, target and canonical-path fingerprints,
purpose, permissions, prohibitions, optional plan hash, expiry, and nonce. Consumption and revocation are durable and
visible in plan review. Replay, expiry, revocation, wrong recipient, wrong target, path substitution, and privilege
escalation fail closed. Planning-only delegation permits target-bound plan creation but cannot enter validation,
baseline, or implementation without separate authority and the normal Appraise-owned review events.

## Planning and baseline semantics

The connected agent authors plan tasks, acceptance criteria, validation intent, dependencies, and implementation
groups from the brief and repository context. Appraise validates the supplied artifact and references, persists its
hashes, and exposes it to reviewers; it does not classify the app or infer the task graph.

Pre-implementation baseline outcomes are `expected_product_failure`, `authoring_failure`,
`infrastructure_failure`, `unrelated_existing_failure`, or `unexpected_pass`. Expected product failures must match
reviewed ordered signatures after required setup steps. Foreign project evidence is never reusable. Completion still
requires fresh, full-assurance, Appraise-managed passing evidence and explicit final sign-off.

## Validation obligations

Changes to this architecture require focused project-isolation, proposal replay, coverage, contract parity, named
hash, delegation, requirement fidelity, baseline, capsule, TestRun ownership, scaffold, and full lifecycle tests.
Root changes must be synchronized with `npm --prefix packages/create-appraisejs run prepare-template`; generated
scaffold or Graphify output must not be hand-edited.
