# R17 continuation diagnosis and additive offline fixes

2026-10-17. Scope: user-authorized offline continuation fixtures and fixes for confirmed gaps only. No runtime launch, socket, auth, inference, Appraise grant, commit or push. Accepted source, manifests, reviews, M00 and all historical UNKNOWN remain frozen.

## What the actual R17 evidence proves

[Runtime record05](m02-ta-t2-runtime-record-05.md) and independent actual review `.appraisejs/m02-t2-r17-execution-review-01.json`, SHA `3976c3c5f442ae6c856db9ca55ea1709c87a17c6dada436408c4e72005034535`, remain authoritative: B01 completed zero cases, request1 and outer1 were acknowledged, request2 was reserved without acknowledgement, and no outer2 or response2 receipt exists. Actual request2 body, immediate exception and effect were not retained. Full cleanup and effective host mode remain unqualified. These fixtures do not reconstruct the missing actual request or change UNKNOWN to a diagnosed runtime outcome.

The frozen R17 composition uses the R10 pure provider script session and codec. Its failure interval includes body read/parse, launcher checks, descriptor/transcript/codec/audit checks and response construction. No single failing operation can be selected from the retained evidence.

## Reproducible offline gaps

| Gap                                   | Frozen behavior                                                                                                                                                                                                                             | Additive correction                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cumulative output projection          | The session validates the whole transcript, then projects all historical outputs into a producer that requires exactly one current output. A valid second continuation containing both completed operations fails with `CONTINUATION_SHAPE` | Validate the entire transcript first, including previous-output hashes, then pass only the uniquely correlated current issued output to the producer |
| Rejected transcript remains retryable | Transcript validation throws outside the producer's failure fence. The same pure session accepts a corrected retry and can reserve the next outer call                                                                                      | Fence the producer on transcript-validation failure before rethrowing. A subsequent corrected request cannot reserve another response or continue    |

The first gap affects a later cumulative continuation; it does not explain R17's first continuation at request2 by itself. The second gap is a pure-session no-resend defect; there is no evidence R17 actually retried, and its outer runtime journal already fenced the campaign. Both are fixed in new offline source without changing their accepted predecessors.

Validation of the full supplied input is not proof that every historical item is present. Both the accepted R10 tests and the new session support compacted history containing only the current output. The session retains its issued plans, request index, previous-output hashes and independent audit state; current output is still required exactly once. Mutation/reordering/duplicates of included prior outputs are refused, but omission of an earlier accepted output is not a completeness violation. The fix preserves this compact-history behavior and makes no complete-history attestation.

Synthetic request2 fixtures exercise the full issued custom-call and output transcript with a sealed descriptor and fake audit/Code Mode ports. A valid positive request2 and an audited returned MCP error can be serialized and correlated by the frozen code. Missing audit, foreign/duplicate output and script failure/yield are refusals, not evidence of a particular actual R17 cause. A rejected transcript cannot become authority to resend.

## Open Design, t3code and pinned protocol evidence

The pinned Open Design session separates typed text from local-image inputs (`.appraisejs/m02-open-design-reference-20261016-01/session.ts:243–249`) and explicitly refuses unsupported server requests (`:361–371`). Its SHA is `99a556e58642d47a2ca38a3b3ea29838535735fe62b1f1a7a79491148ab0ba73`. The pinned t3code client method-encodes request/notification payloads and method-decodes responses before dispatch (`.appraisejs/m02-t3code-reference-20261016-01/client.ts:208–230`), SHA `d60165961c79bd11d8342d84b388217db6a07b4d9f0a7035a37224a1d3ea7d47`. These are useful boundary-validation references. Neither provides the actual R17 body or a Code Mode continuation codec; no permissive unknown-method policy was copied.

Cached Codex revision `4ebc485ca321243727539187169425fcf972f2c4` supplies the specific serialization evidence: `protocol_models.rs:859–867,1167–1204,2013–2023,2210–2230` in `.appraisejs/m02-code-mode-codec-reference-20261016-01/` defines optional call/output fields and tagged output contents; SHA `df9a3da250376d86203a8a1219b2e4b5353a62274d094bb36998560433bd58eb`. The Code Mode output adapter prepends completion/error/yield status and timing text (`core_code_mode_output.rs:19–38,51–67` in `.appraisejs/m02-code-mode-codec-reference-20261016-01/`), SHA `071a30e1811bb43939e59f910c180b5377e9aa2f99f5e2bc658032bf1d319c77`. Public source correspondence to the installed binary remains unattested.

The generic protocol supports multimodal outputs, while this bounded qualification codec deliberately requires its exact text-only completion envelope. Image/audio, failed/yielded/truncated output and extra content remain rejected; they are not flattened or silently accepted. No format or audit boundary was weakened to make fixtures pass.

Nested MCP names are conditional on the configured prefix and normalization (`codex-rs_codex-mcp_src_tools.rs:105–112,139–146,228–233` and `codex-rs_tools_src_code_mode.rs:265–276` in the same pinned cache). They support the expected `mcp__appraise_m02__<operation>` key under the reviewed prefix/no-exception profile, not an arbitrary alias. Cached call sites show default-namespace normalization, but the actual `ToolName::is_default_namespace` implementation is absent from the supplied caches. The literal wire namespace `functions` therefore cannot be declared invalid from those call sites. No namespace or lookup-name change is justified by this investigation. No real native registry or request2 body was collected.

## Artifacts, verification and remaining limits

New implementation and tests live only in `scripts/tests/fixtures/codex-app-server-m02-ta-continuation-r18/` and `scripts/tests/codex-app-server-m02-ta-continuation-r18.test.mjs`. They expose a pure additive session factory and synthetic fixtures, with no runtime entrypoint, manifest writer, native loader, socket or campaign allocation. The consumed R17 runtime and accepted R10 session/codec remain byte-identical.

The frozen additive source hashes are:

- `script-session.mjs`: `72de195fec5ab975b827761fd2f4ea7994001d47b27b36e88e9f1c02c2c671fe`.
- `synthetic-session.mjs`: `2264c9fea1623a859d25f3e151b851c4f41d056f8b4c0e872fcf16ba770d65fc`.
- Focused test: `7fe6767bf482b2382bbf753a7f68be76c6264d47293d14ed20fb12a0958abfb8`.

All thirteen new focused Node tests pass, together with focused ESLint and Prettier checks. The fixtures retain full call/output transcripts, demonstrate both frozen-source defects, cover cumulative two- and three-operation cases through terminal completion, and reject changed/reordered/duplicate history, missing audit, bad output and unacknowledged writes. Frozen R10 session/codec and R17 test hashes remain unchanged. Independent exact-artifact review and the complete preservation recheck are recorded separately in the current checkpoint; no local review is user runtime authority.

Independent related-check results must remain distinct: the frozen codec suite passes 8/8. An additional frozen matrix-r10 suite run passed 18/20; two tests (lines 513 and 701) assert that its fixed historical runtime root is absent, which conflicts with the required retained UNKNOWN root now present. These are stale environment preconditions, not failures reproduced by the additive continuation fix. No historical root was removed and no accepted test was changed to make those assertions green. The full frozen matrix suite is not reported as passing.

A passing fake audit is supplied deterministic evidence, not actual scoped MCP/canonical acceptance or native execution. These fixes require adoption by a future separately reviewed campaign before any live claim. No runtime approval is requested by this report. M02 remains incomplete; T3 and final M02 qualification remain gated on accepted actual T2 success.
