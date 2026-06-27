---
name: appraise-runtime-validation
description: Work on test-run execution, logs, reports, Cucumber runtime, Playwright runtime, and validation evidence.
---

# Appraise Runtime Validation

Use this skill for test execution, report parsing, logs, runtime adapters, Cucumber, Playwright, or validation evidence.

1. Read `docs/test-run-runtime.md` and `docs/agent-validation-matrix.md`.
2. Start with the test-run action, service, executor adapter, process manager, logs route, and `cucumber.mjs`.
3. Keep evidence paths clear: browser/UI, Cucumber, Playwright, backend service, or MCP.
4. Use focused tests first, then broader `npm run validate`, E2E, or build checks when shared runtime behavior changed.
5. Report sandbox or infrastructure failures separately from product failures.
