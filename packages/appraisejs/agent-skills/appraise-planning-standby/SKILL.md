---
name: appraise-planning-standby
description: Plan projects through AppraiseJS, publish review-ready links, and remain in standby for Appraise-owned approval events.
---

# Appraise Planning Standby

This packaged compatibility skill is a router, not a second lifecycle specification.

1. Read `appraise://agent-guide` and `appraise://workflow/planning`. If native MCP tools are missing, follow
   `appraisejs agent setup`, restart or reconnect, and stop if discovery still fails.
2. Use project discovery to produce a bound target and unchanged brief. Discovery may call `project_diagnostic` and
   `project_add`; it must not author fallback tasks.
3. Author the complete task graph in the connected agent and submit it through `planning_session_create`. Appraise
   validates and gates the graph but never infers product tasks.
4. Follow the planning workflow resource for review-ready URL handoff, bounded approval standby, revision, and
   cancellation. No wait call before complete URL handoff; chat approval is not Appraise approval.
5. On exact plan approval, hand off to `appraise://workflow/validation-preparation`. Do not duplicate validation,
   baseline, implementation, or completion sequences in this skill.
