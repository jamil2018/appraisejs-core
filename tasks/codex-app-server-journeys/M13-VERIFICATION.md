> Additive follow-up: [six-role replay and authority matrix](M13-REPLAY-VERIFICATION.md) completes the identified
> replay/revocation/stale-session/changed-payload cases. This original review retains its historical artifact scope;
> runtime support and managed-release readiness remain unqualified.

# M13 — Exact release-candidate review

Date: 2026-11-13 (Asia/Dhaka). **Bounded review completed; release readiness BLOCKED / NOT QUALIFIED.**
The M13 acceptance checkbox remains open. This record authorizes no release, public managed opt-in, default-mode
change, provider inference, authentication, historical campaign replay or M14 work.

## Candidate and artifact identity

Fresh `git fetch origin appraise-0.5` selected commit
`5727e209d3ff61991da5b49e23e13337cdc235e8`, tree `eb6d0b07ee8f87ca4700dbe85f199ab170843493`.
There are no intervening commits after the supplied handoff base. All requested M06–M12 merge and M11 implementation
identifiers are verified ancestors. Work is isolated on `codex/m13-exact-release-candidate` in
`.appraisejs/m13-exact-release-candidate`; the dirty primary checkout and every prior worktree remain untouched.
No product source, migration SQL, quality baseline, timeout, retry/skip policy or frozen approval changed.

The release payload is the candidate above. This additive review record, task links and sanitized harness lesson are
review material, separately bound by the final artifact snapshot; they are not a newly qualified executable build.
Local evidence is under `.appraisejs/m13-evidence/` in this worktree. Each check receipt records command, cwd,
start time, elapsed duration, exit status and log SHA-256. `candidate.json` retains ancestry, platform and lock hashes.

| Artifact                        | Fresh M13 SHA-256                                                  |
| ------------------------------- | ------------------------------------------------------------------ |
| appraisejs 0.4.0 tarball        | `0d0e593599832d4be8c4d0a223d9eaf18aa559f8a5c35fbeed833590ed891a9d` |
| create-appraisejs 0.4.0 tarball | `6d75798f3b1b1e26e276549b6b9b3e19c52e487141ee2233c8028e4b83a0189c` |
| migration inventory             | `2913a2bc02c364afec3e379ffed91cd6fc095ad7e1c3dd1a0b64118d603f0078` |
| unchanged packed proof script   | `f863d9fa8faf325b745b08be1976383890d854c72fb16dd30525f6c33339b061` |

Final fresh packed proof: `.appraisejs/m12-evidence/run-0Flx5w/result.json`.
The CLI bytes match the handoff. The scaffold differs from handoff hash
`652e07dbfc1ebd8e2de17215a56899ca4007142fa33d4e9bfba2fca33cb50df1` only in the two freshly prepared
seed databases. All 1,421 file names and every other file byte match; schema and table row counts match.
Changed seed fields are creation/publication timestamps, migration UUIDs/timestamps, telemetry IDs and derived
publication receipt JSON/hashes. The seeds have 98 completed migrations, 127 Step Definitions and no Journey/run,
target identity or coordinator credential state. See `scaffold-final-comparison.json` and `seed-comparison.json`.
This fresh tarball has its own observations; predecessor installed results are not relabeled as fresh.

An earlier M13 packed run `run-rYFqdc` passed its proof but had 1,420 files: scaffold copying preceded the root
build's generation of ignored `next-env.d.ts`. Its tarball, comparison and logs remain preserved. Sequential
root-build completion followed by canonical scaffold build produced the final artifact above. No prior artifact
was overwritten or represented as byte-identical.

## Configuration, installation and startup

Observed local host: macOS 27.2.1 / 26B131, Darwin arm64; Node 26.11.0, npm 11.20.0.
Fresh root and both package lockfile installations were used. Resolved versions include Playwright 1.61.1,
Prisma client 6.19.3, Next 16.2.10 and Vitest 4.1.10; root Zod is 3.25.76 and package-local CLI Zod is 4.4.3.
`dependency-resolution.json` records concrete resolution paths. This is a local observation, not another
OS/distribution or Codex/provider support qualification.

Canonical `start-local.mjs` inspects storage before operation/runtime/readiness writes and resolves the local
Next executable. `dev-with-mcp.mjs` composes web/MCP and stops its peer on child failure; setup emits the explicit
package CLI path. Package stdio and HTTP retain their documented transports and loopback/project boundary.
The supported guard excludes bare Next/Prisma, arbitrary historical binaries and coordinated code/inventory
replacement. Root compilation warns about nested-worktree root inference and broad tracing; those warnings remain
visible, and the build cwd is the candidate worktree.

