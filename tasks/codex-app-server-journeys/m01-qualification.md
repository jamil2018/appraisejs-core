# M01 protocol qualification — 2026-10-14

**M01 complete for the pinned protocol tuple and configurations below. M02–M13 remain unstarted.**
This is engineering protocol qualification, not a managed-runtime, containment or Journey gate pass.
M00's approved bytes and separate auth amendment are unchanged; GC3 remains **REVISE / not passed**.

## Exact scope and evidence

Executable: `/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex`,
`codex-cli 0.162.0-alpha.17.2`, SHA-256
`0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`;
macOS 27.0.1 / build 26A434 / arm64. Stable 317-file schema manifest:
`a725c3a629e0dd5a8b27612dc23a7172d88073ec89c708bd8ed4359344f9402c`.
Per-observation source/config/effective-config hashes remain in the JSON records; they are distinct
configurations, not one universal support claim. [Initial evidence](m01-evidence.md) records the
mapped pinned Open Design source/tests and initial stable/experimental schemas.

| M01 acceptance                          | Evidence class and result                                                                                                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initialization and required-MCP failure | [Actual pinned-binary no-model observations](m01-evidence.md): initialization succeeds; required startup failure blocks.                                                      |
| Start/resume and correlated turn events | Isolated local-scripted observations plus [three authorized native turns](m01-native-results.md); completed rollout resumes, no-turn rollout does not.                        |
| Active interruption                     | Scripted and native active turns; correlated terminal interruption, separately from process exit.                                                                             |
| Unexpected requests                     | Deterministic fail-closed guards and actual unsupported-request observation; no approval.                                                                                     |
| Lost acknowledgements                   | Withheld start replies preserve UNKNOWN; no start resend. Native reconciliation/resume is observed, not idempotent-start proof.                                               |
| Elicitation cancellation                | [Final RPC-only observation](m01/final-cancellation-observation.json): four sequential synthetic MCP calls, four native client requests and four propagated cancels, no turn. |
| Permission denial                       | [Native-produced request under local scripted input](m01/permission-denial-observation.json): correlated thread/turn/item request answered with empty permissions, no grant.  |

Deterministic checks are not live tests. Actual-binary synthetic observations are not external model
inference. Prior native-provider observations remain separate, with the **3/3 budget exhausted**;
this exception added zero external inference, zero permission grants, zero native exec or command calls.

## Authorized fixture-only exception and corrections

The user's exact exception is retained in [the policy record](m01-fixture-policy-exception.md).
Fresh private HOME/CODEX_HOME/workspace/tmp and an environment allowlist were used; no ambient auth
or configuration was imported. Read-only sandbox and disabled effect features remained in place.
RPC fixture enables only granular `mcp_elicitations`; permission fixture enables only granular
`request_permissions` and its asking-only tool feature. All other granular bits are false.
The pinned API requires `experimentalApi=true` for granular policy. The rejected false-opt-in
prototype is retained in `411e8576`; it is not counted as passing cancellation.

The final receive capabilities are `openai/form={}` and `openai/elicitation={form:{}}`; no user
verification, attestation, sign-in or permission acceptance. The source/test pin is
[immutable Codex source metadata](m01/cancellation-denial-source-pin.json), commit
`740e5af33c71225640e0c1c1555c514c2c93ab74`. Upstream Rust tests were read, not executed.
Source-version/model metadata matches do not attest the whole executable's build provenance.

The final sequential call/request mapping is explicit below. Case labels are fixture selectors;
they are not the native DTO spelling. Native IDs 0–3 appear in the same ordered request array.
The runner checked count delta, thread/server identity and correlated stub reply for each call;
it did not independently assert each forwarded mode inside the runner.

| Fixture selector | MCP wire method                       | Forwarded native mode | Native request ID | Stub result |
| ---------------- | ------------------------------------- | --------------------- | ----------------- | ----------- |
| form             | elicitation/create                    | form                  | 0                 | cancel      |
| url              | elicitation/create                    | url                   | 1                 | cancel      |
| openai/form      | openai/elicitation/create (mode form) | openaiForm            | 2                 | cancel      |
| openaiForm       | openai/form (no mode)                 | openai/form           | 3                 | cancel      |

