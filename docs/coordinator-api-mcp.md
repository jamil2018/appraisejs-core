# Coordinator API And MCP Contract

The internal coordinator boundary and MCP server expose the same executable quality-management capabilities. Their canonical definitions provide request validation, safety annotations, generated setup output, and the operation reference.

The supported workflow is target registration, requirements analysis and approval, Quality Plan revision and validation publication, Assessment execution, evidence reconciliation, evidence review, and an exact hash-bound decision. Every mutation remains target-scoped and identity-bound.

Managed executions create content-bound runtime capsules and TestRuns. Evidence reads are bounded and return immutable receipt identities, integrity diagnostics, and references to the underlying managed run artifacts. A caller cannot supply an arbitrary TestRun to bypass Assessment ownership.

When `test_run_read` reports `result: BLOCKED`, its `humanVerification` facts identify the versioned structural detector boundary without exposing challenge tokens or DOM data. This is terminal evidence of an automation limit, not a target pass/fail: any linked Assessment projects `targetOutcome: not_evaluated`, and the only retry is a fresh TestRun after external challenge resolution.

`environment_list` and `environment_ensure` are the target-scoped environment boundary. Listing returns redacted summaries and a registry hash; ensuring resolves an exact ID or creates only an explicit `allowCreate` proposal. `assessment_prepare_run` is the idempotent convenience path for an already approved design: it validates exact Step Definition and locator bindings, ensures prerequisite definitions and the environment, derives the sealed runtime publication server-side, creates the Assessment, and starts managed execution. Generated module, suite, and case identifiers use runtime-safe opaque characters, and invocation references use the canonical Step Reference hash. It never reconciles evidence, reviews evidence, or decides an Assessment.

The preparation operation performs request-specific validation before any durable preparation or lifecycle mutation and returns compact preflight counts plus content hashes in the default `summary` response. This catches stale designs, incomplete validation coverage, incompatible typed inputs, unresolved Step Definitions, and missing target-owned locators before immutable publication. Use `responseMode: full` only when a focused diagnostic requires the complete payload.

Project-owned locator groups and locators remain searchable when their own `targetProjectId` matches the Quality Plan target, even if an older project has no locator-ownership ledger rows. Ownership receipts remain authoritative when they exist. `operation_read` reports unknown or non-catalog operation IDs as a typed not-found response rather than an internal coordinator failure.

Use generated contract fixtures and the coordinator operation reference as the complete inventory. A missing capability is unavailable; clients must not rely on compatibility wrappers or recovery guidance for removed operations.
