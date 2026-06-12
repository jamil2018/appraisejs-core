---
name: appraise-continuation
description: Reconnect an AppraiseJS coordinator safely after interruption.
---

# Appraise Continuation

AppraiseJS owns lifecycle and business rules. This skill restores orchestration state only.

1. Call MCP `project_diagnostic` and stop on blocking checks without silently falling back to CLI.
2. Read pending events before registration or resumed work.
3. Stop immediately when a pending cancellation is returned.
4. Reconnect with the stable coordinator identity and prior connection ID.
5. Never request takeover unless the user explicitly approved it.
6. Acknowledge handled events, then reread status, revision, lifecycle, hash, and returned `appraise://` links.
7. Do not implement while approval is pending.

Warn clearly about non-Git projects, dirty artifacts, reduced reproducibility, and coordinator takeover.
