# AppraiseJS desktop UX implementation checklist

Status: in progress; Phase 1 implemented after recording the Phase 0 baseline.

[Implementation plan](desktop-ux-improvement-plan.md) · [Review](../docs/reviews/appraisejs-ux-ui-review-2026-09-07.md)

Complete a task only after its acceptance criteria and verification in the plan pass. Keep blocked tasks unchecked and record evidence below. Phone support and desktop-shell migration are excluded.

## Phase 0 — Establish the implementation baseline

- [x] 0.1 — Refresh evidence and create representative fixtures
- [x] 0.2 — Record supported desktop and agent behavior
- [x] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Phase 1 — Make state and agent setup trustworthy

- [x] 1.1 — Define one human-facing status projection
- [x] 1.2 — Align journey list, detail, and handoff messages
- [x] 1.3 — Provide contextual agent setup and return navigation
- [x] 1.4 — Make launch and recovery feedback accurate
- [x] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Phase 2 — Make desktop interaction accessible

- [x] 2.1 — Correct shared field and error associations
- [x] 2.2 — Improve meaningful text contrast
- [x] 2.3 — Verify desktop resizing, zoom, and keyboard continuity
- [x] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Phase 3 — Help users reach their first useful outcome

- [x] 3.1 — Give an empty workspace an actionable dashboard
- [x] 3.2 — Make manual run prerequisites recoverable
- [x] 3.3 — Save drafts only after meaningful input
- [x] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Phase 4 — Make the product model understandable

- [ ] 4.1 — Consolidate vocabulary and validate navigation grouping
- [x] 4.2 — Add contextual help and a worked example
- [x] 4.3 — Resolve the empty Settings destination
- [ ] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Phase 5 — Improve focus and repeated use

- [ ] 5.1 — Refine journey visual hierarchy
- [ ] 5.2 — Improve Step Definition browsing density
- [ ] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Phase 6 — Verify the complete desktop workflow

- [ ] 6.1 — Run integrated regression and delivery checks
- [ ] 6.2 — Evaluate familiarity with intended users
- [ ] Phase checkpoint: record acceptance, validation, docs/sync, and unresolved risks.

## Evidence log

| Phase / task  | Commit                 | Verification and outcome                                                                                                                                                                   | Blockers / next action                                                                                 |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Phase 0       | `509bdfcc`             | Baseline and support matrix recorded in `desktop-ux-phase-0-baseline.md`; existing isolated tests remain the fixture authority.                                                            | Minimum native window size remains a Phase 2 product decision.                                         |
| Phase 1.1-1.4 | `efc77bcb`, `509bdfcc` | `npx vitest run` on the Phase 1 projection, list, detail, handoff, project, and SQLite handoff suites; `npm run validate` (1,008 unit and 36 Chromium E2E tests); `npm run build`; Fallow and React Doctor commit gates; live 1440x1000 recovery and setup-return walkthrough with no browser console warnings or errors. | Codex is the only implemented provider; Claude Code and Cursor remain unavailable rather than implied. |
| Phase 2.1-2.3 | `39a65826` | Shared-control component tests and ESLint; calculated token contrast; live accessibility-tree/error/focus verification; Playwright geometry at 1440x1000, 1280x800, 960x720, exploratory 720x800, and 200%/400% effective reflow. | No supported-width clipping reproduced; native VoiceOver/NVDA was not automated. See `desktop-ux-phase-2-evidence.md`. |
| Phase 3.1-3.3 | `4424cfb0` | Dashboard state, manual prerequisite, project-scope, and intake autosave tests; live dashboard/run-form/intake walkthrough; canonical template sync. | In-app Browser was unavailable because the Mac was locked; the documented Playwright CLI fallback was used. See `desktop-ux-phase-3-evidence.md`. |
| Phase 4.1-4.3 | `c319b44b` | Vocabulary/navigation tests; live command search, Help, Settings, active-project links, keyboard, and console walkthrough; canonical template sync. | Intended-user first-click validation has not occurred, so navigation groups remain unchanged and Task 4.1/checkpoint remain open. See `desktop-ux-phase-4-evidence.md`. |
