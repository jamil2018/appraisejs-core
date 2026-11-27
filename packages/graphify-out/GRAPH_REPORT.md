# Graph Report - packages  (2026-11-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1416 nodes · 2693 edges · 71 communities (68 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0024552`
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
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 71|Community 71]]

## God Nodes (most connected - your core abstractions)
1. `CustomWorld` - 40 edges
2. `BuiltinBrowserOperation` - 25 edges
3. `resolveLocator()` - 23 edges
4. `McpRegistryContext` - 20 edges
5. `SelectorName` - 20 edges
6. `createAppraiseMcpServer()` - 17 edges
7. `compilerOptions` - 17 edges
8. `LocatorPickerCompanion` - 16 edges
9. `buildOfflineComposition()` - 15 edges
10. `scripts` - 15 edges

## Surprising Connections (you probably didn't know these)
- `fn()` --calls--> `retry()`  [INFERRED]
  appraisejs/src/mcp/native-descriptor-capture.test.ts → cucumber-runtime/src/locator.util.ts
- `Human review and consent gates` --semantically_similar_to--> `Human Journey decisions`  [INFERRED] [semantically similar]
  appraisejs/codex-marketplace/plugins/appraise-quality-journey/skills/appraise-quality-journey/SKILL.md → create-appraisejs/scaffold-README.md
- `Exact lost-reply reconciliation` --semantically_similar_to--> `Durable outcome reconciliation`  [INFERRED] [semantically similar]
  appraisejs/codex-marketplace/plugins/appraise-quality-journey/skills/appraise-quality-journey/SKILL.md → create-appraisejs/scaffold-README.md
- `Explicit credential rotation` --semantically_similar_to--> `Explicit access revocation and rotation`  [INFERRED] [semantically similar]
  appraisejs/codex-marketplace/plugins/appraise-quality-journey/skills/appraise-quality-journey/SKILL.md → create-appraisejs/scaffold-README.md
- `canonicalContractJson()` --calls--> `writeTemplateQualityOsCertificationReceipt()`  [INFERRED]
  appraisejs/src/mcp/shared.ts → create-appraisejs/scripts/prepare-template.ts

## Import Cycles
- 1-file cycle: `appraisejs/src/agent-setup-capabilities.ts -> appraisejs/src/agent-setup-capabilities.ts`

## Communities (71 total, 3 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (26): legacyEnvironmentBaseUrl(), BuiltinBrowserOperation, BuiltinOperationParameter, BrowserRuntimeDiagnostics, BrowserRuntimeIssue, HumanVerificationRequiredEvent, EnvironmentConfig, getAllEnvironments() (+18 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (62): main(), CliOptions, getTemplateFlagValue(), parseCliArgs(), formatBrowserInstallStep(), getSuccessMessageLines(), printSuccessMessage(), Config (+54 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (53): CliOptions, main(), BrowserLaunchCandidate, LocatorPickerCompanion, parseArgs(), installLocatorPickerOverlay(), ensureLocatorPickerCompanionBuilt(), getLatestModifiedTime() (+45 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (41): createManagedWorkerLoopbackServer(), Gateway, ManagedWorkerLoopbackOptions, ManagedWorkerLoopbackRequestContext, availablePort(), fixture(), initializeOriginal(), postOriginal() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (41): analysisCharter, analysisCommand, artifactReference, automationLocator, automationMaterializationInput, automationParameter, automationStep, automationTestData (+33 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (47): allowScripts, esbuild@0.28.1, fsevents@2.3.3, author, bin, appraisejs, bugs, url (+39 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (30): builtinBrowserOperations, BrowserOperationContext, BrowserOperationHandler, browserOperationHandlerDescriptors, BrowserOperationRef, BrowserOperationWorld, builtinHandlers, canonicalInputAliases (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (36): CliOptions, program, LocatorCache, LocatorMapCache, toGlobPath(), BROWSER_CHOICES, environmentNames, HEADLESS_CHOICES (+28 more)

