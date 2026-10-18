# M02-B-P3 N0 offline evidence inventory

Date: 2026-10-15 (Asia/Dhaka). **Inventory complete within N0; native mapping remains
BLOCKED_MISSING_DESCRIPTORS.** Read [P3](m02-b-p3-plan.md),
[accepted B1 scope](m02-b1-scope-revision-01.md), [B07 matrix](m02-b-n0-b07.md) and
[containment prerequisites](m02-b-n0-containment.md).

## Authority and method

> Approve M02-B-P3 N0 offline inventory, B07 feasibility and containment documentation only.
> Preserve accepted artifacts and obtain exact-artifact review. No implementation, launches,
> probes, auth, inference, grants, commits or push.

Only three additive task documents are produced. Saved JSON under `m01/` was read and hashed;
manifest metadata/structure was inspected without retaining raw prompts/provider bodies or secrets.
No auth was reopened; historical auth/provider observations below are read-only records, not current
operations. No real Codex home/history/keychain, unrelated temporary state or live provider was searched.
No generator/binary/test runtime was launched. No source, test, policy, graph or prior review is edited.

The record set contains 24 JSON files. Whole-file hashes below identify the exact retained evidence,
not authenticity or a newly observed host tuple. `manifest-source-pin.json` associates official Codex
source commit `740e5af33c71225640e0c1c1555c514c2c93ab74` with tag `rust-v0.162.0-alpha.17.2`, but
explicitly leaves binary build provenance unattested and Rust tests unexecuted. The recorded executable
hash is `0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28`; platform is the
historical macOS 27.0.1/26A434/arm64 tuple. Nothing here refreshes it.

## Candidate classification

- `corrected-manifest-host-observation.json`: actual-binary saved request at
  `input[0].additional_tools`; names/types/location only. It records `functions.exec`,
  `functions.wait`, user-input functions and six collaboration functions. No complete descriptors,
  schemas/grammars, namespace/container metadata or callable output contract is retained.
- `permission-denial-observation.json`: two saved Lite request summaries with the same broader
  names/types/location. Permission-denial behavior is historical; no fresh exception is granted.
- `mcp-elicitation-observation.json`, `mcp-explicit-prompt-observation.json` and
  `native-tool-preflight-observation.json`: empty `toolNames` from old top-level-only inspection.
  As [the preserved correction](m01-manifest-investigation.md) explains, these are not an empty
  whole manifest or proof that required MCP is unavailable.
- `manifest-offline-diagnostic.json`: recorded embedded model metadata says
  `tool_mode=code_mode_only`, `use_responses_lite=true`, despite configured Code Mode false.
  This is retained static inspection, not current runtime enforcement or full descriptors.
- `schema-pin.json`: generated RPC schema hash/property/required-field summaries, including
  317 files and stable manifest `a725c3a629e0dd5a8b27612dc23a7172d88073ec89c708bd8ed4359344f9402c`.
  It is not a full provider callable manifest. RPC initialization/thread/turn schemas cannot supply
  missing custom tool grammar or Code Mode routing.
- Official-source pins: source-derived implementation guidance, not captured binary descriptors.
  The preserved manifest investigation explains Lite serialization and model tool-mode precedence.
  Neither source correspondence nor embedded model metadata authenticates the exact runtime surface.
- Other RPC, cancellation, no-model, stream, auth/provider and intent records: historical evidence
  for their recorded scope. They add no complete native descriptor capture; consumed/UNKNOWN native
  intents are retained and cannot be reused to obtain one.

A recursive structure inspection of the 24 saved JSON records found only name/type/location
summaries at the manifest locations above, no complete callable `tools`/`additional_tools`
containers or `inputSchema`/`parameters` bodies. This conclusion is bounded to the named record set;
no global absence across the host is claimed.

## Exact retained-file inventory

All links are relative to this document; hashes are SHA-256 of bytes inspected in N0.

