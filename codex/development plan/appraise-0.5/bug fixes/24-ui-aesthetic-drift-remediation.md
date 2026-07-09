# AppraiseJS UI Aesthetic Drift Remediation Plan

## Summary

Complete a second UI alignment pass across AppraiseJS without redesigning the product or erasing its established
character. The accepted visual baseline is the current dark operational workspace: restrained navy and glass
surfaces, subtle borders, compact information density, emerald primary actions, small semantic accents, and desktop
layouts optimized for repeated test-management work.

The Dashboard and Implementation Plans pages are the primary references for the retained style. This plan targets
the remaining drift in responsive navigation, data tables, report details, status indicators, graph authoring,
forms, picker controls, and the command palette. It also establishes enough shared guidance and visual regression
coverage to prevent route-local styling from diverging again.

## Goals

- Preserve the existing Appraise visual identity while bringing older or isolated surfaces back into it.
- Make primary workflows usable at narrow widths without turning dense operational interfaces into card-based mobile
  marketing layouts.
- Keep the existing base form controls where they are already coherent and fix the composition around them.
- Align the command palette with the same density, selection language, and glass treatment as the sidebar.
- Consolidate repeated status styling without creating broad generic CRUD abstractions.
- Verify the result through real browser screenshots, keyboard interaction, focused tests, and scaffold synchronization.

## Non-Goals

- Do not redesign Dashboard, Implementation Plans, or the desktop sidebar.
- Do not replace the dark operational shell with a light theme, flat enterprise theme, or marketing aesthetic.
- Do not globally replace every radius, color utility, card, or route layout through mechanical search-and-replace.
- Do not convert tables into unrelated mobile card feeds.
- Do not move route-local UI into shared components unless a second consumer or a clear behavior boundary justifies it.
- Do not change lifecycle behavior, report semantics, test execution, or authored test data as part of aesthetic cleanup.

## Retained Visual Contract

Implementation should preserve these characteristics:

- Dark navy page background with quiet directional depth.
- Restrained glass or translucent surfaces with subtle white borders.
- Compact controls, table rows, page headers, and navigation items.
- Emerald as the primary command color, with sky, amber, destructive, and muted accents for semantic state.
- Standard controls and cards centered around the existing `0.5rem` radius rather than oversized rounding.
- Shadows used sparingly; borders and surface contrast should carry most hierarchy.
- Icons from Lucide, with explicit accessible names for icon-only actions.
- Desktop operational density preserved even when responsive behavior is added.

Dashboard and Plans should be captured before implementation and treated as comparison references, not cleanup
targets except where a shared primitive change requires a reviewed adjustment.

## Current Findings

### 1. Responsive Navigation

`src/components/navigation/app-sidebar.tsx` renders the full desktop navigation at every viewport width. Below `lg`,
the sidebar becomes a full-width block above the page, so users must traverse the entire navigation before reaching
content. The problem is structural rather than a color or spacing issue.

### 2. Data Tables And Pagination

Reports and other dense tables retain the desktop column set at narrow widths. The existing overflow behavior does not
communicate the intended horizontal interaction clearly, and the report toolbar and shared pagination controls become
compressed. Important identity, state, result, and action information can be clipped or pushed out of view.

### 3. Status Indicators

Report tables, report details, test-case logs, test-run details, and provider surfaces use separate status mappings.
Some use bright solid green or pink badges while others use quiet outlined/tinted treatments. Radius, icon size,
capitalization, and color intensity vary for equivalent states.

### 4. Graph Authoring Surfaces

Step Block authoring wraps the shared flow diagram in a fixed `560px` high, `rounded-xl`, hard-coded zinc container.
Its empty state and Add Node affordance are much larger and more visually isolated than surrounding Appraise controls.
Related Test Case and Template Case graph surfaces have their own shell overrides, so the shared authoring experience
does not yet read as one family.

### 5. Report Detail Composition

Report detail places Configuration and Visualizations in an always-horizontal `flex` row with fixed `420px` card
heights and hard-coded zinc backgrounds. The page duplicates browser, run-status, and result badges locally. The
composition does not collapse cleanly and looks older than the report list and metric cards.

