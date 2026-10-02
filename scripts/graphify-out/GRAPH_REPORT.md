# Graph Report - scripts  (2026-10-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1156 nodes · 2054 edges · 61 communities (54 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c148b18c`
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
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 56|Community 56]]

## God Nodes (most connected - your core abstractions)
1. `runArm()` - 18 edges
2. `resolveModelSelection()` - 17 edges
3. `assert()` - 16 edges
4. `validateProposal()` - 16 edges
5. `validateLesson()` - 14 edges
6. `assert()` - 14 edges
7. `consolidateObservations()` - 12 edges
8. `retrieveLessons()` - 12 edges
9. `validateRun()` - 12 edges
10. `finding()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `collectGitChanges()` --calls--> `run()`  [INFERRED]
  lib/harness-validation.mjs → tests/harness-learning.test.mjs
- `main()` --calls--> `ensureBuiltInStepDefinitionReadiness()`  [INFERRED]
  sync-step-definitions.ts → lib/built-in-readiness.mjs
- `run()` --calls--> `executeValidationPlan()`  [EXTRACTED]
  benchmark-harness-validation.mjs → lib/harness-validation.mjs
- `appendObservation()` --calls--> `appendEvent()`  [EXTRACTED]
  harness-learning.mjs → lib/swarm-ledger-store.mjs
- `compose()` --calls--> `composeIsolatedLaunch()`  [EXTRACTED]
  tests/managed-journey-isolated-launch.test.mjs → lib/managed-journey-isolated-launch.mjs

## Import Cycles
- None detected.

## Communities (61 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (71): composeIsolatedLaunch(), execFile, fixtureConfig(), inspectProcessIdentity(), ISOLATED_ENV_ALLOWLIST, ISOLATION_MODES, mcpConfigBlock(), normalizeMcpInventory() (+63 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (73): journalPath, result, sourceObservedAtByRef, appendObservation(), [command, ...argv], commands, definitions, measurements() (+65 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (56): delay, fixtureRoot, registry, root, run(), finish, generated, source (+48 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (57): adaptSelectionForCodex(), assert(), assertActiveCandidate(), assertCandidateCompatible(), assertExactKeys(), assertHostProfileAuthority(), assertObject(), assertStringArray() (+49 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (48): canonicalJson(), collectBoundedBody(), composeR2dLaunch(), consumeReleasedCall(), createRequestInterlock(), evaluateInterlockResults(), execFile, freezeDeep() (+40 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (39): createRoutingDecision(), defaultValue(), hasMaterialRisk(), normalizedSignals(), recommendSwarmRoute(), riskSignals, routingRules, unverifiedRuntimeProof() (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (42): canary(), canonicalJson(), close(), compareBodies(), configText(), diffTree(), fakeJwt(), fixturePassed (+34 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (39): allowedAgentKeys, allProfiles, config, failures, isIgnorableAgentLine(), parseAgentLine(), parseAgentValue(), parseFlatAgentToml() (+31 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (28): result, root, children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop() (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (32): actualSignatures, expectedHandlers, expectedSignatures, extra, extraHandlers, handlerRefs, missing, missingHandlers (+24 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (28): GRAPH_COMMANDS, withDefaultGraph(), resolveGraphifyExecutable(), graphFreshness(), graphInputDigest(), graphScopes, recordGraphFreshness(), scopeFiles() (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (22): argv, comparableWindow(), contexts, criticalObservation, dimensionOptions, dimensions, linkedRoutingDecision(), metricNames (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.12
Nodes (22): commandResults, ledger, ledgerOnly, ledgerPath, repoRoot, result, schemaErrors, evaluateReleaseLedger() (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (24): canonicalJson(), composeDynamicToolsLaunch(), configFor(), DISABLED_FEATURES, DYNAMIC_TOOL_SCHEMA, dynamicTool(), evaluateDispatch(), evaluateExperimentResults() (+16 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (26): addRecordedRun(), appendEvent(), applyRunTransition(), assert(), eventHash(), expectedStatus(), journalLineBytes(), nonBlank() (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (18): buildOperationCapabilityLedger(), main(), outputPath, repoRoot, buildOperationArchitectureCertification(), CapabilityLedger, forbiddenLegacySymbols, ledgerPath (+10 more)

### Community 17 - "Community 17"
Cohesion: 0.10
Nodes (17): activeFiles, checkRootRelativeReferences(), ciContents, ciNodeMajor, collectEntryFiles(), failures, hasRootAgentHarness, lineFor() (+9 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (14): isStrictlyDocumentationOnly(), requiresReleaseBaselineAudit(), env, fallowArgs, fallowCli, repoRoot, scriptDir, stagedChanges (+6 more)

### Community 19 - "Community 19"
Cohesion: 0.21
Nodes (19): attemptLockAcquisition(), createLock(), existingLockReclaim(), existingLockState(), inspectExistingLock(), isLockOwnerRecord(), nonBlankString(), processExists() (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (18): childClose, completionCode(), consumeResourceData(), consumeResourceLine(), drain(), escalateGroup(), finishDrain(), members() (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (16): commandIndex(), commandsFor(), requireBefore(), requireCommand(), requiredJobs, validateAggregateJobs(), validateDefinedJobs(), validateDependabot() (+8 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (16): withLockedSwarmJournal(), acquireLedgerLock(), releaseLedgerLock(), readJournal(), [command, ...argv], hasEscalationSignal(), isUnderRouted(), journalPath (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (9): createBrowserBoundarySession(), blockedRequests, fixtureHandlers, html(), mutationPage(), mutationRequests, newSession(), privatePage() (+1 more)

### Community 24 - "Community 24"
Cohesion: 0.23
Nodes (12): args, database, { DatabaseSync }, auditQualityJourneyIntegrity(), checkJourneyHeads(), checkOwnershipEdges(), checkRelationalOwnership(), identifier() (+4 more)

### Community 25 - "Community 25"
Cohesion: 0.20
Nodes (10): coordinator(), coordinatorOperationPrefixes, exactCoordinatorOperations, generateCoordinatorReference(), localDiscoveryTools, main(), McpDefinition, McpFixture (+2 more)

### Community 26 - "Community 26"
Cohesion: 0.26
Nodes (8): canonicalJson(), canonicalValue(), classifyLateResult(), DeliveryLedger, processIdentityMatches(), reconcileDispatch(), recoveryHandlers, unknownReconcile

### Community 27 - "Community 27"
Cohesion: 0.27
Nodes (9): argumentName(), argumentWriters, assertKnownArgument(), assertRequiredArguments(), normalizeArgumentValue(), parseStrictArgs(), readArgument(), readArgumentValue() (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (8): forbiddenPathCandidates, forbiddenPaths, forbiddenSymbols, ignoredDirectories, matches, root, scanRoots, sources

### Community 29 - "Community 29"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.29
Nodes (8): allowedDatabaseFixtures, committedGraphifyFiles, committedGraphifyScopes, findForbiddenRuntimeArtifacts(), gitPaths(), main(), runtimeArtifactReason(), runtimeDirectoryPatterns

### Community 31 - "Community 31"
Cohesion: 0.28
Nodes (8): collectEntry(), failures, forbiddenProductionPatterns, harnessDoc, isProductionSource(), repoRoot, roots, walk()

### Community 32 - "Community 32"
Cohesion: 0.42
Nodes (6): [action, file, reviewer, evidence], artifact, artifactIdentity(), bindReview(), git(), verifyReview()

### Community 33 - "Community 33"
Cohesion: 0.25
Nodes (5): digest, files, manifest, root, runtimeSource

### Community 34 - "Community 34"
Cohesion: 0.39
Nodes (4): envValue(), normalizeEndpointPath(), resolveMcpConfig(), config

### Community 35 - "Community 35"
Cohesion: 0.48
Nodes (4): baseIndex, suppressions, addedQualitySuppressions(), readQualityDiff()

### Community 36 - "Community 36"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 37 - "Community 37"
Cohesion: 0.47
Nodes (5): database, measure(), plan(), root, runSql()

### Community 38 - "Community 38"
Cohesion: 0.60
Nodes (5): digest(), invokeSyntheticGateway(), main(), profile(), role

### Community 39 - "Community 39"
Cohesion: 0.47
Nodes (5): canonicalDefinitions(), createP0R2fProfiles(), main(), P0_R2F_ROLES, P0R2fRole

### Community 40 - "Community 40"
Cohesion: 0.40
Nodes (3): failures, ignoredDirectories, roots

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (4): allowedDatabaseFixtures, packages, rootPackage, rootPublishRefusal

### Community 42 - "Community 42"
Cohesion: 0.60
Nodes (3): EnvironmentColumn, environmentJsonFailures(), environmentSchemaFailures()

### Community 43 - "Community 43"
Cohesion: 0.70
Nodes (4): assert(), assertSanitizedLearningText(), containsForbiddenLearningDetail(), sanitizeLegacyLearningText()

### Community 44 - "Community 44"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 46 - "Community 46"
Cohesion: 0.50
Nodes (3): config, staleCapabilityRecovery, toolsNotVisibleRecovery

### Community 47 - "Community 47"
Cohesion: 0.50
Nodes (3): databasePath, migrationsRoot, workspace

## Knowledge Gaps
- **341 isolated node(s):** `root`, `database`, `repoRoot`, `outputPath`, `CapabilityLedger` (+336 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `run()` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `collectGitChanges()` connect `Community 2` to `Community 1`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Why does `cucumberRuntimeReceiptIsCurrent()` connect `Community 2` to `Community 9`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `root`, `database`, `repoRoot` to the rest of the system?**
  _341 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05462962962962963 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07025316455696203 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.050721954831543875 - nodes in this community are weakly interconnected._