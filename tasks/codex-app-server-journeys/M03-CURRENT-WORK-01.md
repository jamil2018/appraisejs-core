# M03 host-neutral sessions — implementation checkpoint

Date: 2026-10-19 (Asia/Dhaka). Status: implementation and SQLite/service verification complete; exact-artifact review receipt accompanies this checkpoint. This checkpoint is additive to the unchanged [approved plan](m03-host-neutral-sessions-plan-01.md), SHA-256 `8d62c42544fa8b994fbbfeef2a085a1a882805af099ee8dd285e49d9200ed430`.

The user approved that plan and instructed completion of all M03 tasks. Work remains on `codex/m03-host-neutral-sessions` in `/private/tmp/appraise-m03-host-neutral-sessions`, based on `4e3f6dbe47b8abe39aae88eb557f9e36eb3394bb`. No commit, push, PR or merge is authorized or performed. The original dirty checkout remains separate; its branch/HEAD, complete dirty status and all 1,813 recorded file hashes were checked unchanged. Nothing is staged and there are no commits above the base.

## Delivered scope

- S1: Explicit internal hosting selection, durable candidate sessions, trusted initial activation, generation-2 transfer and restart persistence. First real disposable SQLite path worked before new regression tests were added.
- S2: Additive migration/inventory and deterministic structural legacy classification; explicit pending/quarantine defaults; original creation hashes and immutable historical attempt bytes preserved.
- S3: Legacy handoff mapping and generation compatibility; transactional predecessor fencing and explicit quiescent managed transfer. Unknown dispatch, cleanup, execution or ownership refuses transfer; no automatic legacy adoption.
- S4: First-session claim/admission fencing and immutable attempt/session binding. Existing attempt caps remain intact. App-server-hosted Factory dispatch is explicitly refused.
- S5: All six canonical specialized write boundaries carry the trusted session through transaction-local acceptance and completion. Missing/stale/foreign authority and binding mismatches cause zero effects; accepted historical receipts remain readable after fencing.
- S6: API/package session fields, authenticated principal injection, replay-safe public recovery routes, trusted Next action capability, current documentation, canonical scaffold/contract regeneration and affected graph updates.

See [Journey hosting and coordinator sessions](../../docs/quality-journey-host-sessions.md) for exact behavior and validation commands. Session ID, coordinator generation, assignment generation and future transport generation remain distinct. A provider or gateway callback cannot establish database authority.

## Review corrections retained in the implementation

Independent review found that per-attempt Factory UUID tokens do not identify coordinator owners. The corrected migration preserves valid concurrent Factory lineage and an effective shared legacy handoff; incompatible external principals, unsupported statuses, foreign targets and unresolved effects remain quarantined. Structural backfill checks preserve raw payload/hash bytes; they do not cryptographically validate payload or stop-receipt digests. Canonical runtime validation remains necessary before effects.

Review also found a route-level current-session precheck that hid authenticated historical outcomes/retries. The narrowly identified external outcome/claim/admission/specialized submission paths now let canonical services authenticate replay before applying current-session checks to new effects. Public routes still validate the project bearer and exact assignment secret. Generic exact command replay no longer increments ownership versions. Credential fields cannot override canonical mutation scope.

Regression coverage includes independent-client activation/transfer, claim/transfer and canonical Analysis write/transfer races, all six specialized role writes, first-session denial, target/principal/alias fencing, immutable bindings, historical receipt/API replay, snapshot rollback and canonical scope override rejection. Unknown/active effects cannot become a successful transfer by supplying a reconciliation label.

## Verification record

- Full root Vitest: 288 files passed; 1,665 tests passed and four existing tests skipped (1,669 total).
- Published-package workspace tests: 295 passed across 29 files. Scaffold package: 80 passed across 12 files.
- Root Next build, scaffold build, TypeScript, full ESLint (zero errors, ten existing warnings), harness/CI registry validation and documentation links passed.
- Fallow: zero introduced dead code, complexity or duplication; inherited findings remain. React Doctor affected diff: 100, zero diagnostics; full CI gate passed with inherited score 78 and 88 warnings.
- Migration inventory: 89 entries. Actual SQL backfill fixtures preserve 16 Journeys and 18 historical attempts, create one evidenced mapped session, and remain stable after restart. No product runtime dependency was added for the Node 22+ test harness.
- Generated-artifact policy and bounded package contents checks passed; the packed scaffold matches all 89 migration names and SQL hashes. Canonical scaffold and MCP contract generation ran. Graphify updated affected scopes through generators; source freshness and exported endpoint integrity were checked. The scripts graph needed a host-authored semantic-cache/API build for two unchanged historical README files in the clean worktree, followed by the canonical wrapper. No provider credential or inference was used. Raw extractor diagnostics include 6,631 candidate dangling edges, 440 undirected collapses and two duplicates; exported endpoints are valid. Placeholder zero token counts are not measured host usage.
- Source review accepted all 103 source/documentation/template files before final graph/status refresh. The final manifest and independent review receipt bind the whole resulting artifact, excluding their own metadata to avoid a hash cycle.

The final independent review is saved in ignored local `.appraisejs/m03-final-review-01.json`, bound to `.appraisejs/m03-final-manifest-01.json`. The tracked [verification receipt](m03-evidence/implementation-verification-01.json) records checks and evidence hashes. Local diagnostic and successful check logs remain under `/private/tmp/m03-*`. Earlier failed runs remain diagnostic evidence; successful later checks do not erase them. These are local verification results, not native/provider qualification.

Two unchanged test defects surfaced during broader checks: a DOM lookup needed explicit `HTMLElement` typing for type checking, and the triage panel test needed to wait for its first asynchronous transition to re-enable approval before clicking it. Those small test-only corrections change neither product behavior nor timeout limits. The historical pre-C3.1 upgrade fixture now emits real canonical lineage into a separate current-schema disposable database, then projects historical columns before the upgrade; original byte/hash assertions and the 90-second limit remain intact.

## Qualification and preservation

M02 remains accepted only for trusted-agent scripted native functional conformance with unobserved helper lifetime. `runtimeQualified` remains false; GC3 is REVISE/not passed; real inference remains exhausted 3/3. Frozen M00 SHA-256 remains `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.

No native/provider campaign, authentication, real inference, consumed-command retry, historical runtime-root recreation, production dispatch, public managed opt-in or M04/M05 implementation occurs in M03. Historical UNKNOWN outcomes, pending reservations, budgets and unresolved cleanup remain unchanged. SQLite/service verification does not qualify hostile containment, provider/model/auth/spend behavior or helper lifetime.
