# Graph Report - scripts  (2026-06-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 381 nodes · 656 edges · 24 communities (20 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0846378a`
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

## God Nodes (most connected - your core abstractions)
1. `printSyncSummary()` - 23 edges
2. `installTemplateStepPayload()` - 14 edges
3. `runSyncScript()` - 11 edges
4. `parseStepFile()` - 9 edges
5. `addLink()` - 8 edges
6. `buildUpdatedGroupFileContent()` - 8 edges
7. `buildStepRegistry()` - 8 edges
8. `syncFilesystemTestSuite()` - 8 edges
9. `extractModulePathFromLocatorFile()` - 7 edges
10. `parseStepCall()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `writeRegistry()` --calls--> `buildStepRegistry()`  [EXTRACTED]
  build-step-registry.ts → lib/template-step-registry.ts
- `scanTestCasesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-cases.ts → lib/filename-utils.ts
- `scanTestSuitesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-suites.ts → lib/filename-utils.ts
- `main()` --calls--> `parseStepFile()`  [EXTRACTED]
  sync-template-steps.ts → lib/step-file-parser.ts
- `displaySummary()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-all.ts → lib/sync-summary.ts

## Import Cycles
- None detected.

## Communities (24 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (46): __dirname, fragmentsRoot, registryRoot, repoRoot, writeRegistry(), CliOptions, detectPackageManager(), main() (+38 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (32): ParsedStep, runSyncScript(), printSyncSummary(), SummarySection, buildEnvironmentObjects(), EnvironmentConfig, EnvironmentData, getEnvironmentIdentityKey() (+24 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (30): extractLocatorGroupName(), extractModulePathFromLocatorFile(), extractTestSuiteNameFromFilename(), buildLocatorGroupsFromFS(), buildLocatorMapRouteMap(), createOrUpdateLocatorGroup(), deleteOrphanedLocatorGroups(), LocatorGroupFromFS (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (27): splitTagLine(), createModulePathMap(), createTestSuite(), DbTestSuiteWithModule, deleteOrphanedTestSuite(), deleteOrphanedTestSuiteIfNeeded(), deleteOrphanedTestSuites(), ExistingTestSuite (+19 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (22): determineStepTypeAndIcon(), extractParametersFromGherkinStep(), findMatchingTemplateStep(), ParameterMatch, sameResolvedParameters(), signatureToRegex(), TemplateStepCandidate, TemplateStepMatch (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (15): args, dryRun, git(), graphOutputPrefixes, graphScopes, handleFailedCommand(), handleMissingCommand(), isGraphOutputPath() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.21
Nodes (15): extractFunctionDefinition(), extractStepSource(), extractStepSourceRange(), findStepJSDocStartOffset(), getIdentifierParamType(), getStepFunction(), getStepKeyword(), getStepSignature() (+7 more)

### Community 8 - "Community 8"
Cohesion: 0.20
Nodes (13): children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop(), inferredBaseUrl(), mcp (+5 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (11): activeFiles, checkRootRelativeReferences(), collectEntryFiles(), failures, lineFor(), literalForbidden, regexForbidden, repoRoot (+3 more)

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (12): aggregateDatabaseChanges(), DatabaseChanges, DB_CHANGE_PATTERNS, displaySummary(), DIVIDER, executeSyncScript(), hasDatabaseChanges(), main() (+4 more)

### Community 11 - "Community 11"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (8): args, graphifyCommand, graphifyMcpCommand, resolveCommand(), resolveCommandFromPath(), resolveCommandFromUvToolPath(), result, versionCheck

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (6): env, fallowArgs, fallowCli, repoRoot, result, scriptDir

### Community 14 - "Community 14"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 15 - "Community 15"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 17 - "Community 17"
Cohesion: 0.50
Nodes (3): databasePath, migrationsRoot, workspace

## Knowledge Gaps
- **108 isolated node(s):** `repoRoot`, `prismaRoot`, `schemaPath`, `migrationsRoot`, `outDir` (+103 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `printSyncSummary()` connect `Community 2` to `Community 10`, `Community 3`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `parseStepFile()` connect `Community 0` to `Community 2`, `Community 7`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `runSyncScript()` connect `Community 2` to `Community 3`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `repoRoot`, `prismaRoot`, `schemaPath` to the rest of the system?**
  _108 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06766917293233082 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09024390243902439 - nodes in this community are weakly interconnected._