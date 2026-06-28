# Session 02: Storage, Projection, and Sync

## Goal

Store canonical Git-tracked artifacts safely, project them into SQLite, and reconcile Git or filesystem state without
allowing stale writes or data loss.

## Work

1. Resolve `appraise/plans` from the real project root and prevent traversal or symlink escape.
2. Add atomic create/read/list/compare-and-write operations and per-plan locks.
3. Add Prisma projection and coordination models, preserving existing `TestRun` records with nullable links.
4. Add read-through `sync-plans`, pending counts, Settings integration, and `sync-all` integration.
5. Record Git baseline commit, dirty-file hashes, and a lower-assurance filesystem snapshot fallback.
6. Detect artifact deletion, invalid files, merge conflicts, stale projections, and external history tampering.

## Required Rules

- YAML and sidecars are canonical portable state; projection code never writes them.
- Projection upserts stable children rather than deleting and recreating them.
- Last valid projection remains visible as stale when current artifacts are invalid.
- Conflicted artifacts disable approval and agent progression.
- Git-backed projects keep lightweight revision metadata; non-Git projects retain complete local snapshots.
- Existing dirty worktree changes are preserved and distinguished from later agent changes.

## Likely Areas

- `prisma/schema.prisma` and migration
- New artifact repository and projection services
- `src/lib/sync/*`, Settings sync UI, pending counts
- Project-root and Git/snapshot helpers

## Acceptance Criteria

- Atomic-write, stale-hash, lock recovery, symlink, Windows path, and partial-failure tests pass.
- Create, update, delete, malformed, mixed-validity, conflict, and idempotent sync cases pass.
- Plan deletion never deletes linked test runs or reports.
- Non-Git mode displays persistent reduced-assurance state.

## Handoff

Document repository APIs, projection transaction boundaries, snapshot format, and sync error behavior. Run focused
Prisma validation/generation and sync tests.
