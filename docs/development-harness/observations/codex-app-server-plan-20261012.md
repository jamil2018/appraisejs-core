# Codex app-server migration planning observation

Advisory observation only; no harness policy or product gate changed. Two disjoint read-only investigations covered
runtime authority and UI/MCP surfaces, followed by a bounded solver and independent plan review. Existing dirty
handoff and qualification changes were preserved. The planning deliverable lives in
[tasks/codex-app-server-journeys](../../../tasks/codex-app-server-journeys/plan.md).

The review found reusable structured human controls and external role admission, but no production app-server
supervisor. Desktop handoff-bound session checks and broad MCP human-decision operations need explicit treatment in
a managed adapter. Historical exact-schema/provider-interlock failures are qualification inputs, not evidence that a
new MCP composition passed or failed. This is a useful distinction for future architecture reviews.

The initial routing receipt selected an investigator and recorded default low consequence; it is not an accurate
count of the two evidence lanes or the subsequent solver/judge stages. Actual delegation is described here instead
of silently rewriting the immutable receipt. Requested named roles and no-inherited-transcript options were used;
effective model, context and sandbox enforcement remain unverified. No policy change is proposed from this single
planning run. Future routing receipts should record explicit consequence and staged review scope at intake.

Independent review found that the initial opt-in milestone preceded core pause/restart recovery. The plan was revised
to keep early Analysis work disposable/internal and require recovery qualification before any user-facing opt-in.
The reviewer also requested explicit durable execution-mode selection at Journey creation. Both fixes are planning
requirements, not implemented behavior. Feature flags do not reduce the need for lifecycle recovery guarantees.
A second review caught blanket external-mode backfill despite retained MANAGED attempts. The revised plan preserves
legacy effective bindings and makes mixed/unknown ownership recovery-required, with explicit migration fixtures.
