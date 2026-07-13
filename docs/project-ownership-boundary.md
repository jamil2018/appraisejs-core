# Project Ownership Boundary

AppraiseJS treats a `TargetProject` as the mandatory isolation boundary for authored data, managed lifecycle state,
execution, reports, metrics, reviews, integrations, and evidence. System configuration and built-in contract schemas
remain global. Template Steps, Template Step Groups, Step Blocks, and test-case templates are project-owned; global
promotion and cross-project import are separate contracts and are not implied by visibility.

## Active project resolution

Canonical application URLs keep their existing path and use `?project=<targetProjectId>`. An explicit URL project
takes precedence over the `appraise-active-project` cookie. An invalid explicit ID produces a scoped 404 and is never
replaced with the cookie project. Without an explicit ID, a valid cookie may supply the active project. Missing or
invalid cookie scope routes project-sensitive pages to project onboarding.

Server actions derive ownership from the server-readable active-project cookie. If a caller also supplies a project
ID, it must equal the resolved project. Project-sensitive services receive that trusted context and reject foreign
IDs before reading or mutating related records.

## Ownership classes

| Class               | Records                                                                                  | Enforcement                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| System              | built-in schemas, provider adapter registrations, system settings                        | intentionally global                                            |
| Project roots       | modules, cases, suites, locator groups, locators, environments, tags, template libraries | direct `targetProjectId`                                        |
| Project descendants | steps, parameters, flow blocks, reviews, tickets, joins, conflicts                       | parent ownership plus relationship validation                   |
| Publication         | plans, validation proposals and publications, export jobs and receipts                   | direct target and immutable plan/publication provenance         |
| Runtime             | capsules, TestRuns, attempts, logs, reports, traces, screenshots, metrics                | direct target on roots and transitive immutable runtime binding |

The migration first registers the hub checkout as **Legacy AppraiseJS**, adds nullable ownership columns, and
backfills existing rows. A constraint-finalization migration is applied only after integrity checks prove that every
root and descendant resolves to exactly one project. The hub legacy registration does not create an external-target
`.appraisejs/project.json` marker.
