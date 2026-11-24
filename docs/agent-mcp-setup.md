> Current shipping checkpoint: [M02 scripted qualification accepted](../tasks/codex-app-server-journeys/M02-SHIPPED-SCRIPTED-QUALIFICATION-01.md). T2 R51 passed24/24 andT3 R55 passed2/2; final exact evidence review accepted within TA02/TA03 limits. `runtimeQualified` remains false; helper lifetime/global inventory and historical cleanup remain unobserved. No M03 or production dispatch authority follows. Older status passages below remain historical.

# MCP Setup For Quality Work

After registering a compatible client, use `workspace_record_search` with the registered target and record kind to find
cases, suites, templates, runs, and reports in its project. It returns record identifiers and titles and grants read
access only within that target. Appraise Settings account authorization and MCP registration are separate steps.

For the complete operator path from setup through handoff, recovery, and upgrade, see the
[Quality Journey operator guide](quality-journey-operator-guide.md).

Start the AppraiseJS MCP server using the package script defined in `packages/appraisejs/package.json`. Register the connected client with its actual transport and current target workspace before attempting quality work.

From an early Quality Journey, **Agent setup** opens the selected project's contextual Codex setup guidance and keeps
a project-bound return link to the originating Journey. The page separates setup instructions from the latest
`project_diagnostic` receipt: a missing receipt means readiness has not been observed, and a saved ready receipt is
historical evidence rather than proof that Codex is currently connected.

Run the project diagnostic against the target workspace. A ready diagnostic confirms the application identity, active transport, observed executable capabilities, and target binding. A setup screen alone is not capability evidence.

The server publishes the Journey lifecycle plus general target, runtime, locator, environment, operation, Step
Definition, and repository collaboration tools. The exact inventory, resource list, schemas, and MCP safety
annotations are generated from the canonical contract. Do not copy tool counts into documentation and do not attempt
removed operations.

Collaboration MCP calls must name a registered target, never a raw binding ID. The coordinator derives the target
binding and trusted principal from authenticated local coordinator credentials. Prepare, decision, undo, worker, and
handoff calls persist local state; divergent preparation/proposal and fixed Git execution are truthfully annotated as
open-world effects. A worker registration only records an already-observed session and cannot establish background
wake capability.

Clients should use the generated setup capabilities and contract fixture to verify their connection. Reads are annotated as read-only; deterministic replay operations are annotated as idempotent; execution, publication, stop, and decision operations expose their actual mutation and open-world effects.

## Codex plugin installation and host compatibility

The published `appraisejs` package includes the local `appraise-local` marketplace and the
`appraise-quality-journey` plugin. The plugin is skills-only: it provides canonical workflow guidance and contains no
MCP server, credential, target, handoff ticket, hook, or transition authority.

```bash
appraisejs agent plugin path
appraisejs agent plugin install --json
appraisejs agent compatibility --json
```

Installation registers the package-shipped marketplace when needed and installs the exact package-versioned plugin.
Any mutation reports `reconnectRequired: true`; use a fresh Codex task before checking skill recognition.
`agent compatibility` separately inspects marketplace, plugin version, and the named `appraisejs` MCP registration.
Malformed or unsupported Codex output is reported as unknown rather than guessed as missing. Registration evidence is
not current-task capability evidence, so call `project_diagnostic` after reconnect and supply observed tools,
resources, surface version, contract hash, and selected local target when available.

If the marketplace or plugin CLI is unavailable, use `appraisejs agent setup --json` to register the stdio or HTTP MCP
connection manually. This is the supported fallback, not an automatic downgrade. `appraisejs agent plugin uninstall
--cwd <hub> --json` revokes the selected hub credential before removing guidance. `agent disconnect --cwd <hub> --json`
revokes access while retaining data. MCP registration may remain configured with an inert old credential; remove it
separately with `codex mcp remove appraisejs` if desired. Raw Codex plugin removal alone cannot revoke access.
Explicit `agent reconnect --cwd <hub> --json` rotates credentials, then use setup and a fresh MCP task/transport.
Active work remains subject to local pause/reconciliation. See the
[storage and client compatibility matrix](quality-journey-compatibility.md) for version refusal and trust limits.

