# Chat-first redesign status

**Checkpoint on 2026-11-28.** Verified against `appraise-0.5` at `d0024552d603159fbf4dea34c372109313f49662`.
The attached [original plan](PLAN.md) preserves the design brief. The [task register](TASK_REGISTER.md) tracks
remaining implementation and release evidence. The working branch carries **CF-01** through **CF-07** with domain
work underway.

## Resume from the paused checkpoint

Resume from `codex/chat-first-redesign-checkpoint`. The latest local Turbopack production build is
`VuxzZ14yYDBYCNoCSXkWp`, built in a disposable checkout with isolated SQLite and an 8 GiB Node heap. The domain,
navigation, and review batch passed 35 Chromium tests. The collection test passed separately after its locator was
scoped to the confirmation dialog. Two physical checkout evidence tests and a same-Journey rerun and export test
also passed on that build. The aggregate unit command, package inventory, generated artifact, and harness checks
passed. The aggregate architecture command exceeded the release wrapper's 32 MiB capture while printing Fallow
JSON. The captured root summary showed 50 findings against its baseline of 50. Recheck the architecture commands
separately before claiming release readiness.

The user confirmed that managed Journeys should use the official Claude Code CLI already available on the
customer's machine and reuse the provider-owned sign-in. The earlier Claude feature covers connection and scoped
lookup. The managed-role implementation lanes stopped before editing source or starting processes. Resume with
these three pieces in parallel once their boundaries are agreed:

1. Add Journey-scoped provider selection at draft confirmation and preserve the provider and opaque sender
   identity in each attempt's existing dispatch reservation. Historical Journey reads need to keep working.
2. Reuse the verified CLI, existing sign-in, and restricted egress for one bounded structured proposal per role.
   Validate output through the existing Appraise gateway. Keep the original attempt when send or cleanup is unknown.
3. Wire Analysis, Scout, Resource Explorer, Scenario Designer, Automator, and Triager to the selected provider.
   Keep approvals and execution consent in Appraise. Qualify both real checkout variants and interruption without
   fallback or duplicate dispatch. Use a supported signed Codex build or qualify the changed binary before adding its pin.

CF-16 still needs inventory-wide parity evidence. CF-17 still needs uncoached first-use and screen-reader checks.
Repeat the packed verification for the final provider candidate, then perform CF-19 with the required signed-in
accounts. The [task register](TASK_REGISTER.md) has the open acceptance criteria.

## CF-06 working branch

Chromium passed the passing and deliberate failure variants on Turbopack build `vUSBl3hnU8G0BNAg_TJVS`, using
a separate migrated SQLite database and loopback checkout fixture in each run. Each started a Journey from the brief
form and linked it to a saved chat. A manual Analysis change request produced a second published revision with
an order-number requirement. Chat approved that exact revision. The synthetic coordinator used the same Journey
and project for Discovery, scenario review, and canonical materialization of one capsule.

Each chat then showed separate run permission, recorded consent and dispatched exactly one Cucumber/Chromium run.
The passing checkout confirmed the order-number title. The failing checkout omitted that number and saved the
failed title assertion, expected value, and exact report-step link. Provider selection, reload, and a canonical
pause preserved the original run and its evidence. Both variants had one consent and one execution cycle. The
related M10 SQLite suite passed five tests. The scoped case edit round trip is recorded in the CF-07 checkpoint.
Live account and provider validation remains CF-19.

## Domain migration checkpoint

Turbopack build `IDYW4vha9MrF1OLU6Ta2b` used a detached worktree, isolated SQLite, and an 8 GiB Node heap.

