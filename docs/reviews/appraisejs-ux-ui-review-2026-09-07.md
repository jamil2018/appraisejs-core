# AppraiseJS UX and UI review

Reviewed 7 September 2026. Local development app, branch `appraise-0.5`, commit `bedf44a6`.

Assessment revised to reflect the product owner's clarified scope. The observations below remain from the original walkthrough; this revision does not represent a new runtime test.

Implementation follow-up: [phased desktop UX plan](../../tasks/desktop-ux-improvement-plan.md) and [task checklist](../../tasks/desktop-ux-improvement-todo.md).

## Product context and evaluation scope

AppraiseJS is intended as a companion plugin for coding agents such as Codex, Claude Code, and Cursor agents. It currently uses Next.js and is planned to become a desktop quality engineering operating system, with a desktop application experience comparable in form to ChatGPT desktop. The planned desktop experience is a product direction, not an implemented capability assessed here.

Phone access is outside the intended usage model. A mobile experience is therefore **not a release requirement or a recommended investment for the current scope**. The framework used to build the interface does not determine the supported devices.

The relevant audience is developers, QA practitioners, and domain experts working with coding agents. Evaluate whether newcomers to AppraiseJS can use their existing professional knowledge without learning its internal architecture. Priorities are agent setup and handoffs, trustworthy workflow state, efficient keyboard navigation, and a readable desktop workspace beside an editor or agent. Desktop window resizing, text enlargement, and accessibility zoom remain relevant; they do not imply phone support.

## Overall assessment

AppraiseJS has a coherent visual identity and a useful foundation for a desktop coding-agent companion. It is **not yet consistently self-explanatory for professionals new to AppraiseJS**, even when they understand testing or coding agents. Its strongest experience is the guided Quality Journey intake. Its weakest areas are first-use orientation, agent setup and recovery, trustworthy progress communication, and accessible form feedback.

The main opportunity is to make the product explain **what to do, why it matters, and what happens next**. Visual polish alone will not resolve the current learning burden.

This is an expert walkthrough with browser and source evidence, not a study of real users. Learning time, satisfaction, and retention were not measured. “All backgrounds” means varied testing knowledge, agent experience, language proficiency, and accessibility needs within the intended professional audience; this review cannot establish universal usability.

## Answers to your questions

| Question                                              | Finding                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the system legible for users from all backgrounds? | **Partly within the intended professional audience.** Core headings and actions are understandable, but AppraiseJS-specific vocabulary, subdued supporting text, and form accessibility gaps create barriers. Familiar testing terms can remain; internal workflow concepts need explanation.                                     |
| Is it easy to navigate?                               | **Reasonably easy between known features; harder through an unfamiliar task.** Persistent desktop navigation, active states, search, and journey section links help. Prerequisite dead ends, an empty Settings page, and a misleading Agent setup destination interrupt task completion.                                          |
| How pleasant is the UI, and can it retain attention?  | **Visually consistent but overly subdued and repetitive.** Dark navy surfaces, mint actions, icons, and spacing create a recognizable identity. Many equally weighted cards and muted descriptions weaken emphasis. Retention remains unknown; clearer progress and earlier useful outcomes are the strongest hypotheses to test. |
| How quickly can a fresh user become familiar?         | **Basic page discovery should be easier than completing the first useful workflow.** The four-step brief helps, but understanding the agent handoff and the relationship between journeys, suites, cases, and runs requires additional learning. No defensible time estimate is available without novice testing.                 |
| Are all features organized cohesively?                | **Partly.** The library grouping is sensible, and the journey provides a logical sequence. Global navigation still emphasizes system entities more than user goals. Guided testing and manual test authoring need a clearer explanation of how they relate.                                                                       |
| Other suggestions?                                    | Prioritize actionable agent setup, accurate status language, accessible desktop forms, and a task-oriented first-use experience. Verify keyboard efficiency, desktop window resizing, and zoom. Phone support is outside scope.                                                                                                   |

## What was examined

Browser observations used the existing Legacy AppraiseJS project: zero test cases/suites and reports, 127 ready Step Definitions, one existing analysis-stage journey, and an existing environment. This is a sparse existing workspace, **not a clean-install simulation**.

Inspected surfaces and interactions:

- Dashboard; desktop sidebar; mobile navigation; command palette and a `help` query.
- Quality Journey list, four intake sections, inline environment-registration form, existing journey detail, section navigation, and recovery messaging.
- Empty Test Cases page; manual case creation; empty-form validation.
- Populated Step Definitions library and its mobile layout.
- Empty Reports page; Create Test Run; empty suite picker.
- Projects, local/remote registration dialogs, Agent readiness, and Settings.
- Desktop at 1440×1000; library at 390×844; dashboard and intake at 320×800; intake also at 390×844. Viewport override was reset afterward.

