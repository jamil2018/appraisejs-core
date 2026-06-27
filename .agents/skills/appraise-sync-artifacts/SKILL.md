---
name: appraise-sync-artifacts
description: Work with automation sync outputs without patching generated artifacts incorrectly.
---

# Appraise Sync Artifacts

Use this skill for automation sync, generated features, locators, environments, tags, suites, cases, or template steps.

1. Read `docs/automation-sync-rules.md` and `docs/agent-generated-artifacts.md`.
2. Identify whether the touched file is authored source, sync-managed output, or runtime output.
3. Prefer source data, generator logic, parser logic, or sync scripts over direct generated-output edits.
4. Use dry-run sync commands when available before committing generated diffs.
5. Explain generated diffs in the final summary when they are intentionally carried forward.
