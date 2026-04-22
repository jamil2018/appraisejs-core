# Enhance Template Step Selector in Node Form

## Summary
Upgrade the node-form template-step selector from plain text rows to rich, metadata-driven option cards while keeping the current searchable combobox flow and group headings.

No backend or DB changes are needed: the core app already returns each step’s `icon`, `description`, `parameters`, and `templateStepGroup`. Implement in the root app only, then propagate through the existing template prep/sync flow instead of editing any generated template copies directly.

## Key Changes
- Update [src/components/diagram/template-step-combobox.tsx](/Users/hasnat/Projects/appraisejs/src/components/diagram/template-step-combobox.tsx) to render each dropdown option as a richer row:
  - leading icon using `KeyToIconTransformer`
  - highlighted step name as the primary text
  - muted description below it, with a fallback like `No description provided` only if the current UI needs a non-empty second line
  - parameter chips from the existing `parameters` relation, showing parameter names and wrapping to multiple lines as needed
- Keep template-step group headings as section headers in the dropdown, but make them visually secondary to the option cards.
- Upgrade the closed trigger to a richer selected-state preview:
  - show the selected step icon and emphasized name
  - keep the trigger compact enough to fit the sheet layout
  - if a second line is included, use the step description in muted text and clamp it
- Preserve current interaction behavior:
  - same open/close mechanics, focus handling, keyboard escape, and selection flow
  - same hidden input contract used by `node-form`
- Improve search relevance in the combobox:
  - continue matching by step name
  - also include description, group name, and parameter names via `cmdk` keywords so richer metadata remains discoverable
- Keep changes surgical and local to the selector unless a tiny shared helper is clearly justified. No edits should be made directly in `templates/**` or `packages/create-appraisejs/templates/**`.

## Implementation Notes
- Reuse existing primitives and styling vocabulary already present in the repo:
  - icon mapping from `src/lib/transformers/key-to-icon-transformer.tsx`
  - chips/badges from the existing `Badge` component
- Stay within the existing sheet width in `node-form`; avoid row designs that require horizontal scrolling.
- Favor readable hover/selected states over decorative changes. A good default is:
  - slightly taller option rows
  - subtle bordered/rounded card treatment on hover/selection
  - muted group headings
- Optional polish worth including if it stays small:
  - show a lightweight group/count cue in the heading
  - add a compact `+N` overflow badge only if a step has an unusually large number of params and the row becomes noisy
- Propagation workflow after the core change:
  1. Run the root-to-template prep flow with [packages/create-appraisejs/scripts/prepare-template.ts](/Users/hasnat/Projects/appraisejs/packages/create-appraisejs/scripts/prepare-template.ts).
  2. Let that script regenerate `templates/starter`, derive `templates/blank`, then sync both into `packages/create-appraisejs/templates/*`.
  3. Do not hand-edit duplicated template files.

## Public Interfaces / Types
- No API or schema changes.
- No service-layer response changes expected.
- Existing selector props can remain stable unless a tiny internal helper type is added for display formatting.

## Test Plan
- Add a dedicated component test for the combobox, covering:
  - grouped rendering still appears
  - each option shows icon, name, description, and parameter chips
  - search matches on metadata beyond the step name
  - selected trigger shows the richer preview after choosing a step
- Keep the existing `node-form` tests intact unless a selector prop/ARIA change requires a small mock adjustment.
- After implementation, run the relevant Vitest coverage for:
  - the new combobox test
  - `src/components/diagram/node-form.test.tsx`
  - any affected template-flow/node-form tests
- Run the template propagation script and verify the generated template copies pick up the selector update.
- If feasible, do one manual UI pass in the Add Node sheet to confirm spacing, wrapping, and keyboard interaction.

## Assumptions
- “Step params as chips” means parameter names rendered as chips; types are not required in the selector UI.
- Group headings should remain.
- The closed trigger should use the richer selected preview, not stay as plain text.
- Current test execution in this workspace is blocked before running UI tests because `@testing-library/react` cannot resolve `@testing-library/dom`; implementation should restore that dependency path or otherwise fix the local test environment before claiming verification is complete.
