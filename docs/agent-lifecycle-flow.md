# Quality Lifecycle Flow

AppraiseJS manages quality work within an explicit target-project boundary. The caller supplies the target workspace during diagnostic and registration; a selected UI project, URL parameter, cookie, or arbitrary identifier cannot replace that binding.

## Quality Design

The quality workflow begins by registering a target and supplying a requirements source. AppraiseJS analyzes the source into a requirement graph. Human approval fixes the requirement revision that a Quality Plan may reference.

A Quality Plan revision defines obligations and the validation designs that realize them. Validation designs are proposed, reviewed, compiled, and published against their immutable requirement identities. Published validations contain the exact executable inputs used by managed runtime capsules.

Validation compilation canonicalizes the reviewed projection into the strict runtime envelope: scenario-only Gherkin documents, exact Step Invocation closure, compiler and extension-policy hashes, and publication provenance. Publication also materializes the reviewed module, suite, case, step, locator-group, and locator identities required by TestRun foreign keys; runtime preparation idempotently repairs that relational execution index for an already-published version.

## Assessment

An Assessment identifies an immutable evaluation subject and the published validation matrix to run. Readiness verifies target binding, published validation, subject identity, matrix coverage, and current requirement alignment before any execution starts.

Assessment execution prepares and starts content-bound managed runs. Replays with the same content identity are idempotent. Reconciliation waits for terminal runs, checks capsule and artifact integrity, and seals an immutable Evidence Receipt for each completed matrix cell. Partial evidence remains visible and is never discarded merely because another cell is still active or failed.

Evidence reaches review only after the Assessment has completed reconciliation. A decision is hash-bound to the complete evidence set and current requirement alignment. Stale inputs are rejected. Standalone evidence execution may seal receipts but cannot create an Assessment decision.

## Recovery And Ownership

Only AppraiseJS services transition Quality Plan, Assessment, execution, evidence, and decision state. Chat messages describe intent but are not approval evidence. If source, requirements, validation, subject, or evidence identities change, create or review the newly derived immutable revision rather than mutating a historical receipt.

Use the Quality Plans and Assessments surfaces for human review. The exact available MCP operations, resources, and safety annotations are generated from the executable contract; do not infer unavailable operations from historical documentation.
