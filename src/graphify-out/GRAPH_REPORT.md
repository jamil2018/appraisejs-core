# Graph Report - src  (2026-06-27)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2763 nodes · 8091 edges · 108 communities (101 shown, 7 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b8367854`
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
- [[_COMMUNITY_Community 103|Community 103]]
- [[_COMMUNITY_Community 104|Community 104]]
- [[_COMMUNITY_Community 107|Community 107]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 159 edges
2. `unknownErrorToActionResponse()` - 84 edges
3. `Button()` - 52 edges
4. `serviceErrorToActionResponse()` - 47 edges
5. `ensureAutomationWorkspaceReady()` - 43 edges
6. `PageHeader()` - 38 edges
7. `ServiceError` - 38 edges
8. `ActionResponse` - 36 edges
9. `getAllModulesAction()` - 35 edges
10. `HeaderSubtitle()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `LocatorGroups()` --calls--> `getAllLocatorGroupsAction()`  [EXTRACTED]
  app/(base)/locator-groups/page.tsx → actions/locator-groups/locator-group-actions.ts
- `ModifyLocator()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/locator-groups/modify/[id]/page.tsx → actions/modules/module-actions.ts
- `CreateLocatorGroup()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/locator-groups/create/page.tsx → actions/modules/module-actions.ts
- `CreateTestCase()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/test-cases/create/page.tsx → actions/modules/module-actions.ts
- `ModifyTemplateTestCase()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/template-test-cases/modify/[id]/page.tsx → actions/modules/module-actions.ts

## Import Cycles
- 1-file cycle: `components/diagram/node-form.tsx -> components/diagram/node-form.tsx`

## Communities (108 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (55): metadata, getPageTransitionVariant(), PageTransitionVariant, Template(), { usePathnameMock }, TestRunDetailPage(), TestRunDetailPageProps, MotionDivProps (+47 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (58): parsePayload(), buildRecalculatedMetricUpdateData(), CompletedTestRunTestCase, countConsecutiveFailures(), findMostRecentOlderTestRunTestCases(), findOlderResultDate(), findRecentCompletedTestRunTestCases(), getCompletedAt() (+50 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (45): metadata, browserEngineToBadge(), testRunResultToBadge(), testRunStatusToBadge(), ViewReport(), FeatureChartProps, OverviewChartProps, DurationChart (+37 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (53): coordinatorContractVersion, coordinatorError(), CoordinatorErrorEnvelope, planLinks(), zodCoordinatorError(), CoordinatorProjectDetails, CoordinatorProjectIdentityError, deriveCoordinatorProjectIdentity() (+45 more)

### Community 4 - "Community 4"
Cohesion: 0.10
Nodes (38): createCoordinatorPlan(), canApprovePlan(), canRequestPlanChanges(), derivePlanGraph(), diffPlanTasks(), evaluateGraphReadiness(), getBlockingThreads(), getOrphanedThreads() (+30 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (48): testRunSchema, checkLocatorGroupNameUniqueAction(), unknownErrorToActionResponse(), formatLogsForStorage(), LogEntry, parseLogsFromStorage(), cancelTestRunAction(), checkTestRunNameUniqueAction() (+40 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (39): startCoordinatorPlan(), assertPlanNotCancelled(), addValidationFeedbackThread(), affectedFilePaths(), affectedValidationIds(), approveValidationFile(), decideValidationNode(), invalidateReviewEvidence() (+31 more)

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (38): acceptBaselineAction(), acknowledgeBaselineFailureAction(), addPlanRemarkAction(), approvePlanRevisionAction(), cancelBaselineExecutionAction(), idSchema, justifyBaselineRegressionPassAction(), positionsSchema (+30 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (29): inter, interTight, metadata, viewport, Logo(), ActionResponseData, EntitySearchCommand(), EntitySearchCommandProps (+21 more)

### Community 9 - "Community 9"
Cohesion: 0.09
Nodes (33): DynamicFormFieldsRef, buildFormResetKey(), NodeFormFieldsContent(), NodeFormFieldsContentProps, NodeFormFieldsProps, buildNodeFormSubmitValue(), createInitialParametersForTemplateStep(), getGherkinPreview() (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.07
Nodes (33): assertNoYamlReferences(), assertSize(), canonicalize(), mapSchemaError(), parseJsonArtifact(), serializeJsonArtifact(), validateArtifact(), plan (+25 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (26): DynamicParameterLocatorExistingSection(), DynamicParameterLocatorField(), getLocatorPlaceholder(), LocatorFieldSectionProps, getLocatorsForGroup(), FlowDiagramBlockDialog(), FlowDiagramBlockDialogProps, ReportScenarioWithDetails (+18 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (23): metadata, metadata, metadata, metadata, metadata, metadata, metadata, metadata (+15 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (15): generateReportPath(), LocalExecutorAdapter, mapBrowserEngineToName(), ExecutorAdapter, TestRunExecutionRequest, TestRunExecutionResult, globalForTaskSpawner, killTask() (+7 more)

### Community 14 - "Community 14"
Cohesion: 0.06
Nodes (39): buildFilesystemSnapshot(), buildModuleTreePaths(), CollapsedTestCaseFromFs, EnvironmentConfig, EnvironmentData, extractFunctionDefinition(), extractLocatorGroupName(), extractParametersFromGherkinStep() (+31 more)

### Community 15 - "Community 15"
Cohesion: 0.09
Nodes (31): BaseNode(), AddNodePromptNodeComponentProps, useToast(), EmptyTube(), TubePlus(), cn(), CommandBadge(), CommandBadgeProps (+23 more)

### Community 16 - "Community 16"
Cohesion: 0.13
Nodes (20): { push, refresh, toast, startLocatorPickerSessionAction, savePickedLocatorAction }, LocatorGroup, locatorGroupFormOpts, locatorGroupSchema, templateStepFormOpts, ParamChip(), LogViewer(), LogViewerProps (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (36): testCaseDataColumns, testCasePickerColumns, testCaseSelectionColumn, applyUpdater(), createInitialPickerState(), defaultPagination, createSelectionState(), getSavedTestCases() (+28 more)

### Community 18 - "Community 18"
Cohesion: 0.05
Nodes (28): TestScenarioPreview(), InlineTagCreationDialog(), InlineTestSuiteCreationDialog(), DetailsStepProps, detailsStepSchema, EMPTY_FLOW_BLOCKS, FlowPanel(), FlowPanelProps (+20 more)

### Community 19 - "Community 19"
Cohesion: 0.05
Nodes (37): EnvironmentFieldErrorsProps, EnvironmentFormProps, { push, toast }, environmentFormOpts, Tag, tagFormOpts, getTanStackFormAction(), TanStackFormSubmitHandler (+29 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (32): TestSuite, testSuiteFormOpts, getEditableTestSuite(), isEditableTestSuite(), TestSuites(), getActionErrorMessage(), getFieldErrorMessage(), getModuleOptions() (+24 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (24): ArtifactKind, artifactLocation, assertPlanId(), hashContent(), pathExists(), PlanArtifactRepository, PlanArtifactRepositoryOptions, PlanRepositoryError (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.16
Nodes (33): metadata, metadata, metadata, CreateTestCaseFromTemplate(), metadata, {
  getAllTemplateTestCasesAction,
  getAllTemplateStepParamsAction,
  getAllTemplateStepsAction,
  getAllTestSuitesAction,
  getAllLocatorsAction,
  getAllLocatorGroupsAction,
  getAllTagsAction,
  getAllTestCasesAction,
  getAllModulesAction,
  getAllEnvironmentsAction,
  createTestCaseAction,
  createTestSuiteAction,
  createTagAction,
  testCaseFormSpy,
}, CreateLocatorPage(), CreateTestCase() (+25 more)

### Community 23 - "Community 23"
Cohesion: 0.10
Nodes (28): CreateTestRun(), TestRun, testRunFormOpts, CreateTestRunPageData, loadCreateTestRunPageData(), getActionErrorMessage(), getEnvironmentRows(), getTagRows() (+20 more)

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (22): metadata, AppDrawerItem, AppDrawerItemColor, DataCard(), DataCardGrid(), colorMap, ExecutionHealthPanel(), ExecutionHealthPanelProps (+14 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (34): assessBaselineAcceptance(), BaselineClassification, BaselineCombination, baselineCombinationBlockers(), baselineCombinationKey(), BaselineEvidence, classifyBaselineResult(), CucumberStep (+26 more)

### Community 26 - "Community 26"
Cohesion: 0.14
Nodes (35): applyBlockingFeedback(), approveImplementationCompletion(), assertBaselineAccepted(), assertImplementationLifecycle(), completionEvidenceHash(), controlImplementation(), implementationContext(), Options (+27 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (29): metadata, TemplateStep, ModifyTemplateStepPage(), buildFunctionDefinitionPreview(), getActionErrorMessage(), getFieldErrorMessage(), getInitialFunctionDefinition(), getTemplateStepFormDefaults() (+21 more)

### Community 28 - "Community 28"
Cohesion: 0.11
Nodes (23): ActionResponse, testCaseSchema, flowBlockSchema, testCaseStepSchema, testCaseStepsSchema, generateUniqueTestCaseIdentifier(), createLocatorGroupAction(), updateLocatorGroupAction() (+15 more)

### Community 29 - "Community 29"
Cohesion: 0.10
Nodes (24): resolveStoredPath(), addDownloadArtifacts(), addLegacyLogFile(), addLegacyReportFile(), addLegacyTraceFiles(), addRunArtifactFiles(), addStoredArtifactFile(), Archive (+16 more)

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (31): CreateLocatorWorkspace(), applyExistingGroupSuggestion(), applyNewGroupSuggestion(), applyPickedLocatorToWorkspaceState(), applyPickedSelector(), applySuggestedLocatorName(), applySuggestedRoute(), canLaunchPicker() (+23 more)

### Community 31 - "Community 31"
Cohesion: 0.16
Nodes (16): ensureAutomationWorkspaceReady(), AutomationProjectionService, getTemplateStepGroupType(), TemplateStepGroupType, cleanupEmptyDirectories(), createEmptyLocatorGroupFile(), createOrUpdateLocatorGroupFile(), deleteLocatorGroupFile() (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (27): buildJsonReportFormat(), getAutomationActionStepsDir(), getAutomationConfigDir(), getAutomationEnvironmentsDir(), getAutomationLocatorsDir(), getAutomationMappingDir(), getAutomationReportLogsDir(), getAutomationReportRunDir() (+19 more)

### Community 33 - "Community 33"
Cohesion: 0.17
Nodes (22): ADD_NODE_PROMPT_NODE_TYPE, AddNodePromptNodeData, createAddNodePromptNode(), isAddNodePromptNode(), isEdgeWithinSameFlowBlock(), createOnConnectHandler(), filterBlockedEdgeChanges(), filterBlockedNodeChanges() (+14 more)

### Community 34 - "Community 34"
Cohesion: 0.13
Nodes (28): addMissingScenariosToTestSuite(), addScenarioToTestSuite(), applyScenarioMetadataToSteps(), connectTagsToTestSuite(), createOrUpdateTestCaseStep(), createScenarioSteps(), createScenarioTestCase(), createTestSuiteWithScenarios() (+20 more)

### Community 35 - "Community 35"
Cohesion: 0.12
Nodes (22): buildStepKeywords(), getStepSearchScore(), normalizeForSearch(), scoreMatch(), TemplateStepCombobox(), TemplateStepComboboxProps, Command(), CommandEmpty() (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.15
Nodes (21): metadata, metadata, metadata, CreateLocatorGroup(), CreateModule(), CreateTestSuite(), ModifyTestSuite(), listModules() (+13 more)

### Community 37 - "Community 37"
Cohesion: 0.11
Nodes (18): InlineLocatorSaveResult, LocatorWorkspaceEnvironment, DynamicParameterValue, LocatorGroupOption, LocatorOption, LocatorSelectionMode, DynamicParameterInputField(), DynamicFieldState (+10 more)

### Community 38 - "Community 38"
Cohesion: 0.13
Nodes (21): NodeData, NodeOrderMap, TemplateTestCaseNodeData, TemplateTestCaseNodeOrderMap, DiagramNodeOrder, DiagramNodeParameter, toNodeOrderMap(), toTemplateTestCaseNodeOrderMap() (+13 more)

### Community 39 - "Community 39"
Cohesion: 0.16
Nodes (22): payload, templateTestCaseSchema, createModule(), deleteModules(), getModuleByIdOrThrow(), moduleInclude, updateModule(), createModuleAction() (+14 more)

### Community 40 - "Community 40"
Cohesion: 0.12
Nodes (21): EmptyState(), getEnvironmentTableRows(), EnvironmentTable(), Environments(), metadata, ModifyEnvironment(), getAllTemplateTestCasesAction(), metadata (+13 more)

### Community 41 - "Community 41"
Cohesion: 0.09
Nodes (16): AddNodePromptFlowNode, AddNodePromptNode, ButtonEdge(), DEFAULT_EDGE_STYLE, FlowEdgeMutationGuard, flowEdgeMutationGuardRef, flowDiagramHandlersRef, flowEdgeTypes (+8 more)

### Community 42 - "Community 42"
Cohesion: 0.10
Nodes (18): FlowDiagramBlockOverlays(), FlowDiagram(), FlowLayoutRefreshProps, FlowDiagramGroupingHints(), FlowDiagramGroupingHintsProps, layoutRefreshDelays, requiredProps, xyflowMocks (+10 more)

### Community 43 - "Community 43"
Cohesion: 0.11
Nodes (19): StepIcon(), EMPTY_FLOW_BLOCKS, TemplateTestCaseForm(), TemplateTestCaseFormProps, { push, toast }, buildScenarioPreview(), buildScenarioSteps(), getActionErrorMessage() (+11 more)

### Community 44 - "Community 44"
Cohesion: 0.14
Nodes (25): buildExpectedFeatureFilePath(), buildModulePathFromTestSuite(), checkModuleExists(), checkTagExists(), checkTemplateStepExists(), checkTestCaseExists(), checkTestSuiteExists(), collectDatabaseDryRunChanges() (+17 more)

### Community 45 - "Community 45"
Cohesion: 0.20
Nodes (13): formatDateTime(), locatorGroupTableCols, moduleTableCols, tagTableCols, templateTestCaseTableCols, testCasesMetricTableCols, Checkbox(), CheckboxProps (+5 more)

### Community 46 - "Community 46"
Cohesion: 0.17
Nodes (16): getConvertedTemplateTestCaseData(), getFieldErrorMessage(), getTemplateSelectionOptions(), getTemplateSelectionRows(), getTemplateTestCasesWithSteps(), getTemplateTestCaseWithSteps(), isNamedRow(), isTemplateTestCaseWithSteps() (+8 more)

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (16): metadata, Module, moduleFormOpts, moduleSchema, ModifyModule(), ModuleWithParent, getActionErrorMessage(), moduleFieldValidators (+8 more)

### Community 48 - "Community 48"
Cohesion: 0.16
Nodes (12): metadata, getAllTestCasesAction(), buildFlowBlocksFromTestCaseRows(), buildNodeOrderFromTestCaseSteps(), getEditableTestCase(), isEditableTestCase(), EditableTestCase, TestCases() (+4 more)

### Community 49 - "Community 49"
Cohesion: 0.13
Nodes (20): savePickedLocatorFromRequest(), getLocatorPickerSessionAction(), savePickedLocatorAction(), startLocatorPickerSessionAction(), startLocatorPickerSessionSchema, buildModulePathMap(), humanizeSegment(), inferGroupSuggestion() (+12 more)

### Community 50 - "Community 50"
Cohesion: 0.17
Nodes (19): InvalidSyncExecutionResult, runSyncAction(), executeSyncScript(), normalizeOutputLines(), parseSyncFailureCause(), runRequestedSync(), sanitizeCause(), ScriptExecutionOutput (+11 more)

### Community 51 - "Community 51"
Cohesion: 0.17
Nodes (21): ensureStepsDirectory(), formatFileContent(), generateStepDefinition(), generateStepJSDoc(), getFilePath(), getSubdirectoryName(), sanitizeFileName(), stripLeadingJSDoc() (+13 more)

### Community 52 - "Community 52"
Cohesion: 0.23
Nodes (20): ModifyLocator(), getEnvironmentRows(), getInlineLocatorSaveResult(), getLocatorGroupRows(), getLocatorPickerSession(), getLocatorRow(), getModuleRows(), hasDateProp() (+12 more)

### Community 53 - "Community 53"
Cohesion: 0.17
Nodes (17): metadata, templateStepGroupSchema, TemplateStepGroupType, TemplateStepGroupTypeEnum, ModifyTemplateStepGroup(), createTemplateStepGroupAction(), deleteTemplateStepGroupAction(), getTemplateStepGroupByIdAction() (+9 more)

### Community 54 - "Community 54"
Cohesion: 0.29
Nodes (11): Dashboard(), getDashboardMetricsAction(), getEntityMetricsAction(), getRunningTestRunsCountAction(), getTestSuiteExecutionDataAction(), getDashboardMetrics(), getEntityMetrics(), getRunningTestRunsCount() (+3 more)

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (19): AppraiseTestCaseMetadataEntry, getMetadataByIdentifier(), readAppraiseMetadataFile(), collectPrecedingTags(), getFeatureTags(), getScenarioIdentifierTag(), isSkippableLine(), normalizeGherkinLines() (+11 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (14): deleteLocatorAction(), getLocatorByIdAction(), syncLocatorsFromFilesAction(), extractLocatorGroupName(), extractModulePathFromLocatorFile(), deleteLocators(), detectAndCreateConflicts(), getLocatorByIdOrThrow() (+6 more)

### Community 57 - "Community 57"
Cohesion: 0.16
Nodes (14): cleanupLingeringCompanionSessions(), delay(), getSessionAgeMs(), isMissingProcessError(), isTerminalStatus(), LocatorPickerSessionManager, processExists(), safeUrlParts() (+6 more)

### Community 58 - "Community 58"
Cohesion: 0.10
Nodes (16): approvedStates, baselineStates, filterPredicates, filters, getCardAccentClass(), getLifecycleBadgeClass(), getLifecycleLabel(), lifecycleBadgeClasses (+8 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (18): formatExecutionOrder(), formatExecutionSummary(), formatFailureSummary(), getSyncTooltipCopy(), syncPanelInfo, syncPresentation, SyncRunResult, SyncTileColor (+10 more)

### Community 60 - "Community 60"
Cohesion: 0.20
Nodes (16): tagSchema, checkUniqueTagExpression(), checkUniqueTagName(), createTag(), deleteTags(), getTagByIdOrThrow(), listFilterTags(), basePayload (+8 more)

### Community 61 - "Community 61"
Cohesion: 0.16
Nodes (16): applyUpdater(), applyChildCheckboxSelection(), applySuiteCheckboxSelection(), buildNormalizedSelectionsFromDraft(), createDraftSelections(), DraftSelectionMap, normalizeSuiteSelection(), suiteMatchesQuery() (+8 more)

### Community 62 - "Community 62"
Cohesion: 0.21
Nodes (15): templateStepSchema, createTemplateStepAction(), deleteTemplateStepAction(), getTemplateStepByIdAction(), updateTemplateStepAction(), createTemplateStep(), deleteTemplateSteps(), getTemplateStepByIdOrThrow() (+7 more)

### Community 63 - "Community 63"
Cohesion: 0.16
Nodes (21): ensureProjectDatabaseUrl(), globalForPrisma, normalizeDatabaseUrl(), { PrismaClient }, PrismaClientInstance, readProjectDatabaseUrl(), require, testSuiteSchema (+13 more)

### Community 64 - "Community 64"
Cohesion: 0.13
Nodes (14): formatOrderedGherkinSteps(), GHERKIN_KEYWORDS, OrderedGherkinStep, StepFormatState, THEN_LIKE_PREFIXES, determineProjectedStepIcon(), generateProjectedGherkinSteps(), normalizeProjectedDbTestCaseSteps() (+6 more)

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (17): metadata, SettingsPage(), getTestSuiteSyncIdentity(), countEnvironmentMismatches(), countLocatorGroupMismatches(), countLocatorMismatches(), countModuleMismatches(), countTagMismatches() (+9 more)

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (12): TemplateStepGroup, templateStepGroupFormOpts, TemplateStepGroupFieldErrorsProps, TemplateStepGroupForm(), TemplateStepGroupFormProps, { push, toast }, getActionErrorMessage(), templateStepGroupFieldValidators (+4 more)

### Community 67 - "Community 67"
Cohesion: 0.26
Nodes (10): dispatchTestRunExit(), createLogMessage(), parseLogMessages(), fatalErrorPatterns, getConnectionStatusText(), isFatalLogStreamError(), isTerminalRunStatus(), ConnectionStatus (+2 more)

### Community 68 - "Community 68"
Cohesion: 0.29
Nodes (13): checkUniqueName(), createEnvironment(), deleteEnvironments(), getEnvironmentByIdOrThrow(), listEnvironments(), normalizeEnvironmentPayload(), basePayload, updateEnvironment() (+5 more)

### Community 69 - "Community 69"
Cohesion: 0.23
Nodes (11): getFilterTags(), TagShape, TestSuitePickerSuiteRowHeader(), TestSuitePickerSuiteRowHeaderProps, TestSuitePickerSuiteRowProps, TestSuitePickerTestCaseList(), TestSuitePickerTestCaseListProps, TestSuitePickerTestCaseRow() (+3 more)

### Community 70 - "Community 70"
Cohesion: 0.20
Nodes (13): extractModulePathFromAutomationFile(), getAutomationFeaturesDir(), getAutomationLocatorMapPath(), getAutomationLocatorsDir(), toPosixPath(), EXCLUDED_DIRS, EXCLUDED_EXTENSIONS, EXCLUDED_FILENAMES (+5 more)

### Community 71 - "Community 71"
Cohesion: 0.33
Nodes (12): getAutomationFeaturesDir(), buildAppraiseMetadata(), getAppraiseMetadataPath(), deleteFeatureFile(), generateFeatureContent(), generateFeatureFile(), isDirectoryEmpty(), regenerateAllFeatureFiles() (+4 more)

### Community 72 - "Community 72"
Cohesion: 0.17
Nodes (8): DynamicParameterFieldLabel(), DynamicParameterFieldShell(), DynamicParameterFieldShellProps, DynamicParameterInputFieldProps, DynamicParameterDateField(), buttonVariants, Calendar(), CalendarDayButton()

### Community 73 - "Community 73"
Cohesion: 0.21
Nodes (10): ConflictResolutionSummary, getLocatorTableRows(), isLocatorGroupRow(), isLocatorTableRow(), LocatorGroupSummary, LocatorTableRow, locatorTableCols, LocatorTable() (+2 more)

### Community 74 - "Community 74"
Cohesion: 0.21
Nodes (10): { toast }, DataTableViewOptions(), DataTableViewOptionsProps, DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuItemProps, DropdownMenuLabel() (+2 more)

### Community 75 - "Community 75"
Cohesion: 0.25
Nodes (12): containsFunctionStart(), countLineDelimiters(), DelimiterCounts, findJSDocStartLine(), findStepCallEndLine(), findStepFunctionBounds(), hasMatchingSignature(), isBalancedStepCall() (+4 more)

### Community 76 - "Community 76"
Cohesion: 0.24
Nodes (7): FlowDiagramNodeSearch(), FlowDiagramNodeSearchProps, FlowNodeSearchResult, FlowDiagramToolbarProps, Kbd(), KbdGroup(), TooltipContent()

### Community 77 - "Community 77"
Cohesion: 0.29
Nodes (12): findNearestJSDocStart(), findTopLevelJSDocStart(), normalizeGroupTypeStrict(), parseGroupJSDocLenient(), parseGroupJSDocStrict(), parseStepJSDocLenient(), parseStepJSDocStrict(), readGroupMetadataLine() (+4 more)

### Community 78 - "Community 78"
Cohesion: 0.24
Nodes (10): getAllTestCaseMetricsForFilter(), getReportByIdOrThrow(), listReports(), getAllReportsAction(), getAllTestCaseMetricsAction(), getAllTestSuiteMetricsAction(), getReportByIdAction(), TestCasesMetricTable() (+2 more)

### Community 79 - "Community 79"
Cohesion: 0.24
Nodes (8): metadata, ModifyLocator(), listLocatorGroups(), deleteLocatorGroupAction(), getLocatorGroupByIdAction(), LocatorGroupTable(), LocatorGroups(), metadata

### Community 80 - "Community 80"
Cohesion: 0.33
Nodes (5): ButtonSkeleton(), IconButtonSkeleton(), TextInputSkeleton(), Skeleton(), TableSkeleton()

### Community 81 - "Community 81"
Cohesion: 0.21
Nodes (10): AppraiseMetadataReadResult, AppraiseTestCaseMetadata, AppraiseTestCaseMetadataFlowBlock, AppraiseTestCaseMetadataNode, findIdentifierTag(), isRecord(), isString(), MetadataInputTestCase (+2 more)

### Community 82 - "Community 82"
Cohesion: 0.32
Nodes (7): runLocatorFileSync(), showLocatorSyncFailureToastMock, showLocatorSyncToastMock, syncLocatorsFromFilesActionMock, LocatorSyncPayload, showLocatorSyncFailureToast(), showLocatorSyncToast()

### Community 83 - "Community 83"
Cohesion: 0.24
Nodes (10): appendUniqueById(), appendUniqueId(), applyUpdater(), createTestCaseFormState(), CreateTestCaseFormStateInput, TestCaseFormAction, TestCaseFormErrors, testCaseFormReducer() (+2 more)

### Community 84 - "Community 84"
Cohesion: 0.27
Nodes (8): FlowBlock, FlowBlockBounds, getFlowBlockBounds(), getFlowBlockMembershipMap(), hasOrphanedFlowNode(), normalizeFlowBlocks(), FlowDiagramBlockOverlaysProps, UseFlowDiagramBlockGroupingOptions

### Community 85 - "Community 85"
Cohesion: 0.27
Nodes (9): buildFlowNodeData(), buildNodeFormData(), DiagramNodeOrder, DiagramParameter, FlowNodeData, getTemplateStepIcon(), toRuntimeParameters(), checkMissingMandatoryParams() (+1 more)

### Community 86 - "Community 86"
Cohesion: 0.33
Nodes (8): isEnvironmentRow(), isLocatorGroupRow(), isLocatorRow(), isModuleRow(), isNamedRow(), isTagRow(), isTestSuiteRow(), isTemplateStepRow()

### Community 87 - "Community 87"
Cohesion: 0.24
Nodes (8): BrowserEngineIcon, testRunTableCols, TestRunData, TestRunTable(), TestRunTableProps, Badge(), BadgeProps, badgeVariants

### Community 88 - "Community 88"
Cohesion: 0.33
Nodes (8): createLocatorInspectorInjectionScript(), generateCSSPath(), generateXPath(), getLocatorInspectorOrigin(), isLocatorInspectorMessage(), isSelectedElementPayload(), LocatorInspectorMessage, SelectedElementPayload

### Community 89 - "Community 89"
Cohesion: 0.38
Nodes (8): checkLocatorGroupNameUnique(), checkUniqueName(), createLocatorGroup(), deleteLocatorGroups(), getLocatorGroupByIdOrThrow(), locatorGroupInclude, LocatorGroupWithModule, updateLocatorGroup()

### Community 90 - "Community 90"
Cohesion: 0.42
Nodes (7): CreateTemplateStep(), getAllTemplateStepGroupsAction(), metadata, TemplateStepGroups(), getTemplateStepGroupRows(), templateStepGroupTableCols, TemplateStepGroupTable()

### Community 91 - "Community 91"
Cohesion: 0.25
Nodes (6): environmentFieldValidators, EnvironmentFormSubmitAction, EnvironmentTableRow, getActionErrorMessage(), environmentTableCols, Environment

### Community 93 - "Community 93"
Cohesion: 0.43
Nodes (5): getTagTypeFromExpression(), getTagTypeFromName(), isIdentifierTagExpression(), isIdentifierTagName(), buildTagObjects()

### Community 94 - "Community 94"
Cohesion: 0.48
Nodes (5): metadata, TemplateSteps(), getTemplateStepRows(), templateStepTableCols, TemplateStepTable()

### Community 95 - "Community 95"
Cohesion: 0.29
Nodes (4): fadeSlideTransition, scaleFadeTransition, ViewReportButton(), ViewReportButtonProps

### Community 96 - "Community 96"
Cohesion: 0.60
Nodes (5): createOrUpdateEnvironmentsFile(), ensureConfigDirectoryExists(), EnvironmentConfig, generateEnvironmentsContent(), getEnvironmentsFilePath()

### Community 97 - "Community 97"
Cohesion: 0.40
Nodes (3): buildModuleHierarchy(), createOrFindModule(), getAllModulesWithPaths()

### Community 107 - "Community 107"
Cohesion: 0.16
Nodes (10): readValidation(), readValidation(), CoordinatorPlanCreatePartialError, PlanServiceOptions, readCoordinatorPlan(), reviseCoordinatorPlan(), parseYamlArtifact(), listPlans() (+2 more)

## Knowledge Gaps
- **488 isolated node(s):** `startLocatorPickerSessionSchema`, `idSchema`, `targetSchema`, `positionsSchema`, `payload` (+483 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 15` to `Community 0`, `Community 2`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 12`, `Community 16`, `Community 17`, `Community 18`, `Community 24`, `Community 35`, `Community 40`, `Community 41`, `Community 45`, `Community 58`, `Community 61`, `Community 69`, `Community 72`, `Community 74`, `Community 76`, `Community 80`, `Community 87`?**
  _High betweenness centrality (0.077) - this node is a cross-community bridge._
- **Why does `Button()` connect `Community 24` to `Community 0`, `Community 2`, `Community 7`, `Community 8`, `Community 9`, `Community 11`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 23`, `Community 35`, `Community 40`, `Community 41`, `Community 42`, `Community 43`, `Community 45`, `Community 58`, `Community 66`, `Community 72`, `Community 74`, `Community 76`, `Community 82`, `Community 84`, `Community 95`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `ServiceError` connect `Community 28` to `Community 1`, `Community 3`, `Community 4`, `Community 5`, `Community 6`, `Community 7`, `Community 25`, `Community 26`, `Community 36`, `Community 39`, `Community 53`, `Community 56`, `Community 60`, `Community 62`, `Community 63`, `Community 68`, `Community 78`, `Community 79`, `Community 89`, `Community 107`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `startLocatorPickerSessionSchema`, `idSchema`, `targetSchema` to the rest of the system?**
  _488 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05760905760905761 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05030181086519115 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.053830227743271224 - nodes in this community are weakly interconnected._