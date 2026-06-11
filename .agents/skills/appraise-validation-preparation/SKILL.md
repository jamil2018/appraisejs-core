---
name: appraise-validation-preparation
description: Prepare validation artifacts after exact plan approval without implementing product behavior.
---

# Appraise Validation Preparation

AppraiseJS owns lifecycle and business rules. This skill coordinates test preparation only.

1. Read pending events before starting and after each validation-preparation task.
2. Confirm the returned status permits validation preparation.
3. Create tests and fixtures, not product implementation.
4. Publish validation nodes and changed-file evidence.
5. Present returned `appraise://` links and hashes for review.
6. Do not implement while approval is pending.

Flag production or `requires_review` files for exact hash-bound approval. Never write lifecycle artifacts or SQLite directly.
