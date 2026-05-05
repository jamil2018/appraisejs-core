# Flow Builder Node Search

## Summary
Add node-label search to the test case flow builder in the base app, then propagate template copies with the existing sync scripts. The UI will expose a search icon beside the add-node button, animate the input and suggestions panel, support label-only matching after 3+ characters, and open the existing node settings sheet when a suggestion is selected.

## Implementation Changes
- Update the shared flow UI in `src/components/diagram/flow-diagram.tsx`, but gate it with a prop such as `enableNodeSearch`; pass `enableNodeSearch` only from `src/app/(base)/test-cases/test-case-flow.tsx` so template test case flows are not changed unless explicitly opted in.
- Add a top-right control group: search icon button to the left of the existing add-node button, animated input using `AnimatePresence`/`motion`, and close-on-click-elsewhere within the flow builder via a container pointer handler that ignores clicks inside the search control/panel.
- Search only real flow nodes, only by `node.data.label`, case-insensitively. Show the suggestion panel only when trimmed query length is at least 3; include a compact empty state if no labels match.
- On suggestion click: set the matched node as the active highlighted node, pan/focus React Flow to it using the React Flow instance, and reuse the existing edit-node path so the node settings `Sheet` opens with that node’s data.
- Extend `OptionsHeaderNode` data with an optional `isSearchHighlighted` flag and render the emerald-500 soft glow/ring without affecting existing missing-param and first-node styling.

## Tests
- Add focused unit tests for search matching helper behavior: ignores add-node prompt nodes, matches labels only, is case-insensitive, requires 3+ characters, and returns no gherkin/parameter matches.
- Add/extend component tests for `FlowDiagram` with mocked React Flow and `NodeForm`: search button reveals input, <3 characters hides suggestions, matching suggestions render at 3+ characters, outside flow clicks close the input, and clicking a suggestion opens edit settings and calls the mocked pan/focus method.
- Extend `OptionsHeaderNode` tests to assert highlighted nodes receive the search-highlight marker/classes while existing missing-param/start-node classes still render.

## Propagation And Verification
- Modify only base source first.
- Run `npm run sync-template`, then `npm --prefix packages/create-appraisejs run sync-templates` to propagate generated template copies.
- Run targeted Vitest files for the flow/search changes, then `npm run validate` if feasible.
- Run fallow quality check with the required skill format, for example:
  `npx fallow audit --base HEAD --format json --quiet --explain 2>/dev/null || true`

## Assumptions
- “Node settings sidebar” maps to the existing right-side `NodeForm` `Sheet` in edit mode.
- Search is enabled for the test case form flow only, not template test case flows, unless a later request broadens the scope.
- The highlight remains visible after selecting a result until another result is selected, the node is deleted, or flow state reinitializes.