### 6. Form Controls

The base controls in `src/components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `checkbox.tsx`, and
`radio-group.tsx` are already close to the target style: compact height, moderate radius, quiet border, and a
consistent focus ring. They should be retained and refined only when a shared state is demonstrably missing.

The drift is mainly in form composition:

- Test Suite uses rigid `w-2/3`, `lg:w-1/3`, `gap-20`, and `overflow-x-hidden` layout rules.
- Test Run splits Filter Tests and Test Configuration into separate cards and uses an unreliable `lg:w-3/7` width.
- Test Suite, Test Run, Test Case, Template Step, and other forms use different combinations of hard-coded zinc cards,
  tips panels, section headings, field spacing, and action placement.
- Large Quick Tips sidecards compete with the primary task and repeat nearly identical presentation.
- Selects, multi-selects, Browse pickers, and selected-value previews do not yet present as one control family.
- Some action labels and route-local hover states override the shared Button typography and color behavior.

### 7. Command Palette

The sidebar trigger is well aligned with the current shell. The opened palette is not:

- `src/components/ui/command.tsx` removes the dialog border and renders a comparatively flat, opaque blue panel.
- Selected rows are brighter and heavier than the sidebar's active state.
- Palette icons and row padding are larger than the surrounding navigation density.
- Group boundaries and the lower scroll boundary are visually weak.
- At narrow widths the palette sits flush against the viewport edges and top without stable inset or radius treatment.
- Loading, error, empty, and entity-result modes are functional but visually generic.

### 8. Typography Configuration

The root layout imports Inter variables, while `globals.css` declares Arial on `body` and DM Sans tokens elsewhere.
The implementation must identify and preserve the currently accepted rendered typography before removing contradictory
or dead declarations. Typography cleanup must not introduce an unreviewed product-wide visual change.

## Implementation Plan

### Task 1: Record The Visual Contract And Baseline

Document the retained visual rules in the current component organization guidance or a narrowly scoped UI visual
language document. Capture baseline screenshots of Dashboard, Plans, the desktop sidebar, representative cards,
tables, form controls, and status treatments before changing shared primitives.

Acceptance criteria:

- The baseline explicitly names surfaces that should remain visually stable.
- Surface, border, radius, spacing, typography, status, and responsive rules are reviewable in current docs.
- Implementation avoids undocumented global palette or density changes.

Likely files:

- `docs/component-organization-rules.md`
- `src/app/globals.css`

Dependencies: None.

### Task 2: Add A Responsive Navigation Shell

Keep the existing sidebar at `lg` and above. Below that breakpoint, replace the full navigation block with a compact
app bar and a menu-triggered Sheet containing the same navigation sections, command search, active-page state, and
local-first workspace identity.

Acceptance criteria:

- Page content appears in the first viewport at `320px` and `390px`.
- Mobile navigation opens and closes through a familiar icon control.
- Opening moves focus into the Sheet; closing restores focus to the trigger.
- Escape, Tab, Enter, and Space behavior remains correct.
- The desktop sidebar remains visually unchanged at `1024px` and above.
- The existing skip link continues to reach `main#main-content`.

Likely files:

- `src/app/layout.tsx`
- `src/components/navigation/app-sidebar.tsx`
- `src/components/navigation/nav-command.tsx`
- a narrowly scoped mobile navigation component under `src/components/navigation/`

Dependencies: Task 1.

### Task 3: Stabilize Responsive Tables And Pagination

Define an explicit dense-table strategy for narrow widths. Preserve table semantics and desktop density, use a stable
minimum table width with clear horizontal scrolling where all columns matter, keep primary identity and actions
discoverable, wrap toolbars intentionally, and reflow pagination into stable control groups.

Acceptance criteria:

- Reports, Test Runs, Test Suites, and Test Cases have no overlapping controls at `320px` or `390px`.
- Horizontal scrolling is contained within the data surface and does not move the entire page.
- The primary row label, state, and row action remain discoverable.
- Pagination labels and buttons do not clip or force unreadable wrapping.
- Keyboard users can reach horizontally scrolled content and all row actions.

