# R23 continuation investigation 01 — offline only

2026-10-17. Branch `codex/journey-app-server-migration`, HEAD `98b531d6`. Additive investigation; no successor campaign, preparation, runtime authorization or correction to the accepted R23 bytes. R23 remains consumed UNKNOWN at B01, actual T2 completed 0, T3 and M02 incomplete. GC3 REVISE / not passed; real inference exhausted 3/3.

## Evidence ledger

Confirmed:

- Actual R23 precheck passed. Runtime ACKed provider request 1 and outer call 1, then fenced AMBIGUOUS_EFFECT with provider request 2 pending. Sanitized failure is CONTINUATION_DECODER / TRUSTED_GATE_REFUSAL. Exact rejected predicate and native output remain UNKNOWN. Owned-stop observation and MCP exit 0 do not qualify whole-process cleanup.
- The R23 session uses its own cumulative transcript validator and imports the real R10 codec and finite buffered producer. The producer catches decoder exceptions and returns PRODUCER_ERROR, losing the specific predicate. The last stage marker is shared by producer shape/size checks, private audit projection and codec validation. The actual stage cannot distinguish these causes.
- The original composed external peer returned `{content: [], structuredContent: {offline: true}, isError: false}`. Its data was invented. The new investigation stages the exact frozen canonical bundle using real `stageMatrixModules`, constructs its real bridge endpoint and six role catalogs, then runs real SDK in-memory calls and JSON serialization for every frozen role read. Only the canonical bridge/database effects and transport peers are synthetic. No database is opened.
- The accepted native predecessor verifier still refuses consumed p9. An explicitly test-only `verifyPrior({requireNewRootAbsent:false})` seam permits evidence reading without changing that verifier. The composed harness redirects the runtime filesystem to fresh disposable test directories, uses serialized mock review/decision inputs, and guards external effects. It is not a reusable R23 command or authority.

Hypotheses, not attribution:

- A failed/yielded/terminated output, output shape discrepancy, incomplete audit, envelope mismatch or nested result mismatch could reach the same broad stage. Synthetic reproductions demonstrate indistinguishable diagnostics, not which occurred in R23.
- Actual zero audit requests is compatible with failure before scoped dispatch. The retained evidence does not establish why the script failed to dispatch or whether a different continuation predicate was reached.

Unknown:

- Actual R23 native result, exact producer/audit/codec rejection, JS `text()` aggregation, actual installed binary/source correspondence, actual SDK/SQLite behavior and complete lifetime/cleanup.
- R21's precise failure remains UNKNOWN and is not reattributed.

Acceptance conditions:

- Preserve every predecessor byte, current hash, exact 23 TA04 archive witnesses and TA05 package qualification; keep tuple and correlation gates fail-closed.
- Exercise all 24 cases through the real fixed-manifest serialization, receipt reader, entrypoint, runner, launcher, adapter and codec. Keep actual native completions separate from simulated completion.
- Preserve UNKNOWN and pending reservations on synthetic continuation failures. Cover existing missing-ACK, refusal, deadline and cleanup fences.
- Obtain one focused exact-artifact review of this bounded offline harness and diagnostic proposal after checks pass. No runtime compatibility claim follows.

## Path trace

