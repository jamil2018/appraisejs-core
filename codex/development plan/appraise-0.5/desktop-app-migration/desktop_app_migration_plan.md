# AppraiseJS Next-to-Electron Migration Plan

## Summary
Migrate AppraiseJS into a two-app codebase, not a replacement of the current web app.

- Keep the existing Next.js product as `apps/web` for the future cloud release.
- Build a new `apps/desktop` Electron app with a native IPC boundary and a React renderer.
- Extract the current local-only backend behavior out of Next server actions and route handlers into shared workspace-aware application modules.
- Change the local runtime model from `process.cwd()` to an explicit opened workspace root, because the desktop app must run against user-selected folders.
- Update `create-appraisejs` after the app migration so new projects scaffold the Electron-capable standalone structure by default.

Current repo facts that drive this plan:
- The app has `17` Next action files, `7` API route files, and `153` `src/app` files.
- Local execution, sync, report download, screenshots, trace viewing, and log streaming currently depend on Next server actions, API routes, Prisma, filesystem access, and spawned local processes.
- Several client flows depend on `next/navigation`, and log streaming currently depends on SSE under `/api/test-runs/[runId]/logs`.

## Implementation Changes
### 1. Target architecture
Adopt this end-state structure:

- `apps/web`
  - Next.js App Router app for cloud/web delivery.
  - Owns web-only routing, metadata, cache revalidation, and HTTP transport.
- `apps/desktop`
  - Electron main process, preload, and React renderer.
  - Owns desktop lifecycle, workspace selection, IPC transport, native menus/windows, and packaged distribution.
- `packages/app-core`
  - Shared application services, workspace-aware filesystem/db helpers, sync/test-run/report logic, and typed command/query contracts.
- `packages/ui`
  - Shared React UI components, form helpers, table helpers, and non-Next presentation logic.
- `packages/runtime-types`
  - Shared DTOs, command/query payloads, result shapes, and preload contract types if separating these helps avoid circular imports.

### 2. Move from Next-owned backend to shared app core
Extract all local backend behavior now hidden behind `src/actions/**`, `src/app/api/**`, and some server components into shared command/query modules.

Public/shared interfaces to add:
- `WorkspaceContext`
  - `workspaceRoot`, resolved DB path, automation paths, temp/log/report paths.
- `AppCommandBus` / `AppQueryBus`
  - Typed command/query entrypoints used by both web and desktop adapters.
- `DesktopApi`
  - Preload-safe typed IPC surface such as `workspace.open`, `dashboard.getMetrics`, `testRuns.create`, `testRuns.cancel`, `logs.subscribe`, `reports.download`, `trace.open`.
- `Web adapter`
  - Thin Next-only layer that maps server actions and route handlers to the shared command/query modules.

Rules for extraction:
- Shared core must not import `next/*`.
- Shared core must not rely on implicit `process.cwd()`.
- Next server actions stay only as web transport wrappers for mutations.
- Next route handlers stay only where HTTP/SSE/file response semantics are truly web-specific.
- Server components in `apps/web` should call shared query functions directly, not call server actions as an internal service layer.

### 3. Introduce workspace-aware local runtime
Replace repo-root assumptions with explicit workspace selection.

Required changes:
- Refactor DB bootstrap, automation paths, sync scripts, test execution, report paths, and file generators to accept `workspaceRoot`.
- Persist recent/opened workspaces in Electron user data.
- Require the desktop app to open a folder before any project-bound screen is usable.
- Add a workspace bootstrap flow:
  - validate workspace shape
  - create missing local folders/files if this is a fresh project
  - resolve Prisma SQLite location relative to that workspace
  - expose current workspace state to the renderer

This is mandatory because current local services read `.env`, Prisma DB, `automation/**`, and scripts from the current working directory.

### 4. Desktop-specific transport replacements
Replace current web transport patterns with desktop-native equivalents.

- Replace server-action mutations with IPC commands.
- Replace SSE log streaming with IPC event subscriptions from main process to renderer.
- Replace `/api/.../download` responses with explicit file save/open actions from Electron main.
- Replace `/api/.../screenshot` URL usage with either:
  - `desktopApi.reports.getStepScreenshot(stepId)` returning a safe file URL/blob handle, or
  - a desktop asset protocol registered in Electron.
- Replace trace-viewer POST routes with direct main-process commands that spawn Playwright trace viewer.

### 5. UI split strategy
Keep page containers platform-specific and presentation shared.

