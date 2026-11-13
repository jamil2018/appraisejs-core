# M13 — remaining offline implementation verification

Current authority: the user requested completion and selected **“Finish remaining offline implementation under all
existing limits.”** Work starts from accepted `4b685e688f9f25c683aa1ece5ee2722668fe5cec` on isolated
`codex/m13-offline-completion`. The [implementation plan](M13-OFFLINE-IMPLEMENTATION-PLAN.md) is the finite scope.
No native launches, real credential access, inference, sign-in, push, merge or publication is authorized.

## Implemented scope

- AES-256-GCM original claim/secret custody before canonical claim, CAS-bound exact attempt and explicit original
  admission recovery; injected key/private root only, physical SQLite file binding and fail-closed corruption/loss.
- One original injected provider port, readiness before canonical arm, transactional thread/turn writes, 40-second
  authority checks, lease/deadline fencing, memoized cleanup and durable UNKNOWN/HUB retention.
- Six canonical role delivery paths with captured public schemas, hidden server binding injection, exact original-call
  replay/lost-reply lookup and no turn or permission created by waiting, cleanup or recovery.
- Actual managed SDK server with InMemoryTransport, bounded profile/call/argument/opaque-result correlation and one
  canonical callback. External-worker and managed DTOs remain distinct; no fabricated WorkerResult bridge.
- Bounded synthetic queue/readiness/dispatch/acceptance/human-wait/cleanup receipts, null/UNQUALIFIED tokens/cost,
  false runtime qualification and no observed native tuple. No public registration, scheduler or mode change.

## Evidence and verification

Observed 2026-11-14 (Asia/Dhaka). All required offline source/package checks passed. Delivery additionally requires the
current independent exact-artifact acceptance, bound separately in the final local receipt to avoid self-reference.

| Check                                   | Result                                                                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root focused batch                      | 264 tests / 13 suites passed, including all six roles through direct and actual managed SDK paths                                                                           |
| CLI focused batch                       | 93 tests / 4 suites passed: managed/external composition and existing route/server regressions                                                                              |
| Scaffold boundary/preparation tests     | 127 tests / 3 suites passed                                                                                                                                                 |
| Affected ESLint / Prettier / TypeScript | PASS; no introduced warnings                                                                                                                                                |
| Existing Fallow gate                    | PASS; zero introduced dead code, complexity or duplication findings; no suppressions/baseline changes                                                                       |
| Canonical scaffold sync / package build | PASS; canonical sources and portable gateway dependencies retained; cross-package fixtures excluded                                                                         |
| `graphify:auto`                         | PASS; source/package graphs generated deterministically, 0 model tokens, no dangling edges                                                                                  |
| Production build                        | PASS, including Cucumber, companion, CLI and Next route generation                                                                                                          |
| Harness / documentation links           | PASS                                                                                                                                                                        |
| Artifact / package policy               | PASS; actual CLI 155 files, scaffold 1441 files                                                                                                                             |
| Actual packed generated app             | 155 self-contained tests / 7 suites passed using its own dependencies/Prisma client                                                                                         |
| Actual packed cross-package proof       | One dedicated test ran all six managed roles against generated canonical source + installed CLI; every case retained occupied unreconciled HUB                              |
| Parity                                  | 18 included source/test hashes match canonical/prepared/extracted/generated; compiled managed package module matches extracted/installed; all 98 migration SQL hashes match |
| Protected preimages                     | Original supervisor/launcher refusals, D05, schema/inventory and package manifests/locks unchanged                                                                          |

Actual retained tarballs (local only, not published):

- CLI SHA-256: `1b47804aab8c39faabb4e21413331ae173517f9ce626f1dd4b66570a8e8e2532`
- Scaffold SHA-256: `aaa730fb2c41023abec22c81e56b74d72e01579a4c58f0ddafcb7b5343cb3ca4`

Frozen installed recipe SHA-256: `c7c1f9212a22170881436dba94997c004b308f7e5380761b7fa996a79336bb4e`.
Frozen proof script SHA-256: `5e8529ce45220fbae0d5abfc74dc329ddb5acd0761a50b1547f888bbfed1e414`.
Local command/log-hash receipts, actual tarballs, fixture hashes and source parity are retained under
`.appraisejs/m13-offline-evidence/` (repaired actual proof under `packed-review-fixes/`); final commit/tree/snapshot and independent decision are recorded separately.
Normal commit hooks remain enabled. The final review receipt must match the current artifact; no runtime authority
follows from engineering acceptance or hash equality.

