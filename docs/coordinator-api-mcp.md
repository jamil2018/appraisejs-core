# Coordinator API and MCP

The coordinator exposes Quality Journey lifecycle operations plus general project, environment, runtime, locator, and
Step Definition operations. Quality Journey is the only Appraise-owned agent quality workflow.

Journey operations are grouped under `quality/journeys/**` in the coordinator API and `quality_journey_*` in MCP.
Every mutation is scoped to an exact target and Journey and remains subject to the Journey's durable review,
authorization, evidence, and closure invariants.

`locator_search`, `locator_graph_query`, and `locator_ensure` accept `journeyId`. The coordinator verifies that
the Journey belongs to the requested target before reading or writing locator resources. `step_search` remains
generally available and may record optional Journey-bound search evidence.

Independent Test Runs use authored snapshots only. They are non-authoritative diagnostics and cannot be promoted into
Journey evidence.

The former requirement-analysis, validation-design, Quality Plan, Assessment, remote evaluation scope, legacy
execution-consent, methodology, certification, and compatibility operation families have been removed. Their API
paths, MCP tools, resources, schemas, exports, and projectors return ordinary not-found behavior and have no aliases.
The generated operation fixture and [operation reference](generated/coordinator-operation-reference.md) are the
machine-checked public inventory.
