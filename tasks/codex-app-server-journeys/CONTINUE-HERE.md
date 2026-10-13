# Continue on the shared Journey migration branch

Date: 2026-10-14 (Asia/Dhaka). Branch: `codex/journey-app-server-migration`.
Base: `origin/appraise-0.5` at `8d4be5c83597bb17ac756f98502738db8a69d344` (remote tip verified read-only).
Origin: `https://github.com/jamil2018/appraisejs-core.git`. Branch tracks the base; feature ref is not pushed.
Approved M00-r3: `f506fccb2f910641d7a943bec440088512f0d714`; approval recorded at `5ad51897`.
M01 fixture/schema commit: `be99b74d`.
Final observation/handoff commit: find `test: record M01 no-model observations and native-provider boundary` in
local `git log`; this handoff is part of that commit and does not self-reference its hash.
Generated scripts-graph commit: find `chore: refresh scripts graph for M01 qualification fixtures`; it follows
the observation commit and contains only generator output.

## Current checkpoint

**M00 complete; M01 protocol qualification complete for the pinned tuple; M02–M13 and U00–U10 unstarted.**
Read [current assessment](m01-qualification.md) for the acceptance matrix, exact config/source hashes,
vendor-method mapping, policy-document provenance, independent review and unverified properties.
Four true MCP request variants now roundtrip cancel; one native-produced scripted permission request
roundtrips empty permissions. Zero additional external inference, permission grants or native exec.
Approved M00 SHA-256:
`1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
Existing-login authority is a separate [amendment](m00-auth-amendment-01.md); approved M00 bytes unchanged.
Native inference remains exhausted at **3/3**; retain `/private/tmp/appraise-m01-native-l1mt4sms`.
GC3 remains **REVISE / not passed**; no historical lifecycle rows or evidence erased.

## Verification and local commits

37 deterministic checks (20 Node, nine native-runner guards, four manifest guards, four denial guards),
focused Python Ruff, Prettier, documentation links, graph refresh and whitespace checks are recorded
in the final assessment. Actual-binary observations remain a separate evidence class; upstream Rust
tests were read, not executed. No product/runtime integration, build, schema or template change.
Local commits in this exception slice: `411e8576`, `ddcefa6d`, `0f797490`; final assessment commit:
find `test: qualify M01 cancellation and permission denial` in local git log. Hooks remain enabled.

## Same-branch handoff

Inspect branch/worktrees/origin/local commits and dirty files before continuation. Reuse
`codex/journey-app-server-migration`; preserve unrelated changes and retained disposable histories.
No reset/rebase, ambiguous start resend, budget reset, stored-PID signals or unknown-state deletion.
The next ordered slice is M02, but it is **not authorized or started**. Until separate authorization,
only read/review the existing assessment and prepare a bounded proposal; no new runtime probe,
external inference, grants, containment implementation, UI, schema, M02+ or release work.
No push, merge or publication; local cohesive commits with hooks only.

Copy-ready continuation:

> Continue AppraiseJS on codex/journey-app-server-migration in /Users/jamil/Personal Projects/appraisejs.
> Inspect branch/worktree/remote/local commits. Read CONTINUE-HERE.md, m01-qualification.md,
> frozen M00/approval, m00-auth-amendment-01.md and plan/todo/ADR-0005.
> M01 protocol qualification is complete only for the pinned tuple. M02+ remains unstarted.
> Review existing evidence and propose the exact next bounded authorization; do not start M02 or new probes.
> Native inference budget is exhausted at 3/3; no grants or further inference. Preserve UNKNOWN/history,
> approved M00 bytes and GC3 REVISE. Local commits with hooks only; no push, merge or publish.
