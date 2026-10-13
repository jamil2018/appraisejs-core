# Codex app-server Journey migration tasks

**Latest no-model result (2026-10-14):** [request-variant results](m01-request-variant-results.md)
now capture actual additional_tools and native RPC-path decline of all four elicitation modes. Never
policy prevents forwarding in the unchanged read-only setup. Client cancellation/permission producer
paths remain unqualified; no external inference or broader permissions. M01 remains partial.

Status: active replacement roadmap adopted 2026-10-13; M00-r3 explicitly approved at f506fccb and its exact SHA-256; M00 complete as a design-contract slice. M01 has authorized preparation/no-model evidence and remains partial; M02–M13 remain unstarted. See [plan](plan.md). Existing Journey gates remain unchanged.

## Implementation references

Use the [Open Design reading map and adaptation rules](open-design-reference.md), pinned to the reviewed upstream revision. Read its relevant source/tests before each mapped slice; keep upstream observations separate from Appraise verification. M00 evidence and exact user approval are linked below; M00 is complete. M01 preparation is recorded in [M01 evidence](m01-evidence.md); native-provider qualification is outstanding. M02+ remains unstarted.

## Ordered tasks

### M00: Approve the host and authority contract

**Status (2026-10-13):** M00 complete: exact M00-r3 contract approved by the user at f506fccb; [approval record](m00-r3-approval.md) binds the full commit and SHA-256. [Contract](m00-host-authority-contract.md) · [Review evidence](m00-review-evidence.md) · [Same-branch continuation](CONTINUE-HERE.md). M00 approval itself did not start runtime work; the separately authorized M01 preparation is recorded below.

**Reference:** [Open Design guide](open-design-reference.md). Architecture and permission differences; record the host/build feasibility candidate, later support-qualification policy and Appraise authority without adopting upstream defaults.

- [x] Prepare, independently review and obtain exact approval of the M00 design contract.

**Dependencies:** None. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** docs/decisions/ (new ADR); docs/agent-lifecycle-flow.md; migration plan/register. Paths described as new are proposed, not current source.

**Acceptance:** Record opt-in managed mode, external admission mapping, session generation and no-chat policy; preserve existing GC statuses. Select the initial OS/build/auth feasibility candidate and exact support-qualification policy; no supported-runtime claim before M01/M02 evidence and M03 mandatory-session re-probes. Explicitly deny repository writes by the worker for the initial scope.

**Verification:** Contract review against all six role payloads and current handoff/claim semantics; independent review of authority boundaries.

### M01: Qualify the app-server protocol

**Latest diagnosis:** [manifest investigation](m01-manifest-investigation.md) finds a top-level-only
fixture observer and a CodeModeOnly/Responses Lite model. Whole-request tool absence was not observed.
Parser corrected with offline regressions; M01 still partial for actual request-variant qualification.
No further starts, inference or broadened permissions in this slice.

**2026-10-14 authority update:** [auth amendment 01](m00-auth-amendment-01.md) authorizes existing
login reuse and at most three inference starts. Existing native ChatGPT login check passed; [native results](m01-native-results.md) observe completion/
persistence, interruption and withheld-ack reconciliation. All three inference starts consumed; none
resent. M01 remains partial for [open request variants](m01-request-variants-remaining.md); local elicitation
fixture advertised no tools and did not qualify cancellation. Prior status below is historical.

**Status (2026-10-13):** Started, **partial; not complete**. [Evidence](m01-evidence.md) · [Prepared native-provider probe](m01-remaining-probe.md). 14 synthetic tests and 6 saved-evidence audits pass; actual-binary sentinel/local-SSE observations cover initialization, required-MCP rejection, start/resume, correlated events, interruption, unsupported requests and withheld replies. Native-auth/provider configuration and remaining permission/MCP elicitation variants are unqualified. Native probing was subsequently authorized, with built-in transport defaults and no supervisor resends; latest steering requires check-only authentication. The isolated auth check fails, with zero native starts. [Latest checkpoint](m01-native-provider-checkpoint.md).

**Reference:** [Open Design guide](open-design-reference.md). Session/protocol tests and capability handling; test the actual launched binary, including required-MCP failure.

- [ ] Implement and verify this slice.

**Dependencies:** M00. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** New disposable protocol fixture; future src/lib/quality-journey/codex-app-server/ protocol module. Paths described as new are proposed, not current source.

**Acceptance:** On an isolated exact binary, prove initialization, required-MCP failure, start/resume, turn events, interrupt and unexpected request handling; record lost-ack behavior without claiming idempotent starts.

**Verification:** Synthetic protocol tests plus explicitly authorized live disposable observations; label each evidence class and version.

### M02: Qualify scoped MCP and containment

**Reference:** [Open Design guide](open-design-reference.md). Permission-boundary comparison; independently prove Appraise MCP scoping and denied native/direct access.

- [ ] Implement and verify this slice.

**Dependencies:** M00, M01. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** src/lib/quality-journey/managed-worker-gateway.ts; packages/appraisejs/src/mcp/server-factory.ts; new disposable isolation fixtures. Paths described as new are proposed, not current source.

