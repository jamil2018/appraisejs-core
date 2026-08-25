# Graph Report - scripts  (2026-08-25)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 625 nodes · 930 edges · 43 communities (38 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `76ebd97d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 39|Community 39]]

## God Nodes (most connected - your core abstractions)
1. `assert()` - 13 edges
2. `validateRun()` - 12 edges
3. `validateRoutingDecision()` - 12 edges
4. `addLink()` - 8 edges
5. `parseStrictArgs()` - 8 edges
6. `createRoutingDecision()` - 8 edges
7. `validateReleaseCiWorkflow()` - 7 edges
8. `parseStepCall()` - 7 edges
9. `readJournal()` - 7 edges
10. `normalizeTaskClass()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `ensureBuiltInStepDefinitionReadiness()`  [INFERRED]
  sync-step-definitions.ts → lib/built-in-readiness.mjs
- `buildOperationCapabilityLedger()` --calls--> `operationArchitectureDigest`  [EXTRACTED]
  build-operation-capability-ledger.ts → lib/operation-architecture-utils.ts
- `buildOperationArchitectureCertification()` --calls--> `operationArchitectureDigest`  [EXTRACTED]
  certify-operation-architecture.ts → lib/operation-architecture-utils.ts
- `parseFlatAgentToml()` --calls--> `validateTomlBasicString()`  [EXTRACTED]
  check-swarm-harness.mjs → lib/toml-validator.mjs
- `main()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-step-definitions.ts → lib/sync-summary.ts

## Import Cycles
- None detected.

## Communities (43 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (47): argumentName(), argumentWriters, assertKnownArgument(), assertRequiredArguments(), normalizeArgumentValue(), parseStrictArgs(), readArgument(), readArgumentValue() (+39 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (37): allowedAgentKeys, config, failures, isIgnorableAgentLine(), parseAgentLine(), parseAgentValue(), parseFlatAgentToml(), parseMultilineValue() (+29 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (39): withLockedSwarmJournal(), acquireLedgerLock(), releaseLedgerLock(), addRecordedRun(), appendEvent(), applyRunTransition(), assert(), eventHash() (+31 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (32): actualSignatures, expectedHandlers, expectedSignatures, extra, extraHandlers, handlerRefs, missing, missingHandlers (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (24): children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop(), inferredBaseUrl(), mcp (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (22): argv, comparableWindow(), contexts, criticalObservation, dimensionOptions, dimensions, linkedRoutingDecision(), metricNames (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (21): commandResults, ledger, ledgerPath, repoRoot, result, schemaErrors, evaluateReleaseLedger(), FINDING_IDS (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (18): buildOperationCapabilityLedger(), main(), outputPath, repoRoot, buildOperationArchitectureCertification(), CapabilityLedger, forbiddenLegacySymbols, ledgerPath (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (17): activeFiles, checkRootRelativeReferences(), ciContents, ciNodeMajor, collectEntryFiles(), failures, hasRootAgentHarness, lineFor() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (19): attemptLockAcquisition(), createLock(), existingLockReclaim(), existingLockState(), inspectExistingLock(), isLockOwnerRecord(), nonBlankString(), processExists() (+11 more)

### Community 11 - "Community 11"
Cohesion: 0.20
Nodes (16): commandIndex(), commandsFor(), requireBefore(), requireCommand(), requiredJobs, validateAggregateJobs(), validateDefinedJobs(), validateDependabot() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (15): args, dryRun, git(), graphOutputPrefixes, graphScopes, handleFailedCommand(), handleMissingCommand(), isGraphOutputPath() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (11): coordinator(), coordinatorOperationPrefixes, exactCoordinatorOperations, generateCoordinatorReference(), localDiscoveryTools, main(), McpDefinition, McpFixture (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (10): GRAPH_COMMANDS, withDefaultGraph(), args, graphifyCommand, graphifyMcpCommand, resolveCommand(), resolveCommandFromPath(), resolveCommandFromUvToolPath() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.24
Nodes (7): envValue(), normalizeEndpointPath(), resolveMcpConfig(), config, staleCapabilityRecovery, toolsNotVisibleRecovery, config

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (7): DatabaseSync, migrationsRoot, seedPreCapsuleLocalManagedPublicationRun(), seedPreV2IndependentPublicationRun(), seedPreV2Publication(), Statement, workspaces

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (8): forbiddenPathCandidates, forbiddenPaths, forbiddenSymbols, ignoredDirectories, matches, root, scanRoots, sources

### Community 18 - "Community 18"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 19 - "Community 19"
Cohesion: 0.18
Nodes (5): DatabaseSync, migrationsRoot, retiredTables, SQLiteStatement, workspaces

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (8): allowedDatabaseFixtures, committedGraphifyFiles, committedGraphifyScopes, findForbiddenRuntimeArtifacts(), gitPaths(), main(), runtimeArtifactReason(), runtimeDirectoryPatterns

### Community 21 - "Community 21"
Cohesion: 0.24
Nodes (7): requiresReleaseBaselineAudit(), env, fallowArgs, fallowCli, repoRoot, scriptDir, stagedPatch

### Community 22 - "Community 22"
Cohesion: 0.32
Nodes (7): collectEntry(), failures, forbiddenProductionPatterns, isProductionSource(), repoRoot, roots, walk()

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (4): DatabaseSync, migrationsRoot, Statement, workspaces

### Community 24 - "Community 24"
Cohesion: 0.48
Nodes (4): baseIndex, suppressions, addedQualitySuppressions(), readQualityDiff()

### Community 25 - "Community 25"
Cohesion: 0.48
Nodes (5): buildCucumberRuntime(), getRequiredTempDirectory(), getTempDirectory(), main(), runVitest()

### Community 26 - "Community 26"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (5): database, measure(), plan(), root, runSql()

### Community 28 - "Community 28"
Cohesion: 0.40
Nodes (3): failures, ignoredDirectories, roots

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (4): allowedDatabaseFixtures, packages, rootPackage, rootPublishRefusal

### Community 30 - "Community 30"
Cohesion: 0.60
Nodes (3): EnvironmentColumn, environmentJsonFailures(), environmentSchemaFailures()

### Community 31 - "Community 31"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 33 - "Community 33"
Cohesion: 0.50
Nodes (3): databasePath, migrationsRoot, workspace

## Knowledge Gaps
- **223 isolated node(s):** `root`, `database`, `repoRoot`, `outputPath`, `repoRoot` (+218 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `normalizeTaskClass()` connect `Community 0` to `Community 3`, `Community 6`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Why does `parseStrictArgs()` connect `Community 0` to `Community 3`, `Community 6`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **Why does `validateRun()` connect `Community 3` to `Community 6`?**
  _High betweenness centrality (0.002) - this node is a cross-community bridge._
- **What connects `root`, `database`, `repoRoot` to the rest of the system?**
  _223 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.058445353594389245 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06765327695560254 - nodes in this community are weakly interconnected._