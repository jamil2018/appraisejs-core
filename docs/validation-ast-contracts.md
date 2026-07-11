# Validation AST And Delegated Authorization Contracts

The version 1 Validation AST is the canonical agent-authored description of validation intent. It binds execution to
versioned action and locator references while retaining descriptions for human review. The public schemas are exported
from `src/lib/validation-ast`.

An AST contains an ID, title, purpose, covered plan tasks, browser/environment matrix, scenarios, ordered semantic
steps, and quality concerns. Step inputs may be primitives or exact locator, environment, stored-output, and custom
extension references. Raw executable source is not accepted in a step. Project-specific TypeScript is submitted only
through a versioned `CustomActionExtensionProposal`, including the capability gap, typed inputs/outputs, and required
capabilities.

`checkValidationAst` and `previewValidationAst` provide the read-only Phase 2 compiler front end. Check validates the
exact plan/task, action, locator, environment, stored-value, extension, runtime, capability, state, compatibility, and
input/output references. Preview returns bounded deterministic entity IDs, action/locator/extension descriptors,
human-readable Gherkin, blockers, warnings, hashes, and an immutable command-receipt preview. These operations do not
persist canonical validation entities or compile runtime bindings; publication remains later compiler work.
Preview includes one bounded `canonicalProjection` containing the exact module, suite, cases, ordered steps, template
bindings, parameters, referenced locator entities, matrix, executable/Gherkin paths, Gherkin text, and projection hash.
Canonical compilation consumes that same pure projection and rejects any projection-hash change before persistence.
Public compile prepares a durable idempotent publish journal containing the exact plan, validation, review, projection,
receipt, and extension-review contents and hashes before projection begins, then resumes that operation through
artifact, projection, and review-ready phases. Public callers receive the journal operation rather than bypassing
recovery with an immediate projector call.

## Simple happy-path authoring profile

An agent may select the version 1 `simple-happy-path` profile in a submission. It requires one primary scenario, one
environment/browser matrix entry, explicit accessibility and persistence concerns, and at least one `Then` assertion.
Wait/timing actions remain bounded to 30 seconds. Advanced matrices and timing are available only through explicit
`advanced.matrix` and `advanced.timing` opt-ins. The selected profile and opt-ins are included in the exact preview and
journal receipt; they guide composition and validation only and do not execute tests or bypass validation review.

Profile enforcement uses resolved, versioned action descriptors rather than action-name patterns. Assertion
descriptors declare the accessibility or persistence concerns they actually verify, and qualifying concerns must be
exercised by registered `Then` assertion actions. Numeric inputs declare milliseconds or seconds plus catalog bounds;
the profile normalizes those units before enforcing its 30-second ceiling. Labels, concern metadata, renamed actions,
and millisecond values cannot substitute for catalog-backed capabilities.

## Controlled custom extensions

`compileCustomExtension` validates a version 1 proposal against a project-scoped capability policy. Every declared
capability must be allowed for that project, and every static import must be granted by one of those capabilities.
Dynamic imports, CommonJS `require`, dangerous runtime globals, and undeclared module re-exports are rejected. A real
TypeScript check runs with strict NodeNext settings and an explicit ES/DOM declaration surface before transpilation.
The compiler rewrites `@cucumber/cucumber` imports to the exact Appraise-owned module path, preventing a target
workspace from registering steps on a second Cucumber instance.

The bounded exact-review result contains the immutable project ID and fingerprint, declared capabilities, requested
and compiled imports, original and compiled source, both SHA-256 hashes, and the bound Cucumber module path. Compilation
does not write target-repository or generated automation files and does not approve or publish an extension. The
check/preview path resolves the policy from authoritative target-project context and returns deterministic
extension blockers or these exact compiled reviews. Canonical compilation verifies the reviewed compiled hashes and
stores the complete reviews in the same append-only `validation_ast_compiled` transaction as the legacy projection.
This is review persistence only: compiled extensions are not executable until Phase 3 provides isolated runtime
capsules. No target-repository or runtime files are materialized here.

Submission contracts bound identifiers, text, matrices, tasks, scenarios, steps, action inputs, proposals, extension
fields, capabilities, and TypeScript source bytes before compiler work. Extension identities are unique and the
declared, proposed, and action-input-referenced sets must match exactly. Import-policy failures short-circuit before
type checking. The checker sees only the virtual proposal and synthetic declarations for explicitly allowed modules;
it cannot resolve target or host filesystem imports. Module re-exports are rejected.

Each target policy has schema version `1`, immutable project ID and fingerprint, sorted capability/import data, and a
deterministic content hash. The policy also binds the TypeScript compiler version and the content hash of the bounded
Appraise runtime declaration bundle used for semantic checking. It is included in check/preview and receipt context. Discover it through
`validation_ast_extension_policy`, the matching internal HTTP/package-client operation, or
`appraisejs validation ast-policy <plan-id>` before authoring an extension.