**Acceptance:** Demonstrate scoped role reads/submissions and rejection of forged target/generation, human decisions, broader MCP, direct database/source/credential access and unauthorized native tools. Determine auth setup without importing ambient configuration.

**Verification:** Adversarial gateway tests and live escape probes on the supported host; no containment claim from config alone. Stop if effective boundary cannot be established. M02 authority results are provisional until M03 mandatory-session re-probes pass; no product managed dispatch is permitted by M02. Explicit disposable legacy fixtures must not qualify absent-session admission.

### M03: Persist host-neutral sessions

**Reference:** [Open Design guide](open-design-reference.md). Captured start/resume handles; bind them to canonical generation, attempt and revision rather than treating them as authority.

- [ ] Implement and verify this slice.

**Dependencies:** M02. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** prisma/schema.prisma; new migration/inventory; quality-journey-coordinator-session.ts; handoff service. Paths described as new are proposed, not current source.

**Acceptance:** Persist explicit execution mode for new Journeys; preserve legacy effective owners and attempt bindings rather than blanket-backfilling external mode. Mixed/unresolved ownership requires recovery; active managed work needs explicit transfer. Provider availability never changes mode. Managed calls require a current session before first takeover; desktop compatibility and historical rows remain readable. Concurrent takeover fences predecessor inside commit transactions.

**Verification:** SQLite migration fixtures for legacy MANAGED, EXTERNAL_V1 and mixed/unknown ownership, preservation and pre-first-takeover, stale-generation, missing-binding, cross-target and concurrent takeover tests; re-probe M02 claim/admit and all six specialized writes under missing/stale/valid mandatory host sessions before M04+ dispatch eligibility; migration inventory verification.

### M04: Persist provider dispatch and wake intent

- [ ] Implement and verify this slice.

**Dependencies:** M03. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** prisma/schema.prisma; new migration/inventory; new provider-run repository; quality-journey-service.ts. Paths described as new are proposed, not current source.

**Acceptance:** Link one provider run to one WorkAttempt without double claim; durable wake/dispatch intent survives crash. Unique claims and leases prevent duplicate dispatch across supervisors.

**Verification:** SQLite lost-commit-ack, duplicate wake, competing supervisor, restart-before/after-send and revision-change fixtures.

### M05: Supervise the local process

**Reference:** [Open Design guide](open-design-reference.md). Session lifecycle and normalizer; decide per-turn child plus resume versus persistent child, and test owned cleanup and transport errors.

- [ ] Implement and verify this slice.

**Dependencies:** M01, M02, M04. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** New src/lib/quality-journey/codex-app-server/ transport and supervisor files; local package startup integration. Paths described as new are proposed, not current source.

**Acceptance:** Own a private stdio child and configuration; correlate thread/turn/run; fence failures and cap concurrency/attempts. Record unexpected RPC requests as blocked, never auto-approve.

**Verification:** Fake-process framing, partial JSON, malformed events, exit/backpressure, timeout and restart tests; owned-process live smoke with no production credentials.

### M06: Deliver Analysis with structured clarification

- [ ] Implement and verify this slice.

**Dependencies:** M03, M04, M05. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** quality-journey-analysis-service.ts; quality-journey-actions.ts; new worker gateway external-role mapping; new scheduler service. Paths described as new are proposed, not current source.

**Acceptance:** An explicitly mode-selected disposable/internal Journey produces an accepted Analysis artifact; required questions appear in existing forms; answer/revision commits trigger exactly eligible follow-up work, with zero model turns during waits.

**Verification:** SQLite full question/answer/revision loop and browser observation; missing/invalid artifact does not complete work; outcome_get resolves lost submission reply.

### M07: Expose runtime status in Journey UI

**Reference:** [Open Design guide](open-design-reference.md). Normalized presentation events; retain polling first and no-chat forms, with canonical state acceptance independent of turn completion.

Coordinate with the [transition UI tasks](../quality-journey-transition-ui/todo.md), especially U01–U04 and U10. Render status through the single current-task projection; do not add a parallel status dashboard.

- [ ] Implement and verify this slice.

**Dependencies:** M06. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** Journey page.tsx; new agent-status panel; quality-journey-status-actions.ts; presentation tests. Paths described as new are proposed, not current source.

**Acceptance:** Show queued/running/waiting/blocked/recovery states without chat or raw tool output. Preserve edited forms and exact-version decisions; desktop handoff remains only for external mode.

**Verification:** Component tests for refresh, project switch, stale status, pending edits and failure; Browser-plugin review. Retain polling first; SSE is optional later scope.

### M08: Enable Scout and Resource Explorer

- [ ] Implement and verify this slice.

**Dependencies:** M06. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** quality-journey-discovery-service.ts; external-role gateway mapping; role instructions; discovery integration tests. Paths described as new are proposed, not current source.

**Acceptance:** Both roles consume frozen scope and Appraise-issued evidence; authenticated discovery stays in its human browser panel. Missing access parks work without invented evidence.

**Verification:** Anonymous discovery path plus separately authorized protected-access path; reject raw browser evidence, changed environment and expired grant.

### M09: Enable Scenario Designer and Automator

