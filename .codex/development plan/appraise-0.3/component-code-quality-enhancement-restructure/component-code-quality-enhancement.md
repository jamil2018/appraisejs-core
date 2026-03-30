# Appraise Component Layer Quality And Organization Plan

## Summary

- This pass covers both shared components in `src/components` and feature-heavy client components in `src/app/(base)` and `src/app/(dashboard-components)`, because Appraise currently splits UI responsibilities across both areas.
- The repo is already partway organized by domain: route folders under `src/app/(base)` often contain `*-form.tsx`, `*-table.tsx`, and `*-table-columns.tsx`, while `src/components` contains shared UI, feature widgets, and some route-adjacent logic. The plan should tighten that pattern rather than replace it.
- Current high-risk work is concentrated in a small set of large client components: [test-run-details.tsx](/Users/hasnat/Projects/appraise/src/components/test-run/test-run-details.tsx), [log-viewer.tsx](/Users/hasnat/Projects/appraise/src/components/test-run/log-viewer.tsx), [nav-command.tsx](/Users/hasnat/Projects/appraise/src/components/navigation/nav-command.tsx), [flow-diagram.tsx](/Users/hasnat/Projects/appraise/src/components/diagram/flow-diagram.tsx), [create-locator-workspace.tsx](</Users/hasnat/Projects/appraise/src/app/(base)/locators/create/create-locator-workspace.tsx>), and [test-run-form.tsx](</Users/hasnat/Projects/appraise/src/app/(base)/test-runs/test-run-form.tsx>).
- The repo has strict TypeScript, ESLint, and Vitest, but component tests are essentially absent. The plan assumes the existing stack is extended minimally with `jsdom` and Testing Library rather than adding a new UI test framework.

## A. Current-State Assessment Approach

- Inventory all `.tsx` files under `src/components`, `src/app/(base)`, and `src/app/(dashboard-components)`. Classify each by size, statefulness, side effects, reuse breadth, typing quality, and absence of tests.
- Score refactor priority using these signals:
  - `High`: 250+ LOC plus async orchestration, multiple `useEffect`s, browser APIs, router/actions, or unsafe casts.
  - `Medium`: repeated route-local form/table patterns with duplicated validation or action wiring.
  - `Low`: static wrappers, small presentational components, stable shadcn/Radix shells.
- Treat these as concrete quality flags:
  - one file owns layout, domain mapping, async actions, and side-effect lifecycle
  - repeated inline status formatting or duplicated field-error rendering
  - `as unknown as`, weak generic constraints, hidden `id` assumptions
  - `eslint-disable` around hooks or a11y without a strong explanation
  - mirrored state derived from props without a sync contract
  - route-local components importing too many cross-feature concerns
- Treat these as organization flags:
  - route-specific components living in `src/components` without real reuse
  - shared components importing feature actions or route-specific types
  - mixed naming inside one feature folder (`FooForm`, `foo-table`, `view-foo-button`, etc.)
  - related helpers/hooks/types spread across unrelated directories
- Use a “same problem twice” heuristic before extracting shared code. If the pattern appears only once, keep it local and clean it locally.

## B. Standards To Enforce

### Component standards

- Shared primitives should generally stay under 150 LOC.
- Route-local feature components should generally stay under 250 LOC.
- Components above 300 LOC need an explicit reason or a split plan.
- Each file should primarily own one concern: presentation, interaction state, or async orchestration.
- Every non-trivial component gets a named `Props` type. No `any`. No `React.FC`. No unchecked `as unknown as` unless the boundary is genuinely external and documented.
- Effects must have one purpose each and must clean up listeners, intervals, EventSource connections, or timeouts.
- Shared components must not know about feature-specific actions, routes, or entity semantics.
- Derived values stay derived. Do not store mirrored state unless there is a tested synchronization rule.
- Accessibility is mandatory for custom interaction patterns: dialogs need title/description, icon-only controls need labels, custom combobox/listbox patterns need keyboard and ARIA support.

