# Graph Report - packages  (2026-07-08)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 744 nodes · 1125 edges · 80 communities (75 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `49ef38d0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Create Cli|Create Cli]]
- [[_COMMUNITY_Create Scripts Prepare|Create Scripts Prepare]]
- [[_COMMUNITY_Mcp Server|Mcp Server]]
- [[_COMMUNITY_Locator Picker Companion|Locator Picker Companion]]
- [[_COMMUNITY_Cli Commands|Cli Commands]]
- [[_COMMUNITY_Author Bin Bugs|Author Bin Bugs]]
- [[_COMMUNITY_Types Add|Types Add]]
- [[_COMMUNITY_Plan Contract Parity|Plan Contract Parity]]
- [[_COMMUNITY_Tsconfig Config|Tsconfig Config]]
- [[_COMMUNITY_Create Tsconfig|Create Tsconfig]]
- [[_COMMUNITY_Create Author|Create Author]]
- [[_COMMUNITY_Create Scripts|Create Scripts]]
- [[_COMMUNITY_Cucumber Runtime|Cucumber Runtime]]
- [[_COMMUNITY_Cucumber Runtime Hooks|Cucumber Runtime Hooks]]
- [[_COMMUNITY_Locator Picker Companion|Locator Picker Companion]]
- [[_COMMUNITY_Cucumber Runtime Cli|Cucumber Runtime Cli]]
- [[_COMMUNITY_Locator Picker Companion|Locator Picker Companion]]
- [[_COMMUNITY_Mcp E2e|Mcp E2e]]
- [[_COMMUNITY_Locator Picker Companion|Locator Picker Companion]]
- [[_COMMUNITY_Cucumber Runtime Cache|Cucumber Runtime Cache]]
- [[_COMMUNITY_Cucumber Runtime|Cucumber Runtime]]
- [[_COMMUNITY_Cucumber Runtime Tsconfig|Cucumber Runtime Tsconfig]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Create DevDependencies|Create DevDependencies]]
- [[_COMMUNITY_Cucumber Runtime Locator|Cucumber Runtime Locator]]
- [[_COMMUNITY_Locator Picker Companion|Locator Picker Companion]]
- [[_COMMUNITY_Cucumber Runtime Cache|Cucumber Runtime Cache]]
- [[_COMMUNITY_Cucumber Runtime World|Cucumber Runtime World]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Create Dependencies|Create Dependencies]]
- [[_COMMUNITY_Create Repository|Create Repository]]
- [[_COMMUNITY_Registry Template Steps|Registry Template Steps]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Agent Skills Planning|Agent Skills Planning]]
- [[_COMMUNITY_Create Bin|Create Bin]]
- [[_COMMUNITY_Skill Policy|Skill Policy]]

## God Nodes (most connected - your core abstractions)
1. `LocatorPickerCompanion` - 16 edges
2. `compilerOptions` - 15 edges
3. `scripts` - 15 edges
4. `compilerOptions` - 15 edges
5. `scripts` - 13 edges
6. `TemplateId` - 13 edges
7. `createBaseTemplate()` - 12 edges
8. `main()` - 12 edges
9. `createCoordinatorClient()` - 9 edges
10. `LocatorCache` - 9 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `Config`  [INFERRED]
  cucumber-runtime/src/executor.ts → create-appraisejs/src/config.ts
- `onlineClient()` --calls--> `createCoordinatorClient()`  [EXTRACTED]
  appraisejs/src/cli.ts → appraisejs/src/coordinator-client.ts
- `workspace()` --calls--> `deriveProjectIdentity()`  [EXTRACTED]
  appraisejs/src/coordinator-client.test.ts → appraisejs/src/project-identity.ts
- `toolError()` --calls--> `coordinatorRequestErrorEnvelope()`  [EXTRACTED]
  appraisejs/src/mcp.ts → appraisejs/src/coordinator-client.ts
- `createCoordinatorApiClient()` --calls--> `createCoordinatorClient()`  [EXTRACTED]
  appraisejs/src/mcp.ts → appraisejs/src/coordinator-client.ts

