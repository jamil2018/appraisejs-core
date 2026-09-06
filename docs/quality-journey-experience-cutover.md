# Quality Journey Authority Cutover

The Control navigation contains Dashboard followed by Quality Journeys. Quality Journey is the sole user-facing and
agent-enabled quality workflow.

The Quality Journeys entry card is a progressive pre-analysis interview. Appraise requires an objective, coverage
rigor, one or more test dimensions, included scope, a registered environment, and desired evidence before showing a
read-only confirmation. Optional context, exclusions, actors, test data, risks, and constraints become binding intent.
Inline environment registration completes before confirmation; no Journey or draft record is created until the user
selects **Confirm and create Journey**.

At the analysis stage, **Start requirement analysis** prepares a one-time handoff and opens Codex in the registered
local workspace. The same prompt remains copyable when Codex is unavailable. It tells Codex to redeem through
Appraise MCP, reread canonical state, use harness-native agents, and stop at Appraise-owned human gates. Claude Code
and Cursor adapters are deferred.

The unreleased Quality Plan and Assessment experiences were deleted without redirects, compatibility pages, data
conversion, exporters, or deprecated aliases. Historical development plans remain archival documents only and are
not current product contracts.

Existing development databases that applied the removed August 2026 migration chain must be reset. The consolidated
Journey migration supports fresh databases and rehearsal from the last retained July schema; it intentionally does
not preserve removed-domain rows.

Independent Test Runs remain in the Execution area as non-authoritative diagnostics. Their reports and logs help
debug authored automation, but only sealed Journey evidence and Journey review/closure records establish quality
outcomes.
