# M02-TA T1 R6 execution 03

Date: 2026-10-16 (Asia/Dhaka). **R6 T1 is UNKNOWN; M02 remains incomplete. Do not rerun the R6 command or replay its pending thread/start.** Accepted R6 source and earlier history remain frozen.

The [exact R6 command](m02-ta-t1-runtime-record-05.md) ran once under the user's startup-fix/full-M02 instruction and the reviewed owned-loopback/pinned-child exception. Manifest digest `7dd6df107dfe033056b12addf0d31beb99d3eece1efa3d6e5635aca636970a1f`, file SHA-256 `a714cf070b301be00165d5dafa00b06fd1fc359ac1fcd4e33b11ed4b47c3b841`. Pre-execution exact receipt `.appraisejs/m02-t1-r6-exact-review.json` SHA-256 `338fb7f4c24d63f53217b1e1c9624c545f399b9995058a787319e7136b5a5885` accepted one invocation. Exec session **76683**, observed by polling that same session, exited **1**. No alternate executable/root/permission mode or resend occurred.

## Actual evidence

P3 root: `/private/tmp/appraise-m02-ta-descriptors-p3`. Its 17-record valid journal shows one acknowledged listener, three acknowledged control writes, one acknowledged Codex spawn, one pending MCP-start reservation and one pending thread-start reservation. It has zero turn, provider-request, canonical-request, scoped-call or permission-reply reservations. Thread creation/native effects cannot be excluded merely because acknowledgement is missing.

The protocol failure receipt was fsynced at sequence 14, before UNKNOWN at sequence 15. It records `UNKNOWN_REQUEST_OR_NOTIFICATION`, phase `ready`, pending `thread/start`, method SHA-256 `fc90be8d31a9f1bb24948acd35f025e91f103bcde03fb735388a7169f1262d24`. Hash comparison with all 85 methods in the pinned ServerNotification schema uniquely identifies `remoteControl/status/changed`. The raw frame was deliberately not retained: its idless shape, parameter values and precise native cause remain unproved. In particular, no claim is made that remote control was disabled or that this actual event was harmless.

This exposes a concrete compatibility gap in the limited advisory classifier. The pinned schema permits disabled, connecting, connected and errored remote-control states. Open Design/t3code provide notification compatibility references, but blanket suppression would hide auth/remote/approval effects. A further correction must validate any permitted passive state without granting authority or responding to unknown requests.

Owned Codex exit and close were both observed with code 0 and null signal after the one owned stop request; the new receipt reports `processExitProved:true`. The separate required-MCP startup and exit receipts are absent. Complete MCP cleanup and successful thread startup remain unproved. There is no descriptor, actual provider tuple or turn terminal evidence; T1 did not pass and T2/T3 did not run.

## Durable sanitized archive

New private directory `.appraisejs/m02-ta-t1-r6-execution-evidence-01/` is 0700; files were created exclusively at 0600 and fsynced, preserving original safe source bytes/identities:

| Artifact                                           | SHA-256                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| `index.json`                                       | `3a43204c8753c08e5fea18ef3fde38be52832fd75d3ec41e2c9f0a96d1b90b96` |
| `supervisor--journal--journal.jsonl` (4,620 bytes) | `7f220847ad2d0104a02b19597ab2923c93f292b5214ff0743079f912ffe50ae2` |
| `supervisor--module-stage.json`                    | `a2c09df1477a710dcdbdb97b5e8ef1bfa42c7a54d4bd2d4af780dd063bfa5a97` |
| `supervisor--protocol-failure.json`                | `54bd24742ca1444fb462ed08f85b643997e875ddb0eec803237d73d7f297dae9` |
| `supervisor--owned-child-observation.json`         | `32aa6cdff993b3971e51337c5de531d36201c7bcb990154b33ed0aabc9a16b98` |

Journal terminal chain hash `a05bca42acf7f9c60d14917ed69bffa11b1d262ba1397a736fec47e95ae65db5`. The index records seven missing optional receipts. No raw frame, prompt, transcript, provider body, configuration, capability, fixture database or Codex home was copied or deleted.

Independent actual-evidence review returned `UNKNOWN_CAMPAIGN_STOPPED`. Exclusive fsynced receipt `.appraisejs/m02-t1-r6-execution-review.json`, SHA-256 `4bda6ba13127fc48e22efe02cdd481ba6d4185fad6145be6a2ece8fcb38b0887`, verifies archive/current safe-source equality, chain/identities, observed Codex exit and remaining MCP/thread uncertainty. It does not qualify T1 or authorize R6 replay.

P3's conservative clock is `2026-10-16T13:58:35.561Z`; unresolved decision due `2026-10-23T13:58:35.561Z`. P1 and P2 retain their separate original clocks and UNKNOWN classifications. All counters remain consumed. Any distinct corrective artifact must retain this history, use fresh storage and pass its own offline and independent exact review under current user authority; it cannot inherit a pass or reset R6.

No auth operation, real inference, grant, commit, push, UI/schema/release or M03+ work was requested. M00 remains frozen at `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`; native real-inference budget remains exhausted at 3/3 and GC3 remains REVISE / not passed.
