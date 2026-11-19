# M13 — Six-role replay and authority matrix

Date: 2026-11-13 (Asia/Dhaka). Additive follow-up to [the exact-candidate review](M13-VERIFICATION.md).
The user authorized completing the missing replay, revocation, stale-session and changed-payload tests, focused
verification and renewed independent artifact review. No real inference, sign-in, push or publication is authorized.

## Scope and assertions

The test-only successor starts at documentation commit `82b285cab8e0386f1db36590d1e4974acae42706`.
Production service behavior, schema, migration SQL, role policy, budgets, deadlines, retry/skip policy, credentials
and lifecycle permissions are unchanged. The original release payload remains `5727e209`; prior tarballs,
failed checks, UNKNOWNs, spent attempts, M06 custody and the initial M13 review retain their exact historical scope.

The existing managed-specialized fixture drives the actual six versioned canonical service functions on migrated
disposable SQLite databases. It does not substitute a shared acceptance helper or mocked service/session response
for a role transaction. Two lifecycle integration cases exercise five roles and Triager respectively; assertions
are expanded without adding retries, skips or longer deadlines.

| Role                   | Changed output tested under the original submission key                |
| ---------------------- | ---------------------------------------------------------------------- |
| REQUIREMENT_ANALYZER   | Charter assumptions                                                    |
| SCOUT                  | Appraise-evidence observation fact                                     |
| RESOURCE_EXPLORER      | Resource resolution explanation                                        |
| TEST_SCENARIO_DESIGNER | Coverage rationale, with its matching portfolio output hash recomputed |
| AUTOMATOR              | Source scenario step binding                                           |
| TRIAGER                | Report summary                                                         |

Every role now checks:

- Canonical revocation of a live admitted assignment refuses submission with the explicit authorization error.
  This branch uses a genuine SQLite `VACUUM INTO` snapshot and its own real Prisma client, retaining the source
  fixture's complete canonical session/assignment/history without rewinding revocation or editing a ledger.
  The canonical revocation service creates the revoked state. Snapshot cleanup awaits client disconnection.
- Missing, stale-generation and foreign Journey sessions refuse before successful submission. An assignment-generation
  mismatch against its immutable session association also refuses. The unchanged positive packet then commits.
- Canonical revocation after accepted output retains exact full submission replay, but changed role content conflicts
  and a fresh idempotency key refuses with the authorization-specific error.
- Actual human-approved quiescent coordinator transfer fences the predecessor. A fresh Prisma client can replay the
  exact accepted submission with old, omitted or foreign session metadata, while the original principal and
  assignment secret remain required. This disclosure grants no new authority.
- Changed content after transfer conflicts; wrong secret, assignment generation, project scope or principal refuses.
  Fresh effects from the fenced predecessor require the specific session-generation refusal, so revoked authority
  cannot accidentally satisfy that assertion. Exact authenticated outcome lookup still returns the stored result.
- Relevant Journey, artifact, authorization, attempt/session/budget, authored Suite/Case/step and RuntimeCapsule rows
  remain equal before and after each replay/refusal. Receipt/outcome identity is checked in full, not only by row count.

These are canonical service/versioned ingress observations, not actual worker/provider transport, live protected
access or OS-crash observations. A fresh database client does not prove a fresh host process or effective sandbox.
The matrix closes the specific missing all-six-role cases identified in the original review; it does not prove
every possible payload mutation or concurrent interleaving.

## Verification and evidence

Final focused source batch: **84 passed in five files**, no skips (8.88 seconds runner after the quality-gate refactor).
It includes the entire Analysis/discovery/scenario/automation and Triager integration suites, session and hosting
transfer SQLite suites, and the legacy-ingress fence suite. An earlier name-filtered check ran the two expanded
cases and deselected 21 others; those deselections are not new runtime skip policy.

Affected ESLint and helper Prettier checks passed. TypeScript `tsc --noEmit` passed.
Canonical scaffold preparation copied the three test files; their root/template bytes match. Graphify ran through
`graphify:auto`, updating the source graph/report with zero model token cost. Its graph exceeds 5,000 nodes,
so the generator skipped HTML; no large visualization or model inference was requested.
Harness, docs links, generated-artifact policy and actual package inventory checks are retained with the final
packed and installed results below. No production/browser UI behavior changed; prior whole-repository builds,
3,504-test results and native/UI observations remain predecessor evidence, not fresh runs of this test successor.

Local receipts/logs use new `replay-*` names under `.appraisejs/m13-evidence/`; final manifest, artifact snapshot,
review receipt, hook evidence and supplemental records are under `.appraisejs/m13-replay-evidence/`.
Historical `final-review.json` and its accepted snapshot are not overwritten.

The initial test draft toggled `revokedAt` back after a probe, leaving an append-only wake cause behind; later
canonical revocation refused the duplicate. That failed log is preserved. The corrected snapshot branch invokes
canonical revocation once and never restores authority history. Subsequent failed draft assertions expected
authentication errors for Analyzer/Designer requests whose foreign-project content already violated strict scope
checks. Those exact source-defined conflict envelopes are now asserted separately. No product guard was weakened.
Intermediate packed checks before final substantive-content mutations and the quality-gate refactor remain
predecessor observations. The first normal commit hook rejected duplicated assertions and excess cognitive
complexity; shared assertion helpers removed those findings. Fallow then passed without suppressions or baseline
changes. The rejected hook log remains preserved.

## Final installed artifact

Fresh final packed proof: `.appraisejs/m12-evidence/run-AKJrkj/result.json` (36.71 seconds command).
The installed generated application's two complete affected suites passed **23/23**, with no skips
(6.50 seconds runner, 10.23 seconds command), using its own generated Prisma client and installed dependencies.
The same canonical matrix is exercised from that installed source, not imported from the producer repository.

| Tarball           | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| appraisejs        | `0d0e593599832d4be8c4d0a223d9eaf18aa559f8a5c35fbeed833590ed891a9d` |
| create-appraisejs | `8fbf578467e70f17a40fe27311b707c9794cd1c0397d50e3a83be7cfa241d2b2` |

Package inventory remains 147 CLI / 1,421 scaffold files; all 98 packed migration names and SQL hashes match
canonical source. The scaffold tarball changes with the synchronized tests and regenerated clean seeds;
predecessor installed observations are not relabeled as fresh. Final normal hook output, exact snapshot,
evidence manifest and renewed independent review are retained in the follow-up evidence directory.
These records are local evidence metadata, not authenticated release or host-enforcement authority.

## Limits and readiness

The identified replay/revocation/stale-session/changed-content coverage gap is resolved only for this tested
six-role matrix. M13 remains unchecked and managed release/public/default rollout remains **BLOCKED / NOT QUALIFIED**.
Actual provider/authentication, native required-MCP readiness, eligibility and model usage/latency/spend remain
unqualified. No real inference or sign-in occurred; no push, merge, publication, default change or rollout occurred.

Keep `hostIsolation=NOT_ATTESTED`, same-user native-access risk, historical cleanup UNKNOWNs and
`UNKNOWN_NOT_INDEPENDENTLY_OBSERVED` native helper lifetime inventory explicit. Effective role/model/context/sandbox
enforcement receipts remain unavailable; neither routing metadata nor independent review manufactures them.
TA02/TA03 withdraw stronger containment requirements without marking them passed. All existing operational
ownership, physical cleanup and Appraise-owned approval/consent rules remain.
