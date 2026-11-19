# A4 — Sanitized measurement receipt design

Status: synthetic design validated; no product instrumentation implemented.
[Schema](measurement-design.schema.json), [samples](measurement-synthetic-samples.json) and
[aggregation](measurement-synthetic-aggregation.json) are design artifacts only.

The schema accepts only `SYNTHETIC_DESIGN_VALIDATION`, strict keys, bounded identifiers and hash-only tuple fields.
It cannot be used as a native qualification or authorization receipt. It has no prompt, model prose, auth token,
account identity, filesystem path, raw environment or arbitrary metadata field. Tokens and cost are null and
UNQUALIFIED, never inferred as zero. A future real-observation schema/collector needs a separate reviewed implementation.

Phase boundaries are queue eligibility→dispatch selection; initialize/MCP start→ready/refused; send admission→write;
write→canonical accepted artifact; human decision requested→committed exact answer/approval; and cleanup start→observed
original cleanup outcome. Human wait is not dispatch or accepted-artifact latency. Cleanup and acceptance never prove
physical provider reconciliation.

Each phase uses one monotonic clock domain and nonnegative endpoints. End before start rejects.
Cross-process/restarted domains do not produce an elapsed latency: report null/UNQUALIFIED until a separately reviewed
wall-clock/correlation design establishes a defensible interval. Do not subtract unrelated clocks.
Accepted-artifact latency is queue start to canonical acceptance end only when those domains agree; no acceptance
means null. Retain failed and UNKNOWN attempts in denominators and report correction attempts separately.

Cold/warm classifications must declare actual cache/process conditions; do not clear shared caches or silently reuse
a persistent child. These samples merely declare synthetic cache classes and are not a comparative benchmark.
Human-wait dispatch count zero is a synthetic test predicate, not a newly measured production guarantee.

Validation: two samples; six invalid cases reject secret-shaped extra data, invented zero usage, a native-observation
label, dispatch during wait, negative timing and accepted-artifact/outcome inconsistency. A cross-clock example yields
null latency. Synthetic aggregation: 2 attempts, 1 accepted artifact, 1 UNKNOWN correction, 0 failed outcomes,
accepted latency [65] ms and human wait 4,000 ms. **None is a real model, billing, host or human measurement.**
One initial validation invocation had an incorrect local Ajv import path; its failed log is preserved. Using the
existing installed dependency fixed the validation without installation or product changes.