### Organization standards

- Keep route-specific UI inside the route folder by default. A component should move to `src/components` only when:
  - it is reused by a second route or feature, or
  - extracting it materially improves testability and decoupling.
- Keep shared code layered like this:
  - `src/components/ui`: low-level reusable controls and wrappers
  - `src/components/<feature>`: cross-route domain widgets that are reused in more than one place
  - `src/app/(base)/<entity>`: route-local screens, forms, tables, columns, and feature composition
- Within each route folder, organize consistently:
  - `page.tsx`
  - `<entity>-form.tsx`
  - `<entity>-table.tsx`
  - `<entity>-table-columns.tsx`
  - feature-local helpers/hooks/types when needed, ideally as `hooks.ts`, `helpers.ts`, `types.ts` or narrowly named equivalents
- Co-locate tests with the unit they protect:
  - shared component tests next to the shared component
  - route-local form/table tests next to that route-local file
  - extracted pure helpers tested next to the helper
- Do not create a broad `common`, `shared-utils`, or `helpers` dump. Extract into domain-named files only when the boundary is real.
- Prefer explicit route-local names over abstract names. `test-run-form-fields.tsx` is better than `entity-form-fields.tsx`.

### What bad and good look like

- Bad: a route form lives in `src/components`, imports actions directly, and is only used by one page.
- Good: route form stays under `src/app/(base)/test-runs`, while a reused `TestSuitePicker` lives in `src/components/test-suite`.
- Bad: `DataTable` assumes row identity through casting.
- Good: `DataTable<T extends { id: string }>` or a required typed `getRowId`.
- Bad: feature folders contain UI, hooks, and helpers named inconsistently or mixed with unrelated concerns.
- Good: related code is co-located and named by behavior: `test-run-form.tsx`, `use-test-run-name-validation.ts`, `test-run-form-helpers.ts`.

## C. Component Classification Model

- `Pure presentational`
  - Standards: no actions, no router, no effects, no local async state.
  - Anti-patterns: hidden formatting logic, conditional domain behavior, browser API usage.
  - Tests: render variants, conditional content, semantic labels.

- `Shared primitive / wrapper`
  - Standards: strict props, generic constraints, a11y-first APIs, no feature imports.
  - Anti-patterns: hidden data shape assumptions, invalid ARIA, feature-specific branching.
  - Tests: keyboard behavior, callback contracts, disabled states, accessible names.

- `Stateful UI container`
  - Standards: state transitions should be clear and local; no unrelated async orchestration.
  - Anti-patterns: mixed route navigation and generic state, duplicated derived state.
  - Tests: interaction flows and visible state transitions.

- `Form component`
  - Standards: submission shaping and cross-field rules are explicit; field shell patterns are consistent.
  - Anti-patterns: validators buried in JSX noise, repeated error rendering, effect-driven field sync without tests.
  - Tests: validation, submit payload, toggle behavior, disabled/edge states.

- `Composite feature component`
  - Standards: orchestration logic split from rendering when effects or action calls multiply.
  - Anti-patterns: one file owns polling, toasts, domain mapping, and large layout trees.
  - Tests: integration-style user flows.

- `Modal / dialog`
  - Standards: clear controlled/uncontrolled API, accessible structure, focused purpose.
  - Anti-patterns: trigger logic tightly coupled to business logic, missing titles or close semantics.
  - Tests: open/close, confirm/cancel, disabled state.

- `Table / list`
  - Standards: typed row identity, clear selection rules, row actions separated from base table mechanics.
  - Anti-patterns: inline IIFE-heavy action rendering, repeated selection logic, casts for row shape.
  - Tests: selection, filter/pagination, action enablement.

- `Flow / designer component`
  - Standards: graph transforms and parameter mapping extracted to pure helpers.
  - Anti-patterns: graph mutation logic embedded in render-heavy file, sync loops via effects.
  - Tests: helper-level unit tests first, bounded interaction tests second.

