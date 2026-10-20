# R31 native result contract correction

This is an additive, unrun T3 source correction. It supplies no T2 acceptance, native compatibility, process-inventory claim or new runtime allocation.

Confirmed public source at Codex commit `4ebc485ca321243727539187169425fcf972f2c4` shows the normal successful `exec_command` path assigning `original_token_count: Some(original_token_count)` even for short untruncated output (`process_manager.rs:670–675,843–862`). The Code Mode serializer forwards that option and omits it only when `None` (`core_tools_context.rs:448–477`). The fixed N01 command does not match the apply-patch interception exception. These statements concern the pinned source contract; installed binary provenance and runtime compatibility remain unqualified.

The inherited N01 decoder allowed only `chunk_id`, `wall_time_seconds`, `exit_code` and `output`, so it would reject that source-conforming success. R31 now also permits and requires a nonnegative safe integer `original_token_count`. It still requires completed exit zero, finite nonnegative wall time, exact owned scratch bytes, exact output and the correlated issued envelope. Unexpected fields, sessions and truncation remain refused. This finding does not attribute any historical R23–R30 failure to N01; those runs did not execute T3.

The new source cache is `.appraisejs/m02-n01-token-count-source-20261017-01/`. Its `source-pin.json` SHA-256 is `f95af60efb6635cd713b940b3e0d00c7caf724693fc0752e959c435ad1ef6691`. All five source blobs have size and Git blob SHA-1 checked against the previously pinned tree; the source-pin and all five files are included in R31's stable SHA-256 source verifier. Source verification passed. Focused ESLint and Prettier passed. No regression test was written or run, and no T3 preparation or native action occurred.

R31 also records a closed session diagnostic `{stage, reason}` on failure, preserving the first refusal and retaining no raw error or provider/account/auth data. N01 result-shape, fields, exit, duration, token-count and output predicates have distinct fixed categories without changing their acceptance conjunction. Runner diagnostics are persisted after the authoritative UNKNOWN fence, attempted owned stop and canonical close. An unknown category remains unknown; it is not a causal explanation.

Full accepted native T2, actual final T3 artifact integration and exact review remain prerequisites. The historical TA03 helper-inventory limitation stays `UNKNOWN_NOT_INDEPENDENTLY_OBSERVED`; no redundant helper-criterion approval is required.
