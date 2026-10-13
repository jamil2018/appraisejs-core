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

**2026-10-14 latest:** [auth amendment 01](m00-auth-amendment-01.md) at `17febbf2` authorizes
existing login reuse. [Native results](m01-native-results.md) record completion/persistence,
active interruption and UNKNOWN withheld-ack reconciliation. **Three of three native inference starts
consumed; no further inference grant remains.** No start was resent. Three owned provider children exited 0.

M01 stays **partial**: actual MCP elicitation/permission request variants remain open. The additional
no-model elicitation fixture stopped because the provider tool manifest was empty; it did not qualify
cancellation. [Remaining fixture/gap](m01-request-variants-remaining.md). Do not enable native effects or
advance M02 to manufacture coverage. The previous [check-only checkpoint](m01-native-provider-checkpoint.md)
is historical; its old default-login restriction is superseded by the amendment.

Native state is retained at `/private/tmp/appraise-m01-native-l1mt4sms`; do not erase its history,
reset consumed budgets, redispatch or signal stored PIDs. This current handoff belongs to local commit
`test: record M01 native results and open request-variant gap` (find by exact title in git log).

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
The existing-login native provider smoke observation now establishes selected-model completion, persistence,
interruption and withheld-ack reconciliation on this account/build/config only. MCP elicitation/permission
variants, refresh/revocation, provider retry counts, wider host support and containment remain unqualified.
The earlier cancelled sign-in and auth-required evidence remain historical; no new sign-in occurred.
No schema migration, product/UI change, packaging or release work occurred. M02–M13 and U00–U10 remain unstarted.
Historical lifecycle records/evidence remain intact; GC3 remains **REVISE / not passed**.

## Validation and local workflow

- `node --test scripts/tests/codex-app-server-m01-*.test.mjs`: 20 passing no-model checks.
- `python3 scripts/tests/codex-app-server-m01-native.test.py`: 8 deterministic native-runner guard tests.
- Existing-login check: authenticated. Native smoke: three starts, no resend, three clean child exits.
- No-model MCP elicitation attempt: tool manifest empty; cancellation unqualified, child exit 0.
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

Inspect/reconcile the retained M01 evidence and investigate the no-model tool-manifest gap before any
new fixture start. Preserve independent records of synthetic tests, local scripted host observations and
native inference. The [remaining plan](m01-request-variants-remaining.md) does not grant native tool effects,
M02 work or another inference turn. Authentication remains check-only against the existing Codex login;
missing login errors, without sign-in/account/API fallback. Do not import ambient configuration.
Original M00 bytes and GC3 REVISE remain unchanged; local commits with hooks only.

Useful commands:

```sh
node --test scripts/tests/codex-app-server-m01-*.test.mjs
node scripts/tests/fixtures/codex-app-server-m01/no-model-probe.mjs /absolute/pinned/codex /absolute/disposable-observation.json
python3 scripts/tests/fixtures/codex-app-server-m01/stream-fixture-probe.py
```

The Python fixture writes `/private/tmp/appraise-m01-stream-observation.json`, uses only scripted loopback SSE,
and may need the documented sandbox escalation for local socket binding. Its source digest is bound by the
retained audit. Do not relabel these runners as native-provider tests or make them accept an existing auth home.

Copy-ready continuation:

> Continue AppraiseJS in /Users/jamil/Personal Projects/appraisejs on codex/journey-app-server-migration.
> Inspect branch/worktree/remote and local commits. Read CONTINUE-HERE.md, frozen M00/approval,
> m00-auth-amendment-01.md, m01-native-results.md, m01-request-variants-remaining.md and plan/todo.
> M01 remains partial. Three native starts consumed; no further inference without a new explicit grant.
> Existing login/check-only is authorized; no sign-in, account switch or ambient config import.
> Investigate the no-model MCP tool-manifest gap and qualify request variants only within M01 and
> existing no-model authority. Do not weaken native-tool boundaries or start M02+. Preserve retained
> native history and UNKNOWN provenance, approved M00 bytes and GC3 REVISE. No ambiguous start resend.
> Local commits with hooks only; no push, merge or publish.
