# Graph Report - packages  (2026-08-20)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 975 nodes · 1870 edges · 63 communities (58 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `71745eed`
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
- [[_COMMUNITY_Community 62|Community 62]]

## God Nodes (most connected - your core abstractions)
1. `CustomWorld` - 40 edges
2. `BuiltinBrowserOperation` - 25 edges
3. `resolveLocator()` - 23 edges
4. `SelectorName` - 20 edges
5. `compilerOptions` - 17 edges
6. `LocatorPickerCompanion` - 16 edges
7. `scripts` - 15 edges
8. `compilerOptions` - 15 edges
9. `computeStepReferenceHash()` - 15 edges
10. `scripts` - 14 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `Config`  [INFERRED]
  cucumber-runtime/src/executor.ts → create-appraisejs/src/config.ts
- `reference()` --calls--> `computeStepReferenceHash()`  [EXTRACTED]
  cucumber-runtime/src/step-definitions/composition-validator.test.ts → cucumber-runtime/src/step-definitions/contracts.ts
- `resolveMcpEndpoint()` --calls--> `assertLoopbackMcpHost()`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/mcp-http-security.ts
- `onlineClient()` --calls--> `createCoordinatorClient()`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/coordinator-client.ts
- `printErrorJson()` --calls--> `coordinatorRequestError`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/coordinator-client.ts

## Import Cycles
- 1-file cycle: `appraisejs/src/agent-setup-capabilities.ts -> appraisejs/src/agent-setup-capabilities.ts`

## Communities (63 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (63): main(), CliOptions, getTemplateFlagValue(), parseCliArgs(), formatBrowserInstallStep(), getSuccessMessageLines(), printSuccessMessage(), Config (+55 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (53): CliOptions, main(), BrowserLaunchCandidate, LocatorPickerCompanion, parseArgs(), installLocatorPickerOverlay(), ensureLocatorPickerCompanionBuilt(), getLatestModifiedTime() (+45 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (17): BuiltinBrowserOperation, BuiltinOperationParameter, BrowserRuntimeDiagnostics, BrowserRuntimeIssue, HumanVerificationRequiredEvent, resolveLocator(), retry(), reviewedSelectorResolvers (+9 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (41): CliOptions, program, LocatorCache, LocatorMapCache, toGlobPath(), BROWSER_CHOICES, environmentNames, HEADLESS_CHOICES (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (28): builtinBrowserOperations, BrowserOperationContext, BrowserOperationHandler, browserOperationHandlerDescriptors, BrowserOperationRef, builtinHandlerImplementations, builtinHandlers, canonicalInputAliases (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (28): canonicalMcpResourceAnnotations, canonicalMcpResourceNames, canonicalMcpResourceUris, canonicalMcpToolAnnotations, canonicalMcpToolNames, externalExecution, externalStop, localDecision (+20 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (25): canonicalOperationJson(), canonicalStepDefinitionJson(), computeStepDefinitionHashes(), computeStepExecutableReadiness(), identifierSchema, STEP_DEFINITION_SCHEMA_VERSION, stepDefinitionContentHash(), StepDefinitionDraft (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (23): agentOperationProjectionSchema, boundedOperationValueSchema, humanOperationProjectionSchema, identifierSchema, OPERATION_CONTRACT_VERSION, operationAliasSchema, operationContentHash(), OperationDefinition (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (25): baseTemplateDir, composedVerifyDir, copyFallbackSeedDatabase(), __dirname, flavorsDir, getPrismaCliPath(), getSeedDatabaseCandidates(), getTsNodeLoaderPath() (+17 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (16): AppraiseHttpMcpOptions, runAppraiseHttpMcp(), resolveMcpEndpoint(), assertLoopbackMcpHost(), bearerToken(), hostHeaderIsAllowed(), HttpMcpRequestError, isLoopbackHostname() (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.10
Nodes (20): compilerOptions, baseUrl, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module (+12 more)