The unchanged packed proof installed both actual tarballs into a new local prefix, generated blank and starter
apps through the installed composer, installed generated dependencies and generated their own Prisma client.
It checked foreign-cwd marketplace resolution, fixed synthetic unknown-Codex/disabled-MCP refusal, credential
rotation on disposable local project identities, clean seeds, all 98 migration names/SQL hashes, genuinely missing
database initialization, genuine populated predecessor upgrade, exact M11 guarded startup/upgrade refusal and
synthetic future-storage refusal with byte preservation. Its runtime sealer imports the generated app's own
installed Cucumber/runtime/hooks and excludes decoy target/output dependencies.
Synthetic ownership-shape rows in this proof establish no canonical transfer authority.

No actual Codex executable, login, provider/model entitlement, required-MCP native startup or distribution/auth
eligibility was probed in M13. Source/fixed-stub behavior does not supply these observations. Production
`dispatchProductionQualityJourneyTurn` still refuses in
`src/services/coordinator/quality-journey-process-supervisor.ts`; no alternate executable/provider/model/
transport/host was selected. Managed hosting and WorkAttempt admission remain separate.

## Lifecycle and authority review

| Boundary                      | Rechecked evidence and limit                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirement Analyzer          | Canonical Analysis submission, required questions, immutable answers/corrections, successor feedback, publication and exact approval; delivery/continuation/action/form suites. Synthetic artifacts do not qualify actual model output.                                                                                                                 |
| Scout / Resource Explorer     | Independent frozen lanes, scoped Appraise browser receipt validation, missing-access parking, environment/receipt/grant drift refusal and staged E2 refusal; internal Discovery SQLite/gateway plus browser suites. No live protected login.                                                                                                            |
| Scenario Designer / Automator | Exact portfolio publication/approval, frozen canonical operations/resources, materialization and prepared capsules; internal Discovery/scenario-automation and orchestration suites. Preparation grants no execution consent or source-write permission.                                                                                                |
| Triager / human closure       | Sealed cycle/TestRun evidence, scoped evidence reads, immutable report revision and exact review/closure; M10 SQLite, triage, closure/action and browser suites. Independent TestRuns remain ineligible Journey evidence.                                                                                                                               |
| M07 presentation              | Polling rejects foreign/stale versions, preserves pinned edits/reviews, requires explicit refresh, and keeps desktop handoff external-only; page/notice/form/handoff tests. Operational observation does not advance ownership.                                                                                                                         |
| Direct and versioned ingress  | Canonical shared acceptance authenticates exact assignment/principal/secret before durable replay; changed payload conflicts. Fresh effects require current session, authorization, role, lease and immutable attempt binding inside the transaction. All six specialized service paths plus API/MCP/schema/gateway suites ran in the aggregate checks. |
| Hosting transfer / rollback   | Explicit local-human capability, exact snapshot, canonical pause receipt, ownership CAS and monotonic successor generation; competing requests, fresh-client/process replay, preserved budgets/lineage, occupied HUB/pending or armed intent/browser/execution/cleanup refusal. Reverse transfer leaves canonical pause intact.                         |
| M11 recovery                  | Original live owned handles only; no stored PID/group signaling, recovered credentials or recreated send permits. Accepted submission replay and provider physical reconciliation remain separate. Missing cleanup retains UNKNOWN/pause; deferred terminal publication joins atomic resume without another execution.                                  |
| M12 browser repair            | Supported bounded mode-specific probe, pre-await cancellation custody, permanent publication fence, late-result ownership, immutable cleanup identity and pre-navigation own-row/scope checks. Process-first group stop and worker/effect witness assertions remain intact.                                                                             |

Source review examined the shared external acceptance transaction, all specialized external submit entry points,
session/attempt checks, transfer CAS/quiescence, gateway projection and post-I/O fencing, and UI observation logic.
The two read-only evidence lanes found no concrete defect in those examined paths. This is not an exhaustive
proof of every interleaving. In particular, an explicit accepted-then-revoke/stale-session/changed-payload matrix
through every one of the six complete role transactions was not established independently of shared-helper and
existing role-specific coverage. Do not claim exhaustive all-role replay qualification from aggregate counts.

The current all-role paths are disposable/in-process fixtures, not an enabled qualified production role loop.
Appraise decisions, exact approvals and execution consent remain authoritative; prose, accepted artifacts,
completed turns and process exit do not establish lifecycle success or physical cleanup.

## Verification and measurements

Measurements below are one local invocation each, recorded by the command wrapper; they are elapsed command/suite
times, not per-artifact model latency, throughput SLOs or provider billing measurements. Dependencies and caches
were warm unless stated otherwise. Parallel build/check contention is part of these observations.

