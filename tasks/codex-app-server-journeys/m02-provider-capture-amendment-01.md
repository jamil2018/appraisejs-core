# M02 R9 provider capture amendment 01

Date: 2026-10-16. Additive R9-Q1 amendment to [repair record 04](m02-startup-repair-record-04.md), before R9 source freeze or native invocation. Preserve record 04 and all older accepted bytes. This introduces a concrete current-release compatibility correction alongside its diagnostic repair; all p6 limits and prohibitions stay unchanged.

## New primary-source evidence

Public unauthenticated HTTPS resolved `openai/codex` tag `rust-v0.163.0-alpha.10.2` through annotated object `d9151c94a70013f176ff370fa93da02734662e41` to immutable commit `4ebc485ca321243727539187169425fcf972f2c4`. Five source files and hashes are retained under `.appraisejs/m02-codex-source-reference-20261016-01/`; `source-pin.json` SHA-256 `1670f4324cd9ffe59f202aa3531e0a3d515b2805d879982c6acca3a442c9e667`. No upstream tests or runtime were executed; source/version correspondence does not attest the complete installed binary's build provenance.

At client.rs:980, Lite nonempty tools serialize an AdditionalTools item with `id:Some(ResponseItemId::with_suffix("at", Uuid::new_v5(...)))`. models.rs:1028 defines its optional id. response_item_id.rs defines a serde-transparent String wrapper and formats prefix_suffix; models.rs:2761 checks at_test. Thus this producer emits a JSON string ID with at_ plus a canonical UUIDv5. The frozen collector's recognized Lite envelope excludes id (`native-descriptor-capture.ts:341`), deterministically rejecting this source-produced shape. P5 retained no body: this is a proven compatibility gap, not proof of its actual failure cause.

Open Design and t3code were consulted first for integration architecture; neither pinned copy defines this provider serialization. This narrower official producer source supplies the missing contract detail.

## Exact additive correction

Create a fixture-only collector MJS variant copied from the exact pinned compiled collector, with recorded original SHA and a deterministic diff assertion. Preserve the original product source/dist and every accepted collector/mapper artifact. Ownership extends only to new R9 fixture files and provenance, not production code.

Only the recognized `type:additional_tools` branch may accept an optional id. Require exactly `^at_[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` (39 characters). Absent id preserves old compatibility. Reject null/nonstring/malformed/oversized IDs and id in the legacy inline branch or other unrecognized locations. This is a conservative source-produced subset, not support for every possible ResponseItemId.

Retain the id in full container metadata and its container hash/metadata byte accounting; never strip it before asserting full capture. It is retained only as response-item metadata; it grants no readiness, thread/session authority, permission or tool authority. Request-byte hashing remains over original bytes; descriptor/callable hashes and every other validator/limit remain unchanged. Exact code delta is only the typed-Lite allowed key, validation and retained metadata (plus explicit version/provenance if needed); no unrelated unknown field/type/schema relaxation.

R9's normal CAPTURED path uses this explicitly pinned variant rather than the frozen collector. The separate UNINTERPRETED diagnostic remains fallback only for INCOMPLETE, explicitly NOT_ROUTABLE, and recognizes the same typed optional id without broader container tolerance. No runtime fallback to another collector or another request. Later mapping must explicitly support the current full-container contract; older mapping is not retroactively qualified.

Tests must show the pinned source-produced envelope rejected by the unchanged collector and accepted/retained by R9; old absent-ID and inline forms unchanged; invalid/misplaced IDs rejected; container hash sensitive to ID, callable hash unchanged; original request hash retained; bounds/duplicate/prototype/sensitive and diagnostic-no-promotion checks; exact copied-module delta; full inert T1 with timestamped notifications and typed Lite id. Pin the new collector, provenance and public source evidence in the exact manifest before review.

The read-only solver accepted this bounded correction after the serializer definition was checked. One fresh p6 can proceed only after all offline checks and independent exact artifact/command review; p5 is never resent. No auth, real inference, grants, helper expansion, commits, push, automatic p7 or M03+. UNKNOWN history, M00, GC3 and 3/3 real-inference exhaustion retain their recorded meanings.
