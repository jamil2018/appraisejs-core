# Server Actions conventions (AppraiseJS)

Project-sensitive actions resolve the active project from trusted server context before invoking a service. Client
fields may repeat `targetProjectId` for conflict detection, but never establish ownership; a mismatch with the
server-resolved project is rejected. Services require the resolved scope for every lookup and relation check. See
`docs/project-ownership-boundary.md`.

This applies to reads as well as mutations. Lists, detail views, uniqueness checks, dashboard metrics, reports, and
test-run controls must receive the resolved project ID. Creation actions fail when no active project is selected, and
services must persist the resolved ID rather than accepting ownership from form data.

Ready Step Definitions are the shared-library exception: registry actions and services operate globally and do not
require active-project resolution. Project-owned entities reference their exact immutable Step References.

## Local request boundary

`src/proxy.ts` applies the Appraise 0.5 ingress policy before API or page routing. Requests must arrive from a loopback
peer with a loopback `Host`. State-changing methods with an `Origin` must use the same origin as `Host`; an absent
`Origin` remains valid for local CLI and native clients. Keep this policy centralized. Framework-native Server Action
origin checks remain enabled and should not be reimplemented in individual actions.

## Layers

1. **Server Action** (`src/actions/**`): `'use server'` entry points. Parse input with Zod, call a **service**, map results to `ActionResponse`, call `revalidatePath` / `redirect` as needed.
2. **Service** (`src/services/**`): Business rules and orchestration. Returns data or throws `ServiceError` from `@/services/shared/errors`. No `revalidatePath`, no `ActionResponse`.
3. **Persistence / I/O**: Prefer Prisma via `@/config/db-config`; use dedicated helpers when logic is file/process heavy (e.g. test run executor, report parser).

Domains with a `*-service.ts` include: `test-run`, `report`, `test-case`, `test-suite`, `locator`, `dashboard`, `environment`, `module`, `tag`, `locator-group`, `review`, `conflict`, `step-definition`, `template-test-case`. Thin actions (`settings/sync`, stub `user`) may remain without a service.

## Responses

- Use `ActionResponse` from `@/types/form/actionHandler`.
- Set `success: true` on successful responses in refactored actions; set `success: false` on errors.
- Map thrown `ServiceError` with `serviceErrorToActionResponse`.
- Map unexpected errors with `unknownErrorToActionResponse` (logs optional prefix).

## Errors

- Throw `ServiceError(message, code, statusCode?)` for domain failures (`NOT_FOUND`, `VALIDATION`, `CONFLICT`, `INTERNAL`).
- Do not swallow errors; avoid empty `catch` unless intentionally ignoring a non-fatal side effect (document why).

## Tests

- Test service boundaries and pure helpers, including domain rules, scope enforcement, and persistence orchestration.
- Add focused Server Action tests when the action contains behavior: parsing or normalization, authorization or
  project-scope mapping, cache invalidation/redirect decisions, or error-envelope translation. A true pass-through
  wrapper needs no duplicate test.
- Do not create a generic action/CRUD framework to make testing uniform. Keep mapping tests beside the owning action
  and service tests beside the owning domain.
- Canonical examples include the coordinator operation registry boundary and the test-run service staging boundary;
  both keep transport mapping separate from domain execution without adding pass-through layers.
- Use `@/` path alias (configured in Vitest `resolve.alias`).

## Shared constants

- Time windows such as “last 7 days” use `RECENT_PERIOD_DAYS` from `@/services/shared/constants`.
