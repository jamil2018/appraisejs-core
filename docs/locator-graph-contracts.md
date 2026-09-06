# Locator Graph Contracts

Operational discovery derives the graph read-only from current locator groups and locators. Routes become page
surfaces, groups and locators retain stable source IDs with typed prefixes, and containment edges preserve hierarchy.
Use `GET /api/internal/coordinator/locator-graph`, MCP `locator_graph_query`, or
`appraisejs locator-graph query --from-id <id>`. Page size is capped at 100 and traversal depth at four.

Journey-bound discovery uses `locator_search` with both the registered target reference and `journeyId`. It is bounded
and cursor-paginated, and matches locator name and selector plus group, module, and route labels only after target
visibility filtering after verifying the Journey target. `locator_graph_query` requires a concrete `fromId`; absent optional traversal fields are treated
as omitted rather than literal `null` values.

`locator_search` is the compact-binding boundary: its top-level `id` is the canonical persistent locator ID and its
nested `group.id` is the canonical persistent locator-group ID. Those IDs can be reused verbatim in
`validationBindings[].locatorIds` and locator-valued Step inputs. It also retains `persistentId` for compatibility and
returns graph-only aliases separately as `presentationId` (`locator_<id>` and `group_<id>`). The aliases remain for
`locator_graph_query` traversal and must not be used as compact binding identifiers.

The human projection is available from `GET /api/internal/coordinator/locator-graph/visual` and
`appraise://locator-graph/visual`; it is derived from the same graph and does not become a second source of truth.

`src/lib/locator-graph` defines the versioned read contract for progressive locator discovery. It models application,
global, and page surfaces; components; states; locator groups; locator descriptors; and compatibility edges.

The canonical graph is structured data. `locatorGraphVisualProjection` derives the human visualization payload from
that same graph, so visual and agent-facing views cannot become independent authorities. Query contracts cap pages at
100 nodes and traversal depth at four. The read-only persistence projection and HTTP, MCP, and CLI adapters consume
these schemas directly; mutation and AST compatibility compilation remain later-phase work.
