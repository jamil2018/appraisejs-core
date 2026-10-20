# M02 T1 startup observability observation

Date: 2026-10-16. Advisory only; no routing, model, permission, concurrency or gate policy changed.

The R5 offline suite passed 17 checks, but its single native invocation stopped UNKNOWN after initialize and before a thread reservation. The generic `ambiguous-effect` category preserved uncertainty while losing the distinction between unsupported startup notification, EOF/exit and pre-send failure. Its stop receipt also did not establish child exit. These are evidence limits, not proof of which cause occurred.

A bounded read of the pinned Open Design implementation and tests identified notification compatibility and startup sequencing differences. Four schema-valid MCP startup status notifications independently reproduced R5's fence in memory, without another native attempt. Deterministic reproduction supplied a narrower finding than another speculative runtime start. Existing source and historical evidence were preserved; exact-artifact review did not establish live compatibility.

Proposed improvement: retain safe fixed failure categories and owned exit/close observations, add in-memory startup-order fixtures and promptly archive sanitized journal/receipt bytes outside disposable roots. Classify known benign notifications separately from authority-bearing requests; keep required-MCP failures blocking. This proposal does not authorize a retry, broaden a role or change accepted runtime limits. See the [source-backed investigation](../../tasks/codex-app-server-journeys/m02-open-design-startup-findings-01.md). The existing full-task approval already covers ordinary preparation and review; artifact revisions alone are not a reason to repeat chat approval requests.
