# Security

This document describes data handling, storage, and security considerations.

## Data Storage

- Local SQLite database at `prisma/dev.db` (configured via `DATABASE_URL`).
- Authored assets in the repo: feature files, locators, step definitions.
- Generated artifacts in the repo: reports, logs, traces under `src/tests/reports/`.

The project is designed for local-first workflows and does not include built-in multi-tenant or hosted storage.

## Authentication and Authorization

There is no built-in authentication or authorization layer in this codebase. The app assumes a trusted local environment. Do not deploy it to an untrusted or public network without adding auth.

## Reporting and Logs

Reports and logs can include:

- Scenario names and step text
- Environment URLs
- Failure messages and stack traces
- Playwright traces (zip files) for failed scenarios

Treat the `src/tests/reports/` directory as sensitive. Avoid committing logs or traces that contain secrets or user data. Keep `.env` local-only.
