# Graph Report - src  (2026-07-01)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2963 nodes · 8209 edges · 112 communities (105 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7b27502b`
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
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 106|Community 106]]
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 110|Community 110]]
- [[_COMMUNITY_Community 111|Community 111]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 159 edges
2. `unknownErrorToActionResponse()` - 84 edges
3. `Button()` - 56 edges
4. `serviceErrorToActionResponse()` - 47 edges
5. `ensureAutomationWorkspaceReady()` - 42 edges
6. `ServiceError` - 41 edges
7. `ActionResponse` - 39 edges
8. `PageHeader()` - 37 edges
9. `getAllModulesAction()` - 35 edges
10. `HeaderSubtitle()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `CreateLocatorGroup()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/locator-groups/create/page.tsx → actions/modules/module-actions.ts
- `LocatorGroups()` --calls--> `getAllLocatorGroupsAction()`  [EXTRACTED]
  app/(base)/locator-groups/page.tsx → actions/locator-groups/locator-group-actions.ts
- `ModifyLocator()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/locator-groups/modify/[id]/page.tsx → actions/modules/module-actions.ts
- `ModifyTestSuite()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/test-suites/modify/[id]/page.tsx → actions/modules/module-actions.ts
- `ViewReport()` --calls--> `getReportByIdAction()`  [INFERRED]
  app/(base)/reports/[id]/page.tsx → actions/reports/report-actions.ts

## Import Cycles
- 1-file cycle: `components/diagram/node-form.tsx -> components/diagram/node-form.tsx`

## Communities (112 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (54): { push, refresh, toast, startLocatorPickerSessionAction, savePickedLocatorAction }, AppDrawerItem, colorMap, OngoingTestRunsCardProps, DynamicParameterLocatorExistingSection(), getLocatorPlaceholder(), LocatorFieldSectionProps, LocatorGroup (+46 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (72): payload, metadata, ModifyLocator(), ActionResponse, moduleSchema, testCaseSchema, generateUniqueTestCaseIdentifier(), checkLocatorGroupNameUnique() (+64 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (60): metadata, getPageTransitionVariant(), PageTransitionVariant, Template(), { usePathnameMock }, TestRunDetailPage(), TestRunDetailPageProps, MotionDivProps (+52 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (51): InlineLocatorSaveResult, DynamicParameterValue, LocatorGroupOption, LocatorOption, LocatorSelectionMode, DynamicParameterInputField(), DynamicFieldState, DynamicFormFieldsProps (+43 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (51): FlowDiagramBlockDialog(), FlowDiagramBlockDialogProps, buildStepKeywords(), getStepSearchScore(), normalizeForSearch(), scoreMatch(), StepIcon(), TemplateStepCombobox() (+43 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (36): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+28 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (52): TestRun, testRunFormOpts, testRunSchema, getFilterTags(), TagShape, getActionErrorMessage(), getTestRunSuccessPath(), isModuleRow() (+44 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (44): metadata, browserEngineToBadge(), testRunResultToBadge(), testRunStatusToBadge(), ViewReport(), FeatureChartProps, OverviewChartProps, DurationChart (+36 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (37): ActionResponseData, TestSuite, testSuiteFormOpts, EntitySearchCommand(), EntitySearchCommandProps, LoadAction, LoadState, NavCommandSearch() (+29 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (51): getTestSuiteSyncIdentity(), buildFilesystemSnapshot(), buildModuleTreePaths(), CollapsedTestCaseFromFs, countEnvironmentMismatches(), countLocatorGroupMismatches(), countLocatorMismatches(), countModuleMismatches() (+43 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (53): metadata, metadata, ModifyLocator(), metadata, metadata, metadata, getEnvironmentRows(), getLocatorGroupRows() (+45 more)

### Community 11 - "Community 11"
Cohesion: 0.07
Nodes (42): testCaseDataColumns, testCasePickerColumns, testCaseSelectionColumn, applyUpdater(), createInitialPickerState(), defaultPagination, createSelectionState(), getSavedTestCases() (+34 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (36): AddNodePromptFlowNode, AddNodePromptNode, ButtonEdge(), DEFAULT_EDGE_STYLE, FlowEdgeMutationGuard, flowEdgeMutationGuardRef, ADD_NODE_PROMPT_NODE_TYPE, AddNodePromptNodeData (+28 more)

### Community 13 - "Community 13"
Cohesion: 0.11
Nodes (26): environmentTableCols, formatDateTime(), locatorGroupTableCols, moduleTableCols, getStatusStyle(), PlanFlowTaskNode, statusStyles, { toast } (+18 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (41): Dashboard(), metadata, DataCard(), DataCardGrid(), ExecutionHealthPanel(), ExecutionHealthPanelProps, OngoingTestRunsCard(), QuickActionsDrawer() (+33 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (38): AppDrawerItemColor, formatExecutionOrder(), formatExecutionSummary(), formatFailureSummary(), getSyncTooltipCopy(), syncPanelInfo, syncPresentation, SyncRunResult (+30 more)

### Community 16 - "Community 16"
Cohesion: 0.07
Nodes (32): EmptyTube(), TubePlus(), cn(), CommandBadge(), CommandBadgeProps, CommandChainInput(), CommandChainInputProps, NavLink() (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.07
Nodes (31): canRequestPlanChanges(), addPlanRemark(), approvePlanRevision(), emptyReview(), findRemarkThread(), getPlanReviewDetail(), hashContent(), parsePositions() (+23 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (27): InlineTagCreationDialog(), InlineTestSuiteCreationDialog(), DetailsStepProps, detailsStepSchema, EMPTY_FLOW_BLOCKS, FlowPanel(), FlowPanelProps, FlowStepProps (+19 more)

### Community 19 - "Community 19"
Cohesion: 0.14
Nodes (20): metadata, metadata, CreateModule(), Module, ModifyModule(), ModuleWithParent, getActionErrorMessage(), moduleFieldValidators (+12 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (33): metadata, TemplateStep, templateStepFormOpts, ModifyTemplateStepPage(), buildFunctionDefinitionPreview(), getActionErrorMessage(), getFieldErrorMessage(), getInitialFunctionDefinition() (+25 more)

### Community 21 - "Community 21"
Cohesion: 0.12
Nodes (37): applyBlockingFeedback(), approveImplementationCompletion(), assertBaselineAccepted(), assertImplementationLifecycle(), completionEvidenceHash(), controlImplementation(), implementationContext(), Options (+29 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (34): assertNoYamlReferences(), assertSize(), canonicalize(), mapSchemaError(), parseJsonArtifact(), parseYamlArtifact(), serializeJsonArtifact(), serializeYamlArtifact() (+26 more)

### Community 23 - "Community 23"
Cohesion: 0.13
Nodes (16): assessValidationReadiness(), canModifyDuringValidationPreparation(), currentFileApproval(), fileReviewHash(), validationNodeHash(), ValidationReadiness, classifyFile(), computeFileReviewDeltas() (+8 more)

### Community 24 - "Community 24"
Cohesion: 0.10
Nodes (34): acceptBaselineAction(), acknowledgeBaselineFailureAction(), addPlanRemarkAction(), approvePlanRevisionAction(), approveValidationFileAction(), cancelBaselineExecutionAction(), decideValidationNodeAction(), fileTargetSchema (+26 more)

### Community 25 - "Community 25"
Cohesion: 0.12
Nodes (32): assessBaselineAcceptance(), BaselineClassification, BaselineCombination, baselineCombinationBlockers(), baselineCombinationKey(), BaselineEvidence, classifyBaselineResult(), CucumberStep (+24 more)

### Community 26 - "Community 26"
Cohesion: 0.11
Nodes (30): metadata, metadata, CreateTestRun(), tagSchema, ModifyTag(), checkUniqueTagExpression(), checkUniqueTagName(), createTag() (+22 more)

### Community 27 - "Community 27"
Cohesion: 0.08
Nodes (25): coordinatorContractVersion, listProviderWorkflowRuns(), createPlanArtifactSchema, createPlanBodySchema, dispatchGet(), dispatchPost(), GET(), getDiagnostic() (+17 more)

### Community 28 - "Community 28"
Cohesion: 0.18
Nodes (25): appendProviderEvent(), appendProviderEvents(), cancelProviderWorkflowRun(), createProviderWorkflowRun(), ensureAdapterRegistration(), execFileAsync, getProviderWorkflowRun(), hashText() (+17 more)

### Community 29 - "Community 29"
Cohesion: 0.14
Nodes (22): metadata, metadata, templateStepGroupSchema, ModifyTemplateStepGroup(), createTemplateStepGroupAction(), deleteTemplateStepGroupAction(), getAllTemplateStepGroupsAction(), getTemplateStepGroupByIdAction() (+14 more)

### Community 30 - "Community 30"
Cohesion: 0.14
Nodes (22): ensureProjectDatabaseUrl(), globalForPrisma, normalizeDatabaseUrl(), { PrismaClient }, PrismaClientInstance, readProjectDatabaseUrl(), require, templateStepSchema (+14 more)

### Community 31 - "Community 31"
Cohesion: 0.16
Nodes (15): getAutomationLocatorsDir(), ensureAutomationWorkspaceReady(), AutomationProjectionService, getTemplateStepGroupType(), cleanupEmptyDirectories(), createEmptyLocatorGroupFile(), createOrUpdateLocatorGroupFile(), deleteLocatorGroupFile() (+7 more)

### Community 32 - "Community 32"
Cohesion: 0.11
Nodes (24): CoordinatorProjectDetails, CoordinatorProjectIdentityError, deriveCoordinatorProjectIdentity(), assertLoopbackUrl(), guardCoordinatorRequest(), LOOPBACK_HOSTS, readCoordinatorJson(), { authenticateProject, ensureProjectIdentity } (+16 more)

### Community 33 - "Community 33"
Cohesion: 0.09
Nodes (9): globalForTaskSpawner, killTask(), removeTask(), SpawnedProcess, SpawnerOptions, spawnTask(), TaskSpawner, waitForTask() (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.10
Nodes (21): flowBlockSchema, testCaseStepSchema, testCaseStepsSchema, EMPTY_FLOW_BLOCKS, TemplateTestCaseForm(), TemplateTestCaseFormProps, { push, toast }, buildScenarioPreview() (+13 more)

### Community 35 - "Community 35"
Cohesion: 0.10
Nodes (26): resolveTargetProject(), formatLogsForStorage(), LogEntry, parseLogsFromStorage(), buildOrExpression(), buildTestRunsWhereClause(), isCancelledOrCancellingStatus(), normalizeSuiteSelection() (+18 more)

### Community 36 - "Community 36"
Cohesion: 0.09
Nodes (16): BaseNode(), AddNodePromptNodeComponentProps, FlowDiagramNodeSearch(), FlowDiagramNodeSearchProps, FlowNodeSearchResult, FlowDiagramToolbarProps, OptionsHeaderGherkinParameter, OptionsHeaderGherkinStep() (+8 more)

### Community 37 - "Community 37"
Cohesion: 0.26
Nodes (20): getAutomationActionStepsDir(), getAutomationConfigDir(), getAutomationEnvironmentsDir(), getAutomationMappingDir(), getAutomationReportLogsDir(), getAutomationReportRunDir(), getAutomationReportsDir(), getAutomationRoot() (+12 more)

### Community 38 - "Community 38"
Cohesion: 0.09
Nodes (20): FlowBlockBounds, FlowDiagramBlockOverlays(), FlowDiagramBlockOverlaysProps, FlowDiagram(), FlowLayoutRefreshProps, FlowDiagramGroupingHints(), FlowDiagramGroupingHintsProps, layoutRefreshDelays (+12 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (23): buildCodexExecArgs(), buildCodexMcpArgs(), buildCodexPlanningPrompt(), codexProviderAdapter, probeCodexProvider(), ProcessResult, providerCommand(), runProcess() (+15 more)

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (20): NodeData, NodeOrderMap, TemplateTestCaseNodeOrderMap, DiagramNodeOrder, DiagramNodeParameter, toNodeOrderMap(), toTemplateTestCaseNodeOrderMap(), DiagramNodeOrder (+12 more)

### Community 41 - "Community 41"
Cohesion: 0.15
Nodes (26): addMissingScenariosToTestSuite(), addScenarioToTestSuite(), applyScenarioMetadataToSteps(), connectTagsToTestSuite(), createOrUpdateTestCaseStep(), createScenarioSteps(), createScenarioTestCase(), createTestSuiteWithScenarios() (+18 more)

### Community 42 - "Community 42"
Cohesion: 0.14
Nodes (11): ArtifactKind, artifactLocation, assertPlanId(), hashContent(), pathExists(), PlanArtifactRepository, PlanArtifactRepositoryOptions, PlanRepositoryError (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (21): StoredPlanArtifact, createOpaquePlanId(), createPlanSlug(), encodeRandom(), encodeTime(), isLegacyPlanId(), countPendingPlanSync(), groupArtifacts() (+13 more)

### Community 44 - "Community 44"
Cohesion: 0.13
Nodes (14): dispatchTestRunExit(), LogViewer(), createLogMessage(), parseLogMessages(), fatalErrorPatterns, getConnectionStatusText(), isFatalLogStreamError(), isTerminalRunStatus() (+6 more)

### Community 45 - "Community 45"
Cohesion: 0.16
Nodes (23): TemplateStepGroupType, ensureStepsDirectory(), formatFileContent(), generateFileContent(), generateStepDefinition(), generateStepJSDoc(), getFilePath(), getSubdirectoryName() (+15 more)

### Community 46 - "Community 46"
Cohesion: 0.19
Nodes (23): CreateLocatorWorkspace(), canLaunchPicker(), canSaveLocator(), createInitialWorkspaceState(), createWorkspaceAutoFillSnapshot(), formatStatus(), getLocatorSourceType(), getLocatorWorkspaceResolutionMode() (+15 more)

### Community 47 - "Community 47"
Cohesion: 0.10
Nodes (19): listPlans(), metadata, PlansPage(), approvedStates, baselineStates, filterPredicates, filters, getCardAccentClass() (+11 more)

### Community 48 - "Community 48"
Cohesion: 0.12
Nodes (28): metadata, metadata, metadata, CreateTestSuite(), testSuiteSchema, ModifyTestSuite(), getIdentifierTagByPrefix(), createTestSuiteIdentifierTag() (+20 more)

### Community 49 - "Community 49"
Cohesion: 0.17
Nodes (16): getConvertedTemplateTestCaseData(), getFieldErrorMessage(), getTemplateSelectionOptions(), getTemplateSelectionRows(), getTemplateTestCaseWithSteps(), isNamedRow(), isTemplateTestCaseWithSteps(), TemplateSelectionOption (+8 more)

### Community 50 - "Community 50"
Cohesion: 0.14
Nodes (21): AppraiseTestCaseMetadataEntry, getMetadataByIdentifier(), collectPrecedingTags(), extractModulePathFromFilePath(), getFeatureTags(), getScenarioIdentifierTag(), isSkippableLine(), normalizeGherkinLines() (+13 more)

### Community 51 - "Community 51"
Cohesion: 0.15
Nodes (24): buildExpectedFeatureFilePath(), buildModulePathFromTestSuite(), checkModuleExists(), checkTagExists(), checkTemplateStepExists(), checkTestCaseExists(), checkTestSuiteExists(), collectDatabaseDryRunChanges() (+16 more)

### Community 52 - "Community 52"
Cohesion: 0.18
Nodes (19): metadata, checkUniqueName(), createEnvironment(), deleteEnvironments(), getEnvironmentByIdOrThrow(), listEnvironments(), normalizeEnvironmentPayload(), basePayload (+11 more)

### Community 53 - "Community 53"
Cohesion: 0.17
Nodes (18): addValidationFeedbackThread(), affectedFilePaths(), affectedValidationIds(), approveCurrentValidationFile(), approveValidationFile(), decideValidationNode(), invalidateReviewEvidence(), invalidateValidationEvidence() (+10 more)

### Community 54 - "Community 54"
Cohesion: 0.20
Nodes (14): cleanupLingeringCompanionSessions(), delay(), getSessionAgeMs(), isMissingProcessError(), isTerminalStatus(), processExists(), safeUrlParts(), shutdownCompanionProcess() (+6 more)

### Community 55 - "Community 55"
Cohesion: 0.11
Nodes (19): ActionResult, ChangedFile, ChangedFileCard(), decisionVariant(), FeedbackScope, feedbackTargetLabel(), fileNeedsApproval(), formatState() (+11 more)

### Community 56 - "Community 56"
Cohesion: 0.13
Nodes (19): createParsedReportGraph(), createReportFeature(), createReportScenario(), createReportScenarioExecutionRows(), createReportShell(), ExecutedTestCaseSets, getLegacySuiteIds(), getReportStorageTestRun() (+11 more)

### Community 57 - "Community 57"
Cohesion: 0.19
Nodes (19): resolveStoredPath(), addDownloadArtifacts(), addLegacyLogFile(), addLegacyReportFile(), addLegacyTraceFiles(), addRunArtifactFiles(), addStoredArtifactFile(), Archive (+11 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (17): formatOrderedGherkinSteps(), GHERKIN_KEYWORDS, OrderedGherkinStep, StepFormatState, THEN_LIKE_PREFIXES, determineProjectedStepIcon(), generateProjectedGherkinSteps(), normalizeProjectedDbTestCaseSteps() (+9 more)

### Community 59 - "Community 59"
Cohesion: 0.15
Nodes (13): TemplateStepGroup, templateStepGroupFormOpts, TemplateStepGroupType, TemplateStepGroupTypeEnum, TemplateStepGroupFieldErrorsProps, TemplateStepGroupFormProps, { push, toast }, getActionErrorMessage() (+5 more)

### Community 60 - "Community 60"
Cohesion: 0.18
Nodes (10): buildJsonReportFormat(), getAutomationRunReportPath(), toProjectRelativePath(), generateReportPath(), LocalExecutorAdapter, mapBrowserEngineToName(), { mockSpawnTask, mockEnsureAutomationWorkspaceReady, mockMkdir, mockRegister, mockUnregister }, ExecutorAdapter (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (18): templateTestCaseSchema, createTemplateTestCaseAction(), deleteTemplateTestCaseAction(), getAllTemplateTestCasesAction(), getTemplateTestCaseByIdAction(), updateTemplateTestCaseAction(), createTemplateTestCase(), deleteTemplateTestCases() (+10 more)

### Community 62 - "Community 62"
Cohesion: 0.15
Nodes (13): coordinatorError(), CoordinatorErrorEnvelope, planLinks(), zodCoordinatorError(), CoordinatorProjectMismatchError, CoordinatorPlanCreatePartialError, createCoordinatorPlan(), PlanServiceOptions (+5 more)

### Community 63 - "Community 63"
Cohesion: 0.28
Nodes (16): getInlineLocatorSaveResult(), getLocatorPickerSession(), getLocatorRow(), hasDateProp(), hasDateProps(), hasNullableStringProp(), hasNullableStringProps(), hasStringProp() (+8 more)

### Community 64 - "Community 64"
Cohesion: 0.14
Nodes (9): EnvironmentFieldErrorsProps, EnvironmentFormProps, { push, toast }, environmentFieldValidators, EnvironmentFormSubmitAction, EnvironmentTableRow, getActionErrorMessage(), Environment (+1 more)

### Community 65 - "Community 65"
Cohesion: 0.17
Nodes (15): detectPackageManager(), extractScripts(), fingerprintTargetProject(), listTargetProjects(), PackageJsonShape, PackageMetadata, readPackageJson(), readPackageMetadata() (+7 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (9): DynamicParameterFieldLabel(), DynamicParameterFieldShell(), DynamicParameterFieldShellProps, DynamicParameterInputFieldProps, DynamicParameterDateField(), DynamicParameterLocatorField(), buttonVariants, Calendar() (+1 more)

### Community 67 - "Community 67"
Cohesion: 0.19
Nodes (9): Tag, tagFormOpts, getActionErrorMessage(), getCreatedTag(), tagFieldValidators, TagFormSubmitAction, TagFieldErrorsProps, TagFormProps (+1 more)

### Community 68 - "Community 68"
Cohesion: 0.20
Nodes (13): extractModulePathFromAutomationFile(), getAutomationFeaturesDir(), getAutomationLocatorMapPath(), getAutomationLocatorsDir(), toPosixPath(), EXCLUDED_DIRS, EXCLUDED_EXTENSIONS, EXCLUDED_FILENAMES (+5 more)

### Community 69 - "Community 69"
Cohesion: 0.19
Nodes (14): buildModulePathMap(), humanizeSegment(), inferGroupSuggestion(), normalizeRoute(), normalizeText(), SuggestionLocatorGroup, SuggestionModule, suggestLocatorName() (+6 more)

### Community 70 - "Community 70"
Cohesion: 0.15
Nodes (14): ReviewArtifact, canApprovePlan(), derivePlanGraph(), diffPlanTasks(), evaluateGraphReadiness(), getBlockingThreads(), getOrphanedThreads(), getThreadStatus() (+6 more)

### Community 71 - "Community 71"
Cohesion: 0.24
Nodes (8): extractLocatorGroupName(), extractModulePathFromLocatorFile(), detectAndCreateConflicts(), SavePickedLocatorOutcome, savePickedLocatorSchema, syncLocatorsFromFiles(), SyncLocatorsFromFilesResult, mergeMissingLocators()

### Community 72 - "Community 72"
Cohesion: 0.36
Nodes (12): getAutomationFeaturesDir(), buildAppraiseMetadata(), getAppraiseMetadataPath(), deleteFeatureFile(), generateFeatureContent(), generateFeatureFile(), isDirectoryEmpty(), regenerateAllFeatureFiles() (+4 more)

### Community 73 - "Community 73"
Cohesion: 0.30
Nodes (9): Toast, syncLocatorsFromFilesAction(), runLocatorFileSync(), showLocatorSyncFailureToastMock, showLocatorSyncToastMock, syncLocatorsFromFilesActionMock, LocatorSyncPayload, showLocatorSyncFailureToast() (+1 more)

### Community 74 - "Community 74"
Cohesion: 0.20
Nodes (11): AppraiseMetadataReadResult, AppraiseTestCaseMetadata, AppraiseTestCaseMetadataFlowBlock, AppraiseTestCaseMetadataNode, findIdentifierTag(), isRecord(), isString(), MetadataInputTestCase (+3 more)

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (12): containsFunctionStart(), countLineDelimiters(), DelimiterCounts, findJSDocStartLine(), findStepCallEndLine(), findStepFunctionBounds(), hasMatchingSignature(), isBalancedStepCall() (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.24
Nodes (11): useToast(), Toast(), ToastAction(), ToastActionElement, ToastClose(), ToastDescription(), ToastProps, ToastTitle() (+3 more)

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (12): findNearestJSDocStart(), findTopLevelJSDocStart(), normalizeGroupTypeStrict(), parseGroupJSDocLenient(), parseGroupJSDocStrict(), parseStepJSDocLenient(), parseStepJSDocStrict(), readGroupMetadataLine() (+4 more)

### Community 78 - "Community 78"
Cohesion: 0.24
Nodes (9): parsePayload(), CucumberJsonFeature, extractScreenshotPath(), getStepKeywordEnum(), getStepStatusEnum(), mapStepKeyword(), mapStepStatus(), parseCucumberReport() (+1 more)

### Community 79 - "Community 79"
Cohesion: 0.24
Nodes (10): TemplateTestCaseNodeData, buildFlowNodeData(), buildNodeFormData(), DiagramNodeOrder, DiagramParameter, FlowNodeData, getTemplateStepIcon(), toRuntimeParameters() (+2 more)

### Community 80 - "Community 80"
Cohesion: 0.20
Nodes (11): Action, ActionType, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState, reducer() (+3 more)

### Community 81 - "Community 81"
Cohesion: 0.23
Nodes (8): ConflictResolutionSummary, getLocatorTableRows(), isLocatorGroupRow(), isLocatorTableRow(), LocatorGroupSummary, LocatorTableRow, locatorTableCols, LocatorTable()

### Community 82 - "Community 82"
Cohesion: 0.33
Nodes (5): buildFlowBlocksFromTestCaseRows(), buildNodeOrderFromTestCaseSteps(), getEditableTestCase(), isEditableTestCase(), EditableTestCase

### Community 83 - "Community 83"
Cohesion: 0.24
Nodes (10): appendUniqueById(), appendUniqueId(), applyUpdater(), createTestCaseFormState(), CreateTestCaseFormStateInput, TestCaseFormAction, TestCaseFormErrors, testCaseFormReducer() (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.22
Nodes (7): inter, interTight, metadata, viewport, Logo(), ThemeProvider(), ThemeProviderProps

### Community 85 - "Community 85"
Cohesion: 0.25
Nodes (9): cancelProviderRunAction(), cancelProviderRunSchema, createProviderRunAction(), createProviderRunSchema, decideProviderPermissionAction(), permissionDecisionSchema, registerProviderTargetProjectAction(), registerTargetProjectSchema (+1 more)

### Community 86 - "Community 86"
Cohesion: 0.25
Nodes (8): consumeCandidate(), extractTestCaseTitleFromScenarioName(), findMatchingTestRunTestCase(), MatchableRunTestCase, ScenarioMatchInput, TagLike, identifierTag(), runTestCase()

### Community 87 - "Community 87"
Cohesion: 0.33
Nodes (8): createLocatorInspectorInjectionScript(), generateCSSPath(), generateXPath(), getLocatorInspectorOrigin(), isLocatorInspectorMessage(), isSelectedElementPayload(), LocatorInspectorMessage, SelectedElementPayload

### Community 88 - "Community 88"
Cohesion: 0.36
Nodes (9): applyExistingGroupSuggestion(), applyNewGroupSuggestion(), applyPickedLocatorToWorkspaceState(), applyPickedSelector(), applySuggestedLocatorName(), applySuggestedRoute(), canReplaceAutoValue(), canReplaceRoute() (+1 more)

### Community 90 - "Community 90"
Cohesion: 0.25
Nodes (6): ReportTestCaseWithRelations, reportViewTableCols, TestCaseLogsModal(), ReportScenarioWithDetails, ViewLogsButton(), ViewLogsButtonProps

### Community 91 - "Community 91"
Cohesion: 0.43
Nodes (7): probeProviderRegistration(), probeProviderAction(), providerKeySchema, revalidateProviderPaths(), updateProviderAction(), updateProviderSchema, providerActionErrorResponse()

### Community 92 - "Community 92"
Cohesion: 0.23
Nodes (6): savePickedLocatorFromRequest(), getLocatorPickerSessionAction(), savePickedLocatorAction(), startLocatorPickerSessionAction(), startLocatorPickerSessionSchema, LocatorPickerSessionManager

### Community 93 - "Community 93"
Cohesion: 0.43
Nodes (5): getTagTypeFromExpression(), getTagTypeFromName(), isIdentifierTagExpression(), isIdentifierTagName(), buildTagObjects()

### Community 94 - "Community 94"
Cohesion: 0.48
Nodes (6): getPlanDisplaySlug(), matchesPlanSlug(), normalizePlanSlug(), planCanonicalRoute(), PlanDisplayFields, slugifyPlanLabel()

### Community 95 - "Community 95"
Cohesion: 0.21
Nodes (11): ensureProviderRegistrations(), listProviderAdapters(), listProviderRegistrations(), metadata, SettingsPage(), applyMigration(), ensureCoordinatorPlanRuntimeTestSchema(), ensurePlanProjectionTestSchema() (+3 more)

### Community 96 - "Community 96"
Cohesion: 0.60
Nodes (5): getAutomationRunLogPath(), closeLogger(), createTestRunLogger(), ensureLogsDirectory(), getLogFilePath()

### Community 97 - "Community 97"
Cohesion: 0.40
Nodes (3): buildModuleHierarchy(), createOrFindModule(), getAllModulesWithPaths()

### Community 98 - "Community 98"
Cohesion: 0.33
Nodes (5): formatDate(), ProviderRunWorkspace(), RunCard(), { registerProviderTargetProjectAction, refresh }, targetProject

### Community 99 - "Community 99"
Cohesion: 0.40
Nodes (4): CodingAgentRegistration, SettingsCodingAgentsPanel(), providers, { refresh, probeProviderAction, updateProviderAction }

### Community 100 - "Community 100"
Cohesion: 0.60
Nodes (3): GET(), POST(), { mockAccess, mockFindUnique, mockGetProcess, mockSpawn }

### Community 110 - "Community 110"
Cohesion: 0.29
Nodes (7): getTestRunByIdAction(), getTestRunByIdOrThrow(), testRunTableCols, TestRunData, TestRunTable(), TestRunTableProps, DataTable()

### Community 111 - "Community 111"
Cohesion: 0.60
Nodes (5): createOrUpdateEnvironmentsFile(), ensureConfigDirectoryExists(), EnvironmentConfig, generateEnvironmentsContent(), getEnvironmentsFilePath()

## Knowledge Gaps
- **541 isolated node(s):** `startLocatorPickerSessionSchema`, `payload`, `InvalidSyncExecutionResult`, `metadata`, `{ push, toast }` (+536 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ServiceError` connect `Community 1` to `Community 0`, `Community 17`, `Community 21`, `Community 24`, `Community 25`, `Community 26`, `Community 27`, `Community 28`, `Community 29`, `Community 30`, `Community 32`, `Community 35`, `Community 48`, `Community 52`, `Community 53`, `Community 56`, `Community 61`, `Community 62`, `Community 65`, `Community 71`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 16` to `Community 0`, `Community 66`, `Community 34`, `Community 36`, `Community 4`, `Community 2`, `Community 7`, `Community 6`, `Community 5`, `Community 3`, `Community 11`, `Community 44`, `Community 13`, `Community 76`, `Community 47`, `Community 18`, `Community 55`, `Community 24`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `Button()` connect `Community 0` to `Community 2`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 16`, `Community 18`, `Community 24`, `Community 34`, `Community 36`, `Community 38`, `Community 47`, `Community 55`, `Community 59`, `Community 64`, `Community 66`, `Community 67`, `Community 73`, `Community 90`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **What connects `startLocatorPickerSessionSchema`, `payload`, `InvalidSyncExecutionResult` to the rest of the system?**
  _541 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05710162853019996 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06564275194613928 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05052125100240577 - nodes in this community are weakly interconnected._