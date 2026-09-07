# AppraiseJS desktop UX improvement plan

Status: in progress; Phases 0–3 implemented and verified.

Basis: [revised UX/UI review](../docs/reviews/appraisejs-ux-ui-review-2026-09-07.md) and the product owner's clarification that AppraiseJS is a coding-agent companion evolving into a desktop quality engineering operating system.

Tracking: [phase checklist](desktop-ux-improvement-todo.md). Dedicated filenames preserve the unrelated existing `tasks/plan.md` and `tasks/todo.md`.

## Intended outcome

A professional new to AppraiseJS can connect a supported coding agent, prepare a brief, understand who must act next, review evidence, and resume work without learning AppraiseJS's internal architecture. Experienced users retain efficient access to authored tests and reusable assets.

Success means accurate state, reliable handoffs, readable desktop interfaces, and fewer wrong turns. It does not mean maximizing time spent in the UI.

## Scope and invariants

- Improve the current canonical Next.js UI. Do not introduce a desktop framework, packaging, background service, tray, native notifications, or updater in this plan.
- Phone support is excluded. Desktop window resizing, keyboard operation, screen readers, and zoom remain in scope. F1 is a conditional desktop investigation, not a confirmed supported-device defect.
- Keep existing routes and public IDs stable. Navigation labels and grouping may change after the proposed information architecture is validated.
- Reuse `src/lib/quality-journey/presentation.ts` and existing project/readiness/handoff services. Existing state is authoritative; display copy cannot authorize work or change lifecycle transitions.
- Preserve exact-version approvals, consent, immutable evidence, target/project isolation, draft conflict detection, idempotency, and read-only closed journeys.
- An app launch is not a connection; a recorded connection is not proof of present availability; no submitted analysis is not proof of active analysis. Unknown state must remain unknown.
- Codex UI exists in the inspected source. Verify each provider's current capability before presenting it as available. This plan does not promise new Claude Code or Cursor launch adapters. Missing integrations become separately scoped work, with honest setup guidance where supported.
- Prefer presentation and existing query changes. No schema, migration, API, operation-catalog, or MCP contract change is assumed. Escalate a newly established need into a separately reviewed slice.
- Preserve unrelated worktree changes. Branch before implementation, use root/base source, synchronize applicable scaffold output, and update active docs with changed behavior.
- The repository-development harness mismatch from the review is separate work and is excluded here.

## Delivery sequence and traceability

| Phase | Deliverable                                                             | Review findings        | Depends on |
| ----- | ----------------------------------------------------------------------- | ---------------------- | ---------- |
| 0     | Confirmed baseline, support matrix, and desktop verification contract   | All; F1 conditional    | None       |
| 1     | Consistent status and actionable agent setup                            | F2, F3                 | 0          |
| 2     | Accessible forms and readable desktop surfaces                          | F4, F5; F1 conditional | 0          |
| 3     | Useful first-run experience, prerequisite recovery, trustworthy drafts  | F6, F8, F9             | 1, 2       |
| 4     | Consistent navigation, contextual help, and useful Settings destination | F7, F10, F11           | 1, 3       |
| 5     | Focused visual hierarchy and efficient library browsing                 | F12                    | 2, 4       |
| 6     | Integrated verification and intended-user evaluation                    | All in-scope findings  | 1–5        |

Recommended delivery is one phase at a time, with small commits or PRs for the tasks below. Phases 1 and 2 are logically independent after Phase 0, but shared-file changes must remain sequential. Delegation is not required; classify each actual implementation slice through the repository router when it starts.

Every task below is a bounded session-sized slice. File lists identify canonical entry points, not permission for a broad refactor. If a slice expands beyond roughly five production files or introduces a new contract, split it before implementation. Tests and generated sync output are tracked separately.

## Phase 0 — Establish the implementation baseline

### Task 0.1 — Refresh evidence and create representative fixtures

- [x] Recheck the report against the current branch and record which findings still reproduce.
- [x] Establish isolated fixtures for empty workspace, handoff recovery, connected-without-submitted-work, questions, review, execution, failure, and closed results. Use existing test builders where possible; do not alter the user's active project.

