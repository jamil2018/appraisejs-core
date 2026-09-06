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

## Remote Assessment Preflight

For a `REMOTE_BLACK_BOX` target, first create an Appraise-owned remote scope, then call
`assessment_preflight`. The scope receipt itself carries the bounded v2 handoff:
`subjectRevisionId`, `algorithmVersion`, `scopeIntentHash`, `realizationIntentHash`,
`preflightHash`, and an exact `expectedPreflight` token. Use `subjectRevisionId` for
preflight, then pass that exact two-field token to `assessment_prepare_run`; do not reuse a preflight after Step Definition, locator, design,
environment, runtime, or policy drift. Legacy v1 scopes are historical-only and return an explicit algorithm
unsupported error.

## Requirements

- Node.js 20.19+
- An existing Appraise project with the coordinator configured

## Local MCP Bridge

When an agent host cannot attach native MCP tools to a delegated task, call the authenticated loopback MCP endpoint without exposing the coordinator token:

```bash
appraisejs mcp-call project_diagnostic --input-json '{"expectedTargetWorkspacePath":"/absolute/target"}'
```

Pass `--endpoint` only when the local sidecar uses a non-default loopback port or path.

The coordinator `--base-url` is also local-only: use a credential-free HTTP(S) URL on `localhost`, `127.0.0.1`, or
`::1`. The client never sends its project identity or bearer token to a non-loopback endpoint. A non-JSON `404` or
`405` means the selected local service is not an AppraiseJS hub; verify `--base-url` and reconnect the MCP client.

### Quality Journey managed execution

The MCP execution surface provides `quality_journey_execution_get`, `quality_journey_execution_start`,
`quality_journey_execution_cancel`, `quality_journey_execution_reconcile`, `quality_journey_rerun_propose`, and
`quality_journey_rerun_start`. Starts consume exact prepared approved scenarios. Material-effect consent and rerun
approval must be recorded in the local Appraise UI against the displayed scope; these tools cannot grant approval.
See the repository coordinator API contract for request fields and reconnect/evidence behavior.

## Quality Journey history

`quality_journey_library_list`, `quality_journey_artifact_get`, and `quality_journey_export` provide target-scoped,
read-only artifact navigation and export, including closed journeys. Terminal approval and risk acceptance remain
local Appraise UI decisions. Report submissions may use `residualRisks: []` to explicitly record no remaining risks;
every nonempty entry requires explicit risk acceptance at closure.

### Journey experience and compatibility

`quality_journey_library_list` supports metadata-only `query` search (maximum 200 characters) before pagination. `quality_journey_compatibility_read` exposes exact historical Quality Plan references as read-only projections without Journey approval authority. Public source submission requires explicit analysis; superseded approval aliases return HTTP 410. Existing exact-revision Quality OS domain contracts remain available.
