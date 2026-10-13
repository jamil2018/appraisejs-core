# M00 routing observation — 2026-10-13

Advisory only; no routing/model/tool/permission/gate change authorized or implemented.

The first M00 route invocation used unsupported compound signal names, which the router ignored and classified as
coordinator-only. Receipt inspection exposed the mismatch; the coordinator read the actual signal schema, recorded
a corrected solver/independent-judge route before delegation, and retained both receipts. Unknown-key rejection or
clear CLI validation is a future improvement proposal; do not change router behavior as part of M00.

Requested `fork_turns=none` and named solver/judge selectors did not return effective-host property receipts. Record
requests separately from enforcement; a local scorecard cannot fabricate proof to pass its finalization gate.

Performance/resource/governance assessment: no concurrent writes or duplicate agent lanes; bounded solver judgment
and independent final-artifact review served distinct purposes. One avoidable routing correction and oversized
batched reads cost extra coordinator work. Use schema-valid signals and bounded source reads in future runs.
No provider, host throughput or runtime cost measurements were collected. M00 contract acceptance remains pending.

Evidence: [M00 review record](../../tasks/codex-app-server-journeys/m00-review-evidence.md), local ignored route receipts
`4e4e1ab1-c5b5-49fe-af57-f4de76fc2c33` and `ca85544b-b433-47f3-8840-f83ed2758039`.