**Acceptance:** Each finding has a reproducible path or an explicit “no longer reproduced” disposition. Later-state fixtures represent canonical state rather than invented UI-only flags.

**Verification:** Run relevant fixture/integration tests; capture concise baseline observations and exact commit identity. Do not infer product failure from startup permissions or development compilation latency.

**Entry points:** review document; existing presentation, handoff, dashboard, and intake tests. **Scope:** small evidence task. **Dependency:** none.

### Task 0.2 — Record supported desktop and agent behavior

- [x] Inventory implemented setup, launch, connection, and recovery support for Codex, Claude Code, and Cursor; distinguish automatic launch from manual configuration.
- [x] Record the desktop layout contract and any unresolved product choices before layout work.

**Proposed test matrix:** full workspace at 1440×1000 and 1280×800; compact companion window at 960×720. Evaluate 720×800 side-by-side use as an exploratory target, not an assumed supported minimum. Test 200% and 400% desktop zoom and keyboard/screen-reader use separately. A narrow effective viewport caused by zoom remains an accessibility concern even though phones are excluded.

**Acceptance:** The matrix labels supported, exploratory, and unsupported conditions explicitly. Product confirmation of the minimum window size is recorded; unrelated confirmed fixes may proceed while that choice is pending. No provider is marked connected or supported from configuration alone.

**Verification:** Inspect current provider/setup contracts and observe available paths. Record a provider/operation/evidence matrix. Native desktop restart and notification behavior remain deferred.

**Entry points:** `docs/agent-mcp-setup.md`, `docs/coordinator-api-mcp.md`, project management, coordinator handoff service and panel. **Scope:** small decision record. **Dependency:** 0.1.

**Phase 0 exit:** baseline and support decisions are recorded; fixture data is isolated; no implementation assumption silently expands scope.

## Phase 1 — Make state and agent setup trustworthy

### Task 1.1 — Define one human-facing status projection

- [x] Extend the existing presentation helpers to derive summary, next actor, action, and last-observed information from existing canonical evidence.
- [x] Specify precedence when recovery, required questions, pending review, and other attention items coexist; preserve secondary attention items.

**Acceptance:** Missing analysis never generates an active-work claim. Failed/expired handoffs produce recovery guidance. Submitted work and pending decisions take precedence over stale launch messages where appropriate. Unknown or stale connectivity is described as such.

**Verification:** Table-driven tests cover not prepared, prepared, launching, launched, connected without submitted work, failed, expired, unknown, review required, and closed states. Include conflicting-evidence combinations.

**Entry points:** `src/lib/quality-journey/presentation.ts` and its test. **Scope:** small. **Dependency:** 0.

### Task 1.2 — Align journey list, detail, and handoff messages

- [x] Apply the shared projection to journey cards, the next-action panel, and the analysis fallback.
- [x] Distinguish operational recovery from recorded workflow blockers and remove contradictory active-work wording.

**Acceptance:** List and detail agree on the same snapshot. A user sees who must act and a matching action. Viewing the page or refreshing status does not launch work, approve anything, or change lifecycle state.

**Verification:** Component tests and browser walkthrough of the report's recovery case, connected-without-work, pending question/review, and closed journey. Verify stale observations remain visible and understandable.

**Entry points:** `quality-journeys-browser.tsx`, `[journeyId]/page.tsx`, `coordinator-handoff-panel.tsx`, `journey-status-observation.tsx` under the Quality Journey routes. **Scope:** medium. **Dependency:** 1.1.

### Task 1.3 — Provide contextual agent setup and return navigation

- [x] Add a route-local setup view or panel reached from Agent setup and the project's readiness state, using existing setup/readiness data.
- [x] Preserve project/journey context and provide a clear return action. Separate setup instructions, observed readiness, and launch actions.

**Acceptance:** A “Not observed” project has a useful next step. Supported providers show accurate instructions; unavailable capabilities are not offered as working actions. Return navigation cannot redirect into an unrelated project or arbitrary external destination.

