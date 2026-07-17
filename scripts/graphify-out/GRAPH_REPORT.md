# Graph Report - scripts  (2026-07-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 470 nodes · 754 edges · 32 communities (29 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e65e14bb`
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

## God Nodes (most connected - your core abstractions)
1. `printSyncSummary()` - 21 edges
2. `installTemplateStepPayload()` - 14 edges
3. `runSyncScript()` - 11 edges
4. `addLink()` - 8 edges
5. `buildStepRegistry()` - 8 edges
6. `syncFilesystemTestSuite()` - 8 edges
7. `extractModulePathFromLocatorFile()` - 7 edges
8. `parseStepCall()` - 7 edges
9. `splitTagLine()` - 7 edges
10. `main()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `writeRegistry()` --calls--> `buildStepRegistry()`  [EXTRACTED]
  build-step-registry.ts → lib/template-step-registry.ts
- `scanTestCasesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-cases.ts → lib/filename-utils.ts
- `scanTestSuitesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-suites.ts → lib/filename-utils.ts
- `displaySummary()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-all.ts → lib/sync-summary.ts
- `main()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-plans.ts → lib/sync-summary.ts

## Import Cycles
- None detected.

## Communities (32 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (46): extractLocatorGroupName(), extractModulePathFromLocatorFile(), extractTestSuiteNameFromFilename(), runSyncScript(), printSyncSummary(), SummarySection, buildLocatorGroupsFromFS(), buildLocatorMapRouteMap() (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (30): __dirname, fragmentsRoot, registryRoot, repoRoot, writeRegistry(), extractFunctionDefinition(), extractStepSource(), extractStepSourceRange() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (31): CliOptions, detectPackageManager(), main(), parseArgs(), readPayload(), runScript(), buildUpdatedGroupFileContent(), createPlaceholderGroupFile() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (27): splitTagLine(), createModulePathMap(), createTestSuite(), DbTestSuiteWithModule, deleteOrphanedTestSuite(), deleteOrphanedTestSuiteIfNeeded(), deleteOrphanedTestSuites(), ExistingTestSuite (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (22): determineStepTypeAndIcon(), extractParametersFromGherkinStep(), findMatchingTemplateStep(), ParameterMatch, sameResolvedParameters(), signatureToRegex(), TemplateStepCandidate, TemplateStepMatch (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (19): activeFiles, checkRootRelativeReferences(), ciContents, ciNodeMajor, collectEntryFiles(), failures, hasRootAgentHarness, lineFor() (+11 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (14): children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop(), inferredBaseUrl(), mcp (+6 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (15): evaluateReleaseLedger(), FINDING_IDS, nonEmptyString(), runVerifiedFindingCommands(), SEVERITIES, STATUSES, validateFinding(), validateFindingEvidence() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (15): args, dryRun, git(), graphOutputPrefixes, graphScopes, handleFailedCommand(), handleMissingCommand(), isGraphOutputPath() (+7 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (12): coordinator(), coordinatorOperationPrefixes, exactCoordinatorOperations, generateCoordinatorReference(), localSearchTools, localWorkflowTools, main(), McpDefinition (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (13): appraisejsInstallIndex, browserInstallIndex, createPackageCommands, dependabot, mcpHttpCheckIndex, npmDirectories, requiredJobs, rootAppraisejsInstallIndex (+5 more)

### Community 12 - "Community 12"
Cohesion: 0.22
Nodes (9): envValue(), normalizeEndpointPath(), resolveMcpConfig(), config, expectedCapabilities, skillExists, staleCapabilityRecovery, toolsNotVisibleRecovery (+1 more)

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (12): aggregateDatabaseChanges(), DatabaseChanges, DB_CHANGE_PATTERNS, displaySummary(), DIVIDER, executeSyncScript(), hasDatabaseChanges(), main() (+4 more)

### Community 14 - "Community 14"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (8): ParsedStep, hasTemplateStepReferences(), TemplateStepReferenceCounter, main(), normalizeOptionalText(), scanStepFiles(), SyncResult, syncStepsToDatabase()

### Community 16 - "Community 16"
Cohesion: 0.24
Nodes (8): args, graphifyCommand, graphifyMcpCommand, resolveCommand(), resolveCommandFromPath(), resolveCommandFromUvToolPath(), result, versionCheck

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (9): buildEnvironmentObjects(), EnvironmentConfig, EnvironmentData, getEnvironmentIdentityKey(), main(), normalizeEnvironmentName(), readEnvironmentsFromFile(), syncEnvironmentsToDatabase() (+1 more)

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (6): env, fallowArgs, fallowCli, repoRoot, result, scriptDir

### Community 19 - "Community 19"
Cohesion: 0.48
Nodes (5): buildCucumberRuntime(), getRequiredTempDirectory(), getTempDirectory(), main(), runVitest()

### Community 20 - "Community 20"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 21 - "Community 21"
Cohesion: 0.40
Nodes (3): failures, ignoredDirectories, roots

### Community 22 - "Community 22"
Cohesion: 0.40
Nodes (4): allowedDatabaseFixtures, packages, rootPackage, rootPublishRefusal

### Community 23 - "Community 23"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 24 - "Community 24"
Cohesion: 0.50
Nodes (3): databasePath, migrationsRoot, workspace

## Knowledge Gaps
- **152 isolated node(s):** `repoRoot`, `prismaRoot`, `schemaPath`, `migrationsRoot`, `outDir` (+147 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parseStepFile()` connect `Community 2` to `Community 3`, `Community 15`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `printSyncSummary()` connect `Community 0` to `Community 4`, `Community 5`, `Community 13`, `Community 15`, `Community 17`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Why does `runSyncScript()` connect `Community 0` to `Community 17`, `Community 4`, `Community 5`, `Community 15`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `repoRoot`, `prismaRoot`, `schemaPath` to the rest of the system?**
  _152 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07199032062915911 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08708708708708708 - nodes in this community are weakly interconnected._