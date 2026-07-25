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

## Requirements

- Node.js 20.19+
- An existing Appraise project with the coordinator configured
