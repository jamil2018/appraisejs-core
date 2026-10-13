# M01 native-provider authority and check-only checkpoint

Date: 2026-10-13 (Asia/Dhaka). **M01 remains partial; zero external inference turns.**
This record supersedes the earlier handoff's pending authorization wording. It does not change the approved
M00 bytes, M02+ status, production behavior, or GC3 **REVISE / not passed**.

## User authority and subsequent steering

The user explicitly authorized the prepared [remaining probe](m01-remaining-probe.md):

> I authorize the M01 probe in m01-remaining-probe.md: isolated human sign-in and at most three inference turns. Keep M02+ unstarted, preserve M00 and GC3 REVISE, and make local commits only—no push, merge or publish.

When the pinned CLI rejected an attempted built-in provider override, the user clarified:

> Allow native transport defaults for this disposable probe; never resend turn/start.

This clarification applies to the disposable probe only. There is no claim of zero provider transport retries,
hard provider spend enforcement, alternate-provider permission or product adoption. The runner never retries
or resends a start; its durable ceiling remains three explicit native turn/start requests.

The user then requested authentication checks rather than Appraise-managed login:

> we can just ensure the cli is logged in and if not throw an error

The pending isolated sign-in was cancelled in response. The retained runner has no login mode: it checks the
selected state and returns AUTHENTICATION_REQUIRED/nonzero exit when unauthenticated. Codex owns sign-in,
credential storage and native refresh. No ambient/default CLI credentials or configuration were read/copied.
The user's question about reusing an already authenticated default CLI was answered conditionally: the same
OS user, Codex home and credential store can reuse cached login. It did not authorize discarding M00's isolated
provider state or reusing ambient configuration. That design choice remains unchanged unless separately revised.

## Observations and corrected configuration

Clean branch at intake: `87791ade`, codex/journey-app-server-migration. The executable and M00 hashes still
match the recorded pins. An isolated loopback setup preflight disabled native features, including code_mode,
and supplied no dynamic tools. Its single synthetic Responses request advertised **tools=[]**, with no
Authorization header. [Saved metadata](m01/native-tool-preflight-observation.json). This establishes the
observed fixture manifest only; it does not attest native handler rejection or OS containment for M02.

An initial native login command exited 1 during **configuration loading**, before authentication:
`model_providers contains reserved built-in provider IDs: openai. Built-in providers cannot be overridden.`
No auth file was created. A read-only login-status command reproduced the same configuration diagnostic.
The unsupported `[model_providers.openai]` table was removed; the selected provider remains built-in openai,
with no custom alias, API key, external token, custom proxy or alternative endpoint.

After the user's transport clarification, the corrected native configuration initialized successfully with
private stdio, the pinned user-agent and an isolated file auth store. Native sign-in was launched under the
then-current authorization, but cancelled when the user requested check-only behavior. Its runner exited 130;
a read-only process check found zero remaining native login processes. No auth file or inference start existed.
The known obsolete unsigned prep/login directories, including any CLI login diagnostics, were removed only
after that exit observation. No historical Appraise records or another user's state was touched.

The final check-only runner was prepared afresh and validated its 317-file schema manifest. Actual
config/read and account/read (refreshToken=false) used only owned user/empty system config layers.
[Saved auth-check evidence](m01/native-auth-check-observation.json) records its effective-config/source
hashes, pinned user-agent, AUTHENTICATION_REQUIRED, exit 2 and clean app-server exit 0. **Zero** native
turn/start requests were sent. No login URL, OAuth state, credential contents, raw transcript or account
identity is retained in this evidence. The remaining unsigned provider state is private/local-only and
contains no auth.json; a future authenticated probe must satisfy the same selected-state and source binding.

## Implementation and verification

Repository-only runner: [native-provider-probe.py](../../scripts/tests/fixtures/codex-app-server-m01/native-provider-probe.py).
Modes: prepare, check, probe. Prepare creates a fresh owned isolated home and validates pins. Check observes
authentication without opening login. Probe refuses missing auth, API-key auth, changed source/config/host,
already-started probes and a fourth turn; records launch/request intents before sends; uses owned process handles,
correlation, 60-second turn deadlines, withheld-ack handling and retained unknown history. It is not connected to
Appraise product dispatch, schema, gateway, UI or runtime supervision. The real inference path has not run.

[Deterministic guard tests](../../scripts/tests/codex-app-server-m01-native.test.py) cover the fourth-start
ceiling, consumed budget after send loss, already-started refusal, absent-auth refusal without spending a turn,
unsupported-request denial, and cached terminal-event correlation. Six Python guard tests pass. The earlier
20 Node tests/audits remain separate no-model evidence. Python Ruff, affected JSON/Markdown formatting, links,
diff checks and enabled local commit hooks are the relevant checks. Tests run without storing Python bytecode.
No product build, migration, packaging, release, browser/UI test or containment experiment was performed.

A single bounded investigator supplied read-only CLI-help/auth/config documentation evidence. Route receipt
`eadfd67a-2e86-4e31-a763-d98b63f2a907`; requested investigator role and runtime properties remain unverified
without host receipts. No source ownership overlap, executor lane or full-qualification judge verdict.
The reserved-provider diagnostic corrected a setup mistake; no unknown default is relabelled as measured.
Advisory lesson: use the built-in native provider without custom-provider table overrides; distinguish default
CLI cached auth from isolated provider state; make ownership-preserving cancellation part of any future login
helper. The retained helper implements check-only behavior instead of a login helper. No harness policy changed.

## Native authentication references and limit

[Official authentication documentation](https://learn.chatgpt.com/docs/auth) describes cached login reuse,
file/keyring/auto stores and native token refresh; [configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)
identifies model_providers as custom-provider definitions and reserves built-in IDs. Documentation supports
these explanations; the pinned executable's local observations support only the recorded setup/check results.
Installation alone is not authentication. Authentication presence alone is not selected-model entitlement,
containment, accepted artifacts or M01 completion.

Next: keep M01 partial until the selected isolated CLI state is authenticated outside Appraise, or obtain a
separately reviewed revision of the isolated-auth choice. Do not silently substitute the default Codex home,
launch sign-in, reset the attempt latch, resend an ambiguous start, start M02+, or claim the authorized three
turns were executed. The authorization permits at most three; zero have been used in this checkpoint.
