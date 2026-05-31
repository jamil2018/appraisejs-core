# Locators & Picker (4)

> 64 nodes · cohesion 0.06

## Key Concepts

- **test-run-service.ts** (64 connections) — `src/services/test-run/test-run-service.ts`
- **test-run-service.test.ts** (24 connections) — `src/services/test-run/test-run-service.test.ts`
- **test-suite-service.ts** (20 connections) — `src/services/test-suite/test-suite-service.ts`
- **test-run-form-opts.ts** (11 connections) — `src/constants/form-opts/test-run-form-opts.ts`
- **ensureTestSuiteIdentifierTags()** (10 connections) — `src/lib/test-suite-identifier-service.ts`
- **test-run-form-helpers.ts** (10 connections) — `src/app/(base)/test-runs/test-run-form-helpers.ts`
- **test-suite-identifier-service.ts** (10 connections) — `src/lib/test-suite-identifier-service.ts`
- **test-run-helpers.ts** (8 connections) — `src/services/test-run/test-run-helpers.ts`
- **test-suite-service.test.ts** (8 connections) — `src/services/test-suite/test-suite-service.test.ts`
- **getIdentifierTagByPrefix()** (7 connections) — `src/lib/tag-filters.ts`
- **testRunSchema** (6 connections) — `src/constants/form-opts/test-run-form-opts.ts`
- **constants.ts** (6 connections) — `src/services/shared/constants.ts`
- **getTestRunLogsService()** (6 connections) — `src/services/test-run/test-run-service.ts`
- **createTestSuiteFromInput()** (6 connections) — `src/services/test-suite/test-suite-service.ts`
- **updateTestSuiteFromInput()** (6 connections) — `src/services/test-suite/test-suite-service.ts`
- **TestRun** (5 connections) — `src/constants/form-opts/test-run-form-opts.ts`
- **getOrCreateTestSuiteIdentifierTagId()** (5 connections) — `src/lib/test-suite-identifier-service.ts`
- **generateUniqueTestSuiteIdentifier()** (5 connections) — `src/lib/test-suite-utils.ts`
- **listTestRuns()** (5 connections) — `src/services/test-run/test-run-service.ts`
- **persistLogsAndUpdateRunStatus()** (5 connections) — `src/services/test-run/test-run-service.ts`
- **resolveSuiteTestRunFilters()** (5 connections) — `src/services/test-run/test-run-service.ts`
- **deleteTestSuitesByIds()** (5 connections) — `src/services/test-suite/test-suite-service.ts`
- **getTestSuiteByIdOrThrow()** (5 connections) — `src/services/test-suite/test-suite-service.ts`
- **listTestSuites()** (5 connections) — `src/services/test-suite/test-suite-service.ts`
- **log-formatter.ts** (4 connections) — `src/lib/test-run/log-formatter.ts`
- *... and 39 more nodes in this community*

## Relationships

- [[Locators & Picker (6)]] (23 shared connections)
- [[Locators & Picker (5)]] (11 shared connections)
- [[Test Runs (3)]] (11 shared connections)
- [[Shared UI Components (100)]] (6 shared connections)
- [[Test Runs (18)]] (6 shared connections)
- [[Test Runs (50)]] (5 shared connections)
- [[Locators & Picker (83)]] (5 shared connections)
- [[Test Runs (62)]] (5 shared connections)
- [[Shared UI Components (115)]] (4 shared connections)
- [[Locators & Picker (91)]] (4 shared connections)
- [[Locators & Picker (26)]] (4 shared connections)
- [[Test Runs (19)]] (3 shared connections)

## Source Files

- `src/app/(base)/test-runs/test-run-form-helpers.test.ts`
- `src/app/(base)/test-runs/test-run-form-helpers.ts`
- `src/constants/form-opts/test-run-form-opts.ts`
- `src/lib/tag-filters.ts`
- `src/lib/test-run/log-formatter.ts`
- `src/lib/test-run/winston-logger.ts`
- `src/lib/test-suite-identifier-service.ts`
- `src/lib/test-suite-utils.ts`
- `src/services/shared/constants.ts`
- `src/services/test-run/test-run-helpers.ts`
- `src/services/test-run/test-run-service.test.ts`
- `src/services/test-run/test-run-service.ts`
- `src/services/test-suite/test-suite-service.test.ts`
- `src/services/test-suite/test-suite-service.ts`

## Audit Trail

- EXTRACTED: 328 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*