# Session 09: Integration, Scaffolds, and Release

## Goal

Prove adapter parity and recovery, synchronize scaffolded applications, document the combined workflow, and prepare
AppraiseJS 0.5 for release.

## Work

1. Add contract-level parity tests across UI actions, internal API, MCP, and online CLI.
2. Add concurrency and failure-recovery tests across files, projection, events, leases, graph jobs, and test runs.
3. Build a demo using existing tagged Appraise assets.
4. Document artifact contracts, review gates, Git behavior, coordinator limitations, and operational recovery.
5. Sync canonical root changes into templates and `create-appraisejs`.
6. Run focused quality gates, Prisma checks, package/root/scaffold builds, E2E validation, and template diff review.

## Required Scenarios

- Plan creation through MCP and review-ready URL delivery.
- Graph failure with list fallback.
- Plan change request and revision approval.
- Validation generation with production-file block and per-file feedback.
- Rejected validation and corrected resubmission.
- Expected-failure baseline, unrelated-failure acknowledgement, and implementation unlock.
- Mid-implementation scoped pause and coordinator reconnect.
- Final required pass, optional failure, non-blocking follow-up, and user completion.
- Git conflict, event partial failure, app restart, interrupted validation, and non-Git fallback.

## Acceptance Criteria

- Equivalent adapter operations produce identical artifacts, projection, lifecycle, events, and domain errors.
- Scaffold sync follows `docs/scaffold-template-sync.md`; generated copies are never edited directly.
- Local tokens, leases, personal layouts, event rows, locks, and reports are excluded from scaffolds.
- `npm run sync-template` and `npm --prefix packages/create-appraisejs run sync-templates` complete when applicable.
- Focused ESLint/Prettier, relevant Vitest/Playwright/Cucumber checks, quality gates, and builds pass or are explained.
- Generated/runtime residue is cleaned without reverting unrelated work.

## Release Boundary

Ship the complete gated workflow. Defer direct contributor connections, signed approvals, multi-repository
orchestration, automatic Git operations, and shared-layout visual merge tooling.
