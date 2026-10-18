# M02 six-role offline SDK profile prerequisite

Date: 2026-10-16 (Asia/Dhaka). Evidence class: **OFFLINE_SDK_TOOLS_LIST**. This is neither an actual native descriptor capture nor a qualified route. Full M02 remains incomplete.

The additive producer `scripts/tests/fixtures/codex-app-server-m02-ta-offline-profiles/collect.mjs` constructs six role-scoped endpoints using the guarded test-root canonical variant, privately staged dependencies, actual SDK client/endpoint bootstrap and profile binding, and SDK `InMemoryTransport` for actual `tools/list`. It opens no OS socket, native child or provider. Two independently created fixture instances per role have different synthetic identities and produce matching role profiles and schemas. Output contains only whitelisted role/catalog/schema/digest/provenance fields; binding values, capabilities, database contents and temporary workspace paths are excluded. Full SDK input schemas are retained, without redaction or semantic truncation.

| Role                   | Listed scoped tools |
| ---------------------- | ------------------: |
| REQUIREMENT_ANALYZER   |                   2 |
| SCOUT                  |                   2 |
| RESOURCE_EXPLORER      |                   3 |
| TEST_SCENARIO_DESIGNER |                   2 |
| AUTOMATOR              |                   2 |
| TRIAGER                |                   3 |

Private evidence: `.appraisejs/m02-ta-offline-sdk-profiles-01/profiles.json`, 363,907 bytes, owned 0600 in a 0700 parent. SHA-256: `b5f29c101620944ff20a6f5ece33757fcc706d717577bc7fe999a504d25bc5c6`.

Provenance:

- Producer SHA-256: `5d6f84c71bbe77380292a60e8bac54b7c877d845666ea6040c8c0166483459ba`.
- SDK package metadata SHA-256: `7ab20eba8fee70f316516b5b3fc45837294caee7e4dd36f2a1593210b0f003ac`.
- Frozen r4 runtime manifest digest: `f43ee23fb2fc1f3c1c68be63b8ca11771f7b59c0d7885456df0f804b8bf284d5`.
- Fixed p2 backend SHA-256: `e21b79aa2be776562572499501574e8550513d316c0821c399a7f005d2499b75`.
- Test-root backend normalizes byte-for-byte to the fixed p2 backend by changing only its root literal. The exact fixed p2 root remains unexecuted.
- Guarded `.env` access attempts: zero. This is JavaScript guard evidence, not OS access attestation.

The two clean-environment focused tests passed, together with affected-file ESLint and Prettier. They verify all six SDK lists against their advertised profiles, stable per-role profiles across distinct synthetic fixtures, exact schemas and hashes, sanitized output shape and absent native qualification. Final independent exact-artifact review is recorded separately. The producer's private output is created exclusively; it must not overwrite this evidence or any accepted artifact.

These profiles can supply the offline SDK side of a later six-role route review. They cannot supply the missing native side. A new successful, separately authorized T1 capture must expose a supported callable/grammar for every proposed role operation. Six route receipts may reuse that single native capture only with substantiated generic-wrapper semantics and independent aggregate review. Direct Analyzer-only native descriptors do not prove other roles' native routes. No T2/T3 starts or native counter consumption, real auth, inference, grants, historical evidence changes, commits or push occurred in this offline collection.
