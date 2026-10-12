# Journey transition UI task list

Status: proposed; all tasks unstarted. [Plan](plan.md) · [Screen sketches](screens.md). No lifecycle policy or live Journey changes are authorized by this checklist.

## Design reference for every slice

Read the [wireframe guide and state-to-task map](wireframes/README.md) and open the [interactive wireframes](wireframes/index.html). Each slice must compare its implemented screens with the mapped wireframes and record intentional deviations; mock transitions and sample values are not production authority.

## U00: Confirm task and decision contracts

- [ ] Implement and verify the slice.

**Dependencies:** None. **Scope:** S; split if actual work spans independent concerns.

**Likely files:** presentation.ts; query-service.ts; coordinator action/service contracts; this plan. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Create exhaustive fixtures for every canonical stage plus paused, blocked, unknown, missing data, revisions and cycles; inventory each CTA to its exact service, revision and consequence, including a report with both remediation approval and risk closure eligible. Preserve required human gates and harmless-run consent policy.

**Verification:** Review the state/action matrix against current contracts; resolve every fallback explicitly. No UI-only permission rules.

## U01: Build the coherent task projection

- [ ] Implement and verify the slice.

**Dependencies:** U00. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** src/lib/quality-journey/journey-task-presentation.ts (new); presentation.test.ts; quality-journey-query-service.ts; query-service tests. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Produce one read-only discriminated task from coherent scoped data. Include operational/revision freshness, safe action descriptors and explicit unknown states; exclude secrets. Correct paused/unknown precedence.

**Verification:** Table-driven all-stage/overlay and pairwise conflicting-decision tests; reordered observation and wrong-project tests; no mutation on read.

## U02: Introduce the guided shell and history routing

- [ ] Implement and verify the slice.

**Dependencies:** U01. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** Journey page.tsx; new journey-flow-shell.tsx; new journey-current-task.tsx; journey-anchor-navigation.tsx; route tests. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Render only the active task and compact outline; preserve accessible current/past navigation, legacy anchors and artifacts links. Future/history forms cannot submit; feature flag defaults remain explicit.

**Verification:** Route/component fixtures for every task and unknown fallback; Back/Forward/deep links; no hidden mounted off-stage forms. Initial shell stays internal until all U03–U08 task variants pass.

## U03: Deliver clarification and approach review

- [ ] Implement and verify the slice.

**Dependencies:** U02. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** analysis-review-controls.tsx; AnalysisDocument source (extract a focused component if needed); analysis-review-controls.test.tsx; quality-journey-actions.ts; new scoped form-draft helper if needed. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** One relevant form/review at a time, accurate save state, preserved answer lineage, action-specific feedback and version-pinned review. Define persistent draft scope or explicitly warn about unsaved navigation; no implied autosave.

**Verification:** Happy path, rejected/stale submit, corrected question, partial answer failure and reload behavior; prove save does not approve.

## U04: Make waiting and updates safe

- [ ] Implement and verify the slice.

**Dependencies:** U02, U03. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** journey-status-observation.tsx; observation tests; new task-controller hook; task-controller tests. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Auto-reveal only from passive waiting after a fresh coherent read; pin human review/history even when pristine. Pause/revoke invalidates actions immediately without losing text. No browser dependency for provider lifetime.

**Verification:** Out-of-order snapshots, operational-only update, dirty/pristine review, pending submit/lost reply, cross-tab/project switch and offline/reconnect tests. Accessible live announcements and focus behavior.

## U05: Simplify access and scenario review

- [ ] Implement and verify the slice.

**Dependencies:** U02, U04. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** discovery-browser-panel.tsx; scenario-portfolio-review.tsx; scenario review tests; route tests. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Access controls appear only when required and keep existing policy; scenario list is primary, graph optional, selection explicit, feedback scoped per item or portfolio. Partial approvals retain remaining work and blockers.

**Verification:** Protected-access/missing environment fixtures; partial/bulk decision, blocking comment, coverage-gap and revision invalidation tests; no blanket default selection.

## U06: Separate run setup, permission and progress

- [ ] Implement and verify the slice.

**Dependencies:** U02, U04. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** journey-execution-status.tsx; journey-execution-controls.tsx; execution controls tests; task projection fixtures. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Render current-cycle setup/permission/ready/running/cancelling variants; show scope/effects and accurate command consequence. Preserve existing separate grants, launches and rerun approvals; older cycles are read-only history.

