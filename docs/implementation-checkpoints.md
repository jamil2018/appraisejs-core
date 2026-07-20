# Implementation Checkpoints and Completion

Implementation begins only after baseline acceptance. The coordinator executes tasks from user-approved implementation
groups and treats `depends-on` and `blocks` edges as execution dependencies. A task moves through `pending`,
`in_progress`, `implemented`, and `verified`; dependencies must be `verified` before a pending task can start.

## Checkpoints and Feedback

The coordinator polls before and after tasks or groups, before validation, and before completion. Feedback received
between polls is queued with an immediate statement that it will be acknowledged at the next named checkpoint.

Blocking feedback produces an impact payload containing directly affected tasks, transitive dependents, approvals that
need confirmation, and independent tasks. The user must confirm this impact before unaffected approvals survive.
Affected tasks and dependents pause; independent tasks may continue unless the user selects a plan-wide pause.
Re-approving an affected implementation group resumes its paused tasks; dependency and task-state checks still decide
which resumed tasks are immediately runnable.

Pause and resume preserve task and evidence state. Cancellation asks separately whether active validation runs should
stop and emits that decision in the cancellation event.

## Validation and Completion

Development may rerun impacted validations. Completion always requires a fresh passing run for every required
validation, every required task at `verified`, and protected evidence. Expected TDD failures do not require
acknowledgement; scope, test-definition, infrastructure, and repeated failures escalate. A pre-existing failure
acknowledgement carries forward only while its signature is unchanged.

A passing matrix emits `validation_passed`; it does not complete the plan. The completion review contains task states,
commit hashes, validation evidence, blocking and non-blocking remarks, and acknowledged failures. Only explicit final
user approval writes `finalSignOff`, changes the lifecycle to `completed`, and releases evidence protection.

Rejected completion must include blocking feedback and route back to the smallest affected task, group, or validation
gate. Optional failures and non-blocking remarks remain explicit follow-up, dismiss, or leave-open decisions.

## Coordinator Surface

Internal API operations use `/api/internal/coordinator/plans/:planId/implementation/*` for checkpoints, task updates,
feedback, pause/resume/cancel, validation results, and completion. `GET /plans/:planId/completion` returns the final
review model. MCP exposes the corresponding `implementation_*` tools.
