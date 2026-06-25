# 04 - User Authority and Revision Loop

## Goal

Prove users retain authority over remarks and exact revision approval, and that agents cannot progress from stale or
blocked review state.

## Builds On

- Pass 03 proved the review UI is usable and equivalent across graph/list surfaces.

## Validation Scope

- Users create blocking and non-blocking remarks.
- Users resolve, dismiss, and downgrade remarks.
- Agents address or dispute remarks without closing user authority.
- Unresolved blocking remarks prevent progression.
- Stale displayed revision rejection.
- Higher revision enforcement.
- Revision diff display.
- Orphaned remarks after node removal.
- Suspicious node replacement handling.
- Exact current hash-bound revision approval.

## Suggested Actions

1. Create remarks against both plan-level and task-level targets.
2. Attempt approval with unresolved blocking remarks and stale displayed revision.
3. Revise the plan with a higher revision and changed content hash.
4. Validate revision diffs and remark carry-forward behavior.
5. Test exact approval through service, UI action, internal API, MCP/CLI where applicable.

## Evidence To Capture

- Before/after review artifacts with threads and approval records.
- Rejection responses for stale revision, blocking remark, conflicted projection, and suspicious replacement.
- Test coverage showing exact revision/hash approval and UI action payload.

## Exit Criteria

- Approval is impossible without current revision, current hash, and no unresolved blocking review state.
- Next pass may test cancellation, reconnect, and persisted event behavior around approved or interrupted plans.
