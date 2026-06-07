# Session 04: Coordinator Events, API, and MCP

## Goal

Connect one stable coordinator agent to AppraiseJS through authenticated local APIs and a durable MCP bridge.

## Work

1. Add project-local identity, token, project fingerprint, request limits, and localhost protections.
2. Add agent registration, heartbeat lease, reconnect, expiry, and user-approved takeover.
3. Add a monotonic per-plan durable event outbox with at-least-once delivery and idempotent acknowledgement.
4. Add thin internal API routes over shared application services.
5. Add `appraisejs mcp` using stdio and the official TypeScript MCP SDK.
6. Add plan resources and tools for create, read, review waiting, revision, start, task updates, event reads, and
   acknowledgement.

## Required Rules

- One coordinator owns a plan; subagents do not connect directly in 0.5.
- Reading or delivering an event does not acknowledge it.
- Approval is acknowledged only after the permitted next transition succeeds.
- Cancellation supersedes earlier unacknowledged progression events.
- New blocking feedback invalidates an unstarted approval.
- MCP failure never silently invokes CLI.
- The coordinator receives `plan_review_ready` before presenting the stable URL.

## Acceptance Criteria

- Duplicate connection, reconnect, takeover, expiry, redelivery, ordering, and idempotency tests pass.
- Wrong token/project, DNS-rebinding origin, oversized request, and long-poll cancellation tests pass.
- MCP stdout contains protocol traffic only; diagnostics use stderr.
- Architectural tests prevent MCP/API adapters from accessing Prisma, repositories, or lifecycle tables directly.

## Handoff

Publish API/MCP contracts, event types and precedence, lease defaults, and recovery behavior. Include a local smoke test
that creates a plan and receives its review-ready event.
