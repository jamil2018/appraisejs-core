# M01 corrected manifest and RPC request variants

Historical checkpoint superseded by [final M01 qualification](m01-qualification.md); retained observations below are unchanged.

Date: 2026-10-14 (Asia/Dhaka). **At this checkpoint M01 partial; no additional external inference or permission grant.**
Started clean at `0e6ab9c2` on `codex/journey-app-server-migration`. The user authorized the corrected
no-model fixture and request variants, preserving M00/GC3 and prohibiting broader permissions/M02+.
This supersedes the prior investigation-only no-new-fixture-start boundary for this disposable slice.
The native provider grant remains exhausted at three starts; no native provider state was reused here.

## Actual host manifest capture

[Corrected observation](m01/corrected-manifest-host-observation.json) used the exact pinned executable,
host tuple and unchanged no-auth local-scripted configuration. It observed:

- Top-level tools absent; manifest location `input[0].additional_tools`.
- Namespace/custom/function types, including `functions.exec`, wait/input and collaboration names.
- The synthetic MCP `elicit` tool catalogued; no direct MCP function in the model-visible names captured.
- One local scripted provider request, no Authorization header, no external inference; child exit 0.

The fixture refused the unsupported direct-call surface and produced no function/exec output item.
Its provider-error park is a fixture stop, not a passing MCP invocation. This is now actual captured
manifest-location/name evidence, distinct from the prior source-supported explanation. No descriptions,
schema bodies, prompts, reasoning, tool arguments, credentials or raw request bodies were retained.
The exposed names do not establish executable effects or containment, and false feature flags are not
an absence attestation. No Code Mode or native tool was invoked to repair the direct-call fixture.

## RPC-only native elicitation denial

The stable pinned schema exposes `mcpServer/tool/call`. The new repository-only
[RPC fixture](../../scripts/tests/fixtures/codex-app-server-m01/mcp-request-variant-probe.py) starts one
owned unsigned offline thread and invokes only an owned no-effect stdio MCP `elicit` stub through that
RPC. There is no serving inference endpoint; turn/start and turn/resume are explicitly refused. It
regenerates and verifies the stable 317-file schema manifest, checks owned user/empty system layers,
and keeps read-only/never, feature flags, environment and credential-store choices unchanged.

[Actual RPC observation](m01/rpc-request-variant-observation.json):

| Synthetic MCP request mode | Reply observed by the stub | Client app-server request count | Qualification                                |
| -------------------------- | -------------------------- | ------------------------------- | -------------------------------------------- |
| form                       | decline; no protocol error | 0                               | Native RPC-path policy denial                |
| url                        | decline; no protocol error | 0                               | Native RPC-path policy denial; no URL opened |
| openai/form                | decline; no protocol error | 0                               | Native RPC-path policy denial                |
| openaiForm                 | decline; no protocol error | 0                               | Native RPC-path policy denial                |

Each call completed with its correlated mode in synthetic structuredContent. The observer's client
`cancel` handler was **not exercised**; requests=[] is absence of forwarding, not cancellation success.
The owned child exited 0. The durable intent journal contains one thread/start and four MCP tool calls,
no turn/start/resume, sign-in, permission mutation or native exec call. Permission grants: zero.
No provider inference is attributed to this RPC observation. Its thread/history is separate from the
retained native three-turn attempt and every earlier local fixture; no ambiguous start was resent.

## Why no client request was forwarded

Immutable source [pin](m01/request-variant-source-pin.json), commit
`740e5af33c71225640e0c1c1555c514c2c93ab74`, supports the observed route:

- [`mcp_processor.rs:685`](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/app-server/src/request_processors/mcp_processor.rs#L685)
  loads the thread and calls the selected MCP tool; it does not issue a model turn.
- [`elicitation.rs:452`](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/codex-mcp/src/elicitation.rs#L452)
  declines policy-rejected elicitation before surfacing it;
  [`:552`](https://github.com/openai/codex/blob/740e5af33c71225640e0c1c1555c514c2c93ab74/codex-rs/codex-mcp/src/elicitation.rs#L552)
  rejects Never. The source's full-access/form exception is not this retained read-only configuration.
- Same-version `mcp_tool.rs` and `mcp_server_elicitation.rs` tests distinguish roundtrips from native
  declines and frontend capability/source cases. These tests were read, not executed; no permissive
  upstream setup was copied. Whole-binary build provenance is still not attested by the source pin.

No approval policy, permission profile, feature flag, model metadata, session identity or client
capability was widened to force a client request. Changing Never to permit prompting or enabling a
full-access exception would change the current observation boundary and is not authorized here.

## Deterministic coverage and task status

An added native-observer guard supplies a schema-shaped `item/permissions/requestApproval` with
synthetic thread/turn/item IDs and network request data, for numeric and string request IDs. It confirms
the existing fail-closed observer replies -32601, preserves the request ID, parks, and sends no result
or permission grant. This is deterministic client refusal, **not a native-produced permission event**.
Four manifest regressions, nine native guard tests and 20 existing Node checks remain separate from
the live no-model metadata. Focused Ruff/formatting, documentation/task links, source/hash bindings and
enabled local hooks validate the artifacts. Graphify reports no changed safe scope; no product build,
template, UI, schema or release work was performed.

M01 remains **partial**. Qualified here: actual Lite manifest capture and native RPC-policy decline
for all four elicitation modes under the exact retained setup. Unqualified: client-request roundtrip
and cancel propagation, native-produced permission request/denial, model-driven Code Mode/MCP routing,
effective containment and wider account/build/model support. The RPC-only synthetic MCP success is
not M02 scoped gateway/role authority or worker isolation evidence. M02+ remains unstarted.

Route `c4b8e952-f42b-45d0-9e4c-d22bde70ca61`: coordinator-only, no subagents; requested/effective runtime
role/model/sandbox properties remain unverified without host receipts. Advisory lesson: control-RPC
elicitation denial and model-driven request forwarding are distinct protocol paths. Native policy
denial can be observed without weakening settings; it must not be relabelled as a client cancellation
roundtrip. No harness policy changed.

## Precise same-branch handoff

Preserve retained native `/private/tmp/appraise-m01-native-l1mt4sms` and all historical source/observations.
This slice's owned states are `/private/tmp/appraise-m01-mcp-v3wpdilg` (manifest capture) and
`/private/tmp/appraise-m01-variants-4z3te0fg` (RPC-only cases), retained for bounded review. Do not reset
native consumed budgets or erase UNKNOWN provenance. Approved M00 hash remains
`1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`; its bytes and auth amendment
remain unchanged; GC3 **REVISE / not passed** remains historical and intact.

Next under unchanged authority: source/schema/deterministic preparation only. A separately reviewed
fixture-policy/capability decision is needed before provoking client-forwarded elicitation; no such
change or permission grant is proposed as automatically authorized. Permission-request production also
needs a safe no-effect path demonstrated before execution, without silent Code Mode/native tool
injection or M02 work. No external inference, broader permissions, M02+, push, merge or publication.
Local commit with hooks: find `test: record M01 manifest and native elicitation declines`.
