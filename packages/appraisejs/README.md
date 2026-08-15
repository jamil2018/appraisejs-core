# appraisejs

AppraiseJS command-line, coordinator client, MCP server, and managed-run diagnostics for an existing Appraise
project. Reusable behavior is authored and published through the shared Step Definition registry in the Appraise hub.

## Managed Run Diagnostics

The CLI connects to the Appraise hub and exposes selected-target, bounded diagnostics in human or exact JSON form:

```bash
appraisejs test-run diagnose --run-id <run-id>
appraisejs test-run diagnose --run-id <run-id> --json
```

Managed capsule output contains stable status, blocker, evidence, and recovery fields without raw paths, commands,
environment values, or artifact contents. Recoverable blocked diagnostics exit with status 2. The diagnostic service
and schema are hub-only in Appraise 0.5 and are not copied into scaffold templates.

## Locator Discovery

Locator graph queries are Quality Plan scoped so a target must be selected by its approved plan rather than by an
arbitrary project ID:

```bash
appraisejs locator-graph query --target <registered-target> --quality-plan-id <quality-plan-id> --from-id <surface-id> --json
```

The MCP `locator_ensure` tool accepts a registered target reference and can create one explicit target-owned module/group/locator closure for that plan. It is
local and idempotent; it does not browse, handle credentials, or verify a selector at authoring time.

## Requirements

- Node.js 20.19+
- An existing Appraise project with the coordinator configured
