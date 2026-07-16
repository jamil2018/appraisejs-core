---
name: appraise-validation-preparation
description: Prepare validation artifacts after exact plan approval without implementing product behavior.
---

# Appraise Validation Preparation

AppraiseJS owns lifecycle and business rules. This skill coordinates test preparation only.

1. Accept only a planning handoff with exact `plan_approved` evidence, target binding, event sequence, and current
   hashes. Read pending events before starting and after each validation-preparation task.
2. Call `plan_start`; acknowledge the approval only after `validation_preparation_started` succeeds.
3. Confirm the returned status permits validation preparation.
4. Author a managed Validation AST from exact Appraise action and locator catalogs; do not create target `automation/`
   files or hand-author canonical validation YAML.
5. Call `validation_ast_check`, then `validation_ast_preview`, and bind compilation to the exact reviewed receipt.
6. Call `validation_ast_compile` only for the exact successful preview and present the returned review URL, operation
   hash, receipt hash, projection hash, and `appraise://` links.
7. Treat canonical entity projection as control-plane data and the immutable runtime capsule as the only managed
   execution authority.
8. Do not implement while approval is pending.
9. Route validation feedback back to validation review and product-scope feedback back to plan review.
10. Proceed toward baseline only after `validations_approved`.

Flag production or `requires_review` files for exact hash-bound approval. Never write lifecycle artifacts or SQLite directly.
