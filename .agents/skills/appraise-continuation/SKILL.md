---
name: appraise-continuation
description: Reconnect an AppraiseJS coordinator safely after interruption.
---

# Appraise Continuation

AppraiseJS owns lifecycle and business rules. This skill restores orchestration state only.

1. Read pending events before registration or resumed work.
2. Stop immediately when a pending cancellation is returned.
3. Reconnect with the stable coordinator identity and prior connection ID.
4. Never request takeover unless the user explicitly approved it.
5. Acknowledge handled events, then reread status and the returned `appraise://` links.
6. Do not implement while approval is pending.

Warn clearly about non-Git projects, dirty artifacts, reduced reproducibility, and coordinator takeover.
