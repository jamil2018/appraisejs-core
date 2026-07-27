# Component Organization Rules

These rules are the working baseline for Appraise UI refactors.

## Placement

- Keep route-specific UI in `src/app/(base)/<entity>` by default.
- Move a component into `src/components/<feature>` after evidence shows multiple real consumers, an independently
  testable responsibility, or repeated state and error behavior. A single route may still extract a focused child or
  hook when that responsibility is independently coherent.
- Keep low-level controls and wrappers in `src/components/ui`.
- Do not let shared components import route-local actions, route-local types, or route-specific navigation assumptions.

## File Shape

- Route folders should stay consistent: `page.tsx`, `<entity>-form.tsx`, `<entity>-table.tsx`, `<entity>-table-columns.tsx`, plus narrowly named local helpers such as `helpers.ts`, `types.ts`, or `<entity>-form-helpers.ts`.
- Prefer domain names over abstract names. Use `tag-form-helpers.ts`, not `shared-form-utils.ts`.
- Keep each file focused on one concern: presentation, local interaction state, or async orchestration.

## Extraction Rules

- Extract a child component when the split is mostly visual and prop-driven.
- Extract a hook when the split owns lifecycle, async orchestration, or state transitions.
- Extract helpers for pure mapping, payload shaping, formatting, and validation.
- Do not build catch-all CRUD frameworks, speculative generic layers, or pass-through wrappers to normalize small
  forms. Prefer a small domain-named abstraction only after concrete duplication establishes its contract.

## Testing

- Co-locate tests with the code they protect.
- Shared interactive components need behavior tests for labels, keyboard paths, disabled states, and callback contracts.
- Route-local forms need at least one happy-path submit test and one validation or failure-path test.

## Review Checklist

- Non-trivial components have named `Props` types.
- No new `any`, `React.FC`, or unchecked `as unknown as`.
- Effects have one responsibility and clean up after themselves.
- Derived data stays derived instead of being copied into mirrored state.
- Icon-only actions expose accessible labels.

## Visual Language Contract

Dashboard, Implementation Plans, and the desktop sidebar are the visual references for operational AppraiseJS work.
Route work should preserve their dark navy depth, restrained translucent surfaces, compact density, subtle white
borders, `0.5rem` control radius, and emerald primary action language. Do not mechanically replace route styles or
turn dense tables into card feeds at small widths.

- Use Inter through the root layout as the authoritative sans stack. Keep typography compact and semantic rather than
  using route-local font families or heading-like labels for ordinary content.
- Keep `lg` and wider navigation as the desktop sidebar. Below `lg`, use the mobile navigation shell so content starts
  in the first viewport; Sheet/Dialog controls must retain native focus trapping, Escape dismissal, and trigger focus
  restoration.
- For data tables, preserve table semantics and use a contained, keyboard-focusable horizontal scroll surface with a
  stable minimum width. Toolbars and pagination may wrap; the page itself must not gain horizontal overflow.
- Compose forms as responsive content-and-guidance grids. Use full-width primary cards with a deliberate max-width or
  grid track, and keep optional guidance secondary or below the primary task on narrow screens. Do not use
  `overflow-x-hidden` to conceal a form layout problem.
- Selects, multi-selects, Browse controls, and popovers should share compact control height, quiet borders, muted
  placeholders, visible focus rings, and translucent bordered overlay surfaces. Selected values must wrap safely
  without forcing unexpected page overflow.
- Status labels must remain readable without color alone. Use the shared semantic status treatment for equivalent
  success, failure, warning, informational, and neutral states; keep domain-specific mapping close to the feature.
- Graph hosts should use the same bordered navy canvas family, compact empty prompt, responsive minimum height, and
  labelled icon controls. Route-specific graph sizing is acceptable only when the workflow requires it.
- Shared primitives should be changed only with representative route checks. For visual changes, capture the
  Dashboard, Plans, sidebar, a dense table, a form, and the changed interactive state before and after the change.

## Test-case authoring projections

Test-case and template-test-case forms keep one ordered exact `StepInvocation` flow as their domain state. The graph
is the default authoring projection; Linear is an explicit alternative for keyboard-oriented sequential work. Do not
add a view-specific reducer, persistence shape, or Template Step compatibility field. Shared authored-flow operations
own invocation construction, input mutation, ordering, and Gherkin presentation so changing views cannot lose node
identity, exact references, inputs, or flow-block membership.
