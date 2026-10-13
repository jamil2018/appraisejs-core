# M01 protocol preparation and no-model evidence

Date: 2026-10-13 (Asia/Dhaka). Status: **started, partial; native-provider qualification outstanding**.
M00 remains complete at f506fccb, with its approved contract bytes unchanged. No M02+, UI, schema,
release, sign-in or external provider inference work was started. GC3 remains **REVISE / not passed**.

## Shared-branch inspection

Started clean at `5ad51897aa756a2e09add81c83f722e512f069d1` on `codex/journey-app-server-migration`.
Origin: `https://github.com/jamil2018/appraisejs-core.git`. Read-only remote-tip inspection found
`appraise-0.5` still at `8d4be5c83597bb17ac756f98502738db8a69d344`; no feature-branch remote ref.
The branch tracks the base. The three local M00/approval commits were retained; no fetch, reset,
rebase, branch replacement, other-worktree cleanup, push, merge or publication occurred.

## Exact executable, schema and configuration identity

Resolved executable: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`.
SHA-256: `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`.
Version: `codex-cli 0.162.0-alpha.17.2`. Mach-O arm64. macOS 27.0.1, build 26A434, arm64.
The actual initialize user-agent also identifies that CLI/OS/architecture. This tuple is a feasibility
candidate, not a production support allowlist entry.

[Schema pin](m01/schema-pin.json) records the nonexperimental generator invocation, whole-bundle
hashes and selected field surfaces. All 317 generated schema files were hashed in sorted filename order;
SHA-256 of compact JSON `[{file,sha256},...]` is
`a725c3a629e0dd5a8b27612dc23a7172d88073ec89c708bd8ed4359344f9402c`.
The [stream observation](m01/stream-fixture-observation.json) separately pins the 447-file
`--experimental` schema manifest used for an injected dynamic-tool client request. Experimental
capability negotiation is a fixture setting, not a production-mode decision.
Generated schema trees are disposable and reproducible from the pinned binary; the pin is not a complete
protocol validator or proof of backward compatibility.

[No-model observation](m01/no-model-observation.json) includes literal configuration bytes and digests,
environment-key allowlist, normalized effective-config/config-read hashes per process, and config-layer
sources/keys. HOME, CODEX_HOME, cwd and TMPDIR were new disposable directories. No inherited environment,
provider keys, auth files, user plugins, repository instructions or MCP registrations were copied.
File credential stores were selected; no auth/login method was sent. `/etc/codex/config.toml` was absent;
the reported system layer was empty. Unknown or nonempty foreign config layers park the observer before
thread start. Provider `m01_offline` points at a nonserving loopback sentinel; turn/start is prohibited.

The stream fixture uses a separately hashed explicit configuration, isolated directories and provider
`m01_fixture` at a disposable loopback HTTP server. Both real config digest and normalized port-template
digest are recorded. Actual config/read confirmed its provider and only the owned user/empty system layers.
Only synthetic text/function-call SSE was served. The retained HTTP metadata records no Authorization
header; no external provider inference or native sign-in was performed. All synthetic prompts and tool
schemas are fixture-owned. No target, Journey, database, project MCP capability or real artifact is supplied.
Configuration and request guards are not proof of OS containment or worker credential isolation.

## Pinned upstream review

Read the mapped source/tests at Open Design revision `014bffbf775f4514020cef8bbffdc0eb5a0009ce`:
full session implementation and session/protocol/transport tests; relevant Codex definition transport,
permission and config sections; adapter Codex/authority sections; compatibility/test guide.
[Upstream pin](m01/upstream-pin.json) records the fetched file hashes. Upstream tests were not executed
and no upstream code was copied. The disposable clients were authored for this qualification.

Differences from the reference:

- This binary requires **threadId and turnId** in turn/interrupt. The reference's thread-only abort is insufficient.
- Nonexperimental ThreadStartParams has no historyMode field. Reference paginated-history/cleanup assumptions
  cannot be imported. No production process-lifetime, history-mode or cleanup policy was selected.
- A fresh thread with no turn had no rollout available to resume. A synthetic completed turn did create
  resumable history, including across a fresh process. This does not establish native-auth resume or M11 recovery.
- Resume inputs in the fixture explicitly bind model/provider/config. The initial stream prototype's
  interruption attempt found no active turn; explicit provider binding and correlated turn-start waiting
  corrected the fixture. This failed observation was not counted as an interruption pass.

The upstream guide's local Responses fixture enabled extra no-model coverage without sign-in.
[Official App Server documentation](https://learn.chatgpt.com/docs/app-server) was also consulted;
the actual executable's generated schemas and observations remain the protocol evidence.

## Evidence classes and results

| Requirement                    | Deterministic synthetic evidence                                                                      | Actual-binary no-model evidence                                                                                                                     | Remaining qualification                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Initialize/correlation/framing | Handshake gate, fragmented framing, reverse replies, duplicate/unrelated IDs, malformed/bounded input | Actual initialize and initialized; pinned user-agent/home/platform                                                                                  | Native-auth tuple, not this mock provider configuration                              |
| Required MCP failure           | Rejection blocks start/turn without retry                                                             | `/usr/bin/false`, required=true: thread/start rejected with -32603 and required-MCP initialization failure                                          | Scoped successful MCP and containment are M02, not claimed here                      |
| Thread start/resume            | Capture response handle; mismatched resume blocks without fallback                                    | Fresh no-turn resume refused; synthetic-turn same-process and restarted-process resume matched                                                      | Repeat persistence/resume under approved native-provider setup                       |
| Turn events                    | Foreign/duplicate events filtered; statuses never establish Journey acceptance                        | Correlated started, agent-message delta and completed events from local SSE                                                                         | Native-provider stream/terminal behavior and selected model access                   |
| Interruption                   | Exact thread/turn parameters; interrupted status separate from acceptance                             | Idle interrupt refused; actual synthetic active turn acknowledged interrupt and emitted interrupted                                                 | Native-provider active interruption; production fencing is M11                       |
| Unexpected requests            | Numeric/string request IDs denied; fixture parks                                                      | Actual experimental item/tool/call denied with -32601, then interrupted; no tool effect                                                             | MCP elicitation/permission variants and host denial behavior remain unverified       |
| Lost acknowledgement           | Thread/turn timeout, transport loss and late replies block resend                                     | Real thread reply dropped: timeout/UNKNOWN, one request. Synthetic real turn reply withheld: one dropped ack, three distinct turn starts, no resend | Native-provider lost-ack repeat; durable intent/acceptance reconciliation is M04/M11 |

There are **14 synthetic tests plus 6 saved-evidence audit checks**, not 20 live runtime tests.
The stream fixture's three turn starts use entirely scripted local responses; they are not model/provider
inference calls, spend measurements or accepted Appraise artifacts. Saved audits check the retained claims
and source digest; they do not independently observe the host.

Every final observed app-server exited with code 0 through owned process handles. The local HTTP server
and disposable state were removed. No raw model prose, reasoning, tool arguments, provider request bodies,
auth material or stderr transcript is retained. Disposable no-model lost-start cleanup is not qualification
of production unknown-effect/history deletion. Production histories and lifecycle records were untouched.

## Validation and scope

Commands: `node --test scripts/tests/codex-app-server-m01-*.test.mjs`; affected-file ESLint/Prettier;
Ruff format/check for the Python fixture; repository documentation links and supplemental task links;
`git diff --check`; repository commit hooks. Final results are recorded in CONTINUE-HERE.md.

Graphify auto refreshed only the scripts graph using deterministic AST extraction, with zero document
inputs or model calls. The scripts are under scripts/tests, which the existing template preparation flow
removes; no product/template-affecting code changed. Build/template regeneration, schema migrations and
release checks were not needed for these repository-only disposable fixtures. No package or quality-policy
configuration was changed.

The first commit attempt failed the Fallow hook: task-directory scripts were unreachable entries, and
protocol handling had complexity findings. Moved code into the existing scripts/tests entry surface and
split handlers by responsibility. Fallow then passed with zero new dead-code, complexity or clone findings;
no baseline refresh, suppression, hook bypass or assertion weakening. React Doctor found no staged
product source. The loopback fixture required sandbox escalation for local socket binding; this was an
execution-environment restriction, not a protocol defect. Python's download certificate-store failure was
resolved with certificate-validating system curl. Remote Git inspection was read-only.

Route receipt: `0d7c75c7-130a-460a-8311-10539d9087e8`, coordinator-only, zero subagents for bounded
fixture preparation. One unsupported task-class invocation was rejected before a receipt; corrected to
localized-fix. No effective-host role/model/context/sandbox enforcement is claimed. There is no independent
full-runtime qualification verdict. [Harness observation](../../docs/development-harness/m01-protocol-observation.md)
records recoveries without changing policy.

## Remaining boundary

M01 is **partial**, not complete: the approved native ChatGPT sign-in/provider configuration is not the
mock/sentinel configuration qualified above. Authentication, entitlement, actual provider streaming/retry,
permission/MCP elicitation behavior, containment and wider host properties remain unverified. The
[exact remaining native-provider probe](m01-remaining-probe.md) requires separate explicit sign-in and
inference authorization. Neither successful fixture turns nor this local commit supplies it. M02+ remains
unstarted; no support, lifecycle success, efficiency, spend or release gate is advanced.
