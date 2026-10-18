# TA05 — proposed checkout metadata requalification for an offline successor

2026-10-17. **PROPOSED; no runtime authority.** R22 was explicitly approved in this chat: “Approve exact R22 precheck and one T2 campaign.” Before creating its actual decision receipt or submitting its actual precheck, the inert guarded `--verify` refused a changed current pin. The approved request requires stopping on artifact drift. No actual R22 precheck, runtime, socket, addon, process under test or native allocation occurred. R22 is approved but blocked, not a new runtime UNKNOWN or consumed campaign. Do not retry a consumed command or silently substitute a successor.

## Confirmed delta

The checkout advanced from ac758cea to 98b531d6 through ef15ff48 (native harness/measurement improvements) and 98b531d6 (Sol 6.1 defaults). Preserve these commits and unrelated work.

The reviewed R22 manifest/review/template/request and all 31 R22 source/test/helper pins still match. Of 6,605 current artifact pins, 6,604 match and exactly one changed: root `package.json`. No current pin is missing. All 23 TA04 archive witnesses still match their exact index/copy hashes and lengths, and their six historical roots remain absent. Their historical identity/cleanup stays UNKNOWN.

Root package old SHA-256: `e72dc3831d874e96d346ea1054d93472440decf8512f13e66b0e412da44f3cf4`.

Root package current SHA-256: `96c022e3f83bed882040c6f07c73ffca03819c13ad42bae97a2e8e24fe9c0118`.

The current file equals committed HEAD. The old file is recoverable exactly from `git show ac758cea:package.json` and matches the old pin. Every non-scripts JSON field is structurally identical, including dependencies, devDependencies and package/version metadata. Exactly five script keys differ:

- `quality:pre-commit`: now invokes the harness validation runner.
- `check:development-harness`: adds the native pilot test file.
- `harness:model-currency`, `harness:pilot`, `harness:pilot:run`: newly added harness commands.

No changed script is invoked by the fixed T2 entrypoint, which directly invokes pinned Node. This is source inspection, not proof of native compatibility.

The original 3,349-file preservation baseline is historical: 3,325 still match; 24 committed harness/config/source/test entries now differ. Their exact paths and old/current hashes/modes are recorded separately. Do not rewrite the baseline, claim zero current drift, revert those commits, or label current agent/host properties qualified. M00 remains exactly `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.

Evidence: `.appraisejs/m02-r22-approved-blocked-current-pin-drift-01.json` and `.appraisejs/m02-r22-resume-checkout-delta-01.json`. These preserve the actual approval and new observations without altering earlier artifacts.

## Exact proposed offline scope

Permit one additive offline R23 successor, while R22 and all older artifacts retain their bytes and continue refusing under their original contracts. New source/tests/build paths must use R23; prospective runtime root is `/private/tmp/appraise-m02-ta-matrix-p9`, which remains absent during offline work. Preserve absent p8 as R22 never launched, and retained p7 UNKNOWN.

The successor must preserve the complete original manifest and its old root-package hash as predecessor provenance. Preserve the exact original package bytes in a new immutable, explicitly historical source snapshot with the old SHA-256 and Git-object provenance. Never represent those bytes as the current root file or use a filesystem overlay to trick an unchanged verifier into accepting them as current.

Qualify the new current root package only at the exact new SHA above, with stable no-follow before/held/after reads. Prove the complete non-scripts JSON equality and exact five-key before/after script delta; reject any other package change. Bind both version hashes and their separate evidence classes. Every active current artifact claim for this path must use the new hash; every ancestral manifest keeps its old claim. TA04's finite 23 absent-source mappings, archive/index/copy/length/absence predicates, tuple/host checks, and all other active pins remain exact. No arbitrary availability label, blanket hash update, dynamic fallback or general package exception is permitted.

Record the 24 changed historical baseline entries as committed checkout evolution, separately from current M02 artifact equality. Do not refresh the frozen baseline or infer role/model/context/sandbox enforcement from changed harness settings. Do not invoke the new pilot, provider, auth or runtime commands as part of this offline requalification.

Exercise the actual generated successor manifest and independently serialized receipt inputs through entrypoint, runner, launcher and adapter with fake external effects and disposable real filesystem operations. Retain all 24 scripted cases, continuation/refusal/deadline/missing-ACK/cleanup coverage and explicit native-boundary limits. Guard real sockets/process starts/addon loads. Only after the composed solution works, prepare its fixed private outputs once and obtain one focused exact-artifact review.

No new native allocation was consumed by R22. Keep cumulative ceilings unchanged: 32 matrix listeners, 82 source-capacity slots and 33 listeners including R16. Preserve all other historical allocations and UNKNOWN outcomes. Source capacity is not an observed OS count. GC3 remains REVISE / not passed; real inference remains exhausted 3/3; actual T2 completions remain zero; T3 and M02 remain incomplete.

This proposal permits offline requalification and preparation only. A future R23 command requires a new concrete exact runtime authorization after its artifacts exist and pass review. Existing R22 approval cannot authorize different bytes, p9 or an automatic successor. No auth, inference, Appraise grant, privileged tracing, commit, push, historical cleanup or T3 is authorized.

## Decision requested

Approve TA05 at its final SHA-256 for the bounded offline R23 successor above. This changes only the explicitly described predecessor/current metadata criterion and records existing checkout evolution. It does not approve any runtime command or replace an Appraise lifecycle gate.