## Import Cycles
- None detected.

## Communities (80 total, 5 thin omitted)

### Community 0 - "Create Cli"
Cohesion: 0.05
Nodes (64): main(), CliOptions, getTemplateFlagValue(), parseCliArgs(), formatBrowserInstallStep(), getSuccessMessageLines(), printSuccessMessage(), Config (+56 more)

### Community 1 - "Create Scripts Prepare"
Cohesion: 0.05
Nodes (64): baseTemplateDir, cleanupTempWorkspace(), composedVerifyDir, composeTemplateForVerification(), computeTemplateInputHash(), copyDirWithFilter(), copyDirWithoutBundledExclusions(), copyFallbackSeedDatabase() (+56 more)

### Community 2 - "Mcp Server"
Cohesion: 0.05
Nodes (44): agentGuide, AppraiseHttpMcpOptions, approvalPendingResponse(), baseWorkflowCriticalTools, baseWorkflowResourceUris, BriefPlanTask, CoordinatorToolEvent, createAppraiseMcpServer() (+36 more)

### Community 3 - "Locator Picker Companion"
Cohesion: 0.08
Nodes (34): CliOptions, main(), BrowserLaunchCandidate, LocatorPickerCompanion, parseArgs(), installLocatorPickerOverlay(), appendLocatorPickerCrashLog(), clearLocatorPickerCrashLogs() (+26 more)

### Community 4 - "Cli Commands"
Cohesion: 0.06
Nodes (36): program, agent, expectedAgentCapabilities, onlineClient(), OnlineOptions, packageRoot, plan, printErrorJson() (+28 more)

### Community 5 - "Author Bin Bugs"
Cohesion: 0.04
Nodes (44): author, bin, appraisejs, bugs, url, dependencies, commander, @modelcontextprotocol/sdk (+36 more)

### Community 6 - "Types Add"
Cohesion: 0.09
Nodes (26): addStepBySlug(), AddStepDependencies, defaultDependencies, PAYLOAD, removeTempPayloadFile(), runLocalInstaller(), writePayloadToTempFile(), AppraiseProjectInfo (+18 more)

### Community 7 - "Plan Contract Parity"
Cohesion: 0.09
Nodes (24): validPlan, validValidation, approvalSchema, assertNoYamlReferences(), createOfflineDraft(), hashSchema, idSchema, implementationValidationRunSchema (+16 more)

### Community 8 - "Tsconfig Config"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 9 - "Create Tsconfig"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 10 - "Create Author"
Cohesion: 0.12
Nodes (15): author, bugs, url, description, engines, node, exports, files (+7 more)

### Community 11 - "Create Scripts"
Cohesion: 0.13
Nodes (15): scripts, build, bump:alpha, bump:beta, bump:major, bump:minor, bump:patch, bump:release (+7 more)

### Community 12 - "Cucumber Runtime"
Cohesion: 0.21
Nodes (11): EnvironmentConfig, getAllEnvironments(), getEnvironment(), getAutomationEnvironmentsFilePath(), generateRandomData(), RandomDataType, CSSSelector, Locator (+3 more)

### Community 13 - "Cucumber Runtime Hooks"
Cohesion: 0.29
Nodes (13): buildJsonReportFormat(), extractReportPathFromFormat(), getAutomationConfigDir(), getAutomationFeaturesDir(), getAutomationReportRunDir(), getAutomationReportRunDirFromReportPath(), getAutomationReportsDir(), getAutomationRoot() (+5 more)

### Community 14 - "Locator Picker Companion"
Cohesion: 0.14
Nodes (13): exports, ./launcher, ./session-file, ./types, main, name, private, scripts (+5 more)

### Community 15 - "Cucumber Runtime Cli"
Cohesion: 0.20
Nodes (8): CliOptions, program, BROWSER_CHOICES, environmentNames, HEADLESS_CHOICES, startCli(), bootstrap(), BrowserName

### Community 16 - "Locator Picker Companion"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, emitDeclarationOnly, lib, module, moduleResolution, noEmit, outDir (+3 more)

