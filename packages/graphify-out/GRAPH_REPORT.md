# Graph Report - packages  (2026-11-14)

## Corpus Check
- 202 files · ~136,478 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1411 nodes · 2685 edges · 69 communities (66 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 26 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b8aaa949`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Package.Json Component|Package.Json Component]]
- [[_COMMUNITY_Server Factory Mcp Coordinator|Server Factory Mcp Coordinator]]
- [[_COMMUNITY_Managed Journey Synthetic Mcp|Managed Journey Synthetic Mcp]]
- [[_COMMUNITY_Managed Worker Server Trusted|Managed Worker Server Trusted]]
- [[_COMMUNITY_Shared Diagnostic Project Resources|Shared Diagnostic Project Resources]]
- [[_COMMUNITY_Appraise Quality Journey Skill|Appraise Quality Journey Skill]]
- [[_COMMUNITY_Response Projector Runtime Capsule|Response Projector Runtime Capsule]]
- [[_COMMUNITY_Cli Mcp Call Http|Cli Mcp Call Http]]
- [[_COMMUNITY_Http Mcp Security Server|Http Mcp Security Server]]
- [[_COMMUNITY_Project Identity Coordinator Client|Project Identity Coordinator Client]]
- [[_COMMUNITY_Codex Compatibility|Codex Compatibility]]
- [[_COMMUNITY_Coordinator Client Project Identity|Coordinator Client Project Identity]]
- [[_COMMUNITY_Diagnostics Coordinator Client Registry|Diagnostics Coordinator Client Registry]]
- [[_COMMUNITY_Contract Mcp Registry|Contract Mcp Registry]]
- [[_COMMUNITY_Registry Quality Journey Library|Registry Quality Journey Library]]
- [[_COMMUNITY_Quality Journey Execution|Quality Journey Execution]]
- [[_COMMUNITY_Quality Journey Triage External|Quality Journey Triage External]]
- [[_COMMUNITY_Quality Journey Requirement|Quality Journey Requirement]]
- [[_COMMUNITY_Repository Collaboration|Repository Collaboration]]
- [[_COMMUNITY_External Worker Gateway|External Worker Gateway]]
- [[_COMMUNITY_External Worker Native Mapping|External Worker Native Mapping]]
- [[_COMMUNITY_Worker Trusted Offline Composition|Worker Trusted Offline Composition]]
- [[_COMMUNITY_Native Descriptor Capture|Native Descriptor Capture]]
- [[_COMMUNITY_Worker Trusted Bridge External|Worker Trusted Bridge External]]
- [[_COMMUNITY_Native Descriptor Capture|Native Descriptor Capture]]
- [[_COMMUNITY_Trusted Worker Native Route|Trusted Worker Native Route]]
- [[_COMMUNITY_Run Diagnose Cli|Run Diagnose Cli]]
- [[_COMMUNITY_Compiler Options|Compiler Options]]
- [[_COMMUNITY_Package.Json Component|Package.Json Component]]
- [[_COMMUNITY_Repository Component|Repository Component]]
- [[_COMMUNITY_Scripts Component|Scripts Component]]
- [[_COMMUNITY_Dependencies Component|Dependencies Component]]
- [[_COMMUNITY_Dev Dependencies|Dev Dependencies]]
- [[_COMMUNITY_Engines Component|Engines Component]]
- [[_COMMUNITY_Allow Scripts|Allow Scripts]]
- [[_COMMUNITY_Prepare Template|Prepare Template]]
- [[_COMMUNITY_Prepare Template Utils|Prepare Template Utils]]
- [[_COMMUNITY_Prepare Template Scaffold Gitignore|Prepare Template Scaffold Gitignore]]
- [[_COMMUNITY_Template Check Agent Harness|Template Check Agent Harness]]
- [[_COMMUNITY_Template Boundary Config Filter|Template Boundary Config Filter]]
- [[_COMMUNITY_Template Catalog Cli Copy|Template Catalog Cli Copy]]
- [[_COMMUNITY_Prepare Template Script|Prepare Template Script]]
- [[_COMMUNITY_Prepare Template Utils|Prepare Template Utils]]
- [[_COMMUNITY_Sync Templates Utils|Sync Templates Utils]]
- [[_COMMUNITY_Compiler Options|Compiler Options]]
- [[_COMMUNITY_Package.Json Component|Package.Json Component]]
- [[_COMMUNITY_World Locator Util Builtin|World Locator Util Builtin]]
- [[_COMMUNITY_Cache Util Paths Hooks|Cache Util Paths Hooks]]
- [[_COMMUNITY_Contracts Registry Canonical Json|Contracts Registry Canonical Json]]
- [[_COMMUNITY_Captcha Detector|Captcha Detector]]
- [[_COMMUNITY_Browser Handlers|Browser Handlers]]
- [[_COMMUNITY_Dispatcher Contracts Human|Dispatcher Contracts Human]]
- [[_COMMUNITY_Builtins Contracts|Builtins Contracts]]
- [[_COMMUNITY_Contracts Invocation Value Schema|Contracts Invocation Value Schema]]
- [[_COMMUNITY_Dispatcher Contracts Artifact Contract|Dispatcher Contracts Artifact Contract]]
- [[_COMMUNITY_Composition Validator Invocation Contracts|Composition Validator Invocation Contracts]]
- [[_COMMUNITY_Step Operations|Step Operations]]
- [[_COMMUNITY_Compiler Options|Compiler Options]]
- [[_COMMUNITY_Package.Json Component|Package.Json Component]]
- [[_COMMUNITY_Session File Cli Selector|Session File Cli Selector]]
- [[_COMMUNITY_Compiler Options|Compiler Options]]
- [[_COMMUNITY_Appraise Quality Journey|Appraise Quality Journey]]
- [[_COMMUNITY_Appraise Js|Appraise Js]]
- [[_COMMUNITY_Skill Scaffold|Skill Scaffold]]

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
- `Config` --calls--> `bootstrap()`  [INFERRED]
  create-appraisejs/src/config.ts → cucumber-runtime/src/executor.ts

## Import Cycles
- 1-file cycle: `appraisejs/src/agent-setup-capabilities.ts -> appraisejs/src/agent-setup-capabilities.ts`

## Communities (69 total, 3 thin omitted)

### Community 5 - "Package.Json Component"
Cohesion: 0.04
Nodes (47): name, version, description, license, author, homepage, repository, type (+39 more)

### Community 18 - "Server Factory Mcp Coordinator"
Cohesion: 0.15
Nodes (14): iterations, startedAt, contract(), fixture, CoordinatorOptions, definitions(), createCoordinatorApiClient(), workspaces (+6 more)

### Community 3 - "Managed Worker Server Trusted"
Cohesion: 0.05
Nodes (45): definitions, profile, server, packageRoot, cliSource, cliArgs(), localAction(), close() (+37 more)

### Community 11 - "Shared Diagnostic Project Resources"
Cohesion: 0.09
Nodes (28): nullableOptionalString(), nullableOptionalPositiveInteger(), operationSearchInputSchema, registerProjectOperations(), registerResourcesOperations(), OPERATION_CATALOG_CONTRACT_VERSION, LOCATOR_GRAPH_CONTRACT_VERSION, require (+20 more)

### Community 37 - "Response Projector Runtime Capsule"
Cohesion: 0.20
Nodes (11): diagnostic, toolError(), registerRuntimeOperations(), responseModeEnum, responseModeSchema, MCP_RESPONSE_TOKEN_BUDGETS, record(), commonJourneyResponse() (+3 more)

### Community 19 - "Cli Mcp Call Http"
Cohesion: 0.11
Nodes (20): program, staleAgentCapabilityRecovery, toolsNotVisibleRecovery, OnlineOptions, addOnlineOptions(), locatorGraph, collaboration, addCollaborationJsonCommand() (+12 more)

### Community 21 - "Http Mcp Security Server"
Cohesion: 0.18
Nodes (16): resolveMcpEndpoint(), LOOPBACK_HOSTS, HttpMcpRequestError, normalizedHostname(), isLoopbackHostname(), assertLoopbackMcpHost(), hostHeaderIsAllowed(), peerIsLoopback() (+8 more)

### Community 38 - "Project Identity Coordinator Client"
Cohesion: 0.18
Nodes (14): onlineClient(), workspaces, client(), createCoordinatorClient(), workspaces, ProjectIdentity, DisabledProjectIdentity, ProjectIdentityDetails (+6 more)

### Community 9 - "Codex Compatibility"
Cohesion: 0.12
Nodes (26): workspaces, require, packageJson, HostCommandResult, HostCommand, CompatibilityCheck, CODEX_PLUGIN_LIST_ARGS, CODEX_MARKETPLACE_LIST_ARGS (+18 more)

### Community 48 - "Coordinator Client Project Identity"
Cohesion: 0.22
Nodes (9): TargetProjectRegistrationInput, coordinatorErrorEnvelopeSchema, CoordinatorErrorEnvelope, ParsedResponseBody, createLocalCoordinatorFailure(), coordinatorEndpointMismatch(), localCoordinatorBaseUrl(), untrustedCoordinatorEndpoint() (+1 more)

### Community 29 - "Diagnostics Coordinator Client Registry"
Cohesion: 0.21
Nodes (8): coordinatorRequestError, workspaces, Check, gitStatus(), gitlessBaseRevisionGuidance, diagnoseProject(), formatMcpBootstrapError(), resourceError()

### Community 24 - "Contract Mcp Registry"
Cohesion: 0.13
Nodes (17): ContractFixture, readOnly, localMutation, durableLifecycleMutation, externalExecution, externalStop, externalPreparation, externalCollaborationMutation (+9 more)

### Community 27 - "Registry Quality Journey Library"
Cohesion: 0.17
Nodes (16): mcpResourceAnnotations, mcpToolAnnotations(), registerDiagnosticOperations(), identifier, scope, registerQualityJourneyLibraryOperations(), registerStepDefinitionOperations(), McpRegistryContext (+8 more)

### Community 31 - "Quality Journey Execution"
Cohesion: 0.14
Nodes (15): id, hash, ids, scope, coordinatorSession, environment, reason, executionStartInput (+7 more)

### Community 25 - "Quality Journey Triage External"
Cohesion: 0.13
Nodes (18): id, hash, boundedText, ids, scope, coordinatorSession, triageEvidenceReadInput, finding (+10 more)

### Community 4 - "Quality Journey Requirement"
Cohesion: 0.04
Nodes (41): journeyId, target, hash, id, timestamp, boundedText, coordinatorSession, externalWorkRole (+33 more)

### Community 17 - "Repository Collaboration"
Cohesion: 0.09
Nodes (22): id, target, sha256, policyVersion, records, authorityReceipt, connectInput, prepareInput (+14 more)

### Community 12 - "External Worker Gateway"
Cohesion: 0.10
Nodes (22): binding(), result(), bundle, packet(), harness(), allRoles, id, digest (+14 more)

### Community 20 - "External Worker Native Mapping"
Cohesion: 0.13
Nodes (18): ExternalWorkerRole, externalWorkerTools, stable(), hash(), context, Profile, ExternalNativeRoute, stable() (+10 more)

### Community 10 - "Worker Trusted Offline Composition"
Cohesion: 0.11
Nodes (24): ExternalWorkerAcceptance, TrustedRouteInput, closes, binding(), fixture(), BridgeOptions, Endpoint, RouteContext (+16 more)

### Community 16 - "Native Descriptor Capture"
Cohesion: 0.16
Nodes (22): fixtureHash(), Json, NativeToolDescriptor, DescriptorContainer, CapturedCallable, DescriptorCapture, DescriptorCaptureFailure, DescriptorCaptureResult (+14 more)

### Community 26 - "Worker Trusted Bridge External"
Cohesion: 0.13
Nodes (17): ExternalWorkerAdvertisedProfile, createExternalWorkerMcpServer(), hash(), canonicalJson(), deepFreeze(), Stage, TrustedWorkerBridgeRequest, TrustedWorkerBridgeResponse (+9 more)

### Community 47 - "Native Descriptor Capture"
Cohesion: 0.22
Nodes (8): context, schema, fn(), custom, request(), capture(), NATIVE_DESCRIPTOR_LIMITS, TrustedDescriptorContext

### Community 15 - "Trusted Worker Native Route"
Cohesion: 0.14
Nodes (23): context, hash(), binding(), sdkFixture(), Profile, JsonObject, rejectedAuthorityFields, rejectedAbsentOperations (+15 more)

### Community 46 - "Run Diagnose Cli"
Cohesion: 0.29
Nodes (9): ready, TestRunDiagnosticResponse, DiagnoseDependencies, TestRunDiagnoseResult, diagnosticDto(), isBlocked(), boundedText(), humanBlocker() (+1 more)

### Community 23 - "Compiler Options"
Cohesion: 0.10
Nodes (20): compilerOptions, target, module, moduleResolution, lib, outDir, rootDir, baseUrl (+12 more)

### Community 34 - "Package.Json Component"
Cohesion: 0.12
Nodes (15): name, version, description, license, author, homepage, bugs, url (+7 more)

### Community 59 - "Repository Component"
Cohesion: 0.50
Nodes (4): repository, type, url, directory

### Community 36 - "Scripts Component"
Cohesion: 0.13
Nodes (15): scripts, prepublishOnly, build, clean, prepare-template, test, test:e2e, publish:alpha (+7 more)

### Community 57 - "Dependencies Component"
Cohesion: 0.40
Nodes (5): dependencies, @inquirer/prompts, cli-progress, cross-spawn, fs-extra

### Community 51 - "Dev Dependencies"
Cohesion: 0.25
Nodes (8): devDependencies, @types/cli-progress, @types/cross-spawn, @types/fs-extra, @types/node, tsx, typescript, vitest

### Community 60 - "Allow Scripts"
Cohesion: 0.67
Nodes (3): allowScripts, esbuild@0.28.1, fsevents@2.3.3

### Community 14 - "Prepare Template"
Cohesion: 0.11
Nodes (29): __dirname, packageRoot, repoRoot, packageTemplatesDir, baseTemplateDir, flavorsDir, tempWorkspaceDir, tempWorkspaceRootDir (+21 more)

### Community 44 - "Prepare Template Utils"
Cohesion: 0.20
Nodes (12): getTsxCliPath(), getPrismaCliPath(), getSeedDatabaseCandidates(), runProcess(), runTypeScriptScript(), runPrismaMigrateDeploy(), removeLegacyTemplateTargetProject(), copyFallbackSeedDatabase() (+4 more)

### Community 32 - "Prepare Template Scaffold Gitignore"
Cohesion: 0.17
Nodes (15): copyFile(), resetAutomationReports(), resetAutomationLocatorMap(), resetAutomationEnvironments(), syncLegacyEnvironmentConfig(), syncInternalPackage(), writeTemplatePackageJson(), writeTemplateHarnessCheck() (+7 more)

### Community 53 - "Template Check Agent Harness"
Cohesion: 0.33
Nodes (5): repoRoot, forbiddenPaths, forbiddenScripts, scriptsDir, packageJson

### Community 50 - "Template Boundary Config Filter"
Cohesion: 0.42
Nodes (6): shouldExcludePreparedConfigPath(), REPO_ONLY_TEMPLATE_PATHS, REPO_ONLY_TEMPLATE_PREFIXES, REPO_ONLY_TEMPLATE_SCRIPT_NAMES, toPosixPath(), isRepoOnlyTemplatePath()

### Community 1 - "Template Catalog Cli Copy"
Cohesion: 0.05
Nodes (62): CliOptions, getTemplateFlagValue(), parseCliArgs(), formatBrowserInstallStep(), getSuccessMessageLines(), printSuccessMessage(), main(), Config (+54 more)

### Community 54 - "Prepare Template Script"
Cohesion: 0.33
Nodes (4): filename, source, declaration, ProcessCall

### Community 35 - "Prepare Template Utils"
Cohesion: 0.24
Nodes (9): createPreparedTemplateFixture(), createTempTemplateDir(), fixture(), TemplateMetadata, StepDefinitionDataCounts, TEMPLATE_PREP_SYNC_SCRIPTS, BLANK_TEMPLATE_PREP_SYNC_SCRIPTS, getTemplatePrepSyncScripts() (+1 more)

### Community 55 - "Sync Templates Utils"
Cohesion: 0.47
Nodes (4): EXCLUDED_TEMPLATE_PATH_PREFIXES, EXCLUDED_TEMPLATE_FILENAMES, toPosixPath(), shouldExcludeBundledTemplatePath()

### Community 28 - "Compiler Options"
Cohesion: 0.11
Nodes (17): compilerOptions, target, module, moduleResolution, lib, outDir, rootDir, strict (+9 more)

### Community 43 - "Package.Json Component"
Cohesion: 0.17
Nodes (11): name, private, type, main, types, exports, scripts, build (+3 more)

### Community 0 - "World Locator Util Builtin"
Cohesion: 0.07
Nodes (31): BrowserRuntimeIssue, BrowserRuntimeDiagnostics, HumanVerificationRequiredEvent, EnvironmentConfig, ResolvedEnvironmentConfig, resolvePassword(), getEnvironment(), getAllEnvironments() (+23 more)

### Community 7 - "Cache Util Paths Hooks"
Cohesion: 0.06
Nodes (36): toGlobPath(), LocatorCache, LocatorMapCache, CliOptions, BROWSER_CHOICES, HEADLESS_CHOICES, program, environmentNames (+28 more)

### Community 13 - "Contracts Registry Canonical Json"
Cohesion: 0.10
Nodes (22): canonicalOperationJson(), OPERATION_CONTRACT_VERSION, operationIdSchema, operationVersionSchema, operationHashSchema, identifierSchema, operationContentHash(), operationInputSchema (+14 more)

### Community 42 - "Captcha Detector"
Cohesion: 0.19
Nodes (9): HUMAN_VERIFICATION_EVENT, HUMAN_VERIFICATION_REASON, CAPTCHA_DETECTOR_VERSION, CaptchaProvider, CaptchaCheckpoint, HumanVerificationRequiredError, CaptchaDetection, detectVisibleCaptchaChallenge() (+1 more)

### Community 6 - "Browser Handlers"
Cohesion: 0.09
Nodes (24): withReviewedSelectorResolver(), BrowserOperationContext, OperationExecutionError, BrowserOperationHandler, required(), stringInput(), numberInput(), orderedStringArrayInput() (+16 more)

### Community 40 - "Dispatcher Contracts Human"
Cohesion: 0.22
Nodes (13): BrowserOperationWorld, executeHumanOperation(), stepInputValueMatchesType(), validateStepInvocationInputs(), computeStepReferenceHash(), SealedStepDefinition, StepInvocationDispatchContext, definitionKey() (+5 more)

### Community 52 - "Builtins Contracts"
Cohesion: 0.32
Nodes (4): OperationDefinition, SourceOperation, builtInStepDefinitions, stepDefinitionSchema

### Community 8 - "Contracts Invocation Value Schema"
Cohesion: 0.10
Nodes (27): operationValueSchema, boundedOperationValueSchema, STEP_DEFINITION_SCHEMA_VERSION, stepDefinitionContentHash(), stepInputDefinitionSchema, stepOutputDefinitionSchema, stepExecutionBindingSchema, stepDefinitionDraftSchema (+19 more)

### Community 30 - "Dispatcher Contracts Artifact Contract"
Cohesion: 0.18
Nodes (8): StepContractValue, contractFields(), contractRuntime(), generateStepDefinitionContract(), StepDefinition, StepInvocation, reference(), invocation()

### Community 49 - "Composition Validator Invocation Contracts"
Cohesion: 0.16
Nodes (11): definition(), composition(), reference(), StepDefinitionCompositionDiagnostic, ResolvedStepDefinition, StepValueType, identityKey(), ExpressionKind (+3 more)

### Community 33 - "Step Operations"
Cohesion: 0.26
Nodes (15): StoredVariableReader, locatorOptionKeys, pageOptionKeys, LocatorStepOperation, PageStepOperation, isPlainObject(), parseJson(), resolveStoredReferences() (+7 more)

### Community 45 - "Compiler Options"
Cohesion: 0.18
Nodes (10): extends, compilerOptions, rootDir, outDir, noEmit, allowImportingTsExtensions, rewriteRelativeImportExtensions, declaration (+2 more)

### Community 39 - "Package.Json Component"
Cohesion: 0.14
Nodes (13): name, private, type, main, types, exports, ./launcher, ./session-file (+5 more)

### Community 2 - "Session File Cli Selector"
Cohesion: 0.05
Nodes (53): CliOptions, BrowserLaunchCandidate, parseArgs(), LocatorPickerCompanion, main(), installLocatorPickerOverlay(), pathExists(), getLatestModifiedTime() (+45 more)

### Community 41 - "Compiler Options"
Cohesion: 0.15
Nodes (12): extends, compilerOptions, rootDir, outDir, noEmit, allowImportingTsExtensions, declaration, emitDeclarationOnly (+4 more)

### Community 56 - "Appraise Quality Journey"
Cohesion: 0.33
Nodes (5): Appraise Quality Journey, Scoped discovery and human sign-in, Analysis and human waits, Scenario review and revision, Automation preparation

### Community 69 - "Appraise Js"
Cohesion: 0.50
Nodes (3): AppraiseJS, Journey operation, Recovery and upgrades

### Community 22 - "Skill Scaffold"
Cohesion: 0.11
Nodes (21): Appraise lifecycle authority, Project capability diagnostic, One-time handoff redemption, Authoritative Journey reread, Human review and consent gates, Scoped discovery browser receipts, Admitted role assignment, Exact lost-reply reconciliation (+13 more)

## Knowledge Gaps
- **489 isolated node(s):** `name`, `version`, `description`, `license`, `author` (+484 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fn()` connect `Native Descriptor Capture` to `World Locator Util Builtin`?**
  _High betweenness centrality (0.176) - this node is a cross-community bridge._
- **Why does `retry()` connect `World Locator Util Builtin` to `Native Descriptor Capture`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _489 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package.Json Component` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._
- **Should `Server Factory Mcp Coordinator` be split into smaller, more focused modules?**
  _Cohesion score 0.14855072463768115 - nodes in this community are weakly interconnected._
- **Should `Managed Worker Server Trusted` be split into smaller, more focused modules?**
  _Cohesion score 0.05310734463276836 - nodes in this community are weakly interconnected._
- **Should `Shared Diagnostic Project Resources` be split into smaller, more focused modules?**
  _Cohesion score 0.09365079365079365 - nodes in this community are weakly interconnected._
## Host Accounting And Freshness

Structural extraction used the installed deterministic AST extractor. Existing document concepts and relationships were retained only after current host review and exact public-document byte comparison with the recorded base commit. No provider/model API was called. Host task token usage is not exposed; zero extraction counters do not measure host review or community-label usage. The commit identifies the checked-out base; current worktree byte freshness is bound by the ignored harness content receipt.

## Graph Health Warnings

[graphify] MultiDiGraph edge-collapse diagnostic
input: <in-memory>
input_stage: provided JSON (normal graph.json is post-build)
effective_directed: <direct-call>
nodes: 1411
raw_edges: 3332
valid_candidate_edges: 2804
missing_endpoint_edges: 0
dangling_endpoint_edges: 528
self_loop_edges: 2
exact_duplicate_edges: 4
directed_unique_endpoint_pairs: 2695
directed_same_endpoint_collapsed_edges: 109
undirected_unique_endpoint_pairs: 2685
undirected_same_endpoint_collapsed_edges: 119
same_endpoint_group_count: 81
relation_variant_groups: 70
source_file_variant_groups: 0
source_location_variant_groups: 35
context_variant_groups: 29
post_build_graph_type: Graph
post_build_edges: 2685
producer_suppression_sites: 56
producer_suppression_examples:
  - L1404 seen_dyn_pairs arity=unknown
  - L2391 seen_ids arity=unknown
  - L2554 seen_swift_base arity=unknown
  - L2589 seen_swift_base arity=unknown
  - L3471 seen_call_pairs arity=2
  - L3472 seen_dyn_import_pairs arity=2
  - L3473 seen_static_ref_pairs arity=3
  - L3474 seen_helper_ref_pairs arity=3
examples:
  - mcp_shared -> mcp_coordinator_call edges=3 relations=['imports_from', 're_exports'] locations=['L16', 'L8'] contexts=['export', 'import', 're-export']
  - builtins_index -> builtins_active_state_assertion edges=3 relations=['imports_from', 're_exports'] locations=['L1', 'L53'] contexts=['export', 'import', 're-export']
  - builtins_index -> builtins_browser_assertion edges=3 relations=['imports_from', 're_exports'] locations=['L2', 'L54'] contexts=['export', 'import', 're-export']
  - builtins_index -> builtins_browser_state edges=3 relations=['imports_from', 're_exports'] locations=['L3', 'L55'] contexts=['export', 'import', 're-export']
  - builtins_index -> builtins_click edges=3 relations=['imports_from', 're_exports'] locations=['L4', 'L56'] contexts=['export', 'import', 're-export']
note: normal graph.json is post-build; raw producer loss must be measured earlier.
These raw extraction/aggregation diagnostics are separate from final JSON endpoint integrity and are not product-validation or native-runtime evidence. No new-regression attribution is made from counts alone.
