# Plan builder hardening implementation plan

## Goal

Implement the four approved improvements discovered during the Notify happy-path audit without weakening Appraise-owned lifecycle gates.

## Delivery slices

1. Improve reusable action and template-step ranking with phrase-aware, field-weighted semantic scoring and regression tests for misleading token overlaps.
2. Fold safe review-state reconciliation into validation review submission while preserving immutable publication and human-decision checks.
3. Add runtime collection and assertions for browser console errors and failed network activity, and require both in the simple happy-path authoring profile.
4. Add a bounded, stable efficiency snapshot to completion review receipts, including phase duration, retries, calls, and response bytes.
5. Update lifecycle/runtime/MCP documentation, synchronize scaffold templates, regenerate Graphify outputs, and run focused plus broad validation.

## Constraints

- Preserve all existing worktree changes and lifecycle artifacts.
- Do not bypass plan, validation, baseline, implementation, or completion approval gates.
- Change canonical root source before synchronized template/generated artifacts.
- Keep completion evidence hashing deterministic.