- Keep routing/page composition separate in `apps/web` and `apps/desktop`.
- Move reusable client components from `src/components/**` and form/table helpers into `packages/ui`.
- Remove direct `next/navigation` usage from shared components.
- Introduce a small navigation abstraction for shared components that currently call `router.push`.
- Keep Next-only concerns in web page containers:
  - `next/link`
  - `next/navigation`
  - metadata
  - `revalidatePath`
  - server component data loading

Desktop renderer choice:
- Use React + `react-router-dom` in Electron renderer.
- Use query hooks over IPC for reads, with explicit invalidation after successful mutations.

### 6. Migration order
Execute in this order so the web app stays working throughout:

1. Create the new workspace/runtime abstractions in shared packages.
2. Move filesystem, Prisma bootstrap, sync, execution, logs, reports, and trace-launch logic into `packages/app-core`.
3. Convert existing Next actions/routes into thin web adapters around the shared core.
4. Extract reusable UI into `packages/ui` and remove Next-only imports from shared components.
5. Build `apps/desktop` Electron main/preload/renderer using the shared core and shared UI.
6. Re-point the current repo app structure into `apps/web`.
7. Add workspace picker, recent workspaces, and desktop startup bootstrap.
8. Add packaging for macOS first.
9. After desktop runtime is stable, update `create-appraisejs` templates and installer flow to scaffold the desktop-capable project structure.

### 7. `create-appraisejs` changes
`create-appraisejs` becomes part of the second migration wave, not the first blocking step.

Public CLI/template changes:
- Default scaffold target becomes desktop-capable standalone Appraise.
- Add an explicit template target flag such as `--target desktop|web`.
- `desktop` is the default after migration.
- `web` remains available for future cloud work and internal testing.
- Template output must include:
  - Electron app structure
  - workspace bootstrap
  - Prisma/automation local layout
  - packaging scripts
  - desktop dev/build commands

## Main Challenges
- Next is currently both UI shell and local backend. Server actions, route handlers, `revalidatePath`, and server components are mixed into the same feature flows.
- The app is heavily local-first. Prisma SQLite, filesystem projections, sync scripts, reports, and process spawning all assume a local Node environment and current working directory.
- Desktop log streaming cannot reuse SSE directly. It needs a proper IPC subscription model with lifecycle cleanup.
- Several flows use Next-only routing APIs. Shared components must stop depending on `next/navigation`.
- File-backed assets are currently exposed through HTTP routes. Desktop needs a safe file/protocol strategy instead of assuming browser HTTP URLs.
- Electron packaging plus Playwright execution is operationally sensitive, especially around browser binaries, spawned child processes, and opening trace viewers on packaged macOS builds.
- The repo includes duplicated starter templates under `packages/create-appraisejs/templates/**`; any structural change will eventually have to be mirrored there.
- Keeping the web app intact means avoiding desktop-only shortcuts in shared core. The shared layer must stay transport-agnostic and workspace-aware.

## Test Plan
- Shared-core contract tests
  - CRUD queries/mutations still work when called without Next.
  - Workspace-scoped DB/files/report paths resolve from an injected `workspaceRoot`.
  - Sync and test-run execution still function through shared services.
- Web regression tests
  - Existing major flows still work through Next wrappers: dashboard, entity CRUD, sync, test run create/cancel, reports, screenshots, logs, trace launch.
  - `revalidatePath` behavior remains only in web adapters.
- Desktop integration tests
  - Open workspace flow.
  - Create/update/delete entities against the selected folder.
  - Run sync from desktop.
  - Start test run, stream logs live over IPC, cancel run, open trace viewer.
  - Download/open report artifacts and screenshots without HTTP routes.
- Packaging smoke tests
  - Unpacked macOS app launches.
  - Packaged macOS app launches, opens a workspace, and runs one end-to-end test run.
- Scaffolding tests
  - `create-appraisejs --target desktop` creates a runnable project.
  - Generated project boots, initializes workspace, and completes at least one sync/test-run smoke flow.
  - `--target web` still generates a valid web-focused project for future cloud work.

## Assumptions And Defaults
- Electron architecture is native IPC shell now, not “embed Next inside Electron.”
- macOS is the only officially supported desktop target in v1.
- The desktop app uses an open-folder workspace model and remembers recent workspaces.
- Web remains a first-class app and is not downgraded to a compatibility shim.
- Auth, multi-user collaboration, and cloud-hosted backend concerns are out of scope for this migration.
- `create-appraisejs` is updated after the desktop runtime is proven, but it is in scope for the overall migration program and must end with desktop scaffolding support.
