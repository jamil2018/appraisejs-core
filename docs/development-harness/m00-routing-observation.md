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

## M00-r3 temporal review lesson

One bounded independent judge reviewed the agreed-default transcription and identified a late-start retention clock
after a crash. The corrected contract anchors unresolved-history escalation to earliest durable provider intent,
checks overdue timing before resume, and treats missing trustworthy time as overdue. Exact revised artifact was
accepted for documentation sufficiency; runtime remains unqualified. Formatting and link checks cannot establish
crash-time semantics. This is advisory review evidence, not a harness rule or lifecycle approval.

Local route receipt: `c3f4a0b4-6818-4801-bec3-d5a7d36a375e`;
contract SHA-256: `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.
