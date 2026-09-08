# Graph Report - packages  (2026-09-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1070 nodes · 2040 edges · 63 communities (60 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `76b2d136`
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
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
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
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 178|Community 178]]
- [[_COMMUNITY_Community 179|Community 179]]
- [[_COMMUNITY_Community 181|Community 181]]
- [[_COMMUNITY_Community 182|Community 182]]
- [[_COMMUNITY_Community 185|Community 185]]

## God Nodes (most connected - your core abstractions)
1. `CustomWorld` - 40 edges
2. `BuiltinBrowserOperation` - 25 edges
3. `resolveLocator()` - 23 edges
4. `SelectorName` - 20 edges
5. `compilerOptions` - 17 edges
6. `LocatorPickerCompanion` - 16 edges
7. `createAppraiseMcpServer()` - 15 edges
8. `scripts` - 15 edges
9. `createBaseTemplate()` - 15 edges
10. `compilerOptions` - 15 edges

## Surprising Connections (you probably didn't know these)
- `writeTemplateQualityOsCertificationReceipt()` --calls--> `canonicalContractJson()`  [INFERRED]
  create-appraisejs/scripts/prepare-template.ts → appraisejs/src/mcp/shared.ts
- `bootstrap()` --calls--> `Config`  [INFERRED]
  cucumber-runtime/src/executor.ts → create-appraisejs/src/config.ts
- `resolveMcpEndpoint()` --calls--> `assertLoopbackMcpHost()`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/mcp-http-security.ts
- `onlineClient()` --calls--> `createCoordinatorClient()`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/coordinator-client.ts
- `printErrorJson()` --calls--> `coordinatorRequestError`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/coordinator-client.ts

## Import Cycles
- 1-file cycle: `appraisejs/src/agent-setup-capabilities.ts -> appraisejs/src/agent-setup-capabilities.ts`

## Hyperedges (group relationships)
- **Appraise Planning Lifecycle Flow** — appraise_planning_standby_skill_mcp_setup_and_diagnostics, appraise_planning_standby_skill_target_workspace_registration, appraise_planning_standby_skill_plan_creation, appraise_planning_standby_skill_review_readiness, appraise_planning_standby_skill_approval_standby, appraise_planning_standby_skill_approval_outcomes, appraise_planning_standby_skill_validation_preparation [EXTRACTED 1.00]

## Communities (63 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.28
Nodes (9): copyFile(), createBaseTemplate(), resetAutomationEnvironments(), resetAutomationReports(), syncInternalPackage(), syncLegacyEnvironmentConfig(), writeTemplateHarnessCheck(), writeTemplatePackageJson() (+1 more)

