import type { Prisma } from '@prisma/client'

import { isSharedResourceId, sharedResourceBounds } from '@/lib/quality-journey/shared-resource-contract'
import type { SharedResourceMutationKey } from '@/services/coordinator/quality-journey-shared-resource-guard-service'
import { ServiceError } from '@/services/shared/errors'

type Tx = Prisma.TransactionClient
const rowLimit = 65_536
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const rootSelect = { id: true, targetProjectId: true } as const
const ownershipSelect = { id: true, targetProjectId: true, entityType: true, entityId: true, scope: true } as const
const refuse: (reason: string) => never = reason => {
  throw new ServiceError('Target deletion requires exact bounded effects and preserved history.', 'CONFLICT', 409, {
    protocol: 'M06_TARGET_DELETION_EFFECTS_V1', reason,
  })
}

/** Concrete SQL census only. It does not issue coverage, release claims, or
 * delete history. The owner executes the returned finite IDs in this same tx. */
export async function collectTargetProjectDeletionEffects(tx: Tx, targetProjectId: string) {
  let examined = 0
  const take = () => rowLimit - examined + 1
  const listed = <T extends { id: string }>(rows: T[]): T[] => {
    if (!Array.isArray(rows) || rows.length > rowLimit - examined) refuse('ROW_BOUND')
    examined += rows.length
    const seen = new Set<string>()
    for (const row of rows) {
      if (!isSharedResourceId(row.id) || seen.has(row.id)) refuse('ROW_ID_OR_DUPLICATE')
      seen.add(row.id)
    }
    return rows
  }
  const scoped = <T extends { id: string; targetProjectId: string }>(rows: T[]): T[] => {
    const result = listed(rows)
    if (result.some(row => row.targetProjectId !== targetProjectId)) refuse('FOREIGN_ENDPOINT')
    return result
  }
  const ids = (rows: readonly { id: string }[]) => rows.map(row => row.id).sort(compare)
  const endpoint = (id: string | null, allowed: ReadonlySet<string>, nullable = false) => {
    if (id === null && nullable) return
    if (!isSharedResourceId(id) || !allowed.has(id as string)) refuse('MISSING_OR_FOREIGN_ENDPOINT')
  }
  const absent = (row: unknown, reason: string) => { if (row !== null) refuse(reason) }

  const modules = scoped(await tx.module.findMany({ where: { targetProjectId },
    select: { ...rootSelect, parentId: true }, orderBy: { id: 'asc' }, take: take() }))
  const groups = scoped(await tx.locatorGroup.findMany({ where: { targetProjectId },
    select: { ...rootSelect, moduleId: true }, orderBy: { id: 'asc' }, take: take() }))
  const locators = scoped(await tx.locator.findMany({ where: { targetProjectId },
    select: { ...rootSelect, locatorGroupId: true }, orderBy: { id: 'asc' }, take: take() }))
  const suites = scoped(await tx.testSuite.findMany({ where: { targetProjectId },
    select: { ...rootSelect, moduleId: true }, orderBy: { id: 'asc' }, take: take() }))
  const cases = scoped(await tx.testCase.findMany({ where: { targetProjectId }, select: rootSelect,
    orderBy: { id: 'asc' }, take: take() }))
  const templates = scoped(await tx.templateTestCase.findMany({ where: { targetProjectId }, select: rootSelect,
    orderBy: { id: 'asc' }, take: take() }))
  const environments = scoped(await tx.environment.findMany({ where: { targetProjectId }, select: rootSelect,
    orderBy: { id: 'asc' }, take: take() }))
  const tags = scoped(await tx.tag.findMany({ where: { targetProjectId }, select: rootSelect,
    orderBy: { id: 'asc' }, take: take() }))
  const moduleIds = ids(modules), groupIds = ids(groups), locatorIds = ids(locators), suiteIds = ids(suites),
    caseIds = ids(cases), templateIds = ids(templates), environmentIds = ids(environments), tagIds = ids(tags)
  const moduleSet = new Set(moduleIds), groupSet = new Set(groupIds), locatorSet = new Set(locatorIds),
    suiteSet = new Set(suiteIds), caseSet = new Set(caseIds), tagSet = new Set(tagIds)
  const roots: SharedResourceMutationKey[] = [
    ...moduleIds.map(resourceId => ({ kind: 'MODULE' as const, resourceId })),
    ...groupIds.map(resourceId => ({ kind: 'LOCATOR_GROUP' as const, resourceId })),
    ...locatorIds.map(resourceId => ({ kind: 'LOCATOR' as const, resourceId })),
    ...suiteIds.map(resourceId => ({ kind: 'TEST_SUITE' as const, resourceId })),
    ...caseIds.map(resourceId => ({ kind: 'TEST_CASE' as const, resourceId })),
  ].sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
  if (roots.length > sharedResourceBounds.keys) refuse('RESOURCE_BOUND')
  for (const row of modules) endpoint(row.parentId, moduleSet, true)
  for (const row of groups) endpoint(row.moduleId, moduleSet)
  for (const row of suites) endpoint(row.moduleId, moduleSet)
  for (const row of locators) endpoint(row.locatorGroupId, groupSet, true)

  // Incoming reads have no target predicate: a foreign endpoint cannot disappear.
  for (const row of scoped(await tx.module.findMany({ where: { parentId: { in: moduleIds } },
    select: { ...rootSelect, parentId: true }, orderBy: { id: 'asc' }, take: take() }))) {
    endpoint(row.id, moduleSet); endpoint(row.parentId, moduleSet)
  }
  for (const row of scoped(await tx.locatorGroup.findMany({ where: { moduleId: { in: moduleIds } },
    select: { ...rootSelect, moduleId: true }, orderBy: { id: 'asc' }, take: take() }))) {
    endpoint(row.id, groupSet); endpoint(row.moduleId, moduleSet)
  }
  for (const row of scoped(await tx.testSuite.findMany({ where: { moduleId: { in: moduleIds } },
    select: { ...rootSelect, moduleId: true }, orderBy: { id: 'asc' }, take: take() }))) {
    endpoint(row.id, suiteSet); endpoint(row.moduleId, moduleSet)
  }
  for (const row of scoped(await tx.locator.findMany({ where: { locatorGroupId: { in: groupIds } },
    select: { ...rootSelect, locatorGroupId: true }, orderBy: { id: 'asc' }, take: take() }))) {
    endpoint(row.id, locatorSet); endpoint(row.locatorGroupId, groupSet)
  }

  // Leaf-first direct Module deletes preserve an exact count oracle under the
  // real parent Cascade FK. No recursive walk or child cascade hides a delete.
  const remaining = new Map(modules.map(row => [row.id, row.parentId]))
  const moduleDeleteOrder: string[] = []
  while (remaining.size) {
    const parents = new Set(remaining.values())
    const leaves = [...remaining.keys()].filter(id => !parents.has(id)).sort(compare)
    if (!leaves.length) refuse('MODULE_CYCLE')
    for (const id of leaves) { moduleDeleteOrder.push(id); remaining.delete(id) }
  }

  for (const suite of suites) {
    for (const row of scoped(await tx.testCase.findMany({ where: { TestSuite: { some: { id: suite.id } } },
      select: rootSelect, orderBy: { id: 'asc' }, take: take() }))) endpoint(row.id, caseSet)
    for (const row of scoped(await tx.tag.findMany({ where: { testSuites: { some: { id: suite.id } } },
      select: rootSelect, orderBy: { id: 'asc' }, take: take() }))) endpoint(row.id, tagSet)
  }
  for (const testCase of cases) {
    for (const row of scoped(await tx.testSuite.findMany({ where: { testCases: { some: { id: testCase.id } } },
      select: rootSelect, orderBy: { id: 'asc' }, take: take() }))) endpoint(row.id, suiteSet)
    for (const row of scoped(await tx.tag.findMany({ where: { testCases: { some: { id: testCase.id } } },
      select: rootSelect, orderBy: { id: 'asc' }, take: take() }))) endpoint(row.id, tagSet)
  }
  for (const tag of tags) {
    for (const row of scoped(await tx.testSuite.findMany({ where: { tags: { some: { id: tag.id } } },
      select: rootSelect, orderBy: { id: 'asc' }, take: take() }))) endpoint(row.id, suiteSet)
    for (const row of scoped(await tx.testCase.findMany({ where: { tags: { some: { id: tag.id } } },
      select: rootSelect, orderBy: { id: 'asc' }, take: take() }))) endpoint(row.id, caseSet)
    absent(await tx.testRun.findFirst({ where: { tags: { some: { id: tag.id } } }, select: { id: true } }), 'TAG_RUNTIME_HISTORY')
  }

  const steps = listed(await tx.testCaseStep.findMany({ where: { testCaseId: { in: caseIds } },
    select: { id: true, testCaseId: true }, orderBy: { id: 'asc' }, take: take() }))
  const templateSteps = listed(await tx.templateTestCaseStep.findMany({ where: { templateTestCaseId: { in: templateIds } },
    select: { id: true, templateTestCaseId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of steps) endpoint(row.testCaseId, caseSet)
  const templateSet = new Set(templateIds)
  for (const row of templateSteps) endpoint(row.templateTestCaseId, templateSet)
  const stepIds = ids(steps), templateStepIds = ids(templateSteps), stepSet = new Set(stepIds), templateStepSet = new Set(templateStepIds)
  const parameters = listed(await tx.testCaseStepParameter.findMany({ where: { OR: [
    { testCaseStepId: { in: stepIds } }, { locatorId: { in: locatorIds } },
  ] }, select: { id: true, testCaseStepId: true, locatorId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of parameters) { endpoint(row.testCaseStepId, stepSet); endpoint(row.locatorId, locatorSet, true) }
  const templateParameters = listed(await tx.templateTestCaseStepParameter.findMany({ where: { OR: [
    { testCaseStepId: { in: templateStepIds } }, { locatorId: { in: locatorIds } }, { defaultLocatorId: { in: locatorIds } },
  ] }, select: { id: true, testCaseStepId: true, locatorId: true, defaultLocatorId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of templateParameters) {
    endpoint(row.testCaseStepId, templateStepSet); endpoint(row.locatorId, locatorSet, true); endpoint(row.defaultLocatorId, locatorSet, true)
  }
  const blocks = listed(await tx.testCaseFlowBlock.findMany({ where: { testCaseId: { in: caseIds } },
    select: { id: true, testCaseId: true }, orderBy: { id: 'asc' }, take: take() }))
  const templateBlocks = listed(await tx.templateTestCaseFlowBlock.findMany({ where: { templateTestCaseId: { in: templateIds } },
    select: { id: true, templateTestCaseId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of blocks) endpoint(row.testCaseId, caseSet)
  for (const row of templateBlocks) endpoint(row.templateTestCaseId, templateSet)
  const blockIds = ids(blocks), templateBlockIds = ids(templateBlocks), blockSet = new Set(blockIds), templateBlockSet = new Set(templateBlockIds)
  const nodes = listed(await tx.testCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: blockIds } },
    select: { id: true, flowBlockId: true }, orderBy: { id: 'asc' }, take: take() }))
  const templateNodes = listed(await tx.templateTestCaseFlowBlockNode.findMany({ where: { flowBlockId: { in: templateBlockIds } },
    select: { id: true, flowBlockId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of nodes) endpoint(row.flowBlockId, blockSet)
  for (const row of templateNodes) endpoint(row.flowBlockId, templateBlockSet)
  const conflicts = listed(await tx.conflictResolution.findMany({ where: { OR: [
    { entityId: { in: locatorIds } }, { conflictingEntityId: { in: locatorIds } },
  ] }, select: { id: true, entityType: true, entityId: true, conflictingEntityId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of conflicts) {
    if (row.entityType !== 'LOCATOR') refuse('CONFLICT_ENTITY_TYPE')
    endpoint(row.entityId, locatorSet); endpoint(row.conflictingEntityId, locatorSet, true)
  }
  const caseMetrics = scoped(await tx.testCaseMetrics.findMany({ where: { OR: [
    { targetProjectId }, { testCaseId: { in: caseIds } },
  ] }, select: { ...rootSelect, testCaseId: true }, orderBy: { id: 'asc' }, take: take() }))
  const suiteMetrics = scoped(await tx.testSuiteMetrics.findMany({ where: { OR: [
    { targetProjectId }, { testSuiteId: { in: suiteIds } },
  ] }, select: { ...rootSelect, testSuiteId: true }, orderBy: { id: 'asc' }, take: take() }))
  for (const row of caseMetrics) endpoint(row.testCaseId, caseSet)
  for (const row of suiteMetrics) endpoint(row.testSuiteId, suiteSet)
  const dashboardMetrics = scoped(await tx.dashboardMetrics.findMany({ where: { targetProjectId },
    select: rootSelect, orderBy: { id: 'asc' }, take: take() }))

  // Retention has no reviewed erasure/migration path. Refuse before preparation,
  // including FK cascades and scalar historical IDs that SQLite cannot protect.
  absent(await tx.review.findFirst({ where: { testCaseId: { in: caseIds } }, select: { id: true } }), 'CASE_REVIEW_HISTORY')
  absent(await tx.linkedJiraTicket.findFirst({ where: { testCaseId: { in: caseIds } }, select: { id: true } }), 'CASE_JIRA_HISTORY')
  absent(await tx.testRunTestCase.findFirst({ where: { OR: [{ testCaseId: { in: caseIds } }, { testSuiteId: { in: suiteIds } }] }, select: { id: true } }), 'RUN_CASE_HISTORY')
  absent(await tx.reportTestCase.findFirst({ where: { testCaseId: { in: caseIds } }, select: { id: true } }), 'REPORT_CASE_HISTORY')
  absent(await tx.testRun.findFirst({ where: { OR: [{ targetProjectId }, { environmentId: { in: environmentIds } }] }, select: { id: true } }), 'TARGET_RUNTIME_HISTORY')
  absent(await tx.qualityJourneyAutomationMaterialization.findFirst({ where: { OR: [{ targetProjectId }, { suiteId: { in: suiteIds } }, { testCaseId: { in: caseIds } }] }, select: { id: true } }), 'MATERIALIZATION_HISTORY')
  absent(await tx.qualityJourneyAutomationTargetBinding.findFirst({ where: { OR: [{ targetProjectId }, { suiteId: { in: suiteIds } }, { testCaseId: { in: caseIds } }] }, select: { id: true } }), 'AUTOMATION_BINDING_HISTORY')
  absent(await tx.qualityJourneyLocatorEnsureReceipt.findFirst({ where: { OR: [{ targetProjectId }, { moduleId: { in: moduleIds } }, { locatorGroupId: { in: groupIds } }, { locatorId: { in: locatorIds } }] }, select: { id: true } }), 'LOCATOR_ENSURE_HISTORY')
  absent(await tx.qualityJourneyExecutionCycle.findFirst({ where: { OR: [{ targetProjectId }, { environmentId: { in: environmentIds } }] }, select: { id: true } }), 'EXECUTION_HISTORY')
  absent(await tx.collaborationEntityMap.findFirst({ where: { OR: [
    { kind: 'MODULE', localEntityId: { in: moduleIds } }, { kind: 'LOCATOR_GROUP', localEntityId: { in: groupIds } },
    { kind: 'LOCATOR', localEntityId: { in: locatorIds } }, { kind: 'TEST_SUITE', localEntityId: { in: suiteIds } },
    { kind: 'TEST_CASE', localEntityId: { in: caseIds } }, { kind: 'TEMPLATE', localEntityId: { in: templateIds } },
    { kind: 'TAG', localEntityId: { in: tagIds } }, { kind: 'ENVIRONMENT_REFERENCE', localEntityId: { in: environmentIds } },
  ] }, select: { id: true } }), 'COLLABORATION_RESOURCE_HISTORY')
  absent(await tx.collaborationEnvironmentMapping.findFirst({ where: { localEnvironmentId: { in: environmentIds } }, select: { id: true } }), 'COLLABORATION_ENVIRONMENT_HISTORY')
  absent(await tx.qualityJourney.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEY')
  absent(await tx.qualityJourneyOwnedBrowser.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYOWNEDBROWSER')
  absent(await tx.qualityJourneyDraft.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYDRAFT')
  absent(await tx.qualityJourneyCoordinatorSession.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYCOORDINATORSESSION')
  absent(await tx.qualityJourneyWorkAttemptSessionBinding.findFirst({ where: { targetProjectId }, select: { attemptId: true } }), 'RETAINED_QUALITYJOURNEYWORKATTEMPTSESSIONBINDING')
  absent(await tx.qualityJourneyCoordinatorHandoff.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYCOORDINATORHANDOFF')
  absent(await tx.qualityJourneyArtifact.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYARTIFACT')
  absent(await tx.qualityJourneyAnalysisRevision.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYANALYSISREVISION')
  absent(await tx.qualityJourneyDiscoveryRevision.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYDISCOVERYREVISION')
  absent(await tx.qualityJourneyScenarioPortfolioRevision.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYSCENARIOPORTFOLIOREVISION')
  absent(await tx.qualityJourneyPreparedRuntimeCapsule.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYPREPAREDRUNTIMECAPSULE')
  absent(await tx.qualityJourneyExecutionConsent.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYEXECUTIONCONSENT')
  absent(await tx.qualityJourneyExecutionRerunProposal.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYEXECUTIONRERUNPROPOSAL')
  absent(await tx.qualityJourneyCommand.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYCOMMAND')
  absent(await tx.qualityJourneyEvent.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYEVENT')
  absent(await tx.qualityJourneyWorkItem.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYWORKITEM')
  absent(await tx.qualityJourneyWorkAuthorization.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYWORKAUTHORIZATION')
  absent(await tx.qualityJourneyExternalWorkClaimReceipt.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYEXTERNALWORKCLAIMRECEIPT')
  absent(await tx.qualityJourneyExternalSubmissionAcceptance.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYEXTERNALSUBMISSIONACCEPTANCE')
  absent(await tx.qualityJourneyBlocker.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYBLOCKER')
  absent(await tx.qualityJourneyArtifactLink.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYARTIFACTLINK')
  absent(await tx.agentPreflightReceipt.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_AGENTPREFLIGHTRECEIPT')
  absent(await tx.runtimeCapsule.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_RUNTIMECAPSULE')
  absent(await tx.runtimeCapsuleBlob.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_RUNTIMECAPSULEBLOB')
  absent(await tx.runtimeCapsuleLease.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_RUNTIMECAPSULELEASE')
  absent(await tx.report.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_REPORT')
  absent(await tx.collaborationBinding.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_COLLABORATIONBINDING')
  absent(await tx.qualityJourneyProviderRun.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYPROVIDERRUN')
  absent(await tx.qualityJourneyE2CampaignPolicy.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYE2CAMPAIGNPOLICY')
  absent(await tx.qualityJourneyE2OperationPreparation.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYE2OPERATIONPREPARATION')
  absent(await tx.qualityJourneyE2Retirement.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYE2RETIREMENT')
  absent(await tx.qualityJourneyE2ActorCustody.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYE2ACTORCUSTODY')
  absent(await tx.qualityJourneyE2Grant.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYE2GRANT')
  absent(await tx.qualityJourneyWakeIntent.findFirst({ where: { targetProjectId }, select: { id: true } }), 'RETAINED_QUALITYJOURNEYWAKEINTENT')
  absent(await tx.qualityJourneySharedResourceUse.findFirst({ where: { targetProjectId, state: { not: 'RELEASED' } }, select: { id: true } }), 'ACTIVE_RETAINED_USE')
  absent(await tx.qualityJourneySharedResourceClaim.findFirst({ where: { targetProjectId, state: { not: 'RELEASED' } }, select: { id: true } }), 'ACTIVE_RETAINED_CLAIM')

  // Own metadata is removable only for actual finite project-owned resources.
  // Unknown/global-only polymorphic classes have no proved target cascade here.
  const ownerships = scoped(await tx.projectResourceOwnership.findMany({ where: { OR: [
    { targetProjectId }, { entityType: 'module', entityId: { in: moduleIds } },
    { entityType: 'locator-group', entityId: { in: groupIds } }, { entityType: 'locator', entityId: { in: locatorIds } },
    { entityType: 'test-suite', entityId: { in: suiteIds } }, { entityType: 'test-case', entityId: { in: caseIds } },
    { entityType: 'environment', entityId: { in: environmentIds } }, { entityType: 'tag', entityId: { in: tagIds } },
  ] }, select: ownershipSelect, orderBy: { id: 'asc' }, take: take() }))
  const environmentSet = new Set(environmentIds)
  const validScope = (scope: string) => ['system', 'global_library', 'project', 'publication', 'runtime', 'quarantined'].includes(scope)
  for (const row of ownerships) {
    if (!validScope(row.scope)) refuse('OWNERSHIP_SCOPE')
    switch (row.entityType) {
      case 'module': endpoint(row.entityId, moduleSet); break
      case 'locator-group': endpoint(row.entityId, groupSet); break
      case 'locator': endpoint(row.entityId, locatorSet); break
      case 'test-suite': endpoint(row.entityId, suiteSet); break
      case 'test-case': endpoint(row.entityId, caseSet); break
      case 'environment': endpoint(row.entityId, environmentSet); break
      case 'tag': endpoint(row.entityId, tagSet); break
      default: refuse('OWNERSHIP_UNSUPPORTED_ENTITY_TYPE')
    }
  }
  const ownershipIds = ids(ownerships), ownershipMap = new Map(ownerships.map(row => [row.id, row]))
  const imports = listed(await tx.projectResourceImport.findMany({ where: { OR: [
    { destinationProjectId: targetProjectId }, { sourceOwnershipId: { in: ownershipIds } },
  ] }, select: { id: true, sourceOwnershipId: true, destinationProjectId: true, sharingMode: true },
    orderBy: { id: 'asc' }, take: take() }))
  for (const row of imports) {
    if (!isSharedResourceId(row.sourceOwnershipId) || row.destinationProjectId !== targetProjectId ||
      (row.sharingMode !== 'copy' && row.sharingMode !== 'immutable_reference')) refuse('FOREIGN_OR_INVALID_IMPORT')
  }
  const sourceIds = [...new Set(imports.map(row => row.sourceOwnershipId).filter(id => !ownershipMap.has(id)))].sort(compare)
  const sourceOwnerships = listed(await tx.projectResourceOwnership.findMany({ where: { id: { in: sourceIds } },
    select: ownershipSelect, orderBy: { id: 'asc' }, take: take() }))
  if (sourceOwnerships.length !== sourceIds.length || sourceOwnerships.some(row => !sourceIds.includes(row.id)))
    refuse('MISSING_IMPORT_SOURCE_OWNERSHIP')
  const sourceTargetIds = [...new Set(sourceOwnerships.map(row => row.targetProjectId))].sort(compare)
  if (sourceTargetIds.some(id => !isSharedResourceId(id) || id === targetProjectId)) refuse('IMPORT_SOURCE_SCOPE')
  const sourceTargets = listed(await tx.targetProject.findMany({ where: { id: { in: sourceTargetIds } },
    select: { id: true }, orderBy: { id: 'asc' }, take: take() }))
  if (sourceTargets.length !== sourceTargetIds.length || sourceTargets.some(row => !sourceTargetIds.includes(row.id)))
    refuse('MISSING_IMPORT_SOURCE_TARGET')
  for (const row of sourceOwnerships) {
    if (!isSharedResourceId(row.entityId) || !validScope(row.scope)) refuse('IMPORT_SOURCE_SCOPE')
    let resource: { id: string; targetProjectId: string } | null
    switch (row.entityType) {
      case 'module': resource = await tx.module.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      case 'locator-group': resource = await tx.locatorGroup.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      case 'locator': resource = await tx.locator.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      case 'test-suite': resource = await tx.testSuite.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      case 'test-case': resource = await tx.testCase.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      case 'environment': resource = await tx.environment.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      case 'tag': resource = await tx.tag.findFirst({ where: { id: row.entityId }, select: rootSelect }); break
      default: refuse('IMPORT_SOURCE_UNSUPPORTED_ENTITY_TYPE')
    }
    if (!resource || resource.id !== row.entityId || resource.targetProjectId !== row.targetProjectId)
      refuse('MISSING_OR_FOREIGN_IMPORT_SOURCE_RESOURCE')
    listed([resource])
    // Source ownership/Target/root are read-only endpoints. Do not guard or
    // remove them solely because this target's import edge is being removed.
  }
  return Object.freeze({
    roots: Object.freeze(roots.map(root => Object.freeze({ ...root }))),
    moduleDeleteOrder: Object.freeze(moduleDeleteOrder),
    groups: Object.freeze(groupIds), locators: Object.freeze(locatorIds), suites: Object.freeze(suiteIds), cases: Object.freeze(caseIds),
    templates: Object.freeze(templateIds), environments: Object.freeze(environmentIds), tags: Object.freeze(tagIds),
    parameters: Object.freeze(ids(parameters)), templateParameters: Object.freeze(ids(templateParameters)),
    steps: Object.freeze(stepIds), templateSteps: Object.freeze(templateStepIds),
    nodes: Object.freeze(ids(nodes)), templateNodes: Object.freeze(ids(templateNodes)),
    blocks: Object.freeze(blockIds), templateBlocks: Object.freeze(templateBlockIds), conflicts: Object.freeze(ids(conflicts)),
    caseMetrics: Object.freeze(ids(caseMetrics)), suiteMetrics: Object.freeze(ids(suiteMetrics)), dashboardMetrics: Object.freeze(ids(dashboardMetrics)),
    imports: Object.freeze(ids(imports)), ownerships: Object.freeze(ownershipIds),
  })
}