All client replies had null content. URLs were never opened. Earlier mode aliases normalized to
standard form and did not prove true vendor methods; the separate new vendor method initially
returned -32601 until its receive-only form capability was declared. Those diagnostic records
remain intact in `ddcefa6d` and `0f797490`.

Permission production requires an active step. A fixed loopback Responses fixture emitted one
`request_permissions` function call asking for network; no operation followed denial. The native
registered handler emitted `item/permissions/requestApproval`; the client returned
`{permissions:{},scope:"turn"}` and the next loopback request contained
`{permissions:{network:null,file_system:null},scope:"turn"}`. One scripted turn completed;
two local HTTP requests had no Authorization header; the owned child exited 0. This synthetic
producer exercises a registered handler that is absent from the direct CodeModeOnly manifest.
It does not prove natural model selection or Code Mode routing.

Permission observation's policy-document hash `03444338b6369b9045944c98597fe64d8d319b83c53a18ee93aa0b0f4cdb914b`
names the earlier exception revision in `ddcefa6d`, before the vendor-capability amendment.
Final cancellation names `8a3a516496a7a034cc6ab1f3805bd4239b68a931af7ea4143a4c2d1957bbbcac`,
the current exception bytes. Neither historical hash is rewritten. Observation fields
`m01Complete:false` record the runner's non-certifying status at observation time; this reviewed
assessment and the task register supply current engineering status, not the raw runner.

## Artifact validation

37 deterministic checks passed: 20 Node synthetic/evidence audits, nine native-runner guards,
four manifest guards and four empty-grant guards. Focused Ruff lint/format checks passed for the
RPC/permission fixture and denial tests. Prettier, local documentation links, source/evidence/hash
bindings and diff whitespace passed. Graphify auto found no changed safe committed graph scope.
No product build or scaffold sync was required for repository-only Python fixtures and documents.
Local repository Fallow/React Doctor hooks remain enabled. Remote base verified read-only at
`8d4be5c83597bb17ac756f98502738db8a69d344`; no remote feature ref, no push.

## Review, limits and handoff

Independent bounded source/evidence review accepted M01's stated protocol criteria, requiring the
mode mapping, provenance and stale-status corrections made here. Exact corrected-artifact re-review accepted those revisions; no M01-only gap remains. Review route
`1aaab7fd-3420-40e1-b6af-cc11eb09f6bc`; investigator route
`30a4da7d-a473-4306-9e95-022f8097f64e`. No overlapping source writes. Effective host role/model,
context and sandbox enforcement lack receipts and remain unverified; no scored harness success is claimed.

Unqualified: model-driven MCP/Code Mode execution, scoped six-role gateway usability, OS/native-tool
containment, credential isolation/refresh/revocation, production typed blockers/recovery, transport
retry counts and broader account/build/host support. These belong to M02/M05+ or wider qualification;
no production managed dispatch or lifecycle outcome is certified by M01.

Retain `/private/tmp/appraise-m01-native-l1mt4sms` and all earlier owned fixtures/history. Final
cancellation state: `/private/tmp/appraise-m01-variants-yg0t3wz5`; denial state:
`/private/tmp/appraise-m01-denial-kon4rwc1`. Earlier owned diagnostic roots are retained:
`appraise-m01-variants-cl8erkhn`, `appraise-m01-variants-dn2kip3r`,
`appraise-m01-variants-zy1m0_q1`, `appraise-m01-variants-6bktxp9h`, all under `/private/tmp`.
All observed owned children exited 0. Do not reset budgets, signal stored PIDs, delete UNKNOWN history
or redispatch an ambiguous start. No runtime session remains pending from this slice.

Same branch only. Local commits: `411e8576`, `ddcefa6d`, `0f797490`, then find
`test: qualify M01 cancellation and permission denial` in local git log. Read
[CONTINUE-HERE](CONTINUE-HERE.md) before any continuation. M02 is the next ordered slice but requires
separate explicit authorization; do not start it automatically. No push, merge or publish.