### Community 8 - "Community 8"
Cohesion: 0.10
Nodes (27): boundedOperationValueSchema, operationValueSchema, canonicalStepDefinitionJson(), computeStepDefinitionHashes(), computeStepExecutableReadiness(), STEP_DEFINITION_SCHEMA_VERSION, stepDefinitionContentHash(), StepDefinitionDraft (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (26): command, actionResult(), appraisePluginMarketplaceRoot(), CODEX_MARKETPLACE_LIST_ARGS, CODEX_MCP_GET_ARGS, CODEX_PLUGIN_LIST_ARGS, CODEX_VERSION_ARGS, commandFailure() (+18 more)

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (24): ExternalWorkerAcceptance, TrustedRouteInput, acceptanceSchema, boundedCopy(), BridgeOptions, buildOfflineComposition(), captureOptions(), captureRoute() (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (22): registerDiagnosticOperations(), registerResourcesOperations(), AgentPreflightObservation, buildAgentPreflight(), canonicalContractJson(), canonicalExpectedTargetWorkspacePath(), compactAgentPreflight(), compactMcpCapabilityMetadata (+14 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (22): acceptanceSchema, assertSafeProjection(), bindingSchema, CapturedTool, createExternalWorkerGateway(), digest, ExternalWorkerBinding, ExternalWorkerCallError (+14 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (22): agentOperationProjectionSchema, humanOperationProjectionSchema, identifierSchema, OPERATION_CONTRACT_VERSION, operationAliasSchema, operationContentHash(), OperationDefinition, operationDefinitionSchema (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (28): baseTemplateDir, composedVerifyDir, computeTemplateInputHash(), copyFallbackSeedDatabase(), __dirname, flavorsDir, getPrismaCliPath(), getSeedDatabaseCandidates() (+20 more)

### Community 15 - "Community 15"
Cohesion: 0.14
Nodes (23): blocked(), ConstructedTrustedCall, ConstructedTrustedRejectionProbe, constructTrustedWorkerNativeCall(), constructTrustedWorkerRejectionProbe(), correlateTrustedWorkerNativeCalls(), hash(), isObject() (+15 more)

### Community 16 - "Community 16"
Cohesion: 0.16
Nodes (22): fixtureHash(), canonical(), CapturedCallable, CaptureError, DescriptorCapture, DescriptorCaptureFailure, DescriptorCaptureResult, DescriptorContainer (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (22): authorityReceipt, connectInput, decisionInput, executeInput, getInput, handoffRedeemInput, id, policyUpdateInput (+14 more)

### Community 18 - "Community 18"
Cohesion: 0.12
Nodes (19): createCoordinatorApiClient(), workspaces, AttemptScopedWorkerTool, canonicalValue(), createTrustedCanonicalIngressBridge(), digest(), GatewayCall, workspaces (+11 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (17): program, addCollaborationJsonCommand(), addOnlineOptions(), agent, collaboration, locatorGraph, OnlineOptions, plugin (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (18): ExternalWorkerRole, externalWorkerTools, ExternalNativeRoute, hash(), prepareExternalWorkerNativeMapping(), Profile, stable(), context (+10 more)

### Community 21 - "Community 21"
Cohesion: 0.18
Nodes (16): AppraiseHttpMcpOptions, runAppraiseHttpMcp(), resolveMcpEndpoint(), assertLoopbackMcpHost(), bearerToken(), hostHeaderIsAllowed(), HttpMcpRequestError, isLoopbackHostname() (+8 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (21): Admitted role assignment, Canonical automation preparation, Project capability diagnostic, Scoped discovery browser receipts, Authoritative Journey reread, One-time handoff redemption, Human review and consent gates, Appraise lifecycle authority (+13 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (20): compilerOptions, baseUrl, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module (+12 more)

### Community 24 - "Community 24"
Cohesion: 0.09
Nodes (30): genericQualityJourneyCommandSchema, scenarioPortfolioSchema, canonicalMcpResourceAnnotations, canonicalMcpResourceNames, canonicalMcpResourceUris, canonicalMcpToolAnnotations, canonicalMcpToolNames, durableLifecycleMutation (+22 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (18): registerQualityJourneyOperations(), boundedText, coordinatorSession, externalTriageSubmitInput, finding, hash, id, ids (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (17): canonicalJson(), createExternalWorkerMcpServer(), deepFreeze(), ExternalWorkerAdvertisedProfile, hash(), actions, canonicalJson(), copyBounded() (+9 more)

### Community 27 - "Community 27"
Cohesion: 0.19
Nodes (11): nullableOptionalPositiveInteger(), nullableOptionalString(), operationSearchInputSchema, registerProjectOperations(), identifier, registerQualityJourneyLibraryOperations(), scope, registerStepDefinitionOperations() (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 29 - "Community 29"
Cohesion: 0.31
Nodes (6): Check, diagnoseProject(), formatMcpBootstrapError(), gitlessBaseRevisionGuidance, gitStatus(), workspaces

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (10): executeHumanOperation(), ResolvedStepDefinition, composition(), definition(), reference(), computeStepReferenceHash(), StepDefinition, dispatchStepInvocation() (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (15): coordinatorSession, environment, executionCancelInput, executionReconcileInput, executionStartInput, hash, id, ids (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.31
Nodes (7): preparePackagedGitignore(), resetAutomationLocatorMap(), getEmptyEnvironmentsFileContent(), getEmptyLocatorMapFileContent(), SEEDED_TEMPLATE_PATHS, setSeededTemplateFilesTracked(), trimTrailingBlankLines()

### Community 33 - "Community 33"
Cohesion: 0.26
Nodes (15): asOptions(), assertAllowedOptions(), assertArgumentCount(), isPlainObject(), locatorOptionKeys, LocatorStepOperation, pageOptionKeys, PageStepOperation (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (15): author, bin, create-appraisejs, bugs, url, description, exports, files (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.24
Nodes (9): assertSharedTemplateDatabaseInputs(), BLANK_TEMPLATE_PREP_SYNC_SCRIPTS, getTemplatePrepSyncScripts(), StepDefinitionDataCounts, TEMPLATE_PREP_SYNC_SCRIPTS, TemplateMetadata, createPreparedTemplateFixture(), createTempTemplateDir() (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.13
Nodes (15): scripts, build, bump:alpha, bump:beta, bump:major, bump:minor, bump:patch, bump:release (+7 more)

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (11): registerRuntimeOperations(), toolError(), applyCapsuleDiagnosticMode(), applyResponseMode(), commonJourneyResponse(), MCP_RESPONSE_TOKEN_BUDGETS, project(), record() (+3 more)

### Community 38 - "Community 38"
Cohesion: 0.16
Nodes (14): onlineClient(), createCoordinatorClient(), client(), workspaces, deriveProjectIdentity(), DisabledProjectIdentity, disconnectLocalProjectIdentity(), isLocalProjectIdentityCurrent() (+6 more)

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (13): exports, ./launcher, ./session-file, ./types, main, name, private, scripts (+5 more)

### Community 40 - "Community 40"
Cohesion: 0.21
Nodes (11): stepInputValueMatchesType(), StepInvocation, validateStepInvocationInputs(), definitionKey(), extensionKey(), inputValues(), invoke(), outputValues() (+3 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (12): compilerOptions, allowImportingTsExtensions, declaration, emitDeclarationOnly, lib, module, moduleResolution, noEmit (+4 more)

### Community 42 - "Community 42"
Cohesion: 0.19
Nodes (9): assertNoHumanVerificationRequired(), CAPTCHA_DETECTOR_VERSION, CaptchaCheckpoint, CaptchaDetection, CaptchaProvider, detectVisibleCaptchaChallenge(), HUMAN_VERIFICATION_EVENT, HUMAN_VERIFICATION_REASON (+1 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (11): dependencies, zod, exports, main, name, private, scripts, build (+3 more)

### Community 44 - "Community 44"
Cohesion: 0.19
Nodes (13): cleanupTempWorkspace(), composeTemplateForVerification(), copyDirWithFilter(), copyDirWithoutBundledExclusions(), copyStarterOverlayFiles(), getPackageFlavorDir(), main(), readExistingTemplateMetadata() (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.18
Nodes (10): compilerOptions, allowImportingTsExtensions, declaration, emitDeclarationOnly, noEmit, outDir, rewriteRelativeImportExtensions, rootDir (+2 more)

### Community 46 - "Community 46"
Cohesion: 0.29
Nodes (9): boundedText(), DiagnoseDependencies, diagnosticDto(), humanBlocker(), isBlocked(), runTestRunDiagnose(), ready, TestRunDiagnoseResult (+1 more)

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (8): NATIVE_DESCRIPTOR_LIMITS, capture(), context, custom, fn(), request(), schema, TrustedDescriptorContext

### Community 48 - "Community 48"
Cohesion: 0.14
Nodes (14): resourceError(), Action, printErrorJson(), printJson(), runCommand(), coordinatorEndpointMismatch(), CoordinatorErrorEnvelope, coordinatorErrorEnvelopeSchema (+6 more)

### Community 49 - "Community 49"
Cohesion: 0.24
Nodes (7): ExpressionKind, identityKey(), sortDiagnostics(), StepDefinitionCompositionDiagnostic, StepValueType, validateStepDefinitionComposition(), StepInputExpression

### Community 50 - "Community 50"
Cohesion: 0.42
Nodes (6): shouldExcludePreparedConfigPath(), isRepoOnlyTemplatePath(), REPO_ONLY_TEMPLATE_PATHS, REPO_ONLY_TEMPLATE_PREFIXES, REPO_ONLY_TEMPLATE_SCRIPT_NAMES, toPosixPath()

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/cli-progress, @types/cross-spawn, @types/fs-extra, @types/node, typescript, vitest

### Community 52 - "Community 52"
Cohesion: 0.38
Nodes (3): builtInStepDefinitions, SourceOperation, stepDefinitionSchema

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (5): forbiddenPaths, forbiddenScripts, packageJson, repoRoot, scriptsDir

### Community 54 - "Community 54"
Cohesion: 0.33
Nodes (4): declaration, filename, ProcessCall, source

### Community 55 - "Community 55"
Cohesion: 0.47
Nodes (4): EXCLUDED_TEMPLATE_FILENAMES, EXCLUDED_TEMPLATE_PATH_PREFIXES, shouldExcludeBundledTemplatePath(), toPosixPath()

### Community 56 - "Community 56"
Cohesion: 0.29
Nodes (6): Analysis and human waits, Appraise Quality Journey, Automation preparation, Retained assignment compatibility, Scenario review and revision, Scoped discovery and human sign-in

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (5): dependencies, cli-progress, cross-spawn, fs-extra, @inquirer/prompts

### Community 58 - "Community 58"
Cohesion: 0.28
Nodes (9): copyFile(), createBaseTemplate(), resetAutomationEnvironments(), resetAutomationReports(), syncInternalPackage(), syncLegacyEnvironmentConfig(), writeTemplateHarnessCheck(), writeTemplatePackageJson() (+1 more)

### Community 59 - "Community 59"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (3): allowScripts, esbuild@0.28.1, fsevents@2.3.3

### Community 69 - "Community 69"
Cohesion: 0.50
Nodes (3): AppraiseJS, Journey operation, Recovery and upgrades

### Community 71 - "Community 71"
Cohesion: 0.47
Nodes (4): contractFields(), contractRuntime(), generateStepDefinitionContract(), StepContractValue

## Knowledge Gaps
- **490 isolated node(s):** `name`, `version`, `description`, `license`, `author` (+485 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fn()` connect `Community 47` to `Community 0`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `retry()` connect `Community 0` to `Community 47`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `canonicalContractJson()` connect `Community 11` to `Community 58`?**
  _High betweenness centrality (0.109) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _490 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08169262415515721 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0515406162464986 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05290490100616683 - nodes in this community are weakly interconnected._