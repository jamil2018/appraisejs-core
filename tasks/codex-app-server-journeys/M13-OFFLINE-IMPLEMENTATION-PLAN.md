# M13 — remaining offline implementation

Authority: on 2026-11-14 (Asia/Dhaka), the user requested completion and clarified **“Finish remaining offline
implementation under all existing limits.”** This authorizes the source work below. No native launch, real credential
access, inference, sign-in, push, merge or publication is authorized. Base is reviewed B0-R1 commit
`4b685e688f9f25c683aa1ece5ee2722668fe5cec`; work is isolated on `codex/m13-offline-completion`.

## Decisions and finite completion scope

Complete one injectable, offline provider composition end to end, including original assignment custody and all six
canonical role acceptance paths. Preserve the existing supervisor, owned-child production refusals, D05 policy,
schema/migrations, historical evidence, consumed budgets and M06 source custody. Do not reuse the stopped B0-R1
readiness receipt as live send authority. Native protocol/configuration compatibility remains an observation gap.

| Owner / source                                                                                                             | Implementation                                                                                                                                                                                                                           | Acceptance                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assignment-credential-custody.ts`, `assignment-credential-file-store.ts`, `quality-journey-assignment-custody-service.ts` | Encrypted PREPARED_CLAIM before canonical claim; CAS-bind exact returned attempt; same original key/secret only on recovery. Explicit injected app-owned key and root, no default key/credential discovery.                              | Fresh synthetic keys/temp roots/SQLite; lost replies, restart, conflicting identity, missing key, corrupt ciphertext, storage races and restrictive filesystem custody. No secret in receipt/log or replacement attempt on loss.                 |
| `provider-composition-contract.ts`, `quality-journey-offline-provider-composition.ts`                                      | Current admitted authority before one injected fake acquisition; initialize/required-MCP readiness on the same owned port before prepare/claim/arm; canonical transactional thread/turn writes; one memoized start and original cleanup. | Counted fake effects; readiness/canonical refusal before arm; revoke/expiry/session/input/profile drift; synchronous cancellation, timeouts/late completion, original handle retention and UNKNOWN conservation.                                 |
| `quality-journey-offline-role-delivery.ts` and narrowly extended test fixture                                              | Closed six-role routing into existing canonical services/gateways; hidden binding material outside producer arguments; durable acceptance lookup and human-wait fencing.                                                                 | All six roles reach real fresh SQLite acceptance through the composition; replay/changed-payload/cross-scope refusal, reply loss and no additional turn during human waits. Existing fixture behavior stays unchanged by default.                |
| `packages/appraisejs/src/mcp/trusted-managed-worker-offline-composition.ts`                                                | Existing managed attempt-scoped SDK server plus InMemoryTransport and exact synthetic call/result correlation. The external-worker bridge remains a separate tested contract.                                                            | In-memory SDK transport only; exact managed profile/call/argument/result identity and one captured canonical callback. Root canonical gateways own authority and durable acceptance. Never upgrade `dispatchAllowed:false` to native permission. |
| Tests, current docs, generated scaffold/graphs and actual packages                                                         | Root canonical sources; deterministic generators; bounded measurement receipts; complete focused/static/build/installed checks and independent review.                                                                                   | Frozen final commit/tree/package hashes, unchanged guards/policy, actual packed cross-package proof and no unspecified next offline seam.                                                                                                        |

Paths without a prefix are under `src/lib/quality-journey/` (custody), its `codex-app-server/` directory (contract),
or `src/services/coordinator/` (services). Matching unit/SQLite tests accompany each owner. The existing
`src/test/m10-journey-fixture.ts` may gain an optional trusted test dispatch hook to reuse the complete canonical
lifecycle without duplicating or changing its default behavior. Additional test-only extraction requires a concrete
fixture dependency, never a product shortcut.

## Exact acceptance recovery

A narrow internal async context observes the canonical acceptance boundary's actual normalized payload hash for the
full original binding, operation and idempotency key. It wraps only the retained original canonical thunk; a hash is
request identity, never proof of commit or authority. Conflicting observations poison recovery. The authenticated
read-only outcome helper additionally requires that captured hash to match the durable acceptance row. Existing
canonical authentication, business writes, transaction joins and replay-conflict rules remain authoritative. No
producer-supplied hash, gateway-entry latch or key-only lookup can establish original payload acceptance.

## Managed/external protocol decision

Actual SDK validation exposed distinct public contracts: external-worker Designer/Automator/Triager calls require a
caller WorkerResult, while managed gateways construct that result server-side. The initial proposal to compose managed
payloads through the external bridge was withdrawn. A separate managed factory reuses the existing managed SDK server;
it never fabricates, drops or claims correlation for an external WorkerResult. External preparation/bridge tests remain
separate evidence. Analyzer producer arguments use the actual public charter projection; only the captured server
reinserts fixed schema/Journey/target identity. Package correlation is not canonical acceptance or native dispatch authority.

## Custody, ownership and measurement invariants

Assignment secrets authenticate Appraise attempts; they are not provider-login credentials. Encryption uses an
explicitly injected application key with authenticated immutable database/Journey/session/principal/role/claim identity.
No ambient environment, keychain, existing auth file, provider history or real account is accessed. The filesystem
backend is tested only at fresh supplied synthetic roots. It supplies no real key-provisioning topology or host isolation.
Missing original key/material parks the same attempt; verifiers, process IDs and old receipts cannot reconstruct authority.

One original port owns initialize, MCP readiness, thread/turn, notifications and stop. Current authority is rechecked
at asynchronous boundaries and canonical write admission. Cancellation synchronously fences; late replies cannot
reopen admission. Ambiguous writes, accepted output, cleanup and restart never free occupied UNKNOWN or mint a permit.
Human approval, answers, execution consent and closure stay Appraise-owned.

All composition receipts remain explicitly synthetic with `runtimeQualified=false`, `observedNativeTuple=null` and
null/UNQUALIFIED model tokens and cost. Phase timings distinguish startup, dispatch, canonical acceptance, human wait
and cleanup; synthetic timing is never promoted to provider usage. Unsupported/missing supplied wire bindings refuse.
The published [app-server documentation](https://learn.chatgpt.com/docs/app-server) is design input, not proof of the
installed executable's compatibility or live MCP readiness. No undocumented native status meaning is invented.

## Verification order and finish condition

Run affected lint, formatting, tests and existing static quality gates before expensive packaging. Then run TypeScript,
canonical scaffold sync, Graphify, build, harness/docs checks, artifact/package inventory, actual packs and fresh
installed-app offline suites using its own dependencies/Prisma client. Preserve infrastructure and failed development
receipts; fix causes without skips, suppressions, baseline changes, global timeout increases or historical replay.
Use only public dependency/build-asset downloads with empty task-owned npm configuration for install proof.

Independent exact-artifact review is mandatory for custody and persistence consequences. Record requested reviewer
context separately from unverified host enforcement. Runtime execution, credentials, inference, native cleanup,
usage/spend, eligibility and distribution remain separately gated in the [runtime plan](M13-RUNTIME-QUALIFICATION-PLAN.md).
The deliverable is **OFFLINE_IMPLEMENTATION_COMPLETE** only when every row above passes. Overall M13 remains
**BLOCKED / NOT QUALIFIED** under the preserved live-effect limits; no public/default rollout or lifecycle acceptance follows.
