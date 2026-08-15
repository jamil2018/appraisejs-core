# Agent Scaffold Flow

`create-appraisejs` is bundled-only. It ships one full base app template and small flavor overlays inside the package.
It does not fetch a remote template during normal scaffolding.

Runtime capsule diagnostics are hub-owned in Appraise 0.5. The full base template includes their route, durable attempt
schema, and artifact gateway because a generated AppraiseJS installation can become the hub; package CLI/MCP clients
and registered target workspaces still connect back to that hub rather than receiving a separate diagnostic runtime.

The starter and blank flavors share one prepared database while their registered database inputs remain identical.
Preparation performs migrations and Step Definition synchronization once, copies the result to both overlays, and
still verifies both composed templates independently.

## Current Model

- Base template: `packages/create-appraisejs/templates/base`
- Starter overlay: `packages/create-appraisejs/templates/flavors/starter`
- Blank overlay: `packages/create-appraisejs/templates/flavors/blank`
- Preparation command: `npm --prefix packages/create-appraisejs run prepare-template`

## Working Rules

Make behavior changes in root/base source first when generated projects should inherit them. Then run the preparation
command and review the base template plus flavor overlay diffs. Direct template edits are limited to package metadata,
README content, packaging behavior, or files that preparation intentionally preserves.

Prepared templates should start with clean runtime output. They may contain seeded starter data, but must not contain
machine-local coordinator credentials, leases, durable events, test runs, reports, or personal layout state.

## Validation

- Run `npm --prefix packages/create-appraisejs run prepare-template` for root-to-template or scaffold package changes.
- Run `npm --prefix packages/create-appraisejs run test` for CLI/package behavior changes.
- Run the package build for release-like changes or when template preparation and TypeScript behavior both changed.
