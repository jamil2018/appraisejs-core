# M06 corrective native cancellation candidate 11

**CANDIDATE_COMPILE_UNVERIFIED.** Full additive patch from frozen Codex revision `4ebc485ca321243727539187169425fcf972f2c4`, governed by independently accepted [correction plan 11](../m06-native-correction-plan-11.md). Candidate10, patch10, its preparer/tests and all prior receipts are preserved. Apply11 to the original source, never to candidate10.

The existing post-acquisition sampling loop moves once into `consume_sampling_response`, used by production and in-memory Rust fixtures. One ordinary phase encloses telemetry, TTFT and the complete response match; another covers post-loop flush/tool/token/diff work. Cancellation-first polling and a post-ready check guard each directly awaited ordinary operation. The phase's lexical scope ends before cleanup borrows the original stream. Loop Continue/Break behavior remains explicit; steering retains its existing Drain path.

Terminal accounting belongs to a private owner outside those droppable phases. It constructs one pinned real future, owns bounded response/usage fields and cloned session/context Arcs, and tracks Empty → NotStarted → Running → Completed or Interrupted. Normal Completed calls the existing response-ledger and Sampling accounting methods once, then permits ordinary completion analytics/flush/RawResponseCompleted emission. Incomplete calls the existing incomplete-usage method once and preserves the original error. Accounting completion is recorded before checking a simultaneously ready cancellation.

Cancellation synchronously consumes/sends the original Cancel before any cleanup await. Original stream drain and the **same** pinned accounting future run under the first captured 100 ms cleanup deadline; late drain usage gets only the remaining time. Neither pending owner releases the other early. A duplicate/conflicting terminal cannot reconstruct a job. Deadline or outer-owner loss marks unfinished local accounting Interrupted/UNKNOWN, preserves already applied partial ledger/spending and drops unfinished work without replay/refund. This is process-local ownership, not durable exactly-once recovery or provider finality.

Rust source fixtures drive the same consumer and real session methods. They cover TTFT-lock cancellation after a delta is consumed, an actual turn-item contributor await, simultaneous readiness, both real accounting paths gated after aggregate mutation, Cancel before releasing that usage gate, once-only totals/contributor calls, post-ready accounting cancellation, fixed deadline interruption including late drain usage, duplicate/conflicting terminal, normal output/error semantics, blocked reads, missing/failed sender, post-loop cancellation and steering. The timing source adds only a minimal `#[cfg(test)]` opaque lock accessor. Client-common cancellation coverage is retained.

**Rust compilation, tests and rustfmt remain UNEXECUTED.** Required tools and dependency caches are unavailable; no compiler/native executable was invoked and no tooling/dependencies were installed/fetched. Node preparation/source checks prove applicability and hashes only.

## Offline checks and preparation

```sh
node --test scripts/tests/m06-native-patch-10.test.mjs scripts/tests/m06-native-patch-11.test.mjs
node scripts/m06-native-patch-11.mjs \
  --source /private/tmp/m06-q0-installed-source \
  --destination /private/tmp/m06-native-candidate-11 \
  --receipt /private/tmp/appraise-m06-native-wiring-11/.appraisejs/m06-native-patch-preparation-11.json
```

Wrapper11 only selects bundle11 and calls unchanged `prepareNativePatch` exported by script10. It preserves exact revision/tree/tracked-byte/mode checks, exact no-offset/no-fuzz application, new-destination consumption, failed-copy preservation and all symlink refusals except the independently accepted exact pinned LICENSE → COPYING copy-as-link tuple. The manifest binds full original preimages, corrected postimages, five changed paths/modes, patch digest and compile-unverified status. Node test copies and receipts remain in fresh system temporary directories.

This correction governs the owned consumer's cooperative resume/dispatch boundaries. Dropping a future cannot undo already emitted events, synchronous actions or internal/transitive/detached effects. Pre-stream acquisition remains unchanged; the original outer 100 ms task abort can truncate cleanup sooner. None of these local states provides a global physical-I/O barrier, provider/descendant finality, HTTP cancellation qualification, native source/custody authority or full-range readiness. Native allocations/qualification/lifecycle/shipping remain unavailable.
