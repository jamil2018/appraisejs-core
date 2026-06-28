# Graph Report - packages  (2026-06-28)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 653 nodes · 999 edges · 77 communities (73 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `25fd4d66`
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
- [[_COMMUNITY_Community 76|Community 76]]

## God Nodes (most connected - your core abstractions)
1. `LocatorPickerCompanion` - 16 edges
2. `compilerOptions` - 15 edges
3. `scripts` - 15 edges
4. `compilerOptions` - 15 edges
5. `scripts` - 13 edges
6. `TemplateId` - 13 edges
7. `createBaseTemplate()` - 12 edges
8. `main()` - 12 edges
9. `LocatorCache` - 9 edges
10. `compilerOptions` - 9 edges

## Surprising Connections (you probably didn't know these)
- `bootstrap()` --calls--> `Config`  [INFERRED]
  cucumber-runtime/src/executor.ts → create-appraisejs/src/config.ts
- `CliOptions` --references--> `TemplateId`  [EXTRACTED]
  create-appraisejs/src/cli-args.ts → create-appraisejs/src/template-catalog.ts
- `getSuccessMessageLines()` --calls--> `getInstallCommand()`  [INFERRED]
  create-appraisejs/src/cli.ts → create-appraisejs/src/install.ts
- `CreateProjectResult` --references--> `Config`  [EXTRACTED]
  create-appraisejs/src/create-project.ts → create-appraisejs/src/config.ts
- `patchAndRead()` --calls--> `patchPackageJsonScripts()`  [EXTRACTED]
  create-appraisejs/src/install.test.ts → create-appraisejs/src/install.ts

## Import Cycles
- None detected.

## Communities (77 total, 4 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (62): main(), CliOptions, getTemplateFlagValue(), parseCliArgs(), formatBrowserInstallStep(), getSuccessMessageLines(), printSuccessMessage(), Config (+54 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (66): baseTemplateDir, cleanupTempWorkspace(), composedVerifyDir, composeTemplateForVerification(), computeTemplateInputHash(), copyDirWithFilter(), copyDirWithoutBundledExclusions(), copyFallbackSeedDatabase() (+58 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (29): CliOptions, main(), BrowserLaunchCandidate, LocatorPickerCompanion, parseArgs(), installLocatorPickerOverlay(), appendLocatorPickerCrashLog(), clearLocatorPickerCrashLogs() (+21 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (44): author, bin, appraisejs, bugs, url, dependencies, commander, @modelcontextprotocol/sdk (+36 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (25): addStepBySlug(), AddStepDependencies, defaultDependencies, PAYLOAD, removeTempPayloadFile(), runLocalInstaller(), writePayloadToTempFile(), AppraiseProjectInfo (+17 more)

### Community 5 - "Community 5"
Cohesion: 0.18
Nodes (16): buildCssSelector(), buildPrimarySelector(), buildXPathSelector(), ElementSnapshot, escapeForCss(), escapeForSelectorText(), generatePickedLocatorPayload(), getElementSnapshot() (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (4): LocatorCache, toGlobPath(), getAutomationLocatorsDir(), LocatorCollection

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (13): validPlan, assertNoYamlReferences(), createOfflineDraft(), idSchema, planArtifactBaseSchema, planArtifactSchema, planCreateInputSchema, PlanFile (+5 more)

### Community 10 - "Community 10"
Cohesion: 0.12
Nodes (15): author, bugs, url, description, engines, node, exports, files (+7 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (15): scripts, build, bump:alpha, bump:beta, bump:major, bump:minor, bump:patch, bump:release (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.21
Nodes (11): EnvironmentConfig, getAllEnvironments(), getEnvironment(), getAutomationEnvironmentsFilePath(), generateRandomData(), RandomDataType, CSSSelector, Locator (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.29
Nodes (13): buildJsonReportFormat(), extractReportPathFromFormat(), getAutomationConfigDir(), getAutomationFeaturesDir(), getAutomationReportRunDir(), getAutomationReportRunDirFromReportPath(), getAutomationReportsDir(), getAutomationRoot() (+5 more)

### Community 14 - "Community 14"
Cohesion: 0.14
Nodes (13): exports, ./launcher, ./session-file, ./types, main, name, private, scripts (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.19
Nodes (10): OnlineOptions, plan, printErrorJson(), printJson(), program, project, runCommand(), test (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.20
Nodes (8): CliOptions, program, BROWSER_CHOICES, environmentNames, HEADLESS_CHOICES, startCli(), bootstrap(), BrowserName

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (11): compilerOptions, declaration, emitDeclarationOnly, lib, module, moduleResolution, noEmit, outDir (+3 more)

### Community 18 - "Community 18"
Cohesion: 0.20
Nodes (6): AppraiseHttpMcpOptions, createAppraiseMcpServer(), createCoordinatorApiClient(), PlanSnapshot, runAppraiseHttpMcp(), runAppraiseMcp()

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (7): assert(), callTool(), databasePath, planPath, repoRoot, reviewPath, toolJson()

### Community 20 - "Community 20"
Cohesion: 0.24
Nodes (6): deriveProjectIdentity(), ensureLocalProjectIdentity(), ProjectIdentity, ProjectIdentityDetails, ProjectIdentityError, tempDirs

### Community 21 - "Community 21"
Cohesion: 0.20
Nodes (9): exports, main, name, private, scripts, build, type, types (+1 more)

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (8): compilerOptions, declaration, emitDeclarationOnly, noEmit, outDir, rootDir, extends, include

### Community 23 - "Community 23"
Cohesion: 0.33
Nodes (7): onlineClient(), createCoordinatorClient(), Check, diagnoseProject(), formatMcpBootstrapError(), gitStatus(), workspaces

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (8): devDependencies, tsx, @types/cli-progress, @types/cross-spawn, @types/fs-extra, @types/node, typescript, vitest

### Community 25 - "Community 25"
Cohesion: 0.25
Nodes (3): CoordinatorOptions, CoordinatorRequestError, workspaces

### Community 26 - "Community 26"
Cohesion: 0.46
Nodes (6): resolveLocator(), retry(), routeKey(), sleep(), validateResolvedSelector(), waitForRouteSettled()

### Community 27 - "Community 27"
Cohesion: 0.48
Nodes (5): ensureLocatorPickerCompanionBuilt(), getLatestModifiedTime(), getLocatorPickerCompanionPaths(), pathExists(), resolveLocatorPickerCompanionInvocation()

### Community 29 - "Community 29"
Cohesion: 0.40
Nodes (5): dependencies, cli-progress, cross-spawn, fs-extra, @inquirer/prompts

### Community 31 - "Community 31"
Cohesion: 0.50
Nodes (4): repository, directory, type, url

### Community 32 - "Community 32"
Cohesion: 0.50
Nodes (3): generatedAt, steps, version

### Community 76 - "Community 76"
Cohesion: 0.38
Nodes (3): LocatorMapCache, getAutomationLocatorMapPath(), LocatorMap

## Knowledge Gaps
- **228 isolated node(s):** `name`, `version`, `description`, `license`, `author` (+223 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Config` connect `Community 0` to `Community 16`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `bootstrap()` connect `Community 16` to `Community 0`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **What connects `name`, `version`, `description` to the rest of the system?**
  _228 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0515406162464986 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.052982456140350874 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.09435707678075855 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._