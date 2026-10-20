# M02 N2 composition and implementation boundaries

Date: 2026-10-15 (Asia/Dhaka). Implements source-side M02 preparation under the user's request to
complete M02, while retaining [M00](m00-host-authority-contract.md), [B1 acceptance scope](m02-b1-scope-revision-01.md),
[N0](m02-b-n0-inventory.md) and [feasibility blockers](m02-b-n2-boundary-options.md).

## Authority topology

| Owner                                         | Interface                                                                                                                 | Forbidden substitution                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted supervisor/integration caller         | Supplies immutable external binding, frozen reads, current-authority verifier and independent canonical-acceptance lookup | Worker arguments may not supply target/principal/secret or manufacture acceptance                                                             |
| External worker MCP server                    | New SDK server registering only the accepted external gateway for one role                                                | No full public MCP factory, legacy managed/Factory profile, resources, human decisions, work claims or ambient fallback                       |
| Trusted descriptor collector                  | One bounded request, complete descriptor-bearing standard/Lite containers, exact hashes and supplied provenance           | No model response, generic Code Mode execution, invented schemas, raw prompt/history/header retention or metadata treated as host attestation |
| Native mapping contract                       | Exact descriptor/schema correspondence to the bound scoped MCP catalog                                                    | A name match alone or generic executor/collaboration bridge cannot establish a route                                                          |
| Future enforcer/transport/storage composition | Must enforce effective process/filesystem/network/credential boundaries before runtime                                    | Disconnected B1 adapters, configuration flags and fixture fsync results are not that proof                                                    |

These modules are callable library components, not product dispatch, native process creation or a
server advertised to a running host. Real SDK in-memory linked transports verify protocol registration
without sockets or Codex/MCP OS children. The SDK factory also supplies a separate immutable advertised-schema profile, bound to the accepted
gateway profile digest. SDK input conversion is not assumed identical to the gateway's stored JSON
schema dialect. Mapping uses exact SDK-advertised schema hashes, and all six SDK listing → capture →
mapping paths are verified. No dialect metadata is stripped to manufacture equivalence.
The trusted current-authority/acceptance seams remain
mandatory; M02 does not implement M03's transaction-local mandatory-session admission.

## Failure ordering

Validate binding and exact schemas before canonical I/O. Expose only the bound role catalog; deny
extra authority fields and absent operations. Current binding/lease/generation/revision checks occur
through the accepted gateway before and after I/O. A successful handler, SDK reply or turn cannot
manufacture a canonical acceptance identity. Lost submission acknowledgement remains UNKNOWN;
never retry or resend to turn uncertainty into an apparent success.

Collect descriptors only on the trusted side. Require full schemas/grammars and containers, bind
location/order/namespace semantics, and stop on malformed/duplicate/incomplete/oversized input.
Provenance fields describe supplied records, not cryptographic proof of a launched host. Preserve
source-derived/synthetic/captured evidence classes. Exposure of broad tools is negative evidence;
collection does not permit their invocation. Semantic redaction makes exact mapping incomplete.

B07's eight argument-schema lanes, six deliberately unregistered operation lanes and two
Designer/Triager complementary lanes retain the [accepted matrix](m02-b-n0-b07.md). SDK conformance
adds no Analyzer-native route to the complement validators and does not broaden B07's role or budget.
Foreign frozen-key rejection still is not canonical foreign-receipt-owner validation.

## Deliberately unavailable runtime composition

No native entrypoint, child process, socket/provider transport, enforcer application, real auth,
permission grant or new inference budget is supplied. Existing ambient MCP/desktop connections are
not reused. All runtime paths remain blocked pending effective enforcer evidence and complete actual
native descriptors. P1 limits and M01's exhausted 3/3 confer no further starts.

New source preparation is verified with focused SDK/collector/mapping tests, formatting, lint,
package compilation and exact-artifact review. Prior accepted files remain unchanged. Production
release, M03+, root schema/UI/scaffold changes and public CLI wiring are outside M02's provisional
qualification boundary. Exact final test counts and review outcome are reported after verification;
this document makes no premature acceptance claim.