### Community 11 - "Community 11"
Cohesion: 0.17
Nodes (17): registerDiagnosticOperations(), AgentPreflightObservation, buildAgentPreflight(), canonicalContractJson(), canonicalExpectedTargetWorkspacePath(), compactAgentPreflight(), compactMcpCapabilityMetadata, compactProjectDiagnostic() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.13
Nodes (13): program, expectedAgentCapabilities, agent, locatorGraph, OnlineOptions, printErrorJson(), printJson(), project (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.16
Nodes (13): onlineClient(), createCoordinatorClient(), Check, diagnoseProject(), formatMcpBootstrapError(), gitlessBaseRevisionGuidance, gitStatus(), workspaces (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (16): ActionAssertionConcern, ActionDescriptor, ActionInputDescriptor, ActionNumericUnit, CompiledCustomExtensionReview, CustomActionExtensionProposal, CustomExtensionPolicy, DELEGATED_AUTHORIZATION_VERSION (+8 more)

### Community 16 - "Community 16"
Cohesion: 0.22
Nodes (13): BrowserOperationWorld, executeHumanOperation(), computeStepReferenceHash(), stepInputValueMatchesType(), validateStepInvocationInputs(), definitionKey(), dispatchStepInvocation(), extensionKey() (+5 more)

### Community 17 - "Community 17"
Cohesion: 0.26
Nodes (15): asOptions(), assertAllowedOptions(), assertArgumentCount(), isPlainObject(), locatorOptionKeys, LocatorStepOperation, pageOptionKeys, PageStepOperation (+7 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (15): author, bin, create-appraisejs, bugs, url, description, exports, files (+7 more)

### Community 19 - "Community 19"
Cohesion: 0.16
Nodes (11): ExpressionKind, identityKey(), ResolvedStepDefinition, sortDiagnostics(), StepDefinitionCompositionDiagnostic, StepValueType, composition(), definition() (+3 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (14): author, bin, appraisejs, bugs, url, description, files, homepage (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (15): scripts, build, bump:alpha, bump:beta, bump:major, bump:minor, bump:patch, bump:release (+7 more)

### Community 22 - "Community 22"
Cohesion: 0.27
Nodes (10): createCoordinatorApiClient(), mcpContractForServer(), registerAppraiseOperations(), createAppraiseMcpServer(), runAppraiseMcp(), iterations, startedAt, contract() (+2 more)

### Community 23 - "Community 23"
Cohesion: 0.23
Nodes (10): assertSharedTemplateDatabaseInputs(), BLANK_TEMPLATE_PREP_SYNC_SCRIPTS, getTemplatePrepSyncScripts(), shouldAbortOnFallbackSeed(), StepDefinitionDataCounts, TEMPLATE_PREP_SYNC_SCRIPTS, TemplateMetadata, createPreparedTemplateFixture() (+2 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (8): contractFields(), contractRuntime(), generateStepDefinitionContract(), StepContractValue, StepDefinition, StepInvocation, invocation(), reference()

### Community 25 - "Community 25"
Cohesion: 0.14
Nodes (14): scripts, benchmark:mcp-registry, build, build:mcp-contract, bump:alpha, bump:beta, bump:major, bump:minor (+6 more)

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (13): exports, ./launcher, ./session-file, ./types, main, name, private, scripts (+5 more)

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (10): assessmentInputSchema, compactStepValueSchema, qualityPlanRevisionInputSchema, registerQualityDesignOperations(), requirementQueryAnswerSchema, registerRuntimeOperations(), registerStepDefinitionOperations(), McpRegistryContext (+2 more)

### Community 28 - "Community 28"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, declaration, emitDeclarationOnly, lib, module, moduleResolution, noEmit (+4 more)

### Community 29 - "Community 29"
Cohesion: 0.19
Nodes (9): assertNoHumanVerificationRequired(), CAPTCHA_DETECTOR_VERSION, CaptchaCheckpoint, CaptchaDetection, CaptchaProvider, detectVisibleCaptchaChallenge(), HUMAN_VERIFICATION_EVENT, HUMAN_VERIFICATION_REASON (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.17
Nodes (11): dependencies, zod, exports, main, name, private, scripts, build (+3 more)

### Community 31 - "Community 31"
Cohesion: 0.27
Nodes (8): applyAuthoringResponseMode(), applyCapsuleDiagnosticMode(), applyLifecycleResponseMode(), applyResponseMode(), MCP_RESPONSE_TOKEN_BUDGETS, project(), record(), diagnostic

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, declaration, emitDeclarationOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+2 more)

### Community 33 - "Community 33"
Cohesion: 0.24
Nodes (11): cleanupTempWorkspace(), composeTemplateForVerification(), copyDirWithFilter(), copyDirWithoutBundledExclusions(), copyStarterOverlayFiles(), getPackageFlavorDir(), main(), readExistingTemplateMetadata() (+3 more)

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (9): boundedText(), DiagnoseDependencies, diagnosticDto(), humanBlocker(), isBlocked(), runTestRunDiagnose(), ready, TestRunDiagnoseResult (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.31
Nodes (7): resetAutomationEnvironments(), resetAutomationLocatorMap(), getEmptyEnvironmentsFileContent(), getEmptyLocatorMapFileContent(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 36 - "Community 36"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/cli-progress, @types/cross-spawn, @types/fs-extra, @types/node, typescript, vitest

### Community 37 - "Community 37"
Cohesion: 0.29
Nodes (7): registerResourcesOperations(), assessmentWorkflow, contentHash(), projectPayload(), qualityDesignWorkflow, LOCATOR_GRAPH_CONTRACT_VERSION, OPERATION_CATALOG_CONTRACT_VERSION

### Community 38 - "Community 38"
Cohesion: 0.32
Nodes (8): copyFile(), createBaseTemplate(), preparePackagedGitignore(), resetAutomationReports(), syncInternalPackage(), syncLegacyEnvironmentConfig(), writeTemplateHarnessCheck(), writeTemplatePackageJson()

### Community 39 - "Community 39"
Cohesion: 0.43
Nodes (5): isRepoOnlyTemplatePath(), REPO_ONLY_TEMPLATE_PATHS, REPO_ONLY_TEMPLATE_PREFIXES, REPO_ONLY_TEMPLATE_SCRIPT_NAMES, toPosixPath()

### Community 40 - "Community 40"
Cohesion: 0.38
Nodes (3): builtInStepDefinitions, SourceOperation, stepDefinitionSchema

### Community 41 - "Community 41"
Cohesion: 0.47
Nodes (5): nullableOptionalPositiveInteger(), nullableOptionalString(), operationSearchInputSchema, registerProjectOperations(), withGuidance()

### Community 42 - "Community 42"
Cohesion: 0.33
Nodes (5): forbiddenPaths, forbiddenScripts, packageJson, repoRoot, scriptsDir

### Community 43 - "Community 43"
Cohesion: 0.47
Nodes (4): EXCLUDED_TEMPLATE_FILENAMES, EXCLUDED_TEMPLATE_PATH_PREFIXES, shouldExcludeBundledTemplatePath(), toPosixPath()

### Community 44 - "Community 44"
Cohesion: 0.40
Nodes (5): dependencies, commander, @modelcontextprotocol/sdk, yaml, zod

### Community 45 - "Community 45"
Cohesion: 0.40
Nodes (5): devDependencies, tsx, @types/node, typescript, vitest

### Community 46 - "Community 46"
Cohesion: 0.40
Nodes (5): dependencies, cli-progress, cross-spawn, fs-extra, @inquirer/prompts

### Community 47 - "Community 47"
Cohesion: 0.50
Nodes (4): exports, ./managed-validation-contracts, import, types

### Community 48 - "Community 48"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 49 - "Community 49"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (3): allowScripts, esbuild@0.28.1, fsevents@2.3.3

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (3): allowScripts, esbuild@0.28.1, fsevents@2.3.3

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (3): computeTemplateInputHash(), hashFile(), collectFiles()

## Knowledge Gaps
- **331 isolated node(s):** `name`, `version`, `description`, `license`, `author` (+326 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `bootstrap()` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `Config` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _331 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05088919288645691 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05290490100616683 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.114880144730891 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.05605499735589635 - nodes in this community are weakly interconnected._