# M02 current state after R44 owned stop

## Confirmed result

R36 completed native B14. R43 completed focused native A12 with bounded cleanup; its firstUnreviewedPath was null. R43 did not reproduce or explain R41's rejected path or unresolved cleanup. Separate successful runs and historical prefixes cannot be merged into full T2 qualification.

R44 was submitted once in tool session 85962 after focused exact review and passing file-only precheck. The fresh original 24-case campaign at /private/tmp/appraise-m02-ta-matrix-p26 recorded B01–B04 complete, then stopped making journal progress. B04 finish was written at 2026-10-17T18:06:14.493Z. No B05 begin was recorded. At the first unresolved stall, the original tool session received one Control-C owned-stop attempt and returned exit 130. This was an uncertainty stop, not a claim that the 40-minute phase deadline expired.

Terminal is UNKNOWN. Its journal has 239 hash-verified records, 115 reservations, 115 ACKs, zero pending, four finish events, no native UNKNOWN fence and no terminal checkpoint. The exclusive archive contains 30 original/copy pairs. Four completed-case cleanup conjunctions are retained. The wait location and underlying cause are UNKNOWN. Tool exit 130 and an owned-stop observation do not establish complete cleanup or global process absence. Never retry/resume R44 or any consumed command.

Terminal .appraisejs/m02-r44-native-terminal-01.json SHA256 286249ba8b8921baa833a0b1885373d78714095d351fbd3983c99480a8909a84.
Index .appraisejs/m02-r44-native-terminal-evidence-01/index.json SHA256 5621aa1803ff639de9b4ae46cdd63e3ebfdb8e5080cf6446bddabf398c279c0d.

Observed R44 journal consumption: listener/Codex/MCP/thread/turn 4 each; provider 13; scoped 9; workspace/permission/helper 0; control 12; canonical 34; outer 9; audit 18; source capacity reserved 16. Source capacity is not an independently observed total host count. Retain the entire R44 allocation, not just these observations: cumulative listener 209/control 818/source 516/combined listener 210 including R16; Codex/MCP/thread206, turn198, provider493, scoped280, workspace2, permission10, outer296, canonical1526. Historical audit/helper totals remain absent. Unrun R39/R40/R42/R45 add zero. No refunds or resets.

## Direct diagnosis and limits

A bounded read-only query of this exact private journal found one same-user process holder. Two metadata samples five seconds apart observed state Ss and unchanged CPU time 6:54.15. The sanitized observation retains no PID, argv, environment, provider, account or auth data. It establishes neither owned identity nor the wait location nor cleanup. Evidence: .appraisejs/m02-r44-private-journal-holder-observation-01.json. No signals were sent by that query; the later stop used the original tool session, not a discovered PID.

A static trace found a linear predecessor chain, not exponential recursion. One successful admission expands to 117,651 current-closure claim iterations plus 17 TA04 scans with 110,466 live and 391 archive claim iterations, before other receipt/witness work. These counts establish duplicate work, not the active stall's cause.

The exact real R44 callback verifier, verifyR43Predecessor({requireNewRootAbsent:false}), was then invoked once offline with process launches, sockets/TLS/datagrams/fetch and native-addon loading blocked. It completed in 39196.963583ms, external-effect attempts 0, tool session60759 exit0. This did not reproduce the long native wait. Evidence: .appraisejs/m02-r44-guarded-admission-timing-01.json. No performance correction is claimed to explain or fix R44.

## Passing checks and preserved files

R44 guarded actual entrypoint prepare→verify passed once: 46 imports, zero external-effect attempts, 8756 artifact claims. Manifest SHA256 22095597b02883fb421f42d908a29cb54c49de5174d0857b6d91305dd4c856ff; digest baa64e1935fd5c4abc21c21485275168b4130e93840b1f95e4330b36bfa3b7c0; canonical SHA256 647ed5c99199818240bb0f7359ddbaa90d5d45310d2148ad75e304d980098b2c. Focused review accepted, SHA256 d38192a5cef74b6de71bca7d54aeb7235ac86705b894b6ceb5b5a245a1a4cec6. Precheck session15304 passed. R44 syntax, ESLint and Prettier passed before freezing. No new regression tests were written or run.

After the owned stop, all 8,733 current artifact hashes still matched; the 23 historical archive rows were preserved and their semantics were reverified by the guarded real predecessor probe. Frozen M00 remains SHA256 1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133. Root package remains SHA256 96c022e3f83bed882040c6f07c73ffca03819c13ad42bae97a2e8e24fe9c0118. See .appraisejs/m02-r44-postrun-file-integrity-01.json. No accepted predecessor artifact was rewritten. Branch remains codex/journey-app-server-migration; unrelated dirty work and committed harness changes are preserved. No commits or push.

Changed areas are additive R44 fixture/preparation/review/bindings/native evidence, this status record and bounded diagnostic proposal. Conditional R45 T3 source was copied to a new directory and passed ESLint/Prettier; its verifier/budget modules passed syntax checks. It is unprepared, unreviewed for execution and unrun. Its full-success terminal pins remain CLOSED_TERMINAL_PIN_NOT_YET_SUPPLIED. Never fill those success slots with R44's UNKNOWN terminal. No T3 allocation was consumed.

## Next bounded step

Attribution is unavailable. The concrete proposal is m02-r44-inflight-admission-diagnostic-proposal-01.md: record only a finite reviewed case ID, stage enum and bounded sequence around finish append, complete return, next-case entry, receipt checks, recursive-history entry/return, admission readiness and case begin. It must distinguish a visible finish line from append/fsync returning. No raw provider/account/auth data, paths, PIDs, argv/environment, new OS query, acceptance relaxation or extra action authority. Exact write/event/byte accounting and failure behavior must be reviewed before any fresh native invocation. This is a proposal, not an implemented correction or a runtime-ready command. Existing standing test permission persists; no consumed command becomes reusable.

T2, T3 and M02 remain incomplete. T3 requires a fresh campaign's own all 24 successful conjunctions and closed terminal; no combination of prefixes suffices. Remaining untested boundaries include complete 24 stability, the actual wait boundary, any unobserved cleanup, and native N01/N02 workspace behavior. GC3 remains REVISE/not passed; real inference remains exhausted 3/3. No auth, real inference, production grants, privileged tracing, historical cleanup, commits or push occurred. Effective host role/model/context/sandbox and total process inventory remain UNATTESTED.
