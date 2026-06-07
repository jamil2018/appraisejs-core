# Session 08: CLI, Skills, and Recovery

## Goal

Expose diagnostics and explicit fallback through CLI, and provide harness skills that correctly orchestrate the full
review, validation, implementation, and recovery workflow.

## Work

1. Add `appraisejs doctor`, `appraisejs plan validate-file`, and MCP bootstrap diagnostics.
2. Add online status, revision, event, validation, and recovery commands over the internal API.
3. Permit offline creation of a new draft only; forbid offline lifecycle mutation.
4. Add planning, continuation, validation-preparation, baseline, implementation, and completion skill workflows.
5. Add reconnect behavior that reads pending events before any work resumes.
6. Add clear Git/non-Git, uncommitted artifact, reduced reproducibility, and coordinator takeover warnings.

## Required Rules

- Skills contain orchestration policy only, never lifecycle/business rules or direct artifact/SQLite writes.
- Skills do not implement while awaiting plan, validation, baseline, or final approval.
- Skills check events at every mandatory checkpoint.
- The coordinator reports optional failures and non-blocking remarks after implementation.
- CLI cannot impersonate an active coordinator or silently take over.
- No command commits or pushes.

## Acceptance Criteria

- Offline and online capability boundaries are tested.
- MCP failure gives actionable recovery and never silently falls back.
- Reconnect, pending cancellation, stale revision, and takeover paths are demonstrated.
- Skills cite returned Appraise links and evidence rather than claiming approval or success from chat text.

## Handoff

Provide command reference, machine-readable output schemas, installed skill locations, and end-to-end transcripts for
new plan, change request, validation rejection, reconnect, and final completion.
