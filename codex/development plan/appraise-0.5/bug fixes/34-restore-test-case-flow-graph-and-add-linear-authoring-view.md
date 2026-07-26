# Restore Test Case Flow Graph And Add Linear Authoring View

## Status

Proposed for AppraiseJS 0.5. Awaiting human approval before implementation.

## Problem

Commit `0f382268` correctly migrated authored test steps from legacy Template Step identity to exact, immutable
`StepInvocation` references. During that cutover, it also replaced the XYFlow-based test-case builder with a
select-and-append list editor while retaining the `FlowDiagram`, `TestCaseFlow`, and “Test Case Flow” names.

The identity migration required graph nodes to store exact Step References and typed inputs. It did not require
removing the graph projection. The resulting UI is a regression:

- graph nodes, edges, insertion, connection validation, editing, search, grouping, and canvas controls disappeared;
- the remaining component accepts graph-related props that it does not use;
- the UI still describes the list editor as a visual flow;
- graph-focused test coverage was deleted rather than migrated to exact invocations; and
- AppraiseJS lost a core visual interaction shared conceptually with plan review.

## Product Decision

The flow graph is the primary test-case and template-test-case authoring experience. A linear step editor is an
optional alternative for users who prefer sequential authoring.

Both views are projections over one canonical in-memory authored-flow model:

```text
Canonical ordered StepInvocation flow
                  |
          +-------+-------+
          |               |
   Graph editor       Linear editor
     primary           alternative
```

The linear view is not a second form state, persistence format, or compatibility layer. Switching views must preserve
node identity, order, exact Step References, typed inputs, presentation metadata, and flow-block membership.

## Non-Negotiable Constraints

- Do not restore Template Step, Template Step Group, or legacy operation authority.
- Every authored executable node must retain an exact `{ id, version, definitionHash }` Step Reference.
- The graph remains the default and primary authoring mode.
- The linear view remains available as an explicit alternative, not an automatic responsive replacement.
- Graph and linear views must update the same canonical state without conversion loss or duplicate reducers.
- Existing persisted exact-invocation test cases must open in both views without migration.
- Human-readable Gherkin and feature generation must remain stable.
- Root source is canonical; scaffold copies are produced with the existing template preparation workflow.
- Generated Graphify output is updated through the repository Graphify workflow, never by hand.

## Architecture

### Canonical authored-flow model

Introduce a UI-domain model derived from `NodeOrderMap` and `TemplateTestCaseNodeOrderMap` that represents:

- stable node ID;
- ordered exact `StepInvocation`;
- rendered Gherkin/presentation metadata;
- UI parameter projection where still required by persistence or form validation; and
- optional flow-block membership.

Provide pure operations for add, insert, edit inputs, remove, reorder, connect, and normalize. The graph and linear
views call these operations through one controller. The form owns the canonical state and receives one state-change
contract regardless of the active projection.

The persisted order remains a single executable sequence. Graph edges visualize and edit that sequence; arbitrary
branching is out of scope unless the runtime model first gains defined branch semantics. Connection guards must
therefore enforce one connected, non-branching executable path.

### Graph projection

Recover the mature graph behavior from the parent of `0f382268`, but port it deliberately rather than reverting the
commit. Replace Template Step inputs with ready `StepDefinitionOption` records and exact `StepInvocation` node data.

Retain or restore:

- XYFlow canvas, nodes, edges, background, controls, fit view, and immersive mode;
- add-first-step, append, and insert-after-node affordances;
- drag/reconnect ordering with single-path validation;
- node edit and delete;
- Step Definition search and selection;
- typed invocation input editing;
- flow-node search;
- flow-block grouping, overlays, rename, and deletion where compatible with the exact-invocation composition model;
- keyboard shortcuts and accessible non-pointer alternatives; and
- stable layout refresh behavior across immersive transitions.

Graph position is presentation state. Unless existing persistence already stores positions, automatic deterministic
layout should derive from execution order; this plan does not add database position authority.

