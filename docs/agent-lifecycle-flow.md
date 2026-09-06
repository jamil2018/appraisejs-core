# Agent Lifecycle Flow

Quality Journey is AppraiseJS's sole agent-enabled quality authority. A Journey owns requirement intake, analysis,
discovery, scenario approval, materialization, execution consent, sealed evidence, triage, report review, remediation,
reruns, and closure. Only a Journey decision or closure is a quality outcome.

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
