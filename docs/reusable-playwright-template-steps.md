# Reusable Playwright Template Steps

AppraiseJS ships a registry-first browser validation catalog in `automation/steps`. The starter scaffold includes the
complete catalog and its synchronized database records. The blank scaffold keeps the same application and runtime but
omits bundled template steps so teams can install only the registry fragments they choose.

## Step Definition draft authoring boundary

Reusable behavior is moving to the shared, versioned Step Definition registry. Human authoring clients use the same
draft service as built-in registration and future agent authoring. The supported draft transition adapters are:

- Server Actions in `src/actions/step-definition/step-definition-actions.ts`.
- HTTP routes under `/api/step-definitions/drafts` for create, read, revise, delete, validate, preview, exact review,
  and publish.
- `/api/step-definitions/:id/versions/:version/deprecate` for immutable ready-definition deprecation.

These adapters parse transport input, preserve optimistic draft revisions, map registry errors, and invalidate the
shared library view. Business rules remain in `StepDefinitionRegistryService`. They never write legacy `TemplateStep`
rows. The create route now opens the schema-driven Step Definition draft editor; incomplete definitions are saved
under a resumable draft URL and only exact reviewed, conformant drafts become immutable ready versions. Existing
Template Step rows and detail routes are read-only compatibility projections and must not be treated as proof that
consumer cutover is complete.

## Selection Order

Validation authors and agents should choose browser behavior in this order:

1. Use a semantic operation whose human Template Step projection matches the intent.
2. Use a structured locator or page operation when the Playwright mechanic is uncommon but allowlisted.
3. Propose a custom step only for application-specific behavior or a documented catalog gap.

Use `step_search` before proposing a custom step. It is the shared human-and-agent discovery surface: each result
contains one Step Reference plus its human, agent, and execution-readiness projections, while
user-authored steps participate in the same ranking and clearly report that no agent-operation mapping exists yet.
The compatibility names `template_step_search` and `template_step_match` resolve through the same service. Results
include intent scores, semantic-concept matches, parameter compatibility, signatures, descriptions, ordered
parameters, group metadata, and the canonical group path. `validation_context_read` exposes the same selection
metadata for bounded reads. Lower-level canonical catalog inspection remains available through
`operation_categories`, `operation_search`, and `operation_read`.

## Semantic Coverage

The bundled catalog covers pointer and coordinate actions, drag-and-drop, focus and blur, scrolling, keyboard keys and
shortcuts, sequential typing, form controls, dropdown selection, dates, content-editable fields, uploads, navigation,
viewport changes, cookies, local and session storage, stored-variable reuse, tabs, popups, frames, dialogs, downloads,
request and response synchronization, screenshots, stored diagnostics, and browser and element assertions.

Step descriptions intentionally include likely search terms. Prefer the most specific semantic step even when a
structured operation could perform the same action.

## Structured Operations

The structured fallback accepts an operation name, a JSON argument array, and a JSON options object. Values captured by
an earlier step can be referenced anywhere inside either JSON value with this exact object shape:

```json
{ "$stored": "variableName" }
```

JSON is limited to 20,000 characters, ten nested levels, and fifty items per array. Each operation validates its
argument count and types plus its own option allowlist before invoking Playwright. Unsupported operations and options
fail with an explicit error. The fallback never accepts callbacks, regular-expression objects, executable source, or
arbitrary JavaScript evaluation.

Allowlisted locator operations are:

- `blur`, `check`, `click`, `dblclick`, `dispatchEvent`, `fill`, `focus`, `hover`, `press`, `pressSequentially`
- `screenshot`, `scrollIntoViewIfNeeded`, `selectOption`, `selectText`, `setInputFiles`, `tap`, `uncheck`

Allowlisted page operations are:

- `goBack`, `goForward`, `goto`, `reload`, `screenshot`, `setViewportSize`
- `waitForLoadState`, `waitForTimeout`, `waitForURL`

Screenshot fallback options intentionally omit filesystem paths; semantic download and screenshot steps expose
results through stored variables. `setInputFiles` accepts only a path string or an array of path strings.

## Authoring And Distribution

Built-in handler semantics live under `packages/cucumber-runtime/src/operations/builtins`; reviewed descriptors and
projection metadata live in `packages/cucumber-runtime/src/operations/definitions.json`. Run
`npm run operation:projections` to generate Cucumber wrappers under `automation/steps/*/generated`; those wrappers
must contain delegation only and must not be hand edited. Build the public registry with
`npm run build-step-registry`. Synchronize groups before steps with
`npm run sync-template-step-groups && npm run sync-template-steps`. Synchronization updates existing rows by stable
Cucumber signature and preserves an orphaned row when a test case or template test case still references it.

After root changes, run `npm --prefix packages/create-appraisejs run prepare-template`. Do not edit prepared template
copies or registry fragments directly.
