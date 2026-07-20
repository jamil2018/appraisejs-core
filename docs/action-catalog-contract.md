# Action Catalog Compatibility Contract

> Deprecated authoring surface: use the canonical operation catalog in `docs/operation-catalog-contract.md`. These
> action APIs remain bounded compatibility aliases for older clients.

The action catalog is a versioned, read-only projection of the canonical operation registry. It does not own
definitions, validation compilation, or runtime behavior.

Compatibility contract code lives in `src/lib/action-catalog`. `defaultActionCatalog` derives categories and
descriptors from `defaultOperationRegistry`; adding definitions here is prohibited.

Discovery is progressive:

1. `listCategories(parentCategoryId?, knownCatalogHash?)` returns compact category summaries. A matching known hash
   returns `unchanged` without repeating the catalog. Category action counts include actions in descendant categories.
2. `listActions(filter?, cursor?, limit?)` returns deterministic ID/version-ordered summaries and a bounded numeric
   cursor. Exact filters support category, capability, input type, runtime, deprecation state, and ID prefix.
3. `readActions(refs)` returns complete descriptors, including inputs, outputs, requirements, examples, deprecation,
   replacement, and descriptor hash. Callers must provide a version when an ID has multiple versions.

The compatibility contract version is `1`. Limits are between 1 and 100. The default catalog projects every
agent-supported canonical operation.

Operational adapters use the same canonical catalog:

- HTTP: `GET /api/internal/coordinator/actions/categories`, `/actions`, and `/actions/read`.
- MCP: resources `appraise://actions/catalog` and `appraise://actions/category/{categoryId}`; tools
  `action_categories_list`, `actions_list`, and `actions_read`.
- CLI: `appraisejs actions categories`, `appraisejs actions list`, and `appraisejs actions read <id@version...>`.

These surfaces are read-only and do not mutate validation ASTs or existing authored tests.