### Linear projection

Extract the current additive editor into a plainly named `LinearStepEditor`. Enhance it to support:

- searchable Step Definition selection rather than a large native select;
- add, insert, edit, remove, and reorder;
- the same typed input controls and validation as graph nodes;
- the same Gherkin preview; and
- keyboard-accessible ordering controls.

The linear editor must not implement its own invocation construction or parsing rules.

### View selection

Add a clearly labelled Graph/Linear segmented control in the Test Case Flow panel:

- Graph is the default for new users and when no preference exists.
- Selection may persist as a local UI preference, but must not become project or test-case domain data.
- Switching views is immediate and must not reset unsaved form state, flow blocks, errors, or immersive state.
- Immersive mode applies to the graph. The linear editor may use the available panel space without pretending to be a
  canvas.

## Delivery Plan

### Task 1: Freeze the shared authored-flow contract

**Description:** Define the projection-neutral flow state and pure mutations before restoring either editor. Reuse the
current exact invocation contracts and isolate rendering concerns from persistence concerns.

**Acceptance criteria:**

- One canonical state represents test-case and template-test-case authored steps without Template Step fields.
- Pure operations cover add, insert, edit, remove, reorder, and normalization while retaining exact Step References.
- Invalid duplicate IDs, missing hashes, non-contiguous order, and incompatible input values fail with actionable
  errors rather than being silently repaired.

**Verification:**

- Focused unit tests cover all mutations, round trips, and negative cases.
- Existing authored-step persistence and feature-generation tests remain green.

**Likely files:**

- `src/components/diagram/authored-flow-model.ts`
- `src/components/diagram/authored-flow-model.test.ts`
- `src/types/diagram/diagram.ts`
- `src/types/step-definition-option.ts`

**Dependencies:** None.

### Task 2: Restore the exact-invocation graph core

**Description:** Recover the XYFlow canvas, node/edge projection, layout, and single-path connection rules from
`0f382268^`, rewritten against the shared authored-flow contract and `StepDefinitionOption`.

**Acceptance criteria:**

- Existing exact-invocation records render as connected graph nodes in execution order.
- Adding, inserting, reconnecting, deleting, and editing nodes emits valid canonical flow state.
- Connections cannot create branches, cycles, disconnected executable nodes, or cross-block topology violations.

**Verification:**

- Focused graph helper and connection-guard tests cover initial, middle, and terminal edits plus invalid topology.
- Component tests verify canvas rendering and emitted exact invocations.

**Likely files:**

- `src/components/diagram/flow-diagram.tsx`
- `src/components/diagram/flow-diagram-view.tsx`
- `src/components/diagram/use-flow-diagram.ts`
- `src/components/diagram/flow-diagram-connection-guards.ts`
- `src/components/diagram/flow-diagram-helpers.ts`

**Dependencies:** Task 1.

### Task 3: Restore Step Definition node authoring

**Description:** Reintroduce graph add/edit surfaces using ready Step Definitions and typed invocation inputs. Share
input rendering, parsing, validation, and presentation rendering with the canonical model.

**Acceptance criteria:**

- Users can search and select a ready Step Definition, populate typed inputs, and add it at a chosen graph position.
- Editing inputs preserves the exact Step Reference and refreshes readable Gherkin deterministically.
- Required, boolean, number, JSON, locator, environment, and other supported input projections retain their existing
  validation and inline-creation behavior where the canonical definition declares them.

**Verification:**

- Component tests cover add/edit, typed inputs, invalid JSON/number input, and no-definition states.
- Accessibility checks cover dialog naming, focus return, validation announcements, and keyboard submission.

**Likely files:**

- `src/components/diagram/node-form.tsx`
- `src/components/diagram/node-form-fields-content.tsx`
- `src/components/diagram/node-form-helpers.ts`
- `src/components/diagram/dynamic-parameter-fields.tsx`
- `src/components/diagram/template-step-combobox.tsx` renamed for Step Definitions

