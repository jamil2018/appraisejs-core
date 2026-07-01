# Graph Report - src  (2026-07-02)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2979 nodes · 8228 edges · 111 communities (105 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 60 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bafd1f4f`
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
- [[_COMMUNITY_Community 107|Community 107]]
- [[_COMMUNITY_Community 108|Community 108]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 158 edges
2. `unknownErrorToActionResponse()` - 84 edges
3. `Button()` - 57 edges
4. `serviceErrorToActionResponse()` - 47 edges
5. `ServiceError` - 43 edges
6. `ensureAutomationWorkspaceReady()` - 42 edges
7. `ActionResponse` - 39 edges
8. `PageHeader()` - 37 edges
9. `getAllModulesAction()` - 35 edges
10. `HeaderSubtitle()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `CreateLocatorGroup()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/locator-groups/create/page.tsx → actions/modules/module-actions.ts
- `ModifyTemplateStepGroup()` --calls--> `getTemplateStepGroupByIdAction()`  [INFERRED]
  app/(base)/template-step-groups/modify/[id]/page.tsx → actions/template-step-group/template-step-group-actions.ts
- `LocatorGroups()` --calls--> `getAllLocatorGroupsAction()`  [EXTRACTED]
  app/(base)/locator-groups/page.tsx → actions/locator-groups/locator-group-actions.ts
- `ModifyLocator()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/locator-groups/modify/[id]/page.tsx → actions/modules/module-actions.ts
- `ModifyTestSuite()` --calls--> `getAllModulesAction()`  [INFERRED]
  app/(base)/test-suites/modify/[id]/page.tsx → actions/modules/module-actions.ts

## Import Cycles
- 1-file cycle: `components/diagram/node-form.tsx -> components/diagram/node-form.tsx`

## Communities (111 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (53): payload, metadata, ModifyLocator(), ActionResponse, moduleSchema, testCaseSchema, generateUniqueTestCaseIdentifier(), listLocatorGroups() (+45 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (52): metadata, metadata, metadata, metadata, ModifyLocator(), metadata, metadata, metadata (+44 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (60): metadata, getPageTransitionVariant(), PageTransitionVariant, Template(), { usePathnameMock }, TestRunDetailPage(), TestRunDetailPageProps, MotionDivProps (+52 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (46): formatOrderedGherkinSteps(), GHERKIN_KEYWORDS, OrderedGherkinStep, StepFormatState, THEN_LIKE_PREFIXES, EMPTY_FLOW_BLOCKS, TemplateTestCaseFormProps, { push, toast } (+38 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (48): InlineLocatorSaveResult, DynamicParameterValue, LocatorGroupOption, LocatorOption, LocatorSelectionMode, DynamicParameterInputField(), DynamicFieldState, DynamicFormFieldsProps (+40 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (51): metadata, metadata, metadata, metadata, getTemplateTestCasesWithSteps(), CreateTestCaseFromTemplate(), metadata, {
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
} (+43 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (45): metadata, browserEngineToBadge(), testRunResultToBadge(), testRunStatusToBadge(), ViewReport(), FeatureChartProps, OverviewChartProps, DurationChart (+37 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (39): ActionResponseData, TestSuite, ConflictResolutionSummary, isLocatorGroupRow(), isLocatorTableRow(), LocatorGroupSummary, LocatorTableRow, EntitySearchCommand() (+31 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (51): getTestSuiteSyncIdentity(), buildFilesystemSnapshot(), buildModuleTreePaths(), CollapsedTestCaseFromFs, countEnvironmentMismatches(), countLocatorGroupMismatches(), countLocatorMismatches(), countModuleMismatches() (+43 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (39): coordinatorContractVersion, coordinatorError(), CoordinatorErrorEnvelope, planLinks(), zodCoordinatorError(), CoordinatorProjectMismatchError, CoordinatorPlanCreatePartialError, createCoordinatorPlan() (+31 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (28): { push, refresh, toast, startLocatorPickerSessionAction, savePickedLocatorAction }, DynamicParameterFieldLabel(), DynamicParameterFieldShell(), DynamicParameterFieldShellProps, DynamicParameterInputFieldProps, DynamicParameterLocatorExistingSection(), DynamicParameterLocatorField(), getLocatorPlaceholder() (+20 more)

### Community 11 - "Community 11"
Cohesion: 0.11
Nodes (31): Dashboard(), metadata, AppDrawerItem, DataCard(), DataCardGrid(), colorMap, ExecutionHealthPanel(), ExecutionHealthPanelProps (+23 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (38): AppDrawerItemColor, formatExecutionOrder(), formatExecutionSummary(), formatFailureSummary(), getSyncTooltipCopy(), syncPanelInfo, syncPresentation, SyncRunResult (+30 more)

### Community 13 - "Community 13"
Cohesion: 0.07
Nodes (36): DynamicParameterDateField(), TemplateStepCombobox(), useToast(), EmptyTube(), TubePlus(), cn(), CommandBadge(), CommandBadgeProps (+28 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (37): parsePayload(), createParsedReportGraph(), createReportFeature(), createReportScenario(), createReportScenarioExecutionRows(), createReportShell(), ExecutedTestCaseSets, getAllTestCaseMetricsForFilter() (+29 more)

### Community 15 - "Community 15"
Cohesion: 0.15
Nodes (20): environmentTableCols, formatDateTime(), locatorGroupTableCols, moduleTableCols, getStatusStyle(), PlanFlowTaskNode, statusStyles, ReportTestCaseWithRelations (+12 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (34): assertNoYamlReferences(), assertSize(), canonicalize(), mapSchemaError(), parseJsonArtifact(), parseYamlArtifact(), serializeJsonArtifact(), serializeYamlArtifact() (+26 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (28): capitalizeGroupName(), buildStepKeywords(), getStepSearchScore(), normalizeForSearch(), scoreMatch(), StepIcon(), TemplateStepComboboxProps, TemplateStepParameterSummary (+20 more)

### Community 18 - "Community 18"
Cohesion: 0.13
Nodes (35): applyBlockingFeedback(), approveImplementationCompletion(), assertBaselineAccepted(), assertImplementationLifecycle(), completionEvidenceHash(), controlImplementation(), implementationContext(), Options (+27 more)

### Community 19 - "Community 19"
Cohesion: 0.12
Nodes (33): assessBaselineAcceptance(), BaselineClassification, BaselineCombination, baselineCombinationBlockers(), baselineCombinationKey(), BaselineEvidence, classifyBaselineResult(), CucumberStep (+25 more)

### Community 20 - "Community 20"
Cohesion: 0.10
Nodes (22): FlowDiagramBlockDialog(), FlowDiagramBlockDialogProps, ReportScenarioWithDetails, TestCaseLogsModal(), TestCaseLogsModalProps, ReportScenarioWithDetails, ViewLogsButton(), ViewLogsButtonProps (+14 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (27): getFilterTags(), TagShape, applyUpdater(), applyChildCheckboxSelection(), applySuiteCheckboxSelection(), buildNormalizedSelectionsFromDraft(), createDraftSelections(), DraftSelectionMap (+19 more)

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (32): acceptBaselineAction(), acknowledgeBaselineFailureAction(), addPlanRemarkAction(), approvePlanRevisionAction(), approveValidationFileAction(), cancelBaselineExecutionAction(), decideValidationNodeAction(), fileTargetSchema (+24 more)

### Community 23 - "Community 23"
Cohesion: 0.08
Nodes (11): globalForTaskSpawner, killTask(), removeTask(), SpawnedProcess, SpawnerOptions, TaskSpawner, waitForTask(), ProcessManager (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.16
Nodes (16): ensureAutomationWorkspaceReady(), AutomationProjectionService, getTemplateStepGroupType(), TemplateStepGroupType, cleanupEmptyDirectories(), createEmptyLocatorGroupFile(), createOrUpdateLocatorGroupFile(), deleteLocatorGroupFile() (+8 more)

### Community 25 - "Community 25"
Cohesion: 0.10
Nodes (26): CoordinatorProjectDetails, CoordinatorProjectIdentityError, deriveCoordinatorProjectIdentity(), assertLoopbackUrl(), guardCoordinatorRequest(), LOOPBACK_HOSTS, readCoordinatorJson(), { authenticateProject, ensureProjectIdentity } (+18 more)

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (30): appendProviderEvent(), appendProviderEvents(), cancelProviderWorkflowRun(), createProviderWorkflowRun(), ensureAdapterRegistration(), ensureProviderRegistrations(), execFileAsync, getProviderWorkflowRun() (+22 more)

### Community 27 - "Community 27"
Cohesion: 0.12
Nodes (28): CreateTemplateStep(), TemplateStep, buildFunctionDefinitionPreview(), getActionErrorMessage(), getFieldErrorMessage(), getInitialFunctionDefinition(), getTemplateStepFormDefaults(), templateStepFieldValidators (+20 more)

### Community 28 - "Community 28"
Cohesion: 0.16
Nodes (24): ADD_NODE_PROMPT_NODE_TYPE, AddNodePromptNodeData, createAddNodePromptNode(), isAddNodePromptNode(), getFlowBlockBounds(), getFlowBlockMembershipMap(), hasOrphanedFlowNode(), isEdgeWithinSameFlowBlock() (+16 more)

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (25): metadata, checkUniqueName(), createEnvironment(), deleteEnvironments(), getEnvironmentByIdOrThrow(), listEnvironments(), normalizeEnvironmentPayload(), basePayload (+17 more)

### Community 30 - "Community 30"
Cohesion: 0.10
Nodes (28): testRunSchema, resolveTargetProject(), formatLogsForStorage(), LogEntry, parseLogsFromStorage(), buildOrExpression(), buildTestRunsWhereClause(), isCancelledOrCancellingStatus() (+20 more)

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (21): metadata, templateStepGroupSchema, TemplateStepGroupType, TemplateStepGroupTypeEnum, ModifyTemplateStepPage(), deleteTemplateStepGroupAction(), getAllTemplateStepGroupsAction(), createTemplateStepGroup() (+13 more)

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (24): getAutomationFeaturesDir(), AppraiseMetadataReadResult, AppraiseTestCaseMetadata, AppraiseTestCaseMetadataFlowBlock, AppraiseTestCaseMetadataNode, buildAppraiseMetadata(), findIdentifierTag(), getAppraiseMetadataPath() (+16 more)

### Community 33 - "Community 33"
Cohesion: 0.11
Nodes (21): resolveStoredPath(), addDownloadArtifacts(), addLegacyLogFile(), addLegacyReportFile(), addLegacyTraceFiles(), addRunArtifactFiles(), addStoredArtifactFile(), Archive (+13 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (22): TestRun, testRunFormOpts, getActionErrorMessage(), getTestRunSuccessPath(), getBrowserEngineOptions(), getFieldErrorMessage(), testRunQuickTips, testRunFieldValidators (+14 more)

### Community 35 - "Community 35"
Cohesion: 0.11
Nodes (22): addPlanRemark(), approvePlanRevision(), emptyReview(), findRemarkThread(), getPlanReviewDetail(), hashContent(), listPlans(), parsePositions() (+14 more)

### Community 36 - "Community 36"
Cohesion: 0.14
Nodes (20): metadata, metadata, CreateModule(), Module, ModifyModule(), ModuleWithParent, getActionErrorMessage(), moduleFieldValidators (+12 more)

### Community 37 - "Community 37"
Cohesion: 0.20
Nodes (26): getAutomationActionStepsDir(), getAutomationConfigDir(), getAutomationEnvironmentsDir(), getAutomationLocatorsDir(), getAutomationMappingDir(), getAutomationReportLogsDir(), getAutomationReportRunDir(), getAutomationReportsDir() (+18 more)

### Community 38 - "Community 38"
Cohesion: 0.11
Nodes (31): addMissingScenariosToTestSuite(), addScenarioToTestSuite(), applyScenarioMetadataToSteps(), connectTagsToTestSuite(), createOrUpdateTestCaseStep(), createScenarioSteps(), createScenarioTestCase(), createTestSuiteWithScenarios() (+23 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (24): buildCodexExecArgs(), buildCodexMcpArgs(), buildCodexMcpCommandConfig(), buildCodexPlanningPrompt(), codexPlanningMcpTools, codexProviderAdapter, probeCodexProvider(), ProcessResult (+16 more)

### Community 40 - "Community 40"
Cohesion: 0.12
Nodes (23): testCaseDataColumns, testCasePickerColumns, testCaseSelectionColumn, applyUpdater(), createInitialPickerState(), defaultPagination, createSelectionState(), getSavedTestCases() (+15 more)

### Community 41 - "Community 41"
Cohesion: 0.09
Nodes (20): FlowBlockBounds, FlowDiagramBlockOverlays(), FlowDiagramBlockOverlaysProps, FlowDiagram(), FlowLayoutRefreshProps, FlowDiagramGroupingHints(), FlowDiagramGroupingHintsProps, layoutRefreshDelays (+12 more)

### Community 42 - "Community 42"
Cohesion: 0.11
Nodes (24): DataTableCreateButtonOption, DataTableProps, DataTableRowLike, getEntityId(), getResolvedRowId(), hasDataTableRowShape(), rowHasConflicts(), columns (+16 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (20): metadata, testSuiteSchema, getIdentifierTagByPrefix(), createTestSuiteIdentifierTag(), ensureTestSuiteIdentifierTags(), getOrCreateTestSuiteIdentifierTagId(), generateUniqueTestSuiteIdentifier(), createTestSuiteAction() (+12 more)

### Community 44 - "Community 44"
Cohesion: 0.19
Nodes (23): CreateLocatorWorkspace(), canLaunchPicker(), canSaveLocator(), createInitialWorkspaceState(), createWorkspaceAutoFillSnapshot(), formatStatus(), getLocatorSourceType(), getLocatorWorkspaceResolutionMode() (+15 more)

### Community 45 - "Community 45"
Cohesion: 0.14
Nodes (20): NodeData, NodeOrderMap, TemplateTestCaseNodeOrderMap, DiagramNodeOrder, DiagramNodeParameter, toNodeOrderMap(), toTemplateTestCaseNodeOrderMap(), DiagramNodeOrder (+12 more)

### Community 46 - "Community 46"
Cohesion: 0.14
Nodes (11): ArtifactKind, artifactLocation, assertPlanId(), hashContent(), pathExists(), PlanArtifactRepository, PlanArtifactRepositoryOptions, PlanRepositoryError (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.11
Nodes (21): StoredPlanArtifact, createOpaquePlanId(), createPlanSlug(), encodeRandom(), encodeTime(), isLegacyPlanId(), countPendingPlanSync(), groupArtifacts() (+13 more)

### Community 48 - "Community 48"
Cohesion: 0.13
Nodes (14): dispatchTestRunExit(), LogViewer(), createLogMessage(), parseLogMessages(), fatalErrorPatterns, getConnectionStatusText(), isFatalLogStreamError(), isTerminalRunStatus() (+6 more)

### Community 49 - "Community 49"
Cohesion: 0.12
Nodes (28): metadata, metadata, metadata, CreateTestSuite(), tagFormOpts, tagSchema, ModifyTag(), ModifyTestSuite() (+20 more)

### Community 50 - "Community 50"
Cohesion: 0.13
Nodes (15): extractLocatorGroupName(), extractModulePathFromLocatorFile(), detectAndCreateConflicts(), savePickedLocatorFromRequest(), SavePickedLocatorOutcome, savePickedLocatorSchema, syncLocatorsFromFiles(), SyncLocatorsFromFilesResult (+7 more)

### Community 51 - "Community 51"
Cohesion: 0.09
Nodes (12): EnvironmentFieldErrorsProps, EnvironmentFormProps, { push, toast }, moduleFormOpts, getTanStackFormAction(), TanStackFormSubmitHandler, TanStackForm(), TanStackFormProps (+4 more)

### Community 52 - "Community 52"
Cohesion: 0.14
Nodes (20): Action, ActionType, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState, reducer() (+12 more)

### Community 53 - "Community 53"
Cohesion: 0.15
Nodes (24): buildExpectedFeatureFilePath(), buildModulePathFromTestSuite(), checkModuleExists(), checkTagExists(), checkTemplateStepExists(), checkTestCaseExists(), checkTestSuiteExists(), collectDatabaseDryRunChanges() (+16 more)

### Community 54 - "Community 54"
Cohesion: 0.15
Nodes (22): buildRecalculatedMetricUpdateData(), CompletedTestRunTestCase, countConsecutiveFailures(), findMostRecentOlderTestRunTestCases(), findOlderResultDate(), findRecentCompletedTestRunTestCases(), getCompletedAt(), getMostRecentResultDate() (+14 more)

### Community 55 - "Community 55"
Cohesion: 0.14
Nodes (15): buildJsonReportFormat(), getAutomationRunLogPath(), getAutomationRunReportPath(), toProjectRelativePath(), generateReportPath(), LocalExecutorAdapter, mapBrowserEngineToName(), { mockSpawnTask, mockEnsureAutomationWorkspaceReady, mockMkdir, mockRegister, mockUnregister } (+7 more)

### Community 56 - "Community 56"
Cohesion: 0.17
Nodes (16): getConvertedTemplateTestCaseData(), getFieldErrorMessage(), getTemplateSelectionOptions(), getTemplateSelectionRows(), getTemplateTestCaseWithSteps(), isNamedRow(), isTemplateTestCaseWithSteps(), TemplateSelectionOption (+8 more)

### Community 57 - "Community 57"
Cohesion: 0.17
Nodes (18): addValidationFeedbackThread(), affectedFilePaths(), affectedValidationIds(), approveCurrentValidationFile(), approveValidationFile(), decideValidationNode(), invalidateReviewEvidence(), invalidateValidationEvidence() (+10 more)

### Community 58 - "Community 58"
Cohesion: 0.11
Nodes (19): ActionResult, ChangedFile, ChangedFileCard(), decisionVariant(), FeedbackScope, feedbackTargetLabel(), fileNeedsApproval(), formatState() (+11 more)

### Community 59 - "Community 59"
Cohesion: 0.14
Nodes (19): templateTestCaseSchema, flowBlockSchema, testCaseStepSchema, testCaseStepsSchema, deleteTemplateTestCaseAction(), getAllTemplateTestCasesAction(), createTemplateTestCase(), deleteTemplateTestCases() (+11 more)

### Community 60 - "Community 60"
Cohesion: 0.13
Nodes (16): ReviewArtifact, assessValidationReadiness(), canModifyDuringValidationPreparation(), currentFileApproval(), fileReviewHash(), validationNodeHash(), ValidationReadiness, classifyFile() (+8 more)

### Community 61 - "Community 61"
Cohesion: 0.10
Nodes (16): approvedStates, baselineStates, filterPredicates, filters, getCardAccentClass(), getLifecycleBadgeClass(), getLifecycleLabel(), lifecycleBadgeClasses (+8 more)

### Community 62 - "Community 62"
Cohesion: 0.14
Nodes (14): metadata, TemplateStepGroup, templateStepGroupFormOpts, ModifyTemplateStepGroup(), TemplateStepGroupFieldErrorsProps, TemplateStepGroupForm(), TemplateStepGroupFormProps, { push, toast } (+6 more)

### Community 63 - "Community 63"
Cohesion: 0.14
Nodes (19): cancelTestRunAction(), checkTestRunNameUniqueAction(), checkTraceViewerStatusAction(), deleteTestRunAction(), getAllTestRunsAction(), getAllTestSuiteTestCasesAction(), getTestRunLogsAction(), spawnTraceViewerAction() (+11 more)

### Community 64 - "Community 64"
Cohesion: 0.16
Nodes (21): AppraiseTestCaseMetadataEntry, getMetadataByIdentifier(), collectPrecedingTags(), extractModulePathFromFilePath(), getFeatureTags(), getScenarioIdentifierTag(), isSkippableLine(), normalizeGherkinLines() (+13 more)

### Community 65 - "Community 65"
Cohesion: 0.14
Nodes (16): CommandMode, commandModeLabels, commandModePlaceholders, getCommandBadge(), getNavigationCommandGroups(), NavigationCommandGroup, NavigationCommandGroupOptions, NavigationCommandItem (+8 more)

### Community 66 - "Community 66"
Cohesion: 0.19
Nodes (15): cleanupLingeringCompanionSessions(), delay(), getSessionAgeMs(), isMissingProcessError(), isTerminalStatus(), processExists(), safeUrlParts(), shutdownCompanionProcess() (+7 more)

### Community 67 - "Community 67"
Cohesion: 0.15
Nodes (14): canApprovePlan(), canRequestPlanChanges(), derivePlanGraph(), diffPlanTasks(), evaluateGraphReadiness(), getBlockingThreads(), getOrphanedThreads(), getThreadStatus() (+6 more)

### Community 68 - "Community 68"
Cohesion: 0.14
Nodes (14): inter, interTight, metadata, RootLayout(), viewport, isFeatureEnabled(), isProviderNativeRunsEnabled(), truthyFeatureValues (+6 more)

### Community 69 - "Community 69"
Cohesion: 0.13
Nodes (9): BaseNode(), AddNodePromptNodeComponentProps, OptionsHeaderGherkinParameter, OptionsHeaderGherkinStep(), OptionsHeaderNode, OptionsHeaderNodeData, OptionsHeaderNodeParameter, OptionsHeaderNodeProps (+1 more)

### Community 70 - "Community 70"
Cohesion: 0.28
Nodes (16): getInlineLocatorSaveResult(), getLocatorPickerSession(), getLocatorRow(), hasDateProp(), hasDateProps(), hasNullableStringProp(), hasNullableStringProps(), hasStringProp() (+8 more)

### Community 71 - "Community 71"
Cohesion: 0.17
Nodes (15): detectPackageManager(), extractScripts(), fingerprintTargetProject(), listTargetProjects(), PackageJsonShape, PackageMetadata, readPackageJson(), readPackageMetadata() (+7 more)

### Community 72 - "Community 72"
Cohesion: 0.19
Nodes (16): formatFileContent(), getFilePath(), getSubdirectoryName(), sanitizeFileName(), createTemplateStepGroupFile(), ensureGroupJSDoc(), ensureRequiredImports(), extractGroupJSDocBounds() (+8 more)

### Community 73 - "Community 73"
Cohesion: 0.17
Nodes (11): CreateTestRun(), CreateTestRunPageData, loadCreateTestRunPageData(), getAllEnvironmentsActionMock, getAllTagsActionMock, getAllTestSuiteTestCasesActionMock, getEnvironmentRows(), getTagRows() (+3 more)

### Community 74 - "Community 74"
Cohesion: 0.20
Nodes (13): hasErrorCode(), isPlanDetailNotFound(), PageProps, PlanReviewPage(), readErrorCode(), readExactPlanDetail(), resolveSlugMatches(), getPlanDisplaySlug() (+5 more)

### Community 75 - "Community 75"
Cohesion: 0.16
Nodes (11): DownloadLogsButton(), DownloadLogsButtonProps, fadeSlideTransition, scaleFadeTransition, ViewReportButton(), ViewReportButtonProps, Button(), ButtonProps (+3 more)

### Community 76 - "Community 76"
Cohesion: 0.21
Nodes (13): TemplateTestCaseNodeData, buildFlowNodeData(), buildNodeFormData(), DiagramNodeOrder, DiagramParameter, FlowNodeData, getTemplateStepIcon(), toRuntimeParameters() (+5 more)

### Community 77 - "Community 77"
Cohesion: 0.20
Nodes (13): extractModulePathFromAutomationFile(), getAutomationFeaturesDir(), getAutomationLocatorMapPath(), getAutomationLocatorsDir(), toPosixPath(), EXCLUDED_DIRS, EXCLUDED_EXTENSIONS, EXCLUDED_FILENAMES (+5 more)

### Community 78 - "Community 78"
Cohesion: 0.19
Nodes (12): ensureProjectDatabaseUrl(), globalForPrisma, normalizeDatabaseUrl(), { PrismaClient }, PrismaClientInstance, readProjectDatabaseUrl(), require, createOrUpdateEnvironmentsFile() (+4 more)

### Community 79 - "Community 79"
Cohesion: 0.21
Nodes (13): buildModulePathMap(), humanizeSegment(), inferGroupSuggestion(), normalizeRoute(), normalizeText(), SuggestionLocatorGroup, SuggestionModule, suggestLocatorName() (+5 more)

### Community 80 - "Community 80"
Cohesion: 0.16
Nodes (9): formatDate(), ProviderRunWorkspace(), ProviderRunWorkspaceProps, RunCard(), RunWithRelations, statusStyles, TargetProjectFile, { registerProviderTargetProjectAction, refresh } (+1 more)

### Community 81 - "Community 81"
Cohesion: 0.33
Nodes (5): ButtonSkeleton(), IconButtonSkeleton(), TextInputSkeleton(), Skeleton(), TableSkeleton()

### Community 82 - "Community 82"
Cohesion: 0.20
Nodes (8): Tag, getActionErrorMessage(), getCreatedTag(), tagFieldValidators, TagFormSubmitAction, TagFieldErrorsProps, TagFormProps, { push, toast }

### Community 83 - "Community 83"
Cohesion: 0.25
Nodes (12): containsFunctionStart(), countLineDelimiters(), DelimiterCounts, findJSDocStartLine(), findStepCallEndLine(), findStepFunctionBounds(), hasMatchingSignature(), isBalancedStepCall() (+4 more)

### Community 84 - "Community 84"
Cohesion: 0.17
Nodes (9): AddNodePromptFlowNode, AddNodePromptNode, ButtonEdge(), DEFAULT_EDGE_STYLE, FlowEdgeMutationGuard, flowEdgeMutationGuardRef, flowDiagramHandlersRef, flowEdgeTypes (+1 more)

### Community 85 - "Community 85"
Cohesion: 0.29
Nodes (8): templateStepSchema, createTemplateStep(), getTemplateStepByIdOrThrow(), normalizeFunctionDefinition(), normalizeOptionalText(), TemplateStepDetail, templateStepDetailInclude, updateTemplateStep()

### Community 86 - "Community 86"
Cohesion: 0.29
Nodes (12): findNearestJSDocStart(), findTopLevelJSDocStart(), normalizeGroupTypeStrict(), parseGroupJSDocLenient(), parseGroupJSDocStrict(), parseStepJSDocLenient(), parseStepJSDocStrict(), readGroupMetadataLine() (+4 more)

### Community 87 - "Community 87"
Cohesion: 0.33
Nodes (5): buildFlowBlocksFromTestCaseRows(), buildNodeOrderFromTestCaseSteps(), getEditableTestCase(), isEditableTestCase(), EditableTestCase

### Community 88 - "Community 88"
Cohesion: 0.24
Nodes (10): appendUniqueById(), appendUniqueId(), applyUpdater(), createTestCaseFormState(), CreateTestCaseFormStateInput, TestCaseFormAction, TestCaseFormErrors, testCaseFormReducer() (+2 more)

### Community 89 - "Community 89"
Cohesion: 0.24
Nodes (7): PlanReviewDetail, buildDependencyMaps(), Graph, projectPlanFlow(), SemanticEdge, SemanticTask, Graph

### Community 90 - "Community 90"
Cohesion: 0.25
Nodes (9): cancelProviderRunAction(), cancelProviderRunSchema, createProviderRunAction(), createProviderRunSchema, decideProviderPermissionAction(), permissionDecisionSchema, registerProviderTargetProjectAction(), registerTargetProjectSchema (+1 more)

### Community 91 - "Community 91"
Cohesion: 0.33
Nodes (8): createLocatorInspectorInjectionScript(), generateCSSPath(), generateXPath(), getLocatorInspectorOrigin(), isLocatorInspectorMessage(), isSelectedElementPayload(), LocatorInspectorMessage, SelectedElementPayload

### Community 92 - "Community 92"
Cohesion: 0.38
Nodes (8): checkLocatorGroupNameUnique(), checkUniqueName(), createLocatorGroup(), deleteLocatorGroups(), getLocatorGroupByIdOrThrow(), locatorGroupInclude, LocatorGroupWithModule, updateLocatorGroup()

### Community 93 - "Community 93"
Cohesion: 0.36
Nodes (9): applyExistingGroupSuggestion(), applyNewGroupSuggestion(), applyPickedLocatorToWorkspaceState(), applyPickedSelector(), applySuggestedLocatorName(), applySuggestedRoute(), canReplaceAutoValue(), canReplaceRoute() (+1 more)

### Community 94 - "Community 94"
Cohesion: 0.28
Nodes (5): FlowDiagramNodeSearch(), FlowNodeSearchResult, FlowDiagramToolbarProps, Kbd(), KbdGroup()

### Community 95 - "Community 95"
Cohesion: 0.31
Nodes (7): AgentCard(), CodingAgentRegistration, SettingsCodingAgentsPanel(), statusVariant(), providers, { refresh, probeProviderAction, updateProviderAction }, TooltipContent()

### Community 96 - "Community 96"
Cohesion: 0.39
Nodes (7): assertProviderNativeRunsEnabled(), probeProviderAction(), providerKeySchema, revalidateProviderPaths(), updateProviderAction(), updateProviderSchema, providerActionErrorResponse()

### Community 97 - "Community 97"
Cohesion: 0.18
Nodes (11): determineProjectedStepIcon(), normalizeProjectedDbTestCaseSteps(), ProjectedDbTestCaseStep, StoredProjectedDbStep, StoredProjectedStep, extractParametersFromGherkinStep(), hasProjectedTestCaseStepMismatch(), matchGherkinStepToTemplateStep() (+3 more)

### Community 98 - "Community 98"
Cohesion: 0.76
Nodes (6): applyMigration(), ensureCoordinatorPlanRuntimeTestSchema(), ensurePlanProjectionTestSchema(), ensureProviderRunTestSchema(), hasColumn(), hasTable()

### Community 99 - "Community 99"
Cohesion: 0.40
Nodes (3): buildModuleHierarchy(), createOrFindModule(), getAllModulesWithPaths()

### Community 100 - "Community 100"
Cohesion: 0.33
Nodes (5): getReviewUnavailableReason(), PlanReviewWorkspace(), {
  approvePlanRevisionAction,
  approveValidationFileAction,
  decideValidationNodeAction,
  fitView,
  publishSharedPlanLayoutAction,
  requestPlanChangesAction,
  savePersonalPlanLayoutAction,
  setNodes,
  submitValidationFeedbackAction,
  submitValidationReviewAction,
}, detail, validationDetail

## Knowledge Gaps
- **546 isolated node(s):** `startLocatorPickerSessionSchema`, `payload`, `InvalidSyncExecutionResult`, `metadata`, `{ push, toast }` (+541 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ServiceError` connect `Community 0` to `Community 1`, `Community 5`, `Community 9`, `Community 14`, `Community 18`, `Community 19`, `Community 22`, `Community 25`, `Community 26`, `Community 29`, `Community 30`, `Community 31`, `Community 35`, `Community 43`, `Community 49`, `Community 50`, `Community 57`, `Community 59`, `Community 63`, `Community 71`, `Community 74`, `Community 85`, `Community 90`, `Community 92`, `Community 96`?**
  _High betweenness centrality (0.137) - this node is a cross-community bridge._
- **Why does `cn()` connect `Community 13` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 10`, `Community 11`, `Community 15`, `Community 17`, `Community 20`, `Community 21`, `Community 22`, `Community 34`, `Community 40`, `Community 42`, `Community 48`, `Community 58`, `Community 61`, `Community 65`, `Community 69`, `Community 75`, `Community 81`, `Community 94`, `Community 95`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `Button()` connect `Community 75` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 10`, `Community 11`, `Community 12`, `Community 13`, `Community 15`, `Community 17`, `Community 20`, `Community 22`, `Community 34`, `Community 41`, `Community 42`, `Community 51`, `Community 52`, `Community 58`, `Community 61`, `Community 62`, `Community 65`, `Community 69`, `Community 74`, `Community 80`, `Community 82`, `Community 84`, `Community 94`, `Community 95`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **What connects `startLocatorPickerSessionSchema`, `payload`, `InvalidSyncExecutionResult` to the rest of the system?**
  _546 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08485540334855403 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.0519219736087206 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.05249569707401033 - nodes in this community are weakly interconnected._