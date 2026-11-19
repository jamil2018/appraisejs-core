# M13 B0-R1 — offline readiness-controller verification

User authorization: implement B0-R1 at `efddc307896b5d83954afbaea72a4961ceb448a0` using all three recorded
approval hashes, run specified checks and independent artifact review. No native launch, credential access,
inference, sign-in, push or publication. The [approved packet](M13-B0-AUTHORIZATION-PACKET.md) and its frozen
manifests remain byte-identical; their historical NOT APPROVED headers describe preparation, not this later decision.

| Approved input         | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| Packet                 | `d95813ecdcbb218ccfa7dc69f9562f6ac451450d0ba1c887cc47d261c153a853` |
| Authorization manifest | `fb033592684639e0ec869c44498a57fbf24778089cd894bc3e0e645aa794f676` |
| Content manifest       | `727e4cf3eaef2ad315b3e8c15d599028fad0fba2d5132717466749b3980a8fe4` |

Implementation owns exactly four new canonical source/test files named in the manifest. Existing source, production
refusals, provider policy, RPC allowlist, schema/migrations and package manifests/locks remain protected.
Only listed docs and canonical generated scaffold/Graphify derivatives accompany them. Work is isolated on
`codex/m13-b0-r1` at the approved commit; the dirty main checkout and historical worktrees are not modified.

The contract/controller is offline-only and consumed only by its explicit tests. It returns immutable captured
bindings, bounded observations/reasons, `OFFLINE_FAKE_PORT`, `runtimeQualified=false` and `observedNativeTuple=null`.
It cannot prepare/claim/arm/consume/reconcile/release provider work or invoke a thread, turn, gateway or lifecycle
transition. Construction validates only; run/cancel memoize, fence and stop the captured fake port once.

## Validation evidence

Observed 2026-11-13–14 (Asia/Dhaka):

| Check                                                   | Result                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Affected ESLint / Prettier                              | PASS, no warnings                                                                                                              |
| Exact six-suite focused batch                           | 165 passed: 60 new controller cases, 3 new migrated-SQLite cases and 102 existing boundary regressions                         |
| TypeScript `npx tsc --noEmit`                           | PASS at final source                                                                                                           |
| Canonical scaffold preparation / scaffold package build | PASS; all four new source/test files match                                                                                     |
| `npm run graphify:auto`                                 | PASS; deterministic code extraction, 0 input/output model tokens, no dangling edges                                            |
| `npm run build`                                         | PASS, including Cucumber runtime, companion, CLI and production Next build                                                     |
| `npm run check:harness` / `npm run docs:check-links`    | PASS                                                                                                                           |
| Artifact policy / package inventory                     | PASS; actual CLI 147 files, scaffold 1,425 files; 98 canonical migration SQL hashes match                                      |
| Fresh actual packed install                             | PASS; both new suites, 63 tests, using the generated app's own 1,057 installed dependencies and generated Prisma 6.19.3 client |
| Canonical / prepared / extracted / generated parity     | PASS for all four source/test files and 98 migration SQL files                                                                 |
| Protected preimages / three approved hashes             | All 15 protected source preimages and all three approval hashes match                                                          |

Unit groups G01–G17 cover success; exact binding mismatch; malformed initialization (null, empty, top-level extra,
binding extra); missing server; unavailable top-level/server; unsupported; duplicate/extra/wrong IDs; malformed MCP
(null, unknown status, top-level extra, server extra); probe reject/synchronous throw in both phases; timeout with late
resolve/reject in both phases; cancel before run and during each phase; reentrant run/cancel from initialize, inspect,
fence and stop; cleanup reject/throw/timeout/uncertain/contradictory/malformed/fence throw; late stop completion; and
caller mutation. Additional cases cover throwing observation accessors in both phases, cancellation during validation
in both phases, cleanup accessors, 10 invalid option combinations, constructor accessors and 3 invalid port shapes.
G18 is parameterized over success/cancelled/uncertain cleanup with a fresh synthetic armed antecedent. It compares
**every SQLite table and row**, including empty tables, so Journey/session/ownership, assignment, authorization/budget,
provider-run/intent/observation, HUB and wake records cannot change unnoticed. The controller receives no database client.

Actual retained package SHA-256:

- CLI: `0d0e593599832d4be8c4d0a223d9eaf18aa559f8a5c35fbeed833590ed891a9d`
- Scaffold: `735eb9ca377e5650d3bbfbd50edafdd4aa7ee3636cf076f4c1237892a2bc8d9f`

The frozen installed recipe SHA-256 is `b4afdc15d608c25369a4f86997edd99b36aa70fe68b6c4228e078d81070c7d74`.
It packs with install lifecycle scripts disabled, imports the actual installed scaffolder with `runInstall:false`,
installs only public dependencies into a fresh generated app and runs only these two offline suites. Distinct empty
npm user/global config files prevent ambient account configuration access. No legacy native qualification,
credential-rotation, sign-in or browser/provider script is used.

Raw command/log-hash receipts, the frozen recipe/script, actual tarballs, source parity and independent review are
retained under `.appraisejs/m13-b0-evidence/`. The final delivery commit/tree, exact snapshot and independent decision
are bound separately in that evidence and final handoff, avoiding self-referential hashes. Normal commit hooks run
without bypass; their result is retained in the commit evidence. Independent acceptance is an engineering artifact
review, not product lifecycle approval or host sandbox attestation.

Preserved infrastructure/development observations: one executor test invocation was interrupted before Vitest during
dependency setup; the first scaffold command hit TSX local-IPC sandbox denial; the first build could not fetch public
Google Fonts; the initial npm config used `/dev/null` twice and npm refused it; the restricted public-registry install
hit ENOTFOUND and was interrupted. Corrected ordinary tooling commands passed without source-test weakening,
new skips/retries, baseline changes or deadline increases. The first normal Fallow hook found two new complexity
hotspots in cleanup classification and the cleanup-case setup; both were simplified within the approved files,
then affected source, generated, build and packed checks were renewed. No suppression or baseline adjustment was used. A docs-check traversal of dependency symlinks was resolved
by worktree-local dependency clones. Next emitted a multiple-lockfile workspace-root warning and Turbopack
dynamic file-pattern warnings; compilation and production route generation still passed. These are not native or
provider observations. No native attempt, historical campaign or consumed inference budget was retried.

## Remaining boundary

The full native product adapter remains incomplete. Native acquisition/configuration, status decoding,
recoverable assignment-secret custody and native-to-six-role composition require separate decisions and authority.
R1 is not B1 readiness, runtime/account eligibility, host isolation or helper-lifetime evidence. M13 remains
BLOCKED / NOT QUALIFIED. Frozen contracts, M06 custody, HALTs/UNKNOWNs, original-owned cleanup and consumed budgets
are preserved. No historical campaign or native root is replayed or reset.