The phone-width checks are retained as historical observations, not product acceptance criteria. Only one desktop size was inspected. Minimum supported desktop window size, side-by-side use, and desktop zoom still need verification. The walkthrough observed Codex-related UI; it did not verify integrations with Codex, Claude Code, or Cursor end to end.

Browser accessibility state, screenshots, selected DOM measurements, and a separate read-only source investigation supported the findings. Captured console warning/error queries returned no entries. No network-failure audit, production performance benchmark, screen-reader session, completed execution, populated result review, or longitudinal retention study was performed.

No implementation changes were made. The pre-existing modified `package-lock.json` was preserved. Starting the development server reported 127 unchanged Step Definitions and no seeded/repaired records. Clicking intake section tabs automatically created one empty **Untitled brief**, despite no text entry; this side effect is documented as finding F8. No journey was submitted and no tests were started.

## What is working well

1. **A consistent visual language.** The navy palette, mint primary actions, familiar icons, and repeated spacing make the pages feel related. Primary actions are generally easy to recognize.
2. **Useful navigation foundations.** Desktop navigation stays available; sections are grouped; active destinations are distinguished. The command palette provides a shortcut for experienced users.
3. **Progressive intake.** Goal → Scope and success → Checks → Test location is a manageable structure. Optional inputs are identified, examples appear in placeholders, and environment registration is available in context.
4. **Recovery and review are represented.** Draft saving, review before confirmation, pending decisions, and a prominent next-action panel are good concepts. Some technical details are already collapsed.
5. **Accessible shell foundations.** A skip link and semantic navigation are present. In the mobile menu check, Escape closed the drawer and returned focus to its trigger. Source includes reduced-motion handling.
6. **There is a foundation for adaptable desktop layouts.** The library and navigation changed layout at narrower widths. This is useful implementation evidence, but does not establish usability at the desktop window sizes and zoom levels the product will support.

## Findings and recommendations

Priority meanings: **P1** materially blocks use, comprehension, or trust; **P2** causes recurring friction; **P3** is polish. Priorities are reviewer judgments, not measured incident rates.

### F1 · Outside device scope · Phone-width intake clipping; desktop reflow remains unverified

**Observed:** At a 390px viewport, the outer main region was 375px wide but had 638px of scrollable content and `overflow: hidden`. The Goal and Context textareas were about 580px wide, starting at x=37. Text and input content extended beyond the visible right edge. The same problem appeared at 320px. Checking document width alone would miss this clipping.

**Assessment:** The observed phone layout does not establish a defect within the supported product scope and is removed from release priorities. It is a useful signal to investigate desktop resizing and zoom, but those behaviors were not tested and must not be reported as confirmed failures.

**Recommendation:** Define the minimum supported desktop window size and verify intake while AppraiseJS is placed beside an editor or agent. Test text enlargement and desktop zoom. If clipping occurs in those supported conditions, fix the grid and overflow behavior against that evidence. Do not invest in a phone-specific redesign for this finding.

**Desktop verification target:** All four steps, labels, entered text, errors, and actions remain usable at the agreed minimum desktop window size and under accessibility checks, including 200% and 400% zoom where applicable. Inspect actual field bounds and visibility, not only document scrollbar absence. Phone viewport dimensions are not acceptance criteria; desktop zoom can still require reflow at narrow effective content widths.

Source: [intake grid and navigation](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/quality-journeys/quality-journey-create-form.tsx:267>), [shell overflow](</Users/jamil/Personal Projects/appraisejs/src/app/layout.tsx:137>). The four minimum-width navigation buttons are the strongest source-supported cause of the oversized grid.

### F2 · P1 · Journey progress communicates conflicting expectations

**Observed:** The existing journey simultaneously displayed “Needs recovery,” instructions to open Codex manually, “Appraise has not received submitted analysis work yet,” and “Appraise is preparing a test approach from your brief.” The list described the next step as “Ready to start.” The detail page also showed zero active blockers.

**Impact:** A newcomer cannot confidently decide whether to wait or act. “No blockers” may be technically correct for one category of lifecycle records, but it does not communicate the operational obstacle to the user.

**Recommendation:** Present a single human-facing status derived from the actual handoff state: for example, “Waiting for you to connect Codex. Analysis has not started here.” Keep operational recovery and formal workflow blockers distinguishable. Use identical status language in list and detail views.

