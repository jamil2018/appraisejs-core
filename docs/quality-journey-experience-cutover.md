# Quality Journey Authority Cutover

The Control navigation contains Dashboard followed by Quality Journeys. Quality Journey is the sole user-facing and
agent-enabled quality workflow.

The Quality Journeys list links to a dedicated four-part guided brief: Goal, Scope and success, Checks, and Test
location, followed by review. Appraise requires an objective, coverage rigor, one or more types of checks, included
scope, a registered environment, and observable success evidence before confirmation. Optional context, exclusions,
actors, test data, risks, and constraints remain available without crowding the primary path.

The first meaningful edit creates a project-scoped workspace draft. Drafts autosave with optimistic versioning, may
be resumed from another browser connected to the same workspace, and can be archived or restored. A draft creates no
Journey events, work items, or AI activity. **Confirm and create Journey** consumes the exact saved version and hash
in one transaction; success creates and submits the immutable brief and marks the draft confirmed, while failure
rolls the entire conversion back. Exact retries return the same Journey. Existing Journeys offer **Copy brief** to
start an unlinked draft; follow-up lineage remains an explicit separate action.

At the analysis stage, **Start requirement analysis** prepares a one-time handoff and opens Codex in the registered
local workspace. Ready, opening, waiting-for-connection, connected, and observed worker progress remain distinct.
The paste/send instruction and copy/manual-open recovery stay visible until the durable handoff state advances. The
prompt tells Codex to redeem through Appraise MCP, reread canonical state, use harness-native agents, and stop at
Appraise-owned human gates. Claude Code and Cursor adapters are deferred.

The default Journey page groups the eleven canonical lifecycle stages into six user-facing stages: **Your brief →
Test approach → Test scenarios → Test preparation → Run tests → Results**. The next-action card prioritizes blockers,
questions, review or permission decisions, setup/start actions, and then observed progress. Canonical identities and
receipts remain copyable under technical details. A compact project-scoped observer checks for newer durable state
every ten seconds while visible, without replacing edit buffers or rebinding exact-version decisions.

The unreleased Quality Plan and Assessment experiences were deleted without redirects, compatibility pages, data
conversion, exporters, or deprecated aliases. Historical development plans remain archival documents only and are
not current product contracts.

Existing development databases that applied the removed August 2026 migration chain must be reset. The consolidated
Journey migration supports fresh databases and rehearsal from the last retained July schema; it intentionally does
not preserve removed-domain rows.

Independent Test Runs remain in the Execution area as non-authoritative diagnostics. Their reports and logs help
debug authored automation, but only sealed Journey evidence and Journey review/closure records establish quality
outcomes.
