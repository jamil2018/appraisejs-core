# Coordinator API and MCP

The coordinator exposes Quality Journey lifecycle operations plus general project, environment, runtime, locator, and
Step Definition operations. Quality Journey is the only Appraise-owned agent quality workflow.

Journey operations are grouped under `quality/journeys/**` in the coordinator API and `quality_journey_*` in MCP.
Every mutation is scoped to an exact target and Journey and remains subject to the Journey's durable review,
authorization, evidence, and closure invariants.

Creation accepts the shared `QualityJourneyRequirement/v1` payload. Objective-only requests remain valid; structured
fields are canonicalized before hashing and persistence. Coordinator connections use
`GET quality/journeys/:journeyId/handoff?target=...` for safe inspection and
`POST quality/journeys/:journeyId/handoff/redeem` for one-time redemption. MCP exposes these as
`quality_journey_handoff_inspect` and `quality_journey_handoff_redeem`. Preparation and local launch remain UI-only
server actions because only the server resolves and launches a registered workspace.

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