1. `dispatchMatrixEntrypoint` verifies invocation, generated manifest, serialized review/decision, host file and predecessor correlation before selecting the runner.
2. `runPreparedT2Matrix` creates the durable journal, stages the exact canonical bundle/dependencies and starts the launcher with a case audit session.
3. The launcher correlates provider requests with its owned thread/turn and journal, then passes exact body bytes and a trusted stage callback to R23 `script-session.mjs`.
4. `validateIssuedTranscript` checks every included issued tool call/output, ordered call IDs, unchanged script and prior output hashes. It requires exactly the current continuation; omitted older history is permitted. It does not decode the header or nested result.
5. The session projects only the current output into `FiniteBufferedResponses.next`. This producer checks exact continuation keys/call ID, duplicate use and 64 KiB output ceiling before invoking its decoder callback. Any exception becomes PRODUCER_ERROR and fences the finite producer.
6. The callback verifies current output identity, observes registry absence where planned, and projects a completed single scoped audit through private `codecAudit`. Missing audit or pending dispatch can refuse here before R10 executes.
7. R10 enforces a previously issued unchanged plan, exactly two text items, completion header, bounded exact envelope and call/case/index/operation correlation. For dispatched calls it compares the envelope result against the scoped audit result with only top-level `_meta` removed. Nested metadata and all other result fields still participate.
8. Only a successful decode permits audit completion, prior-output hash retention, next outer reservation and durable response receipt. HTTP finish precedes response ACK. Canonical acceptance reconciliation, child exit/close and host/listener cleanup are separate final gates.

## Pinned source, not installed compatibility

Public revision `4ebc485ca321243727539187169425fcf972f2c4` is recorded in `.appraisejs/m02-code-mode-codec-reference-20261016-01/source-pin.json`. Cached `core_code_mode_output.rs` SHA-256 `071a30e1811bb43939e59f910c180b5377e9aa2f99f5e2bc658032bf1d319c77` and `protocol_models.rs` SHA-256 `df9a3da250376d86203a8a1219b2e4b5353a62274d094bb36998560433bd58eb` match the pin.

`core_code_mode_output.rs:19–38,51–67` produces the simple one-decimal or measured three-decimal header, including potentially negative overhead. Both match R10's successful header regex. `core_code_mode_mod.rs:302–315` distinguishes Script completed, Script failed, Script running with cell ID and Script terminated. Only completion is accepted intentionally. No confirmed successful-header mismatch was found.

`protocol_models.rs:1191–1204,2206–2229,2287–2302` supports optional output name/id, tagged text/image/audio/encrypted items and string-or-content-array output. R10 deliberately accepts the narrower text-only generated script contract. Broader upstream schema does not authorize relaxing it. Cached files do not establish native JS text aggregation. The pinned `tool_output.rs` `_meta` projection is recorded in `CODEC_SOURCE` and prior source-read evidence; it was not newly fetched or recaptured here.

Cached `code_mode_response_adapter.rs:11–15,29–49` maps content items one-for-one. `core_tools_context.rs:273–281,298–300` preserves the vector. `core_code_mode_mod.rs:276–299,318–334` converts and truncates it before wrapping; `output_truncation_lib.rs:107–161` preserves under-budget text but may join/replace over-budget text. Conditional on one under-budget runtime text item, the source path yields one payload plus one header. The runtime accumulator implementing `text()` and the nested `code_mode_result` implementation remain outside the inspected cache. The normal MCP projection at `protocol_models.rs:2390–2449` can prefer structured content, but it is a different path and does not justify changing the nested-envelope comparison.

Pinned Open Design `session.ts:240–249,361–371` illustrates explicit request input and rejecting unsupported server requests. Pinned t3code `client.ts:208–230` illustrates request/response/notification schema boundaries. These are architecture patterns only; neither verifies Code Mode framing compatibility.

## Bounded diagnostic proposal

There is insufficient evidence for an acceptance-policy correction. New `diagnostic.mjs` is an **offline prototype only**, wrapping the unchanged real R10 decoder. It emits only fixed component/category constants: PLAN, OUTER_CORRELATION, OUTPUT_SHAPE, COMPLETION_HEADER, ENVELOPE, AUDIT, NESTED_RESULT, or OTHER. It rethrows the original refusal, ignores diagnostic callback failures and retains no raw text, stack, provider/account/auth data, output hash or value-derived shape description. It is not wired into any runtime artifact.

