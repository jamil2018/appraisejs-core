# Coordinator API and MCP

The coordinator exposes Quality Journey lifecycle operations plus general project, environment, runtime, locator,
Step Definition, and project-bound repository collaboration operations. Quality Journey remains the only
Appraise-owned agent quality workflow; repository collaboration has no Journey authority.

Repository collaboration tools use the `collaboration_*` family. Every request names a target that the coordinator
resolves to its own binding; callers never supply a binding ID, repository command, remote/ref override, trusted
principal, or reviewer provenance. Public `collaboration_prepare` accepts only `RECEIVE` and `PUBLISH`. RECEIVE
fetches its operation-owned ref, pins both revisions, and classifies the relationship. Only an Appraise-content-only
divergence creates an internal RECONCILE operation; its isolated proposal worktree is persisted before it can be
claimed. `collaboration_work_complete` accepts one complete record set only. It produces review material, clears the
lease, and never makes it executable. `collaboration_handoff_redeem` consumes a one-time ticket atomically to return
a short-lived synthetic worker session, fenced work-completion credentials, and the existing sanitized assignment;
it never returns ticket scope, repository path/ref, or reviewer capability. `collaboration_execute` performs only
the exact prepared database operation or one fixed persisted Git step after acceptance. Worker tools expose observed
registration, fenced leases, a sanitized operation-owned assignment, and one-time handoff redemption; they do not
claim wake capability or create a reviewer decision. `collaboration_undo_prepare` is guarded by the stored
database before-image and an exact current-state check.

`collaboration_policy_update` and `collaboration_decide` are receipt-protected MCP mutations. Their strict input
schemas require a local UI-issued one-action `authorityReceipt`; the MCP adapter removes it from the request object
and sends it only as `X-Appraise-Authority-Receipt`. Treat that field as a secret tool argument: do not place it in
prompts, notes, shell arguments, environment, or coordinator configuration. The direct CLI remains available with
`--authority-receipt-file` (the file contains only the receipt).

For divergent reconciliation, the receipt-protected direct `collaboration_decide` request names the exact canonical
`reviewDigest` and either ACCEPTs or REJECTs it. ACCEPT persists one designated proposal artifact and its digest;
derived merge/database execution reads that artifact only, never the latest proposal. REJECT cleans the exact
operation-owned proposal worktree or blocks and retains it for recovery. Final cleanup must prove that both the
original proposal and merge worktrees are absent.

After a receipt-protected decision reaches `READY`, Appraise advances the bounded persisted plan without requiring a
caller to name or repeat individual Git/database steps. If the process crashes between the durable decision and that
continuation, the process-local scheduler discovers eligible `READY` operations on its next startup/tick and resumes
only their current permission-checked steps. A running or ambiguous boundary remains on the conservative recovery
path; scheduler discovery never guesses past it.

Execution requests remain version-fenced. Retrying a lost `collaboration_execute` response can return a persisted
result only for the request version that produced the current operation version; it cannot invoke the next step or
repeat an external effect. Applying Git work with no persisted request intent/fence is a conservative recovery block,
not a best-effort replay. Remote-ref transport failures are reported as unavailable rather than as an absent branch.

Journey operations are grouped under `quality/journeys/**` in the coordinator API and `quality_journey_*` in MCP.
Every mutation is scoped to an exact target and Journey and remains subject to the Journey's durable review,
authorization, evidence, and closure invariants.

Creation accepts the shared `QualityJourneyRequirement/v1` payload. Objective-only requests remain valid; structured
fields are canonicalized before hashing and persistence. Coordinator connections use
`GET quality/journeys/:journeyId/handoff?target=...` for safe inspection and
`POST quality/journeys/:journeyId/handoff/redeem` for one-time redemption. MCP exposes these as
`quality_journey_handoff_inspect` and `quality_journey_handoff_redeem`. Preparation and local launch remain UI-only
server actions because only the server resolves and launches a registered workspace.

`locator_search`, `locator_graph_query`, and `locator_ensure` accept `journeyId`. The coordinator verifies that
the Journey belongs to the requested target before reading or writing locator resources. `step_search` remains
generally available and may record optional Journey-bound search evidence.

Independent Test Runs use authored snapshots only. They are non-authoritative diagnostics and cannot be promoted into
Journey evidence.

The former requirement-analysis, validation-design, Quality Plan, Assessment, remote evaluation scope, legacy
execution-consent, methodology, certification, and compatibility operation families have been removed. Their API
paths, MCP tools, resources, schemas, exports, and projectors return ordinary not-found behavior and have no aliases.
The generated operation fixture and [operation reference](generated/coordinator-operation-reference.md) are the
machine-checked public inventory.
