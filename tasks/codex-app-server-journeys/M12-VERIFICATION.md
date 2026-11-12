# M12 — Local packaging and mode transfer verification

M12 implementation and deterministic local verification are complete within the bounded scope below.
Final artifact review and hook results are recorded at the end of this evidence index.
See [bounded plan](m12-packaging-mode-transfer-plan.md) for base, authority and scope.

## Retained infrastructure observations

- Initial sandbox fetch refused `.git/FETCH_HEAD`; authorized fetch then succeeded, tip `8d8d8254`.
- Root `npm ci` installed dependencies, but its hook installer reported worktree `.git/hooks` ENOTDIR.
  The existing shared pre-commit hook remains present; it must run normally for local commits.
- Initial package build used root Zod rather than package-local dependencies and failed TypeScript. Package-local
  installation corrected resolution and the CLI build passed.
- Initial scaffold preparation was denied TSX IPC. The standard command under the authorized host profile reached
  migration, then exposed a missing generated Prisma client. No database reset or migration-ledger repair was used.
- Restricted-host synthetic supervisor checks failed at owned child creation. Their failed log is retained;
  fresh disposable checks under the required process profile are recorded separately.
- Browser plugin `control-in-app-browser` skill/tools are absent from this host's available inventory.
  The documented Playwright fallback is used for local UI checks; no browser recreation substitutes for a plugin UI.

## Qualification limits

`runtimeQualified=false`. Actual provider/model/authentication, helper lifetime/global containment,
production scheduling, other hosts/operating systems, distribution/auth eligibility, public opt-in and release remain
unqualified. Historical UNKNOWN outcomes, consumed budgets and M06 custody worktrees retain their previous status.

## Completed observations (local)

- Recovery baseline: session/provider recovery/owned-turn suites passed; owned-process suite passed 22 cases under
  the required process profile after the restricted-host launch failures.
- Existing role/presentation/lifecycle checks: 26 cases in three suites; additional canonical six-role/E2/runtime
  checks: 54 cases in nine suites. Requested nonexistent test paths were not counted as coverage.
- Storage compatibility: 24 cases in three suites, including actual populated predecessor upgrade and future-storage
  refusal. The absent-file clean-install defect was reproduced at two fresh paths; exclusive empty-file initialization
  allowed all actual migrations to deploy. Its canonical regression verifies real deploy and complete ledger parity.
- Application build completed compilation, TypeScript, static generation and route collection. The post-review correction and subsequent hook-refactor builds also passed.
- Playwright fallback: one real local browser pause/restart/resume test passed, with semantic controls, console and
  failed-request assertions. Fresh database was migrated through the guarded script; no reset or fabricated ledger.

## Independent review corrections

Review reproduced a canonical resume defect: prepare an unarmed intent, pause without an original owned cleanup
handle, then resume. Pause invalidated the unarmed intent, and the old readiness check ignored `managedTurn=UNKNOWN`,
allowing ACTIVE. The correction keeps the canonical pause fence until managed cleanup is observed; it does not
reconstruct a handle, credential or send permit. The original failing observation and focused regression remain
separate from physical provider reconciliation.

Review also identified an installed-proof fixture importing the producer's receipt sealer. The proof must import the
generated application's sealer and use its installed dependencies before claiming installed runtime resolution.

## Packed artifacts and generated applications

Actual passing proof: `.appraisejs/m12-evidence/run-4aibEn/result.json`. Every command and failed earlier run remains
under `.appraisejs/m12-evidence/`. The executed proof's exact bytes are retained beside the result as
`executed-proof.mjs`; SHA-256 `f863d9fa8faf325b745b08be1976383890d854c72fb16dd30525f6c33339b061`.

| Packed artifact               | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `appraisejs-0.4.0.tgz`        | `0d0e593599832d4be8c4d0a223d9eaf18aa559f8a5c35fbeed833590ed891a9d` |
| `create-appraisejs-0.4.0.tgz` | `13ceb6463b7dc3ef794ae90df272e18d908652c9dc75d43204cca71696556730` |

Both tarballs were installed into a fresh local prefix with actual dependency installation, without producer dependency
links or global installation. The installed CLI resolved its marketplace from a foreign cwd. A fixed synthetic Codex
stub exercised unknown-version and disabled-MCP refusal; no actual Codex/auth/provider command ran. Disposable local
CLI disconnect/reconnect rotated project access while preserving database bytes. Real stdio/HTTP credential
revocation, fresh-client reconnect and project isolation also passed the package transport suite.

