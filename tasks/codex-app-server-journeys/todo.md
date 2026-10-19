> M03 implementation (2026-10-19): the user approved the [bounded plan](m03-host-neutral-sessions-plan-01.md). Work is isolated on `codex/m03-host-neutral-sessions`; see the [current checkpoint](M03-CURRENT-WORK-01.md). Implementation and SQLite/service verification are complete; final whole-artifact review is recorded with the checkpoint. Native/provider campaigns, production dispatch and M04/M05 remain outside this scope. Earlier checkpoints below are historical.

> Current shipping checkpoint: [M02 scripted qualification accepted](M02-SHIPPED-SCRIPTED-QUALIFICATION-01.md). T2 R51 passed24/24 andT3 R55 passed2/2; final exact evidence review accepted within TA02/TA03 limits. `runtimeQualified` remains false; helper lifetime/global inventory and historical cleanup remain unobserved. No M03 or production dispatch authority follows. Older status passages below remain historical.

> Latest R24 native checkpoint (2026-10-17): exact approval consumed by one p10 invocation; terminal UNKNOWN at B01, actual completed T2 cases0. AUDIT/INCOMPLETE with output observation COMPLETED/NONE; underlying cause and cleanup UNKNOWN. Independent review accepts terminal evidence only. No retry/resume/repair/successor/T3 from this request. See [M02-R24-CURRENT-WORK.md](M02-R24-CURRENT-WORK.md); prior approval-pending text below is historical.

> Current R24 checkpoint (2026-10-17):71/71 offline checks and exact review passed; actual strict precheck passed. Native launch was rejected by host automatic approval review before process creation. New p10 absent, native allocations0, actual T2 completions0; T3/M02 incomplete. Separate exact native approval is pending: [R24 request](m02-ta-t2-r24-exact-authorization-request-01.md). Do not resend without it. Earlier broad implementation-authority text below does not override this host rejection.

**Current M02 implementation continuation (2026-10-17):** The user has authorized completing M02 diagnosis and implementation. Effective qualification is **trusted-agent scripted conformance** under approved TA02 / M02-TA-P1 / TA03; historical hostile-agent containment requirements are withdrawn from this gate, not passed. T1 is retained as tuple-scoped evidence. R23 is consumed UNKNOWN with zero completed native T2 cases; T2, T3 and M02 remain incomplete. Additive R24 work is tracked in [recovery09](m02-ta-t2-recovery-09.md). Each fresh native bundle/command receives exact review and preserves cumulative consumption; no consumed command is resumed. M03+, production dispatch and real-provider qualification remain outside M02. Earlier checkpoints below remain historical.

**Current M02 checkpoint (2026-10-15):** M02-A deterministic gateway implemented; M02 incomplete.
[M02-A evidence and limits](m02-a-qualification.md). M02-B+ remains unauthorized; no runtime,
auth/inference, grants, commits or push. Prior M01 checkpoint statements below are historical.

# Codex app-server Journey migration tasks

**Current status (2026-10-14):** [M01 protocol qualification](m01-qualification.md) is complete
for the pinned binary/host/configurations. Final no-model fixtures qualify four true elicitation
cancellation variants and a native-produced scripted permission denial. Zero new external inference
or grants. M00 bytes and GC3 REVISE remain intact; M02–M13 remain unstarted.

Status: active replacement roadmap adopted 2026-10-13; M00-r3 explicitly approved at f506fccb and its exact SHA-256; M00 complete as a design-contract slice. M01 protocol qualification is complete for the pinned tuple; M02–M13 remain unstarted. See [plan](plan.md). Existing Journey gates remain unchanged.

## Implementation references

Use the [Open Design reading map and adaptation rules](open-design-reference.md), pinned to the reviewed upstream revision. Read its relevant source/tests before each mapped slice; keep upstream observations separate from Appraise verification. M00 evidence and exact user approval are linked below; M00 is complete. M01 preparation is recorded in [M01 evidence](m01-evidence.md); native-provider and request-variant observations are recorded in the current qualification assessment. M02+ remains unstarted.

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