**Verification:** Test missing receipt, setup problem, ready evidence, wrong-project context, and unavailable provider states. Browser-check the setup-to-journey return path. Reuse canonical setup guidance rather than copying credentials or inventing configuration.

**Entry points:** `projects/project-management.tsx`, project route, `coordinator-handoff-panel.tsx`, existing setup/preflight services. **Scope:** medium; split UI and service work if new query plumbing is needed. **Dependency:** 0.2, 1.2.

### Task 1.4 — Make launch and recovery feedback accurate

- [x] Align existing launch/copy toasts and recovery instructions with the confirmed outcome; distinguish launch requested, launched, and connected.
- [x] Retain a manual path when clipboard or automatic launch fails, and keep retry bound to the correct journey and current handoff.

**Acceptance:** Clipboard denial does not strand the user. A failed or expired handoff has a clear recovery action. Repeated clicks do not bypass existing idempotency or silently start duplicate work. Only tested provider actions are enabled.

**Verification:** Existing handoff panel and SQLite service tests plus a supported-provider walkthrough. Exercise denied clipboard, failed launch, expired prompt, and return-to-app behavior; mock failures in isolated tests rather than weakening host security.

**Entry points:** handoff panel/actions and `quality-journey-handoff-service.ts`. **Scope:** medium. **Dependency:** 1.3.

**Phase 1 exit:** one coherent status story and a complete setup/recovery path. Update current user-facing setup documentation; retain evidence of which integrations were actually exercised.

## Phase 2 — Make desktop interaction accessible

### Task 2.1 — Correct shared field and error associations

- [x] Support stable IDs, specific accessible names, invalid state, and error descriptions in shared form controls without breaking current consumers.
- [x] Apply them to case Title, Test Suites, Filter Tags, and the suite-picker search input; announce or focus validation errors deliberately.

**Acceptance:** Selectors are distinguishable without sight. Errors are associated with their fields, required inputs are identified beforehand, and keyboard users can recover without losing input.

**Verification:** Component interaction tests for names, label association, invalid state, and error recovery; manual keyboard and screen-reader check. Recheck other affected MultiSelect consumers after changing its interface.

**Entry points:** `src/components/ui/multi-select.tsx`, `src/components/form/error-message.tsx`, test-case form, test-suite picker. **Scope:** medium. **Dependency:** 0.

### Task 2.2 — Improve meaningful text contrast

- [x] Measure actual composited text/background pairs and focus indicators on representative pages and states.
- [x] Adjust shared text tokens and targeted usages while retaining the navy/mint identity and clear disabled states.

**Acceptance:** Ordinary meaningful text meets a 4.5:1 target; large text and relevant non-text controls meet applicable 3:1 targets. Record exceptions explicitly. Supporting guidance remains readable without relying on screenshots alone.

**Verification:** Color calculations against rendered backgrounds and visual inspection of dashboard, intake, handoff, validation errors, library, and dialogs. Do not claim whole-app accessibility certification from selected pairs.

**Entry points:** `src/app/globals.css`, `tailwind.config.ts`, shared typography/card primitives and affected route usages. **Scope:** small token change followed by separate targeted consumer slices if needed. **Dependency:** 0.

### Task 2.3 — Verify desktop resizing, zoom, and keyboard continuity

- [x] Test the Phase 0 desktop matrix and zoom with intake, navigation, forms, dialogs, and journey sections.
- [x] Fix only reproduced supported-condition clipping or lost controls; inspect internal element bounds, not just document overflow. Retain usable local scrolling where appropriate.

**Acceptance:** Essential text, fields, and actions are reachable under supported desktop conditions. Dialog focus returns correctly; section navigation and command search are keyboard operable. Phone-specific redesign is not included.

**Verification:** Browser geometry and keyboard checks plus focused regression tests for any reproduced defect. If F1 cannot be reproduced under the agreed conditions, record it as outside scope and close the investigation without a speculative layout fix.

**Entry points:** root layout, intake form/screens, sidebar and navigation dialog. **Scope:** evidence task followed by small fixes. **Dependency:** 0.2, 2.1, 2.2.