The installed compiled scaffold composer produced blank and starter applications; the installed CLI entry point was
smoke-checked separately. This is not an observed interactive prompt session. Both seed databases retained complete
migration history and no Journey/run state. Source/template migration inventory and exclusion hashes matched.
The generated apps installed their own dependencies and generated their own Prisma client. A genuinely missing
separate database passed all 98 migrations through the guarded command. A predecessor database constructed by applying
genuine migration SQL upgraded through that same generated command and retained its prior ledger and sentinel record.
A deliberately synthetic future-version fixture refused downgrade with byte-identical storage and retained records.
The populated canonical compatibility suite separately checks authored/Journey/approval/consent/evidence and ownership
history preservation; the sentinel fixture is not presented as live Journey evidence.

The generated application's own receipt sealer resolved installed Cucumber plus bundled runtime/hooks despite decoy
packages in target/output directories. No producer source import substituted for that observation. The producer-only
M12 proof is excluded canonically from scaffold output.

## Transfer, rollback and recovery evidence

`quality-journey-hosting-transfer.sqlite.integration.test.ts` exercises both hosting directions, inert registration,
trusted human/snapshot/principal/project checks, one-winner races, monotonic generations, stale predecessor writes,
old handoff fencing, changed-payload refusal, exact replay through a fresh client and an actual fresh Node process,
unchanged authorization/attempt/session-binding budgets, global/orphan HUB occupancy, pending/armed intent,
historical dispatch uncertainty and browser/process cleanup loss. Reverse transfer uses a fresh generation and keeps
the Journey paused. No accepted artifact or process exit releases an uncertain provider slot.

The final four-suite recovery batch passed **78 tests**, including actual owned synthetic children and deferred M10
publication. The independent reviewer separately passed **75 updated core tests** and reproduced the fixed resume
refusal. Managed cleanup gate positive cases use a synthetic original callback; actual-child drain observations are
separate M11 supervisor cases. Injected reply loss is not an observed OS crash. Missing original handles remain
UNKNOWN; no PID, database identity, stored lineage or accepted replay creates cleanup authority.

Captured external-only Desktop work retains existing resume semantics without an Appraise-owned process claim.
Resume validates complete receipts for captured provider-owned attempts; transfer requires the full captured cleanup
set. A later browser pause replay can conservatively block transfer if captured handles are absent, even with an older
stop receipt. This is an explicit refusal, not a forced reattachment or a claimed recovery success.

## Repository verification

- Final application build passed compiler prerequisites, Next compilation, TypeScript, static generation and traces.
  Nested-worktree root inference and broad path-tracing warnings were retained; source was built from this worktree.
- CLI package: 294 checks passed under restricted host plus its one real transport-revocation check passed with
  authorized loopback/stdio support. Scaffold package: 168 checks passed. Additional focused exclusion checks: 75 passed.
- Role/runtime checks: 54 tests; presentation/lifecycle checks: 26; UI boundary checks: 31; canonical submission/handoff
  fences: 39. These are scoped deterministic rechecks, not new actual-provider qualification.
- Storage compatibility batch: 24 checks; clean missing-file guard regression/refusal suite: 20. Migration rehearsal
  applied 98 migrations and verified retained schema data/foreign keys; inventory verified all 98 checksums.
- Package inventory passed: CLI 147 files, scaffold 1417 files; actual packed migration names/SQL hashes matched all 98.
  Generated-artifact policy, harness checks and documentation links passed.
- Focused ESLint passed with zero errors or warnings; formatting and diff checks passed for the implementation.
  The existing E2 mock fixture retains inherited Prettier drift, independently confirmed on base `8d8d8254`;
  its only semantic change adds the required persisted contract field. No broad formatting churn was introduced.
- Template preparation ran from canonical source. Graphs regenerated for source, scripts and package scopes.
  Initial scripts full generation requested semantic extraction for two unchanged documents; code-only incremental
  refresh preserved existing semantics. No API key or external model was used. Source/scripts graphs exceeded the
  5,000-node HTML limit; no large HTML was generated, and obsolete scripts HTML was removed by the generator.
- Browser plugin skill/tools were unavailable. The documented Playwright fallback passed the real local
  pause/restart/resume UI check again after the recovery correction, using a separately migrated disposable database.

No historical campaign was replayed. Original M06 worktrees, failed attempts and UNKNOWN outcomes were preserved.
No new actual-provider outcome, global helper inventory, host containment or distribution eligibility was established.

## Final gates and retained uncertainty