| Retained file                                                                                    | Class                                         | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------ |
| [cancellation-denial-source-pin.json](m01/cancellation-denial-source-pin.json)                   | Official source pin; not captured descriptors | `8acef0788e336cf27daaa70f40267117ea9115700e5b718a6c5ab87e4f292b6b` |
| [corrected-manifest-host-observation.json](m01/corrected-manifest-host-observation.json)         | Saved partial Lite manifest                   | `033592963c48548e469a37b7a7570b98b1bd60d82b73873cd0a25e8deeba4ebc` |
| [elicitation-cancellation-observation.json](m01/elicitation-cancellation-observation.json)       | Historical RPC/stream/no-model observation    | `6ded2f9eb0958b6166983ff4900532f322ceb2c361aea26ab5d0ac98b0a9846c` |
| [existing-login-check-observation.json](m01/existing-login-check-observation.json)               | Historical auth/provider observation          | `949762573eef40b722e8f16fc6174904af027cc697cf9975550e1a0107a47de7` |
| [final-cancellation-observation.json](m01/final-cancellation-observation.json)                   | Historical RPC/stream/no-model observation    | `b71993cc620f7219559737ff377cd2c03e65bdc3588e322d5616f9f28e20c256` |
| [fixture-granular-gate-observation.json](m01/fixture-granular-gate-observation.json)             | Historical RPC/stream/no-model observation    | `873cdd5a96f7a6038c0da2ab4cc9665ffd7a3575cc91ec9e438e88f090e06eaf` |
| [manifest-offline-diagnostic.json](m01/manifest-offline-diagnostic.json)                         | Recorded embedded model/config inspection     | `779def4652e7abd966a7f570b336d4990a7b7a65ca0331ddbc1b78e6e9f51e4e` |
| [manifest-source-pin.json](m01/manifest-source-pin.json)                                         | Official source pin; not captured descriptors | `5a2783193bace8062685a92771b50916cd0172f1761e2339338298f9cd3a76a8` |
| [mcp-elicitation-failed-observation.json](m01/mcp-elicitation-failed-observation.json)           | Historical RPC/stream/no-model observation    | `ca8b03e77e7707be6dac03b8414c1677d143915495f475146c8e625eabd066ea` |
| [mcp-elicitation-observation.json](m01/mcp-elicitation-observation.json)                         | Saved top-level-only manifest summary         | `302799d3feb8487cbb5291440a8630d78082c1a8c73891235985cde8b42fbfa3` |
| [mcp-explicit-prompt-observation.json](m01/mcp-explicit-prompt-observation.json)                 | Saved top-level-only manifest summary         | `49eb2cefc9fe94ae54b7c2a3e50dfaecfbcd92f886313b73a3191073e8dac061` |
| [native-auth-check-observation.json](m01/native-auth-check-observation.json)                     | Historical auth/provider observation          | `d85751344d07b13329e36d401469f9bfdfd44516dc3c33c2184d7a83e2cb063c` |
| [native-provider-observation.json](m01/native-provider-observation.json)                         | Historical auth/provider observation          | `9d3b0bc10a20b4476cdbd9328f2619f53d6519c262795e11c63fc71b3ccd78fe` |
| [native-request-intents.json](m01/native-request-intents.json)                                   | Historical consumed/UNKNOWN dispatch intents  | `1bc10691d9f9b0d871e9155f6e681a8eb964767dfaccaae91d29ddd7e8ec42b1` |
| [native-tool-preflight-observation.json](m01/native-tool-preflight-observation.json)             | Saved top-level-only manifest summary         | `5decd41278ac1cae5bc394e2ead8bf899f9cf4bda139b7e8801125ad380d6343` |
| [no-model-observation.json](m01/no-model-observation.json)                                       | Historical RPC/stream/no-model observation    | `7dfb897748ea412841f28dbf407c37594f275871e09bf35af6d1c6bcdafbc39b` |
| [permission-denial-observation.json](m01/permission-denial-observation.json)                     | Saved partial Lite manifest                   | `bb0c79419382df666df230ebba4b83f45c1be339f8c623dedfd0286aef21ca67` |
| [request-variant-source-pin.json](m01/request-variant-source-pin.json)                           | Official source pin; not captured descriptors | `45711a8bb56cedc1b9021514fc62b6bf8af8105f8633493278855bc1c4a0afc6` |
| [rpc-request-variant-observation.json](m01/rpc-request-variant-observation.json)                 | Historical RPC/stream/no-model observation    | `3798de409815c67e397bb20bf4d749f0e633769b3e0488536ac20586a6cdcb2c` |
| [schema-pin.json](m01/schema-pin.json)                                                           | RPC schema summary                            | `46258b190ece052a825fe8de26f00f95ea20004ec9c61eb5c1d8a31a27faf41f` |
| [stream-fixture-observation.json](m01/stream-fixture-observation.json)                           | Historical RPC/stream/no-model observation    | `48cfc30b1b59d08dab1b66ad3c25cf14097ddaa36348166f8485164ab857170a` |
| [upstream-pin.json](m01/upstream-pin.json)                                                       | Open Design source/test pin                   | `0033b466b3d5a358614e4f1d5d40f60c7a662c7a35b0cec9812d0dfdaee311a8` |
| [vendor-capability-rejection-observation.json](m01/vendor-capability-rejection-observation.json) | Historical RPC/stream/no-model observation    | `c9c288082af4c35b6e5424bf201ff63e68c117dbbbf2ef09ee3b558ce3daad3f` |
| [vendor-elicitation-observation.json](m01/vendor-elicitation-observation.json)                   | Historical RPC/stream/no-model observation    | `ce849e9c352f68fbcae7ed38e81baed5131aa344a950dab4fab02e6ef8e30a7c` |