**Phase 2 exit:** accessibility findings have measured dispositions, with any manual assistive-technology gaps still marked incomplete rather than presumed passed.

## Phase 3 — Help users reach their first useful outcome

### Task 3.1 — Give an empty workspace an actionable dashboard

- [x] Derive empty, untested, and populated presentation states from existing project-scoped data; do not treat zero failures as demonstrated health.
- [x] Put one primary Quality Journey action and a short project/agent readiness checklist ahead of empty statistics. Keep manual authoring available as an expert route.

**Acceptance:** Empty and untested states explain what is missing. Existing populated metrics remain correct. A ready project can reach intake directly, and an unready project reaches contextual setup without losing context.

**Verification:** Dashboard service/component tests with empty, never-run, passing, failing, and existing-journey fixtures; desktop walkthrough. Verify project switching cannot mix counts or readiness evidence.

**Entry points:** dashboard page, quick actions, data cards, dashboard service. **Scope:** medium. **Dependency:** 1, 2.

### Task 3.2 — Make manual run prerequisites recoverable

- [x] Make Reports and Create Run empty states explain missing suites/tests and link to the next valid creation step.
- [x] Add prerequisite recovery in the suite picker and preserve run/case form input across inline creation or safe return navigation.

**Acceptance:** The empty picker has a useful action rather than only Cancel/Save. Recovery returns to the original form and selects only valid project-owned entities. Independent runs are distinguished from journey-managed execution.

**Verification:** Test empty project, empty suite, usable suite, wrong-project item, and return navigation. Browser-check Reports → prerequisite creation → run selection without actually launching a run unless using isolated fixtures.

**Entry points:** Reports page, test-run form, suite picker, existing inline suite creation. **Scope:** medium; split form preservation if it requires additional persistence. **Dependency:** 3.1.

### Task 3.3 — Save drafts only after meaningful input

- [x] Separate step navigation from content dirty tracking; visiting sections alone must not create a draft.
- [x] Preserve autosave after substantive changes and show completion based on answered requirements, independently of last visited step.

**Acceptance:** Navigation-only exploration creates zero records. A real edit saves and resumes correctly. Existing drafts, conflicts, retry, save-as-new, and final review continue to work. Existing empty drafts are not automatically deleted.

**Verification:** Fake-timer/component tests for navigation, first edit, rapid edits, failed save, conflict, and reload; existing SQLite draft service coverage if persistence logic changes. Browser-check one isolated draft.

**Entry points:** `use-quality-journey-create-intake.ts`, intake form/shared helpers, draft list presentation. **Scope:** medium. **Dependency:** 2; may be delivered before 3.2.

**Phase 3 exit:** a fresh workspace has a valid guided entry path; manual prerequisites are recoverable; exploratory intake does not create clutter.

## Phase 4 — Make the product model understandable

### Task 4.1 — Consolidate vocabulary and validate navigation grouping

- [ ] Reuse the existing vocabulary map; make Case Templates and creation/search labels consistent across sidebar, palette, dashboard, and headings.
- [ ] Produce a small before/after navigation proposal and validate task finding with intended users before changing group placement.

**Proposed direction:** keep Dashboard and Quality Journeys prominent; group manual cases/suites as Test design, runs/reports as Runs and results, reusable assets together, and project/environment administration under Workspace. Preserve every existing URL and expert destination.

**Acceptance:** One concept has one primary name, with useful search aliases where needed. Group changes improve observed task finding; if they do not, ship consistency improvements without speculative regrouping. Standard QA vocabulary is retained with contextual explanation.

**Verification:** Navigation/palette tests and a small first-click exercise for finding a journey, test case, run, template, and environment. Check deep links, active states, and project parameters after changes.

**Entry points:** navigation helpers, command search, quick actions, presentation vocabulary. **Scope:** small consistency slice plus separate group-change slice. **Dependency:** 1, 3.

### Task 4.2 — Add contextual help and a worked example

- [ ] Provide a discoverable in-app Help destination or panel indexed by command search for help/setup/glossary terms.
- [ ] Explain the agent-assisted journey, manual authoring relationship, approvals, and recovery using a short worked example and contextual links from relevant fields.