### Community 17 - "Mcp E2e"
Cohesion: 0.21
Nodes (8): approveCurrentPlan(), assert(), callTool(), databasePath, providerNativeRunsEnabled, repoRoot, reviewPathFor(), toolJson()

### Community 18 - "Locator Picker Companion"
Cohesion: 0.33
Nodes (11): buildCssSelector(), buildPrimarySelector(), buildXPathSelector(), ElementSnapshot, escapeForCss(), escapeForSelectorText(), generatePickedLocatorPayload(), getElementSnapshot() (+3 more)

### Community 19 - "Cucumber Runtime Cache"
Cohesion: 0.25
Nodes (4): LocatorCache, toGlobPath(), getAutomationLocatorsDir(), LocatorCollection

### Community 20 - "Cucumber Runtime"
Cohesion: 0.20
Nodes (9): exports, main, name, private, scripts, build, type, types (+1 more)

### Community 21 - "Cucumber Runtime Tsconfig"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, emitDeclarationOnly, noEmit, outDir, rootDir, extends, include

### Community 22 - "Agent Skills Planning"
Cohesion: 0.25
Nodes (8): appraise://agent-guide, appraisejs agent setup, Appraise Approval, AppraiseJS, Chat Approval, Appraise Planning Standby Skill, MCP Tools, npm run setup:agent

### Community 23 - "Create DevDependencies"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/cli-progress, @types/cross-spawn, @types/fs-extra, @types/node, typescript, vitest

### Community 24 - "Cucumber Runtime Locator"
Cohesion: 0.46
Nodes (6): resolveLocator(), retry(), routeKey(), sleep(), validateResolvedSelector(), waitForRouteSettled()

### Community 25 - "Locator Picker Companion"
Cohesion: 0.48
Nodes (5): ensureLocatorPickerCompanionBuilt(), getLatestModifiedTime(), getLocatorPickerCompanionPaths(), pathExists(), resolveLocatorPickerCompanionInvocation()

### Community 26 - "Cucumber Runtime Cache"
Cohesion: 0.38
Nodes (3): LocatorMapCache, getAutomationLocatorMapPath(), LocatorMap

### Community 28 - "Agent Skills Planning"
Cohesion: 0.40
Nodes (5): nextAfterSequence, plan_review_read, plan_wait_for_approval, Standby, Complete URL Handoff

### Community 29 - "Create Dependencies"
Cohesion: 0.40
Nodes (5): dependencies, cli-progress, cross-spawn, fs-extra, @inquirer/prompts

### Community 30 - "Create Repository"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 31 - "Registry Template Steps"
Cohesion: 0.50
Nodes (3): generatedAt, steps, version

### Community 32 - "Agent Skills Planning"
Cohesion: 0.67
Nodes (3): Appraise Hub Checkout, project_add, External Target Workspace

### Community 33 - "Agent Skills Planning"
Cohesion: 0.67
Nodes (3): plan_create, planning_session_create, project_diagnostic

### Community 34 - "Agent Skills Planning"
Cohesion: 0.67
Nodes (3): plan_review_loop, plan_review_ready Evidence, plan_wait_for_review

## Knowledge Gaps
- **277 isolated node(s):** `name`, `version`, `description`, `license`, `author` (+272 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Config` connect `Create Cli` to `Cucumber Runtime Cli`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `bootstrap()` connect `Cucumber Runtime Cli` to `Create Cli`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _277 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Create Cli` be split into smaller, more focused modules?**
  _Cohesion score 0.05025394279604384 - nodes in this community are weakly interconnected._
- **Should `Create Scripts Prepare` be split into smaller, more focused modules?**
  _Cohesion score 0.05442428730099963 - nodes in this community are weakly interconnected._
- **Should `Mcp Server` be split into smaller, more focused modules?**
  _Cohesion score 0.05389610389610389 - nodes in this community are weakly interconnected._
- **Should `Locator Picker Companion` be split into smaller, more focused modules?**
  _Cohesion score 0.07896575821104122 - nodes in this community are weakly interconnected._