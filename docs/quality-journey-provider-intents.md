> M06 repository continuation adds [internal Analysis fixture delivery and blocked follow-up observation](quality-journey-analysis-delivery.md). The consumed-slot and physical-reconciliation boundary is unchanged; full M06 remains incomplete. Earlier milestone scope statements below retain their historical meaning.

> M05 implementation adds an internal owned transport and fixture adapter; see [process supervision](quality-journey-process-supervision.md). Consumed-slot uncertainty remains unreconciled after transport shutdown. The original M04 scope descriptions below retain their milestone meaning. Production/provider dispatch remains blocked.

# Journey provider dispatch and wake intent

M04 adds SQLite-backed internal persistence and deterministic service verification. Production app-server dispatch remains blocked. No provider process, authentication, model inference, background supervisor, automatic retry or public managed opt-in is supplied by this slice. See [hosting and sessions](quality-journey-host-sessions.md) and the [approved M04 plan](../tasks/codex-app-server-journeys/m04-provider-dispatch-wake-intent-plan-01.md).

## Identity and transaction ownership

One logical `QualityJourneyProviderRun` belongs to one admitted EXTERNAL_V1 WorkAttempt. Preparation authenticates the original assignment secret and principal, requires APP_SERVER_LOCAL_V1 hosting, checks current session and immutable attempt binding, and records exact assignment/admission/authorization/input/scope/revision and configuration digests. Provider namespace identifies isolated provider state and its incarnation; handles are correlation only. Existing Factory dispatch fields and historical admissions retain their meaning.

Preparation atomically creates the run, initial numbered dispatch intent, initial wake and idle hub slot. Claim and admission remain their existing independent replayable services. After a crash between admission and preparation, internal discovery returns the same admitted attempt without a provider run. It also returns eligible existing unarmed intents after preparation, including expired claims, even if all earlier wakes were acknowledged. A wake acknowledgement does not remove that discoverability. Recover the original claim key and secret; losing a secret does not permit another attempt. Offline fixtures restore synthetic secrets from private disposable storage; production recoverable credential storage remains future work.

The provider-run service and wake service are trusted in-process functions, not public coordinator/MCP endpoints. A runtime Symbol gates observation, reconciliation and explicit wake production. Model-supplied booleans cannot create these capabilities. Shared canonical session and specialized-submission services remain authoritative for all lifecycle effects.

## Claims and the possibly-sent boundary

An intent claim uses a fixed 120-second lease, owner and monotonic epoch. Same-owner exact replay returns the original claim without extending its lease. Before arming, an expired claim can be reclaimed only after rechecking current session, assignment, authorization, WorkItem, target, input/revision, canonical lease and budgets.

Arming atomically reserves the singleton database hub slot, consumes one conservative turn reservation and records a unique send boundary. It immediately records UNKNOWN: this means possibly sent, including a crash before actual I/O. Only the originating successful transaction returns an ephemeral one-use permit for the offline simulated sink. The internal consume service rechecks current authority and the original acknowledgement/turn deadlines immediately before consumption; this does not eliminate the database/I/O gap. Durable replay never recreates it. Lost commit acknowledgement requires rereading the original identity; a committed boundary with no returned permit remains UNKNOWN.

The hub slot covers all Journeys, roles and targets in one canonical database. Copied or different databases are separate hubs; this is not cross-database exclusion. Expiry, timeout, cancellation, pause, logical completion and process exit cannot release occupied or uncertain ownership. No fourth turn or attempt, automatic correction loop, resend or budget reset is exposed. M04 implements initial turn intent only.

The frozen D05 policy is persisted with each run: model gpt-6.1-sol / medium, capacity one, lease/heartbeat 120/40 seconds, acknowledgement deadline 60 seconds, turn deadline 15 minutes, three turns and at most three attempts or the lower authorization ceiling. These are persisted eligibility constraints, not evidence of live timer enforcement or a hard spend ceiling. Intent history retains its original seven-day unresolved escalation deadline; reconciled terminal history records a 24-hour retention deadline. M04 performs no history deletion.

