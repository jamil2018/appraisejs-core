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

AppraiseJS uses a dark graphite palette. The Journey brief, a populated Test Cases table, and a Run Report are the
reference screens for form, table, and report density. Use shared semantic tokens for solid canvas, panels, fields,
borders, text, focus, and interaction states. Use a saturated blue fill with dark text for the main action. Use blue markers for navigation,
keyboard focus, selection, and active or informational states. Use vivid emerald for confirmed success, amber for
attention or decisions, and coral red for failures and destructive actions. Use solid tinted fills on actionable
warnings and failures. Use distinct chart colors with readable data labels or summaries.

- Use solid surfaces and dividers for the desktop rail and its second pane. Use `app-glass` for the mobile header
  and raised overlays. It owns the translucent fill, edge highlight, and
  backdrop blur, with an opaque fallback for increased contrast, reduced transparency, forced colors, and browsers without
  blur.
  Give each overlay one material surface. Use solid fills within content.
- Use system sans for product text and the shared monospace stack for code, IDs, and logs. Use the 4px spacing grid,
  32px compact and 36px standard controls, 44px mobile navigation targets, 8px control corners, and 12px panel corners.
  Standard panels use 24px padding and compact panels use 16px.
- Appraise owns the wrappers in `src/components/ui`. Use Base UI for interaction semantics and compose custom triggers
  through `render`. Use shared variants and tokens for state, emphasis, and density. Give buttons explicit submit intent
  and source Select labels from option data so closed controls display the saved label on first render.
- Keep the icon-only app rail and the context pane visible at `lg` and wider. Give rail icons accessible names and
  hover and focus tooltips. Keep branding and actions above the independently scrolling list. Below `lg`, use the mobile navigation shell so content starts
  in the first viewport; Sheet/Dialog controls must retain native focus trapping, Escape dismissal, and trigger focus
  restoration.
- Use the shell's padded content column for page headers and primary workspace surfaces, including on wide displays.
  Keep local width limits for readable prose, compact controls, and secondary guidance. Use 16px between major
  sections in dense workspaces.
- Keep the page heading visible when a collection is empty. Place the next action in a compact panel directly below it.
- For data tables, preserve table semantics and use a contained, keyboard-focusable horizontal scroll surface with a
  stable minimum width. Name scroll regions for the content they contain and row action menus for the record they
  operate on. Keep search, view controls, and actions on one toolbar when they fit. Let toolbars and pagination wrap
  as needed while containing horizontal overflow in the table.
- Keep picker search and footer actions reachable in short viewports. Let the results area scroll within the overlay
  so users can reach pagination while keeping the commit and cancel controls in view.
- Compose forms as responsive content-and-guidance grids. Use full-width primary cards with a deliberate max-width or
  grid track, and keep optional guidance secondary or below the primary task on narrow screens. Do not use
  `overflow-x-hidden` to conceal a form layout problem.
- Align the Journey brief and detail panels to the app content edges. Keep explanatory prose readable within the
  panel and use compact padding and spacing around the current action.
- Selects, multi-selects, Browse controls, and popovers should share compact control height, quiet borders, muted
  placeholders, visible focus outlines, and the shared overlay material. Selected values must wrap safely
  without forcing unexpected page overflow.
- Status labels must remain readable without color alone. Use the shared semantic status treatment for equivalent
  success, failure, warning, informational, and neutral states. Keep domain-specific mapping close to the feature,
  with text, icons, or visible markers that identify the same meaning without hue.
- Keep normal text at least 4.5:1 against its rendered surface. Keep any essential focus, selection, or control
  boundary at least 3:1 against adjacent areas. Use the input border token for fields and controls that need a
  boundary. Use the quieter structural border token for dividers and panel edges. Preserve contrast in open,
  selected, and focused states.
- Graph hosts should use the same solid graphite canvas, compact empty prompt, responsive minimum height, and
  labelled icon controls. Route-specific graph sizing is acceptable only when the workflow requires it.
- Shared primitives should be changed only with representative route checks. For visual changes, capture the
  Dashboard, Journey brief, sidebar, a dense table, a run report, and the changed interactive state before and after the change.

## Test-case authoring projections

Test-case and template-test-case forms keep one ordered exact `StepInvocation` flow as their domain state. The graph
is the default authoring projection; Linear is an explicit alternative for keyboard-oriented sequential work. Do not
add a view-specific reducer, persistence shape, or Template Step compatibility field. Shared authored-flow operations
own invocation construction, input mutation, ordering, and Gherkin presentation so changing views cannot lose node
identity, exact references, inputs, or flow-block membership.
