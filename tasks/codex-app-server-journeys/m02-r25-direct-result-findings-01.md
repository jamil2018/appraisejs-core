# R25 direct result inspection

2026-10-17. Read-only evaluation of the retained R25/p11 run under the user's direction to probe and inspect real results. No new test suite, native invocation, socket, process observation, retry, cleanup or successor was performed. Existing accepted artifacts remain unchanged.

The retained synthetic database contains exactly one external-submission acceptance and one artifact. Direct validation confirmed the acceptance outcome hash, artifact hash, payload hash, acceptance→artifact linkage, Journey/project scope and M02_SYNTHETIC_ACCEPTANCE kind. Only counts and booleans were retained; no raw database rows, identifiers or payloads were copied. The database was opened read-only and immutable, with query_only enabled, and its identity/size/mtime were unchanged afterward.

A bounded read of the sole retained B01 history observed task_started1,task_complete1,turn_aborted0,error0. Both exact B01 output envelopes report completed scripts, text-only MCP content and absent isError flags. Only closed enums/counts were emitted; no raw history, provider/account/auth data or raw-history hash was retained. This is retained-history evidence, not provider-request-byte attestation or OS cleanup proof.

This supplies direct evidence that B01's synthetic native MCP submission committed a valid result. It supersedes the earlier lack of canonical-result evidence, without rewriting the historical UNKNOWN outcome. It does not prove all24 cases, production Journey transitions, parent completion checks or complete cleanup. The exact rejected late completion condition remains unknown. R25 stays consumed UNKNOWN/B01 with zero qualified T2 cases; R23/R24 pending requests and all cleanup UNKNOWN states remain preserved.

Evidence: `.appraisejs/m02-r25-direct-db-count-observation-01.json`, `.appraisejs/m02-r25-direct-canonical-lineage-observation-01.json`, `.appraisejs/m02-r25-direct-history-status-observation-01.json`.

The next experiment should target the completion/lifecycle checks and expose the actual failing condition, using a focused bounded probe rather than another broad mocked suite. No fresh native command or allocation is authorized or prepared by this note.
