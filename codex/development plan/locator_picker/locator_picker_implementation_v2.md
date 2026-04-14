# Chromium Extension-Based Locator Picker Plan

## Summary
Replace the current Appraise-managed selection/candidate-ranking picker with a Chromium-only browser-driven picker that returns a single selector to Appraise. Appraise remains responsible for launching the picker browser, receiving the picked locator payload, suggesting locator group/module defaults, collecting locator name/group inputs, and saving the locator through the existing projection flow.

The user flow becomes:
1. User opens `/locators/create`.
2. User launches a Chromium picker browser from the create form.
3. A built-in extension/content-script picker runs inside that browser.
4. User clicks one element in the browser.
5. Appraise receives one primary selector plus page metadata back into the create-locator screen.
6. User completes locator name and group details in the same create form and saves.

## Key Changes
### 1. Move picker entry and workflow to Create Locator
- Remove the picker as a primary entry point from the locators list page.
- Integrate the browser-driven picker into `/locators/create`, because that is the main point where a new locator is authored.
- Treat the create-locator page as a combined form:
  - launch picker browser
  - wait for a picked selector
  - show picked selector/page metadata inline
  - let the user complete locator name and group resolution
  - save locator
- The locators list page should remain a management/index surface, not a creation workflow hub.

### 2. Replace the current picker architecture
- Remove the current Appraise-managed selection/candidate-ranking picker flow.
- Keep a lightweight picker session manager only for:
  - launching Chromium
  - loading the packaged extension into a persistent Chromium context
  - tracking session lifecycle/status
  - receiving one picked-locator payload from the browser
  - closing the browser/session
- Drop browser-engine choice from the locator picker UI; v1 picker launch is Chromium only.
- Update create-page copy to describe the browser as the place where selection happens and the form as the place where the locator is finalized.

### 3. Introduce an internal Chromium extension for picking
- Add an unpacked Chromium extension bundled with the app repo and loaded into the Playwright persistent context.
- Extension responsibilities:
  - provide an always-available picker toggle in the browser
  - highlight hovered elements
  - intercept one click while pick mode is active
  - generate exactly one primary selector string
  - collect minimal metadata: `selector`, `currentUrl`, `pathname`, `pageTitle`, `tagName`, optional `text`/`accessibleName`
  - send the payload back to Appraise over a local bridge
- Do not build multi-candidate selection or selector editing in the browser extension.
- Do not support Firefox/WebKit extension parity in v1.

### 4. Define a single-selector generation policy
- Generate one primary selector only, with deterministic precedence:
  1. `data-testid` / `data-test` / `data-qa`
  2. stable role+name selector when confidently unique
  3. associated label or placeholder selector when appropriate
  4. stable `id`
  5. stable CSS attribute/class selector
  6. XPath fallback
- The extension should choose the best selector locally and send only the final chosen string to Appraise.
- Appraise may optionally validate that selector against the current Playwright page before save, but it should not present alternative candidates in the UI.
- Keep `Locator.value` unchanged as a single selector string.

### 5. Add a browser-to-Appraise messaging bridge
- Add a local communication path from the extension to Appraise; use a local HTTP or WebSocket bridge hosted by the Appraise app, with HTTP as the default simpler choice.
- Session manager responsibilities for the bridge:
  - create a session id before browser launch
  - pass session metadata/bridge endpoint to the extension
  - accept exactly one latest picked payload per session
  - expose a simple `getLocatorPickerSession` read action so the create page can poll for picked results
- Payload contract should include:
  - `sessionId`
  - `selector`
  - `currentUrl`
  - `pathname`
  - `pageTitle`
  - `tagName`
  - optional `text`
  - optional `accessibleName`

### 6. Simplify the Create Locator form around the picked selector
- Rework `/locators/create` into a save-oriented create flow:
  - existing manual fields stay available
  - picker launch and session status sit alongside the form
  - the selected selector field is populated from the browser pick
  - locator name remains editable by the user
  - existing/new locator group resolution happens inline before save
- Remove ranked selector candidate UI and manual selector choice list.
- Keep current route/module inference behavior:
  - exact route match preselects existing group
  - otherwise prefill create-new-group flow
  - route remains editable before save
  - module is auto-suggested from longest matching module path
- Save flow remains one Appraise action:
  - create locator group if needed
  - create locator
  - sync locator group projection
  - sync locator map if a new group is created

### 7. Replace current picker-specific interfaces
- Replace the current `SelectorCandidate`-oriented picker types with a smaller contract centered on one picked result.
- The main non-persistent interfaces should become:
  - `LocatorPickerSession`
  - `PickedLocatorPayload`
  - `StartLocatorPickerSessionRequest`
  - `SavePickedLocatorRequest`
- `LocatorPickerSession` should no longer carry ranked candidates; instead it should carry:
  - session status
  - browser launch source
  - current page metadata
  - latest picked selector payload
  - save-state/error fields

## Test Plan
- `/locators/create` can launch a Chromium persistent context with the Appraise picker extension loaded.
- The browser picker can be toggled on and off from inside the launched browser.
- Hovering elements shows a visible highlight in the browser.
- Clicking an element sends exactly one picked selector payload back to the matching Appraise create-locator session.
- The create-locator page updates from “waiting for selection” to showing the picked selector and page metadata.
- Saving to an existing exact-route locator group creates a locator and syncs projection files.
- Saving with no matching group creates a new group, updates locator-map, and creates the locator.
- Duplicate locator group names and duplicate locator names surface clean validation errors.
- Redirects and normal navigation do not break the extension picker after page changes in the launched Chromium session.
- Closing the browser marks the session closed and leaves the create form usable.
- Manual locator creation without using the picker continues to work.

## Assumptions and Defaults
- V1 picker support is Chromium only.
- This replaces the current locator picker flow rather than shipping alongside it.
- The browser picker returns one primary selector string only; no multi-candidate UI remains in Appraise.
- Appraise remains the system of record for locator naming, group selection/creation, and persistence.
- The browser-side picker is implemented as an internal unpacked Chromium extension loaded by Playwright in a persistent context.
- The extension-to-Appraise bridge uses a local Appraise-hosted endpoint rather than third-party infrastructure.
- The locators list page will no longer be the main entry point for picking; the create-locator page becomes the primary authoring surface.
