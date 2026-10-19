# Journey hosting and coordinator sessions

M03 persists host-neutral ownership without enabling an app-server supervisor or production dispatch. Hosting selection belongs to the Journey; `QualityJourneyWorkAttempt.executionMode` remains the independent `MANAGED` or `EXTERNAL_V1` admission protocol. Provider availability never selects or changes hosting.

## Storage and compatibility

Canonical creation explicitly writes `EXTERNAL_LEGACY` for ordinary compatibility calls or `APP_SERVER_LOCAL_V1` for explicitly selected internal managed work. No public managed opt-in UI or creation parameter is added to MCP. Omitted and explicit compatibility creation requests preserve the legacy request hash; a conflicting hosting choice cannot reuse that identity.

The append-only `20261019010000_add_host_neutral_journey_sessions` migration adds Journey hosting provenance, an ownership version and current-session pointer, plus coordinator session and immutable WorkAttempt binding tables. Raw unclassified rows default to `LEGACY_UNRESOLVED` with `M03_SQL_V1:CLASSIFICATION_PENDING`; canonical creation supplies its explicit mode. New columns therefore do not grant authority during an interrupted structural upgrade.

The deterministic SQL classifier preserves a unique effective, target-consistent legacy takeover, rather than choosing a newer prepared or merely connected handoff. Live legacy assignments are classified from structural target, authorization and assignment lineage and external principal evidence. Per-attempt Factory owner tokens remain independent secrets; neither these tokens nor `MANAGED`/`EXTERNAL_V1` labels identify a shared coordinator. SQL classification preserves bounded legacy authority and does not cryptographically validate payload hashes; canonical service validation still checks actual content before effects. Conflicting owners, foreign targets, unknown dispatch and unresolved lineage are quarantined. Mixed terminal admission history does not alone establish conflicting live ownership. Empty compatibility and structurally bounded no-session legacy behavior have explicit provenance. No legacy host becomes app-server-managed automatically.

Historical attempt admission, owner token hashes, assignment generations, leases, manifests, requests, authorizations, receipts and accepted payloads remain unchanged. Side records retain association provenance without rewriting those bytes or guessing a session from timestamps. Existing unresolved rows remain readable; recovery must reconcile the recorded ownership/effects before new managed authority is issued. This slice does not provide an automatic legacy-to-managed adoption or cleanup operation.

## Trusted internal activation and transfer

`quality-journey-session-service.ts` exposes trusted in-process registration, activation and transfer functions. These are not public MCP operations. Registration persists a candidate and establishes no authority. Initial activation requires the server-only `trustedHumanCoordinatorSession` capability, exact Journey/target/principal, request identity, state hash and ownership version, with no previous owner or work. Only the exact runtime Symbol is accepted; JSON booleans, strings or `actor: USER` are insufficient.

The first activation establishes generation 1 before any managed claim or admission. Explicit transfer binds the current predecessor, registered successor and an exact trusted human decision at a reconciled quiescent boundary. Active attempts, unknown dispatch, open browser ownership or unresolved execution effects refuse transfer. A reconciliation identifier records the decision; its text cannot override those refusals. Transfer never resets attempt ceilings, renews leases or assumes a process stopped.

Activation and transfer update the Journey ownership CAS, session generation, predecessor fencing and durable transition result in one SQLite transaction. Concurrent contenders have one winner; a losing transaction rolls back. Exact retries return the original result with currentness reported separately, including after supersession. Generations allocate above persisted session and handoff history. Provider I/O and process launches do not occur in these transactions.

## Managed request authority

Managed worker calls carry `coordinatorSessionId` and `coordinatorGeneration`. The authenticated coordinator route injects `coordinatorPrincipalId` from its validated project bearer/fingerprint, discarding payload attempts to provide that authority. The service compares it with the persisted session owner and checks Journey/target, current pointer, status and fencing. Legacy handoff ID/generation remains supported only through its verified compatibility association; inconsistent simultaneous aliases fail closed.

Claim writes the immutable attempt/session binding in the same transaction as lease, assignment and authorization checks. Admission and all six specialized canonical writes recheck current session and attempt binding within their mutation transactions. The ownership write fence contends with takeover on the same row. Scope, role, authorization, lease, assignment generation and input identity must still agree; a valid coordinator session does not authenticate an unrelated attempt. Gateway before/after checks remain useful but do not replace these transaction checks.

All six roles retain their specialized acceptance boundaries: Requirement Analyzer, Scout, Resource Explorer, Test Scenario Designer, Automator and Triager. Accepted output and durable receipts establish outcomes; provider text does not. Authenticated historical receipt lookup and exact replay disclose a prior result without renewing authority or producing a new effect. Managed Factory dispatch is refused until a separately implemented and qualified provider path exists.

Trusted Next server actions obtain the active project and pass the identity-only human capability explicitly. Shared analysis functions also have coordinator API callers, so those services never infer human authority from an omitted session or `actor: USER`. Human decisions retain pause, scope, exact revision and lifecycle checks. Recovery authority permits separately authorized cleanup/reconciliation; unresolved hosting cannot issue new worker effects.

## Validation and limits

Focused verification uses disposable migrated SQLite files and canonical production services, with external effects explicitly simulated. The initial working path was established before adding regression coverage. The session suite checks first-session admission, restart durability, ownership/binding preservation, missing/stale/foreign principals and targets, active/unknown refusal, replay-only outcomes and independent-client activation/transfer races. Managed specialized-submission coverage checks current/missing/stale/foreign bindings across all six roles.

Run the existing focused service suites through `npm run validate:unit -- <test-files>`, and the additional backfill rehearsal with:

```bash
node scripts/tests/m03-host-neutral-sessions-backfill.test.mjs
npm run validate:migrations
npm run migration:inventory:check
```

The existing Vitest suite invokes the backfill rehearsal through `scripts/lib/quality-journey-host-sessions-backfill.test.ts`; it also runs directly using the Node 22+ test host used in Release CI. The rehearsal applies all predecessor migrations before M03, compares historical bytes, and verifies stable classification after restart. Package contract generation uses `npm --prefix packages/appraisejs run build:mcp-contract`; template generation uses the canonical `prepare-template` workflow.

This evidence is distinct from M02's trusted-agent scripted native conformance. `runtimeQualified` stays false; helper lifetime, general provider/model/auth/spend behavior and hostile containment remain unqualified. GC3 remains REVISE/not passed, real inference stays exhausted 3/3, and historical UNKNOWN outcomes, pending reservations and consumed commands remain immutable. M04/M05, native/provider campaigns, public managed opt-in and production dispatch need their own scope and authority.
