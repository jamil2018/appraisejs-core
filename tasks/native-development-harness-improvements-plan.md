# AppraiseJS native development-harness improvements

Status: **Implemented and validated; 48-attempt pilot completed, qualification HOLD.**

Follow-up: the user subsequently authorized GPT-6.1 Sol defaults. See
[promotion record](../docs/development-harness/sol61-default-promotion-20261017.md). The completed pilot and
implementation outcome below retain their original qualification status.

Started: 2026-10-17 (Asia/Dhaka).

Authority: the user explicitly requested implementation of this plan and commit/push to the current branch on
2026-10-17. This supersedes the earlier deferral. Active M02 files, product lifecycle gates, historical receipts,
and unrelated graph output remain outside this change. No merge or release is included.

## Summary

Improve accuracy, speed, and token efficiency using the existing harness, Graphify, validation registry, and Codex
capabilities.

**No external optimization libraries, proxies, plugins, or third-party trials are included.** Caveman, RTK,
Context-mode, and LLMLingua remain outside this implementation.

The selected approach is balanced efficiency with reviewed, versioned model updates. Model guidance and host
capabilities must be refreshed when implementation begins; the proposed GPT-6.1 Sol target reflects the planning
review on 2026-10-17, not an automatic instruction to substitute future models.

## 1. Update models and repair host compatibility

- [x] Evaluate GPT-6.1 Sol as the replacement for GPT-6 Sol, preserving current reasoning levels initially.
- [x] Retain Luna for investigation and Astra for exceptional review.
- [x] Keep reviewed, versioned model defaults. Add an on-demand currency report identifying newer models, official
      sources, and host compatibility; never upgrade automatically.
- [x] Separate logical roles from host registrations. Provide explicit registrations for approved higher-effort and
      Astra variants.
- [x] Emit only host-supported spawn arguments. Replace numeric transcript inheritance with `fork_turns: "none"`
      plus bounded assignment packets.
- [x] Preserve independent solver/judge context, fail-closed behavior, and historical receipts. Distinguish requested
      configuration from observed execution.

## 2. Make existing validation efficient and consistent

- [x] Connect pre-commit to the existing change-based validation registry.
- [x] Include harness checks for harness changes; skip code-analysis checks only for recognized documentation-only
      changes.
- [x] Preserve broad validation for unknown/configuration changes and correct handling of staged, unstaged,
      untracked, renamed, and deleted files.
- [x] Add tests through the actual hook entrypoint.
- [x] Measure fingerprint traversal overhead, then restrict scanning to relevant roots while preserving hashes and
      invalidation behavior. Keep the optimization only if measurements demonstrate improvement.

## 3. Reduce context and coordination overhead

- [x] Use scoped Graphify queries for relationships and targeted source search for exact implementation details.
      Check graph freshness before relying on it.
- [x] Consolidate duplicated harness guidance into canonical references and short entrypoints without removing
      authority or validation requirements.
- [x] Use bounded assignment packets containing the objective, relevant evidence, constraints, and acceptance
      criteria.
- [x] Keep trivial, strongly verifiable tasks coordinator-only. Delegate distinct unresolved work; reserve
      independent review for consequential uncertainty and stable artifacts.
- [x] Summarize routine tool output while retaining failures, exit codes, source references, and access to full
      diagnostics.
- [x] Preserve stable reusable context where controllable. Measure native cache usage when exposed; do not introduce
      proxy-based cache management.

## 4. Measure and qualify improvements

- [x] Populate existing duration, token, retry, and model-use fields from available host telemetry.
- [x] Extend run records with nullable cache usage, tool-output volume, measurement provenance, and harness version.
      Missing data remains unknown.
- [x] Establish eight frozen representative tasks spanning discovery, localized fixes, UI work, cross-module
      implementation, and consequential review. Run two repetitions per comparison arm in disposable checkouts.
- [x] Compare the model upgrade separately from workflow optimizations, holding other variables constant.
- [x] Count failures, retries, setup overhead, and manual corrections. Report paired results and incomplete runs.
- [x] Require no observed correctness or required-review regression. Promote an efficiency change only when it
      improves median total tokens or elapsed time by at least 10%, without worsening the other by more than 5%.
      Treat results as pilot evidence.

Measurement preparation must precede comparative runs and promotion, even though it is grouped separately here.
Absent telemetry cannot establish a passing efficiency criterion. Do not equate synthetic fixture timing with
end-to-end productivity or estimate subscription charges from API prices.

## Validation and rollout

- [x] Test unsupported host combinations, unavailable registrations, historical receipts, context isolation,
      diagnostic preservation, nonzero exits, stale graphs, and cache invalidation.
- [x] Run focused lint/format checks, harness suites, applicable build/configuration checks, and hook integration
      tests.
- [x] Update current harness documentation and obtain independent review of the stable artifact.
- [x] Promote changes separately, preserving rollback configuration and evaluation history.
- [x] Preserve unrelated worktree changes, active M02 work, historical evidence, and Appraise-owned product
      lifecycle gates.

External tooling may be reconsidered later only if native measurements expose a specific unresolved gap; that would
require a separate proposal. Implementation does not include push, merge, release, or product runtime qualification
unless separately authorized.

## Planning evidence and refresh points

The read-only planning review found exact model/effort pins in `config/development-harness/selection-policy.json`
and `.codex/agents/`, host-incompatible numeric inheritance in `scripts/lib/harness-selection.mjs`, and a mismatch
between pre-commit execution and the validation registry. The local journal's 67 scored runs lacked duration and
input/output-token measurements. These are dated observations to recheck, not immutable current-state assertions.

The planning review passed 41 focused tests using:

```sh
node --test scripts/tests/harness-selection.test.mjs scripts/tests/swarm-routing.test.mjs scripts/tests/harness-validation.test.mjs
```

That result does not prove future artifact correctness or actual host compatibility. No model upgrade or
optimization was implemented during planning.

Relevant entrypoints:

- `AGENTS.md`, `docs/development-harness.md`, and the swarm-orchestrator skill.
- `config/development-harness/`, `.codex/config.toml`, and `.codex/agents/`.
- `scripts/lib/harness-selection.mjs`, `scripts/lib/swarm-router.mjs`, and
  `scripts/lib/harness-validation.mjs`.
- `tasks/todo.md`, `tasks/plan.md`, and active task-specific registers/checkpoints, including
  `tasks/codex-app-server-journeys/` while applicable.
- [Official model guidance](https://learn.chatgpt.com/docs/models).
- [Official prompt caching guidance](https://developers.openai.com/api/docs/guides/prompt-caching).

## Implementation outcome

The native pilot attempted all 48 frozen cases: 46 completed, one capacity failure, and one timeout. Missing effective
model/retry evidence and incomplete pairs keep both comparison arms unqualified. GPT-6 Sol defaults remain unchanged;
GPT-6.1 Sol registrations are explicit candidates only. The independently reviewed implementation and sanitized
evaluation history ship to the existing branch under the user authorization above. No merge or release is included.

Checked items record implementation and evaluation of the requirement, not approval of a model promotion. Compatibility
repairs and registry integration pass deterministic checks. The retained fingerprint optimization has a separate
99% traversal improvement with equal hashes; it establishes no end-to-end productivity claim.

Implementation evidence and pilot outcome are recorded in `docs/development-harness/native-improvements-20261017.md`.
