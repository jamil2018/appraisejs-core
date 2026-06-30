---
name: appraise-validation-preparation
description: Prepare validation artifacts after exact plan approval without implementing product behavior.
---

# Appraise Validation Preparation

AppraiseJS owns lifecycle and business rules. This skill coordinates test preparation only.

1. Read pending events before starting and after each validation-preparation task.
2. Confirm the returned status permits validation preparation.
3. Create AppraiseJS-native validation artifacts, not product implementation: `ValidationArtifact`, validation nodes,
   `automation/features`, `automation/steps`, executable metadata, browser/environment matrix, expected failures,
   changed-file evidence, manifest paths, and `appraise/plans/validations/<plan-id>.validation.yaml`.
4. Inspect and prefer existing registry/template steps before creating custom step definitions. Common navigation,
   click, hover, input, wait, visibility, text, URL, store, and random-data flows should reuse template steps; simple
   todo CRUD validations should usually create zero new custom step definitions.
5. Any custom step requires a gap justification that names the missing reusable capability and explains why locators
   plus existing registry/template steps are insufficient.
6. Call `validation_publish` before claiming validations are reviewable.
7. Publish validation nodes and changed-file evidence.
8. Present returned direct validation review URL, `appraise://` links, hashes, manifest paths, reused step paths, and
   new custom step paths for review.
9. Do not implement while approval is pending.
10. Route validation artifact feedback back to validation review and product-scope feedback back to plan review.
11. Proceed toward baseline only after `validations_approved`.

Flag production or `requires_review` files for exact hash-bound approval. Never write lifecycle artifacts or SQLite directly.
