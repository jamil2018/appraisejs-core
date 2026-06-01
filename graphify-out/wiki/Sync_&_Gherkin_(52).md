# Sync & Gherkin (52)

> 25 nodes · cohesion 0.15

## Key Concepts

- **sync-registry.ts** (19 connections) — `src/lib/sync/sync-registry.ts`
- **sync-executor.ts** (17 connections) — `src/lib/sync/sync-executor.ts`
- **sync-actions.ts** (13 connections) — `src/actions/settings/sync-actions.ts`
- **runRequestedSync()** (8 connections) — `src/lib/sync/sync-executor.ts`
- **resolveRequestedSyncExecutionOrder()** (8 connections) — `src/lib/sync/sync-registry.ts`
- **runSyncAction()** (5 connections) — `src/actions/settings/sync-actions.ts`
- **SYNC_ALL_REQUEST_ID** (5 connections) — `src/lib/sync/sync-registry.ts`
- **sync-actions.test.ts** (4 connections) — `src/actions/settings/sync-actions.test.ts`
- **sync-executor.test.ts** (4 connections) — `src/lib/sync/sync-executor.test.ts`
- **parseSyncFailureCause()** (4 connections) — `src/lib/sync/sync-executor.ts`
- **SyncPendingCounts** (4 connections) — `src/lib/sync/sync-pending-counts.ts`
- **isSyncRequestId()** (4 connections) — `src/lib/sync/sync-registry.ts`
- **getSyncPendingCountsAction()** (3 connections) — `src/actions/settings/sync-actions.ts`
- **normalizeOutputLines()** (3 connections) — `src/lib/sync/sync-executor.ts`
- **selectMostRelevantLine()** (3 connections) — `src/lib/sync/sync-executor.ts`
- **sanitizeCause()** (2 connections) — `src/lib/sync/sync-executor.ts`
- **stripAnsi()** (2 connections) — `src/lib/sync/sync-executor.ts`
- **SyncExecutionResult** (2 connections) — `src/lib/sync/sync-executor.ts`
- **isSyncScriptId()** (2 connections) — `src/lib/sync/sync-registry.ts`
- **resolveSyncExecutionOrder()** (2 connections) — `src/lib/sync/sync-registry.ts`
- **SyncScriptDefinition** (2 connections) — `src/lib/sync/sync-registry.ts`
- **InvalidSyncExecutionResult** (1 connections) — `src/actions/settings/sync-actions.ts`
- **ScriptExecutionOutput** (1 connections) — `src/lib/sync/sync-executor.ts`
- **BaseSyncScriptDefinition** (1 connections) — `src/lib/sync/sync-registry.ts`
- **syncScriptDefinitionMap** (1 connections) — `src/lib/sync/sync-registry.ts`

## Relationships

- [[Sync & Gherkin (75)]] (11 shared connections)
- [[Sync & Gherkin (71)]] (9 shared connections)
- [[Locators & Picker (10)]] (4 shared connections)
- [[Test Runs (16)]] (4 shared connections)
- [[Scaffold CLI]] (2 shared connections)

## Source Files

- `src/actions/settings/sync-actions.test.ts`
- `src/actions/settings/sync-actions.ts`
- `src/lib/sync/sync-executor.test.ts`
- `src/lib/sync/sync-executor.ts`
- `src/lib/sync/sync-pending-counts.ts`
- `src/lib/sync/sync-registry.ts`

## Audit Trail

- EXTRACTED: 120 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*