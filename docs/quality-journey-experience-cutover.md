# Quality Journey Experience and Compatibility Cutover

Quality Journeys are the user-facing orchestration workflow. The overview distinguishes the Coordinator's
communication role, deterministic Runner nodes, semantic role work items, worker attempts, human review gates,
and durable blockers. It does not infer that a provider is connected. Refresh reads observed state without granting
authority or replaying a command. Exact analysis, scenario, execution, and report controls continue to use their
specialized Appraise services.

Stage navigation preserves the active project. Scenario and materialization history remains readable in later stages;
the graph is accompanied by a linear view of the same scenarios and dependency relationships. The artifact library
searches public titles, entry and artifact IDs, revision IDs, and content hashes across artifact kinds. Filtering runs
before pagination, accepts at most 200 characters, and never searches credential-bearing source JSON. Search and
artifact-kind filters are shareable URL state. Disabled pagination has no active navigation link.

## Historical records

`/quality-journeys/compatibility` and `quality_journey_compatibility_read` expose a read-only, target-scoped projection
of Quality Plan revisions and their existing requirement, analysis, validation, and Assessment relationships. Each
record retains its exact persisted identifiers and hashes. These relational joins establish historical ownership;
they do not establish equivalent Journey requirements, scenarios, approvals, or sealed execution evidence.

There is currently no persisted cross-model proof that a Quality Plan revision is an approved Journey analysis or
portfolio. Therefore this cutover performs **no automatic authority migration**. Compatibility projections explicitly
report `READ_ONLY`, `NONE` Journey authority, and `NO_PROVEN_JOURNEY_LINEAGE`. Matching titles, content, target, or
timestamps cannot transfer approvals. A new Journey starts at intake and must pass its own exact-revision gates.
Historical source, realization JSON, environment snapshots, and credential data are not included in this projection.

## Public control boundary

The compatibility shortcuts ending in `requirements/approve`, `validation-design/approve`, and
`validation-design/proposals` under the Quality Plan coordinator API return HTTP 410 with
`QUALITY_JOURNEY_LEGACY_CONTROL_RETIRED`. Their dispatch implementations are removed. Clients should start a Quality
Journey or use the canonical exact-revision Quality OS analysis and design contracts. This is an immediate retirement
of superseded aliases, not a silent redirect that changes request identity.

Public `requirements_submit_source` now creates requirement snapshots requiring explicit analysis and review. It
cannot synthesize an approved analysis. A replay that resolves to an old synthetic analysis returns a conflict and
keeps that history unchanged. Synthetic legacy analyses cannot authorize new canonical validation designs.

Quality OS remains the domain authority for its explicitly reviewed records, publications, Assessments, consent,
and evidence. Those versioned APIs are retained for existing domain consumers and certification; they do not confer
Journey work-item, publication, execution, or closure authority. Internal historical-fixture and preparation services
remain available, but retired HTTP aliases cannot invoke their compatibility approval shortcuts.

## Release verification

Run `npm run release:check:journey-cutover`. It applies all forward migrations to a temporary database, audits
physical foreign keys and ownership across every declared Journey relationship, and tests populated valid history plus corrupt imported references.
The audit checks target ownership, cycle ownership, active revisions/work items/blockers, cycle predecessor lineage,
worker replacement ownership, work authorization, and execution target/capsule ownership. Diagnostics contain record
IDs and reason codes, not stored payloads. Existing forbidden-control checks and exact Journey negative-gate tests
remain release-critical. CI runs this gate in addition to the Quality OS, package, and scaffold gates.

To audit an existing database without modifying it, run:

```sh
node --import tsx scripts/check-quality-journey-integrity.ts --database /absolute/path/to/database.db
```

The explicit database is opened read-only. Back up existing installations before rollout; apply forward migrations
before scanning. Resolve any reported orphan or ownership discrepancy from proven source history, never by making up
an approval or deleting evidence. Prepared starter and blank databases must also pass the same scan.

## Rollback

This phase adds no schema migration and rewrites no historical records. UI changes can be reverted independently.
Do not restore retired public approval shortcuts against a database that has accepted Journey work. For a full
version rollback, stop writers, retain the database and exported manifests, restore the pre-upgrade application and
its matching backup together, then rerun its release checks. Do not copy newer approvals or runs into an older
authority model.
