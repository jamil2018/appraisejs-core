# M01 fixture-only cancellation/denial exception

Date: 2026-10-14 (Asia/Dhaka). Bounded probe authorization; approved M00 bytes remain frozen.

> I authorize the minimal fixture-only policy exception to test cancellation roundtrips and permission denial. No inference or permission grants. Preserve M00 and GC3 REVISE; local commits only, no M02+, push or merge.

For RPC-only elicitation, replace Never in the owned disposable fixture with granular approval:
`mcp_elicitations=true`; `sandbox_approval=false`, `rules=false`, `request_permissions=false`,
`skill_approval=false`. Retain read-only sandbox, no auth, non-serving offline provider and existing
disabled feature flags. Declare only `openai/form` and `openai/elicitation` with `form={}` to receive/cancel the two
distinct vendor form methods; no user-verification capability. The pinned protocol requires experimentalApi=true to accept granular approvalPolicy; this
receive-only opt-in is fixture-only, with no attestation, OAuth login or additional method use. Every elicitation reply is cancel with
null content. URLs are never opened; no answer or acceptance is sent.

For permission denial, first pin a no-effect request producer. An additional asking-only
`request_permissions=true` policy bit and `request_permissions_tool=true` asking-only feature may be
used solely if that producer requires them, with every reply
granting an empty permission profile. No filesystem/network grant, command, account switch, real
provider inference, native-effect follow-up, full-access profile or production adoption is authorized.
If there is no safe producer within these boundaries, retain the exact gap rather than inventing evidence.

Exceptions apply only to fresh private synthetic M01 fixtures, never the existing user home, Appraise
configuration or retained native attempt. Pin actual config/schema/source and request/response IDs;
persist intents before sends; never resend an ambiguous start/request. Retain unknown history and
earlier observations. No credential, account identity or raw provider/transcript body is retained.

The first fixture attempt with experimentalApi=false was rejected at thread/start; its exact source
and observation remain in the preparation commit. It was not counted as a cancellation pass.

M01 stays partial while required qualification remains outstanding. M02+ stays unstarted. M00 hash:
`1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`; GC3 REVISE / not passed.
Local commits with repository hooks only; no push, merge or publication.