## Pinned references and offline availability

[Open Design reference map](open-design-reference.md) pins revision
`014bffbf775f4514020cef8bbffdc0eb5a0009ce`; [upstream pin](m01/upstream-pin.json) records hashes
for session/runtime source, protocol/session/transport-switch tests and adapter/testing docs.
These seven source/test/doc hash entries are retained provenance. Their original Git paths and
pinned URLs are identified there, but no physical local source checkout path is supplied by that
map. N0 did not fetch those URLs or search unrelated roots. Source bytes were not independently
re-read/rehashed in N0; earlier inspected hashes and test-review scope remain historical.
The same distinction applies to the six official-source hash entries in the manifest source pin.
If a sanitized owned offline source checkout is later identified, its exact path/provenance must
be established before widening the inventory. No upstream test execution is claimed.

The accepted B0 descriptor inspector/ScriptedResponses and B1 complete-container wrapper, mapping
contract and `native-evidence.mjs` remain synthetic/offline preparation. B1's negative loader binds
`corrected-manifest-host-observation.json` to its whole-file hash but cannot reconstruct missing
schemas. Synthetic role descriptors are not evidence of an actual pinned-binary map.

## Disposition and stop

Adequate N1 input requires complete exact callable containers, namespaces, schemas/grammars and
call/output correlations, tied to the observed tuple and provider. None exists in this named set.
N1 mapping implementation is therefore **ineligible**. A generic executor is not an approved scoped
route; broader manifest exposure is negative evidence, not an observed forbidden effect.
No alternative model/build, schema reconstruction or Code Mode bridge is chosen to unblock it.

The inventory lane stops here. A separately bounded offline containment/composition proposal may
be requested, but no implementation is authorized by N0. Any new capture needs a reviewed exact
E0 artifact, independently assessed boundary and explicit path/process/loopback/start authority.
N0 supplies zero launches/threads/turns/runtime requests and no E0 budget. A zero-turn setup cannot
be assumed sufficient to reveal descriptors. M01's native 3/3 budget is exhausted; never resend an
ambiguous start. B14's asking exception remains unauthorized.

## Preservation and review

The pre-N0 map covers 3179 existing workspace/local-review hashes and modes. M00 remains
`1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`, GC3 remains REVISE / not
passed, HEAD remains ac758cea and the fixed P1 runtime root remains absent. M02 remains incomplete;
M02-C+, M03 sessions/product dispatch, auth/inference/grants and publication remain unauthorized.
106 offline and 84 M02-A passes remain historical evidence for unchanged code; no tests were rerun
for these documentation-only additions. Formatting, local-link, whitespace and prior-file identity
checks were performed and passed. Independent exact-artifact review is pending; its eventual outcome
will be recorded separately in new `.appraisejs/m02-b-n0-review-*` receipts.

Route receipt `687bc241-1b53-4ef7-aaf8-f6452b3a15a8`: bounded read-only investigator and solver,
then independent exact-artifact judge. Requested role/context selectors are not attested effective
host role/model/sandbox proof. No scored harness success or lifecycle gate is inferred. No new
routing, permission or quality-gate policy is introduced.
