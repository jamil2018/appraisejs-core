# Coordinator API and MCP Contract

AppraiseJS 0.5 permits one stable coordinator identity to own a plan. Subagents remain internal to that coordinator
and do not register directly.

## Project Identity and Transport

- The local credential file is `.appraisejs/coordinator.json`. The directory is Git-ignored, created with mode `0700`,
  and the file with mode `0600`.
- The project fingerprint is SHA-256 over the canonical `realpath` project directory and optional package name.
- `package.json` is optional. Generic directories are valid coordinator projects. When the file exists it must be
  valid JSON, and `name`, when present, must be a string.
- API requests send `Authorization: Bearer <token>` and `X-Appraise-Project: <fingerprint>`.
- Only `localhost`, `127.0.0.1`, and `::1` request URLs, Host headers, and Origins are accepted.
- Request bodies are limited to 1 MiB.
- MCP uses stdio. Stdout is reserved for MCP protocol traffic; diagnostics go to stderr.
- MCP failures are returned to the MCP client and never invoke a CLI fallback.
- A coordinator is bound to one canonical project. A different project fingerprint returns `project-mismatch`
  with the requested and server fingerprints; an invalid token for the matching project remains `UNAUTHORIZED`.
- Local diagnostic and ownership responses may include the canonical project path. Tokens are never returned.

## Diagnostics and Recovery

`appraisejs doctor --json` initializes local identity before evaluating it and classifies failures as identity
bootstrap, transport, HTTP response, authentication, or project mismatch errors. Transport failures include the
configured endpoint and sanitized original cause. A hostname alternative is not presented as the cause unless an
actual probe produced transport evidence.

After correcting identity, endpoint, or project binding, restart or reconnect the MCP client so tool discovery uses
fresh credentials. Bootstrap failures print the diagnostic category and the `appraisejs doctor --json` recovery
command to stderr.

Online CLI plan creation accepts files inside `--cwd` after resolving both paths through `realpath`. External,
traversal, and symlink-resolved external files are blocked before an API request. Use
`--allow-external-plan-file` only for intentional cross-project submission; the create response then includes an
`external-plan-source` warning. Create responses include the coordinator fingerprint, canonical project path, and
canonical source path when supplied by the CLI.

## Lease Defaults and Recovery

- A coordinator lease lasts 30 seconds and is renewed through heartbeat.
- Reconnect requires the same coordinator ID and current connection ID.
- A different identity is rejected while the lease is active unless the user has approved takeover.
- An expired lease may be acquired without takeover approval.
- A heartbeat after expiry fails; the coordinator must register again.

## Durable Events

Events have a monotonically increasing sequence per plan. Reads and long-poll delivery never acknowledge an event.
The coordinator acknowledges a sequence explicitly, and repeated acknowledgement is idempotent.

Delivery is at least once: an unacknowledged event is returned again. `plan_cancelled` supersedes earlier,
unacknowledged progression events. Event ordering is authoritative by sequence, not timestamp.

The current event vocabulary includes:

- `plan_graph_processing_started`
- `plan_review_ready`
- `plan_revision_submitted`
- `validation_preparation_started`
- `task_updated`
- `plan_cancelled`
- `implementation_checkpoint`
- `implementation_feedback_applied`
- `implementation_paused`
- `implementation_resumed`
- `validation_failed`
- `validation_passed`
- `plan_completed`

Future lifecycle sessions may add event types without changing delivery semantics. Approval events must be acknowledged
only after the transition they permit succeeds. New blocking feedback must invalidate an approval that has not started
its permitted transition.

## Internal API

All routes are under `/api/internal/coordinator`.

| Method | Path                                          | Purpose                                              |
| ------ | --------------------------------------------- | ---------------------------------------------------- |
| `POST` | `/register`                                   | Acquire, reconnect, or take over a coordinator lease |
| `POST` | `/heartbeat`                                  | Renew a coordinator lease                            |
| `POST` | `/plans`                                      | Create a structured plan                             |
| `GET`  | `/plans/:planId`                              | Read the plan and exact content hash                 |
| `PUT`  | `/plans/:planId`                              | Submit a higher revision with an expected hash       |
| `POST` | `/plans/:planId/start`                        | Start validation preparation after plan approval     |
| `POST` | `/plans/:planId/tasks/:taskId`                | Publish a task progress event                        |
| `GET`  | `/plans/:planId/events`                       | Read events; `after` and `wait=true` are supported   |
| `POST` | `/plans/:planId/events/ack`                   | Acknowledge one sequence                             |
| `POST` | `/plans/:planId/implementation/checkpoint`    | Poll a named implementation checkpoint               |
| `POST` | `/plans/:planId/implementation/tasks/:taskId` | Transition a task state                              |
| `POST` | `/plans/:planId/implementation/feedback`      | Analyze or apply confirmed blocking feedback         |
| `POST` | `/plans/:planId/implementation/control`       | Pause, resume, or cancel implementation              |
| `POST` | `/plans/:planId/implementation/validations`   | Record fresh validation evidence                     |
| `GET`  | `/plans/:planId/completion`                   | Read the final completion review                     |
| `POST` | `/plans/:planId/implementation/complete`      | Apply explicit final user approval                   |

The create response includes coordinator ownership metadata and the stable review URL only after
`plan_review_ready` is durably appended.

## MCP Surface

Run `appraisejs mcp --cwd <project> --base-url http://127.0.0.1:3000`.

Resources:

- `appraise://project`
- `appraise://plans/{planId}`

Tools:

- `coordinator_register`
- `coordinator_heartbeat`
- `plan_create`
- `plan_read`
- `plan_wait_for_review`
- `plan_revise`
- `plan_start`
- `plan_task_update`
- `plan_events_read`
- `plan_event_acknowledge`
- `validation_publish`
- `validation_decide`
- `validation_file_approve`
- `validation_review_submit`
- `implementation_checkpoint`
- `implementation_task_update`
- `implementation_feedback`
- `implementation_control`
- `implementation_completion_review`
- `implementation_complete`

## Local Smoke Test

With AppraiseJS running on port 3000:

```bash
npm run smoke:coordinator
```

The smoke test creates a minimal plan through the authenticated API and waits for its `plan_review_ready` event.
