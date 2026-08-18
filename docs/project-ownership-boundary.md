# Project Ownership Boundary

AppraiseJS treats a `TargetProject` as the mandatory isolation boundary for authored data, managed lifecycle state,
execution, reports, metrics, reviews, integrations, and evidence. System configuration and built-in contract schemas
remain global. Ready Step Definitions form a shared library visible to every project. Compositions are immutable
test-case templates remain project-owned and may reference entries from that shared library.

## Active project resolution

Canonical application URLs keep their existing path and use `?project=<targetProjectId>`. An explicit URL project
takes precedence over the `appraise-active-project` cookie. An invalid explicit ID produces a scoped 404 and is never
replaced with the cookie project. Shared navigation never propagates an ID unless it matches a registered project;
when the browser retains a deleted URL or cookie ID, the global selector clears the cookie, removes the stale query
parameter, and returns project-sensitive pages to project onboarding. Without an explicit ID, a valid cookie may
supply the active project. Missing or invalid cookie scope routes project-sensitive pages to project onboarding. Requests for the dashboard or a
project-scoped collection/detail page that have neither URL nor cookie scope are rewritten before page data loads to
a required project-selection dialog. The browser keeps the requested URL, and selecting a project returns to the
same path and query with `project=<targetProjectId>` added, preventing missing-scope errors from becoming route-level
500 responses.

The project-management page presents registered projects in a searchable table. Registration and metadata changes
use modal forms; UI registration requires a display name and accepts an optional description. Removing a project is
an explicit, name-confirmed destructive operation that transactionally deletes all project-owned authored,
lifecycle, runtime, reporting, metric, evidence, export, and supporting records before deleting the project identity.
Agent registration remains compatible with derived display names when callers omit one.

Server actions derive ownership from the server-readable active-project cookie. If a caller also supplies a project
ID, it must equal the resolved project. Project-sensitive services receive that trusted context and reject foreign
IDs before reading or mutating related records.

All project-owned application reads and writes are project-scoped. Modules, suites, cases, runs, reports,
environments, tags, locators, locator groups, case templates, metrics, and dashboard aggregates are
queried through the active project. Creation and update services validate that every project-owned related record
belongs to the same project before connecting it. Ready Step Definitions are deliberately global;
their CRUD actions do not require a selected project, and project-owned cases and blocks may reference them. A missing
active project remains a validation error for creation of any project-owned entity.
Project-owned display names, including environment names, are unique only within their target project; identical names
in different projects must not collide during validation resource publication.
Test-run artifact routes apply the same boundary to logs, downloads, traces, and runtime diagnostics, returning an
opaque not-found response when the active or explicitly trusted project scope does not own the run.

Plan collection and review routes resolve the active project before querying projections. Plan lists, statistics,
slug resolution, canonical detail access, and every UI review, validation, baseline, layout, and completion mutation
are restricted to plans whose recorded `targetProjectId` matches that scope. Switching projects returns the plans
collection rather than carrying a foreign plan detail route into the new scope.

Agent and coordinator operations use the plan-bound `targetProjectId` as their trusted scope. Validation context reads
filter project-owned resources at the Prisma query boundary, not after loading global data. Shared Step Definitions are
returned alongside that scoped context. Suggested-resource proposals and canonical validation publication persist
`targetProjectId` on every project root they create, may reuse any ready shared Step Definition, and reject an existing
foreign project-owned record rather than reassigning it. Ownership metadata remains provenance; it is not a substitute
for a project-owned entity's own project foreign key.

Locator proposal, context, check, preview, and compile responses share one binding shape. Each locator and locator
group exposes its persistent `id`, copyable `astRef`, contract `version`, `targetProjectId`, and module/group ancestry.
Canonical projection reuses a compatible binding with that ancestry unchanged; it never reparents a proposed locator
group beneath the validation AST's generated module. Foreign bindings and same-project structural mismatches fail
before publication instead of falling back across project boundaries.
Resource proposals also reuse compatible same-project modules, locators, and environments when a later proposal uses a
different local key for the same canonical name and ancestry. Ambiguous names or incompatible routes, selectors, URLs,
or ownership return a bounded conflict instead of leaking a database uniqueness failure.

## Ownership classes

| Class               | Records                                                                              | Enforcement                                                     |
| ------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Shared library      | Ready Step Definitions                                                               | intentionally global                                            |
| System              | built-in schemas, provider adapter registrations, system settings                    | intentionally global                                            |
| Project roots       | modules, cases, suites, locator groups, locators, environments, tags, case templates | direct `targetProjectId`                                        |
| Project descendants | steps, parameters, flow blocks, reviews, tickets, joins, conflicts                   | parent ownership plus relationship validation                   |
| Publication         | plans, validation proposals and publications, export jobs and receipts               | direct target and immutable plan/publication provenance         |
| Runtime             | capsules, TestRuns, attempts, logs, reports, traces, screenshots, metrics            | direct target on roots and transitive immutable runtime binding |

The migration first registers the hub checkout as **Legacy AppraiseJS**, adds nullable ownership columns, and
backfills existing rows. Nullable columns remain a compatibility seam for databases created before project support;
new project-owned application and coordinator writes must never rely on null ownership. Shared library entities are
excluded from that invariant even if legacy rows retain historical ownership metadata. A constraint-finalization migration is
applied only after integrity checks prove that every root and descendant resolves to exactly one project. The hub
legacy registration does not create an external-target `.appraisejs/project.json` marker.
