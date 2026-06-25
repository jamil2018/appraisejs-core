# 02 - Plan Creation, Discovery, and Review-Ready

## Goal

Prove a normal user request can produce a structured AppraiseJS plan that becomes discoverable only after durable
review-ready evidence exists.

## Builds On

- Pass 01 confirmed setup, identity, auth, project binding, and endpoint health.

## Validation Scope

- `plan_create` through real coordinator/API/MCP path.
- Stable browser URL and `appraise://plans/{planId}` link.
- `plan_review_ready` event timing.
- Content hash and revision returned with review evidence.
- Projection sync and plan list/dashboard discovery.
- Discovery of pending, stale, conflicted, awaiting-review, approved, cancelled, and completed plans.

## Suggested Actions

1. Create a small but realistic plan through MCP/API, not by writing only local files.
2. Wait for `plan_review_ready` before presenting or asserting the review URL.
3. Open the direct review route and the plan list/dashboard.
4. Seed or produce representative lifecycle/projection states for list discovery.
5. Add missing unit, API, or Playwright coverage for link parity and review-ready timing.

## Evidence To Capture

- Plan ID, revision, content hash, review URL, appraise URI, and event sequence.
- Browser evidence that the plan is reachable directly and discoverable from the UI.
- Test names proving stale/conflicted/status display behavior.

## Exit Criteria

- A created plan is visible in AppraiseJS after `plan_review_ready`.
- Direct link and list/dashboard discovery agree on plan identity and status.
- Next pass may validate the review UI itself.
