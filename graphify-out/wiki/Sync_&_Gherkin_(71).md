# Sync & Gherkin (71)

> 20 nodes · cohesion 0.16

## Key Concepts

- **sync-environments.ts** (15 connections) — `scripts/sync-environments.ts`
- **sync-template-steps.ts** (14 connections) — `scripts/sync-template-steps.ts`
- **runSyncScript()** (11 connections) — `scripts/lib/sync-script-runner.ts`
- **sync-script-runner.ts** (11 connections) — `scripts/lib/sync-script-runner.ts`
- **main()** (6 connections) — `scripts/sync-environments.ts`
- **main()** (4 connections) — `scripts/sync-template-steps.ts`
- **syncStepsToDatabase()** (4 connections) — `scripts/sync-template-steps.ts`
- **buildEnvironmentObjects()** (3 connections) — `scripts/sync-environments.ts`
- **readEnvironmentsFromFile()** (3 connections) — `scripts/sync-environments.ts`
- **syncEnvironmentsToDatabase()** (3 connections) — `scripts/sync-environments.ts`
- **scanStepFiles()** (3 connections) — `scripts/sync-template-steps.ts`
- **ParsedStep** (2 connections) — `scripts/lib/step-file-parser.ts`
- **getEnvironmentIdentityKey()** (2 connections) — `scripts/sync-environments.ts`
- **normalizeEnvironmentName()** (2 connections) — `scripts/sync-environments.ts`
- **normalizeFunctionDefinition()** (2 connections) — `scripts/sync-template-steps.ts`
- **normalizeOptionalText()** (2 connections) — `scripts/sync-template-steps.ts`
- **EnvironmentConfig** (1 connections) — `scripts/sync-environments.ts`
- **EnvironmentData** (1 connections) — `scripts/sync-environments.ts`
- **SyncResult** (1 connections) — `scripts/sync-environments.ts`
- **SyncResult** (1 connections) — `scripts/sync-template-steps.ts`

## Relationships

- [[Locators & Picker (11)]] (71 shared connections)
- [[Templates & Flow Builder (64)]] (3 shared connections)
- [[Shared UI Components (115)]] (3 shared connections)
- [[Locators & Picker (37)]] (2 shared connections)
- [[Locators & Picker (105)]] (2 shared connections)
- [[Locators & Picker (46)]] (2 shared connections)
- [[Sync & Gherkin (81)]] (2 shared connections)
- [[Sync & Gherkin]] (2 shared connections)
- [[Test Runs]] (1 shared connections)
- [[Test Hierarchy CRUD]] (1 shared connections)
- [[Test Runs (18)]] (1 shared connections)
- [[Templates & Flow Builder (47)]] (1 shared connections)

## Source Files

- `scripts/lib/step-file-parser.ts`
- `scripts/lib/sync-script-runner.ts`
- `scripts/sync-environments.ts`
- `scripts/sync-template-steps.ts`

## Audit Trail

- EXTRACTED: 87 (96%)
- INFERRED: 4 (4%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*