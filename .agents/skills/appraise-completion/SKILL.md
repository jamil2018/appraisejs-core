---
name: appraise-completion
description: Present AppraiseJS completion evidence and wait for exact final sign-off.
---

# Appraise Completion

AppraiseJS owns lifecycle and business rules. This skill reports evidence and coordinates final approval.

1. Read pending events before requesting completion review.
2. Present task states, commit hashes, fresh validations, and returned `appraise://` links.
3. Report optional failures and non-blocking remarks as explicit follow-up decisions.
4. Never claim completion from chat text; use the exact content hash and returned sign-off result.
5. Do not implement while approval is pending.
6. Treat `validation_passed` as evidence for completion review, not as final completion.
7. Mark completion only after explicit final approval writes `completed`.

Never write completion artifacts or SQLite directly, and never ask AppraiseJS commands to commit or push.
