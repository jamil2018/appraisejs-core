# Session 07: Implementation Checkpoints and Completion

## Goal

Coordinate approved implementation, targeted TDD reruns, midstream feedback, final evidence, and explicit user
completion.

## Work

1. Add task states `pending`, `in_progress`, `implemented`, and `verified`.
2. Enforce typed dependencies and approved implementation groups.
3. Add coordinator checkpoints before/after tasks or groups, before validation, and before completion.
4. Compute affected tasks and transitive dependents for blocking remarks, with user confirmation.
5. Add pause/resume/cancel behavior and stage-aware change-request routing.
6. Run impacted validations during development and a fresh full required matrix at completion.
7. Add final review with tasks, commits/hashes, evidence, acknowledged failures, optional failures, and non-blocking
   remarks.

## Required Rules

- Queued feedback immediately states that it will be acknowledged at the next checkpoint.
- Independent tasks may continue unless plan-wide pause is selected.
- Ordinary expected TDD failures do not require user acknowledgement; scope, test-definition, infrastructure, or
  repeated failures escalate.
- User confirms the coordinator's impact analysis before unaffected approvals survive.
- Required tasks reach `verified`; required validations pass fresh runs.
- Passing tests produce `validation_passed`, not `completed`.
- Only explicit final user approval completes the plan.
- Rejected completion requires blocking feedback and routes to the smallest safe earlier gate.
- Optional failures and non-blocking remarks become follow-up, dismissal, or leave-open decisions.

## Acceptance Criteria

- Checkpoint polling, parallel independent tasks, groups, dependency pauses, and event races are covered.
- Cancellation asks separately whether active runs should stop.
- Required evidence is protected from cleanup until final completion.
- Unchanged pre-existing failure acknowledgements carry forward; changed or new failures do not.

## Handoff

Publish checkpoint protocol, task/group status rules, impact-analysis payload, completion review model, and examples of
each feedback route.
