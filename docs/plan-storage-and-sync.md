# Plan Storage and Sync

Canonical plan state lives under `appraise/plans`:

- `<plan-id>.yaml`
- `reviews/<plan-id>.review.yaml`
- `validations/<plan-id>.validation.yaml`
- `layouts/<plan-id>.layout.json`

`PlanArtifactRepository` resolves this directory from the nearest project `package.json`. It rejects traversal,
absolute paths, and symlink escapes. Creates and updates use temporary-file replacement, compare-and-write hashes, and
per-plan lock files. Locks older than the configured stale interval are recoverable.

## Projection Boundary

`syncPlans` reads and validates canonical artifacts, then updates SQLite in one transaction per plan. Projection code
never writes YAML or sidecars. Tasks are upserted by stable `(planProjectionId, taskId)` identity; removed tasks are
deleted only after a valid artifact set is parsed.

Invalid or conflicted files do not replace the last valid projection. Existing projections are marked stale, a
blocking `PlanSyncIssue` is recorded, and conflict state disables later approval or agent progression. A missing plan
artifact removes its projection. Linked `TestRun` records remain and their nullable `planId` is set to null.

## Revisions and Snapshots

Git projects record the current commit plus hashes for dirty files under `appraise/plans`. A recorded commit that is no
longer an ancestor of the current commit creates a blocking history-tampering issue.

Projects without Git store the complete artifact contents in `PlanRevision.snapshotJson` and set
`reducedAssurance=true`. Settings and sync output keep that reduced-assurance state visible.

## Commands and Errors

Run `npm run sync-plans` for plans only or `npm run sync-all` for every registered sync target. Settings uses the same
registry and shows pending plan projections.

Artifact parse failures, plan ID mismatches, merge conflicts, stale writes, lock timeouts, and path escapes are
reported without partially projecting the affected plan. Other valid plans in the same run continue to sync.

Historical projections that predate exact managed Step Invocations remain visible as stale, blocking records. Their
closed legacy validation shape is reported as `legacy-managed-validation`, but it does not fail repository setup when
a last valid projection already exists. New artifacts and progression still fail closed: legacy steps are never
translated into executable authority, and a legacy artifact without an existing projection remains a sync error.
