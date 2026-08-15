# Graph Report - scripts  (2026-08-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 656 nodes · 1016 edges · 41 communities (38 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `83410087`
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

## God Nodes (most connected - your core abstractions)
1. `printSyncSummary()` - 13 edges
2. `assert()` - 13 edges
3. `validateRun()` - 12 edges
4. `validateRoutingDecision()` - 12 edges
5. `runSyncScript()` - 8 edges
6. `syncFilesystemTestSuite()` - 8 edges
7. `parseStrictArgs()` - 8 edges
8. `createRoutingDecision()` - 8 edges
9. `addLink()` - 8 edges
10. `main()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `scanTestSuitesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-suites.ts → lib/filename-utils.ts
- `syncLocatorsFromFile()` --calls--> `extractLocatorGroupName()`  [EXTRACTED]
  sync-locators.ts → lib/filename-utils.ts
- `syncLocatorsFromFile()` --calls--> `extractModulePathFromLocatorFile()`  [EXTRACTED]
  sync-locators.ts → lib/filename-utils.ts
- `scanLocatorDirectories()` --calls--> `extractModulePathFromLocatorFile()`  [EXTRACTED]
  sync-modules.ts → lib/filename-utils.ts
- `main()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-locators.ts → lib/sync-summary.ts

## Import Cycles
- None detected.

## Communities (41 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (56): extractLocatorGroupName(), extractModulePathFromLocatorFile(), extractTestSuiteNameFromFilename(), runSyncScript(), printSyncSummary(), SummarySection, splitTagLine(), deleteOrphanedLocatorGroups() (+48 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (44): withLockedSwarmJournal(), releaseLedgerLock(), addRecordedRun(), appendEvent(), applyRunTransition(), assert(), eventHash(), expectedStatus() (+36 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (37): allowedAgentKeys, config, failures, isIgnorableAgentLine(), parseAgentLine(), parseAgentValue(), parseFlatAgentToml(), parseMultilineValue() (+29 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (32): actualSignatures, expectedHandlers, expectedSignatures, extra, extraHandlers, handlerRefs, missing, missingHandlers (+24 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (32): createRoutingDecision(), defaultValue(), hasMaterialRisk(), normalizedSignals(), recommendSwarmRoute(), riskSignals, routingRules, unverifiedRuntimeProof() (+24 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (22): argv, comparableWindow(), contexts, criticalObservation, dimensionOptions, dimensions, linkedRoutingDecision(), metricNames (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (17): children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop(), inferredBaseUrl(), mcp (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.11
Nodes (18): buildOperationCapabilityLedger(), main(), outputPath, repoRoot, buildOperationArchitectureCertification(), CapabilityLedger, forbiddenLegacySymbols, ledgerPath (+10 more)

### Community 9 - "Community 9"
Cohesion: 0.10
Nodes (17): activeFiles, checkRootRelativeReferences(), ciContents, ciNodeMajor, collectEntryFiles(), failures, hasRootAgentHarness, lineFor() (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.20
Nodes (20): acquireLedgerLock(), attemptLockAcquisition(), createLock(), existingLockReclaim(), existingLockState(), inspectExistingLock(), isLockOwnerRecord(), nonBlankString() (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (16): commandIndex(), commandsFor(), requireBefore(), requireCommand(), requiredJobs, validateAggregateJobs(), validateDefinedJobs(), validateDependabot() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.18
Nodes (15): evaluateReleaseLedger(), FINDING_IDS, nonEmptyString(), runVerifiedFindingCommands(), SEVERITIES, STATUSES, validateFinding(), validateFindingEvidence() (+7 more)

### Community 13 - "Community 13"
Cohesion: 0.15
Nodes (15): args, dryRun, git(), graphOutputPrefixes, graphScopes, handleFailedCommand(), handleMissingCommand(), isGraphOutputPath() (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (11): coordinator(), coordinatorOperationPrefixes, exactCoordinatorOperations, generateCoordinatorReference(), localDiscoveryTools, main(), McpDefinition, McpFixture (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (10): GRAPH_COMMANDS, withDefaultGraph(), args, graphifyCommand, graphifyMcpCommand, resolveCommand(), resolveCommandFromPath(), resolveCommandFromUvToolPath() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (12): aggregateDatabaseChanges(), DatabaseChanges, DB_CHANGE_PATTERNS, displaySummary(), DIVIDER, executeSyncScript(), hasDatabaseChanges(), main() (+4 more)

### Community 17 - "Community 17"
Cohesion: 0.24
Nodes (7): envValue(), normalizeEndpointPath(), resolveMcpConfig(), config, staleCapabilityRecovery, toolsNotVisibleRecovery, config

### Community 18 - "Community 18"
Cohesion: 0.27
Nodes (9): argumentName(), argumentWriters, assertKnownArgument(), assertRequiredArguments(), normalizeArgumentValue(), parseStrictArgs(), readArgument(), readArgumentValue() (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.27
Nodes (11): buildLocatorGroupsFromFS(), buildLocatorMapRouteMap(), createOrUpdateLocatorGroup(), deleteOrphanedLocatorGroups(), LocatorGroupFromFS, LocatorMapEntry, main(), readLocatorMap() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (5): DatabaseSync, migrationsRoot, retiredTables, SQLiteStatement, workspaces

### Community 22 - "Community 22"
Cohesion: 0.29
Nodes (8): allowedDatabaseFixtures, committedGraphifyFiles, committedGraphifyScopes, findForbiddenRuntimeArtifacts(), gitPaths(), main(), runtimeArtifactReason(), runtimeDirectoryPatterns

### Community 23 - "Community 23"
Cohesion: 0.24
Nodes (7): requiresReleaseBaselineAudit(), env, fallowArgs, fallowCli, repoRoot, scriptDir, stagedPatch

### Community 24 - "Community 24"
Cohesion: 0.31
Nodes (9): buildEnvironmentObjects(), EnvironmentConfig, EnvironmentData, getEnvironmentIdentityKey(), main(), normalizeEnvironmentName(), readEnvironmentsFromFile(), syncEnvironmentsToDatabase() (+1 more)

### Community 25 - "Community 25"
Cohesion: 0.43
Nodes (4): baseIndex, suppressions, addedQualitySuppressions(), readQualityDiff()

### Community 26 - "Community 26"
Cohesion: 0.48
Nodes (5): buildCucumberRuntime(), getRequiredTempDirectory(), getTempDirectory(), main(), runVitest()

### Community 27 - "Community 27"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 28 - "Community 28"
Cohesion: 0.40
Nodes (3): failures, ignoredDirectories, roots

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (4): allowedDatabaseFixtures, packages, rootPackage, rootPublishRefusal

### Community 30 - "Community 30"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 32 - "Community 32"
Cohesion: 0.50
Nodes (3): databasePath, migrationsRoot, workspace

## Knowledge Gaps
- **214 isolated node(s):** `scriptDir`, `repoRoot`, `quiet`, `require`, `SummarySection` (+209 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `printSyncSummary()` connect `Community 0` to `Community 16`, `Community 24`, `Community 19`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `parseStrictArgs()` connect `Community 18` to `Community 2`, `Community 6`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `acquireLedgerLock()` connect `Community 10` to `Community 2`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `scriptDir`, `repoRoot`, `quiet` to the rest of the system?**
  _214 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07767722473604827 - nodes in this community are weakly interconnected._