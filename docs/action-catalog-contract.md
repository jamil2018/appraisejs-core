# Action Catalog Contract

The action catalog is a versioned, read-only discovery contract. It does not change existing validation authoring or
select an action for an agent.

Canonical contract code lives in `src/lib/action-catalog`. Catalog definitions contain categories and versioned action
descriptors. Construction validates category, replacement, and `(id, version)` references, then calculates stable
SHA-256 hashes independent of definition order.

Discovery is progressive:

1. `listCategories(parentCategoryId?, knownCatalogHash?)` returns compact category summaries. A matching known hash
   returns `unchanged` without repeating the catalog. Category action counts include actions in descendant categories.
2. `listActions(filter?, cursor?, limit?)` returns deterministic ID/version-ordered summaries and a bounded numeric
   cursor. Exact filters support category, capability, input type, runtime, deprecation state, and ID prefix.
3. `readActions(refs)` returns complete descriptors, including inputs, outputs, requirements, examples, deprecation,
   replacement, and descriptor hash. Callers must provide a version when an ID has multiple versions.

The initial contract version is `1`. Limits are between 1 and 100. The default catalog projects the shared browser
navigation, mouse, form, wait, and assertion behaviors supported by the runtime step library.

Operational adapters use the same canonical catalog:

- HTTP: `GET /api/internal/coordinator/actions/categories`, `/actions`, and `/actions/read`.
- MCP: resources `appraise://actions/catalog` and `appraise://actions/category/{categoryId}`; tools
  `action_categories_list`, `actions_list`, and `actions_read`.
- CLI: `appraisejs actions categories`, `appraisejs actions list`, and `appraisejs actions read <id@version...>`.

These surfaces are read-only and do not mutate validation ASTs or existing authored tests.
