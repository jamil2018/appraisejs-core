# Session 03: Plan Review and Visualizer

## Goal

Deliver the human review surface: stable plan URL, graph and accessible list, node/plan-wide remarks, exact-revision
approval, revision comparison, and personal/shared layouts.

## Work

1. Add plan query services and thin server actions.
2. Add `/plans` and `/plans/[planId]` with artifact health, lifecycle, owner, events, and evidence summaries.
3. Derive graph nodes and typed edges from canonical plan data; provide an equivalent list view.
4. Add append-only node and plan-wide remark threads with blocking classification.
5. Add addressed/disputed/resolved/dismissed flows and combined resolve-and-approve.
6. Add stale approval rejection, revision diff, orphaned remark retargeting, and suspicious replacement confirmation.
7. Add personal layouts and explicit Git-tracked shared-layout publication.

## Required Rules

- Humans never directly edit plan structure.
- Review controls work identically in graph and list views.
- The stable URL may show processing, but review is enabled only when graph or list representation is ready.
- Repeated graph failure enables list review rather than invalidating the plan.
- Layout changes never alter plan revision or approval hashes.
- Shared layout publication writes only; AppraiseJS never commits or pushes.

## Acceptance Criteria

- Remarks follow stable node IDs; removed-node remarks become visible and blocking.
- Non-blocking remarks do not prevent approval.
- Approval cannot apply to content newer than the displayed revision.
- Graph processing timeout, retry, stale worker, and list fallback are covered.
- Keyboard, screen-reader, and non-color status behavior is tested.

## Handoff

Provide the route map, review action contracts, graph readiness event expectations, and screenshots or browser QA
notes. Do not add plan mutation controls.
