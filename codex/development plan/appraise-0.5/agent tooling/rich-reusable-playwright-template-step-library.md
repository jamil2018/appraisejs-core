# Rich Reusable Playwright Template-Step Library

## Summary

Expand the shared library from its current 36 steps into a comprehensive, registry-first browser validation toolkit.
Agents should normally be able to author validations entirely from existing template steps and step blocks, with
custom step generation reserved for application-specific behavior.

The change is additive: preserve existing signatures, repair incomplete implementations, include the expanded library
by default in the root app and new scaffolds, and publish every step through the bundled registry.

## Implementation Changes

### Semantic template-step coverage

Add focused action and validation groups covering:

- Pointer and element actions: click variants, coordinates, drag-and-drop, focus and blur, scrolling, and element
  screenshots.
- Keyboard actions: individual keys, shortcuts, sequential typing, clearing, and keyboard down/up.
- Forms: fill, check, radio controls, dropdown selection by label/value/index, date inputs, content-editable fields,
  and file upload.
- Navigation and browser state: forward/back/reload, URL navigation, viewport changes, cookies, local/session storage,
  and stored-variable reuse.
- Tabs, popups, frames, and dialogs: switch and close tabs, click-and-open-popup, frame-scoped actions, and
  accept/dismiss/prompt handling.
- Downloads: click-and-wait, assert suggested filenames, and save or expose downloaded paths as stored variables.
- Waiting and synchronization: URL and load state, element states, text/value changes, popup/download/dialog events,
  and request/response matching.
- Assertions: visibility, attachment, enabled/editable/checked/focused/empty states; text, input value, attribute,
  class, CSS, count, bounding box, URL, title, storage, and download results.
- Data and diagnostics: store text/value/attribute/URL/title, generate common test data, log stored values, and capture
  screenshots.

### Structured advanced fallback

Add a generic locator-operation step and generic page-operation step for uncommon operations that are not covered by
a semantic step.

- Accept only documented, allowlisted operations.
- Accept JSON-compatible arguments and options, including documented references to stored variables.
- Validate operation names, argument shapes, locator requirements, and unsupported options before invoking Playwright.
- Return clear errors that identify the unsupported operation or malformed input.
- Do not permit arbitrary JavaScript evaluation.
- Cover the fallback contract with explicit tests so it remains powerful without becoming an untyped code-execution
  surface.

### Existing library quality

- Preserve existing Cucumber signatures and referenced template-step identities.
- Repair incomplete implementations, including the empty stored-variable text assertion.
- Standardize locator resolution, stored-variable handling, timeout behavior, positive/negative assertion semantics,
  and error reporting across existing and new steps.
- Keep groups focused instead of accumulating unrelated behavior in oversized step files.

### Distribution and discoverability

- Keep `automation/steps` as the canonical authored source.
- Regenerate bundled registry fragments and the registry manifest from canonical source.
- Synchronize the database-backed template library.
- Run scaffold preparation so newly created AppraiseJS projects receive the complete collection by default.
- Give every step a precise intent-oriented name and description containing likely agent search terminology.
- Ensure validation context and `template_step_search` return the signatures, parameters, descriptions, and group
  information needed to choose a step without reading its implementation.
- Update current validation-authoring, automation-sync, registry, and scaffold documentation with the selection order:
  semantic template step, structured fallback, then justified custom step.

## Interfaces and Compatibility

- Do not introduce a destructive Prisma migration or change an existing Cucumber signature.
- The new public surface consists of additional template-step signatures and registry entries.
- Structured fallback arguments use JSON strings and support a documented stored-variable reference object for values
  captured by previous steps.
- Existing test cases and step blocks continue resolving their current template-step IDs and signatures.
- Registry generation continues rejecting duplicate slugs, source paths, and Cucumber signatures.
- HTTP/API request steps are outside this release; the scope is full browser workflow validation.

## Test Plan

- Unit-test every new implementation family, including success cases, invalid locators, invalid operations/options,
  missing stored variables, timeouts, and Playwright error propagation.
- Add registry tests that build the expanded catalog, verify signature uniqueness and metadata, and confirm every
  canonical step produces an installable fragment.
- Add synchronization tests proving expanded canonical files create or update database template steps without deleting
  referenced existing steps.
- Add agent-facing resolver tests using representative intents such as file upload, keyboard shortcut, popup handling,
  dialog acceptance, download validation, storage setup, response waiting, and attribute assertion.
- Run reusable-step-only validation scenarios for:
  - A multi-page form workflow.
  - A popup and dialog workflow.
  - Upload and download workflows.
  - A storage-backed authenticated flow.
  - A network-synchronized UI flow.
  - An uncommon operation handled through the structured fallback.
- Verify generated Cucumber features execute in Chromium and exercise Firefox/WebKit-compatible behavior where a step
  is browser-engine sensitive.
- Run focused formatting and linting, registry and sync tests, Appraise package tests, scaffold preparation and tests,
  full validation, build, static-quality gates, and Graphify auto-update if committed graph scopes are affected.

## Assumptions

- The expanded collection is installed by default rather than split into optional packs.
- Existing steps are preserved and repaired; catalog renaming or a separate v2 library is out of scope.
- Application-specific business operations may still justify custom steps, but ordinary Playwright mechanics should
  not.
- Unrelated worktree changes must remain untouched and excluded from this feature.
