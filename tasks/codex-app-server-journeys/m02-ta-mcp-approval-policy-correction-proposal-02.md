# Scoped MCP approval-policy correction proposal

2026-10-17. Additive offline correction preparation under the original explicit conditional authorization. Do not patch, rerun, resume or repair consumed R24/p10. No fresh native command, successor campaign or T3 is authorized by this document. The original instruction permits an additive offline correction supported by confirmed evidence. The retained-history observations and pinned source now meet that condition for this scoped configuration correction. Implement only new offline fixture artifacts; do not alter active host/agent settings, Appraise grants or consumed R24. A fresh native invocation still needs separate exact approval.

## Confirmed evidence and attribution limits

R24 remains terminal UNKNOWN/B01 with zero completed T2 cases, provider request2 pending and cleanup UNKNOWN. Sanitized native failure AUDIT/INCOMPLETE precedes full R10 result decoding. The reviewed private-history reader found one exact generated script/call/envelope and an ordinary error result: OBJECT, isError TRUE, TEXT_ONLY content, structuredContent ABSENT, output COMPLETED/NONE. A separately reviewed second-stage reader matched only the fixed source literal category POLICY_NEVER_LITERAL and turnApprovalPolicy NEVER; errorOrigin remains UNATTESTED. No raw history, error text, provider/account/auth values or raw-history hash was retained.

The observations are in .appraisejs/m02-r24-private-history-observation-01.json (SHA256 3dc21183f50af93abc5cabe1254d26d0ea9e4f24deffa57a4e39c6e6216f00e6) and .appraisejs/m02-r24-private-history-literal-observation-01.json (SHA256 7203206dbc70e164eea7934d8321ef23b1b47253c1d9451bdcb11a32523e4383). Read reviews are .appraisejs/m02-r24-history-reader-review-02.json and .appraisejs/m02-r24-history-literal-reader-review-01.json. Captured p10 identity was checked before/after both fixed reads. This retained history is not exact providerrequest2 byte attestation or installed-binary provenance. Static error text can be mimicked; its match alone does not establish origin.

Independent source evidence strengthens the diagnosis: frozen R24 composition selects global approval_policy never and supplies no per-tool/server approval-mode override. All six exact sealed SDK profiles omit tool annotations. At pinned Codex revision4ebc485ca321243727539187169425fcf972f2c4, default MCP mode auto conservatively requires approval when annotations are absent; a required prompt under global Never returns the matched refusal before server execution. This is a supported R24 configuration mismatch diagnosis, not a claim that R23 had the same cause or that any canonical operation succeeded.

