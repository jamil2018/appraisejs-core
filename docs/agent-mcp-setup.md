# MCP Setup For Quality Work

Start the AppraiseJS MCP server using the package script defined in `packages/appraisejs/package.json`. Register the connected client with its actual transport and current target workspace before attempting quality work.

Run the project diagnostic against the target workspace. A ready diagnostic confirms the application identity, active transport, observed executable capabilities, and target binding. A setup screen alone is not capability evidence.

The server publishes only the executable quality-management contract: target projects, requirements, validation design and discovery, Assessments, and bounded evidence reads. The exact inventory, resource list, schemas, and MCP safety annotations are generated from the canonical contract. Do not copy tool counts into documentation and do not attempt unavailable roadmap operations.

Clients should use the generated setup capabilities and contract fixture to verify their connection. Reads are annotated as read-only; deterministic replay operations are annotated as idempotent; execution, publication, stop, and decision operations expose their actual mutation and open-world effects.

When a reviewed validation needs one missing locator, use `locator_ensure` with a registered target reference, the exact Quality Plan ID, and an explicit `allowCreate: true` only for the proposed target-owned closure. The coordinator resolves that target reference and requires it to match the plan before any write. Confirm the returned target fingerprint and resource IDs with `locator_search` or the equally target- and Quality Plan-scoped `locator_graph_query`; runtime selector verification is still required before execution.

For the current generated reference and release checks, use the scripts listed in the root `package.json`. Contract drift must be fixed in canonical source before regenerating setup output or scaffold templates.
