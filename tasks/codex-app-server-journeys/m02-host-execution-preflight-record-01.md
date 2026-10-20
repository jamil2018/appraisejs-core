# Host execution preflight record 01 — R15 UNKNOWN

2026-10-17. The approved R15 command was submitted once and is consumed. Preserve M00, every accepted artifact and all historical UNKNOWN. No retry or automatic T2/T3 follow-on is authorized.

The user selected “Approve this one reviewed R15 host preflight” for proposal02 SHA `0631582b2d2c6c44a92ddfe52c9501799c73c280a825f359a75a91da163e63d4` and exact review SHA `5c3cedc19977ef86c62f7ef75f1bf230bd4f9c357a6a6da46c64018612cfe38d`. Exclusive fsynced decision `.appraisejs/m02-host-preflight-r15-user-decision.json`, SHA `5e90a8f61f4de1d02826936488c42b31b302613cfc711562e2fed90f64a54aad`, transcribes that visible answer without claiming a cryptographic signature. Five approved/source/M00 hashes and root/decision absence were checked first.

The fixed command prefix in the exact review was submitted with the review SHA and actual decision SHA as final arguments. Host tool request: `exec_command`, repo workdir, `sandbox_permissions: require_escalated`, no reusable prefix rule. The visible request records the requested execution mode; effective host mode remains source-unattested. Exec session 67234, initial chunk 6a5706, terminal chunk ac48dc, exit 1. No second invocation was submitted.

## Actual retained result

The command returned UNKNOWN, DIRECTORY_CREATE / ENOENT / operationIndex 1. It observed one created owned root, identity device/inode `16777230/68970680`, mode 0700, UID 503. Intent was not written; no listener bind/close was observed. No child, Codex, MCP, HTTP/provider request, auth, real inference or Appraise grant occurred in this bounded source path. Loopback permission remains unqualified.

Root `/private/tmp/appraise-m02-ta-host-preflight-p1` is retained with only its sanitized `result.json`; `cases`, all descendants, listener intent and marker are absent. No cleanup or reuse is allowed. Result schema is the declared reused R14 schema, `appraise.m02-ta-host-preflight-r14-result/v1`, with `resultFileAuthoritative: false`, `runtimeQualified: false`, `t2Authorized: false`. Its SHA is bound in the independent actual review.

- Safe archive `.appraisejs/m02-host-preflight-r15-execution-evidence-01/index.json`, SHA `e10206d4389f5227a3a846df0e8aa226ca9b749a3b265387e06c6cab656ad1b5`: one copied result, two expected files absent, eight directory metadata records.
- Visible-tool-output transcription `.appraisejs/m02-host-preflight-r15-execution-result-01.json`, SHA `7ee11d5268ab7618a3e773993b23238052ea4874a0f82e08da8ad6b474ced30d`; not an authenticated OS receipt.
- Independent actual review `.appraisejs/m02-host-preflight-r15-execution-review-01.json`, SHA `1f17b62f5ae86f85c6baff7b674c5f2f200e27c92c7cf97209068cc53a89e2ce`, accepts UNKNOWN evidence only, with no permission/T2 qualification or follow-on authority.

## Source-backed diagnosis and offline repair

The accepted R14 filesystem adapter calculates a directory parent with `relative.slice(0, relative.lastIndexOf('/')) || '.'`. For `cases`, the index is -1 and the result is `case`, so it inspects the wrong parent before creating the first child. Pure expression evaluation and the saved stage/index support this deterministic sufficient explanation. The original syscall path was not retained; do not rewrite historical UNKNOWN as a proven runtime syscall trace.

The fake-port tests had not exercised that production filesystem adapter. The additive R16 preparation uses a new adapter and canonical `dirname(relative)`, with tests that execute all eight directories, three files and actual fsync/no-follow/ownership checks in disposable temporary directories through the unchanged supervisor, while faking the listener. Accepted R14/R15 bytes remain frozen. R16 must always inject its p2 adapter rather than use R14's p1 default IO. Reused R14 result/intent schemas and synthetic bytes remain explicitly labelled.

[Proposal03](m02-host-execution-preflight-03.md), SHA `eb7d5be5d8c0a30b720e997d3a0c89f53f73ece4cee81780fc97d9569f8b8aa0`, proposes a distinct fresh p2 command with the same small operation ceilings. Source, pure derivation, exact prepared artifact review and a new explicit host-execution decision are required before it can run. No R16 probe or T2/T3 campaign has started. R13 and all older UNKNOWN, GC3 REVISE and real-inference budget 3/3 remain unchanged.
