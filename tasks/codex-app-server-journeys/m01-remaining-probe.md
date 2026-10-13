# M01 remaining native-provider probe for separate approval

Date: 2026-10-13. **Prepared specification; not authorized or executed.**
Read [current evidence](m01-evidence.md). No sign-in or external model call is authorized by this file.
The local no-model preparations cover the actual transport with scripted responses; they do not qualify
M00's native ChatGPT-authenticated provider configuration. Keep M01 partial until remaining required
evidence passes, or an exact separately reviewed scope decision explicitly changes the qualification.

## Approval scope

Authorize only a disposable personal native-provider M01 probe on the already pinned executable/OS tuple:

1. A human-initiated Codex-managed ChatGPT sign-in in a **new isolated** provider home, with file credential
   storage. The human completes the native sign-in. Do not copy ambient auth/config, use API keys,
   external tokens, a custom inference proxy, plugins or another provider. Sign-in permission does not
   implicitly permit target-site login, project access, product adoption or release.
2. At most **three explicit turn/start requests total**, model `gpt-6.1-sol`, effort `medium`, one owned
   child/turn at a time. Use private stdio, a disposable cwd, explicit provider/model binding on every
   start/resume, approved noninteractive/read-only configuration, no project MCP grants, real inputs or
   repository/database/target data. First verify the generated schemas, effective config and isolated
   provider identity against the pin. Capture the native-provider config/auth-store identity without
   retaining credentials or raw transcripts.
3. Stop on auth failure, quota failure, unsupported model/capability, unknown configuration, unexpected
   request, native-tool activity or ambiguous start. Do not execute requested native effects or weaken
   containment. Read-only/never settings and instructions do not prove native tools are absent: if a
   safe disposable probe cannot be established without M02 containment work, record that blocker and
   stop. This approval must not be interpreted as M02 authority.

Native sign-in and inference need explicit user authorization because the active user instruction forbids
both without a separate grant. This is that instruction's boundary, not an invented skill approval gate.
No approval is needed to inspect or extend already authorized deterministic/no-model fixtures.

## Fixed observation sequence

Persist the probe's request intent and correlation IDs outside product storage before each send.
Use 60-second initialization/start acknowledgement limits; park on expiry. Each turn is bounded to
60 seconds for this smoke probe (stricter than M00's 15-minute ceiling). Local duration/turn caps do
not prove hard provider spend limits. No automatic retries, alternate models or transports.

- **Turn 1 — completion/persistence:** initialize; initialized; thread/start with explicit native provider,
  model, isolated cwd, sandbox and approval settings. Send one text input:
  `Reply exactly M01-PROTOCOL-OK. Do not use tools, browse, read files or perform actions.`
  Record correlated thread/turn/item identifiers, observed terminal status and usage totals only.
  Close the owned child, initialize a new child with the same isolated provider state, and thread/resume
  the exact captured thread with the same explicit settings. Verify thread identity and persisted turn.
  A completed turn is not Appraise artifact acceptance.
- **Turn 2 — active interruption:** on the resumed thread send:
  `Print the integers from 1 to 1000 as plain text. Do not use tools or perform actions.`
  After a correlated turn/started and captured turn ID, send turn/interrupt with **both threadId and
  turnId**. Observe the acknowledgement and matching terminal event independently of process exit.
  If the turn finishes before interruption, record the race; do not spend an extra turn automatically.
- **Turn 3 — withheld acknowledgement:** send the Turn 1 text once on the same valid disposable binding.
  Withhold exactly its turn/start reply from the client, retain only that the reply was withheld,
  and classify the dispatch UNKNOWN when the acknowledgement deadline expires. Never resend it.
  Use authenticated read/resume of the already known thread and correlated terminal metadata to
  reconcile observed start/history. With an unknown turn ID, do not invent an interrupt target.
  No artifact/tool submission is permitted and no production idempotency or recovery claim follows.

The actual generic unexpected-request channel was already observed with local synthetic dynamic-tool input.
Native MCP elicitation/permission variants remain a separate outstanding protocol case: deny/cancel any
such request encountered in this smoke probe. Do not grant tools or provoke real effects merely to produce
one. If required variants remain absent, retain the gap and prepare a bounded synthetic MCP-elicitation
fixture under M01 rather than claiming coverage or silently advancing to M02.

## Evidence and stop conditions

Retain executable/OS/schema/config hashes, isolated state identity, request/event correlation, terminal
status, interruption/exit observations, sanitized usage and unknown-outcome reconciliation. Exclude
credentials, tokens, prompts containing real data, reasoning and provider transcript bodies.
Authentication/refresh/revocation, entitlement and cost claims require their own actual evidence.

Reconcile histories before cleanup. An ambiguous native start cannot be erased as if it never occurred;
retain the owned isolated provider state for a human cleanup/recovery decision using M00's retention
boundary. Never signal a stored PID or resume a user's desktop daemon/thread. Never automatically
re-sign-in, repeat a turn, fall back to paid/API access, or mark M01 complete from fixture success.

This specifies the reviewable remaining probe. A live runner must preserve these guards when separately
authorized; the committed no-model runners intentionally cannot be switched to ambient/native inference
by supplying a different binary, endpoint or existing provider home.
