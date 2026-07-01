# Provider Run Orchestration

Provider-native runs are experimental and disabled by default. The canonical workflow is MCP-first: a user starts a
planning session from their coding agent through Appraise MCP, and AppraiseJS reflects the plan, review, validation,
and approval layers back into the app.

To opt into this experimental surface, start AppraiseJS with:

```bash
APPRAISE_EXPERIMENTAL_PROVIDER_RUNS=true npm run dev
```

Provider runs are Appraise-owned workflow execution attempts. They attach a target project, optional plan, provider
adapter, launch prompt, capability snapshot, durable event stream, permission decisions, and artifact snapshots to one
recoverable record.

The important boundary is lifecycle ownership:

- Provider sessions, thread IDs, process IDs, and transcripts are evidence, not source of truth.
- Appraise plan review, validation review, baseline acceptance, implementation checkpoints, completion approval, and
  cancellation remain authoritative.
- Provider exit status updates only the provider run status. It does not approve a plan, publish validation, accept a
  baseline, start implementation, or complete work.

## Experimental Surface

The first implementation ships a deterministic mock planning adapter and a `/provider-runs` console. This gives the
product a durable contract before wiring real provider binaries:

- `ProviderAdapterRegistration` stores adapter identity and current advertised capabilities.
- `ProviderWorkflowRun` stores the launch prompt, target project, optional plan link, lifecycle phase, provider
  identifiers, capability snapshot, repo snapshots, status, and failure/cancellation fields.
- `ProviderRunEvent` stores an ordered event stream.
- `ProviderPermissionDecision` stores Appraise-visible permission decisions.
- `ProviderArtifactSnapshot` stores later evidence and artifact hashes.

The mock adapter supports launch, stream events, cancellation, permission callbacks, MCP injection metadata, workspace
sandbox metadata, structured output, and log replay. Resume and continuation are intentionally false until a real
adapter proves those behaviors.

## Real Provider Adapter Contract

Real adapters should implement `src/lib/provider-runtime/provider-adapter.ts` and normalize output into provider run
events:

- `provider_run_started`
- `provider_event_streamed`
- `provider_permission_requested`
- `provider_artifact_changed`
- `provider_run_paused`
- `provider_run_failed`
- `provider_run_cancelled`
- `provider_run_completed`

Adapters must be partial and honest. A CLI adapter can expose launch, stream, cancel, and MCP injection while leaving
resume, continuation, and structured replay disabled.

## MCP Compatibility

MCP-first clients are the primary workflow. Provider-run MCP resources and tools are registered only when
`APPRAISE_EXPERIMENTAL_PROVIDER_RUNS=true` and must call service/API boundaries rather than writing Prisma records
directly. Provider-run tools may create, read, cancel, resume, or decide permissions only where those operations do not
bypass Appraise lifecycle gates.