| Task            | Evidence on this checkpoint                                                                                                                                                                                                                                                                                                                   | Remaining qualification                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CF-08           | One Chromium collection test on `cf08-v6.db` verified five New, row Edit, and selected Edit routes with opposite cookie and URL projects. Module save returned to the owning list. Cancel kept all rows and approval removed only the two reviewed modules. Twelve focused tests passed.                                                      | Typed domain lookup and supported action parity across all collections. |
| CF-09           | The stale-case and template edit checks passed Chromium on `bm5wCJ6B6aHVWVHtPX3Qi`. A stale save kept its draft and child rows. The scoped template save returned to the same project. 187 focused editor/service tests passed.                                                                                                               | Broader authoring action parity.                                        |
| CF-10           | Chromium shared one cookie across two tabs, changed the active project in one, then created and edited an environment in the other tab's URL project. Appraise kept the environment identity and excluded the other project's records.                                                                                                        | Broader setup and settings parity across supported engines.             |
| CF-11           | Fifty-five focused tests covered scoped setup and picker authority. Four Chromium tests on build `FW3eUSwPkjuuIbmNgdH2y` covered project scope, protected Settings return, real companion capture and save, and cancellation without a saved locator.                                                                                         | Broader supported-action parity.                                        |
| CF-12           | Two separate Chromium checkouts approved the exact scenario set through typed and manual paths. A stale second tab was refused. On `bm5wCJ6B6aHVWVHtPX3Qi`, the passing Journey closed normally and deliberate failure required exact risk acceptance.                                                                                        | Live provider and protected Discovery qualification.                    |
| CF-13           | Chromium on `bm5wCJ6B6aHVWVHtPX3Qi` showed separately granted selective rerun consent, one successor run, restored Activity, and the unchanged original sealed receipt. SQLite tests covered lost runner response and refusal of a fresh key for that same proposal.                                                                          | Live interruption and cancellation qualification.                       |
| CF-14 and CF-15 | Three Chromium checks on `FW3eUSwPkjuuIbmNgdH2y` covered exact report comparison, durable report lookup, and a reviewed local Git operation. On `bm5wCJ6B6aHVWVHtPX3Qi`, report export still returned the sealed ZIP with another project in the active cookie. SQLite and local Git recovered a rejected operation with one cleanup receipt. | Broader action-parity matrix and integrated release checks.             |

The [interim harness evaluation](../../../../../docs/development-harness/cf-05-cf-08-workflow-observation.md) records
the independent review of verification evidence and handoffs.

## Qualification checkpoint

- **CF-17.** A paired Chromium run copied the CF-07 SQLite fixture and added twenty identical disposable cases.
  Baseline `2_za-4IP6KhTKvJJD9jbA` and candidate `IDYW4vha9MrF1OLU6Ta2b` each showed nine fully visible seeded case
  titles at 1280 × 800 and 390 × 844. Neither sampled page overflowed horizontally. Chromium reported actual
  200% tab zoom on `FW3eUSwPkjuuIbmNgdH2y`, with a 1280 CSS-pixel viewport reduced to 640. The new chat, Journey
  brief, and empty case list fit without page overflow. Keyboard entry into the composer worked at this zoom.
  The updated compact tables default to 20 rows for a fresh view and preserve the user's saved page size.
  On `VuxzZ14yYDBYCNoCSXkWp`, the same desktop and mobile samples showed 16 and 13 fully visible seeded titles,
  respectively, with no horizontal page overflow. Uncoached first-use timing and screen-reader observation remain open.
- **CF-18.** The macOS arm64 rehearsal installed the frozen `FW3eUSwPkjuuIbmNgdH2y` package artifacts into a fresh
  local prefix. Blank and starter scaffolds, fresh migration, database upgrade, guarded downgrade refusal, and
  backup restore passed. The restored database matched its backup byte for byte and retained the historical run,
  report, attempt, and Analysis decision. The two SHA-256 package identities were
  `ba03d4422b993fdfc7e597c66f6cfbb7e476aa610cbb69bd710414814c9b805b` for `appraisejs` and
  `d1f45fa3ce4c973bb0722dc515e891da042a76898c21f420210afa0d1b2b4d4b` for `create-appraisejs`.
  Linux arm64 prequalification used the same tarballs in an isolated Node 22.23.5 container. The packed CLI and
  both scaffolds installed, a fresh SQLite file applied all 103 migrations, and the restored file matched its backup.
  The macOS predecessor upgrade and rollback used a separate fixture. Both rehearsals preceded later source changes.
  Final artifacts and provider-only setups still require qualification.
- **CF-19.** The full local Codex Journey uses the opt-in managed worker in the operator guide. The signed bundled
  Codex `0.171.0-alpha.13.2` on this host and PATH Codex `0.166.0` do not match the two currently supported
  managed-worker executable digests. Claude Code's current Appraise integration implements reviewed lookups.
  Claude-managed Journey roles and the final same-candidate live provider matrix remain open.

## CF-05 working branch

The saved Journey chat now reads **Result and evidence** from the sealed receipt, matching TestRun, and exact
report-step relation. The card distinguishes a failed assertion, skipped work, and an unverified outcome. The
**Show me where** link and typed reply open the same project-scoped report step. The typed reply keeps that step
identity in the saved transcript for replay.

Two Chromium checkout tests passed on Turbopack build `_h0FpJF_zxaTH_sffUWwQ`. In the failing fixture the navigation
step passed and the order-number assertion failed. The report step and sealed screenshot had the same identity.
The screenshot returned PNG bytes for the owning project and a 404 for a different project. A reload, typed
reply, and pause restored the original step or run. The separate passing fixture completed one physical run.
Eight earlier Journey Chromium regressions passed on that build with a separate database. The checkout fixtures
seeded the upstream Automation checkpoint. The CF-06 pilot above verifies those stages through the same Journey.

