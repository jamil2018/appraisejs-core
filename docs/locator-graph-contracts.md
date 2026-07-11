# Locator Graph Contracts

Operational discovery derives the graph read-only from current locator groups and locators. Routes become page
surfaces, groups and locators retain stable source IDs with typed prefixes, and containment edges preserve hierarchy.
Use `GET /api/internal/coordinator/locator-graph`, MCP `locator_graph_query`, or
`appraisejs locator-graph query --from-id <id>`. Page size is capped at 100 and traversal depth at four.

The human projection is available from `GET /api/internal/coordinator/locator-graph/visual` and
`appraise://locator-graph/visual`; it is derived from the same graph and does not become a second source of truth.

`src/lib/locator-graph` defines the versioned read contract for progressive locator discovery. It models application,
global, and page surfaces; components; states; locator groups; locator descriptors; and compatibility edges.

The canonical graph is structured data. `locatorGraphVisualProjection` derives the human visualization payload from
that same graph, so visual and agent-facing views cannot become independent authorities. Query contracts cap pages at
100 nodes and traversal depth at four. The read-only persistence projection and HTTP, MCP, and CLI adapters consume
these schemas directly; mutation and AST compatibility compilation remain later-phase work.