### Community 1 - "Community 1"
Cohesion: 0.10
Nodes (29): baseTemplateDir, composedVerifyDir, computeTemplateInputHash(), copyFallbackSeedDatabase(), __dirname, flavorsDir, getPrismaCliPath(), getSeedDatabaseCandidates() (+21 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (53): CliOptions, main(), BrowserLaunchCandidate, LocatorPickerCompanion, parseArgs(), installLocatorPickerOverlay(), ensureLocatorPickerCompanionBuilt(), getLatestModifiedTime() (+45 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (23): agentOperationProjectionSchema, boundedOperationValueSchema, humanOperationProjectionSchema, identifierSchema, OPERATION_CONTRACT_VERSION, operationAliasSchema, operationContentHash(), OperationDefinition (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (47): allowScripts, esbuild@0.28.1, fsevents@2.3.3, author, bin, appraisejs, bugs, url (+39 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (15): collectFiles(), copyTemplate(), EXCLUDED_DIRS, EXCLUDED_EXTENSIONS, EXCLUDED_FILES, getBaseTemplatePath(), getCollectedFilesForTest(), getDestinationRelativePath() (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (13): BrowserOperationWorld, executeHumanOperation(), computeStepReferenceHash(), stepInputValueMatchesType(), validateStepInvocationInputs(), definitionKey(), dispatchStepInvocation(), extensionKey() (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (26): genericQualityJourneyCommandSchema, registerQualityJourneyOperations(), scenarioPortfolioSchema, canonicalMcpResourceAnnotations, canonicalMcpResourceNames, canonicalMcpResourceUris, canonicalMcpToolAnnotations, canonicalMcpToolNames (+18 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (20): compilerOptions, baseUrl, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module (+12 more)

### Community 9 - "Community 9"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (15): author, bin, create-appraisejs, bugs, url, description, exports, files (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (15): scripts, build, bump:alpha, bump:beta, bump:major, bump:minor, bump:patch, bump:release (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (17): AppraiseHttpMcpOptions, runAppraiseHttpMcp(), resolveMcpEndpoint(), localCoordinatorBaseUrl(), assertLoopbackMcpHost(), bearerToken(), hostHeaderIsAllowed(), HttpMcpRequestError (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (29): builtinBrowserOperations, BrowserOperationContext, BrowserOperationHandler, browserOperationHandlerDescriptors, BrowserOperationRef, builtinHandlerImplementations, builtinHandlers, canonicalInputAliases (+21 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (14): createCoordinatorApiClient(), workspaces, workspaces, discoveryBase, workspaces, mcpContractForServer(), createAppraiseMcpServer(), runAppraiseMcp() (+6 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (13): exports, ./launcher, ./session-file, ./types, main, name, private, scripts (+5 more)

### Community 16 - "Community 16"
Cohesion: 0.09
Nodes (25): canonicalOperationJson(), canonicalStepDefinitionJson(), computeStepDefinitionHashes(), computeStepExecutableReadiness(), identifierSchema, STEP_DEFINITION_SCHEMA_VERSION, stepDefinitionContentHash(), StepDefinitionDraft (+17 more)

### Community 17 - "Community 17"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, declaration, emitDeclarationOnly, lib, module, moduleResolution, noEmit (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.21
Nodes (7): workspaces, deriveProjectIdentity(), ensureLocalProjectIdentity(), ProjectIdentity, ProjectIdentityDetails, ProjectIdentityError, workspaces

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (40): legacyEnvironmentBaseUrl(), CliOptions, program, LocatorCache, LocatorMapCache, toGlobPath(), BROWSER_CHOICES, environmentNames (+32 more)

### Community 20 - "Community 20"
Cohesion: 0.17
Nodes (11): resourceError(), onlineClient(), coordinatorRequestError, createCoordinatorClient(), client(), workspaces, Check, diagnoseProject() (+3 more)

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (9): Appraise-Owned Lifecycle, Approval Outcome Handling, Approval Standby, Durable Continuation State, MCP Setup and Diagnostics, Plan Creation, Review Readiness, Target Workspace Registration (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.17
Nodes (11): dependencies, zod, exports, main, name, private, scripts, build (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, declaration, emitDeclarationOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/cli-progress, @types/cross-spawn, @types/fs-extra, @types/node, typescript, vitest

### Community 25 - "Community 25"
Cohesion: 0.19
Nodes (9): assertNoHumanVerificationRequired(), CAPTCHA_DETECTOR_VERSION, CaptchaCheckpoint, CaptchaDetection, CaptchaProvider, detectVisibleCaptchaChallenge(), HUMAN_VERIFICATION_EVENT, HUMAN_VERIFICATION_REASON (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (9): boundedText(), DiagnoseDependencies, diagnosticDto(), humanBlocker(), isBlocked(), runTestRunDiagnose(), ready, TestRunDiagnoseResult (+1 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (15): program, agent, locatorGraph, OnlineOptions, printErrorJson(), printJson(), project, runCommand() (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.38
Nodes (3): builtInStepDefinitions, SourceOperation, stepDefinitionSchema

### Community 29 - "Community 29"
Cohesion: 0.28
Nodes (7): coordinatorEndpointMismatch(), CoordinatorErrorEnvelope, coordinatorErrorEnvelopeSchema, createLocalCoordinatorFailure(), ParsedResponseBody, TargetProjectRegistrationInput, untrustedCoordinatorEndpoint()

### Community 30 - "Community 30"
Cohesion: 0.09
Nodes (19): BuiltinBrowserOperation, BuiltinOperationParameter, BrowserRuntimeDiagnostics, BrowserRuntimeIssue, HumanVerificationRequiredEvent, resolveLocator(), retry(), reviewedSelectorResolvers (+11 more)

### Community 31 - "Community 31"
Cohesion: 0.40
Nodes (5): dependencies, cli-progress, cross-spawn, fs-extra, @inquirer/prompts

### Community 32 - "Community 32"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 33 - "Community 33"
Cohesion: 0.31
Nodes (6): identifier, registerQualityJourneyLibraryOperations(), scope, registerStepDefinitionOperations(), McpRegistryContext, text()

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (15): command, environment, executionCancelInput, executionReconcileInput, executionStartInput, hash, id, ids (+7 more)

### Community 36 - "Community 36"
Cohesion: 0.47
Nodes (4): EXCLUDED_TEMPLATE_FILENAMES, EXCLUDED_TEMPLATE_PATH_PREFIXES, shouldExcludeBundledTemplatePath(), toPosixPath()

### Community 37 - "Community 37"
Cohesion: 0.47
Nodes (5): nullableOptionalPositiveInteger(), nullableOptionalString(), operationSearchInputSchema, registerProjectOperations(), withGuidance()

### Community 39 - "Community 39"
Cohesion: 0.26
Nodes (15): asOptions(), assertAllowedOptions(), assertArgumentCount(), isPlainObject(), locatorOptionKeys, LocatorStepOperation, pageOptionKeys, PageStepOperation (+7 more)

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (13): CliOptions, Config, getConfig(), copyBundledTemplate(), createProject(), CreateProjectDependencies, CreateProjectLogger, CreateProjectResult (+5 more)

### Community 41 - "Community 41"
Cohesion: 0.05
Nodes (38): analysisCharter, analysisCommand, artifactReference, automationLocator, automationMaterializationInput, automationParameter, automationStep, automationTestData (+30 more)

### Community 44 - "Community 44"
Cohesion: 0.42
Nodes (6): shouldExcludePreparedConfigPath(), isRepoOnlyTemplatePath(), REPO_ONLY_TEMPLATE_PATHS, REPO_ONLY_TEMPLATE_PREFIXES, REPO_ONLY_TEMPLATE_SCRIPT_NAMES, toPosixPath()

### Community 45 - "Community 45"
Cohesion: 0.20
Nodes (14): main(), formatBrowserInstallStep(), getSuccessMessageLines(), printSuccessMessage(), getInstallCommand(), getPlaywrightInstallCommand(), patchPackageJsonScripts(), RUN_PLAYWRIGHT_INSTALL_ARGS (+6 more)

### Community 46 - "Community 46"
Cohesion: 0.20
Nodes (11): registerRuntimeOperations(), toolError(), applyCapsuleDiagnosticMode(), applyResponseMode(), commonJourneyResponse(), MCP_RESPONSE_TOKEN_BUDGETS, project(), record() (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (3): allowScripts, esbuild@0.28.1, fsevents@2.3.3

### Community 48 - "Community 48"
Cohesion: 0.24
Nodes (10): getTemplateFlagValue(), parseCliArgs(), __dirname, formatTemplateList(), isTemplateId(), packageDir, parseTemplateId(), TEMPLATE_CATALOG (+2 more)

### Community 49 - "Community 49"
Cohesion: 0.39
Nodes (6): getPackageManagerProfile(), PACKAGE_MANAGER_PROFILES, PackageManagerProfile, rewriteScriptsForPackageManager(), TEMPLATE_SCRIPTS, PackageManager

### Community 50 - "Community 50"
Cohesion: 0.17
Nodes (13): boundedText, finding, hash, id, ids, registerQualityJourneyTriageOperations(), scope, triageEvidenceReadInput (+5 more)

### Community 51 - "Community 51"
Cohesion: 0.48
Nodes (4): isDirEmpty(), runPrompts(), validateTargetDirectory(), getTemplateChoices()

### Community 52 - "Community 52"
Cohesion: 0.19
Nodes (13): cleanupTempWorkspace(), composeTemplateForVerification(), copyDirWithFilter(), copyDirWithoutBundledExclusions(), copyStarterOverlayFiles(), getPackageFlavorDir(), main(), readExistingTemplateMetadata() (+5 more)

### Community 55 - "Community 55"
Cohesion: 0.12
Nodes (23): registerDiagnosticOperations(), registerResourcesOperations(), AgentPreflightObservation, buildAgentPreflight(), canonicalContractJson(), canonicalExpectedTargetWorkspacePath(), compactAgentPreflight(), compactMcpCapabilityMetadata (+15 more)

### Community 75 - "Community 75"
Cohesion: 0.18
Nodes (8): contractFields(), contractRuntime(), generateStepDefinitionContract(), StepContractValue, StepDefinition, StepInvocation, invocation(), reference()

### Community 178 - "Community 178"
Cohesion: 0.16
Nodes (11): ExpressionKind, identityKey(), ResolvedStepDefinition, sortDiagnostics(), StepDefinitionCompositionDiagnostic, StepValueType, composition(), definition() (+3 more)

### Community 181 - "Community 181"
Cohesion: 0.31
Nodes (7): preparePackagedGitignore(), resetAutomationLocatorMap(), getEmptyEnvironmentsFileContent(), getEmptyLocatorMapFileContent(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 182 - "Community 182"
Cohesion: 0.26
Nodes (8): assertSharedTemplateDatabaseInputs(), BLANK_TEMPLATE_PREP_SYNC_SCRIPTS, getTemplatePrepSyncScripts(), StepDefinitionDataCounts, TEMPLATE_PREP_SYNC_SCRIPTS, TemplateMetadata, createPreparedTemplateFixture(), createTempTemplateDir()

### Community 185 - "Community 185"
Cohesion: 0.33
Nodes (5): forbiddenPaths, forbiddenScripts, packageJson, repoRoot, scriptsDir

## Knowledge Gaps
- **380 isolated node(s):** `name`, `version`, `description`, `license`, `author` (+375 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Config` connect `Community 40` to `Community 53`?**
  _High betweenness centrality (0.290) - this node is a cross-community bridge._
- **Why does `bootstrap()` connect `Community 53` to `Community 40`?**
  _High betweenness centrality (0.290) - this node is a cross-community bridge._
- **Why does `startCli()` connect `Community 53` to `Community 19`?**
  _High betweenness centrality (0.289) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _382 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05290490100616683 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.09425287356321839 - nodes in this community are weakly interconnected._