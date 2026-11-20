# Quality Journey operator guide

Quality Journeys use Appraise-owned managed hosting. Open the selected Journey in Appraise and use its recorded stage,
blockers, review decisions, and operational controls as the source of truth. A separate agent message or independent
Test Run does not advance a Journey. See [lifecycle flow](agent-lifecycle-flow.md) and
[hosting/session contracts](quality-journey-host-sessions.md).

## Start a local server with managed workers

For an installed, migrated project on a supported Mac, use the existing Codex CLI login on the machine hosting AppraiseJS. From the AppraiseJS project directory, the following starts the managed workflow on loopback using the project’s configured database.

```sh
APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED=true \
APPRAISE_LOCAL_CODEX_DISCOVERY_ENABLED=true \
APPRAISE_LOCAL_CODEX_SCENARIO_AUTOMATION_ENABLED=true \
APPRAISE_LOCAL_CODEX_TRIAGE_ENABLED=true \
node scripts/start-local.mjs dev --hostname 127.0.0.1 --port 35968
```

When the server is already running with these settings, open its existing Journey. Appraise schedules eligible work and waits for human review, browser access, or permission when the stage requires it.

## Run a journey

1. Open **Quality Journeys → New journey**. Write the requirement in your own words and choose **Start journey**. Drafts save as you type. A short brief such as “Check guest checkout” is sufficient.
2. Watch the stage bar and the activity underneath. The agent can inspect static document labels at an unambiguous registered environment. Authentication, redirects and client-rendered content can limit what it observes. If Appraise needs a product decision, choose a suggested answer or write your own.
3. Read the acceptance criteria and exclusions. Choose **Request change** beside an item, write the correction and choose **Send change**. Appraise starts revising that item immediately. Read the revised wording before choosing **Approve criteria**. Complete any project setup shown for the intended environment and destination.
4. When scoped discovery needs browser evidence, open the offered target, sign in there if required, and choose **Save page inspection**. Appraise then reviews the evidence and prepares scenarios. Approve the scenarios you want to run.
5. Review the prepared tests, target and effects. Grant the requested permission and start the run. Results summarize requirement outcomes. Open a finding to inspect the corresponding test run.
6. **History** contains earlier answers, reviews and evidence. **Pause** stops new work. Choose **Resume** when the existing work has stopped and Appraise can continue safely.

## Guest checkout verification

A local managed journey against a disposable checkout reached **Results** on November 20, 2026. Appraise recorded the original criteria, pause and resume, reconnect, browser evidence, scenario approval and permission for the prepared test. The checkout test passed and the managed Triager submitted a report against its sealed evidence. The report left a human closure decision open because repeatability and behavior outside the approved scenario were unverified.

An earlier independent journey revised a criterion in response to feedback and passed its checkout test but lost the proposed report during submission. Its original outcome remains unresolved. New submissions retain the validated proposal so Appraise can recover that same report without sending the worker a second request.

## Observe and recover

Appraise distinguishes queued work, observed dispatch, human review, and interrupted activity. The stage bar shows the last recorded activity when the page opens and refreshes it while visible. A stalled criteria submission explains why approval is unavailable. A lost connection shows that current activity is unknown. If a reviewed revision changes, load the update before making a decision. Opening a legacy Journey offers in-place transfer after reconciliation.

If criteria submission stalls, Appraise checks the original assignment before offering a recovery action. **Finish saving criteria** uses the saved proposal once, under the original assignment. If the assignment has expired, Appraise can still finish publication when it has a matching acceptance record. **Resume criteria revision** requests a fresh revision using the original brief and recorded answers when Appraise has verified that the previous worker finished without an accepted revision. Appraise preserves the failed attempt. Approval is available after Appraise publishes the revised criteria.

In the guest-checkout walkthrough, recovery preserved three answers and both earlier revisions. The managed agent published a third revision requiring an order identifier. The journey showed **Ready to review acceptance criteria** with **Approve criteria** enabled and no open questions.

In the hands-on **Check guest checkout** journey, test preparation stalled after its original worker lost contact. Appraise preserved the original attempt and accepted a reviewed replacement for the same approved scenario. The Chromium run against Guest checkout demo completed with 11 operations passed, one failed, and the final step skipped. The guest could submit one $5 notebook and see “Order confirmed.” The confirmation had no order identifier. The journey closed with that target defect recorded and linked to the run’s sealed evidence. The earlier passing walkthrough used a different journey and approval.

## Inspect the target page

After criteria approval, Appraise automatically inspects the public page when the approved scope names one environment
and one route without a configured sign-in policy. It reads the page in a disposable, scoped browser, captures bounded
control-presence facts, and closes that browser before Scout continues. You can return later while this runs.

