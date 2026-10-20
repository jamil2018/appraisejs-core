# M02-TA T1 execution 01 — UNKNOWN, campaign stopped

Date: 2026-10-16 (Asia/Dhaka). M02 remains incomplete. This is additive evidence; request 02 and all prior approvals/reviews remain historical and unchanged.

## Authority and exact attempt

The user instructed: “complete the full work for M02. I am giving approval.” This followed request 02 for runtime manifest `b9616423339cf298352e578f0fb04c192a343d633f34c8201c2bf3d7a6dac973`. The coordinator executed that exact clean-environment command once with its narrowly scoped host exception. No generic reusable permission was requested. Exec session `47771` returned exit code 1: `T1 stopped UNKNOWN or failed preflight; inspect owned evidence.` The command was not resent.

Immediately before execution, the r3b independent review receipt matched the current source artifact. The manifest file SHA-256 was `d7cfc700f9b1edcefe40bd8ae1b1968edee74ebd9c5a554a5d2e5435e2a47afb`; M00 matched its frozen hash.

## Retained observations

The fixed phase root `/private/tmp/appraise-m02-ta-descriptors-p1` now exists and must not be adopted, reset, deleted or reused for another start. Its durable journal is at `supervisor/journal/journal.jsonl`.

- Sequence 1: init at `2026-10-15T18:54:08.422Z`, hash `ceef4d452d5dbe7b46fc6dc033aadaf33675d84c8fabe137ec11d3983fdd724e`.
- Sequence 2: UNKNOWN reason `T1-runtime-ambiguity`, terminal timestamp `2026-10-15T18:54:12.937Z`, hash `6ccd152391b72c8e1ce61800a66028d0d8b7ae8098815a8f258a9e6c78c3c5ef`.
- No native-start, listener, thread, turn, canonical bootstrap or provider intent/ack was recorded. The case directory is absent. No descriptor capture or child startup/exit receipt exists.
- The root contains 724 regular files: the journal, pinned public package metadata, staged canonical bundle and 721 dependency files. The phase/supervisor/modules directories are private 0700; sampled file metadata is 0600. This is filesystem observation, not OS containment attestation.
- A read-only call to `verifyT1ModuleResolution` against the retained staged module tree returned true. It did not import the backend or start a runtime.
- All 3,253 files in `.appraisejs/m02-t1-preservation.json` still match their recorded SHA-256 and mode after the attempt. Frozen M00 SHA-256 remains `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.

## Diagnosis and evidentiary limits

The source calls `writeEvidence(receiptFile('module-stage.json'), ...)` immediately after staging, before backend import and before launcher invocation. `receiptFile` targets `cases/T1/supervisor`, which is only created later by the launcher. That parent is absent in the retained tree. The exclusive evidence write therefore cannot succeed at that point. This ordering defect explains the observed stop before native effects. The CLI discarded the underlying exception; the actual exception text was not captured, so ENOENT is a source/layout inference rather than a retained exception receipt.

The 14 passing offline tests did not cover this real preparation order: staging used an unrelated temporary root, while orchestration injected the staging/evidence writers. Those checks remain valid within that bounded coverage; they did not establish that the actual fresh-root staging receipt could be written before launcher creation of the case directory. Independent review confirmed this gap and independently verified the two-entry journal hash chain.

No native process, listener, provider request or inference is evidenced by this attempt, and the reviewed ordering places the failure before those effects. There is no independent OS-wide process attestation. Do not upgrade the run to success, reset its journal, or infer containment from its configuration. M01's exhausted native inference budget remains 3/3; no real inference, auth or grants were performed by this command. GC3 remains REVISE / not passed. T2/T3 were not started.

## Stop and next bounded work

The approved UNKNOWN/no-retry rule stops the campaign. Preserve this root and all prior artifacts. Its conservative unresolved retention decision deadline remains `2026-10-22T18:54:08.422Z`; the coordinator owns that decision. No successful-terminal 24-hour history deletion is claimed and no deletion is authorized here.

Before another native start, prepare and independently review a corrected candidate that writes staging evidence to an exclusively owned parent available before launch, retains the existing root and evidence, captures a bounded sanitized preparation-error classification, and tests the actual preparation/evidence ordering with real disposable filesystem paths. Preparation tests must not launch native children, bind sockets, invoke providers, authenticate or grant permissions. Preserve the original r3 manifest and source bytes in an explicit historical snapshot before candidate edits.

A new exact runtime request must name a different exclusive root, revised manifest/command, unchanged or explicitly revised counters and deadlines, retention ownership and this failed attempt. Fresh authority must explicitly authorize that replacement attempt despite the consumed one-shot T1 invocation; broad completion approval does not erase the UNKNOWN/no-retry gate. T2/T3 still require actual captured descriptor mapping and exact runnable-artifact review. M02 cannot be reported complete until those gates and final evidence review pass.

## Engineering review and harness limits

Routing receipt `4d1f729d-d106-4628-965f-096eb967cc88` records independent review of this consequential runtime outcome. Reviewer `/root/t1_runtime_review` independently confirmed the journal chain, complete staging inventory, preparation-order defect, bounded test gap and campaign stop. Effective role/model/context/sandbox enforcement remains unverified. A scorecard append was rejected because the ledger requires an effective-context receipt for an independent judge; no host receipt was invented to bypass it. Advisory improvement: exercise actual filesystem preparation ordering and preserve sanitized preparation-error classifications in a future corrected candidate. No routing policy, permissions or quality gates were changed.
