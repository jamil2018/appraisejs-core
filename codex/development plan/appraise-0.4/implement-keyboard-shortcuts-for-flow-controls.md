# Flow Builder Keyboard Shortcuts

## Summary
Add scoped keyboard shortcuts to the shared `FlowDiagram` experience so test case flow builders can open node search, toggle block selection mode, and open the add-node sheet without affecting the rest of the form. The shortcuts will only fire after the user has interacted with/focused the flow builder and while no local flow overlay is open.

## Key Changes
- Add a small shortcut layer in `src/components/diagram`:
  - `Ctrl/Cmd + Shift + S`: open/focus node search when node search is enabled.
  - `Ctrl/Cmd + Shift + B`: toggle block selection mode when node grouping is enabled.
  - `Ctrl/Cmd + Shift + C`: open the add-node sheet.
- Track “flow builder is active” inside `FlowDiagram`/`useFlowDiagram` by marking the diagram root active on pointer/focus within the flow panel and inactive when focus/pointer moves outside.
- Gate shortcut handling so it does nothing when:
  - the flow builder is not the active panel,
  - the add/edit node sheet is open,
  - the block create/rename dialog is open,
  - the event target is an input, textarea, select, contenteditable element, or already handled event,
  - the relevant feature is disabled.
- Prevent browser/default shortcut behavior only after the event passes all gates and the flow action will run.
- Keep this in the shared diagram layer so both test case and template test case flow builders inherit the behavior consistently.

## Tooltip and UI Updates
- Update toolbar tooltip content to include shortcut hints using the existing `Kbd`/`KbdGroup` component.
- Search tooltip:
  - Closed state: `Search nodes` plus `Ctrl/Cmd Shift S`.
  - Open state: `Close search` plus the same hint.
- Block mode tooltip:
  - In exploration mode: `Create block` plus `Ctrl/Cmd Shift B`.
  - In selection mode: `Selection mode` plus the same hint.
- Add-node tooltip:
  - `Add Node` plus `Ctrl/Cmd Shift C`.
- Use platform-aware copy: show `⌘` on macOS and `Ctrl` elsewhere, matching existing command palette behavior.

## Tests
- Extend `src/components/diagram/flow-diagram.test.tsx` with keyboard behavior tests:
  - shortcuts do nothing before the flow builder is activated,
  - activating the flow builder then pressing `Ctrl+Shift+S` opens/focuses search,
  - `Meta+Shift+S` also works for macOS-style events,
  - `Ctrl+Shift+B` toggles block selection mode when grouping is enabled,
  - `Ctrl+Shift+C` opens the add-node sheet,
  - shortcuts are ignored while node sheet or block dialog is open,
  - shortcuts are ignored from editable targets.
- Add tooltip assertions for the visible shortcut hints on the three toolbar actions.
- Run focused validation:
  - `npx vitest run src/components/diagram/flow-diagram.test.tsx`
  - `npx eslint src/components/diagram/flow-diagram.tsx src/components/diagram/use-flow-diagram.ts src/components/diagram/flow-diagram-toolbar.tsx src/components/diagram/flow-diagram-node-search.tsx`
  - `npx prettier --check` on touched files.

## Assumptions
- “Sidebar or overlays” refers to the flow builder’s local add/edit node sheets and block dialog, not the persistent app navigation shell.
- `Ctrl/Cmd + Shift + C` should open the generic add-node sheet, not the selected-node inline add prompt.
- `Ctrl/Cmd + Shift + S` should open and focus search; if search is already open, it should keep/focus it rather than close it, because the request names the shortcut as “for search” rather than “toggle search.”
