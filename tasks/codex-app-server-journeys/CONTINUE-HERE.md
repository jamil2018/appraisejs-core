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
permission variants and containment remain unqualified. No native sign-in or external provider inference occurred.
No schema migration, product/UI change, packaging or release work occurred. M02–M13 and U00–U10 remain unstarted.
Historical lifecycle records/evidence remain intact; GC3 remains **REVISE / not passed**.

## Validation and local workflow

- `node --test scripts/tests/codex-app-server-m01-*.test.mjs`: 20 passing checks.
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

Already authorized: inspect/extend M01 deterministic and disposable no-model fixtures within the current scope.
Native-provider qualification requires **separate explicit authorization for isolated human sign-in and at most
three specified provider turn starts**, as laid out in [the remaining probe](m01-remaining-probe.md).
No ambient credentials/configuration, automatic sign-in, API/token/paid fallback, broad MCP grants or production
Journey access. If the safe disposable native probe cannot be established without M02 work, record the blocker.
Do not infer task completion, runtime support or lifecycle authority from synthetic turn completion.

Useful commands:

```sh
node --test scripts/tests/codex-app-server-m01-*.test.mjs
node scripts/tests/fixtures/codex-app-server-m01/no-model-probe.mjs /absolute/pinned/codex /absolute/disposable-observation.json
python3 scripts/tests/fixtures/codex-app-server-m01/stream-fixture-probe.py
```

The Python fixture writes `/private/tmp/appraise-m01-stream-observation.json`, uses only scripted loopback SSE,
and may need the documented sandbox escalation for local socket binding. Its source digest is bound by the
retained audit. Do not relabel these runners as native-provider tests or make them accept an existing auth home.

Copy-ready continuation (does not authorize inference):

> Continue AppraiseJS in /Users/jamil/Personal Projects/appraisejs on codex/journey-app-server-migration.
> Inspect branch/worktree/remote and local commits. Read CONTINUE-HERE.md, M00 approval/frozen contract,
> m01-evidence.md, m01-remaining-probe.md and plan/todo. M00 is complete; M01 is partial with synthetic and
> actual-binary no-model preparation committed. Preserve approved M00 bytes and GC3 REVISE. Work only within
> the authorized M01 no-model scope; native sign-in/inference needs separate explicit approval. Never resend
> an ambiguous start. M02+, UI, schema and release remain unstarted. Local commits with hooks only; no push.