**Dependencies:** Tasks 1 and 2.

### Checkpoint A: Primary graph path

- Creating and editing a test case works through the graph using exact Step Invocations.
- No Template Step identity or compatibility adapter has returned.
- Focused unit/component tests and affected-file ESLint/Prettier pass.
- The user reviews the recovered graph interaction before optional-view work proceeds.

### Task 4: Restore graph navigation and grouping capabilities

**Description:** Port search, grouping, overlays, block editing, shortcuts, and immersive-layout behavior onto the
exact-invocation graph.

**Acceptance criteria:**

- Node search focuses the selected graph node and remains usable in immersive mode.
- Group creation, rename, edit, and deletion preserve valid node membership and executable order.
- Keyboard shortcuts do not fire from editable controls and all shortcut actions have visible accessible controls.

**Verification:**

- Focused tests cover search, grouping constraints, overlay actions, shortcut guards, and layout refresh.
- Interactive browser verification covers ordinary and immersive editing.

**Likely files:**

- `src/components/diagram/use-flow-diagram-search.ts`
- `src/components/diagram/use-flow-diagram-block-grouping.ts`
- `src/components/diagram/flow-diagram-block-overlays.tsx`
- `src/components/diagram/flow-diagram-toolbar.tsx`
- `src/components/diagram/flow-diagram-step-block-sheet.tsx`

**Dependencies:** Tasks 2 and 3.

### Task 5: Extract and complete the optional linear editor

**Description:** Move the current list UI out of `FlowDiagram`, adapt it to the shared controller, and add insertion
and reordering so it is a complete alternative rather than an append-only fallback.

**Acceptance criteria:**

- Linear mode supports search, add, insert, edit, remove, and reorder over exact Step Invocations.
- It contains no duplicate invocation construction, input parsing, or Gherkin rendering logic.
- Every supported linear mutation is reflected correctly when switching immediately to graph mode.

**Verification:**

- Component tests cover the complete linear mutation set.
- Shared parity tests apply identical edit sequences through graph and linear adapters and compare canonical output.

**Likely files:**

- `src/components/diagram/linear-step-editor.tsx`
- `src/components/diagram/linear-step-editor.test.tsx`
- `src/components/diagram/step-definition-picker.tsx`
- `src/components/diagram/step-invocation-fields.tsx`

**Dependencies:** Tasks 1 and 3.

### Task 6: Add lossless view switching to test-case forms

**Description:** Add the Graph/Linear control to test-case and template-test-case authoring while keeping form state,
validation, preview, saving, and template conversion projection-neutral.

**Acceptance criteria:**

- Graph is the default; users can explicitly switch to Linear.
- Repeated switching preserves unsaved steps, node IDs, order, inputs, Gherkin, flow blocks, and validation state.
- Create, modify, and create-from-template routes all use the same view contract.

**Verification:**

- Form tests cover switching before and after edits, failed validation, template application, and save retry.
- Reducer tests prove view preference changes do not mutate authored domain state.

**Likely files:**

- `src/app/(base)/test-cases/test-case-form.tsx`
- `src/app/(base)/test-cases/test-case-form-reducer.ts`
- `src/app/(base)/test-cases/test-case-flow.tsx`
- `src/app/(base)/template-test-cases/template-test-case-form.tsx`
- `src/app/(base)/template-test-cases/template-test-case-flow.tsx`

**Dependencies:** Tasks 4 and 5.

### Checkpoint B: Dual-view authoring

- Graph and Linear edit one canonical state with parity tests.
- Create, modify, template, preview, validation, and save paths work in both views.
- Interactive browser verification finds no console errors, failed requests, focus loss, or horizontal overflow.

### Task 7: Restore full lifecycle E2E coverage

**Description:** Add browser coverage for the actual authoring lifecycle rather than isolated form rendering.

