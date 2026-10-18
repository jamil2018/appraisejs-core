# M01 remaining request-variant qualification

**Latest no-model result (2026-10-14):** [request-variant results](m01-request-variant-results.md)
now capture actual additional_tools and native RPC-path decline of all four elicitation modes. Never
policy prevents forwarding in the unchanged read-only setup. Client cancellation/permission producer
paths remain unqualified; no external inference or broader permissions. M01 remains partial.

**2026-10-14 correction:** [manifest investigation](m01-manifest-investigation.md) supersedes the
empty-whole-manifest interpretation below. Prior `toolNames: []` inspected only top-level tools;
Responses Lite uses an `additional_tools` input item, whose contents were not retained. Model metadata
selects CodeModeOnly despite the local false feature flag. Historical records remain intact; M01 is
partial. No new turn, inference or permission change occurred during this investigation.

Date: 2026-10-14. Preparation only; no additional model inference authorized.

Update: the repository-only [elicitation fixture](../../scripts/tests/fixtures/codex-app-server-m01/mcp-elicitation-probe.py)
was attempted on the pinned host. Its provider request advertised no tools, so the scripted handler
refused to invent an MCP tool and stopped; no form/URL request was emitted. [Negative host evidence](m01/mcp-elicitation-observation.json).
An earlier event-ledger defect is retained separately. No auth or external inference was used. Treat
the steps below as the still-open qualification plan; investigate the manifest/config/protocol gap
before another start and do not label this attempted fixture a passing cancellation test.

Final comparison: an explicit synthetic prompt naming `m01_fixture.elicit`, with a pre-turn
`mcpServerStatus/list` confirming the catalogued tool, still produced tools=[] and no elicitation.
[Comparison evidence](m01/mcp-explicit-prompt-observation.json). Thus the generic prompt alone does
not explain the missing tool advertisement. No feature flags or permission boundaries were changed;
external inference remains zero for these local-only fixtures. Stop additional fixture starts until
configuration/tool-exposure evidence establishes a safe correction. The cause is still unverified.

The three-turn [native observation](m01-native-results.md) emitted no elicitation or permission requests.
Generic request rejection and the actual experimental dynamic-tool request are already covered;
they do not establish native behavior for these distinct methods in the pinned ServerRequest schema:

- `mcpServer/elicitation/request`: form/openai-form/URL variants.
- `item/permissions/requestApproval`: correlated thread/turn/item and requested permission profile.

Next M01-only fixture: use the pinned binary and an owned disposable stdio MCP stub with synthetic
tool schemas and responses. Have the stub emit harmless elicitation requests; use the existing local
scripted Responses fixture to invoke only the stub, with no external provider access or auth reference.
Record exactly which request variants the host emits, request-ID preservation, refusal response and
whether the host terminates/continues/re-prompts. Refuse approvals; execute no filesystem/network
effect, real login, account token, target access or Appraise lifecycle operation. Permission-request
generation must likewise use a synthetic no-effect fixture; if it cannot be provoked without granting
native effects or M02 work, retain that build-specific limitation and stop.

Before execution, pin the exact request/response schema fields and feature negotiation from the generated
stable/experimental schemas. Form/URL elicitation denial semantics must be tested separately from an
unsupported-method error. No returned URL should be opened; no elicitation answer grants permission.
Retain sanitized configuration/schema/source hashes and request/terminal metadata only, with explicit
timeouts and no ambiguous start resends. Do not weaken the native observer's stop rules to manufacture
coverage. Deterministic malformed/correlation tests and actual pinned-host observations stay distinct.

No M02 gateway/containment/product integration is authorized. This planned fixture and absent-request
evidence do not complete M01. Native provider inference remains capped at the three already consumed
starts; additional inference would require a new explicit grant.
