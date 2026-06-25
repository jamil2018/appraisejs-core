# 05 - Cancellation, Reconnect, and Persistence

## Goal

Prove lifecycle interruption is durable: cancellation blocks progression, reconnect surfaces pending events, and app
restart does not lose review or coordinator state.

## Builds On

- Pass 04 proved normal revision approval and rejection boundaries.

## Validation Scope

- User-visible terminal cancellation.
- Blocked progression after cancellation.
- Pending cancellation on reconnect.
- Restart through new revision or derived plan.
- App restart during plan review and validation review.
- Event redelivery and acknowledgement idempotency.
- Duplicate and expired leases.
- Approved takeover.
- Partial create recovery.
- Atomic compare-and-write.
- Safe sidecar writes.
- Symlink and traversal rejection.

## Suggested Actions

1. Cancel before and after approval gates and attempt forbidden next transitions.
2. Restart the app during review and confirm event/review state survives.
3. Reconnect with same and different coordinator identities.
4. Exercise stale locks, expired leases, and approved takeover.
5. Probe filesystem protections with contained temporary projects.

## Evidence To Capture

- Event sequences before/after reconnect and acknowledgement.
- Lease conflict, expiry, reconnect, and takeover responses.
- Tests for traversal/symlink rejection and compare-and-write conflict behavior.

## Exit Criteria

- No cancelled, stale, or mismatched coordinator can progress silently.
- Next pass may begin validation preparation from a clean approved plan.