**Status (2026-10-14): Complete for M01 protocol acceptance only.**
[Current qualification and limits](m01-qualification.md) · [Native results](m01-native-results.md).
Existing login reuse follows the separate [auth amendment](m00-auth-amendment-01.md).
Three of three native inference starts consumed; none resent. Client cancellation and scripted native
permission denial now observed under the explicitly authorized fixture-only exception. Earlier partial
checkpoints remain historical evidence, not current blockers. No containment or production support claim.

**Reference:** [Open Design guide](open-design-reference.md). Session/protocol tests and capability handling; test the actual launched binary, including required-MCP failure.

- [x] Qualify the pinned protocol with synthetic tests and authorized disposable observations.

**Dependencies:** M00. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** New disposable protocol fixture; future src/lib/quality-journey/codex-app-server/ protocol module. Paths described as new are proposed, not current source.

**Acceptance:** On an isolated exact binary, prove initialization, required-MCP failure, start/resume, turn events, interrupt and unexpected request handling; record lost-ack behavior without claiming idempotent starts.

**Verification:** Synthetic protocol tests plus explicitly authorized live disposable observations; label each evidence class and version.

### M02: Qualify scoped MCP and containment

**Partial:** M02-A only is implemented with deterministic fixtures. M02-B/C remains unstarted;
containment and product authority are unqualified. See [M02-A evidence](m02-a-qualification.md).

**Reference:** [Open Design guide](open-design-reference.md). Permission-boundary comparison; independently prove Appraise MCP scoping and denied native/direct access.

- [ ] Implement and verify this slice.

**Dependencies:** M00, M01. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** src/lib/quality-journey/managed-worker-gateway.ts; packages/appraisejs/src/mcp/server-factory.ts; new disposable isolation fixtures. Paths described as new are proposed, not current source.

**Acceptance:** Demonstrate scoped role reads/submissions and rejection of forged target/generation, human decisions, broader MCP, direct database/source/credential access and unauthorized native tools. Determine auth setup without importing ambient configuration.

**Verification:** Adversarial gateway tests and live escape probes on the supported host; no containment claim from config alone. Stop if effective boundary cannot be established. M02 authority results are provisional until M03 mandatory-session re-probes pass; no product managed dispatch is permitted by M02. Explicit disposable legacy fixtures must not qualify absent-session admission.

### M03: Persist host-neutral sessions

**Reference:** [Open Design guide](open-design-reference.md). Captured start/resume handles; bind them to canonical generation, attempt and revision rather than treating them as authority.

- [x] Implement and verify this slice (SQLite/service scope; see [M03 checkpoint](M03-CURRENT-WORK-01.md)).

**Dependencies:** M02. **Estimated scope:** M; split further before implementation if the actual diff spans independent concerns.

**Likely files:** prisma/schema.prisma; new migration/inventory; quality-journey-coordinator-session.ts; handoff service. Paths described as new are proposed, not current source.

**Acceptance:** Persist explicit execution mode for new Journeys; preserve legacy effective owners and attempt bindings rather than blanket-backfilling external mode. Mixed/unresolved ownership requires recovery; active managed work needs explicit transfer. Provider availability never changes mode. Managed calls require a current session before first takeover; desktop compatibility and historical rows remain readable. Concurrent takeover fences predecessor inside commit transactions.

**Verification:** SQLite migration fixtures for legacy MANAGED, EXTERNAL_V1 and mixed/unknown ownership, preservation and pre-first-takeover, stale-generation, missing-binding, cross-target and concurrent takeover tests; verify claim/admit and all six specialized writes under missing/stale/valid mandatory host sessions in SQLite/service integration; later native re-probes remain separately gated before dispatch eligibility; migration inventory verification.

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

Read [CONTINUE-HERE](CONTINUE-HERE.md) and [M01 qualification](m01-qualification.md).
M00 bytes remain frozen; M01 protocol qualification is complete for the pinned tuple only.
M02+ remains unstarted and requires separate authorization. Native budget exhausted at 3/3;
no further inference or grants. Preserve history, UNKNOWN provenance and GC3 REVISE.
Local commits with hooks only; no push, merge or publication.
