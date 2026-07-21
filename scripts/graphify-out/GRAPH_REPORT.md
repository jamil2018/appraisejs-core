# Graph Report - scripts  (2026-07-22)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 564 nodes · 871 edges · 36 communities (33 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `19d7f492`
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

## God Nodes (most connected - your core abstractions)
1. `printSyncSummary()` - 21 edges
2. `installTemplateStepPayload()` - 14 edges
3. `runSyncScript()` - 11 edges
4. `addLink()` - 8 edges
5. `syncFilesystemTestSuite()` - 8 edges
6. `extractModulePathFromLocatorFile()` - 7 edges
7. `parseStepCall()` - 7 edges
8. `parseStepFile()` - 7 edges
9. `splitTagLine()` - 7 edges
10. `main()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `writeRegistry()` --calls--> `buildStepRegistry()`  [EXTRACTED]
  build-step-registry.ts → lib/template-step-registry.ts
- `scanTestCasesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-cases.ts → lib/filename-utils.ts
- `scanTestSuitesFromFilesystem()` --calls--> `extractTestSuiteNameFromFilename()`  [EXTRACTED]
  sync-test-suites.ts → lib/filename-utils.ts
- `main()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-plans.ts → lib/sync-summary.ts
- `main()` --calls--> `printSyncSummary()`  [EXTRACTED]
  sync-tags.ts → lib/sync-summary.ts

## Import Cycles
- None detected.

## Communities (36 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (52): extractLocatorGroupName(), extractModulePathFromLocatorFile(), extractTestSuiteNameFromFilename(), runSyncScript(), printSyncSummary(), SummarySection, aggregateDatabaseChanges(), DatabaseChanges (+44 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (45): __dirname, fragmentsRoot, registryRoot, repoRoot, writeRegistry(), CliOptions, detectPackageManager(), main() (+37 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (31): actualSignatures, expectedHandlers, expectedSignatures, extra, extraHandlers, handlerRefs, missing, missingHandlers (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (33): splitTagLine(), buildTagObjects(), extractUniqueTags(), main(), SyncResult, syncTagsToDatabase(), TagData, createModulePathMap() (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (25): LedgerRow, readTemplateStepOperationMappings(), TemplateStepOperationMapping, ParsedStep, hasTemplateStepReferences(), TemplateStepReferenceCounter, createParsedStep(), deleteOrphanedStep() (+17 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (22): determineStepTypeAndIcon(), extractParametersFromGherkinStep(), findMatchingTemplateStep(), ParameterMatch, sameResolvedParameters(), signatureToRegex(), TemplateStepCandidate, TemplateStepMatch (+14 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (19): activeFiles, checkRootRelativeReferences(), ciContents, ciNodeMajor, collectEntryFiles(), failures, hasRootAgentHarness, lineFor() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.14
Nodes (17): buildOperationCapabilityLedger(), legacyOperationRef(), main(), mapLegacySteps(), outputPath, repoRoot, TemplateStep, buildOperationArchitectureCertification() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (14): children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop(), inferredBaseUrl(), mcp (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (15): evaluateReleaseLedger(), FINDING_IDS, nonEmptyString(), runVerifiedFindingCommands(), SEVERITIES, STATUSES, validateFinding(), validateFindingEvidence() (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (15): args, dryRun, git(), graphOutputPrefixes, graphScopes, handleFailedCommand(), handleMissingCommand(), isGraphOutputPath() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (12): coordinator(), coordinatorOperationPrefixes, exactCoordinatorOperations, generateCoordinatorReference(), localSearchTools, localWorkflowTools, main(), McpDefinition (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (13): appraisejsInstallIndex, browserInstallIndex, createPackageCommands, dependabot, mcpHttpCheckIndex, npmDirectories, requiredJobs, rootAppraisejsInstallIndex (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.19
Nodes (10): GRAPH_COMMANDS, withDefaultGraph(), args, graphifyCommand, graphifyMcpCommand, resolveCommand(), resolveCommandFromPath(), resolveCommandFromUvToolPath() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.22
Nodes (8): envValue(), normalizeEndpointPath(), resolveMcpConfig(), config, skillExists, staleCapabilityRecovery, toolsNotVisibleRecovery, config

### Community 16 - "Community 16"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.29
Nodes (8): allowedDatabaseFixtures, committedGraphifyFiles, committedGraphifyScopes, findForbiddenRuntimeArtifacts(), gitPaths(), main(), runtimeArtifactReason(), runtimeDirectoryPatterns

### Community 18 - "Community 18"
Cohesion: 0.31
Nodes (9): buildEnvironmentObjects(), EnvironmentConfig, EnvironmentData, getEnvironmentIdentityKey(), main(), normalizeEnvironmentName(), readEnvironmentsFromFile(), syncEnvironmentsToDatabase() (+1 more)

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (5): apply, blockUpdates, caseUpdates, mappingSelect, templateUpdates

### Community 20 - "Community 20"
Cohesion: 0.48
Nodes (4): baseIndex, suppressions, addedQualitySuppressions(), readQualityDiff()

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (6): env, fallowArgs, fallowCli, repoRoot, result, scriptDir

### Community 22 - "Community 22"
Cohesion: 0.48
Nodes (5): buildCucumberRuntime(), getRequiredTempDirectory(), getTempDirectory(), main(), runVitest()

### Community 23 - "Community 23"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (5): client, matrix, matrixJson, result, startedAt

### Community 25 - "Community 25"
Cohesion: 0.40
Nodes (3): failures, ignoredDirectories, roots

### Community 26 - "Community 26"
Cohesion: 0.40
Nodes (4): allowedDatabaseFixtures, packages, rootPackage, rootPublishRefusal

### Community 27 - "Community 27"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 28 - "Community 28"
Cohesion: 0.50
Nodes (3): databasePath, migrationsRoot, workspace

## Knowledge Gaps
- **196 isolated node(s):** `repoRoot`, `prismaRoot`, `schemaPath`, `migrationsRoot`, `outDir` (+191 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parseStepFile()` connect `Community 3` to `Community 1`, `Community 5`?**
  _High betweenness centrality (0.106) - this node is a cross-community bridge._
- **Why does `printSyncSummary()` connect `Community 0` to `Community 18`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `runSyncScript()` connect `Community 0` to `Community 18`, `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `repoRoot`, `prismaRoot`, `schemaPath` to the rest of the system?**
  _196 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.062003968253968256 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06493506493506493 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06787330316742081 - nodes in this community are weakly interconnected._