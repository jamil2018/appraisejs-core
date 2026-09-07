# Desktop UX Phase 6 engineering and research evidence

Date: 2026-09-08

## Engineering verification

The integrated run used the merged Phase 1-5 state at `53100de1dea4f56fae93547ac0d798aa61bab794`. The fixtures and tests use isolated databases or seeded E2E state; no execution was started against the user's active project.

| Area                                    | Evidence                                                                                                                                                           | Result                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Fresh workspace and first useful action | Dashboard empty/untested projections, readiness actions, Journey draft tests                                                                                       | Passed; an empty or untested project is not presented as healthy evidence.       |
| Brief and draft continuity              | Intake navigation-only, substantive edit, conflict, retry, and resume tests                                                                                        | Passed; navigation alone creates no record and substantive drafts resume.        |
| Agent handoff and recovery              | Prepared, launching, launched, connected-without-work, failed, expired, and unknown projection/service tests                                                       | Passed for the implemented Codex contract with stale observations kept explicit. |
| Questions and review                    | Required-question precedence, analysis/scenario review, durable decision, and version-binding tests                                                                | Passed; competing attention remains visible and approvals bind exact revisions.  |
| Prepared execution and consent          | Runtime capsule, exact-operation consent, Journey execution overview, and project-scope tests                                                                      | Passed; no UI-only execution authority was introduced.                           |
| Results, triage, and closure            | Failed/evidence-limited triage, full-report review, immutable closure, artifact navigation, and linked follow-up tests                                             | Passed; unknown and unresolved evidence remains disclosed.                       |
| Manual authoring and prerequisites      | Case Template, Test Case, Test Suite, Create Run, prerequisite recovery, and form-preservation E2E paths                                                           | Passed.                                                                          |
| Project isolation                       | Project-scoped services, selection normalization, dashboard queries, Journey operations, and isolated E2E seed                                                     | Passed.                                                                          |
| Navigation and repeated use             | Primary route matrix, Help/search aliases, Settings links, Step Definition combined filters and view parity                                                        | Passed.                                                                          |
| Desktop accessibility                   | Phase 2 geometry at 1440x1000, 1280x800, 960x720, exploratory 720x800, 200% and 400% effective reflow; semantic naming, error association, Escape/focus continuity | Passed for browser geometry, keyboard, and semantic checks previously recorded.  |

Terminal commands on the integrated commit:

- `npm run validate`: 232 unit files / 1,028 tests and 36 Chromium E2E tests passed.
- `npm run build`: production compilation, type checking, page-data collection, and route generation passed.
- `npm --prefix packages/create-appraisejs test`: 12 files / 73 tests passed.
- `npm run release:check`: all 14 active findings and every named verification command passed.

No unresolved P1 was found within the implemented engineering scope. PRs #287 through #291 each reached terminal green CI before merge into `appraise-0.5`.

## Explicitly untested or excluded combinations

- Codex is the only implemented provider contract. No real Codex process was launched during Phase 6, so current live connectivity is not claimed.
- Claude Code and Cursor have no provider-specific setup, launch, or Journey adapter and were not tested as supported providers.
- Native VoiceOver and NVDA sessions were unavailable. Browser semantics and keyboard behavior passed, but this is not native assistive-technology certification.
- The in-app Browser remained unavailable while the Mac was locked. The full Chromium Playwright suite supplied browser evidence; no Phase 6 manual screenshot comparison is claimed.
- Native desktop restart, background service, updater, notifications, phone layouts, telemetry, and external analytics remain outside this plan.

## Intended-user study — blocked

Task 6.2 requires real formative sessions with developers, QA practitioners, domain experts working with agents, and participants with accessibility needs. No participants or anonymized session observations were supplied or available during this implementation run. Therefore:

- participant count: 0;
- no completion time, wrong-turn, help-request, confidence, setup-failure, or repeat-recall result is claimed;
- the proposed two-minute orientation and ten-minute brief targets remain hypotheses;
- Task 6.2 and the Phase 6 research checkpoint remain unchecked;
- the next action is to recruit participants, run the tasks against this merged build, and append anonymized observed results.

Phase 4 navigation regrouping remains pending for the same evidence reason. The vocabulary consolidation shipped, but the current navigation groups were deliberately preserved until first-click findings exist.