**Acceptance criteria:**

- E2E creates a test case in Graph mode, edits it in Linear mode, returns to Graph, saves, reloads, and verifies exact
  persistence and feature projection.
- E2E modifies an existing test case through both views and verifies ordering and typed inputs.
- Negative coverage proves invalid topology and invalid typed inputs cannot be saved or lost through view switching.

**Verification:**

- Focused browser tests pass in the bundled Browser harness where supported.
- Relevant Playwright E2E passes as the deterministic regression suite.

**Likely files:**

- `e2e/authoring.spec.ts`
- `e2e/helpers/forms.ts`
- focused test-case route/component tests

**Dependencies:** Task 6.

### Task 8: Synchronize scaffold, docs, and graph artifacts

**Description:** Update current documentation to declare the graph-primary/linear-alternative product contract,
regenerate the scaffold from root source, and update the repository graph.

**Acceptance criteria:**

- README and active authoring/component docs describe both projections and exact-invocation authority.
- Scaffold source matches canonical root behavior through the supported preparation workflow.
- Repository scans find no misleading append-only `FlowDiagram` implementation or stale Template Step authority.

**Verification:**

- `npm --prefix packages/create-appraisejs run prepare-template`
- `npm run graphify:auto`
- `npm run release:check:artifacts`
- `npm run release:check:packages`

**Likely files:**

- `README.md`
- `docs/automation-sync-rules.md`
- `docs/component-organization-rules.md`
- `docs/agent-scaffold-flow.md`
- synchronized `packages/create-appraisejs/templates/base/**`
- generated Graphify outputs

**Dependencies:** Tasks 6 and 7.

### Checkpoint C: Release gate

- Focused unit and component suites pass.
- Relevant E2E authoring suites pass.
- `npm run quality:fallow:commit` passes.
- `npm run quality:react-doctor:commit` passes.
- `npm run check:harness` passes.
- `npm run build` passes.
- Scaffold preparation and package/release artifact checks pass.
- `git diff --check` passes.
- A fresh review confirms the graph is primary, Linear is optional, and both remain exact-invocation-only.

## Explicitly Out Of Scope

- Restoring deleted Template Step or Template Step Group persistence.
- Introducing arbitrary runtime branching, loops, or conditional execution.
- Storing editor preference as project/test-case domain data.
- Creating a second linear persistence format.
- Redesigning the plan review graph as part of this work.
- Reintroducing Step Blocks as a competing semantic authority; any reusable composition remains a Step Definition.

## Risks And Mitigations

| Risk                                                                       | Impact | Mitigation                                                                                       |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| Recovering deleted files accidentally restores legacy identity assumptions | High   | Port behavior selectively onto `StepInvocation`; add repository-absence and type-level guards    |
| Graph and Linear states drift                                              | High   | One controller and mutation library; adapter parity and repeated-switch tests                    |
| Graph suggests branching the runtime cannot execute                        | High   | Enforce one connected non-branching path and document the invariant                              |
| Typed input behavior is lost during graph restoration                      | High   | Centralize input components/parsing and test every supported input kind                          |
| Flow blocks conflict with current composition authority                    | Medium | Treat blocks as grouping/projection unless explicitly backed by a ready composition              |
| Large restoration creates scaffold drift                                   | Medium | Root-first changes followed by the canonical prepare-template workflow                           |
| Restored graph regresses accessibility                                     | Medium | Keyboard alternatives, focus tests, semantic dialogs, reduced-motion handling, and browser audit |
| Historical graph complexity returns unchanged                              | Medium | Recover capabilities, not file structure; retain only independently testable responsibilities    |

## Definition Of Done

This work is complete only when the graph is visibly and functionally the primary authoring experience, the linear
editor is a complete optional projection, both operate losslessly on exact Step Invocations, create/modify/template
flows pass lifecycle E2E coverage, scaffold parity is regenerated, active docs are current, and all proportional
release checks are green.