If a page needs sign-in, contains a visible password field, or the scope has multiple environments or routes, the
activity line asks you to choose a page or complete sign-in. Use **Open target app** in the inspection panel. Enter
credentials only in the target browser, then use the existing exact-return and access-confirmation controls for
protected capture. An anonymous sign-in screen does not satisfy the automatic protected-access path.

Automatic browser attempts are not repeated after failure or uncertain cleanup. The panel shows when recovery is
required; preserve the original browser records and use Journey recovery rather than opening another uncertain effect.


## Pause, cancellation, and manual recovery

During managed requirements analysis, the server owns the child process and enforces a three-minute deadline. **Pause** stops Appraise from starting new work. It cannot interrupt this particular child directly. A lost server process or unverified cleanup leaves the consumed dispatch unresolved. Inspect the original attempt before starting any further work.

Use **Pause** when admissions must stop. Pause fences new work and snapshots owned cleanup targets while preserving accepted decisions and sealed evidence. The UI reports owned browser and execution cleanup separately; external task status remains unknown. Resume only after the Journey's existing reconciliation succeeds. A sealed result may wait for resume before lifecycle publication, and an earlier admitted spawn may still need cleanup. See [pause and recovery](quality-journey-recovery.md).

An execution cycle in `CANCELLING` is still nonterminal. Terminal cancellation requires durable output completion joined with a hash-bound live-supervisor stop receipt and canonical browser-close acknowledgement. A lost reply can be recovered from the same cycle and receipt. If process inspection is denied, private ownership is lost, browser closure is unknown, or a launch remains ambiguous, keep the Journey paused and the effect unresolved. Inspect the recorded cycle, browser ownership, and cleanup observations; use the supported Appraise recovery path after establishing actual resource state. Escalate unresolved host resources for manual investigation. Never signal a persisted PID/PGID, infer cleanup from an empty process-local map, reset the database, fabricate an approval, or retry an uncertain external effect. Three earlier disposable lost-ownership fixtures remain unresolved; complete host cleanup has not been shown.

For manual recovery, keep the Journey paused, retain a database backup and collect the exact Journey, generation,
assignment, cycle/TestRun, owned-browser row and existing stop/output receipt identities. Record observations without
credentials, callback URLs or browser profile contents. If the original owning hub/supervisor is still available with
its private live handle, retry the supported cleanup and reread the same durable outcome before resume. If that
ownership is lost, this version provides no forced reattachment or manual terminalization command: preserve the
unknown records and escalate the bounded identities and sanitized observations for investigation. Merely closing a
window or restarting the machine does not manufacture the canonical receipt. Access rotation and a
matching application upgrade do not resolve uncertain effects or permit duplicate execution.

## Upgrade, disconnect, and restore access

Back up the SQLite database before a known migration, then run the matching application upgrade with `npm run migrate-db`. The supported startup scripts gate installation inventory and storage compatibility before readiness writes. Missing migration SQL/directories, changed SQL or a missing inventory refuse access; restore matching application files rather than authoring an inventory to hide damage. Future or unknown migration history, checksum changes, unfinished/duplicate/gapped records, and populated databases without history refuse startup or upgrade without repair or reset. Use the matching newer application and diagnose the refusal; do not bypass the guard with bare Prisma, direct Next, or ledger edits. An older arbitrary binary is outside the supported refusal guarantee. The integrity reference does not prove a full physical-schema audit or signed supply-chain authenticity.

Legacy MCP credentials and plugin installation are compatibility surfaces rather than Journey admission or ownership
controls. Rotating access or reconnecting an external client does not transfer managed ownership, renew an assignment,
approve a decision, or resolve uncertain effects. Preserve the same reconciliation boundary after an upgrade.

## Migrate a legacy Journey

1. Open the existing Journey in the active project. Check its brief and stage.
2. Select **Pause**. Wait for Appraise to record its cleanup observations.
3. Select **Migrate to AppraiseJS management**. For an unowned Journey, Appraise checks unused work and no
   connected coordinator. For an already-owned Journey, Appraise uses the canonical reconciled transfer, binding
   the reviewed predecessor session and generation, ownership version, state hash, and latest paused cleanup receipt.
   The control shows the actual blocker when ownership, enrollment, active work, provider, browser, or execution
   evidence does not permit migration. On an expired or changed review, reload and review the state again.
4. Verify the same Journey opens with the original brief and history, the desktop ticket has been fenced, and the
   Journey remains paused. Resume and worker dispatch are separate operations. A managed Journey can remain
   pending when the runtime is unavailable.

Previously owned Journeys can migrate in place only when the existing transfer service accepts the local principal
and exact predecessor generation with reconciled effects. A mapped legacy desktop owner can be retired through this
path. A different unmapped owner, E2 enrollment without qualified retirement evidence, or active/unknown effects
remain blocked; the UI does not force ownership, infer cleanup, or replay consumed work.
[Hosting/session contract](quality-journey-host-sessions.md).
