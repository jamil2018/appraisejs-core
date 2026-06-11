---
name: appraise-baseline
description: Coordinate baseline execution and acceptance through AppraiseJS.
---

# Appraise Baseline

AppraiseJS owns lifecycle and business rules. This skill starts and observes approved baseline runs.

1. Read pending events before each run and before presenting results.
2. Run only validation combinations returned as approved and runnable.
3. Treat setup, undefined-step, infrastructure, timeout, and unmatched failures as invalid baselines.
4. Present Appraise test-run evidence and returned `appraise://` links.
5. Wait for explicit baseline acceptance or change requests.
6. Do not implement while approval is pending.

Do not infer acceptance from conversation text or mutate baseline records directly.
