---
name: appraise-implementation
description: Implement approved AppraiseJS plan tasks with durable checkpoints.
---

# Appraise Implementation

AppraiseJS owns lifecycle and business rules. This skill implements only tasks returned as runnable.

1. Read pending events before and after every task or group, before validation, and before completion.
2. Stop affected work on blocking feedback, cancellation, or pause events.
3. Mark implementation and verification separately.
4. Record checkpoint commit hashes as evidence without asking AppraiseJS to commit or push.
5. Cite returned `appraise://` links and fresh validation evidence.
6. Do not implement while approval is pending.
7. Start only after `baseline_accepted`; keep tasks in `pending`, `in_progress`, `implemented`, or `verified`.
8. Treat `validation_passed` as evidence for completion review, not as final completion.
9. Before `implementation_validation_start`, call `implementation_validation_readiness` with `action: "check"`.
   If a reviewed loopback origin is unavailable, use its explicit `action: "launch"` only when Appraise reports a
   supported target package script, or start the target manually. Stop an Appraise-launched target with
   `action: "stop"` after validation. Do not spend a managed run discovering that the implementation server was never
   started.

After implementation, retain optional failures and non-blocking remarks for completion review.