**Acceptance:** Searching “help” returns assistance. The example is clearly illustrative and does not create records or start work merely by viewing it. Explanations preserve exact approval meaning and unknown-state distinctions.

**Verification:** Search and navigation tests, keyboard access, and a newcomer walkthrough. Keep instructions consistent with verified provider support and current lifecycle behavior.

**Entry points:** new route-local help UI/content, command helpers/search, intake guidance; current setup/lifecycle docs. **Scope:** medium. **Dependency:** 4.1.

### Task 4.3 — Resolve the empty Settings destination

- [ ] Preserve `/settings` but replace the blank page with a useful workspace configuration overview linking to actual project, environment, and agent setup controls.
- [ ] Explain where configuration lives and expose only implemented actions. Do not add fake preference controls to fill the page.

**Acceptance:** Settings has clear purpose and valid destinations; selected-project context is retained. Native app preferences and new theme systems are not implied to exist.

**Verification:** Route/link checks and desktop keyboard walkthrough. Update the route's metadata and help references to match its real content.

**Entry points:** Settings page, contextual setup route, navigation helpers if needed. **Scope:** small. **Dependency:** 1.3, 4.1.

**Phase 4 exit:** all primary destinations have purpose; terminology is consistent; users can find help. Record user-testing evidence or keep group changes pending.

## Phase 5 — Improve focus and repeated use

### Task 5.1 — Refine journey visual hierarchy

- [ ] Make the current next action and pending decisions visually dominant; reduce redundant cards and repeated Quick Tips.
- [ ] Keep advanced metadata available through existing technical-detail disclosure, preserving evidence visibility and keyboard access.

**Acceptance:** The user can identify stage, responsibility, and next action at supported desktop sizes. Detailed evidence remains accessible. No new decorative motion or redesigned lifecycle is required.

**Verification:** Before/after desktop comparison for waiting, review, running, and closed states, plus keyboard/disclosure tests where behavior changes.

**Entry points:** journey detail, next-action/progress components, relevant card/tip layouts. **Scope:** medium. **Dependency:** 2, 4.

### Task 5.2 — Improve Step Definition browsing density

- [ ] Add category filtering using existing metadata and a compact list option alongside the current card view.
- [ ] Preserve search over identifiers/signatures and provide progressive access to detailed metadata. Keep view preference local unless existing preference storage is suitable.

**Acceptance:** Search and category filters compose correctly; result counts and empty states agree. Switching views preserves selection/filter state and version identity. Source-managed behavior and immutable versions remain explicit.

**Verification:** Existing registry/search tests extended for combined filters and view parity; keyboard and desktop checks with the populated library. Compare finding a known step and browsing an unfamiliar category.

**Entry points:** Step Definition registry/page, existing ready-step search index, route-local display components. **Scope:** medium; separate filtering from view rendering if needed. **Dependency:** 2, 4.

**Deferred design option:** A light or additional high-contrast theme needs its own design/token validation after shared readability improvements and user demand are established. It is not required to complete this plan.

**Phase 5 exit:** lower visual noise without lost functionality, hidden evidence, or an enlarged global abstraction layer.

## Phase 6 — Verify the complete desktop workflow

### Task 6.1 — Run integrated regression and delivery checks

- [ ] Exercise fresh and populated workspace paths, including brief → agent handoff → questions/review → prepared execution → results, using canonical isolated fixtures and only authorized executions.
- [ ] Verify supported providers individually, project isolation, draft resume, navigation, keyboard access, desktop matrix, and zoom; record untested combinations explicitly.

**Acceptance:** No unresolved P1 within the implemented scope; pending capabilities and excluded work have explicit dispositions. Reviews and approvals still bind the intended versions. No claim of live connectivity or success exceeds observed evidence.

**Verification:** Apply the delivery gates below, attach commit/build/test/browser evidence, and obtain an independent review of any consequential state/authority changes. Automated checks cannot substitute for missing real-provider or assistive-technology verification.

**Entry points:** affected tests, current runtime/setup docs, scaffold workflow. **Scope:** verification slices by workflow. **Dependency:** 1–5.