| Observation                                                                       | Result                                                                                                    | Elapsed                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Focused service/storage/startup batch                                             | 129 passed, 2 existing skips; one sandbox socket refusal, separately resolved                             | 23.83 s runner                           |
| Local-startup boundary with loopback access                                       | 6 passed                                                                                                  | 1.94 s command                           |
| Root aggregate with owned local sockets/children/browsers                         | 354 files, 3,504 passed, 4 existing skips                                                                 | 111.19 s runner                          |
| CLI package                                                                       | 294 passed; separate real transport-revocation test passed with required access                           | 2.31 s runner + 2.62 s transport command |
| Scaffold package                                                                  | 13 files, 168 passed                                                                                      | 1.46 s runner                            |
| Root production build with required font-network access                           | passed compile, TypeScript, generation and traces                                                         | 65.89 s command                          |
| Final canonical scaffold build/preparation                                        | passed                                                                                                    | 6.41 s command                           |
| Final packed install / storage / runtime proof                                    | passed, fresh prefix and generated apps; dependency cache warm                                            | 31.99 s command                          |
| Final generated app installed startup/runtime/execution and native browser matrix | 6 files, 280 passed, 2 existing execution-runtime skips; includes all 85 native production-browser cases  | 74.72 s runner                           |
| Journey browser UI                                                                | 5 passed; execution view, real hub restart/pause/resume, report revision, closure and artifact navigation | 9.6 s runner                             |

Root lint passed with inherited warnings and no errors. Harness, generated-artifact policy, documentation links,
release-CI structure, coordinator reference and migration inventory checks passed. Graphify auto-update passed,
reporting no changed safe source scope. Scaffold was regenerated canonically; no generated source diff resulted.
Final package inventory passed at 147 CLI / 1,421 scaffold files, with all 98 migration names and SQL hashes matching.
Review-document formatting passed. Normal hooks and independent artifact review are retained in
`.appraisejs/m13-evidence/final-review.json` and the artifact snapshot/receipt in that same local directory.

The fresh disposable UI database was created through `migrate-db`; no historical/user database was reset.
The Browser plugin and `control-in-app-browser` skill are absent from available tool/skill and installed-skill
inventory. The separate Playwright CLI 0.1.22 failed before browser creation because its expected Chromium 1247
bundle is absent. No global installation or browser replacement was performed. The candidate's installed
Playwright test runner supplied the five real browser UI observations instead; its recovery case checks page
errors, failed requests and original owned-group stop across restart. An additional unused local UI server was
stopped via its original exec session (exit 130); this does not attest global process absence.

Preserved M13 infrastructure failures: restricted Prisma cache utime; root `npm ci` hook-installer ENOTDIR at a
worktree `.git/hooks` path; sandbox loopback/TSX-IPC refusal; sandbox Google Fonts fetch failure; absent CLI browser
bundle. Required checks were rerun with the applicable access, preserving original logs. Shared Git hooks remain
required for local commits. The invalid initial routing task-class argument was corrected to the registered
`architecture-review` class; no fabricated effective role/model/context/sandbox receipt was created.

Accepted synthetic artifacts and human-form tests have no separately measured model token/cost/dispatch latency
or real human-wait sample. Those metrics, provider eligibility and hard spend limits remain **UNQUALIFIED**,
not zero. No real inference was invoked to fill a table; failed/correction model-turn counts are unavailable.
Known local test/build corrections above are not provider correction turns. Human wait must remain distinct from
dispatch time; fixture waiting and test duration do not measure either production quantity.

## CI, preserved limits and readiness

Fresh GitHub metadata binds post-merge Release CI [43280107177](https://github.com/jamil2018/appraisejs-core/actions/runs/43280107177)
to `5727e209`, with all six jobs successful. Its retained root-job log reports 354 files, 3,504 passed,
four existing skips and all 85 native production-browser cases. Final PR CI
[43277748307](https://github.com/jamil2018/appraisejs-core/actions/runs/43277748307) is separately retained at its
implementation head. These Linux observations qualify their exact candidate scope, not the regenerated seed bytes
of the new local tarball. M13's fresh packed observations are separate.

[M12 verification](M12-VERIFICATION.md), [browser/execution follow-up](M12-POST-MERGE-CI.md) and
[M11 recovery](M11-VERIFICATION.md) retain their original evidence classes.
Runs 43257406330 and 43273943993 remain failed observations with historical slow phase/cleanup UNKNOWN as
documented. Prior CSP, teardown and superseded artifacts, M11 reviewer uncertainty, M06 custody HALTs, consumed
budgets and spent attempts are preserved. Reading M06 CONTINUE-NOW located obligations only; no campaign ran.

Effective TA02/TA03 approvals govern the trusted-local-agent profile. Withdrawn hostile containment and complete
helper-inventory criteria are withdrawn, never passed. `hostIsolation=NOT_ATTESTED`; same-user native access can
bypass application boundaries. Actual scratch-helper lifetime inventory remains
`UNKNOWN_NOT_INDEPENDENTLY_OBSERVED`, separate from source-derived allocations. Known original owned Codex/
Code Mode host cleanup obligations remain required; M13 creates no new observation resolving historical cleanup.

**Readiness: BLOCKED / NOT QUALIFIED for managed release or public/default rollout.** Repository tests and local
packaging are green within their stated synthetic/disposable scope, but actual runtime/provider/authentication,
required-MCP native readiness, applicable distribution claims and model usage/latency/spend remain unqualified.
There is no approved default-mode change: existing external behavior remains the default. The bounded review can
finish with this verdict; the M13 milestone checkbox remains unchecked. No push, merge or publication follows.