**Acceptance:** A user can answer “Is anything working now?”, “Who must act?”, and “What should I do next?” from one panel. A missing analysis document must not by itself imply active work.

Source: [no-analysis fallback](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/quality-journeys/[journeyId]/page.tsx:565>), [observed-work message](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/quality-journeys/[journeyId]/coordinator-handoff-panel.tsx:128>).

### F3 · P1 · Agent setup does not lead to an actionable setup experience

**Observed:** The journey’s “Agent setup” link targets Projects. The inspected project displayed a non-actionable “Not observed” readiness badge, with registration, rename, select, and remove actions. No setup instructions or repair action were presented for that state.

**Impact:** The user seeking help connecting the coordinator is redirected to project administration without a clear resolution.

**Recommendation:** Link to a contextual setup panel for the selected project and chosen agent. Explain requirements, show observed connection/readiness evidence, provide the next action, and return the user to the journey when ready. As integrations are delivered, verify setup and recovery separately for Codex, Claude Code, and Cursor. Make it clear which work happens in AppraiseJS and which happens in the coding agent. Preserve the underlying approval and authority boundaries.

Source: [setup destination](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/quality-journeys/[journeyId]/coordinator-handoff-panel.tsx:207>), [readiness badge](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/projects/project-management.tsx:215>).

### F4 · P1 · Form labels and errors are not consistently accessible

**Observed:** Empty Continue in manual case creation correctly showed title and suite errors. However, Title had neither `aria-invalid` nor an error association through `aria-describedby`. Both the Test Suites and Filter Tags controls exposed the name “Select options.” The suite-picker search field also appeared unnamed in the accessibility tree.

**Impact:** Assistive-technology users may struggle to distinguish fields and understand what must be corrected. Visible labels alone do not establish programmatic associations.

**Recommendation:** Give every control a specific accessible name; associate error text with its field; expose invalid state; and provide deliberate error focus or an announced summary. State required fields before submission.

**Acceptance:** Keyboard and screen-reader testing can identify the two selectors independently, locate invalid fields, hear each error, and recover without visual inference.

Source: [Title/error rendering](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/test-cases/test-case-form.tsx:621>), [multiselect use](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/test-cases/test-case-form.tsx:679>), [error component](</Users/jamil/Personal Projects/appraisejs/src/components/form/error-message.tsx:1>).

### F5 · P1 · Supporting text needs stronger contrast

**Observed:** Important instructions use small muted text, including 12–14px intake guidance. The shared muted foreground resolves approximately to `#6b7280`. Calculating the declared color tokens gives about **3.03:1 against the card token** and **3.69:1 against the background token**. These are token-pair calculations, not a complete audit of layered rendered backgrounds.

**Impact:** Instructions and metadata are harder to read during desktop work, particularly in challenging lighting or for users with low vision. The visual hierarchy relies too heavily on dimming text. Disabled metric cards are a separate case and should not be treated as ordinary-text contrast failures.