All-role proof uses six independently cloned fresh synthetic SQLite snapshots. Each role reaches its actual canonical
acceptance through one counted fake turn, then retains an unreconciled occupied HUB in that case. Original canonical
fixture preparation advances separately with no provider run. This is six complete offline role pipelines, **not** a
serialized native Journey, physical provider reconciliation or permission to release uncertainty. ACKNOWLEDGED is an
operational status and does not establish physical termination. Human approval/consent remains canonical in setup.

Repository lifecycle fixtures and package adapter stay outside generated products. The actual packed cross-package
proof uses a separately frozen test-only harness, resolves root production imports to generated app sources and package
imports to the actual installed CLI distribution, and uses that app's own dependencies/Prisma client. It does not patch
product source or add producer-repository imports to a scaffold. Self-contained custody/composition tests stay bundled.

## Preserved diagnostic evidence and scope corrections

Early Fallow identified unused exports and bounded orchestration complexity; those were removed/simplified and affected
checks renewed before packing. Default-sandbox baseline audits could not create their temporary Git worktree; the
normal authorized gate passed with local Git metadata access. No suppression, quality baseline, global deadline,
provider budget or test skip was added. Named-case filtering was diagnostic selection only; the final batches ran all
listed cases. An initial harness file under `src/test` was not in Vitest's discovery scope; the real suite was moved to
`src/services` and explicitly verified as two passing tests covering both six-role modes.

Actual SDK checks exposed external/managed WorkerResult incompatibility and Analyzer public charter projection drift.
The separate managed SDK factory and server-owned fixed-field injection corrected these source/fixture assumptions;
no WorkerResult or acceptance was fabricated. An early oracle confused ACKNOWLEDGED with physical reconciliation;
current checks require unreconciled intent plus occupied HUB. Exact original-owner call capture handles submission
commit-reply loss without inventing a post-restart payload match or recreating a send permit.

The first independent final review rejected two defects: retained role-delivery callbacks could enter after local
cancellation, and the external helper awaited an unbounded UNKNOWN observer. The successor adds a captured synchronous
role-delivery admission fence (including retained thunks) and nonblocking sanitized UNKNOWN notification. New SQLite
cases distinguish zero late entry after cancellation/timeout from already-admitted effects that may still commit and
must remain UNKNOWN. A never-settling diagnostic observer cannot extend the invocation deadline. No already-admitted
transaction is falsely described as rolled back; historical exact lookups remain read-only. A repaired successor needs
renewed source/generated/build/actual-packed checks and renewed exact-artifact review; the rejected snapshot and packages
remain retained at their original paths; the successor uses a separate fresh proof root.

Next reported its multiple-lockfile workspace-root and dynamic file-pattern warnings; production compilation succeeded.
Graph reports retain structural weak/thin community warnings and placeholder labels; these are not native/system
qualification. No model backend was used for extraction or labels. All failed/diagnostic receipts remain local.

## Preserved limits and remaining live gates

Both original production refusal functions, D05, schemas/migration SQL, package manifests/locks, verifier-based authority,
M06 source custody and historical HALTs/UNKNOWNs/consumed budgets remain unchanged. Fresh synthetic fixture data never
renews a historical allowance. No real credential file/store, provider account, native executable or protected target is used. The new synthetic port is
not registered as a native owned-turn process in the old live registry; fake cleanup never mints
`ownedProcessExitObserved` or a real managed-turn drain witness. Canonical pause fences writes immediately; the
original fake owner is interrupted by its explicit cancel, canonical heartbeat or lease/deadline checks.

Real key provisioning/store activation, actual executable/configuration/protocol/MCP compatibility, provider login,
inference, physical cleanup/reconciliation, model usage/spend and support/distribution eligibility remain unqualified.
Same-user native trust risk, `hostIsolation=NOT_ATTESTED` and helper lifetime
`UNKNOWN_NOT_INDEPENDENTLY_OBSERVED` remain explicit. Encryption and synthetic correlation supply no containment proof.
Overall **M13 remains BLOCKED / NOT QUALIFIED** under these preserved live-effect limits.