- [ ] Implement and verify this slice.

**Dependencies:** M08. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** quality-journey-scenario-service.ts; quality-journey-automation-service.ts; gateway mapping and integration tests. Paths described as new are proposed, not current source.

**Acceptance:** Designer publishes a candidate for existing human review; only exact approval permits materialization. Automator writes through canonical services and never edits product code or generated automation wrappers.

**Verification:** Scenario revision/approval carry-forward tests, unapproved materialization rejection, canonical operation/capsule bindings and no implicit execution consent.

### M10: Enable Triager and complete the lifecycle

- [ ] Implement and verify this slice.

**Dependencies:** M09. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** quality-journey-triage-service.ts; execution/closure service integration tests; gateway mapping. Paths described as new are proposed, not current source.

**Acceptance:** Existing test runtime executes only under fresh consent; Triager consumes sealed evidence and submits reports; human report revision/rerun/closure completes through existing controls.

**Verification:** Live disposable failure → triage → revision → fresh-consent rerun → closure, plus deterministic stale evidence/consent tests. Agent exit never certifies test success.

### M11: Reconcile pause, interruption and restart

**Reference:** [Open Design guide](open-design-reference.md). Interruption and closed-child cleanup patterns; add Appraise lost-ack, lease, accepted-submission and unknown-effect reconciliation.

- [ ] Implement and verify this slice.

**Dependencies:** M06; recheck M08–M10. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** New supervisor/scheduler; quality-journey recovery services; recovery integration tests. Paths described as new are proposed, not current source.

**Acceptance:** Fence before interrupt; reconcile accepted work after lost replies; distinguish stopped turn, exited process and unknown effect. Resume after restart cannot duplicate a start or revive expired authority.

**Verification:** Crash matrix at intent/send/ack/tool-commit/pause boundaries, lease expiry, auth revocation, cleanup loss and duplicate delayed events. Never signal stored PIDs.

### M12: Qualify packaging and mode transfer

**Reference:** [Open Design guide](open-design-reference.md). Codex definition and compatibility tests; qualify selected versions/configuration without permissive or automatic fallback.

- [ ] Implement and verify this slice.

**Dependencies:** M07, M10, M11. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** packages/appraisejs (read package AGENTS first); prepare-template workflow; compatibility/operator docs; new installed fixtures. Paths described as new are proposed, not current source.

**Acceptance:** Version/config/MCP checks fail closed; clean install and upgrade retain history. Quiescent human-approved mode transfer fences old host; rollback refuses unresolved effects and preserves records.

**Verification:** Packed/scaffold clean-install, upgrade/downgrade refusal, revocation, cross-project isolation and rollback observations on supported hosts; no automatic dual-host fallback.

### M13: Review the exact release candidate

- [ ] Implement and verify this slice.

**Dependencies:** M12. **Estimated scope:** S; split further before implementation if the actual diff spans independent concerns.

**Likely files:** Migration evidence bundle; current docs and task register; package/release checks. Paths described as new are proposed, not current source.

**Acceptance:** All six roles and human loops pass; no unknown host property is presented as verified. Publish measured usage/latency and remaining limits; default-mode change is explicit.

**Verification:** Independent exact-artifact review after focused checks, build, scaffold/Graphify sync and package checks; failed required findings remain blocking.

## Checkpoints

- After M02: decide feasibility from exact-build evidence; revise scope and estimate before product integration. No current or historical gate qualifies this composition.

- After M06–M07: review one complete no-chat Analysis loop on disposable/internal data only. User-facing opt-in is blocked until M11 core recovery/crash checks and applicable containment/installation checks pass.

- After M10–M11: review all-role lifecycle and recovery, including unknown outcomes.

- After M12–M13: decide default-mode rollout only after installation, rollback and independent acceptance.

## Validation commands and ownership

During implementation use affected-file ESLint/Prettier and `npx vitest run <affected-test-files>` first. Schema/package/runtime changes require `npm run build`; root source changes require `npm --prefix packages/create-appraisejs run prepare-template`, `npm run graphify:auto` for affected committed scopes, and applicable package/harness checks from `package.json`. Final packaging includes `npm run release:check:artifacts`, `npm run release:check:packages` and documentation link checks. Select exact test files per slice; do not treat this checklist as evidence they ran. Browser verification uses the bundled Browser surface or records the permitted fallback reason.

Schema, session, gateway and supervisor changes are sequential shared contracts. After these settle, role-specific tests and UI presentation work can run independently with explicit ownership. No worker may revert unrelated work.

## Current checkpoint handoff

> M00-r3 is explicitly approved at f506fccb and the exact hash in m00-r3-approval.md. Read CONTINUE-HERE.md and
> the approval record before continuation; preserve the byte-frozen contract and all historical evidence/GC3 REVISE.
> M01 has authorized synthetic/no-model preparation but remains partial. Read m01-evidence.md and
> m01-remaining-probe.md and m01-native-provider-checkpoint.md for subsequent authorization and check-only
> steering. No login launch or ambient credential/config reuse; native probe remains parked on auth-required. M02+, product migration, UI
> and release remain unstarted. Local commits only with hooks; no push.
