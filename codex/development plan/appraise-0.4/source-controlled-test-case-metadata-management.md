# Source-Controlled Test Case UI Metadata

## Summary
Add a source-controlled sidecar file beside each generated feature file, e.g. `automation/features/<module>/<suite-key>.appraise.json`. The `.feature` file remains the executable Cucumber artifact; the sidecar carries AppraiseJS UI metadata that Gherkin cannot represent: test-case title snapshots, stable node ids, node labels/titles, and flow block grouping.

Metadata sidecars must be created, updated, moved, regenerated, and deleted through the same projection paths that manage feature files.

## Key Changes
- Add a versioned sidecar schema:
  - `version: 1`
  - `testSuite: { name, modulePath }`
  - `testCases: [{ identifierTag, title, description, nodes, flowBlocks }]`
  - `nodes: [{ nodeId, order, label }]`
  - `flowBlocks: [{ id, name, order, nodeIds }]`
- Update feature projection so `generateFeatureFile` writes both:
  - `<suite-key>.feature`
  - `<suite-key>.appraise.json`
- Include sidecar generation data from DB:
  - `TestCase.title`, `description`, identifier/filter tags
  - `TestCaseStep.flowNodeId`, `order`, `label`
  - `TestCaseFlowBlock.id`, `name`, `order`, `nodes.flowNodeId`
- Update all feature lifecycle paths:
  - test case create/update/delete regenerates affected suite feature and metadata
  - test suite rename/delete regenerates or deletes feature and metadata
  - module rename/move/path-dependent regeneration moves or recreates feature and metadata
  - full feature regeneration clears/rebuilds both feature files and sidecars
- Update FS -> DB sync:
  - load adjacent sidecar metadata when present
  - match metadata entries by `@tc_...`
  - sidecar title/description and node labels win over parsed scenario text
  - Gherkin remains the source for executable step text/order/template matching
  - missing sidecar falls back to current `.feature`-only behavior without deleting local block state
  - malformed sidecar reports a warning/error and skips metadata application for affected cases
- Update pending sync counts to detect mismatches in sidecar-backed title, node label/id, and flow block state.
- Keep Prisma schema unchanged.

## Missing Metadata Behavior
- If no sidecar exists, sync test cases from Gherkin exactly as today.
- For existing DB test cases, do not delete local `flowBlocks` merely because metadata is missing.
- For newly created DB test cases with no sidecar, create no blocks and derive labels from Gherkin text.
- If sidecar block nodes reference missing node ids, skip invalid memberships and report a warning.

## Test Plan
- Unit test metadata serialization for title, nodes, and blocks.
- Unit test metadata parsing, missing-sidecar fallback, and malformed-sidecar handling.
- Unit test projection lifecycle:
  - test case create/update writes sidecar
  - test case delete removes case metadata from sidecar
  - suite delete removes both `.feature` and `.appraise.json`
  - full regeneration rebuilds both artifacts
- Unit test FS -> DB sync applies sidecar node labels, stable node ids, titles, and blocks.
- Unit test pending counts include metadata mismatches.
- Run:
  - `npx vitest run <changed test files>`
  - `npx eslint <changed files>`
  - `npx prettier --check <changed files>`

## Assumptions
- Sidecar JSON is the chosen v1 source-control format.
- Visual canvas layout state remains out of scope.
- Metadata sidecars are projection-managed artifacts and should not be hand-edited as the primary workflow.
