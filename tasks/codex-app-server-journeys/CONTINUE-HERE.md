# Continue on the shared Journey migration branch

Date: 2026-10-13 (Asia/Dhaka). Branch: `codex/journey-app-server-migration`.
Base: `origin/appraise-0.5` at `8d4be5c83597bb17ac756f98502738db8a69d344` (remote tip verified read-only).
Origin: `https://github.com/jamil2018/appraisejs-core.git`. Branch tracks the base; feature ref is not pushed.
Approved M00-r3: `f506fccb2f910641d7a943bec440088512f0d714`; approval recorded at `5ad51897`.
M01 fixture/schema commit: `be99b74d`.
Final observation/handoff commit: find `test: record M01 no-model observations and native-provider boundary` in
local `git log`; this handoff is part of that commit and does not self-reference its hash.
Generated scripts-graph commit: find `chore: refresh scripts graph for M01 qualification fixtures`; it follows
the observation commit and contains only generator output.

## Current checkpoint

**2026-10-14 amendment:** [M00 authentication amendment 01](m00-auth-amendment-01.md) now authorizes
existing Codex login reuse with check-only failure. It supersedes the prior auth-isolation stop below;
M00-r3 bytes stay frozen. The disposable state references only the existing native auth file, with its
own config/cwd/history. An escalated account/read check reports ChatGPT AUTHENTICATED; no login launch.
At this preparation checkpoint zero turns are consumed; the authorized three-turn probe is next.

**Latest native-probe continuation:** read [native-provider authority/check-only checkpoint](m01-native-provider-checkpoint.md).
The user authorized isolated sign-in and at most three native inference turns, then allowed built-in provider
transport defaults with no supervisor start resends. Subsequent steering requests **check-only authentication**:
Appraise must not launch sign-in; an unauthenticated selected CLI returns AUTHENTICATION_REQUIRED. The launched
sign-in was cancelled; no auth file or native inference start exists. The final isolated auth check returns exit 2.
M01 remains partial. Reusing the user's default credential/config store is not authorized by a factual question
about cached login and would revise M00's isolated-state choice. Preserve the approved bytes.
Latest local checkpoint commit: find `test: add M01 check-only native auth preparation`; it contains this handoff.

**M00 complete; M01 started and partial, not complete.**
Approved contract SHA-256: `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
Read [exact approval](m00-r3-approval.md), [byte-frozen contract](m00-host-authority-contract.md),
[M00 review history](m00-review-evidence.md), [M01 evidence](m01-evidence.md), [remaining probe](m01-remaining-probe.md),
plan/todo, Open Design map and ADR-0005. Preserve the contract's submission-time header and all approved bytes.

Preparation includes 14 deterministic synthetic tests and 6 saved-evidence audits; these are **20 checks,
not 20 live tests**. Actual pinned-binary observations separately establish initialization, required-MCP
startup failure, real thread-start lost-reply refusal, and synthetic local-SSE turns with correlated events,
active interruption, unsupported-request denial, withheld turn reply and same/new-process resume.
A no-turn thread had no persisted rollout to resume; a synthetic completed turn did. Never resend an ambiguous start.

CLI `0.162.0-alpha.17.2`, SHA-256 `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`,
macOS 27.0.1 / 26A434 / arm64. Exact configuration and stable/experimental schema pins are in the evidence bundle.
The native ChatGPT-auth/provider configuration, access/entitlement, real-provider behavior, MCP elicitation/
permission variants and containment remain unqualified. The earlier no-model slice performed no native sign-in or external inference; the latest authorized sign-in was subsequently cancelled without credentials/inference. Read the linked native checkpoint for current authority and status.
No schema migration, product/UI change, packaging or release work occurred. M02–M13 and U00–U10 remain unstarted.
Historical lifecycle records/evidence remain intact; GC3 remains **REVISE / not passed**.

## Validation and local workflow

- `node --test scripts/tests/codex-app-server-m01-*.test.mjs`: 20 passing no-model checks.
- `python3 scripts/tests/codex-app-server-m01-native.test.py`: 6 deterministic native-runner guard tests.
- Native configuration/auth check: AUTHENTICATION_REQUIRED, exit 2; owned app-server exit 0; zero inference turns.
- Focused ESLint/Prettier, Python Ruff formatting/lint, docs links and diff whitespace checks pass.
- Graphify scripts refresh: deterministic AST extraction, zero document/model inputs; generated outputs retained.
- Fallow hook initially blocked task-directory reachability and complexity. Fixed by conventional test-directory
  placement and smaller handlers; final hook passes without suppression/baseline changes. React Doctor reports
  no staged product source. Local hooks remain enabled.
- Repository-only fixtures live under scripts/tests, already removed by template preparation. No product build,
  template-affecting change, schema/package migration or release check is claimed.

Starting worktree was clean. Preserve any later unrelated dirty files/staged changes. Inspect local commits,
branch/worktree and remote again before continuation; do not reset, rebase or replace the shared branch.
Local cohesive commits with hooks are authorized. **Do not push, merge or publish.** A future separately authorized
push must explicitly name the feature ref rather than use the base-tracking default.

## Next bounded action and authority

Already authorized: M01 preparation and at most three native inference starts with built-in transport defaults,
no supervisor resends, the selected isolated provider state and all prior stop conditions. Latest user steering
requires check-only authentication; do not launch login. Zero native starts have been consumed. The selected
isolated state is unauthenticated, so the native probe is parked. Codex owns any external human sign-in and
credential refresh. Do not copy/read ambient auth/config or silently substitute the default Codex home.
Do not change M00, start M02+, or infer task completion/support from a login or fixture result.

Useful commands:

```sh
node --test scripts/tests/codex-app-server-m01-*.test.mjs
node scripts/tests/fixtures/codex-app-server-m01/no-model-probe.mjs /absolute/pinned/codex /absolute/disposable-observation.json
python3 scripts/tests/fixtures/codex-app-server-m01/stream-fixture-probe.py
```

The Python fixture writes `/private/tmp/appraise-m01-stream-observation.json`, uses only scripted loopback SSE,
and may need the documented sandbox escalation for local socket binding. Its source digest is bound by the
retained audit. Do not relabel these runners as native-provider tests or make them accept an existing auth home.

Copy-ready continuation (preserves the existing bounded authorization):

> Continue AppraiseJS in /Users/jamil/Personal Projects/appraisejs on codex/journey-app-server-migration.
> Inspect branch/worktree/remote and local commits. Read CONTINUE-HERE.md, M00 approval/frozen contract,
> m01-evidence.md, m01-remaining-probe.md and plan/todo. M00 is complete; M01 is partial with synthetic and
> actual-binary no-model preparation committed. Preserve approved M00 bytes and GC3 REVISE. Read the latest
> native checkpoint: three native starts authorized, zero consumed; built-in transport defaults allowed;
> check-only authentication, no login launch or ambient credentials/config reuse. Park while isolated state
> remains unauthenticated. Never resend
> an ambiguous start. M02+, UI, schema and release remain unstarted. Local commits with hooks only; no push.
