# Desktop UX Phase 3 evidence

Date: 2026-09-08

## Confirmed changes

- The dashboard now derives `empty`, `untested`, and `populated` states from project-owned Journeys, authored tests, and completed runs. Global Step Definitions do not make a project look initialized.
- Zero attention counts are labelled `No evidence` until a completed run exists; the UI no longer calls an untested workspace healthy.
- A primary Journey/setup action and concise readiness checklist precede dashboard statistics. Manual test design remains available as a secondary route.
- Reports and Create Run explain how evidence is produced. The run form and empty suite picker open prerequisite creation in a new tab and can refresh server choices without clearing the mounted form.
- Suite selections absent from the current project-owned rows are discarded by normalization.
- Intake navigation uses presentation-only state updates. Only substantive edits increment the autosave revision and create or update a draft.

## Verification

- Focused Vitest coverage exercises dashboard state projection, truthful zero-count presentation, project-scoped dashboard queries, empty picker recovery, run-form value preservation, wrong-project selection normalization, navigation-only intake, rapid edits, save failure, and conflict recovery.
- Canonical root changes were synchronized with `npm --prefix packages/create-appraisejs run prepare-template`.
- The local dashboard showed an untested state, unknown Codex readiness, and `No evidence` attention labels for the active project.
- Create Run showed prerequisite actions. Entering `Preserved browser value`, refreshing choices, and reading the field returned the same value.
- Navigation through all four intake sections left the project draft count unchanged at `2` and produced no browser console errors or warnings.

## Harness limitation

The repository-preferred in-app Browser could not attach because the Mac was locked. The documented Playwright CLI fallback was used against `127.0.0.1:3000`; this is a harness limitation, not a product defect.