Published extension reviews are available through the authenticated `validation_ast_extension_reviews` operation and
`appraisejs validation ast-reviews`; reads revalidate the complete immutable journal and parse every extension through
the bounded review schema before returning it. Review decisions and final submission bind the current `review_ready`
operation hash and exact sorted extension artifact hashes; immutable operation-linked decision events reject stale or
mismatched evidence. Phase 2 AST projections carry `phase2_review_only` provenance. Baseline, implementation
validation, form-created runs, and standalone/plan-bound test runs reject those cases until Phase 3 grants
`phase3_capsule` execution authority.

Decision evidence is canonical by `(publishOperationId, validationId)`. A retry reads the immutable payload before
rewriting the artifact, preserving the original reviewer, timestamp, decision, and content hash. Final submission
compares every decision field plus the operation hash and sorted extension hashes exactly against those events.

Submitting an approved Phase 2 AST review finalizes the canonical validation, lifecycle, and operation-bound approval
evidence directly. It does not call the legacy runtime materializer, require generated validation files, re-project
entities, or perform execution environment preflight. A retry repairs missing artifact state from canonical decision
evidence without duplicating or mutating the event.

The installable `appraisejs` package exports version-aligned TypeScript contracts from
`appraisejs/phase1-contracts`. MCP clients discover active contract versions through the four
`appraise://contracts/*` resources without receiving an unbounded catalog or graph dump.

## Delegated authorization

A coordinator may issue a narrowly scoped HMAC-SHA256 receipt to a context-isolated worker. Claims bind:

- permitted action class (`validation-ast` or `custom-extension`);
- immutable target fingerprint;
- exact brief or plan hash;
- issuer, expiry, and nonce;
- maximum permitted phase (`check`, `preview`, or `publish`).

Authorization verifies the signature with timing-safe comparison, exact target and plan identity, action scope, phase
ceiling, expiry, and one-time nonce consumption. The caller owns durable nonce storage and must atomically consume the
nonce before accepting the delegated mutation. Receipts do not replace Appraise-owned validation review or approval.
Appraise persists consumed nonces with a unique primary key and expiry metadata so replay protection survives process
restart.

`delegated_validation_ast_submit`, `POST /api/internal/coordinator/delegated/validation-ast-submissions`, and
`appraisejs validation submit-delegated-ast` provide the bounded worker handoff. They validate the V1 envelope, verify
the exact receipt scope, target fingerprint, plan hash, check-phase ceiling, expiry and signature, then atomically
consume the nonce and store the submission. The result is `accepted-for-check`; it does not resolve references,
compile, preview, publish, or mutate validation entities.

## Compatibility projection

After a successful Phase 2 check/preview handoff, the compatibility compiler maps an exact AST revision into the
existing validation-node shape and projects its module, suite, cases, ordered steps, identifier tags, and referenced
legacy entities through one Prisma transaction. The same transaction appends `validation_ast_compiled`, so legacy
tables and the review event cannot diverge. The transaction revalidates the exact plan, target, locator graph,
environment, and existing-validation snapshot before its first write. Preview and projection share plan-scoped
collision-resistant entity IDs, exact Gherkin steps, referenced locators, and reviewed custom-extension hashes. This
projection does not replace later runtime materialization and validation review publication.

Operational check and preview load the authoritative plan-bound target, plan/task hashes, action catalog, locator
graph, environments, runtimes, and capabilities. Their bounded preview receipt binds the AST, plan, catalog, graph,
environment context, entities, Gherkin, and command receipt. Compile recomputes that receipt and rejects drift inside
the projection transaction before any write; validation review and runtime materialization remain separate Appraise
lifecycle steps.

Secrets and unsigned claims must never be logged or persisted as authorization evidence. Production issuers should
use a secret from protected local configuration and short expirations.

Canonical publication is restart-safe. `ValidationAstPublishOperation` stores every serialized next artifact and
expected/current hash, AST/context/preview/receipt identities, and the complete projection payload. Immutable extension
reviews are child records referenced by artifact hash. Recovery resumes `prepared -> artifacts_written -> projected ->
review_ready`; artifact writes verify CAS or exact desired content, projection is replay-safe, and the lifecycle plus
`validation_review_ready` event commit exactly once. This journal does not materialize runtime files.
The journal is owned by immutable PlanProjection and TargetProject foreign keys and snapshots the target fingerprint.
Server-side preparation recomputes every content hash and a canonical all-input operation hash, bounds artifacts to
1 MiB and extension reviews to 25, and permits adjacent phase changes only. Projection and its phase advancement share
one transaction; every later phase rechecks repository hashes, while failures are retained in a bounded diagnostic.
