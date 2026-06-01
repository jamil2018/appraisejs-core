# n8n-Style Flow Node Redesign

## Summary
Redesign the shared root app flow node only, then sync templates from the root source. Do not hand-edit `templates/*` or `packages/create-appraisejs/templates/*`.

## Key Changes
- Update the root `OptionsHeaderNode` card to an n8n-like layout:
  - Top action row with outline `Edit` and `Delete` buttons.
  - Main body with a large step icon and node title.
  - Bottom Gherkin section with the full statement.
  - Parameter chips showing `name: value`, ordered by `order`; omit the chip row when no params exist.
- Keep current behavior unchanged:
  - `Edit` opens the existing node edit sheet.
  - `Delete` removes the node from React Flow state.
  - Left/right handles and first-node target-handle logic remain unchanged.
- Use existing primitives:
  - `Button` for outline actions.
  - `Badge` for chips.
  - Existing `KeyToIconTransformer` for the large icon.
- Treat missing mandatory params as a visual warning state using destructive border/tint, not a full red card fill.
- Adjust node width and initial spacing only if larger cards overlap in the flow canvas.

## Template Sync
- Make code changes only in the root app source files under `src/`.
- After root verification passes, run:
  - `npm run sync-template` to copy root app changes into `templates/starter`.
  - `npm --prefix packages/create-appraisejs run sync-templates` to refresh bundled starter/blank templates from `templates/*`.
- Review the generated template diffs, but do not manually patch them unless a sync-script bug is discovered.

## Test Plan
- Add or extend a focused `OptionsHeaderNode` component test covering:
  - Large icon/title rendering.
  - Gherkin footer rendering.
  - Param chips with names and values.
  - Outline edit/delete buttons.
  - Edit callback with node id.
  - Delete removes the node.
  - Missing-param warning still renders content.
- Run focused diagram tests, then `npm run lint`.
- After sync scripts, confirm generated template diffs only mirror root changes plus expected sync-script output.

## Assumptions
- The redesign applies to the shared flow node used by test case and template test case diagrams.
- Root `src/*` is the source of truth; template directories are generated/synced artifacts for this change.