Normal pre-commit protections passed after the mechanical refactor: Fallow reports zero introduced findings/clones;
React Doctor reports 100/100 with no issues. The earlier rejected hook report remains in `hooks.log`;
`hooks-contract-floor-final.log` records the passing gate on the real compatibility floor. No hook, suppression or baseline was bypassed.

The generated installed app also started through its own guarded `scripts/start-local.mjs`, served HTTP 200 and
rendered **Projects | AppraiseJS** through the Playwright CLI fallback, with zero console errors/warnings. Its original
owned process group reported `group_exit_observed`. A first request-inventory command was unsupported; a short-lived
follow-up stopped before browser navigation and recorded connection refusal. The final single-session observation
passed; its non-static request list was empty (30 static requests were omitted by the CLI default). No global process
cleanup is inferred from these owned group observations.

Failed restricted-host fixture launches reported retained private recovery roots. Their underlying launch cause and
complete cleanup remain unverified; later fresh successful fixtures do not resolve that earlier uncertainty. Those
failures and UNKNOWN evidence remain preserved. No stored PID or restored numeric identity was signaled.

The scorecard refused blank effective-context receipts. Requested bounded solver/judge assignments and independent
review are retained, but effective host role/model/context/sandbox proof is unavailable. No receipt or credential was
fabricated to make the ledger accept a score. Advisory assessment and setup lessons remain in the harness observation.

## Genuine M12 downgrade compatibility floor

Final review superseded the provisional 97-migration acceptance. A real canonical M12 transfer produced an external
session requiring principal checks absent in M11. Its unchanged ledger let M11 report COMPATIBLE and accept a foreign
principal through the old session checker. The synthetic future-row test had proved the refusal algorithm, not M12's
actual compatibility floor; the failing independent observation remains in `review-downgrade-before.json`.

The genuine additive migration `20261112010000_add_journey_hosting_contract_version` adds persisted
`QualityJourney.hostingContractVersion`, default 1 for existing history. Explicit mode transfer writes version 2 in
the ownership CAS. The shared canonical reader refuses missing/null/unknown versions before activation, registration,
worker mutation, transfer and recovery effects. Version metadata never grants authority. Migration SQL SHA-256 is
`f7243eb642b69f529b9695f525ede19051925b8f82784d00b43236d95329cd0f`; all 98 genuine inventory entries match.

The final packed proof archives exact M11 startup/upgrade source and its original 97 migration files/inventory from
`8d8d8254`. That isolated predecessor fixture reuses only the generated app's installed dependencies, explicitly
separate from the fresh tarball installation claim. Both prior `migrate-db` and `start-local` refuse the genuinely
migrated 98-entry database before readiness/destructive writes and preserve database SHA-256. Ownership rows in this
installed refusal fixture are directly seeded synthetic shapes; they are not a canonical accepted transfer or valid
authority. Canonical transfer is established separately by the 75-test core suite. No ledger row is fabricated for
this actual predecessor refusal. The older synthetic future-version test remains a distinct negative fixture.

The post-floor application build passed. The final recovery/deferred-publication batch passed 78 tests; independent
core verification passed 75 and populated upgrade/authorization boundary checks passed 10. A known-field update in
two mock fixtures preserved their original unauthorized/E2 assertions. All prior 97-entry packed proofs and earlier
accepted artifact hashes remain retained as superseded evidence. No earlier database or campaign was reset.

The exact final 98-migration installed generated app also passed its own guarded startup and rendered Projects through
the CLI browser fallback. `generated-startup-floor-result.json` records HTTP 200 and original owned
`group_exit_observed`; `generated-floor-console.log` reports zero errors/warnings. The complete request inventory
(including static assets) contains no failed requests or HTTP 4xx/5xx responses. The corrected full observation does
not erase the earlier unsupported-command and intentional short-lifetime observations.

## Independent completion review

Accepted for this bounded internal engineering scope after the genuine downgrade-floor correction. The reviewer
verified exact manifest `b8b46beefd22f9bba12964b4bb24262dc98012d1d465e6ba517ffe0590b2f50d` and patch
`69818101693ec4ea981f6f81870f888d07ba7c377b67d7bedc1e04f852da2f61`, all 51 staged paths, executed proof/tarballs,
canonical/template/packed/generated parity and actual predecessor refusal logs. Independent core tests passed 75/75
and populated-upgrade/authority checks 10/10. No material finding remains. The completion addendum changes only this
evidence index and the M12 checkbox/status; it grants no provider, host, distribution, public rollout or shipping authority.
