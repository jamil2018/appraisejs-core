# 09 - Implementation Checkpoints and Feedback

## Goal

Prove implementation proceeds through coordinator-owned checkpoints, handles feedback without losing unaffected
approval, and records task provenance.

## Builds On

- Pass 08 accepted all required baselines and unlocked implementation.

## Validation Scope

- Task and group checkpoints.
- Parallel independent tasks.
- Coordinator-owned subagent provenance.
- Implemented versus verified states.
- Pause, resume, and cancel.
- Queued feedback timing.
- Scoped feedback pausing affected tasks and dependents.
- Unaffected approval preservation.
- Impacted validation reruns.

## Suggested Actions

1. Start implementation only after baseline acceptance.
2. Move tasks through before/after task and before/after group checkpoints.
3. Inject feedback before active task, during active task, and before validation.
4. Verify affected tasks pause and unaffected tasks remain eligible.
5. Record validation reruns for impacted tasks.

## Evidence To Capture

- Checkpoint responses with runnable tasks and queued feedback.
- Task status events and provenance metadata.
- Tests for pause/resume/cancel and scoped feedback dependency behavior.

## Exit Criteria

- Implementation progress is checkpointed and interruptible.
- Next pass may run final validations and completion review.