### Task 6.2 — Evaluate familiarity with intended users

- [ ] Run formative desktop sessions across developers, QA practitioners, and domain experts working with agents, including accessibility needs.
- [ ] Measure unassisted task completion, wrong turns, help requests, setup/handoff failures, confidence, and repeat-task recall; compare with the Phase 0 baseline where available.

**Acceptance:** Findings are tied to observed behavior. Suggested two-minute orientation and ten-minute brief targets from the review remain hypotheses until a baseline exists. Failed task outcomes become bounded follow-up work rather than being hidden by an aggregate score.

**Verification:** Keep anonymized task notes and participant counts. If participants are unavailable, mark this task blocked and report engineering validation separately. Do not invent usability or retention results.

**Scope:** user research, not code. **Dependency:** 6.1. **Follow-up:** measure return use and subsequent journey completion over time; do not add telemetry or external analytics implicitly.

**Phase 6 exit:** engineering results and user-study results have distinct evidence and completion status.

## Validation and delivery gates

For every implementation slice:

1. Recheck current source and package scripts; create a scoped `codex/` branch before code edits. Follow applicable repository and product lifecycle gates. This Markdown plan is not an Appraise lifecycle approval receipt.
2. Run affected-file ESLint/Prettier and meaningful related tests through `npm run validate:unit -- <test-file>`. Use the repository's actual runner rather than inventing test commands.
3. For shared React changes, complete applicable Fallow and React Doctor checks; never bypass hooks or suppress complexity to close a task.
4. Browser-check changed flows through the available documented browser controls. Use isolated data. Capture semantic state, console errors, failed requests when supported, and focused screenshots when needed for comparison. Preserve a clear limitation if a check is unavailable.
5. Run `npm run build` for shared styling/layout, route-wide changes, setup/service changes, and final integration. Broaden tests only for touched risks or unresolved failures.
6. Update active docs for changed setup, navigation, lifecycle explanation, or workspace configuration. Edit canonical source and run `npm --prefix packages/create-appraisejs run prepare-template` when scaffold parity applies; run artifact/package checks for affected output. Run `npm run graphify:auto` for safe changed source scopes under the Graphify guidance.
7. Review the final diff, record evidence, and update both plan/checklist statuses. Push/CI/PR/merge only within the authorization for the implementation task; this planning request does not itself request publishing.

Known focused test entry points include presentation tests, handoff panel and SQLite service tests, intake form and draft SQLite tests, dashboard service tests, navigation/command tests, run form tests, suite-picker tests, and Step Definition registry/search tests. Determine exact commands from the current files at implementation time; no tests are claimed to have run for these future changes.

## Tracking and decisions

Mark `[ ]` as `[x]` only after implementation and required verification, including applicable docs/sync. For a blocked or split task, leave it unchecked and record the blocker and next action. For F1, a verified outside-scope disposition completes the investigation, not a nonexistent fix. Keep task IDs stable across handoffs.

| Decision or risk                                | Proposed handling                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Minimum desktop width is not yet established    | Confirm the Phase 0 matrix; do not use phone sizes as release gates or assume all split-screen sizes are supported |
| Planned agent support exceeds observed support  | Ship accurate setup for verified capabilities; scope new adapters separately                                       |
| Status fix requires unavailable evidence        | Show unknown/last observed; do not invent heartbeat or connection guarantees                                       |
| Shared control/token changes affect many routes | Verify real consumers and split rollout into bounded slices                                                        |
| Navigation regrouping may hurt existing users   | Preserve URLs, test task finding, and retain current grouping if evidence is weak                                  |
| Unsaved form preservation needs new persistence | Prefer existing inline creation/local state; review any new persistence separately                                 |
| Research or provider access is unavailable      | Complete independent engineering work, keep affected validation open, and disclose the gap                         |
| Desktop shell migration                         | Separate future plan for packaging, native lifecycle, background execution, and notifications                      |

For each phase append an evidence note containing: commit, completed task IDs, commands and outcomes, browser/assistive checks, docs and generated updates, unresolved risks, and next phase. No phase is complete simply because its code was written.
