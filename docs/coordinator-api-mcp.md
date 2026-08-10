# Coordinator API And MCP Contract

The internal coordinator boundary and MCP server expose the same executable quality-management capabilities. Their canonical definitions provide request validation, safety annotations, generated setup output, and the operation reference.

The supported workflow is target registration, requirements analysis and approval, Quality Plan revision and validation publication, Assessment execution, evidence reconciliation, evidence review, and an exact hash-bound decision. Every mutation remains target-scoped and identity-bound.

Managed executions create content-bound runtime capsules and TestRuns. Evidence reads are bounded and return immutable receipt identities, integrity diagnostics, and references to the underlying managed run artifacts. A caller cannot supply an arbitrary TestRun to bypass Assessment ownership.

Use generated contract fixtures and the coordinator operation reference as the complete inventory. A missing capability is unavailable; clients must not rely on compatibility wrappers or recovery guidance for removed operations.