The follow-up build `vUSBl3hnU8G0BNAg_TJVS` passed both checkout variants again and verified the scoped manual
TestRun → Report → failed-step link. The result read is bounded to the current execution cycle.

## CF-04 working branch

The uncommitted `codex/cf-03-chat-approval` stack now shows **Run permission** and **Activity** in the saved Journey
chat. The reviewed request binds the saved chat and Journey to the prepared scenario revisions, target and
environment snapshot, browser, effects, and frozen execution inputs. On approval, the canonical service checks the
current scope, grants and consumes separate consent, and reserves the runner in one transaction. Activity restores
persisted execution and TestRun state, including a pause or an interrupted run with unknown ownership.

The focused suites passed 84 tests. The two optional real-runtime cases passed in a separate run of the
14-test execution suite. Nine Chromium tests passed on
Next.js 16.4.6 Turbopack production build `dc7M1kCucO_V1Ypmzn9kA`. The CF-04 case used an isolated SQLite database
and a local checkout route. It verified no TestRun before approval, one real Cucumber/Chromium run and target visit,
a dropped approval response, a stale second tab, a lookup-provider selection change, and the same passing run after
canonical pause and reload. The Phase 7 fixture seeds upstream approval and preparation. The real runner stored the
report and Appraise recorded a completed, passing TestRun with valid evidence. SQLite service tests also covered
expired or changed scope, an interrupted runner reply, wrong-chat refusal, and original-cycle replay after pause.

Focused ESLint, Prettier, TypeScript, documentation links, scaffold regeneration, and Graphify passed. A Turbopack
development smoke check rendered the paused Activity in a separate copy of the disposable database. The Turbopack
worktree used isolated SQLite and an 8 GiB Node heap. CF-05 can use the durable run and evidence IDs from this slice.
Its missing-order-number variant still needs an executed failing assertion and scoped step evidence. Live provider
qualification remains CF-19.

The [independent harness observation](../../../../../docs/development-harness/cf-04-workflow-observation.md) records
the 8/10 workflow score and the follow-on journal, routing, and graph proposals.

## CF-07 audit checkpoint

On 2026-11-28, the independent audit used the prior Turbopack production build `2_za-4IP6KhTKvJJD9jbA` with fresh
isolated SQLite. Chrome displayed the manual dashboard, empty and populated test case lists, the create-case
editor, an active Journey created from the brief form, a synthetic failed run, and settings. The populated list
showed search, column controls, row selection, and pagination. The failed-run view led with the failed counts and
finished status and disclosed timing below. The Journey showed the current stage, focus card, Pause, Discuss in
chat, and collapsed History. No provider or test runner executed for this audit.

In the disposable project, the case row's **Edit** action omitted the project parameter. The sidebar switched to
the Legacy project and the editor displayed **Form unavailable**. The rendered round trip could not establish
return-state preservation. The shared compact `DataTable` and its per-project view memory are the starting point
for CF-08. Journey focus and disclosure and the TestRun outcome header are the starting points for CF-12 and
CF-14. Keyboard sampling confirmed the first two Tab stops. Full row-action keyboard navigation, narrow layout,
light theme, touch, and measured density comparisons remain open. A separately seeded Automation checkpoint could
not render on the prior Journey detail page. The brief-created Journey establishes the baseline for that surface.

The follow-up scoped both row and selected-case Edit links and the editor's save return. Six Chromium tests passed on
Turbopack build `pACspO6zV9-XMipXJx5ND` with fresh isolated SQLite. The case-list round trip preserved search,
column visibility, selection, horizontal scroll, case identity, and active project. It exercised keyboard edit and
touch input at a narrow viewport. The sampled navigation suite covered light and dark theme persistence, narrow and
wide layout, and scoped Journey return. The chat case pilot found and renamed the case, reopened the manual editor,
and found the manual update from the same chat. Comparative density timings and screen-reader testing remain CF-17 work.

## CF-03 working branch

The local `codex/cf-03-chat-approval` branch carries forward the uncommitted CF-01 and CF-02 changes. A saved
Journey chat displays the canonical unanswered question and records an explicit `Answer:` reply against it.
Typing **Approve criteria** or using the card button records the same exact Analysis decision as the manual Journey.
Appraise checks publication, lifecycle state, and Discovery setup before committing the decision and the chat turn.
The approved revision is visible in both views.

