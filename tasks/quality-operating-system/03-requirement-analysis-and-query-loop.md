# Slice 03: Requirement Analysis And Query Loop

Replace the passive requirement projection with host-agent-authored, Appraise-validated analysis revisions. Keep
supplied facts separate from inferences and assumptions, require provenance, expose blocking queries, and bind user
approval to the exact analysis hash.

Acceptance:

- MCP and UI support prepare, propose, read, query resolution, and approve/reject operations.
- Unsupported inference, missing provenance, source gaps, contradictions, and blocking queries prevent approval.
- Changed analysis or answers create a successor revision and invalidate downstream unpublished artifacts.