Likely files:

- `src/components/ui/data-table.tsx`
- `src/components/ui/data-table-pagination.tsx`
- `src/components/ui/table.tsx`
- representative route-local table wrappers and column definitions

Dependencies: Task 1.

### Task 4: Normalize Form Composition

Keep the existing base controls and standardize the structures around them. Define small compositional patterns for a
form section, optional guidance panel, responsive form/aside grid, validation message, picker row, and action row.
These may remain route-local where reuse is not established; do not create a generic CRUD form framework.

Acceptance criteria:

- Forms use full-width responsive containers with deliberate `max-width` constraints instead of rigid fractions.
- Guidance content is visually secondary and collapses below or behind a disclosure on narrow screens.
- Labels, descriptions, errors, and field gaps follow one vertical rhythm.
- Save, Start, Continue, Back, and Cancel actions use shared Button variants and consistent alignment.
- Loading, disabled, invalid, read-only, and populated states are visually verified for each base control family.
- No valid form relies on `overflow-x-hidden` to mask layout overflow.

Initial route slices:

1. Test Suite create/modify.
2. Test Run create.
3. Test Case and Template Test Case metadata stages.
4. Template Step, Module, Environment, Tag, and Locator Group forms.

Likely files:

- `src/app/(base)/test-suites/test-suite-form.tsx`
- `src/app/(base)/test-runs/test-run-form.tsx`
- `src/app/(base)/test-cases/test-case-form.tsx`
- `src/app/(base)/template-test-cases/template-test-case-form.tsx`
- route-local forms identified during each vertical slice

Dependencies: Task 1.

### Task 5: Align Picker And Compound Form Controls

Bring Select, MultiSelect, MultiSelectWithPreview, Browse pickers, popovers, and selected-value chips into one visual
family without forcing them into one implementation. Normalize control height, border, placeholder tone, trigger
icon placement, selected-value density, dropdown surface, search field, empty state, and focus behavior.

Acceptance criteria:

- A regular Select, multi-select, and Browse picker have comparable control weight in the same form.
- Selected values do not unexpectedly increase row height or overflow their container.
- Popovers and picker dialogs use the retained glass/border language.
- Empty, loading, error, disabled, and no-selection states remain explicit.
- Browse triggers use compact command language without excessive letter spacing.

Likely files:

- `src/components/ui/select.tsx`
- `src/components/ui/multi-select.tsx`
- `src/components/ui/multi-select-with-preview.tsx`
- `src/components/ui/picker-browse-shell.tsx`
- route-local picker consumers

Dependencies: Task 4.

### Task 6: Restyle The Command Palette

Retain the current command hierarchy and search modes while aligning the dialog with the sidebar and shell. Add a
subtle border and restrained surface depth, reduce row and icon scale, match selected-state contrast to the sidebar,
clarify group boundaries, and add a stable scroll boundary. Use responsive width, viewport insets, and max height.

Acceptance criteria:

- The palette visually belongs to the sidebar at desktop width.
- At `320px` and `390px`, it has deliberate viewport insets or an intentional mobile-sheet treatment.
- The current item is visible without using a bright full-row block that dominates the dialog.
- Navigation and entity-search groups remain scannable with long real data.
- Click, `Cmd/Ctrl+K`, arrows, Enter, Escape, Backspace mode exit, and focus restoration work.
- Loading, error, empty, and populated search modes use consistent Appraise state styling.

Likely files:

- `src/components/navigation/nav-command.tsx`
- `src/components/navigation/command-chain-input.tsx`
- `src/components/navigation/command-badge.tsx`
- `src/components/navigation/entity-search-command.tsx`
- `src/components/ui/command.tsx`
- focused command-palette tests

Dependencies: Tasks 1 and 2.

### Task 7: Consolidate Semantic Status Presentation

Introduce a focused status presentation contract for run state, run result, step state, plan state, and browser engine.
Share presentation data or a small component where it eliminates real duplication, while keeping domain-specific
label mapping near the owning feature.

Acceptance criteria:

