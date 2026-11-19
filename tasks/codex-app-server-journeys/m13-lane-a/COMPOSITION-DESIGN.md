# A2 — Current composition and B0-R1 decision

Status: offline source investigation completed, 2026-11-13. Base `3d60db3f`.
No implementation, native launch, account query or credential access occurred.

## Evidence ledger

| Owner                                         | Source finding                                                                                                   | Consequence                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `quality-journey-process-supervisor.ts:42`    | Adapter captures input, configuration digest, original launch and readiness validator before awaits.             | Existing correlation/write/cleanup core is reusable later, not an enabled native adapter.             |
| Same file, `:264`–`:361`                      | Start prepares/claims/arms intent, initializes, then starts/resumes thread and starts turn.                      | Do not add a “readiness” call to this flow: it reserves an UNKNOWN provider slot and can send a turn. |
| Same file, `:463`                             | `startQualityJourneyProductionProvider()` always throws.                                                         | Preserve unchanged.                                                                                   |
| `owned-child.ts:158`, `:196`                  | Enabled launcher accepts a Node fixture; `launchOwnedProviderChild()` refuses.                                   | Preserve both fixture contract and production refusal.                                                |
| `owned-child.ts:93`, `:133`                   | Original handle owns drain; stop is memoized, fencing precedes cleanup; uncertainty retains private resources.   | Synthetic cleanup tests may model this contract; no PID reconstruction or native cleanup claim.       |
| `rpc-transport.ts:5`                          | Current method union covers initialize/thread/turn/interrupt; it has no native MCP status decoder.               | No guessed status method or allowlist expansion in B0-R1.                                             |
| `quality-journey-provider-run-service.ts:248` | Canonical authority and lineage precede durable intent and HUB reservation.                                      | Readiness controller must not call provider-run, arm, consume, reconcile or release functions.        |
| `docs/quality-journey-provider-intents.md`    | Production recoverable assignment-secret storage remains future work.                                            | No secret escrow or storage architecture is smuggled into this slice.                                 |
| Four canonical internal/worker gateways       | Analyzer, Discovery pair, Designer/Automator pair and Triager enforce role-specific scoped input and acceptance. | Existing six-role canonical services are not the missing native transport/producer composition.       |

Paths without a prefix above are under `src/services/coordinator/` for services and
`src/lib/quality-journey/codex-app-server/` for transport/child code.
The six-role replay test source still matches independently accepted commit `50091a41`; its 84 source /
23 installed observations are reused at that exact scope.

## Chosen decision

Propose **B0-R1: offline readiness-controller seam**, not a complete product provider adapter.
Use two new pure library files, two new focused tests and the listed documentation updates, specified in
[the B0 packet](../M13-B0-AUTHORIZATION-PACKET.md). A semantic injected port admits initialization,
required-MCP inspection, synchronous fencing and original stop only. It has no arbitrary RPC sender, launcher,
credential, Prisma client or role gateway.

All results and receipts are tagged `OFFLINE_FAKE_PORT`; `runtimeQualified` is always false and
`observedNativeTuple` is always null. This is an application contract, not an invented native protocol.
The controller acquires no resource and receives an already-owned fake port. It never arms the existing turn supervisor.

Deferred boundaries are explicit: native executable/environment/configuration launch, native wire decoding,
recoverable assignment-secret custody, provider login topology, and native-to-six-role gateway composition.
These require separately scoped decisions/authorization. Their absence does not block this narrow offline seam;
it does block claiming completion of the full product adapter or readiness for B1 execution.

## Secret and trust boundaries

An assignment secret authenticates one Appraise assignment. A gateway HMAC secret signs a scoped grant.
Neither is a provider login credential. Existing in-memory seams do not establish restart credential recovery.
B0-R1 accepts none of these values and creates no credential store, config writer or auth-file link.
Synthetic fixture secrets may exist only inside freshly owned test databases; no existing identity/account is read.

The trusted-local-agent profile still acknowledges same-user bypass. Capability injection is not OS containment.
Keep `hostIsolation=NOT_ATTESTED` and helper lifetime inventory UNKNOWN; original-owned cleanup obligations remain.