Primary source: [approval modes and config](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/config/src/mcp_types.rs#L22-L79), [server/default/tool fields](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/config/src/mcp_types.rs#L251-L275), [Never refusal](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/core/src/mcp_tool_call.rs#L1529-L1532), [mode semantics](https://github.com/openai/codex/blob/4ebc485ca321243727539187169425fcf972f2c4/codex-rs/core/src/mcp_tool_call.rs#L2333-L2361). Per-tool overrides precede server defaults, then auto. Organization/host requirement merging and actual installed compatibility remain unqualified.

Four new offline checks exercised actual child SDK, stdio framing/audit wrapper, generated script, journal and codec; healthy B01 reads work, deliberately withheld external audit remains refused. No SDK transport mismatch was reproduced. Earlier diagnostic proposal m02-r24-audit-diagnostic-proposal-01.md is preserved at its original bytes; its payload-unknown premise predates these history observations. A new native run solely to discover isError is no longer justified.

## Exact offline implementation scope

Prepare an additive offline correction to the disposable T2 configuration builder only. For each ordinary scripted T2 case, use exactly its selected role's sealed advertised native MCP names below as keys under mcp_servers.appraise_m02.tools; each entry is exactly {approval_mode: approve}. Use native names, not normalized mcp__ names. Do not take a union of roles or infer membership from mutated packet roles. Fail closed on missing, duplicate, stale or mismatched sealed profile membership. No Appraise endpoint, canonical authorization, capability, role schema or grant is changed.

| Selected sealed role   | Exact native names eligible for the proposed per-tool setting                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| REQUIREMENT_ANALYZER   | `quality_journey_analysis_get`, `quality_journey_external_analyzer_analysis_submit_v1`                                 |
| SCOUT                  | `quality_journey_discovery_get`, `quality_journey_external_scout_target_observation_submit_v1`                         |
| RESOURCE_EXPLORER      | `quality_journey_discovery_get`, `operation_search`, `quality_journey_external_resource_explorer_resolution_submit_v1` |
| TEST_SCENARIO_DESIGNER | `quality_journey_scenarios_get`, `quality_journey_external_scenarios_submit_v1`                                        |
| AUTOMATOR              | `operation_search`, `quality_journey_external_automator_materialize_v1`                                                |
| TRIAGER                | `quality_journey_triage_get`, `quality_journey_triage_evidence_read`, `quality_journey_external_triage_submit_v1`      |

Example only for B01's selected REQUIREMENT_ANALYZER profile:

```json
{
  "mcp_servers": {
    "appraise_m02": {
      "tools": {
        "quality_journey_analysis_get": { "approval_mode": "approve" },
        "quality_journey_external_analyzer_analysis_submit_v1": { "approval_mode": "approve" }
      }
    }
  }
}
```

Retain global approval_policy never for the existing ordinary cases. Do not set server-wide default_tools_approval_mode approve; it would affect every tool on that server. Do not change host/global Codex settings. P00 and B14 receive no new tool-approval overrides: required-server failure before turn and the existing granular request_permissions-only native empty-denial case stay intact. The exact B14_PROFILE granular settings (request_permissions true; mcp_elicitations, sandbox_approval, rules and skill_approval false) remain unchanged. Registry-absence tests retain absent names and never receive approval entries for them. Other negative cases retain their selected role profile and exact planned argument hashes; parent audit and SDK/canonical validation must still reject forged inputs at the approved boundary.

The native trust change is explicit: approve bypasses Codex's ordinary approval prompt for every invocation of each listed native tool within that private server configuration. The finite scripted provider, exact role registry, transport audit, canonical validators, tuple/hash checks and campaign ceilings remain enforcing boundaries. Do not claim this setting itself supplies Appraise authority, OS containment or production dispatch qualification. Do not relabel tools as read-only or change annotations to hide writes. Do not weaken auditing or accept error results to make the matrix green.

## Required offline verification before any new native request

1. Additive source paths and fresh preparation paths only; retain all accepted predecessor bytes, including consumed R24 evidence and both pending requests in R23/R24. Never reuse p10.
2. Validate the proposed exact config keys/enum against pinned Codex schema/source; test real serialization through the normal config builder, thread params and launcher. Include exact selected-profile membership and refusal of server-wide/foreign-role/unregistered approval keys.
3. Exercise all24 composed cases through the real generated-manifest/serialized-receipt entrypoint→runner→launcher→adapter with real codec, result serialization, journal and audit. Fake only external effects, guard sockets/process/addon loading. Retain affected malformed/refusal/continuation/missingACK/deadline/cleanup tests. No new real-provider inference or account authentication.
4. Keep strict correlation, TA04 exact archive witnesses, TA05 qualification, current hashes/tuple and fail-closed behavior unchanged. P00/B14 keep their exact budgets and semantics.
5. Obtain one focused exact-artifact review after the composed correction works. If native-ready, prepare one concrete exact request with fresh paths, actual command, all hashes, updated cumulative allocations including R23 and R24, and stop conditions. Do not launch it without separate exact approval. No automatic fallback to broader settings if effective restrictions still deny the call.

R24 separately consumed listener/Codex/MCP/thread/turn1 each, provider2,control3,canonical2,outer1,source capacity4. This adds to R23's separately retained same consumed counts. Historical ceilings are not unused authority and may not reset consumption. No future allocation is granted here. Actual accepted T2 remains a prerequisite for separately authorized T3. M02 remains incomplete; M00, GC3 REVISE/not passed and exhausted real inference3/3 remain unchanged.

Historical proposal01 requested an extra offline-direction gate; that was an unnecessarily narrow interpretation of the original conditional offline authorization. Proposal01 and its exact review stay preserved. This additive proposal02 corrects only that offline authority interpretation, while retaining every native boundary. The existing separate native gate remains binding.

Original copy-ready direction (not an outstanding permission requirement): “Approve offline preparation of the exact per-tool MCP approval-policy correction in m02-ta-mcp-approval-policy-correction-proposal-01.md, including its listed sealed-profile native names, unchanged P00/B14/global policy, preservation and validation requirements. Do not launch a native successor or T3; return the reviewed exact native request separately.”