- Equivalent states use consistent radius, icon size, label casing, border, tint, and text contrast.
- Status remains understandable without color alone.
- Bright solid pink/green report badges are replaced with restrained semantic treatments.
- Compact table badges and larger detail badges share the same semantic palette without requiring identical size.
- Provider, report, and test-run surfaces do not regress their domain-specific labels.

Initial consumers:

- report table columns
- report detail
- test-case logs modal
- test-run table and detail
- provider-run workspace
- plan status surfaces where the existing treatment is genuinely equivalent

Dependencies: Task 1.

### Task 8: Align Shared Graph Authoring Surfaces

Normalize the Flow Diagram host rather than patching Step Blocks alone. Define shared shell behavior for border,
surface, radius, minimum and responsive height, empty state, toolbar controls, search, and node-add prompts. Allow
route-specific sizing only where the workflow requires it.

Acceptance criteria:

- Step Block, Test Case, and Template Test Case diagrams read as one authoring family.
- The empty state is compact, informative, and does not resemble a large form card inside the canvas.
- Add, zoom, fit, lock, search, save, and related icon controls use consistent sizing and accessible names.
- Canvas height adapts to viewport constraints without collapsing below a usable minimum.
- Mobile users can reach graph controls and metadata fields without incoherent overlap.

Likely files:

- `src/components/diagram/flow-diagram.tsx`
- `src/components/diagram/flow-diagram-view.tsx`
- `src/components/diagram/add-node-prompt-node.tsx`
- `src/components/diagram/flow-diagram-toolbar.tsx`
- `src/app/(base)/step-blocks/step-block-form.tsx`
- graph-host consumers in Test Case and Template Test Case forms

Dependencies: Tasks 1 and 4.

### Task 9: Refactor Report Detail Composition

Recompose report detail with responsive grid tracks, intrinsic content height, tokenized configuration rows, compact
tabs, and the shared status treatment. Preserve all metrics, charts, report data, and row-level evidence behavior.

Acceptance criteria:

- Configuration and Visualizations stack below `xl` and align side by side when space supports it.
- Cards do not depend on unconditional `420px` heights.
- Long environment names and URLs wrap or truncate with an accessible full value.
- Tabs remain usable at narrow widths.
- Metrics, report table, charts, and evidence links retain their existing behavior.

Likely files:

- `src/app/(base)/reports/[id]/page.tsx`
- `src/app/(base)/reports/report-metric-card.tsx`
- report chart wrappers
- report status presentation consumers

Dependencies: Tasks 3 and 7.

### Task 10: Resolve Typography And Residual Route Drift

After the high-impact slices are stable, resolve the contradictory font declarations while preserving the approved
rendered appearance. Sweep remaining settings, provider, run-detail, report-log, alert, and review surfaces for clear
outliers only. Avoid changing intentional high-attention states or interaction-specific shapes without evidence.

Acceptance criteria:

- One explicit sans stack is authoritative and loaded correctly.
- Removing dead font declarations does not materially alter the approved baseline without review.
- Remaining hard-coded zinc, raw semantic colors, fixed dimensions, oversized radii, and shadows are either aligned or
  documented as intentional.
- Plan-review keyboard and semantic improvements from the previous pass remain intact.

Dependencies: Tasks 2-9.

### Task 11: Synchronize Scaffold Sources And Add Regression Coverage

Changes that affect scaffolded applications must originate in root/base source and be synchronized through the
documented template workflow. Add focused behavior tests and a repeatable browser screenshot matrix for representative
routes and states.

Acceptance criteria:

- Root and scaffolded base UI remain aligned after `prepare-template`.
- No generated automation output is patched manually.
- Shared interactive components have focused keyboard, disabled-state, and callback tests.
- Browser screenshots cover seeded content, empty states, dialogs, dropdowns, command search, validation errors, and
  mobile layouts.
- React Doctor reports no new accessibility findings.

Dependencies: Tasks 2-10.

## Implementation Order And Checkpoints

### Phase 1: Foundation And Responsive Access

1. Task 1: visual contract and baseline.
2. Task 2: responsive navigation.
3. Task 3: responsive tables and pagination.

Checkpoint:

