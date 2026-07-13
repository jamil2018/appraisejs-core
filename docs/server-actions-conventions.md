# Server Actions conventions (AppraiseJS)

Project-sensitive actions resolve the active project from trusted server context before invoking a service. Client
fields may repeat `targetProjectId` for conflict detection, but never establish ownership; a mismatch with the
server-resolved project is rejected. Services require the resolved scope for every lookup and relation check. See
`docs/project-ownership-boundary.md`.

## Layers

1. **Server Action** (`src/actions/**`): `'use server'` entry points. Parse input with Zod, call a **service**, map results to `ActionResponse`, call `revalidatePath` / `redirect` as needed.
2. **Service** (`src/services/**`): Business rules and orchestration. Returns data or throws `ServiceError` from `@/services/shared/errors`. No `revalidatePath`, no `ActionResponse`.
3. **Persistence / I/O**: Prefer Prisma via `@/config/db-config`; use dedicated helpers when logic is file/process heavy (e.g. test run executor, report parser).

Domains with a `*-service.ts` include: `test-run`, `report`, `test-case`, `test-suite`, `locator`, `dashboard`, `environment`, `module`, `tag`, `locator-group`, `review`, `conflict`, `template-step`, `template-step-group`, `template-test-case`. Thin actions (`settings/sync`, stub `user`) may remain without a service.

## Responses

- Use `ActionResponse` from `@/types/form/actionHandler`.
- Set `success: true` on successful responses in refactored actions; set `success: false` on errors.
- Map thrown `ServiceError` with `serviceErrorToActionResponse`.
- Map unexpected errors with `unknownErrorToActionResponse` (logs optional prefix).

## Errors

- Throw `ServiceError(message, code, statusCode?)` for domain failures (`NOT_FOUND`, `VALIDATION`, `CONFLICT`, `INTERNAL`).
- Do not swallow errors; avoid empty `catch` unless intentionally ignoring a non-fatal side effect (document why).

## Tests

- Vitest includes `src/services/**/*.test.ts` (see root `vitest.config.ts`).
- Test **service** and **pure helpers** (e.g. `test-run-helpers.ts`), not Server Actions.
- Use `@/` path alias (configured in Vitest `resolve.alias`).

## Shared constants

- Time windows such as “last 7 days” use `RECENT_PERIOD_DAYS` from `@/services/shared/constants`.
