# Chat-first redesign tasks

The [original plan](PLAN.md) defines the intended experience. [STATUS.md](STATUS.md) records the merged baseline,
evidence, and decisions. The starting checkpoint is `appraise-0.5` at `d0024552d603159fbf4dea34c372109313f49662`.
Recheck it when beginning a task. **Ready** tasks can start now. **Open** tasks follow their listed dependencies.

Use the nearest existing source, focused tests, and the [repo validation matrix](../../../../../docs/agent-validation-matrix.md).
For interactive UI checks, inspect the rendered Appraise app with the repository’s browser harness. Run a production
build for broad changes and refresh scaffolds from canonical source when the change is scaffold-relevant. Attach
evidence for the exact build and fixture to the task outcome.

## Checkout in chat

### CF-01 · Render proposed checkout checks in chat

**Verified locally and included in the CF-01–15 branch checkpoint · Phase 3.**

Use CopilotKit’s headless React integration and validated AG-UI events to render **Proposed checks** on a saved
Appraise chat using a deterministic checkout fixture. Reuse the existing composer, project scope, and Journey
projection where they fit. Establish the smallest typed contract and event path required for this slice. Check
the dependency’s current API, licensing, and local deployment implications during implementation.

- [x] The fixture renders one typed card in the intended chat, with verified project, Journey, and revision identifiers.
- [x] Unsupported or invalid events and repeated events leave the chat readable and create no duplicate card or Appraise effect.
- [x] A reload reopens the saved conversation and displays the same checks. Focused contract, rendering, and browser tests pass.

Start with the [conversation route](<../../../../../src/app/(base)/conversations/[conversationId]/page.tsx>),
[conversation service](../../../../../src/services/conversation/conversation-service.ts), and
[Journey projection](<../../../../../src/app/(base)/quality-journeys/[journeyId]/journey-focus-projection.ts>).

### CF-02 · Show review revisions and reconnect from saved state

**Verified locally and included in the CF-01–15 branch checkpoint · Phase 3.**

- [x] **Review changes** shows only the changed checkout criterion when the user asks for an order number. The current revision remains visible after reload.
- [x] Reconnect restores the current snapshot and handles missed or duplicate events. A manual change while a review is open invalidates the old card.
- [x] Provider switching keeps the transcript and respects an outstanding unresolved effect. Focused tests exercise reconnect, late events, and stale cards.

### CF-03 · Clarify scope and approve the exact review in chat

**Verified locally and included in the CF-01–15 branch checkpoint · Phase 3.**

- [x] **Question** asks for the missing consequential choice when the target is ambiguous, and the answer follows the existing Journey scope.
- [x] Typed approval and an optional button submit the same current review revision through the canonical Appraise service. Manual and chat views display the same decision.
- [x] Wrong-project, stale-revision, and duplicate approvals are refused or return the existing result without a second effect.

### CF-04 · Request execution permission and show observed activity

**Verified locally and included in the CF-01–15 branch checkpoint · Phases 3–4.**

- [x] **Run permission** shows the exact reviewed scope and records separate execution consent before the approved test enters the canonical runner.
- [x] **Activity** displays recorded run status and restores the current state after pause or reconnect.
- [x] Tests cover expired or changed consent, duplicate sends, and interruption with an unknown outcome. Reconnect and provider switches preserve the original attempt.

Production Chromium checked that a changed environment refused a previously issued approval and left zero runs.
The [status](STATUS.md) records the original consent, the new reviewed scope, and the recovery check.

### CF-05 · Open checkout evidence from the chat result

**Verified locally on Turbopack build `_h0FpJF_zxaTH_sffUWwQ` and included in the CF-01–15 branch checkpoint · Phases 3–4.**

- [x] **Result and evidence** shows the observed outcome and distinguishes failed, skipped, and unverified work.
- [x] The failure variant reports the missing order number, and “Show me where” opens the correct step and evidence in context.
- [x] Verify the result, evidence link, and scope from both chat and manual run/report views after reload.

### CF-06 · Verify the complete checkout and case-edit pilots

**Verified locally · Phases 3–4 · Same-Journey checkout and case-edit pilots.**

