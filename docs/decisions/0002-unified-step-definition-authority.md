# ADR-0002: Use One Step Definition Identity Across Authoring And Execution

## Status

Accepted on 2026-07-22. This decision supersedes ADR-0001 wherever it treats a Template Step or human projection as
an independently identified entity linked to an operation.

## Context

ADR-0001 unified built-in handlers and operation invocations, but retained two durable identities:
`TemplateStep.id` for human authoring and `operationId@version` for agent authoring and execution. Nullable mapping
fields connected those identities. Consequently, discovery could find a human step that managed authoring could not
invoke, and projection could depend on an ambiguous reverse lookup.

## Decision

Every reusable behavior has one globally shared, versioned `StepDefinition(id, version)`. Human wording, agent
guidance, generated Cucumber wrappers, execution bindings, and search data are projections or consumers of that same
identity. Built-in source, human forms, migration, and agent commands create the same draft schema and use one
publication service.

The lifecycle is `draft -> ready -> deprecated`. Drafts are mutable and non-executable. Appraise alone publishes an
immutable ready version after validating semantics, typed inputs and outputs, projections, execution, integrity, and
the exact human review authority. Deprecation preserves historical resolution and records a reason and optional ready
replacement.

Ready definitions are global library entries. Provenance records how and by whom a definition was authored and
reviewed; it never limits visibility. Reserved built-in namespaces remain source-controlled.

Definitions contain inert metadata and an exact execution binding. Executable user source belongs to a separately
reviewed, content-addressed extension artifact. Appraise may deterministically generate schemas, adapters, wrappers,
and handler contracts, but it does not infer semantic intent or implementation logic.

All new authoring stores a `StepInvocation` containing an immutable Step Reference and typed inputs. The retired
`templateStepId`, `templateStepName`, `operationRef`, and `action` fields are rejected. Historical evidence remains
immutable, but it is not an executable decoder or compatibility authority.

## Consequences

- Human and agent discovery return the same Step Reference.
- Ready means the human projection, agent contract, and execution binding were published atomically with a receipt.
- Editing published content creates a new version; historical tests, capsules, and evidence never silently upgrade.
- Template Step, operation-mapping, and Step Block semantic APIs are removed rather than retained as projections.
- Built-ins, compositions, and reviewed extensions share one publication and governance boundary.

## Rejected Alternative

Keeping Template Steps and operations as synchronized identities was rejected. It preserves ambiguous reverse
lookups, nullable readiness state, and independent drift repair paths instead of removing the dual authority.

## Rollout

The unreleased cutover discards pre-unification rows. Ready definitions require their exact publication receipt and
sealed closure before baseline, implementation validation, or runtime capsule execution can proceed. Built-in source
namespaces are regeneration-only; interactive authors use the same draft semantics but cannot overwrite source-owned
identities. Bounded observational telemetry records discovery, authoring, validation, publication, and runtime
outcomes without changing ranking or publication policy.