The focused suites passed 71 tests. Six Chromium tests passed on Next.js 16.4.6 Turbopack production build
`2_za-4IP6KhTKvJJD9jbA`. The synthetic checkout workflow answered an environment question, checked the
Discovery setup gate, and exercised both approval paths. Stale and cross-project approvals were refused.
An exact replay returned the saved turn with one canonical decision, and a new duplicate request was refused.
The in-app browser confirmed the recorded approval in chat and on the Journey page.

ESLint, Prettier, React Doctor, Graphify refresh, and scaffold sync passed. The branch is local and uncommitted.
CF-04 carries this stack forward locally. Live provider qualification remains in CF-19.

## CF-02 working branch

The local `codex/cf-02-review-reconnect` branch carries the uncommitted CF-01 changes. The checkout order-number
request records the exact displayed Analysis review and the chat turn in one transaction. A published successor
shows **Review changes**, using stable criterion IDs and the immediate published predecessor. A saved chat reads
the current Journey snapshot after reconnect and replaces a superseded card while preserving the draft.

The synthetic checkout workflow requested an order number, missed the publication while offline, and recovered
revision 2 with only the changed confirmation criterion. A later manual request cleared the superseded card.
The same chat preserved its transcript and original unknown lookup through acknowledgement and provider switching.
A focused rendering test discarded duplicate and late review events. Service tests verified exact attachment
scope, stale-request rollback, and turn replay.

The focused suites passed 57 tests. Four Chromium tests passed on Next.js 16.4.6 Turbopack production build
`C6w_ZE1gb7z-nvSa1jHGP`, including CF-01 reload, CF-02 reconnect, manual review feedback, and provider switching.
The in-app browser also confirmed the post-edit chat hid the superseded card and retained the saved request
and acknowledged lookup. The production build used a verified source snapshot, disposable SQLite, and an 8 GiB
Node heap. ESLint, Prettier, React Doctor, Graphify refresh, and scaffold sync passed. Changes remain uncommitted.

CF-03 carries these changes forward. The final live-provider checkout remains part of CF-19.

## CF-01 working branch

The local `codex/cf-01-proposed-checks` branch starts at the verified remote checkpoint `d0024552`.
The saved chat loads the exact published Analysis review linked through its Journey attachment. A validated
AG-UI presentation call supplies the check text to CopilotKit's headless renderer. **Review this version** opens
the canonical Journey control. The event renderer has no execution handler.

The focused contract, rendering, conversation, and action suites passed 26 tests. Two Chromium tests passed on
both Turbopack development and production builds, including the synthetic checkout review and the existing narrow Journey start.
The checkout test saved and reopened the chat, verified one card with the same checks and scoped review link,
and found no page errors, external requests, or additional Journey and transcript writes after reload. The
in-app browser also verified the card and followed its link to the acceptance criteria review.

TypeScript, ESLint, Prettier, React Doctor, documentation links, Graphify refresh, and scaffold preparation
passed. Scaffold preparation also synchronized the Cursor profile changes already present in canonical source
at the base checkpoint. The CopilotKit and AG-UI versions add 671 entries to the npm lockfile. The card runs
inside the local Appraise page. These changes are currently uncommitted.

The primary checkout's production build hit a CSS worker port-binding `EPERM`. A disposable worktree
compiled the baseline with Turbopack. The final CF-01 snapshot passed the full Turbopack production build and
the two Chromium checks in a second disposable worktree with an isolated SQLite database and an 8 GiB Node
heap. The Next.js 16.4.6 production build ID was `gWlIwF1p-tNzkvUxamGxJ`.

CF-07 can proceed independently.

## What shipped