- `Live status / streaming component`
  - Standards: polling/SSE/retry lifecycle isolated in hooks or focused helpers.
  - Anti-patterns: EventSource handling mixed with markup, timer logic duplicated across components.
  - Tests: mocked timers/EventSource, connection states, completion and cleanup.

## D. Refactor And Organization Strategy

- Split oversized components by the most stable seam first:
  - pure status/config mappers
  - field sections
  - row-action toolbars
  - polling/SSE hooks
  - graph transform helpers
- Extract a child component when the seam is visual and prop-driven.
- Extract a hook when the seam has lifecycle, async orchestration, or shared state transitions.
- Keep route-local pieces route-local unless reuse is already proven.
- Introduce feature-local support files before introducing new shared folders:
  - example: `src/app/(base)/test-runs/test-run-form-helpers.ts`
  - example: `src/components/test-run/use-test-run-stream.ts`
- Normalize repeated route folder structure incrementally rather than moving all files at once.
- Avoid over-abstraction:
  - do not build a generic CRUD framework
  - do not create a universal picker system
  - do not force all forms through one shared field DSL
- Keep diffs reviewable:
  - one shared primitive or one feature slice per PR
  - no broad file moves unless they directly remove confusion and are covered by tests
  - no cosmetic rename churn without behavioral payoff
- Validate organization changes by checking import direction:
  - `src/components/ui` should only depend on low-level shared utilities
  - feature widgets in `src/components/<feature>` may depend on `ui` and shared libs, not route folders
  - route folders may depend on both shared areas

## E. Testing Strategy

- Extend [vitest.config.ts](/Users/hasnat/Projects/appraise/vitest.config.ts) to support component tests with `jsdom` and Testing Library while preserving existing service/action/API coverage.
- Unit-test extracted helpers:
  - status/result formatting
  - selection normalization
  - graph ordering
  - payload shaping
  - route/name suggestions
  - validation helpers
- Write integration-style tests for:
  - shared interactive components: `DataTable`, `MultiSelect`, `DeletePrompt`
  - reusable feature widgets: `TestSuitePicker`
  - route-local forms: smaller CRUD forms first
- Mock only at the boundary:
  - server actions
  - `next/navigation`
  - `EventSource`
  - timers
  - clipboard
  - `crypto.randomUUID`
- Assert behavior through:
  - visible text
  - roles and labels
  - callback results
  - route pushes
  - disabled/enabled states
- Accessibility checks should cover:
  - dialog title/description
  - icon button labels
  - combobox/listbox semantics
  - keyboard interaction paths
- Skip direct tests for trivial wrappers unless they encode behavior.

## F. Linting / Review Checklist

- Named `Props` type exists for every non-trivial component.
- No new `any`, `React.FC`, or unchecked `as unknown as`.
- Shared components do not import route-specific actions or route-specific entity logic.
- Route-local components are not promoted to `src/components` without real reuse or a clear decoupling benefit.
- Effects have a single concern and proper cleanup.
- No async action, router mutation, or browser API runs during render.
- No duplicated field-error rendering or status mapping when a local helper/component would remove repetition.
- Generic shared components constrain their data shape instead of casting.
- New `eslint-disable` lines include a concrete reason and are rare.
- Custom interaction components expose accessible labels and valid ARIA semantics.
- Tests cover one happy path and at least one failure/edge path.
- PR scope is small enough to review behaviorally, not just structurally.

## G. Execution Roadmap

1. **Foundation and organization rules**
   - Scope: component standards doc, organization rules, review checklist, minimal UI test setup.
   - Goals: lock file placement rules and testing baseline before refactoring.
   - Expected outcomes: one source of truth for where component code belongs and how it should be tested.
   - Risk: low.
   - Validation: existing `validate` still passes; one sample component test runs.

