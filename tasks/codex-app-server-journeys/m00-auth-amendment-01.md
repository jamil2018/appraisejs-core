# M00 authentication amendment 01 — existing Codex login

Date: 2026-10-14 (Asia/Dhaka). User-authorized amendment; original M00-r3 bytes remain frozen.

## Exact authority

> Use the existing Codex login and error if missing. Record the auth change as an amendment without changing approved M00 bytes, then continue M01 with at most three inference turns. Local commits only; no M02+, push or merge.

This amends D02 and the isolated provider-authentication choice in
[M00-r3](m00-host-authority-contract.md), approved at `f506fccb` with SHA-256
`1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
It supersedes the prior requirement to establish a new isolated login and the later prohibition on
reusing existing native authentication. The approved file, approval record and historical checkpoints
are not rewritten.

## Replacement authentication choice and bounded probe

Appraise checks the selected existing Codex login and returns AUTHENTICATION_REQUIRED if absent.
Codex owns credentials, sign-in and native refresh. Appraise does not initiate login, sign out,
switch accounts or fall back to API keys, external tokens, paid access or another provider.
Installation alone does not establish authentication.

For this M01 observation, the existing file login is referenced through an explicitly recorded
auth-file link in an otherwise disposable Codex home. Only Codex reads that credential file;
the preparation code neither copies nor parses its contents. Native refresh may update credential
state under Codex ownership. Configuration, cwd, temporary files and new thread/history stay
disposable; ambient plugins, MCP registrations, skills, shell environment and project inputs are
not imported. This changes authentication isolation only; it does not attest worker credential
isolation or containment. Those remain M02 obligations, and M02 is not authorized.

Continue the [prepared M01 observation sequence](m01-remaining-probe.md) on the pinned binary,
OS and schemas, with at most three turn/start requests total. Prior native starts consumed: zero.
Use built-in OpenAI transport defaults as previously authorized; never resend turn/start or an
ambiguous thread/start. Preserve durable request intents and consumed budget. Stop on missing
authentication, quota/model/configuration failure, unexpected request/native tool activity or
unplanned ambiguity. The deliberately withheld third acknowledgement is the specified exception:
classify UNKNOWN, reconcile the known thread without resending, and retain its history.

No product authentication integration, schema migration, UI, packaging, release or M02+ task
is authorized. M01 stays partial while required qualification is outstanding. Historical lifecycle
records and GC3 **REVISE / not passed** remain intact. Local commits with hooks only; no push,
merge or publication.