**Recommendation:** Use a stronger secondary-text token for meaningful guidance; reserve the dimmest tone for genuinely supplementary content. Validate actual composited backgrounds and all interaction states. WCAG AA generally requires 4.5:1 for ordinary-size text. [WCAG reference](https://www.w3.org/WAI/WCAG22/quickref/#contrast-minimum)

Source: [theme tokens](</Users/jamil/Personal Projects/appraisejs/src/app/globals.css:5>). A full WCAG conformance claim is outside this review.

### F6 · P2 · The empty dashboard prioritizes statistics over orientation

**Observed:** Attention Needed and States precede Quick Actions on the desktop dashboard. Zero-failure cards say “Healthy” despite the absence of execution data. Seven similarly styled quick actions appear below the metrics. The original phone-width action-position measurement is not used to prioritize this finding.

**Impact:** The first screen offers little progress for a new workspace and may imply confidence unsupported by test evidence. Seven similarly styled quick actions then ask the user to choose among unfamiliar concepts.

**Recommendation:** Introduce an empty-workspace dashboard with one recommended route, an example, and a short checklist for project and coding-agent readiness. Say “Not tested yet” where evidence is absent. Retain the operational dashboard once there is useful activity to summarize.

Source: [dashboard layout](</Users/jamil/Personal Projects/appraisejs/src/app/page.tsx:32>), [quick actions](</Users/jamil/Personal Projects/appraisejs/src/app/(dashboard-components)/quick-actions-drawer.tsx:7>).

### F7 · P2 · Feature grouping needs a clearer task model

**Observed:** Fifteen primary destinations are grouped under Control, Execution, Library, and System. Test Cases and Test Suites sit under Execution; Environments sits under Library. The same template concept is called “Case Templates” in navigation, “Template Test Cases” in the command palette, and “Create Template” on the dashboard.

**Impact:** Experienced users can learn the taxonomy, but newcomers must infer the relationship between guided journeys and manually authored tests. Label drift adds avoidable search effort.

**Recommendation:** Make the agent-assisted Quality Journey the clear primary workflow, with manual authoring and reusable assets available for inspection, refinement, and expert work. Explain how these surfaces relate instead of presenting every entity as an equally likely starting point. Test a grouping such as Overview, Quality Journeys, Test design, Runs and results, Reusable assets, and Workspace with the intended professional audience. Use consistent names throughout; validate proposed navigation before changing established routes.

Source: [navigation definitions](</Users/jamil/Personal Projects/appraisejs/src/components/navigation/nav-command-helpers.ts:68>).

### F8 · P2 · Browsing intake steps creates an empty draft

**Observed:** Opening the fresh intake and clicking section tabs, without entering text, produced an Untitled brief. The page says the brief will save after the first edit; users may not interpret section browsing as editing content.

**Impact:** Exploration creates clutter and weakens confidence about what has been saved. “Step 4 of 4” on the draft can also look more complete than its empty content warrants.

**Recommendation:** Distinguish navigation state from meaningful content edits. Defer draft creation until substantive input, and describe completion using answered requirements rather than the last visited step.

Source: [tab updates](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/quality-journeys/quality-journey-create-form.tsx:71>), [dirty tracking and autosave](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/quality-journeys/use-quality-journey-create-intake.ts:116>).

### F9 · P2 · Empty states do not always resolve prerequisites

**Observed:** Reports offers Create Test Run. In the run form, choosing suites opens a picker with “No test suites found,” Cancel, and Save, but no creation route. Case creation similarly reveals that a suite is required after Continue, although it does provide inline suite creation.

**Impact:** Users reach an action before understanding what must exist first.

**Recommendation:** Make empty states dependency-aware: “Create a suite and add a test before your first run,” with links or an inline path. Preserve in-progress input when following prerequisite actions. Explain the difference between independent runs and journey-managed testing at the relevant entry point.

**Acceptance:** A user arriving at Reports in an empty workspace can follow the UI to the next valid step without searching the sidebar for an explanation.

### F10 · P2 · Settings is an unexplained dead end

**Observed:** Settings renders its heading and icon, with no controls, description, or empty-state explanation. Source confirms this is the current page implementation.

**Recommendation:** Remove the destination until useful, or provide actual preferences and a clear explanation of what is configured elsewhere. Do not leave an apparently functional navigation item pointing at a blank page.

Source: [Settings page](</Users/jamil/Personal Projects/appraisejs/src/app/(base)/settings/page.tsx:5>).

### F11 · P2 · The language assumes knowledge that the UI has not taught

**Observed:** Introductory surfaces use “binding intent,” “registered targets,” “stable environment identities,” “ready, versioned contracts,” “durable lifecycle state,” and “lifecycle authority.” No global Help destination was present. Searching `help` in the command palette surfaced Search Template Test Cases, not assistance.

**Recommendation:** Preserve precise internal concepts but translate their user-facing explanation. Add contextual examples and a searchable glossary. For example:

| Current wording                         | Suggested wording                              |
| --------------------------------------- | ---------------------------------------------- |
| Bind the brief to registered targets…   | Choose where these tests should run.           |
| Supplied answers become binding intent. | We will use these answers as the agreed scope. |
| Coverage rigor                          | How thorough should the testing be?            |
| No report revision is recorded.         | Results will appear after the tests finish.    |
| States                                  | Workspace overview                             |

These are proposals, not implemented copy. Standard professional terms such as Integration or Exploratory need not be removed; offer concise explanations for users from adjacent disciplines. Prioritize translating internal implementation and authority terminology that even an experienced developer or tester would not automatically know.

### F12 · P3 · Visual hierarchy can be more purposeful

**Observed:** Repeated bordered cards and similar surface tones make many sections equally prominent. The 127-item step library exposes technical identifiers, tags, descriptions, signatures, and input counts on every card. Some Quick Tips repeat what the adjacent labels already say.

**Recommendation:** Keep the existing identity. Make the next action dominant, reduce secondary card framing, tighten repetitive advice, and reveal advanced metadata on demand. Add category filtering and a compact library view for frequent use. A readable light/high-contrast option is worth testing after the shared contrast issue is fixed.

Attention should serve task completion: useful progress, relevant information, and clear feedback are better candidates for sustained engagement than additional animation.

## Recommended order of work

| Sequence | Scope                                                               | Expected benefit                                                 | Verification                                                                                                                             |
| -------- | ------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Journey status consistency and actionable agent setup               | Makes the core companion workflow understandable and recoverable | Walk through setup, not-started, running, disconnected, question, review, and failure states for each supported agent                    |
| 2        | Desktop form semantics, essential text contrast, keyboard access    | Makes sustained desktop work readable and operable               | Keyboard, screen reader, composited contrast, agreed desktop window sizes, and zoom; confirm any reflow defect before prioritizing a fix |
| 3        | Empty dashboard, prerequisite-aware empty states, Settings          | Helps a newcomer reach a useful first action                     | Fresh-workspace task walkthrough                                                                                                         |
| 4        | Shared terminology, guided/manual path explanation, contextual help | Reduces the amount of domain knowledge needed                    | First-click tests and novice task sessions                                                                                               |
| 5        | Density controls, library filtering, visual refinement              | Improves repeated use without hiding capability                  | Compare task time and errors with frequent users                                                                                         |

This order does not require removing lifecycle approvals or making unknown execution state look successful. The interface can explain the existing safeguards more clearly.

Phone-specific navigation, touch optimization, and mobile intake redesign are excluded. Desktop resizing and accessibility remain in scope. Define supported desktop dimensions before using them as release gates.

## Additional checks for the desktop product direction

These are proposed evaluation areas, not defects established by the browser walkthrough:

- **Work beside a coding agent:** keep the selected project, next action, and essential evidence usable in an agreed side-by-side window arrangement.
- **Move between applications:** preserve the project and journey context when opening an agent, returning to AppraiseJS, or recovering an interrupted handoff.
- **Distinguish durable state from connectivity:** show what has actually been received, when it was last checked, and whether user action is required. Do not infer live worker availability from saved workflow state.
- **Support keyboard-led work:** verify command search, shortcuts, dialog focus, error recovery, and movement between review and evidence surfaces.
- **Resume work:** as the desktop shell is implemented, test reopen/restart behavior, retained context, background work visibility, and notifications for decisions or meaningful completion. These capabilities were not assessed here.

## How to measure familiarity and retention

Run a small formative study across the intended audience: an automation engineer, a manual QA practitioner adopting coding agents, a developer familiar with an agent but new to AppraiseJS, and a domain expert collaborating through an agent. Include participants who use assistive technology and people less comfortable with English technical vocabulary. Do not treat a small sample as representative of every background.

Give participants a fresh project and ask them to:

1. Explain what AppraiseJS does and choose where to start.
2. Draft a requirement, choose a test location, and identify what happens next.
3. Connect their supported coding agent, resolve a setup obstacle, and return to the correct journey without losing context.
4. Find an existing test and explain how cases, suites, and runs relate.
5. Read prepared result fixtures and distinguish failure, uncertainty, and success.

Run sessions on desktop, including the agreed minimum window size and a side-by-side editor/agent arrangement. Record unassisted completion, first-click accuracy, wrong turns, requests for help, time to first meaningful outcome, handoff failures, and confidence in the result. Repeat a task after a few days to measure recall.

Suggested **targets to validate**, not measured results: users can explain the product and choose a starting point within two minutes; produce a usable brief within ten minutes when prerequisites are ready; and identify the next required actor/action without facilitator help. Establish a baseline before adopting these as release gates.

Measure retention separately through repeat useful work, completion of subsequent journeys, and whether users return to AppraiseJS for quality decisions during coding-agent work. Optimize for dependable decisions and low interruption cost rather than time spent staring at the application. A pleasant screenshot cannot establish that the product retains users.

## Evidence and limitations

Findings marked Observed came from the browser session. Source references explain implementations and likely causes; they are not substitutes for observed user behavior. The review did not exercise graph editing, completed executions, triage, closure, or populated report analysis. Those need a second walkthrough with representative fixtures before judging the whole product experience.

The planned desktop shell, agent integrations end to end, minimum desktop window size, and accessibility zoom were not validated. Phone observations remain in the record for traceability but are outside the current product scope. The original mobile-first priority was inappropriate for the clarified product direction and has been withdrawn.

The evaluation used [Nielsen Norman Group’s usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/) as a framework for status visibility, familiar language, consistency, error recovery, and help, and [W3C’s WCAG 2.2 reference](https://www.w3.org/WAI/WCAG22/quickref/) for accessibility checks. This is a findings report, not accessibility certification or a claim about measured retention.
