# M12 post-merge browser startup follow-up

Base: `3025b34a5ffafdca011f797f1d7152ee43f00710` (M12 merge, PR #313).
Branch: `codex/m12-post-merge-browser-ci`.
Worktree: `.appraisejs/m12-ci-followup-worktree`.

## Authority and preserved evidence

The user authorized fixing the three post-merge CI failures, shipping the fixes to `appraise-0.5`, and updating the
M13 continuation prompt. Verification remains limited to repository work, disposable installations/databases,
synthetic targets and original owned local processes. No provider inference, authentication, global installation,
public managed opt-in, default-mode change, package publication or M13 implementation is authorized.

All M06 custody/spent attempts, M11/M12 worktrees, failed CSP and teardown attempts, consumed budgets and historical
UNKNOWN observations remain preserved. Local evidence for this follow-up is under
`.appraisejs/ci-browser-followup-evidence/` in this worktree. Original post-merge evidence is also retained under
`.appraisejs/m13-preflight-evidence/` in the main repository.

## Observed failure and scope of diagnosis

M12 PR CI `43255068710` passed on `a26bb0f4`. Post-merge push CI `43257406330` at `3025b34a` separately failed root
validation: 3476 passed, three failed, four skipped. Security/quality, package and dependency jobs passed.
The three native browser failures were:

- Pipe-loss process/profile cleanup before runtime registration: five-second test timeout.
- Headed paused-worker barrier with delayed signal delivery: fifteen-second test timeout.
- Headed conditional-304 subresource response: five-second test timeout.

The two headed diagnostics reached `transport:start`, but not `transport:spawned`; no browser identity, protocol,
request or target observations were recorded. That interval includes probe launch, probe shutdown and subsequent
owned-process setup. It does not prove which subphase stalled or that no browser process existed. Exact historical
cause and complete cleanup remain UNKNOWN. A fresh authorized local baseline passed exactly these three cases
(`three-cases-baseline.log`); this is a non-reproduction, not resolution of the historical observation.

The installed Playwright 1.61.1 runtime bundle gives `launchServer()` a 180-second default, despite its type
documentation stating 30 seconds. The adapter supplied no explicit launch deadline, awaited graceful probe close,
and the test registered transport cleanup only after launch returned. The shorter runner deadlines therefore did
not bound startup or establish custody of late results.

## Required repair contract

Retain the supported Playwright probe and its mode-specific executable selection. Replacing it with the public
`executablePath()` accessor would select a different binary for headless mode. No executable, channel, transport,
host or provider fallback is introduced.

Use explicit finite startup limits: 30 seconds for probe launch, five for graceful probe close, five for supported
probe kill plus original-process exit observation, and 45 for transport admission. Cancellation/deadline custody
starts before the first await. Abort or failure permanently fences publication; late probe, profile and owned-child
results remain owned by the original startup operation. Missing handles or unproved cleanup remain UNKNOWN.

The native fixture owns pending startup before awaiting it, aborts before asynchronous teardown, and does not append
late results into another test's cleanup list. Its file-local case envelope is 120 seconds (45 startup, 30 body, 45
cleanup allowances), with a 50-second cleanup-hook envelope. These are selected finite allowances, not a performance
SLO or exhaustive sum of every operation timeout. Existing polls, operation deadlines, retries, skips, test bodies
and effect/worker-witness assertions remain required; global Vitest configuration is unchanged.

Preserve M12's process-first stop: logical fencing, original live owned-group termination before debugger detachment,
observed child exit and group quiescence before pipe/profile release. A failed stop retains resources and UNKNOWN;
no stored PID, reconstructed handle, artifact acceptance or elapsed timeout creates cleanup authority.

A related canonical startup gap must also be closed: a pending launch can return after pause has marked its own
durable browser row UNKNOWN. Revalidate the mutable frozen scope and original own-row LAUNCHING identity before
initial navigation. Retain the existing post-navigation checks and LIVE-status CAS guard. This fixes the demonstrated
late-launch case; it does not establish globally atomic ordering between every pause and physical network effect.
Observed-cleanup writes must also retain the original session, generation and process-instance identity; closing an
original browser cannot certify a changed foreign lineage. Trusted pause may still fence foreign/restarted rows as
UNKNOWN without reconstructing any physical cleanup authority.

## Verification and release gates