2. **Shared primitives and wrappers**
   - Scope: [data-table.tsx](/Users/hasnat/Projects/appraise/src/components/ui/data-table.tsx), [multi-select.tsx](/Users/hasnat/Projects/appraise/src/components/ui/multi-select.tsx), [delete-prompt.tsx](/Users/hasnat/Projects/appraise/src/components/user-prompt/delete-prompt.tsx), related pagination/view-option helpers.
   - Goals: remove unsafe typing, improve a11y, and stabilize high-reuse building blocks.
   - Expected outcomes: typed generic contracts, cleaner row action boundaries, better interaction coverage.
   - Risk: low to medium.
   - Validation: focused component tests for selection, filtering, deletion, keyboard behavior.

3. **Route-local CRUD form normalization**
   - Scope: smaller route-local forms such as modules, tags, environments, locators, template step groups.
   - Goals: standardize form structure and keep route-specific code inside route folders.
   - Expected outcomes: consistent file organization and less JSX duplication across forms.
   - Risk: medium.
   - Validation: component tests for validation and submit payloads; manual smoke-check on one create and one edit flow.

4. **Reusable feature widgets**
   - Scope: `TestSuitePicker`, test-case picker, table action patterns, report view widgets that are genuinely cross-route.
   - Goals: move only proven reusable pieces into stable feature folders under `src/components/<feature>`.
   - Expected outcomes: clearer boundary between route-local composition and shared domain widgets.
   - Risk: medium.
   - Validation: integration tests around selection and callback behavior.

5. **Composite workflow screens**
   - Scope: `TestRunForm`, `CreateLocatorWorkspace`, `SettingsSyncPanel`, `NavCommand`.
   - Goals: isolate side effects from rendering and co-locate route-specific support files where appropriate.
   - Expected outcomes: smaller orchestration hooks/helpers, improved maintainability, cleaner imports.
   - Risk: medium to high.
   - Validation: mocked boundary tests plus manual smoke tests for router/action/browser flows.

6. **Live status and flow editors**
   - Scope: `TestRunDetails`, `LogViewer`, `FlowDiagram`, `DynamicParameters`, `TestCaseFlow`, template-test-case flow.
   - Goals: extract streaming and graph logic into testable helpers/hooks without changing behavior.
   - Expected outcomes: most complex surfaces become understandable and safer to modify incrementally.
   - Risk: high.
   - Validation: unit tests for extracted transforms, timer/EventSource tests, targeted manual editor verification.

## H. Deliverables

- Refactored high-priority components with smaller responsibility boundaries.
- A documented organization model for Appraise UI:
  - what stays route-local
  - what belongs in shared `src/components`
  - how tests/helpers/hooks should be co-located
- New component and integration tests for shared interactive components and priority feature components.
- Improved shared component typing and reduced unsafe casts.
- Removed dead component-level code and duplicated UI/state logic where justified.
- Small, domain-named extracted helpers/hooks instead of broad abstraction layers.
- A strict implementation PR checklist for component quality and organization.

## Recommended First Implementation Batch

- Start with the safest, highest-value subset:
  - add minimal UI component test support to Vitest
  - refactor and test [data-table.tsx](/Users/hasnat/Projects/appraise/src/components/ui/data-table.tsx)
  - refactor and test [multi-select.tsx](/Users/hasnat/Projects/appraise/src/components/ui/multi-select.tsx)
  - refactor and test [delete-prompt.tsx](/Users/hasnat/Projects/appraise/src/components/user-prompt/delete-prompt.tsx)
- In the same batch, write the short organization rules doc so future PRs stop mixing route-local and shared component concerns.
- After that, pick one small route-local form family such as tags or modules and normalize it in place, without moving it into `src/components`.
- Defer `TestRunDetails`, `LogViewer`, `CreateLocatorWorkspace`, and the flow editor until the shared testing and organization rules are already proven in smaller PRs.

## Assumptions

- Appraise’s current architectural direction is preserved; this is a tightening pass, not a redesign.
- The only tooling additions assumed are the minimal React testing dependencies needed to make component tests practical.
- Route-local UI remains route-local by default.
- Shared domain widgets are only extracted when reuse or decoupling is real and immediate.
