---
name: appraise-planning
description: Create and revise an AppraiseJS plan through MCP while preserving human review gates.
---

# Appraise Planning

AppraiseJS owns lifecycle and business rules. This skill only orchestrates MCP calls and user communication.

1. Run the MCP project diagnostic and stop on failure. Never silently fall back to CLI.
2. Create the structured plan, then wait for `plan_review_ready`.
3. Read pending events at every mandatory checkpoint.
4. Present the returned `appraise://` plan link and content hash as evidence.
5. Revise only against the current returned hash.
6. Do not implement while approval is pending.

Never write plan artifacts or SQLite directly. Do not claim approval from chat text.