Required evidence includes deterministic old-fails/new-passes startup/cancellation and late-authority regressions,
the complete native browser matrix, original teardown/runtime boundaries, focused quality checks, canonical
scaffold/Graphify regeneration, application/package builds, actual packed artifact checks and independent exact-artifact
review. Fresh PR and post-merge base CI must pass before the follow-up is reported complete.

Actual provider/authentication, global helper/host containment, other distribution hosts, public rollout and M13
remain unqualified. This follow-up cannot relabel prior UNKNOWN outcomes or renew consumed campaign allocations.

## Local verification record

- `service-pre-goto-old.log`: five new late-authority cases failed against the unchanged service. The real pause-cleanup
  entry point is exercised with a synthetic ledger; manually selected PAUSED fixture state is not an actual SQLite
  pause-transaction observation. The corrected service suite passed 105 cases after the final identity predicate
  extraction (`startup-service-final.log`).
- `startup-pre-aborted-old.log`: the unchanged transport failed the pre-aborted launch refusal. The repaired path
  admits no launch effects for an already-aborted signal. Exact old/new test and source snapshots remain retained.
- `startup-focused-final.log`: 183 checks passed across transport (24), service (105), fixture owner (3) and runtime
  (51) before the final probe exit-shape hardening. Independent review also passed that batch.
- `startup-native-85-1.log`: all 85 native cases passed in both browser modes, preserving every original effect and
  worker-witness assertion. The final exit-shape correction changes only unsupported metadata handling; the valid
  Node path is unchanged. Exact final packed/native and Linux verification remain required.
- Review found that `undefined !== null` could treat absent probe exit fields as exit evidence. The added regression
  failed before hardening (`probe-exit-shape-old.log`); the corrected full transport suite passed 25 cases, as did
  independent transport verification. Missing/malformed fields now preserve UNKNOWN and prohibit owned spawn or
  numeric probe signaling. Positive exit evidence or an explicit live null/null shape plus original exit observation
  is required.
- Final TypeScript, ESLint, Prettier, diff and normal Fallow checks passed, with zero introduced Fallow findings and no
  baseline changes. The nine-path corrected source snapshot is `startup-exit-shape-frozen.patch`, SHA-256
  `b4cc6a96359c88e5faf6e0d84dc5088513e9851e5bcd38a514c40d448f6c621f`.

The initial build/generation round preceding the required exit-shape correction remains retained as superseded.
No source baseline switch overlaps parent artifact builds. The bundled Browser plugin/skill is absent from this
host's available inventory; the documented Playwright fallback supplies the real local native-browser observations.
No provider, sign-in or protected production target is used.

## Final installed-artifact validation

The corrected source was frozen before final scaffold preparation, Graphify refresh and application build. All three
completed successfully. Harness, documentation links and generated-artifact policy checks passed. Initial source
checks reused the prior worktree's installed dependencies; that is not counted as a clean installation.

Actual fresh prefix installation and blank/starter scaffold composition passed through the unchanged M12 proof script
(`f863d9fa8faf325b745b08be1976383890d854c72fb16dd30525f6c33339b061`). The result is retained in this worktree at
`.appraisejs/m12-evidence/run-U1u5Hw/result.json`. Tarball SHA-256:

- `appraisejs`: `0d0e593599832d4be8c4d0a223d9eaf18aa559f8a5c35fbeed833590ed891a9d`.
- `create-appraisejs`: `9536d30a1c18941376871867cbfa01e11993f27ccb82df9da67ab415321dfa01`.

Genuine cold migration, populated predecessor upgrade, exact M11 guarded downgrade refusal, synthetic future-storage
refusal, project credential rotation and installed runtime resolution all passed. The proof's synthetic ownership
rows remain distinct from canonical transfer authority. Package inventory passed at 147 CLI files and 1421 scaffold
files; all 98 packed migration names and SQL hashes match canonical source.

The final installed generated application's focused startup/service/owner/runtime suites passed 184 checks
(`installed-focused.log`), and its exact three formerly failing native paths passed (`installed-three-native.log`).
The other 82 native cases were unselected in that focused installed run, not removed from the full 85-case matrix.
These observations bind the actual final packed source to the repair. Fresh Linux PR and post-merge CI and final
independent artifact acceptance remain required shipping gates; neither the old CI failures nor historical cleanup
UNKNOWNs are relabeled by a later passing candidate.
