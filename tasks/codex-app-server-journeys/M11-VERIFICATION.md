# M11 — Pause, interruption and restart

Scope: disposable internal managed Journeys. Base `origin/appraise-0.5` was freshly fetched at
`2dbc3a7692147fa8d9204b5ab5401474dfcb5dfe`, containing M06 `e8adf05b`, M07 `84fce1cd`,
M08 `308660c7`, M09 `38c2ca82` and M10 `2dbc3a76` (ancestry checks passed).
Branch: `codex/m11-pause-interruption-restart`; isolated worktree: `.appraisejs/m11-worktree`.

## Canonical changes and invariants

The human pause transaction snapshots scoped provider attempts, including already accepted attempts, before expiring
unaccepted assignments. The immutable pause epoch also captures the canonical database path and physical file instance's domain-separated digest.
The digest includes filesystem device/inode. It is a matching discriminator, not a credential: a same-path replacement after registration cannot select the original hub's live handles. Two stat observations reject changes during capture. These pathname stats do not attest the SQLite connection's open file descriptor or exclude arbitrary filesystem replacement before/after capture; the discriminator is cleanup-only and grants no authority. Canonical service writes and original live ownership remain independently required.
After the durable fence commits, cleanup enters every matching original supervisor cancellation before awaiting drain.
The original supervisor synchronously closes its private write gate and uses its existing owned-handle stop boundary.
Identity capture failure preserves the canonical pause fence and yields UNKNOWN without selecting a handle.
No stored PID, group ID, thread ID, session lineage or registry lookup creates signaling or dispatch authority.

The private registry holds weak references to original supervisor handles. Competing constructed supervisors cannot
shadow an earlier owner; canonical claim/arm transactions still decide which one may send. A restart cannot rebuild
those references. Missing handles, rejected cleanup and a five-second observation timeout yield `UNKNOWN`. A pending
original stop remains pending after this observation timeout; it is neither abandoned nor treated as success. Separate
receipt fields distinguish stop request, sender fence, observed turn outcome, owned group exit and private-root removal.
An observed owned stop never certifies provider termination, artifact acceptance, test success or HUB release.

Resume retains the canonical browser/capsule/provider reconciliation gates. Accepted artifact lookup authenticates the
original assignment and recovers only its already committed result; it does not renew leases or resolve physical effects.
Only the existing physical reconciliation boundary can release an uncertain provider slot. Exact already committed
reconciliation remains replayable; restart never manufactures sender-exclusion proof, credentials or a new send permit.
Historical pause receipts without the additive managed snapshot remain readable. Their absent handles grant no authority.

## Crash and fault evidence map

| Boundary / condition                                                          | Evidence                                                        | Interpretation                                                                                                                                      |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intent preparation / claim / arm reply loss, before-commit rollback           | Provider-run SQLite suite                                       | Real SQLite commits/rollbacks; injected lost replies; replay preserves rows, budgets and UNKNOWN                                                    |
| Send / start ACK loss, malformed / delayed / out-of-order events              | Supervisor SQLite suite and RPC transport suites                | Actual local synthetic child; counted `turn/start`; no replacement or success from exit/completion                                                  |
| Human pause with live turn                                                    | M11 supervisor SQLite cases                                     | Committed canonical fence, original owned drain, unchanged physical uncertainty                                                                     |
| Pause during delayed launch                                                   | M11 supervisor SQLite case                                      | Canonical PAUSED observed after local fence; returned original child drains without an RPC                                                          |
| Pause commit before cleanup reply                                             | M11 supervisor SQLite fresh-process case                        | Injected lost transaction reply; actual fresh Node process sees no live handle, reports UNKNOWN, blocks resume, reserves no second turn             |
| Accepted tool commit whose reply is lost, then pause                          | Analysis delivery SQLite case                                   | Actual synthetic candidate; canonical acceptance; actual fresh Node process authenticates outcome lookup; no repeated submission or ownership write |
| Pending/rejected/missing cleanup, competing handles, copied database identity | Owned-turn unit cases                                           | Injected handle faults; all gates entered before drains; UNKNOWN retained; foreign/new attempts excluded                                            |
| Lease expiry, authorization revocation, takeover and duplicate wakes          | Provider-run, provider-recovery, session and wake SQLite suites | Canonical transactional fences; exact replay only; original budgets retained                                                                        |
| Paused sealing / deferred M10 publication                                     | M10 flow SQLite case                                            | Synthetic terminal run state; real evidence reconciler; fresh Prisma client resumes and publishes once; exact replay unchanged                      |
| Human pause / hub restart / resume                                            | Recovery browser check                                          | Disposable local UI; report separately from provider and runtime qualification                                                                      |

