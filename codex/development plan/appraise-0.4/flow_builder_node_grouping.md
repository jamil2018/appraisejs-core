# Flow Builder Grouping Plan

## Summary

Add persisted node grouping to the shared React Flow builder for both test cases and template test cases. Users can toggle into selection mode, lasso-select nodes, create a named block, then rename or delete that block. Blocks are visual organization only: they do not affect execution order, generated Gherkin, or node settings.

## Schema & Interfaces

- Add stable `flowNodeId` fields to `TestCaseStep` and `TemplateTestCaseStep`; migrate existing rows with `flowNodeId = id`.
- Add persisted block tables for both flows:
  - `TestCaseFlowBlock` + `TestCaseFlowBlockNode`
  - `TemplateTestCaseFlowBlock` + `TemplateTestCaseFlowBlockNode`
- Store block membership by stable `flowNodeId`, not transient step-row IDs.
- Extend form schemas and submit payloads with:
  - step `nodeId`
  - `flowBlocks: { id: string; name: string; nodeIds: string[] }[]`
- Extend shared diagram props with `enableNodeGrouping`, `flowBlocks`, and `onFlowBlocksChange`.
- Carry template block metadata into created test cases during template-to-test-case conversion.

## Implementation Changes

- Keep edits in base source only, then propagate with `npm run sync-template` and `npm --prefix packages/create-appraisejs run sync-templates`.
- Add an icon toggle beside search/add controls:
  - Exploration mode is default and preserves current behavior.
  - Selection mode disables canvas panning and enables React Flow lasso selection.
- On selection release with at least two real nodes, show a small context menu with `Create block`.
- Creating a block opens a naming dialog; confirmed blocks render as transparent labeled boundaries behind the selected nodes.
- Add block label actions for `Rename` and `Delete`.
- Enforce clean topology rules:
  - While any block exists, disable node-order/topology mutations: add node, add connected node, delete node, add edge, remove edge, reconnect edge.
  - Show disabled tooltips or toasts telling users to remove blocks before changing flow structure.
  - Node detail editing remains permitted.
  - Block rename/delete remains permitted.
- Block membership is otherwise stable and keyed by node IDs; deleting a block removes only the visual grouping, never nodes.
- Memoize node lookup maps, block membership maps, and computed block bounds to keep pointer and render work light.

## Test Plan

- Unit/helper tests:
  - block bounds ignore prompt/missing nodes
  - block payload normalization preserves stable node IDs
  - scenario step builders include `nodeId`
  - route helpers reconstruct blocks from persisted rows
- Component tests:
  - mode toggle defaults to exploration and changes icon/label in selection mode
  - selection mode sets React Flow lasso props and disables pan
  - selection release opens create-block menu
  - create, rename, and delete update `onFlowBlocksChange`
  - topology controls are blocked while blocks exist, but node edit remains available
- Service/action tests:
  - create/update test cases persist steps, `flowNodeId`, blocks, and memberships
  - create/update template test cases persist the same block structure
  - template conversion preserves block memberships
- Verification:
  - `npx prisma validate`
  - focused `npx vitest run ...`
  - sync scripts
  - focused tests again after sync
  - `fallow audit --format json --quiet --explain 2>/dev/null || true`

## Assumptions

- Grouping is enabled for both test-case and template-test-case builders.
- V1 includes create, display, rename, and delete.
- Duplicate block names are allowed.
- Blocks are organizational overlays only.
- Users must delete existing blocks before changing flow topology or node order.
