# M02-TA T1 R5 execution 02

Date: 2026-10-16 (Asia/Dhaka). **M02 remains incomplete. R5 T1 is UNKNOWN; do not resend.** This additive record is the latest runtime checkpoint. Earlier checkpoints, accepted artifacts, original p1 UNKNOWN and all historical reviews remain unchanged.

The user's continuing full-M02 approval, clarified by “didn't the goal say I permit the actions. why stop?”, was applied without another artifact-specific chat approval. The coordinator had previously interpreted that approval too narrowly. The bounded R5 replacement then completed offline preparation and independent exact-artifact review before its one native invocation. This execution stopped on actual runtime uncertainty, not missing chat authorization.

## Exact invocation and evidence

The [R5 runtime record](m02-ta-t1-runtime-record-04.md) specifies the command. Manifest digest `d50d6e7d3fd6f672e6c55b54e8b3473b8f5d32750daba6b597017dd07561111d`, manifest file SHA-256 `02ab0bd9e744a892508e9f0927aee983a5a16ca2df3bef9efd9cc88ffe74dad0`, 6,154 exact pins. Independent pre-execution receipt `.appraisejs/m02-t1-r5-exact-review.json`, SHA-256 `0c02950669b35f0e7025c7b75f5e3868c981097c5a109dba1d6b5b7c2892d7f2`, accepted one exact bounded invocation only. Offline tests passed 17/17, focused ESLint/Prettier passed and both reviewers checked all 3,253 historical preservation files/modes with zero drift.

The command was invoked once with the specific owned-loopback/pinned-child sandbox exception. Exec session **61940** returned exit **1** after polling that same session. Output was the sanitized generic `T1 stopped UNKNOWN or failed preflight; inspect owned evidence.` No resend, alternate root/executable or permission-mode fallback occurred.

Root `/private/tmp/appraise-m02-ta-descriptors-p2` was created. Preparation staged 723 pinned files and fsynced `supervisor/module-stage.json`; its staged digest is `f213586324b0a5d3f882ba9a5bd8d2cc6e4e956cbbd45b84f1e2a5ae25f7901e`. The journal contains 16 valid chained records:

- Init and T1 begin.
- One listener reservation/ack and one bootstrap control-write reservation/ack.
- One Codex start reservation/ack and one MCP start reservation without its startup acknowledgement.
- Initialize and initialized control-write reservations/acks.
- UNKNOWN reason `ambiguous-effect` at `2026-10-16T13:18:42.531Z`.
- Owned-stop intent and observed recovery records.

There are **no thread-start, turn-start, provider-request, scoped-call or permission-reply reservations**. The MCP start remains pending. These journal observations do not establish OS-wide absence of effects, complete child cleanup or the exact cause of ambiguity. Native startup was attempted; T1 did not capture descriptors or pass. Case supervisor has no descriptor, MCP startup/exit or other listed completion receipts. No auth, real inference, grants or later phases were requested by the harness. The original inference budget remains exhausted at 3/3.

Independent read-only diagnosis excludes control-write ceiling exhaustion: three of four permitted writes were reserved. The initialize response was accepted by the peer; the initialized acknowledgement records local stdin-write completion, not native acceptance. Unexpected/invalid startup frames, EOF/error/exit hooks and pre-reservation thread-start checks remain alternatives; the generic journal category cannot distinguish them. No native frame sequence is reconstructed or claimed observed. The owned-stop record follows the SIGTERM request and awaited listener closure; its implementation explicitly reports `processExitProved:false`. Complete Codex/MCP exit remains unproved. Later phases stay blocked by failed capture and unresolved state.

Sanitized evidence was promptly archived, without modifying or deleting its source, into the new private directory `.appraisejs/m02-ta-t1-r5-execution-evidence-01/` (0700, exclusive fsynced 0600 files):

| Artifact                             | Bytes | SHA-256                                                            |
| ------------------------------------ | ----: | ------------------------------------------------------------------ |
| `index.json`                         | 2,588 | `84d88f76b79dfded1f891dfac7b6171c7c33462ef2578f41c461eb39c885292c` |
| `supervisor--journal--journal.jsonl` | 4,385 | `9c8146fb33fa802d0ea95993c9dde86758c9be8715f12192284670d45afcf575` |
| `supervisor--module-stage.json`      |   410 | `3f79626fca226797d1df78b0a17845063f1e8ba4e9572db002c0fbe16ab497c0` |

Journal terminal chain hash: `dfd6f3bfb618c09d3ed9e23810454d7b3b728fc57bc4dd40480c1f28c6826176`. The index records source identities and seven absent optional receipts. No raw prompts, transcripts, provider bodies, bootstrap capabilities, fixture database, configuration or Codex home were copied into this archive.

Independent actual-evidence review returned `UNKNOWN_CAMPAIGN_STOPPED`, not T1 or M02 acceptance. Its exclusive fsynced receipt is `.appraisejs/m02-t1-r5-execution-review.json`, SHA-256 `e1bfd273f94cbaccd032358c457ef8e9f54d6668e2a42dca6524d469ff675606`. It verified the archive/current safe receipt equality, chain, source identity and cleanup limits. This does not retroactively change the pre-execution review's NOT_RUN evidence class.

## Stop and preservation

R5's one native start was consumed. No automatic retry or replacement is authorized by this attempt's limits. Continue only read-only diagnosis and independent actual-evidence review; do not modify accepted source/manifests, replay starts, reset counters, delete the root or advance T2/T3 without resolving this actual ambiguity and the consumed-start limit. Existing full-M02 approval remains acknowledged; it is not a reason to fabricate a pass or override a no-resend condition.

P2's conservative earliest-possible-provider-intent clock is `2026-10-16T13:18:36.648Z`; its unresolved seven-day decision is due `2026-10-23T13:18:36.648Z`. No successful reconciled terminal is claimed. P1 remains separately UNKNOWN / LOST_RAW_ROOT_AFTER_REVIEW with deadline `2026-10-22T18:54:08.422Z`; its hash-matched archival extraction and provenance limits remain as recorded in [state recovery](m02-runtime-state-recovery-01.md). T2/T3 roots remain uncreated and no later matrix case ran.

M00 remains frozen at SHA-256 `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`. GC3 remains REVISE / not passed. There were no commits, push, auth, real inference, grants, UI/schema/release or M03+ work. Configuration and offline tests do not establish containment; native routing and full M02 completion remain unqualified.
