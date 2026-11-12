# M12 — Packaging and hosting-mode transfer

Base: freshly fetched `origin/appraise-0.5` at `8d8d82545e0a46d1b5e28de7bb47017dfd13cd85`.
All requested M06–M11 commits are ancestors, including implementation `55008b60`.
Worktree: `.appraisejs/m12-worktree`; branch: `codex/m12-packaging-mode-transfer`.

## Scope and authority

Implement and verify disposable local installations and internal Journeys. No global installation changes,
real provider inference, sign-in, protected access, production dispatch, public managed opt-in, default-mode change,
M13 work, shipping or publication. Historical failed attempts and M06 custody remain untouched.
Existing-login/error-if-missing and trusted-local-agent amendments supersede the frozen contract's earlier auth and
host-containment setup requirements; they do not qualify a provider, credentials, distribution or effective isolation.

## Canonical implementation

1. Exercise built tarballs and composed blank/starter applications, migration inventory and clean seeds. Verify
   configured storage refusal before readiness, populated upgrade preservation, incompatible downgrade refusal and
   installed resolution independent of target/output directories. Keep failed infrastructure evidence.
2. Extend the existing session transaction with an explicit target hosting mode. Registration remains inert.
   Require a trusted human decision, exact state/ownership/operational snapshot, canonical pause and observed cleanup.
   Atomically fence the predecessor and pre-transfer handoffs, advance generation and persist immutable request/result.
   Preserve attempts, admission modes, authorizations, approvals, consent, evidence and consumed budgets.
3. Block transfer on pending/armed intents, occupied HUB slots, historical ambiguous dispatch, live browser/execution
   ownership and missing original-handle cleanup. Never infer physical cleanup from artifact acceptance or process exit.
   Reverse transfer is rollback through a fresh successor; the Journey stays paused until separate canonical resume.
4. Verify direct service ingress, races, changed-input refusal, authenticated exact replay after lost replies and fresh
   reconstruction, stale predecessor writes and observation reads. Recheck all six role and M07–M11 boundaries.
5. Generate templates from source; run focused lint/tests, package tests/inventory, build, Graphify and normal hooks.
   Review the exact final source artifact independently, retaining requested versus unverified host properties.

## Reference comparison

Read pinned Open Design revision `014bffbf775f4514020cef8bbffdc0eb5a0009ce` runtime definition,
transport-switch tests and compatibility guide in `.appraisejs/m12-evidence/upstream/`.
Its minimum-version acceptance, automatic transport selection, unknown-setting fallback and forced unsupported
transport are deliberately excluded. Appraise requires exact selected configuration and refuses unavailable
capabilities; upstream observations never qualify Appraise. No upstream code copied.

## Evidence

[M12 verification](M12-VERIFICATION.md) records actual results and remaining qualification gates.
The local evidence directory retains build/setup failures separately from product tests. A routing receipt records
requested investigation/design/execution/review; no effective role/model/context/sandbox attestation is fabricated.

## Actual predecessor downgrade floor

Final review demonstrated a real incompatibility: M12's newly transferable external session needs principal checks
absent in M11, while the first M12 implementation retained M11's migration inventory. An actual canonical transfer
was accepted as compatible by M11 storage inspection and its older session check accepted a foreign principal.
The synthetic future-ledger fixture did not establish a genuine M12 floor; that acceptance is superseded.

Add a persisted `QualityJourney.hostingContractVersion` column through genuine append-only SQL. Historical rows
receive version 1; explicit hosting transfer records version 2. Canonical ownership/recovery ingress accepts only known
versions inside its service transactions. The real new migration makes the exact M11 guarded startup/upgrade refuse
before readiness writes, independently of whether a particular Journey has transferred. Deploy actual migration SQL,
retain prior rows and budgets, and verify actual predecessor refusal with byte-preserved storage. No no-op migration,
forged ledger entry or database reset substitutes for this boundary.
