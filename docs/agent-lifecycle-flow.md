# Agent Lifecycle Flow

Quality Journey is AppraiseJS's sole agent-enabled quality authority. A Journey owns requirement intake, analysis,
discovery, scenario approval, materialization, execution consent, sealed evidence, triage, report review, remediation,
reruns, and closure. Only a Journey decision or closure is a quality outcome.

Structured UI intake may create a mutable, project-scoped `QualityJourneyDraft`, but a draft is workspace content,
not lifecycle authority. Draft edits, archive/restore, and review preparation create no Journey work, events, or AI
activity. Confirmation consumes the exact saved draft version and normalized requirement hash in one transaction:
it creates the immutable requirement revision, submits the requirement through the canonical command boundary,
issues the normal Analysis work item, and marks the draft confirmed. A failed or stale confirmation rolls back without
leaving an intake Journey, and an exact retry returns the same Journey.

The guided UI requires a complete brief before confirmation while the canonical requirement API and MCP contract
remain objective-only compatible. Draft ownership is always resolved from the active project; drafts are workspace
records rather than private per-user records. Confirmed drafts are immutable, and archive is recoverable rather than
destructive.

A Codex handoff connects a harness-native coordinator to that Journey; it does not transfer transition authority,
create an alternate Analyzer, or bypass questions and human review gates.

## Journey presentation and observation

The default experience groups canonical lifecycle state into six presentation stages: **Your brief**, **Test
approach**, **Test scenarios**, **Test preparation**, **Run tests**, and **Results**. This mapping and the derived next
action are presentation-only; they do not grant permissions or replace canonical stages, revision identities,
commands, or approval gates. IDs, hashes, Runner nodes, attempts, receipts, and internal event names remain available
under technical details.

Journey pages observe a compact project-scoped status snapshot every ten seconds while visible. Observation never
silently replaces editable answers, feedback, scenario choices, or consent inputs. When canonical state advances, the
page reports that a newer version is available and requires an explicit load before any exact-version decision.
Polling stops after closure, prevents overlapping reads, preserves the last known snapshot on failure, and backs off
to at most sixty seconds. The manual **Check for updates** control uses the same observation boundary.

Agents must use the dedicated `quality_journey_*` coordinator operations for lifecycle transitions. Work leases,
artifact hashes, review decisions, execution-cycle identities, and evidence receipts are exact Journey-scoped
authority. Chat approval and generic TestRun completion do not replace these gates.

Independent Test Runs remain available for authoring feedback, execution diagnostics, and debugging. They have
`intent=INDEPENDENT`, carry no Journey execution binding, and cannot supply Journey evidence, triage, decisions, or
closure. Journey-created Test Runs have `intent=QUALITY_JOURNEY` and require their exact
`QualityJourneyExecutionTestRun` binding.

The removed Quality Plan and Assessment routes, operations, resources, and aliases are unavailable. Requests receive
ordinary not-found behavior; there are no redirects, compatibility projections, imports, or data-preservation paths.
Development databases that contain the unreleased removed schema must be reset.
