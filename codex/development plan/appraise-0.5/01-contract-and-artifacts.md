# Session 01: Contract and Artifacts

## Goal

Define and freeze the framework-neutral V1 contract for plans, reviews, validations, layouts, lifecycle transitions,
stable node identity, and domain errors.

## Work

1. Create canonical Zod schemas and TypeScript types for all four artifacts.
2. Implement deterministic safe YAML/JSON parsing and serialization.
3. Implement one lifecycle transition table and approval-invalidation rules.
4. Define append-only remark threads, file approvals, expected failure signatures, and evidence references.
5. Generate package-compatible contract copies and add a drift check.

## Required Decisions

- IDs are lowercase kebab-case and stable across revisions.
- Remark targets include plan-wide, task, validation, result, and file targets.
- Approval records bind exact revision and relevant hashes.
- Runtime-owned evidence and terminal results cannot be authored through artifacts.
- Unknown versions, duplicate keys/IDs, invalid timestamps, unsafe aliases, files over 1 MB, and invalid transitions fail
  with stable domain errors.
- Suspicious node replacement produces a blocking identity-confirmation issue; it never rewrites IDs automatically.

## Likely Areas

- New framework-neutral plan contract modules under `src/lib`
- Package generation scripts and `packages/appraisejs`
- Contract fixtures and focused Vitest tests

## Acceptance Criteria

- Every lifecycle transition and rejection has table-driven tests.
- Root and package contracts accept and reject identical fixtures.
- Parse/serialize round trips are deterministic with LF endings.
- Append-only history cannot be silently deleted or reordered.
- Contract code has no Next.js, Prisma, or root alias dependency.

## Handoff

Publish the frozen schema version, lifecycle diagram, error list, generated-code command, and fixture locations. No
dependent session may duplicate lifecycle or approval rules.
