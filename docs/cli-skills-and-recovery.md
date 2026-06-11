# CLI, Skills, and Recovery

The `appraisejs` CLI is an explicit diagnostic and recovery surface. MCP failure never invokes it automatically.
Commands print JSON for machine consumption where lifecycle state or evidence is returned. None commits or pushes.

## Command Reference

| Command                                                            | Mode    | Purpose                                                                |
| ------------------------------------------------------------------ | ------- | ---------------------------------------------------------------------- |
| `appraisejs doctor --json`                                         | local   | Report Git, identity, artifact assurance, and application reachability |
| `appraisejs plan validate-file <file> --json`                      | offline | Validate a version 1 plan                                              |
| `appraisejs plan create --file <file> --offline`                   | offline | Create a new draft only                                                |
| `appraisejs plan create --file <file>`                             | online  | Register a validated plan                                              |
| `appraisejs plan status <id>`                                      | online  | Read lifecycle, revision, hashes, and Appraise links                   |
| `appraisejs plan revise <id> --file <file> --expected-hash <hash>` | online  | Submit an exact-hash revision                                          |
| `appraisejs plan events <id> [--after N]`                          | online  | Read unacknowledged durable events                                     |
| `appraisejs plan ack-event <id> --sequence N`                      | online  | Acknowledge one handled event                                          |
| `appraisejs plan reconnect <id> --connection-id <uuid>`            | online  | Read pending events, then reconnect                                    |
| `appraisejs plan register <id> [--takeover-approved]`              | online  | Register; takeover is explicit                                         |
| `appraisejs validation publish <id> --file <json>`                 | online  | Publish validation review data                                         |
| `appraisejs validation submit <id>`                                | online  | Submit validation review                                               |
| `appraisejs completion <id>`                                       | online  | Read final evidence and follow-ups                                     |

## Output Schemas

Successful outputs are JSON objects. Errors use a non-zero exit and preserve the API message.

```json
{ "ok": true, "schema": "appraise.plan/v1", "planId": "example", "revision": 1, "lifecycle": "draft", "taskCount": 1 }
```

```json
{
  "lease": { "connectionId": "..." },
  "pendingEvents": [{ "sequence": 4, "type": "plan_cancelled" }],
  "cancelled": true,
  "warning": "Pending events must be handled before work resumes."
}
```

## Installed Skills

Workflow skills are under `.agents/skills/appraise-{planning,continuation,validation-preparation,baseline,implementation,completion}`.
They contain orchestration policy only and cite returned `appraise://` links and evidence.

## Recovery Transcripts

### New Plan

`plan validate-file` returns `ok: true`; online `plan create` returns the plan link; the planning skill waits for
`plan_review_ready` before presenting it.

### Change Request

`plan events` returns the remark event; the agent reads current status and revises with `--expected-hash`. A stale hash
returns HTTP 409 and must be resolved by rereading, never overwritten.

### Validation Rejection

The validation-preparation skill reads the rejection event, changes tests or approved files only, republishes, and
waits. Product implementation remains blocked.

### Reconnect

`plan reconnect` reads pending events first. A pending cancellation returns `cancelled: true`; work does not resume.
An active different coordinator returns a conflict unless the user explicitly supplies `--takeover-approved`.

### Final Completion

`completion` returns task, commit, validation, optional-failure, and non-blocking-remark evidence. The completion skill
presents those with Appraise links and waits for exact hash-bound sign-off.
