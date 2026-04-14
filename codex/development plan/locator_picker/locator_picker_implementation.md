# External Locator Picker Plan

## Summary
Replace the current iframe-based `LocatorInspector` approach with a dedicated external-page picker driven by a headed Playwright browser session launched by Appraise. This avoids iframe/CORS/X-Frame-Options limitations entirely, keeps the current runtime contract of `Locator.value: string`, and lets users create a locator group plus locator from a live page without opening DevTools.

Recommended v1 mechanism:
- Appraise launches a Playwright-controlled browser window for a saved environment or pasted URL.
- Users log in and navigate manually inside that window.
- Appraise injects a picker overlay into every loaded page/frame, captures clicked elements, ranks selector candidates, and saves the chosen selector back into the existing locator repository flow.

Future mechanisms to keep out of v1:
- Browser extension for attaching to an already-open tab.
- Trace/replay-assisted locator suggestions from failed runs.

## Key Changes
### 1. New external picker session architecture
- Add a server-side `LocatorPickerSessionManager`, modeled like the existing process/task managers, to own live picker sessions in memory.
- Each session tracks:
  - `sessionId`
  - launch source (`environmentId` or ad hoc URL)
  - browser/context/page handles
  - current URL/pathname/page title
  - status (`starting`, `ready`, `selecting`, `selected`, `saving`, `closed`, `error`)
  - latest picked element payload and ranked selector candidates
- Use direct Playwright API, not an iframe and not `postMessage` to a parent frame.
- Inject the picker into every navigation/frame with `context.addInitScript(...)` plus page/frame listeners, so cross-origin pages remain supported.

### 2. Picker overlay and selector generation
- The injected script should:
  - highlight hovered nodes
  - intercept click while selection mode is on
  - collect element metadata: tag, text, accessible name, role, label association, id, stable attributes, classes, current URL/pathname, frame URL, outerHTML
  - send that payload back through a Playwright binding/exposed function
- On the server side, generate and rank selector candidates in this order:
  1. `data-testid` / `data-test` / `data-qa`
  2. Playwright `role=` selector with accessible name when unique
  3. `label=` / placeholder / text-based selector when unique and appropriate
  4. `#id` when stable
  5. CSS built from stable attributes/classes
  6. XPath as last resort
- Validate each candidate live against the current page:
  - element exists
  - prefer visible
  - prefer unique
- Save only one primary selector string in v1.
- Show alternative candidates in the UI for manual override before save.

### 3. New UI workflow
- Add a dedicated picker workspace, preferably under `/locators/picker`, instead of embedding this into the existing raw CRUD form first.
- Entry points:
  - `Locators` page: primary “Pick From Page” action
  - `Locator groups` page: optional shortcut into the same picker
- Session start flow:
  - choose a saved environment or paste a URL
  - choose browser engine if needed, default `CHROMIUM`
  - launch browser window
- In-app picker panel should show:
  - session status
  - current URL/pathname/title
  - picked element preview
  - ranked selector candidates
  - locator name input
  - group resolution section
- Group resolution behavior:
  - infer route from current `pathname`
  - try exact route match to an existing locator group
  - if found, preselect that group
  - if not found, prefill “create new group”
  - route stays editable before save
  - module is auto-suggested from longest matching module path; if no confident match, require explicit module choice
- Default new group name:
  - use page title if present
  - otherwise use a humanized pathname
  - if not unique, append sanitized pathname for uniqueness
- Save flow:
  - one combined server action creates the group if needed, then creates the locator, then syncs automation files and locator map

### 4. API and type additions
Add new non-persistent interfaces/endpoints for the picker flow:
- `LocatorPickerSession`
- `PickedElement`
- `SelectorCandidate`
- `StartLocatorPickerSessionRequest`
- `SavePickedLocatorRequest`

Add new server endpoints/actions:
- `startLocatorPickerSession`
- `getLocatorPickerSession`
- `toggleLocatorPickerSelectionMode`
- `closeLocatorPickerSession`
- `savePickedLocator`
- optional SSE/poll endpoint for live session updates

Do not change v1 persistence contracts:
- keep Prisma `Locator.value` as a single selector string
- keep existing locator group projection to `automation/locators/*.json`
- keep existing route-to-group mapping behavior, only automate its creation/update

## Test Plan
- Session creation launches a headed Playwright browser for a saved environment or pasted external URL.
- External pages that cannot be embedded in iframes still allow picking because the browser is launched directly.
- Manual login/navigation works, and the picker continues functioning after redirects and cross-origin navigations.
- Injection persists across page reloads and child frames in the same browser context.
- Candidate ranking picks a stable unique selector when one exists.
- Save to existing exact-route locator group works and updates projection files.
- Save with no matching group creates a new group using inferred route and user-confirmed module/name.
- Duplicate locator group names and duplicate locator names surface clean validation errors.
- Closing the browser or losing the page marks the picker session closed/error and unblocks new sessions.
- Existing manual locator CRUD still works unchanged.

## Assumptions
- v1 supports external sites by launching a dedicated Appraise-controlled browser window, not by attaching to arbitrary existing browser tabs.
- Users log in manually inside the picker browser; Appraise does not automate per-site auth in v1.
- Route inference defaults to the current pathname but remains editable before save.
- v1 optimizes for one validated selector string per locator; richer structured selector metadata is deferred.
- The feature targets the current local/desktop-style deployment model where long-lived in-memory browser sessions are acceptable.