A future separately authorized additive offline integration should place a trusted diagnostic callback at the actual finite producer checks, private audit projection and codec catch site, before exceptions collapse to PRODUCER_ERROR. Proposed finite categories are PRODUCER_CONTINUATION_SHAPE, PRODUCER_CALL_CORRELATION, PRODUCER_OUTPUT_CEILING, AUDIT_INCOMPLETE, AUDIT_PLAN_CORRELATION and the fixed R10 categories above; unexpected errors map to OTHER. Bind at most one receipt to the active case/request and journal reservation, using the existing private/no-follow/exclusive/fsync discipline. Diagnostic failure must preserve the original UNKNOWN fence and stop. Do not log remote text or infer error causes from provider-controlled strings. This integration needs composed tests of the actual new callback-to-durable-receipt path before a native diagnostic request can be reviewed.

**Not runtime-ready.** No new manifest, campaign root, runtime command, request or decision is prepared. Exact native observation is still missing, and the prototype is not a durable runtime diagnostic. No R24/T3 or retry/resume is authorized.

R23 consumption remains listener 1, Codex 1, MCP 1, thread 1, turn 1, provider requests 2, control writes 3, canonical requests 2, outer calls 1, source capacity 4. Historical ceilings remain historical, not unused authority. Earlier UNKNOWNs, pending reservations and unresolved cleanup remain. Frozen M00 SHA-256 remains `1e39e733d5211db80705a1c34235d24580db618a9f505e7a16dc163398568133`.

## Execution and verification record

New source is confined to `scripts/tests/fixtures/codex-app-server-m02-ta-r23-investigation-01/` and two new test files. The existing R23 case tests run unchanged. The fixed R23 manifest is read and round-tripped through production `serializeR23Preparation`; preparation is never invoked. Its 6,651 current pins and 23 exact archive witnesses are verified. Staging copies the exact bundle/dependency closure once into a disposable directory; composed scenarios reuse that verified stage while creating their own actual journals, mock receipts and supervisor files. Real per-effect current hash, archive and tuple checks still execute in the unchanged runtime adapter.

The six-role SDK result tests verify production canonical read serialization. Submission acceptance, database behavior, child receipts, host observation and Code Mode output remain simulated; serialized read results are reused as fake external return values for submission steps. These checks cannot qualify native case semantics or cleanup.

Initial test setup attempts exposed bundle module-resolution context and the intended consumed-root refusal. Both were resolved only in new test wiring: real staging and the existing read-only predecessor seam. No predecessor verifier was edited. A stray read-only `ps -p 1` command was inadvertently submitted and denied by the sandbox; no process-inventory result was obtained or used, and no signals or historical cleanup followed.

Graphify dry-run selects scripts/packages; rebuilding is deferred because both graphs have unrelated dirty work and their pinned bytes must be preserved. Full application build is not applicable to this additive offline test/proposal change and could rewrite pinned package outputs. Focused lint, formatting, tests, exact review and before/after preservation evidence are retained separately in the new investigation evidence bundle.

Validation evidence is retained under `.appraisejs/m02-r23-investigation-evidence-01/`; the exact-artifact index binds this report, new source/tests, unchanged R23 case tests and final check outputs. The independent review is recorded separately at `.appraisejs/m02-r23-investigation-exact-review-01.json`. Neither file grants native execution authority.

Final checks: **54/54 passed** with `node --test scripts/tests/codex-app-server-m02-ta-r23-investigation-01.test.mjs scripts/tests/codex-app-server-m02-ta-r23-diagnostic-01.test.mjs scripts/tests/codex-app-server-m02-ta-matrix-r23-cases.test.mjs`. This includes one full 24-case composed run (54 synthetic provider requests), six-role SDK read serialization, seven output/envelope refusals, missing audit, measured negative overhead, 17 serialized receipt mutations, consumed-p9 refusal, response-finish ACK loss and failed cleanup witness. The unchanged case suite supplies cumulative/compact history, missing ACK, refusal, permission denial, required-MCP failure and deadline coverage. A failed-output header and missing-audit trace share the native diagnostic category but are not native attribution. ESLint and Prettier pass all new source/test files and documents. No application build or graph rebuild was run.