Fresh Node process tests are distinct from fresh Prisma-client tests. An injected lost reply is not an observed operating
system crash. The owning test retains and later drains its original synthetic process; the restarted reader cannot signal
it. Existing supervisor child-crash cases observe actual synthetic child exit. No real provider inference is performed.

## References and qualification limits

Read the pinned upstream session and session tests at `014bffbf775f4514020cef8bbffdc0eb5a0009ce`, downloaded into the
ignored `.appraisejs/m11-evidence/upstream/` directory. Upstream interruption/closed-child cleanup informed the comparison;
its `completedSuccessfully()` and native session handles are not Appraise acceptance or authority. No upstream code copied.

The Browser plugin's `control-in-app-browser` skill and tool surface are unavailable in this host. Use the documented
Playwright CLI fallback for interactive recovery verification, with semantic state, console and failed-request checks.
The initial sandbox owned-child test failures and first worktree dependency-resolution failure are retained as infrastructure
failures. The first fresh-process artifact test used the wrong expected response envelope; its failed assertion is retained
and corrected against the canonical outcome-get contract.

The initial focused E2E run failed before reaching UI because older fixtures bypassed shared-resource initialization and reused a fingerprint. The three fixtures now use the existing canonical fixture helper and unique target fingerprints; all five browser regressions pass with their assertions preserved. Original failure artifacts remain retained.

Logs live in ignored `.appraisejs/m11-evidence/`; final check results and browser observations are recorded below after
verification. Source, scaffold and review results must agree before marking the task verified.

Runtime/provider qualification, effective host containment, live protected access, installed packaging (M12), production
dispatch, public managed opt-in, M12+ implementation, shipping and package publication remain outside scope.
`runtimeQualified=false`; historical M06 STOP, spent attempts and UNKNOWN evidence are preserved. No real-provider
NONSTART/TERMINAL proof is created here. A consumed synthetic provider turn remains UNKNOWN even after owned cleanup.

## Verification results

- Root unit run: 351 files, 3,423 passed / 4 skipped. The final identity-failure addition is covered separately by
  the subsequent supervisor/recovery run: 31 tests passed. No historical M06 campaign was invoked.
- Focused recovery matrix before that final addition: 56 tests passed, including fresh Node readers, actual owned
  children, accepted-artifact replay, copy/replacement isolation and M10 deferred publication.
- Focused Chromium E2E: 5 passed after fixture repair, including actual hub restart, execution overview, triage
  revision, closure review and responsive artifact navigation/search. Manual Playwright CLI observed managed pause,
  same-database server restart and human resume; owned-agent cleanup text rendered separately. External coordinator
  presentation remained external-only; managed mode had no desktop coordinator. Browser console reported zero
  messages/errors/warnings. No provider was started by either UI check.
- Pre-commit checks passed: Fallow introduced zero issues and React Doctor scored 100/100. Focused lint passed with
  two existing unused diagnostic-destructuring warnings in the supervisor; no new lint errors. Typecheck passed.
- Canonical scaffold preparation, scaffold package tests (13 files / 167 tests), harness checks, documentation links,
  generated artifact policy and packed package/migration inventory checks passed. Final production build passed after the last identity-failure adjustment. Repository lint passed with existing warnings and no errors; downloaded upstream references are retained byte-for-byte with text extensions so they are not linted as Appraise source.
- Source graph regenerated through the repository wrapper. The generator skipped HTML beyond its 5,000-node safety
  limit and removed its obsolete tracked HTML; graph/report remain generated outputs. Documentation and template
  changes outside safe graph scopes were skipped by design.

Independent review initially requested changes for database-instance matching and pause availability under missing
identity. Both were fixed and their failed/review evidence retained. Final independent re-review accepted the canonical source/test artifact for this bounded internal scope, with no further actionable findings. Role/model/context/sandbox runtime properties remain unverified beyond the host's requested spawn metadata;
all review assignments explicitly used no inherited transcript and bounded packets.

The independent review accepted both fixes; no release or runtime qualification follows. Local failed attempts, browser observations and validation logs remain in the isolated worktree evidence directory.

The local swarm scorecard rejected linkage without an effective host-context receipt. No attestation was fabricated;
requested routes, independent review messages and the refusal remain preserved. The portable advisory observation
records the assessment and follow-up without changing harness enforcement.
