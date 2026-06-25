# 10 - Final Validation and Completion

## Goal

Prove completion requires fresh validation evidence, correct final lifecycle order, and explicit user sign-off.

## Builds On

- Pass 09 completed implementation checkpoints and impacted validation reruns.

## Validation Scope

- Fresh required validation runs.
- Baseline regression health.
- `validation_passed` before `completed`.
- Explicit final user sign-off.
- Optional failure handling.
- Unresolved non-blocking remark follow-up, dismiss, or leave-open decision.
- Completion evidence review through UI/API/MCP/CLI where applicable.

## Suggested Actions

1. Run all required final validations after implementation changes.
2. Attempt completion before validation passes and confirm it is blocked.
3. Submit completion evidence with logs, reports, traces, screenshots, and unresolved optional failures.
4. Require explicit user completion approval for the current evidence hash.
5. Verify non-blocking remarks are handled or intentionally left open.

## Evidence To Capture

- Final validation run IDs and evidence links.
- Lifecycle transition evidence from implementation to `validation_passed` to `completed`.
- Completion review artifact or API response with explicit approval.

## Exit Criteria

- Completion cannot be reached without fresh validation and explicit final sign-off.
- Next pass may prove a newly scaffolded app follows the same lifecycle.