- [x] On a disposable checkout project, walk the brief, revision, review, separate run consent, execution, and evidence with one passing and one deliberately failing fixture. Include a manual edit during review, pause, reconnect, and a return visit.
- [x] Find and rename a case in chat, edit it manually, and reopen the same conversation with its updated record. Verify that the case keeps the same project scope and identity.
- [x] Record the canonical actions, scope/revisions, outcomes, and attempt counts. Use local or synthetic provider fixtures here. Log any remaining live provider cases for CF-19.

The [CF-06 checkpoint](STATUS.md#cf-06-working-branch) records the gate for broad domain migration.

## Shared UI and domain work

### CF-07 · Audit the existing compact workspace patterns

**Verified locally · Phase 2 · Rendered baseline and scoped case round trip recorded.**

- [x] Check the six original surfaces at the same viewport and with comparable fixtures. Record implemented patterns and concrete gaps in hierarchy, disclosure, density, and navigation.
- [x] Verify one list-to-editor round trip with search, filters, selection, and scroll. Record keyboard, narrow-layout, theme, and touch gaps from the rendered flow.
- [x] Identify the shared components to reuse and the smallest changes needed by CF-08–CF-15. Capture the baseline for CF-17.

Use the [design walkthrough](../../../../../docs/design/chat-first/README.md) and
[navigation concept](../../../../../docs/design/chat-first/navigation.md) alongside the current app.
See the [CF-07 audit checkpoint](STATUS.md#cf-07-audit-checkpoint) for the rendered surfaces and the project-scoping
failure on the list-to-editor path.

Use the [action inventory](../../../../../docs/design/chat-first/action-inventory.md) to expand each domain below
into explicit action batches as work begins. The [domain checkpoint](STATUS.md#domain-migration-checkpoint) records
the current evidence for these lanes. For each batch, verify the rendered manual path and the matching
chat text path against the same canonical service or guarded user decision. Record the resulting Appraise
record or effect, project scope, and recovery case.

CF-08–CF-15 have local implementation and production-build evidence for their principal paths. The checkpoint
lists the tested actions and follow-up cases. CF-16 tracks the remaining inventory-wide parity.

| Task                                   | Dependencies | Deliverable and acceptance                                                                                                                                                                                                                    |
| -------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CF-08 · Authoring collections          | CF-06, CF-07 | Apply the compact list patterns to modules, suites, cases, tags, and templates. Verify find, selection, and supported bulk operations with return state and exact targets.                                                                    |
| CF-09 · Authoring editors              | CF-08        | Consolidate case and step editors, suite and module membership, tags, templates, and publication. Verify saved edits survive switching views, and stale edits or duplicate submits preserve the correct revision.                             |
| CF-10 · Projects and environments      | CF-06, CF-07 | Consolidate project switching, project setup, and environment controls. Verify scope on links, chat, editors, and reopened records. Preserve drafts on validation errors and keep secret entry on provider or Appraise-owned secure surfaces. |
| CF-11 · Locator and settings workflows | CF-10        | Apply the shared patterns to locators, inspection, settings, and help. Verify the locator capture-to-editor flow, cancellation or missing target, and actionable setup feedback.                                                              |
| CF-12 · Journey lifecycle controls     | CF-06, CF-07 | Extend the checkout patterns to Discovery, reviews, preparation, and closure. Verify current revision, ownership, decision, and recovery behavior through chat and manual entry points.                                                       |
| CF-13 · Run controls and recovery      | CF-12        | Consolidate execution, cancellation, remediation, and rerun surfaces. Verify observable state, separately authorized reruns, and interruption recovery with original evidence preserved.                                                      |
| CF-14 · Reports and evidence           | CF-06, CF-07 | Consolidate dashboard metrics, comparisons, diagnostics, evidence links, and supported exports. Verify filtering and return state, scoped links, and missing evidence handling. Coordinate with CF-13 where run state is shared.              |
| CF-15 · Collaboration controls         | CF-14        | Consolidate collaboration proposals, exact-scope decisions, and recovery. Verify the equivalent chat path with stale decisions, interrupted operations, and durable history.                                                                  |

## Qualification and release

### CF-16 · Close the action-parity matrix

**In progress · Phase 5 · Depends on CF-08–CF-15.**

The [action inventory](../../../../../docs/design/chat-first/action-inventory.md) maps the current text effects
and guided manual entry points. Root module, tag, environment, and suite creation commit the guarded record and chat
reply together. A typed Run permission reply commits with the canonical consent and reservation. Production
Chromium verified these authoring round trips with saved Codex and Claude Code lookup preferences. The earlier
checkout verified typed run consent. Focused coverage includes replay, duplicate records, stale consent, and
project scope. R12 Chromium verified exact attached-case suite membership, suite rename by name and module,
and filter-tag rename by current name and expression with both saved lookup preferences. The default fixture's
module rename was refused by the same shared-resource coverage check used on the manual path. The inventory still
includes manual actions without text equivalents.

R15c and R16c Chromium verified named bulk suite membership, typed stop with the original Activity after reload,
creation from a legacy linear template, same-record locator-group rename, and a real picker capture with return to
the original chat. R17 verified typed and sidebar project switching, exact switch redelivery after a later choice,
and an environment rename that invalidates an older permission. These checks used disposable SQLite and
Turbopack production builds. The [status](STATUS.md) records build identities and remaining coverage.

- [ ] Inventory rendered row and bulk actions, keyboard affordances, and state-dependent controls. Assign each supported action an owning area, manual and chat entry points, a canonical outcome, and evidence.
- [ ] Verify each supported effect and recovery with local or synthetic fixtures for the intended engines. Record the supported actions per engine and carry live cases to CF-19.
- [ ] Verify manual deep links, filters, drafts, decisions, and historical evidence survive a return visit or upgrade.

### CF-17 · Verify first use, density, and accessibility

**In progress · Phase 5 · Automated layout, input, and density checks recorded.**

R5 passed 16 automated axe scans and an interrupted lookup's reduced-motion keyboard recovery. R6 adds a polite
saving announcement and preserves composer focus while preventing duplicate submits during a held response. The
production Chromium hold confirmed one request and one stored message. Uncoached first use and manual
screen-reader checks remain open. The R8 first-use participant got through saving a brief and found two entry
blockers. The form asked for a managed worker without explaining its role. The general setup link returned to the
same unavailable Codex Journey. The saved record remained at Analysis with zero attempts. Follow-up work puts
provider, model, effort and a text-file attachment beside the brief, with a guided provider-specific setup check.
R12 production verified a return to the exact project and review location, recovery into an available Claude Code
draft, and preservation of later edits after reload and redelivery. The original Journey retained zero attempts.
The participant later approved two checkout scenarios. Preparation stopped with no test run. R18b verified the
recovery controls on disposable copies and provided a fresh draft with the heading locator and text checks the
approved scope needs. The first-use session still needs to verify the failed check and return to work.
The participant subsequently completed one approved execution cycle with valid evidence. Direct navigation
passed and both heading checks failed during setup, before evaluating the heading. R19 addresses the missing
per-scenario setup and brings recorded outcomes and retained evidence notes into Results. The heading check
and final report review remain open for this session.

- [ ] Walk a first-time user through checkout, a scope change, a failed check, and return to unfinished work. Compare browse and decision time and useful records per viewport with the Phase 2 baseline.
- [ ] Exercise keyboard and screen-reader flows, light and dark modes, reduced motion, 200% zoom, touch, and narrow layouts.
- [ ] Cover empty projects, long records, slow responses, stale decisions, and interrupted activity. Record any access or usability failures before release.

### CF-18 · Qualify packaging and cutover

**In progress · Phase 5 · Final reviewed packages rehearsed on macOS and Linux arm64.**

R4 through R8 rehearsed matching `0.4.0` tarballs on macOS and Linux arm64. The [status](STATUS.md) records the
package hashes, predecessor fixtures, and R6 disposable application restoration. The R6 packed scaffold passed
26 Claude-only and 17 ChatGPT-only synthetic setup tests. R8 passed 40 Claude-only and 45 ChatGPT-only synthetic
tests, a disposable M11 activation and database rollback, and all 15 named release commands run with streamed
logs. All 15 canonical R17d release commands passed with streamed output. The one-file browser-spec follow-up
passed Chromium and was included in the repacked artifact. Live Claude-only setup still needs an isolated Mac.

- [x] Rehearse packed fresh install, upgrade, and rollback. Verified on macOS and Linux arm64 with matching final reviewed `0.4.0` tarballs and 106 migrations. The macOS M11 activation rehearsal preserved four historical records and restored the original SQLite bytes.
- [ ] Check provider-specific setup without another provider installed, including the planned Claude-only and ChatGPT-only cases. Update scaffold, onboarding, help, and operator instructions based on observed behavior.
- [ ] Run the [release checks](../../../../../docs/release-readiness.md), record the candidate revision and package identities, and close outstanding cutover work before beginning live checks.

### CF-19 · Run final live provider validation

**In progress · Phase 5 · Same-build live lookups and two-page managed Journey passed.**

Draft confirmation binds the official Claude Code worker choice to the saved Journey. The original attempt
retains its selected provider, including after interruption. The R4 Claude Code build verified against Anthropic's
signed release. Its connected profile yielded one UNKNOWN Analysis attempt and one FAILED lookup.
The separate R5 fixture recorded an UNKNOWN Analysis attempt. A minimal connection probe identified an
authorization-related error. Neither Journey reached the runner. After the user reconnected, a fresh R5 Claude
lookup matched the intended project, excluded another project's decoy, and reopened its single completed
attempt. Both UNKNOWN attempts remain preserved.

The post-renewal R5 managed Journey completed Analysis, Scout, and Resource Explorer. Scenario Designer recorded
one UNKNOWN outcome during output validation with sender cleanup proved and zero canonical submissions. A fresh
macOS R6 Journey completed all four roles and the exact scenario review, then its first Automator attempt recorded
UNKNOWN during semantic validation. Neither Journey reached execution permission or the runner. All four UNKNOWN
attempts are preserved.

R8 requires Claude's Automator proposal to include every approved scenario. On the final macOS build, a fresh single-route
Journey completed all six roles, consumed one reviewed chat consent, ran once, and reopened its passing evidence.
A separate two-route fixture stopped at review with the second route uncovered by Discovery.

On R12 the fresh two-page fixture captured and reviewed both routes before Scout dispatched. All six roles
completed once. One typed chat consent authorized the two prepared Chromium checks in one execution cycle.
Both results passed and returned after switching the lookup provider. The previous UNKNOWN attempts remained intact.
On R17d a fresh browser **Start journey** completed one live Claude Code Analysis with Sonnet and Low effort.
The original attempt reopened, and the fixture had no execution consent or run.
The first-use Journey later recorded a separate UNKNOWN during preparation output validation. R18b preserved that
record and verified the separate manual recovery on a copy with zero native dispatches or test runs.

- [x] Run ChatGPT, Claude Code, and Cursor individually on the same release build. Reuse valid account sessions and request user sign-in where required. Verify a reviewed lookup yields the expected case, excludes another project’s decoy, and persists after reopening. Passed on macOS R12 build `NykQzmGxHcI1FqLbl9FXe`.
- [ ] Run remaining lifecycle and checkout Journey qualification only for the engines and platforms that are intended to support those flows. Verify prior evidence still applies, including disconnect, expiry or revocation, interruption, and provider switching.
- [x] Record the build, provider versions, fixtures, scope, and outcomes. The [status](STATUS.md) records the R12 artifact, live lookup matrix, reviewed two-page fixture, run permission, observed results, and unchanged UNKNOWN receipts.

## Handoff after each task

The coordinator owns dependency transitions, shared source integration, and build evidence. The execution and UI
implementers can work in parallel on disjoint CF-04 files. CF-07 can audit against the prior verified build while
CF-04 compiles and runs. CF-05 preparation can identify the sealed evidence and fixture inputs during CF-04, then
implementation follows the CF-04 evidence. CF-06 qualifies the integrated pilot before the domain lanes start.

After CF-06 and CF-07, assign the ready domain chains to separate owners as slots become available. Authoring owns
CF-08 → CF-09, project setup owns CF-10 → CF-11, Journeys owns CF-12 → CF-13, and reports owns CF-14 → CF-15.
The coordinator schedules CF-16 and CF-17 after their inputs settle. CF-18 owns packed qualification after both
pass. CF-19 starts against the selected release candidate with the required provider sessions.

Record the commit or PR, verified acceptance criteria, test evidence, remaining gaps, and the next ready task in
[STATUS.md](STATUS.md). Keep a task open when its required evidence is pending.