An explicit `EXTERNAL_V1` path is available only through its versioned claim, admission, role-specialized submission,
and outcome-read tools. The coordinator derives its sole route principal from the authenticated project credential;
this is `PROJECT_CREDENTIAL_ONLY`, not a human, task, host, or isolation identity. The role-neutral claim/admission
operations cover Requirement Analyzer, Scout, Resource Explorer, Test Scenario Designer, Automator, and Triager;
each submission remains role-specialized and uses the full canonical schema. Claim returns a caller-held assignment
secret and no Factory spawn receipt. Its admission receipt records `hostIsolation: NOT_ATTESTED`; do not present it as
evidence of Codex confinement. Normal managed claims remain the default and retain Factory dispatch.

Pass only the exact caller-held assignment binding—Journey, target, role, work item, attempt, assignment, generation,
lease, secret, and idempotency key—through the generated MCP schema. Do not supply a principal, target-project ID,
or actor; the coordinator derives those values. If a submission acknowledgement is lost, first call
`quality_journey_external_work_outcome_get_v1` with the same binding, operation, and key. Exact accepted retries
replay the durable outcome; changed payloads and stale, expired, cancelled, or revoked bindings are rejected. The
generic `appraisejs mcp-call` command is an MCP client and accepts the identical generated tool argument object; it is
not a bypass or alternate mutation API.

For Journey hosting, use the in-app controls described in the [operator guide](quality-journey-operator-guide.md).
The coordinator can inspect historical desktop metadata with `quality_journey_handoff_inspect`. Desktop ticket
redemption has been retired. Collaboration retains its own independent handoff protocol.

For coordinator setup diagnostics, use the authenticated project diagnostic on the intended hub.

```bash
appraisejs mcp-call project_diagnostic --input-json '{"expectedTargetWorkspacePath":"/absolute/target"}'
```

The bridge reads the current local coordinator identity without printing its bearer token and returns the MCP tool result as JSON. Native clients still need a reconnect when their captured tool schema is stale. If a fresh-state reset removes the coordinator identity while the HTTP sidecar remains alive, the next request rotates the server identity automatically; rerun agent setup or use the bridge so the caller reads the current token.

The Appraise hub base URL is a credential-bearing trust boundary. Configure `--base-url` only with a credential-free
HTTP(S) loopback URL (`localhost`, `127.0.0.1`, or `::1`); the package refuses to send a project identity or bearer
token to another origin. A non-JSON `404` or `405` from an otherwise reachable local URL is reported as
`coordinator_endpoint_mismatch`: verify that `--base-url` points at the Appraise hub and reconnect before retrying.
Coordinator-backed MCP tools return that exact structured envelope as a tool error. Coordinator-backed MCP resources
instead return a sanitized JSON resource payload with the classification, code, operation outcome, target outcome,
and recovery guidance; they never expose a foreign HTTP response body.

When a Journey needs one missing locator, use `locator_ensure` with a registered target reference, the exact `journeyId`, and explicit `allowCreate: true`. The coordinator requires the Journey and requested target to match before any write. Confirm the returned target fingerprint and resource IDs with `locator_search` or the equally Journey-scoped `locator_graph_query`; runtime selector verification is still required before execution.

For the current generated reference and release checks, use the scripts listed in the root `package.json`. Contract drift must be fixed in canonical source before regenerating setup output or scaffold templates.

## Managed Journey hosting

The application owns new Journeys. MCP registration and compatibility diagnostics describe connectivity.
They cannot start managed workers. The operator guide describes migration eligibility and runtime readiness.

## Disconnected external-worker gateway (M02-A)

The package's `src/mcp/external-worker-gateway.ts` provides an additive in-process six-role gateway.
It is not a CLI mode, registered connection or product dispatch path. It captures canonical schemas
without creating a coordinator client or opening a transport. Explicit registration exposes only
role reads and the specialized external write, with strict worker schemas and no resources.
Read preparation filters exact assignment records and projects fixed fields; it never forwards broad
GET/search results. Trusted adapters must supply canonical frozen inputs, current authorization and
independently verified durable acceptance. They are not implemented production integrations in M02-A.

See [M02-A evidence and limits](../tasks/codex-app-server-journeys/m02-a-qualification.md). No role
grant, native inference, credential isolation, OS containment or mandatory M03 host session is
qualified by these deterministic fixtures. Product managed dispatch remains disabled/unimplemented.

## Internal managed-session credentials

M03's [host-neutral sessions](quality-journey-host-sessions.md) use a durable session ID and generation for explicitly selected internal managed Journeys. The coordinator route derives the principal from the authenticated project context; model payloads cannot select it. Existing desktop handoff credentials remain compatibility aliases. No new session activation MCP tool or public managed opt-in is registered by this storage change; restarting a client does not activate a session, change hosting mode or authorize provider dispatch.