| Change                                                                        | Verified scope                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PR #318](https://github.com/jamil2018/appraisejs-core/pull/318) · `40e1296f` | Graphite baseline used by the original plan.                                                                                                                                                                                                                                                                                         |
| [PR #319](https://github.com/jamil2018/appraisejs-core/pull/319) · `970ff783` | Chat-first workspace, two-tier desktop navigation, project-scoped saved chats and Journey entry points, compact collections, record attachments, and refreshed authoring and result surfaces. Chat supports bounded project reads and a case-title edit. A Journey card links to the existing scoped decision control.               |
| [PR #320](https://github.com/jamil2018/appraisejs-core/pull/320) · `64d47578` | Provider-owned Claude Code sign-in and read-only project lookup on a configured Mac.                                                                                                                                                                                                                                                 |
| [PR #321](https://github.com/jamil2018/appraisejs-core/pull/321) · `32df80fa` | Cursor subscription sign-in and lookup, plus credential storage hardening.                                                                                                                                                                                                                                                           |
| [PR #322](https://github.com/jamil2018/appraisejs-core/pull/322) · `afd00dcf` | Cursor supervisor shutdown fix, regression coverage, and a successful patched macOS lookup. The revoked test profile was refused before Appraise started another provider attempt.                                                                                                                                                   |
| [PR #323](https://github.com/jamil2018/appraisejs-core/pull/323) · `d0024552` | Cursor encrypted-profile recovery. The final code passed five first-restart recovery cycles with disposable images. A competing Appraise process and an already-mounted image were refused, and a separate attached image stayed in place. An earlier uninstrumented restart failure remains unexplained. All nine PR checks passed. |

The [workspace walkthrough](../../../../../docs/design/chat-first/README.md) records current chat and manual
entry points. [Provider proof](../../../../../docs/design/chat-first/provider-proof.md) records the live
macOS checkout evidence for ChatGPT Responses, native Codex, Claude Code, and Cursor. These lookup tests found
an existing checkout case and verified project scope. Cursor also has local disconnect, restart, and targeted
revocation evidence through the Appraise lookup path.

## Status against the original plan

| Phase                                              | Status                | Shipped or recorded                                                                                                                                                                            | What remains                                                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Design and provider proof                      | Substantial progress  | Interactive prototype, two-tier navigation concept, action inventory, and live subscription checkouts.                                                                                         | Uncoached first-use evidence and remaining setup or lifecycle coverage for the supported runtime distributions. Some native runtimes still require configured binary pins. Keep prior live evidence and defer repeat sign-ins to final qualification. |
| 2 · Compact interaction system                     | Partially implemented | Desktop and mobile navigation, theme controls, compact project-scoped collections, Journey brief and return queue, editor context links, and outcome-first reports.                            | Verify an agreed baseline in rendered screens, bring remaining surfaces onto the shared list, editor, review, and result patterns, and close return-state and accessibility gaps.                                                                     |
| 3 · Connect the agent to the interface             | Locally verified      | Saved chat supports exact questions and reviews, separate execution consent, durable activity, and scoped result evidence. The case edit round trip and interrupted execution recovery passed. | Complete action parity and live provider validation for the intended engines.                                                                                                                                                                         |
| 4 · Complete checkout Journey and domain migration | In progress           | Two disposable checkouts passed their expected outcome from the brief through sealed evidence on the same Journey. The three parallel domain lanes have started applying the patterns.         | Finish the domain acceptance paths and verify their equivalent manual and typed actions.                                                                                                                                                              |
| 5 · Qualification and cutover                      | Open                  | Focused browser, package, CI, and provider evidence exists for the merged slices.                                                                                                              | Full action parity, measured usability and density, accessibility and resilience, supported-platform fresh install, upgrade and rollback, and final live provider validation.                                                                         |

The [action inventory](../../../../../docs/design/chat-first/action-inventory.md) maps manual actions to
their owning services and package commands. Treat the inventory as a source map. Use rendered UI and tests to
establish parity for each action.

## Decisions to carry into the next chat

- Chat is the primary workspace. Keep the manual workspace fully capable with the same terminology, visual
  states, and Appraise operations. Use compact, accessible UI that a first-time user can navigate.
- Build on Appraise-owned project scope, saved chat state, and [Journey lifecycle authority](../../../../../docs/agent-lifecycle-flow.md).
  Bind decisions to the exact resource, revision, and scope. Keep review approval and run permission distinct.
  Reconnect from durable state and preserve original attempts with unknown outcomes.
- The CopilotKit and AG-UI work starts with one checkout review on synthetic data. The six planned components
  are Question, Proposed checks, Review changes, Activity, Run permission, and Result and evidence. Ordinary
  replies remain text.
- Current provider connections use the user’s ChatGPT, Claude, or Cursor subscription. Appraise has no billing
  path for this scope. The plan’s original full-Journey targets were Codex and Claude Code. Cursor’s shipped
  scope is lookup. Record supported actions per engine before the full Journey rollout.
- Run final ChatGPT, Claude Code, and Cursor checks on the same intended release build. Run them sequentially
  when convenient, reuse valid sessions, and request sign-in where the qualification case requires it. Use
  synthetic or local fixtures for routine implementation checks. The redesign is still in implementation.

## Picking up work

Recheck the branch and remote tip, then read [PLAN.md](PLAN.md), this status, the [task register](TASK_REGISTER.md),
and the repo’s [agent guidance](../../../../../AGENTS.md). Choose one ready task and use an isolated feature branch
for implementation. At handoff, record the actual commit or PR, tested behavior, gaps, and next task in these files.
Keep the original plan as the point of reference.
