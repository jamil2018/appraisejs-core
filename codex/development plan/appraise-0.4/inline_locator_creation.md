**Inline Selector Creation In Flow Node Forms**

**Summary**
Add inline locator creation for every shared flow node form using `StepParameterType.LOCATOR` as the repo’s current “Selector” type. Locator params will render two sections: `Create New Selector` and `Use Existing`. `Use Existing` keeps the current locator-group then locator selection flow. `Create New Selector` opens the existing Create Locator workspace in a modal, and a successful save auto-selects the created locator/group in the active node form.

**Key Changes**
- Reuse the existing Create Locator workflow by adding an inline mode to `CreateLocatorWorkspace`/`useLocatorWorkspace`.
  - Existing `/locators/create` behavior remains unchanged and still redirects to `/locators`.
  - Inline mode accepts `onSaveSuccess` and closes via callback instead of navigating.
  - Save result includes enough data to populate the flow form: `locatorId`, `locatorName`, `locatorGroupId`, `locatorGroupName`, `selector`, `route`, `moduleId`.
- Update the shared flow stack to carry locator-creation dependencies:
  - Pass `environments` and `modules` through flow entry points into `FlowDiagram`, `NodeForm`, and `DynamicFormFields`.
  - Load those dependencies on test-case, create-from-template, and template-test-case create/modify pages.
  - Keep local `availableLocators` and `availableLocatorGroups` state in the flow layer so newly created selectors are immediately selectable in later node edits/adds without a full page reload.
- Update `DynamicFormFields` LOCATOR rendering:
  - Add `Create New Selector` section with a button opening a `Dialog` containing `CreateLocatorWorkspace`.
  - Keep the existing group/locator selects under `Use Existing`.
  - On inline save, upsert the returned group/locator into local options, set `selectedLocatorGroups[paramName]`, set `values[paramName] = locatorName`, clear that field’s error, and call `onChange(formatDynamicParameterValues(...))` so the gherkin preview and submitted node payload update immediately.
- Broaden diagram-related locator/group prop types to `Pick<>` shapes where possible so newly created client-side option rows do not need fake Prisma timestamps.

**Propagation**
- Make changes only in core source files first.
- After core edits, run:
  - `npm run sync-template`
  - `npm --prefix packages/create-appraisejs run sync-templates`
- Do not manually edit generated template copies unless a sync script failure exposes a core sync-rule issue.

**Test Plan**
- Add/adjust unit tests for:
  - LOCATOR params rendering `Create New Selector` and `Use Existing`.
  - Existing locator selection behavior remains unchanged.
  - Inline Create Locator save with an existing group auto-selects the saved locator.
  - Inline Create Locator save with a new group adds/selects both the group and locator.
  - `CreateLocatorWorkspace` inline mode calls `onSaveSuccess` and does not `router.push('/locators')`.
  - Existing create page mode still redirects to `/locators`.
- Run targeted validation:
  - `npm run validate -- src/components/diagram/dynamic-parameters-helpers.test.ts src/components/diagram/node-form.test.tsx 'src/app/(base)/locators/create/create-locator-workspace.test.tsx' 'src/app/(base)/test-cases/test-case-flow.test.tsx' 'src/app/(base)/template-test-cases/template-test-case-flow.test.tsx'`
- Run broader validation after sync:
  - `npm run validate`
  - `npm run lint`
- Baseline before changes: the targeted 5-file validation set currently passes, 10 tests total.

**Assumptions**
- “Selector” maps to the existing Prisma enum value `StepParameterType.LOCATOR`.
- The modal should reuse the full Create Locator workspace, including Chromium picker launch and manual selector entry.
- Scope is all shared flow forms, including test-case and template-test-case flows, for both add and edit node sheets.
- No database migration is needed.