- Dashboard and Plans remain visually stable at desktop widths.
- Main content appears before navigation at mobile widths.
- Representative data tables remain operable at all target widths.

### Phase 2: Core Interaction Systems

4. Task 4: form composition.
5. Task 5: picker and compound controls.
6. Task 6: command palette.
7. Task 7: semantic status presentation.

Checkpoint:

- Create Test Suite and Create Test Run demonstrate the approved form pattern.
- Command palette behavior and visual states pass desktop/mobile review.
- Status styling is consistent in report and test-run lists.

### Phase 3: Specialized Workspaces

8. Task 8: graph authoring.
9. Task 9: report detail.
10. Task 10: typography and residual drift.

Checkpoint:

- Graph authoring and report review match the retained shell without losing their specialized workflows.
- No unresolved product-wide typography ambiguity remains.

### Phase 4: Distribution And Release Confidence

11. Task 11: scaffold sync and regression coverage.

Checkpoint:

- Root and scaffold copies are synchronized.
- Focused checks, browser review, static analysis, and build validation are complete.

## Browser Verification Matrix

Verify at `320px`, `390px`, `768px`, `1024px`, and `1440px` where the route supports the state:

- `/`
- `/plans`
- `/reports`
- `/reports/[id]`
- `/test-suites/create`
- `/test-runs/create`
- `/test-runs/[id]`
- `/test-cases/create`
- `/template-test-cases/create`
- `/step-blocks/create`
- `/settings`
- command palette in navigation mode and each entity-search mode

For each representative surface, inspect normal, hover, selected, focused, disabled, loading, error, empty, populated,
and long-content states as applicable. Include keyboard traversal and horizontal-scroll behavior, not screenshots alone.

## Validation Plan

Run focused checks after each task or small task group:

```bash
npx eslint <touched-files>
npx prettier --check <touched-files>
npx vitest run <focused-component-tests>
```

Run the relevant broader checks at phase checkpoints:

```bash
npm run quality:react-doctor
npm run validate:unit
npm --prefix packages/create-appraisejs run prepare-template
npm run graphify:auto
npm run build
```

Run `npm run validate` before release when the environment can execute the full Playwright suite reliably. Preserve
real keyboard operability when test fixtures contain stale focus-order assumptions; update brittle expectations rather
than hiding reachable controls.

## Risks And Mitigations

### Shared Primitive Blast Radius

Changing Card, Command, Select, Table, or Badge can alter many routes. Capture baselines first, prefer additive variants
or narrowly scoped composition changes, and review consumers before changing defaults.

### Accidental Redesign

A broad cleanup can flatten Appraise into a generic component-library demo. Keep Dashboard, Plans, and the desktop
sidebar as references, and require an explicit reason for any change to those surfaces.

### Mobile Over-Simplification

Turning tables and workspaces into unrelated card stacks would lose operational density. Preserve semantic tables and
graph workflows; improve containment, scrolling, and controls instead.

### Scaffold Drift

Root-only UI changes can leave generated apps behind. Follow `docs/scaffold-template-sync.md`, edit canonical root/base
source first, and run the template preparation command before completion.

### Accessibility Regression

Visual changes to selectable rows, dialogs, Sheets, and graph controls can damage focus and semantics. Preserve native
controls where possible and add keyboard tests before changing an established semantic tree.

### Performance Regression

Adding blur to every surface can increase compositing cost. Reuse the current restrained glass treatment, prefer
opaque/tinted surfaces where depth is unnecessary, and do not reintroduce broad backdrop-blur usage.

## Definition Of Done

- All eleven tasks meet their acceptance criteria.
- Dashboard, Plans, and the desktop sidebar retain the approved Appraise style.
- Mobile users reach content immediately through a compact navigation shell.
- Form compositions and compound controls read as one family without a generic CRUD framework.
- The command palette matches the sidebar visually and remains fully keyboard operable.
- Tables, report details, status indicators, and graph authoring are responsive and aesthetically aligned.
- Root and scaffold template sources are synchronized.
- Focused tests, linting, formatting, React Doctor, browser verification, and build checks pass or have documented
  environment-specific limitations.
