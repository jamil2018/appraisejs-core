# Local Playwright Picker Companion Plan

## Summary
Replace the current extension bridge with an in-repo local companion process that owns the browser picker end-to-end and writes the final picked selector into a shared local session store. Keep `/locators/create` as the main authoring flow. Implement the companion inside `packages/` for clear separation from the Next app, and keep the architecture Electron-ready so a shell can be added later without changing the picker core.

## Key Changes
- Add a new package at `packages/locator-picker-companion` with a CLI entrypoint launched by Appraise via the existing process-spawning utilities.
- The companion launches Chromium with Playwright in non-headless mode, injects an in-page picker overlay, and handles element selection inside the same process using the old reliable pattern: injected page script calls a Playwright binding, and the companion reads the actual element and generates the selector in Node.
- The companion shows a minimal in-page floating picker UI in the browser:
  - `Start picking`
  - highlight on hover
  - single click selects one element
  - preview of the generated selector and page metadata
  - `Use selector`, `Pick again`, `Cancel`
- The companion writes only the finalized result to a shared session JSON file under `.tmp/locator-picker/sessions/<sessionId>.json`; the web app polls that file through the session manager. Remove the HTTP extension callback route from the selection path.
- Keep selector generation single-result only, using the existing precedence logic from the old picker internals:
  - test id attributes
  - unique role+name
  - label/placeholder
  - stable id
  - stable CSS
  - XPath fallback
- Rework the current locator picker manager so it becomes a process/session coordinator, not a DOM picker:
  - create session file
  - spawn companion CLI with `sessionId`, `targetUrl`, and session file path
  - read session state for polling
  - mark save progress
  - terminate by PID when the user closes the picker from Appraise
- Remove Chromium extension loading and extension-specific assets from the picker flow. The companion becomes the only supported v1 picker runtime.
- Keep `/locators/create` as the UI surface for launch, waiting state, route/module suggestions, and save. Manual locator creation remains available without launching the companion.

## Interfaces And Contracts
- `LocatorPickerSession` remains the web-app polling shape but is backed by a persisted session file, not in-memory state. It must include:
  - `sessionId`
  - `status`
  - `launchSource`
  - `currentUrl`
  - `currentPathname`
  - `pageTitle`
  - `companionPid`
  - `pickedLocator`
  - `error`
  - timestamps
- `PickedLocatorPayload` remains a single finalized payload:
  - `sessionId`
  - `selector`
  - `currentUrl`
  - `pathname`
  - `pageTitle`
  - `tagName`
  - optional `text`
  - optional `accessibleName`
  - optional `strategy`
- `StartLocatorPickerSessionRequest` is Chromium-only and contains:
  - `environmentId?`
  - `url?`
- Companion CLI arguments are fixed:
  - `--session-id`
  - `--session-file`
  - `--target-url`
- Session file lifecycle is fixed:
  - Appraise creates file with `starting`
  - companion updates it to `ready`
  - companion updates it to `picked` only after user confirms `Use selector`
  - companion updates it to `closed` or `error` on exit/failure
  - Appraise updates it to `saving` during persistence
- Process management is fixed:
  - launch via existing spawner
  - persist PID into the session file
  - close action kills by PID with OS-specific handling
  - companion also exits itself after `Use selector` or `Cancel`

## Package Structure
- Place the picker implementation under `packages/locator-picker-companion` to keep browser-control code isolated from the Next app.
- Inside that package, split responsibilities into:
  - CLI bootstrap
  - session-file read/write helpers
  - injected picker overlay script
  - Playwright bridge and element extraction
  - selector-generation helpers
- The Next app imports only a small launcher/contract layer from the package or invokes its built CLI entrypoint; it does not own picker DOM logic anymore.
- Add package-level scripts for build and local debugging so the companion can be developed independently of the web UI.

## Test Plan
- Starting from `/locators/create` spawns the companion process and opens Chromium to the expected environment URL or direct URL.
- The in-browser overlay appears and can toggle pick mode without any extension installed.
- Hovering highlights elements and click interception works after normal page navigation and redirects.
- After clicking an element, the companion generates exactly one selector and waits for explicit `Use selector`.
- After `Use selector`, the session file updates and `/locators/create` transitions to showing the picked selector and page metadata.
- Exact route match preselects an existing locator group in the create form.
- No exact route match preselects create-new-group mode and suggests the longest matching module path.
- Saving to an existing group creates the locator and syncs projection files.
- Saving with a new group creates the group, updates locator-map, and creates the locator.
- Duplicate locator names and duplicate group names return clean validation errors.
- Closing the companion from the browser UI or from Appraise marks the session closed and leaves manual creation usable.
- Manual locator creation without launching the companion still works.
- Restarting the Next worker does not lose picker state because polling reads from the persisted session file.

## Assumptions And Defaults
- V1 target is a local companion process, not Electron.
- The companion lives in `packages/locator-picker-companion`.
- Chromium is the only supported picker browser in v1.
- The web app remains the system of record for locator naming, group selection, and persistence.
- Session persistence uses local JSON files under `.tmp/locator-picker`, not a Prisma migration.
- Electron is deferred; if added later, it should wrap the same companion core rather than replace it.
