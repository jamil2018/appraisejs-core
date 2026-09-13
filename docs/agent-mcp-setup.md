# MCP Setup For Quality Work

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
--json` removes only the workflow plugin and preserves MCP. For a complete operator-requested disconnect, remove MCP
separately with `codex mcp remove appraisejs`, then reconnect. A retained marketplace registration has no Journey
authority.

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

For an Appraise-prepared Codex handoff, Appraise opens a validated `codex://new` link whose encoded prompt contains
only plugin guidance, Journey/target identifiers, and a one-time ticket. Local targets use their validated absolute
workspace path. Remote targets use an explicit neutral host directory while the normalized HTTP(S) origin remains the
MCP target; the neutral directory is never target authority. If launch is unavailable, copy the same bounded prompt
and paste it into Codex manually. Call `quality_journey_handoff_redeem` with the exact Journey, target, and ticket,
then immediately call `quality_journey_get` and the stage-specific read operation. Appraise reports only that launch
was requested until authenticated redemption is authoritatively observed. URI prefill, user Send, redemption, and
authoritative reads do not authorize Journey work, claim an assignment, or approve takeover. For every mutable stage,
Appraise snapshots the Journey state/revisions, target, active work leases/generations, dispatch adapter/start/receipt,
terminal effect, and pending-event count at preparation; a changed snapshot rejects launch or redemption without
consuming the ticket. The Journey page alone offers a separate short-lived, request-identity-bound takeover approval.
That action re-reads the same state and atomically fences predecessor attempts while reissuing bounded successor
authorization for the same `REPLACEMENT_REQUESTED` logical work item, before fencing any connected predecessor and
making the replacement coordinator session effective. Ambiguous dispatches and expired leases block takeover and are
returned only through the handoff's read-only recovery projection. An effective session generation is required for
every coordinator-facing Journey mutation after takeover, including specialized ingress. Specialized services recheck
the binding inside their write transactions, so a takeover that commits after request admission still prevents the old
generation from committing. Successor authorization retains only the remaining immutable attempt budget; a repeated
takeover cannot reset it. A fenced task cannot create, dispatch, complete, cancel, revoke, or advance Journey work.
Stock Codex has no trusted known-task
reopen capability, so a recorded archived or missing task is recovered with a fresh scoped handoff rather than an
unverified reopen claim. An expired, mismatched, replayed, fenced, or stale ticket must be replaced from the Journey
UI. Requirements, approval receipts, and coordinator bearer credentials are never placed in the URI.

If a delegated task cannot receive native MCP capabilities, use the supported authenticated local bridge instead of creating an ad hoc protocol proxy:

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

## Stock Codex handoff architecture

The accepted [architecture decision](decisions/0004-stock-codex-journey-handoff.md) keeps Appraise as Journey authority
and uses stock Codex with a skills-only plugin plus independently registered MCP. Plugin setup and host compatibility
diagnostics are implemented above. Prepared deep-link prompt prefill and qualified remote-target neutral-host handoff
are implemented for every mutable Journey stage. Later-stage reconnect is monotonic-generation- and
snapshot-fenced, with short-lived local UI takeover approval and read-only external-effect recovery; it does not grant
role execution or replace lifecycle gates.
Opening Codex does not establish a connection or start work: the documented prefill flow requires the user to send,
then authenticated handoff redemption and authoritative state reads. The plugin supplies workflow guidance while
Appraise services enforce lifecycle transitions. No managed provider/fork or background-wake guarantee is introduced.