## Observation, reconciliation and acceptance

Trusted acknowledgements bind the exact send boundary, namespace, thread and turn. Database uniqueness prevents reuse of a thread across attempts and of a native turn across intents. Exact observation replay is idempotent; changed correlation records conflict and fences the run. A late acknowledgement is operational evidence only: it cannot renew session authority, release a slot, extend a deadline or accept an artifact.

Slot release requires authoritative physical outcome evidence and proof the original sender cannot issue a delayed send. The offline permit mechanism can disable an unconsumed permit. An already consumed permit cannot establish transport shutdown; its uncertainty remains fenced for later transport qualification. Restart cannot reconstruct sender-disable proof. Exact replay of an already committed reconciliation returns its durable receipt before requiring live proof for a new release. An acknowledgement, canonical accepted artifact or missing handle alone proves neither non-start nor termination. No reconciliation operation grants a new send.

All six specialized canonical submission services remain the sole artifact acceptance boundaries. A completed provider turn without accepted output is incomplete. Lost submission replies use authenticated historical outcome lookup and exact replay. Historical receipts stay readable after transfer without granting fresh effects.

Database fencing cannot atomically fence a later physical write. A sender can pause after the durable boundary and before I/O. M05 must separately establish and qualify owned transport interruption, shutdown/drain and delayed-sender exclusion before production dispatch can be considered. SQLite success does not qualify these properties.

## Wakes are hints

`QualityJourneyWakeIntent` is a separate outbox with stable cause identities. SQLite migration triggers insert hints in the same transaction as managed Journey event insertion, Journey/WorkItem version changes and authorization cancellation/revocation. This covers specialized canonical producers without replacing append-only events. Rollback removes the hint with its source write. No old events or work are backfilled into wakes.

Internal wake discovery rereads canonical state. Claims and acknowledgement use current session authority and exact lease epoch; acknowledgement records a bounded observed outcome, never dispatch completion. Duplicate causes are idempotent, changed cause content conflicts, and new causes remain independent while an old cause is acknowledged. A human wait may have a wake but creates no provider run or turn. There is no background delivery promise: explicit polling/discovery is the M04 path, and it grants no ownership, approval, consent or execution authority.

## Recovery, migration and distribution

Cancellation and operational pause invalidate only unarmed intents. Transactional SQL triggers also invalidate unsent intents for specialized WorkItem/attempt retirement, authorization revocation and Journey revision/cycle changes; they retain every armed marker. Armed uncertainty survives terminal attempt status and blocks replacement, operational resume and quiescent session transfer. Existing lease-expiry recovery marks possibly-sent attempts unresolved rather than issuing a replacement. New claim checks also refuse unresolved predecessor provider effects.

Both M04 migrations are additive. All predecessor SQL and historical rows remain unchanged. Migration creates no synthetic provider runs, handles, sends or acknowledgements from Factory timestamps. Unknown historical effects remain blocked, including terminal Factory attempts whose start acknowledgements do not prove termination. Only an exact validated refusal proves historical non-start. Contradictory late acknowledgements fence the original run and hub eligibility even after an earlier reconciliation. Root source is canonical; scaffold preparation copies schema/migrations/services through the usual workflow. Prepared starter and blank databases reject provider runs, intents, observations, wake rows and occupied hub slots; an idle singleton is allowed.

Focused verification uses migrated on-disk SQLite, independent clients, committed-transaction reply loss and counted simulated effects. Relevant tests are the provider-run, wake and provider-recovery SQLite suites plus `scripts/tests/m04-provider-intent-backfill.test.mjs`. No passing test changes `runtimeQualified=false`, M02's bounded scripted qualification, GC3 REVISE/not passed, consumed inference 3/3 or unresolved historical cleanup.
