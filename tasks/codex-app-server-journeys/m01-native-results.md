# M01 native provider observation — existing login

**2026-10-14 correction:** [manifest investigation](m01-manifest-investigation.md) supersedes the
empty-whole-manifest interpretation below. Prior `toolNames: []` inspected only top-level tools;
Responses Lite uses an `additional_tools` input item, whose contents were not retained. Model metadata
selects CodeModeOnly despite the local false feature flag. Historical records remain intact; M01 is
partial. No new turn, inference or permission change occurred during this investigation.

Date: 2026-10-14 (Asia/Dhaka). **M01 partial; three of three native starts consumed.**

## Authority and identity

[Auth amendment 01](m00-auth-amendment-01.md), committed at `17febbf2`, records the user's
existing-login instruction. Original M00-r3 bytes and hash remain unchanged. The previous cancelled
sign-in and auth-required checkpoints are historical, not erased or relabelled as successful login.
No sign-in, account switch, credential parsing/copy by preparation code, or API fallback occurred.

Reused the native file login through a private disposable auth-file link. The same owned state has
isolated configuration, cwd, temp and history. CLI `0.162.0-alpha.17.2`, SHA-256
`0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`, macOS 27.0.1,
build 26A434, arm64. The stable 317-file schema manifest was regenerated and matched its existing pin.
The normalized effective-config hash remained
`8867d26821dc25878dad751c12ff72b625a390d5c64cd4c07febc79973b0401b`.
Only owned user and empty system configuration layers were observed; no ambient MCP/plugin config
was loaded. Selected provider openai; model gpt-6.1-sol, medium; native transport defaults as authorized.

The desktop sandbox initially rejected account/read. The same read-only check with execution
escalation reported native ChatGPT authentication; this was an environment restriction, not a
missing-login observation. [Check metadata](m01/existing-login-check-observation.json) retains no
account identity or credentials. Authentication alone was not counted as model entitlement.

## Actual native observations

[Live native metadata](m01/native-provider-observation.json) and
[durable request intents](m01/native-request-intents.json) record one thread/start, three turn/start
requests, correlated event/item/thread/turn identifiers, sanitized token totals, and three owned
process exits of 0. No native-tool item or unexpected server request was observed.

| Observation | Result                                                                                                                                                                            | Limit                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Turn 1      | Completed; restart/resume matched the exact thread; thread/read confirmed its completed persisted turn                                                                            | No Appraise artifact acceptance or lifecycle success                        |
| Turn 2      | Correlated started event; interrupt sent with both threadId and turnId; terminal status interrupted                                                                               | No production fencing/lease/revocation qualification                        |
| Turn 3      | Exactly one start reply deliberately withheld; acknowledgement deadline classified UNKNOWN; new process resumed/read the known thread and found the distinct completed third turn | No resend, provider idempotency or production unknown-effect recovery claim |

All three native turns are consumed. Built-in provider transport retry counts and billing were not
measured. Observed cumulative usage: 18,705 total tokens, 18,683 input, 16,768 cached input and 22 output;
these are protocol-reported totals, not an independent spend measure. Model access was observed only for
this account/build/config and these fixed synthetic prompts. No real Journey/project/database inputs
were supplied. The deliberately unknown acknowledgement classification remains preserved even though
history later established completion.

Native local history is retained at `/private/tmp/appraise-m01-native-l1mt4sms`, including its consumed
receipt/intent journal. Do not delete or reset it, start a replacement probe, reuse the user's desktop
thread, sign out, revoke the login or signal stored PIDs. The native auth link remains intact; preparation
never read credential contents. Repository evidence excludes raw provider prose/reasoning/transcripts,
OAuth state, auth URLs, credentials and raw account payloads. Retention is not M02 containment proof.

## Verification and remaining qualification

20 existing Node no-model checks and eight Python deterministic guards pass. The new guards refuse a
missing existing file login before preparation and a changed auth-file binding. Send-loss budget
consumption, three-turn ceiling, already-started refusal, unexpected-request rejection and cached
terminal correlation remain covered. These tests do not re-observe the live provider. Ruff, focused
formatting/link checks and enabled local commit hooks validate repository artifacts. A test-style Ruff
finding in the preparation increment was corrected here; no hook failure was bypassed. Graphify reports
no changed safe graph scope for these Python/docs artifacts. No product build/template/schema change.

M01 remains **partial**. Actual MCP elicitation/permission variants and corresponding host denial
behavior were not emitted by this native smoke probe. See the [remaining no-model fixture plan](m01-request-variants-remaining.md).
An additional actual-binary no-model elicitation attempt used an owned synthetic stdio MCP stub and
loopback scripted provider with no auth. Its request advertised tools=[]; the fixture refused to
invent a tool or call a real provider and stopped. [Negative observation](m01/mcp-elicitation-observation.json).
An earlier attempt exposed a missing event-ledger setup defect; [failed observation](m01/mcp-elicitation-failed-observation.json)
is preserved and not counted as a pass. Both owned children exited 0. Loopback binding required execution
escalation. The exact cause of the absent MCP tool remains unverified; no feature/permission boundary
was relaxed and no elicitation cancellation was observed.
Authentication refresh/revocation, provider retry behavior and broader host support remain unverified;
containment, scoped successful MCP and native credential isolation belong to M02 and are unstarted.
The completed smoke sequence does not close these gaps or authorize extra inference.

Route `571714fb-9a09-4e56-84ce-50d7761e2905`: coordinator-only, zero agents; runtime role/model/sandbox
enforcement is unverified without host receipts. Advisory lesson: a private auth-only reference can
reuse native login without importing default configuration; auth checks may require host filesystem
access. No routing/permissions/quality-gate policy changed. Qualification coverage remains the weakest
dimension because absent request variants are explicitly open, not inferred from generic request tests.

A bounded read-only investigator (receipt `b2bae11f-7412-475a-86be-cf531fd345a4`) observed
`mcpServerStatus/list` cataloguing `m01_fixture.tools.elicit` in the unsigned fixture state. Thus
registration exists, while turn-level advertisement is absent; the cause remains unverified.
The route receipt was recorded immediately after dispatch, an ordering anomaly. The investigator
also accidentally read synthetic session metadata/prompt through an overbroad search, then stopped;
no model output or credential was read or persisted. Requested/runtime profile enforcement remains
unverified; no independent qualification verdict follows. The next comparison can explicitly name
the harmless stub in a scripted local-only prompt, without changing features or external inference.

That targeted comparison was subsequently run in a fresh no-auth fixture. Pre-turn status catalogued
elicit, but the explicit prompt still advertised tools=[]; no elicitation was emitted and the owned
child exited 0. [Exact comparison](m01/mcp-explicit-prompt-observation.json). The generic prompt alone
does not explain the result. All three no-model attempts remain separate from the three consumed
native inference turns. Further fixture starts are stopped pending evidence for a safe correction;
no feature or permission grant was broadened. The final comparison/handoff is committed separately
as `test: preserve M01 MCP tool-exposure comparison`.

Same-branch next action: investigate the absent tool manifest in the bounded no-model request-variant
fixture before another start, record actual pinned host replies where safely feasible, then assess M01's remaining acceptance. **No further inference is authorized by the
exhausted three-turn grant.** Keep M02+, UI, schema and release unstarted; GC3 REVISE / not passed.
Local commits with hooks only; no push, merge or publication.