**Verification:** Consent requested/granted/expired/revoked/consumed; harmless-run policy; changed environment; lost grant/start reply; rerun scope; stop requested vs observed cleanup. No combined action in this slice.

## U07: Clarify corrections and closure

- [ ] Implement and verify the slice.

**Dependencies:** U02, U04. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** triage-report-panel.tsx; closure-panel.tsx; triage panel tests; closure panel tests. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Replace ambiguous remediation approval label; separate report-change feedback, correction rationale, terminal closure and risk acceptance. Preserve mandatory rationale and full coverage/risk visibility.

**Verification:** Correction successor, report revision, risk-accepted failure, remediation-plus-eligible-risk-closure and successful closure fixtures; stale report decisions reject; no closed-equals-passed styling.

## U08: Make recovery the active task

- [ ] Implement and verify the slice.

**Dependencies:** U02, U04. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** journey-recovery-panel.tsx; coordinator-handoff-panel.tsx; recovery panel tests; task projection fixtures. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Pause is an on-demand control; paused/unknown/blocked shows the permitted remedy or responsible actor. External handoff is outside Analysis and remains available for external mode; managed mode needs verified backend status.

**Verification:** Lease/ownership loss, ambiguous dispatch, unsupported status, no worker activity, external handoff expiry and paused cleanup fixtures. No auto-resume or fabricated managed readiness.

## U09: Qualify the entire flow and retire the dashboard composition

- [ ] Implement and verify the slice.

**Dependencies:** U03–U08. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** Journey route tests; browser/UI fixtures; operator/lifecycle/component docs; migration evidence. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Every stage/gate/history path is reachable with one active task and no duplicate summaries. Keyboard/mobile/long-content states work. Record novice-task results and compare navigation effort before enabling default.

**Verification:** Focused ESLint/Prettier/Vitest, Browser-plugin observation at 320/768/1024/1440, accessibility checks, novice exercises, exact-artifact review; root scaffold/graph sync and appropriate build/static checks.

## U10: Connect the qualified managed runtime

- [ ] Implement and verify the slice.

**Dependencies:** U09; app-server M06, M11 and required installation/containment gates. **Scope:** M; split if actual work spans independent concerns.

**Likely files:** Task status/query integration; managed runtime UI contract tests; app-server M07 evidence. Existing filenames refer to their current Journey route/lib/service locations; new filenames are proposals.

**Acceptance:** Consume authoritative managed runtime status in the same task envelope; never add a second dashboard/status authority. Structured questions and accepted submissions drive the established forms. Retain explicit host mode/legacy binding.

**Verification:** Managed no-chat end-to-end questions/reviews/run/report/recovery path, provider completion without artifact, duplicate wake/lost acknowledgement and rollback to external mode.

## Checkpoints and sequence

- U00–U01: accept the exact action/state mapping before UI implementation.

- U02–U04: internal guided Analysis proof, including review-pinning and stale/lost-reply behavior.

- U05–U09: complete all required task variants before default cutover; preserve read-only history and legacy URLs.

- U10: integrate managed mode only after backend recovery/containment qualification; existing external mode remains truthful.

Projection/schema and observation/controller contracts are sequential shared work. Once stable, scenario, execution and results panels may have separate owners. Never overlap writes or revert unrelated work.

## Required implementation validation

Use affected-file `npx eslint`, `npx prettier --check`, and `npx vitest run <affected-tests>`. For this broad UI change run relevant React static analysis and `npm run build`; read package scripts and validation matrix for exact scope. Root source changes require `npm --prefix packages/create-appraisejs run prepare-template`; run `npm run graphify:auto` for changed committed graph scopes and documentation link checks. Interactive validation uses the bundled Browser surface, with any permitted fallback reason recorded. Current planning checks are formatting, local-link verification and independent review only.

## Next proposed task

> Review this plan, the bundled interactive wireframes and their state-to-task map, and the screen sketches, the current state/action contracts and dirty worktree. Start only U00: produce the exhaustive screen/CTA fixtures and confirm presentation versus domain authority. Do not remove approval gates, implement auto-consent, start live Journeys or change current qualification status.
