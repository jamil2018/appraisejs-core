# Graph Report - scripts  (2026-10-17)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1522 nodes · 2798 edges · 75 communities (66 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ac758cea`
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
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 70|Community 70]]

## God Nodes (most connected - your core abstractions)
1. `ProtocolFixture` - 27 edges
2. `assert()` - 21 edges
3. `runArm()` - 20 edges
4. `resolveModelSelection()` - 18 edges
5. `assert()` - 16 edges
6. `validateProposal()` - 16 edges
7. `runArm()` - 16 edges
8. `terminateOwnedProcessGroup()` - 15 edges
9. `validateLesson()` - 14 edges
10. `main()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `executeValidationPlan()`  [EXTRACTED]
  benchmark-harness-validation.mjs → lib/harness-validation.mjs
- `assertMigrationParity()` --calls--> `assertDatabaseMigrationParity()`  [EXTRACTED]
  check-package-contents.mjs → lib/migration-inventory.mjs
- `appendObservation()` --calls--> `withLockedSwarmJournal()`  [EXTRACTED]
  harness-learning.mjs → lib/swarm-ledger-access.mjs
- `appendObservation()` --calls--> `appendEvent()`  [EXTRACTED]
  harness-learning.mjs → lib/swarm-ledger-store.mjs
- `main()` --calls--> `ensureBuiltInStepDefinitionReadiness()`  [INFERRED]
  sync-step-definitions.ts → lib/built-in-readiness.mjs

## Import Cycles
- None detected.

## Communities (75 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (77): journalPath, result, sourceObservedAtByRef, appendObservation(), [command, ...argv], commands, definitions, measurements() (+69 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (69): composeIsolatedLaunch(), execFile, fixtureConfig(), ISOLATED_ENV_ALLOWLIST, ISOLATION_MODES, mcpConfigBlock(), normalizeMcpInventory(), sameProcessIdentity() (+61 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (69): adaptSelectedForCodex(), adaptSelectionForCodex(), agentMappingFailures(), assert(), assertActiveCandidate(), assertCandidateCompatible(), assertExactKeys(), assertHostProfileAuthority() (+61 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (54): argumentName(), argumentWriters, assertKnownArgument(), assertRequiredArguments(), normalizeArgumentValue(), parseStrictArgs(), readArgument(), readArgumentValue() (+46 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (60): assertProcessGroupSupport(), createPilotCancellation(), delay(), processGroupExists(), signalAllGroups(), signalProcessGroup(), stopProcessGroup(), validProcessGroupId() (+52 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (43): allowedDatabaseFixtures, assertMigrationParity(), expectedMigrations, packages, rootPackage, rootPublishRefusal, args, database (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (48): addFieldModifiers(), addFieldTypeEdges(), addLink(), addLocalForeignKeys(), addModelConstraint(), addModelField(), addNode(), addReferencedFields() (+40 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (23): arch, area(), binary, build, children, configurationRecord(), emptySystemLayer(), here (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (41): allowedAgentKeys, allProfiles, config, failures, isIgnorableAgentLine(), parseAgentLine(), parseAgentValue(), parseFlatAgentToml() (+33 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (28): result, root, children, exitCode(), exitLabel(), handleProcessError(), handleProcessExit(), handleProcessStop() (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (32): actualSignatures, expectedHandlers, expectedSignatures, extra, extraHandlers, handlerRefs, missing, missingHandlers (+24 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (28): GRAPH_COMMANDS, withDefaultGraph(), resolveGraphifyExecutable(), graphFreshness(), graphInputDigest(), graphScopes, recordGraphFreshness(), scopeFiles() (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (33): manifest, results, ARM_IDS, assert(), auditRuns(), CATEGORIES, classifyPairs(), compareArm() (+25 more)

### Community 13 - "Community 13"
Cohesion: 0.10
Nodes (32): createRoutingDecision(), defaultValue(), hasMaterialRisk(), normalizedSignals(), recommendSwarmRoute(), riskSignals, routingRules, unverifiedRuntimeProof() (+24 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (24): inspect_tool_manifest(), Pinned no-model MCP form/URL cancellation fixture; no auth or native effects., Inspect manifest locations/types/names only; never return input or schema bodies, run(), extract_model(), inspect(), Offline pinned-binary/config metadata inspection. No CLI launch, auth or transpo, No-model RPC-only MCP cancellation observations; no permission grants or native (+16 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (31): canonicalJson(), sanitizedReceipt(), sha256(), buildProbeProfiles(), captureRequest(), close(), collectSchemaDifferences(), compactionSchema() (+23 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (27): isEffectiveIndependentJudgeContext(), argv, cliMetrics, comparableWindow(), contexts, criticalObservation, dimensionOptions, dimensions (+19 more)

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (30): addRecordedRun(), appendEvent(), applyRunTransition(), assert(), assertProvenanceRecord(), eventHash(), expectedStatus(), journalLineBytes() (+22 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (22): commandResults, ledger, ledgerOnly, ledgerPath, repoRoot, result, schemaErrors, evaluateReleaseLedger() (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (20): assertLocalFingerprintPattern(), CI_COMPOSITE_ALIASES, CODE_ANALYSIS_COMMANDS, collectFingerprintEntry(), collectFingerprintScope(), collectNestedFingerprintDirectory(), defaultToolchain(), DOCUMENTED_CI_GATES (+12 more)

### Community 20 - "Community 20"
Cohesion: 0.18
Nodes (22): canonicalJson(), composeDynamicToolsLaunch(), configFor(), DYNAMIC_TOOL_SCHEMA, dynamicTool(), evaluateDispatch(), evaluateExperimentResults(), exactRequestTools() (+14 more)

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (18): buildOperationCapabilityLedger(), main(), outputPath, repoRoot, buildOperationArchitectureCertification(), CapabilityLedger, forbiddenLegacySymbols, ledgerPath (+10 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (18): collectBoundedBody(), evaluateInterlockResults(), projectResponsesTools(), registerReleasedCalls(), close(), createFixtureServer(), createRpc(), deferred() (+10 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (17): activeFiles, checkRootRelativeReferences(), ciContents, ciNodeMajor, collectEntryFiles(), failures, hasRootAgentHarness, lineFor() (+9 more)

### Community 24 - "Community 24"
Cohesion: 0.13
Nodes (14): isStrictlyDocumentationOnly(), requiresReleaseBaselineAudit(), env, fallowArgs, fallowCli, repoRoot, scriptDir, stagedChanges (+6 more)

### Community 25 - "Community 25"
Cohesion: 0.18
Nodes (18): childClose, completionCode(), consumeResourceData(), consumeResourceLine(), drain(), escalateGroup(), finishDrain(), members() (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (16): delay, fixtureRoot, registry, root, run(), createValidationSession(), disposeValidationSession(), executeValidationPlan() (+8 more)

### Community 27 - "Community 27"
Cohesion: 0.20
Nodes (16): commandIndex(), commandsFor(), requireBefore(), requireCommand(), requiredJobs, validateAggregateJobs(), validateDefinedJobs(), validateDependabot() (+8 more)

### Community 28 - "Community 28"
Cohesion: 0.17
Nodes (17): inspectProcessIdentity(), canary(), canonicalJson(), close(), compareBodies(), configText(), diffTree(), fakeJwt() (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (9): createBrowserBoundarySession(), blockedRequests, fixtureHandlers, html(), mutationPage(), mutationRequests, newSession(), privatePage() (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (15): consumeReleasedCall(), validateBufferedSse(), validateFunctionCall(), authority(), call, check(), complete(), expectedTools (+7 more)

### Community 31 - "Community 31"
Cohesion: 0.24
Nodes (16): assertDistinctSources(), assertTelemetryFile(), composeMeasurements(), exactKeys(), importedValue(), isRecord(), METRIC_FIELDS, oneMeasurement() (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (14): assertBounded(), collectGitChanges(), createValidationPlan(), documentedCiRequirements(), executeCommand(), isDocumentationOnlyChange(), parseNameStatus(), releaseLedgerCiRequirements() (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.26
Nodes (12): cucumberRuntimeArtifactFingerprint(), cucumberRuntimeInputFingerprint(), cucumberRuntimeReceiptIsCurrent(), fingerprintEntries(), inputPaths, walk(), buildCucumberRuntime(), getRequiredTempDirectory() (+4 more)

### Community 34 - "Community 34"
Cohesion: 0.21
Nodes (13): DISABLED_FEATURES, composeR2dLaunch(), createRequestInterlock(), execFile, freezeDeep(), loadCanonicalProfile(), P0_R2D_BRIDGE, projectDynamicTools() (+5 more)

### Community 35 - "Community 35"
Cohesion: 0.18
Nodes (13): baseline, candidate, cpuImprovementPercent, elapsedImprovementPercent, frozen, frozenLegacyHash(), legacyFingerprintExcerpt(), measure() (+5 more)

### Community 36 - "Community 36"
Cohesion: 0.19
Nodes (11): coordinator(), coordinatorOperationPrefixes, exactCoordinatorOperations, generateCoordinatorReference(), localDiscoveryTools, main(), McpDefinition, McpFixture (+3 more)

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (12): candidates, catalogIds, contracts, currencyCandidate(), defaults, hostAvailability(), nonemptyModelList(), parseOfficialEvidence() (+4 more)

### Community 38 - "Community 38"
Cohesion: 0.26
Nodes (8): canonicalJson(), canonicalValue(), classifyLateResult(), DeliveryLedger, processIdentityMatches(), reconcileDispatch(), recoveryHandlers, unknownReconcile

### Community 39 - "Community 39"
Cohesion: 0.24
Nodes (7): envValue(), normalizeEndpointPath(), resolveMcpConfig(), config, staleCapabilityRecovery, toolsNotVisibleRecovery, config

### Community 41 - "Community 41"
Cohesion: 0.18
Nodes (8): forbiddenPathCandidates, forbiddenPaths, forbiddenSymbols, ignoredDirectories, matches, root, scanRoots, sources

### Community 42 - "Community 42"
Cohesion: 0.35
Nodes (10): ensureGitInclude(), getLocalConfig(), isGitRepository(), log(), main(), quiet, repoRoot, runGit() (+2 more)

### Community 43 - "Community 43"
Cohesion: 0.29
Nodes (8): allowedDatabaseFixtures, committedGraphifyFiles, committedGraphifyScopes, findForbiddenRuntimeArtifacts(), gitPaths(), main(), runtimeArtifactReason(), runtimeDirectoryPatterns

### Community 44 - "Community 44"
Cohesion: 0.31
Nodes (6): BaseHTTPRequestHandler, Handler, Disposable loopback Responses fixture; no real model/provider inference or crede, receive(), rpc(), send()

### Community 45 - "Community 45"
Cohesion: 0.28
Nodes (8): collectEntry(), failures, forbiddenProductionPatterns, harnessDoc, isProductionSource(), repoRoot, roots, walk()

### Community 46 - "Community 46"
Cohesion: 0.42
Nodes (6): [action, file, reviewer, evidence], artifact, artifactIdentity(), bindReview(), git(), verifyReview()

### Community 47 - "Community 47"
Cohesion: 0.25
Nodes (7): finish, generated, source, start, readValidationRegistry(), renderValidationMatrix(), validationMatrixRows()

### Community 48 - "Community 48"
Cohesion: 0.25
Nodes (5): digest, files, manifest, root, runtimeSource

### Community 50 - "Community 50"
Cohesion: 0.48
Nodes (4): baseIndex, suppressions, addedQualitySuppressions(), readQualityDiff()

### Community 51 - "Community 51"
Cohesion: 0.38
Nodes (6): findCommand(), findCommandInUvToolBin(), findCommandOnPath(), graphifyCommand, install, uvCommand

### Community 53 - "Community 53"
Cohesion: 0.38
Nodes (4): execute(), record(), route(), scripts

### Community 54 - "Community 54"
Cohesion: 0.47
Nodes (5): database, measure(), plan(), root, runSql()

### Community 55 - "Community 55"
Cohesion: 0.60
Nodes (5): digest(), invokeSyntheticGateway(), main(), profile(), role

### Community 56 - "Community 56"
Cohesion: 0.47
Nodes (5): canonicalDefinitions(), createP0R2fProfiles(), main(), P0_R2F_ROLES, P0R2fRole

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (3): failures, ignoredDirectories, roots

### Community 58 - "Community 58"
Cohesion: 0.60
Nodes (3): EnvironmentColumn, environmentJsonFailures(), environmentSchemaFailures()

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (5): assertMetricRecord(), validateCurrentMetrics(), validateLegacyMetrics(), validateMetrics(), validateNumericMetrics()

### Community 60 - "Community 60"
Cohesion: 0.60
Nodes (4): main(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (3): observation, schemas, stream

## Knowledge Gaps
- **393 isolated node(s):** `root`, `registry`, `fixtureRoot`, `delay`, `root` (+388 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `executeCommand()` connect `Community 32` to `Community 19`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `cucumberRuntimeReceiptIsCurrent()` connect `Community 33` to `Community 32`, `Community 9`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `runner` connect `Community 32` to `Community 4`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `root`, `registry`, `fixtureRoot` to the rest of the system?**
  _403 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06554621848739496 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05939629990262902 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.06414414414414414 - nodes in this community are weakly interconnected._