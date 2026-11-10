import {
  canonicalSharedResourceJson,
  isSharedResourceDigest,
  isSharedResourceId,
  nextSharedResourceEpoch,
  SharedResourceContractError,
  sharedResourceDigest,
  sharedResourceKinds,
  sharedResourceSourceKinds,
  type SharedResourceKind,
  type SharedResourceSourceKind,
} from './shared-resource-contract'

/** Inert metadata only. None of these values attest a census or qualify a closure issuer. */
export const sharedResourceBootstrapProtocolVersion = 1 as const
export const sharedResourceBootstrapProofKind = 'JOURNEY_FREE_V1' as const
export const sharedResourceBootstrapBounds = Object.freeze({
  resourceKeys: 4096,
  examinedRecords: 65_536,
  referenceDepth: 32,
  bytes: 1_048_576,
  canonicalNodes: 65_536,
  executionSelections: 512,
  bindingSteps: 128,
})
export const sharedResourceBootstrapDomainOrder = [
  'LOCATOR', 'LOCATOR_GROUP', 'MODULE', 'TEST_CASE', 'TEST_SUITE',
] as const satisfies readonly SharedResourceKind[]

type Unique<T extends readonly string[], Seen = never> =
  T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? Head extends Seen ? false : Unique<Tail, Seen | Head>
    : true
function inventory<const T extends readonly string[]>(values: T & (Unique<T> extends true ? unknown : never)): T {
  Object.freeze(values)
  return values
}

export const bootstrapDirectJourneyIdModels = inventory([
  'QualityJourneyOwnedBrowser', 'QualityJourneyCoordinatorSession',
  'QualityJourneyWorkAttemptSessionBinding', 'QualityJourneyCoordinatorHandoff',
  'QualityJourneyArtifact', 'QualityJourneyAnalysisRevision', 'QualityJourneyAnalysisQuestion',
  'QualityJourneyAnalysisAnswer', 'QualityJourneyAnalysisPublication', 'QualityJourneyAnalysisDecision',
  'QualityJourneyDiscoveryRevision', 'QualityJourneyScenarioPortfolioRevision',
  'QualityJourneyPreparedRuntimeCapsule', 'QualityJourneyAutomationMaterialization',
  'QualityJourneyAutomationTargetBinding', 'QualityJourneyAutomationRequestReceipt',
  'QualityJourneyScenarioDecisionReceipt', 'QualityJourneyRevision', 'QualityJourneyCycle',
  'QualityJourneyExecutionCycle', 'QualityJourneyExecutionConsent',
  'QualityJourneyExecutionCancellationReceipt', 'QualityJourneyExecutionRerunProposal',
  'QualityJourneyCommand', 'QualityJourneyEvent', 'QualityJourneyWorkItem',
  'QualityJourneyWorkAuthorization', 'QualityJourneyExternalWorkClaimReceipt',
  'QualityJourneyExternalSubmissionAcceptance', 'QualityJourneyBlocker', 'QualityJourneyArtifactLink',
  'QualityJourneyTriageAssignment', 'QualityJourneyTriageReport', 'QualityJourneyReportReview',
  'QualityJourneyClosure', 'QualityJourneyProviderRun', 'QualityJourneySharedResourceUse',
  'QualityJourneySharedResourceClaim', 'QualityJourneyLocatorEnsureReceipt',
  'QualityJourneyE2CampaignPolicy', 'QualityJourneyE2OperationPreparation', 'QualityJourneyE2Retirement',
  'QualityJourneyE2ActorCustody', 'QualityJourneyE2Grant', 'QualityJourneyWakeIntent',
  'StepDefinitionSearchReceipt', 'StepDefinitionTelemetryEvent',
] as const)

export const bootstrapDirectTargetProjectIdModels = inventory([
  'QualityJourney', 'QualityJourneyOwnedBrowser', 'QualityJourneyCoordinatorSession',
  'QualityJourneyWorkAttemptSessionBinding', 'QualityJourneyCoordinatorHandoff', 'QualityJourneyArtifact',
  'QualityJourneyAnalysisRevision', 'QualityJourneyDiscoveryRevision',
  'QualityJourneyScenarioPortfolioRevision', 'QualityJourneyPreparedRuntimeCapsule',
  'QualityJourneyAutomationMaterialization', 'QualityJourneyAutomationTargetBinding',
  'QualityJourneyExecutionCycle', 'QualityJourneyExecutionConsent', 'QualityJourneyExecutionRerunProposal',
  'QualityJourneyCommand', 'QualityJourneyEvent', 'QualityJourneyWorkItem', 'QualityJourneyWorkAuthorization',
  'QualityJourneyExternalWorkClaimReceipt', 'QualityJourneyExternalSubmissionAcceptance',
  'QualityJourneyBlocker', 'QualityJourneyArtifactLink', 'QualityJourneyProviderRun',
  'QualityJourneySharedResourceUse', 'QualityJourneySharedResourceClaim', 'QualityJourneyLocatorEnsureReceipt',
  'QualityJourneyE2CampaignPolicy', 'QualityJourneyE2OperationPreparation', 'QualityJourneyE2Retirement',
  'QualityJourneyE2ActorCustody', 'QualityJourneyE2Grant', 'QualityJourneyWakeIntent',
  'Module', 'LocatorGroup', 'Locator', 'TestSuite', 'TestCase',
  'QualityJourneySharedResourceCoverage', 'QualityJourneySharedResourceGuard', 'QualityJourneyDraft',
  'TemplateTestCase', 'AgentPreflightReceipt', 'ProjectResourceOwnership', 'RuntimeCapsule',
  'RuntimeCapsuleBlob', 'RuntimeCapsuleLease', 'CollaborationBinding', 'Environment', 'Tag',
  'TestRun', 'Report', 'TestCaseMetrics', 'TestSuiteMetrics', 'DashboardMetrics',
] as const)

export const bootstrapIndirectJourneyModels = inventory([
  'QualityJourneyScenarioRevision', 'QualityJourneyScenarioDecision', 'QualityJourneyScenarioReviewComment',
  'QualityJourneyAutomationMaterializationSourceProof', 'QualityJourneyAutomationMaterializationBinding',
  'QualityJourneyExecutionTestRun', 'QualityJourneyExecutionEvidenceReceipt', 'QualityJourneyWorkAttempt',
  'QualityJourneyProviderDispatchIntent', 'QualityJourneyProviderSlot', 'QualityJourneyProviderObservation',
  'QualityJourneyProviderSourceState', 'QualityJourneyProviderSourceLedgerRecord',
] as const)

export const sharedResourceBootstrapInventoryCounts = Object.freeze({
  directJourneyId: bootstrapDirectJourneyIdModels.length,
  directTargetProjectId: bootstrapDirectTargetProjectIdModels.length,
  indirectJourney: bootstrapIndirectJourneyModels.length,
}) satisfies Readonly<{ directJourneyId: 47; directTargetProjectId: 55; indirectJourney: 13 }>

const bootstrapRelationshipModels = inventory([
  'TargetProject', 'QualityJourneyDraftReuseAnnotation', 'QualityJourneyReuseSeed',
  'ProjectResourceImport', 'Review', 'LinkedJiraTicket', 'ReportTestCase', 'TestRunTestCase',
  'ConflictResolution', 'CollaborationEntityMap', 'TestCaseStep', 'TestCaseStepParameter',
  'TestCaseFlowBlock', 'TestCaseFlowBlockNode', 'TemplateTestCaseStep',
  'TemplateTestCaseStepParameter', 'TemplateTestCaseFlowBlock', 'TemplateTestCaseFlowBlockNode',
] as const)
export type BootstrapModel = (typeof bootstrapDirectJourneyIdModels)[number]
  | (typeof bootstrapDirectTargetProjectIdModels)[number]
  | (typeof bootstrapIndirectJourneyModels)[number]
  | (typeof bootstrapRelationshipModels)[number]

/** Required finite query/extractor contracts; implementations and source closure are deliberately unavailable here. */
export const bootstrapQueryIds = inventory([
  'Q1_GLOBAL_JOURNEY_IDENTITIES', 'Q1_GLOBAL_DIRECT_JOURNEY_ROWS', 'Q1_SELECTED_JOURNEY_ZERO',
  'Q2_SELECTED_DIRECT_TARGET_ROWS', 'Q2_ALL_SELECTED_COVERAGE_IDENTITIES',
  'Q2_ALL_SELECTED_GUARD_IDENTITIES', 'Q2_GLOBAL_DRAFT_JOURNEY_POINTERS',
  'Q3_GLOBAL_INDIRECT_JOURNEY_ROWS', 'Q3_DRAFT_ADVISORY_ENDPOINTS', 'Q3_NONROOT_SCOPE_ENDPOINTS',
  'Q4_HISTORICAL_SOURCE_REFERENCES', 'Q5_COMPLETE_RESOURCE_DESCRIPTORS',
  'Q5_UNFILTERED_INCOMING_EDGES', 'Q5_COMPLETE_RETAINED_GUARDS',
] as const)
export const bootstrapExtractorIds = inventory([
  'ENSURE', 'RESOURCE_RESOLUTION', 'AUTOMATION_MATERIALIZATION', 'EXECUTION_CYCLE',
  'JOURNEY_POINTER_ARRAYS', 'ARTIFACT_AND_ARTIFACT_LINK', 'ANALYSIS_ENVELOPES',
  'SCENARIO_PORTFOLIO_AND_REVISION', 'WORK_ITEM_AUTHORIZATION_AND_ATTEMPT',
  'COMMAND_EVENT_CYCLE_BLOCKER', 'EXTERNAL_SUBMISSION_TRIAGE_AND_CLOSURE',
  'RESOURCE_DESCRIPTOR_AND_REVERSE_EDGES', 'TYPED_AUTHORED_HISTORY_SCOPE',
  'PROVIDER_LINEAGE_METADATA_ONLY', 'INDEPENDENT_SEARCH_CORRELATION_EXCEPTION',
  'OPAQUE_TELEMETRY_CORRELATION_EXCEPTION', 'ADVISORY_DRAFT_REUSE_EXCEPTION',
] as const)
export const bootstrapZeroPredicateIds = inventory([
  'SELECTED_JOURNEY_ROOTS', 'SELECTED_DIRECT_JOURNEY_ROWS', 'SELECTED_INDIRECT_JOURNEY_ROWS',
  'SELECTED_JOURNEY_SOURCE_EDGES', 'GLOBAL_UNATTRIBUTABLE_JOURNEY_ROWS',
  'ILLEGAL_CROSS_TARGET_EDGES', 'UNSUPPORTED_REFERENCE_CONTRACTS',
  'COVERAGE_IDENTITY_SET_DIFFERENCE', 'LIVE_RESOURCE_GUARD_SET_DIFFERENCE',
] as const)
const bootstrapClassifications = inventory([
  'JOURNEY_ROOT', 'JOURNEY_OWNED', 'RESOURCE_ROOT', 'COVERAGE_METADATA', 'GUARD_METADATA',
  'INDEPENDENT_AUTHORED', 'INDEPENDENT_HISTORY', 'ADVISORY', 'OPAQUE_CORRELATION_EXCEPTION',
] as const)
const bootstrapEdgeClassifications = inventory([
  'JOURNEY_LINEAGE', 'SOURCE_REFERENCE', 'RESOURCE_DEPENDENCY', 'HISTORY_SCOPE',
  'INSPECTION_ONLY', 'ADVISORY',
] as const)
const bootstrapRefusalReasons = inventory([
  'TRUSTED_CANONICAL_CLOSURE_ISSUER_UNAVAILABLE', 'REFUSED_UNQUALIFIED_COVERAGE_ISSUER',
  'ALREADY_CLASSIFIED_NO_BOOTSTRAP_TRANSITION', 'MIGRATION_INITIALIZATION_INCOMPLETE',
  'BOOTSTRAP_INVENTORY', 'BOOTSTRAP_SHAPE', 'BOOTSTRAP_IDENTITY', 'BOOTSTRAP_DIGEST',
  'BOOTSTRAP_COUNT', 'BOOTSTRAP_DUPLICATE', 'BOOTSTRAP_BOUNDS', 'BOOTSTRAP_DATE',
  'BOOTSTRAP_EPOCH_VECTOR', 'BOOTSTRAP_ZERO_PREDICATE', 'BOOTSTRAP_UNSUPPORTED_REFERENCE',
  'BOOTSTRAP_UNATTRIBUTABLE_JOURNEY', 'BOOTSTRAP_SELECTED_JOURNEY', 'BOOTSTRAP_CROSS_TARGET_EDGE',
  'BOOTSTRAP_COVERAGE_STATE', 'BOOTSTRAP_GUARD_STATE', 'BOOTSTRAP_CAS_LOST',
] as const)
type BootstrapRefusalReason = (typeof bootstrapRefusalReasons)[number]
const refuse = (reason: BootstrapRefusalReason): never => { throw new SharedResourceContractError(reason) }
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const models = new Set<string>([
  ...bootstrapDirectJourneyIdModels, ...bootstrapDirectTargetProjectIdModels,
  ...bootstrapIndirectJourneyModels, ...bootstrapRelationshipModels,
])

export function assertBootstrapInventory(input: Readonly<{
  directJourneyIdModels: readonly string[];
  directTargetProjectIdModels: readonly string[];
  indirectJourneyModels: readonly string[];
}>): void {
  exact(input, ['directJourneyIdModels', 'directTargetProjectIdModels', 'indirectJourneyModels'])
  for (const [actual, expected] of [
    [input.directJourneyIdModels, bootstrapDirectJourneyIdModels],
    [input.directTargetProjectIdModels, bootstrapDirectTargetProjectIdModels],
    [input.indirectJourneyModels, bootstrapIndirectJourneyModels],
  ] as const) {
    bounded(actual, 55)
    if (!Array.isArray(actual) || actual.length !== expected.length || new Set(actual).size !== actual.length ||
      actual.some(model => !(expected as readonly string[]).includes(model))) refuse('BOOTSTRAP_INVENTORY')
  }
}

function exact(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length || keys.some(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return !descriptor || !('value' in descriptor) || !descriptor.enumerable
    })) refuse('BOOTSTRAP_SHAPE')
}
function id(value: unknown): asserts value is string {
  if (!isSharedResourceId(value)) refuse('BOOTSTRAP_IDENTITY')
}
function digest(value: unknown): asserts value is string {
  if (!isSharedResourceDigest(value)) refuse('BOOTSTRAP_DIGEST')
}
function count(value: number, maximum: number = sharedResourceBootstrapBounds.examinedRecords): void {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > maximum) refuse('BOOTSTRAP_COUNT')
}
function bounded<T>(items: readonly T[], maximum: number = sharedResourceBootstrapBounds.examinedRecords): void {
  if (!Array.isArray(items) || items.length > maximum) refuse('BOOTSTRAP_BOUNDS')
  if (Reflect.ownKeys(items).length !== items.length + 1) refuse('BOOTSTRAP_SHAPE')
  for (let index = 0; index < items.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(items, String(index))
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) refuse('BOOTSTRAP_SHAPE')
  }
}
function member(value: unknown, choices: readonly string[]): void {
  if (typeof value !== 'string' || !choices.includes(value)) refuse('BOOTSTRAP_INVENTORY')
}
function distinct<T>(items: readonly T[], key: (item: T) => string): void {
  if (new Set(items.map(key)).size !== items.length) refuse('BOOTSTRAP_DUPLICATE')
}

export type BootstrapPrimaryKey = readonly Readonly<{ field: string; value: string | number }>[]
export type BootstrapIdentity = Readonly<{ model: BootstrapModel; key: BootstrapPrimaryKey }>
export type BootstrapRowSummary = Readonly<{ key: BootstrapPrimaryKey; projectionDigest: string }>
export type BootstrapModelSummary = Readonly<{
  model: BootstrapModel; classification: (typeof bootstrapClassifications)[number];
  rowCount: number; rowsDigest: string;
}>
export type BootstrapEdgeSummary = Readonly<{
  sourceKind: SharedResourceSourceKind | null; source: BootstrapIdentity; field: string;
  destination: BootstrapIdentity | null; classification: (typeof bootstrapEdgeClassifications)[number];
  projectionDigest: string;
}>
export type BootstrapResourceSummary = Readonly<{
  kind: SharedResourceKind; resourceId: string; dependencyDigest: string;
}>
export type BootstrapGuardSummary = Readonly<{
  kind: SharedResourceKind; resourceId: string; epoch: number;
  coverageState: 'UNKNOWN' | 'COMPLETE_V1'; coverageDigest: string | null;
  resourceState: 'LIVE' | 'DELETED'; createdAt: string; deletedAt: string | null;
}>
export type BootstrapDomainEpoch = Readonly<{ kind: SharedResourceKind; epoch: number }>
export type BootstrapZeroPredicateSummary = Readonly<{
  predicateId: (typeof bootstrapZeroPredicateIds)[number]; count: 0; projectionDigest: string;
}>

function keyFields(model: BootstrapModel): readonly string[] {
  switch (model) {
    case 'QualityJourneyWorkAttemptSessionBinding': return ['attemptId']
    case 'QualityJourneyAutomationMaterializationSourceProof':
    case 'QualityJourneyAutomationMaterializationBinding': return ['materializationId']
    case 'QualityJourneyProviderSourceState': return ['sourceId']
    case 'QualityJourneyProviderSourceLedgerRecord': return ['sourceId', 'sequence']
    case 'QualityJourneySharedResourceCoverage': return ['targetProjectId', 'kind', 'protocolVersion']
    case 'QualityJourneySharedResourceGuard': return ['targetProjectId', 'kind', 'resourceId']
    default: return ['id']
  }
}
function checkedKey(model: BootstrapModel, key: BootstrapPrimaryKey): BootstrapPrimaryKey {
  if (!models.has(model) || !Array.isArray(key)) return refuse('BOOTSTRAP_IDENTITY')
  bounded(key, 3)
  const fields = keyFields(model)
  if (key.length !== fields.length) return refuse('BOOTSTRAP_IDENTITY')
  return key.map((part, index) => {
    exact(part, ['field', 'value'])
    if (part.field !== fields[index]) return refuse('BOOTSTRAP_IDENTITY')
    if (part.field === 'sequence') count(part.value as number, Number.MAX_SAFE_INTEGER)
    else if (part.field === 'protocolVersion') {
      // Unsupported retained protocol identities must be representable in census metadata, never filtered away.
      count(part.value as number, Number.MAX_SAFE_INTEGER)
    } else id(part.value)
    return { field: part.field, value: part.value }
  })
}
function identity(value: BootstrapIdentity): BootstrapIdentity {
  exact(value, ['model', 'key'])
  return { model: value.model, key: checkedKey(value.model, value.key) }
}
function compareKeys(a: BootstrapPrimaryKey, b: BootstrapPrimaryKey): number {
  for (let index = 0; index < a.length; index++) {
    const left = a[index].value
    const right = b[index].value
    const order = typeof left === 'number' && typeof right === 'number'
      ? left - right : compare(String(left), String(right))
    if (order) return order
  }
  return 0
}
function timestamp(value: string): void {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) refuse('BOOTSTRAP_DATE')
}

export function bootstrapRowsDigest(model: BootstrapModel, rows: readonly BootstrapRowSummary[]): string {
  if (!models.has(model)) return refuse('BOOTSTRAP_IDENTITY')
  bounded(rows)
  const ordered = rows.map(row => {
    exact(row, ['key', 'projectionDigest'])
    digest(row.projectionDigest)
    return { key: checkedKey(model, row.key), projectionDigest: row.projectionDigest }
  }).sort((a, b) => compareKeys(a.key, b.key))
  distinct(ordered, row => canonicalSharedResourceJson(row.key))
  return sharedResourceDigest('M06_SHARED_BOOTSTRAP_ROWS_V1', { model, rows: ordered })
}

export function orderBootstrapModelSummaries(values: readonly BootstrapModelSummary[]): BootstrapModelSummary[] {
  bounded(values)
  let total = 0
  const ordered = values.map(value => {
    exact(value, ['model', 'classification', 'rowCount', 'rowsDigest'])
    if (!models.has(value.model)) refuse('BOOTSTRAP_IDENTITY')
    member(value.classification, bootstrapClassifications)
    count(value.rowCount)
    count(total += value.rowCount)
    digest(value.rowsDigest)
    return { ...value }
  }).sort((a, b) => compare(a.model, b.model))
  distinct(ordered, value => value.model)
  return ordered
}
export function orderBootstrapEdges(values: readonly BootstrapEdgeSummary[]): BootstrapEdgeSummary[] {
  bounded(values)
  const ordered = values.map(value => {
    exact(value, ['sourceKind', 'source', 'field', 'destination', 'classification', 'projectionDigest'])
    if (value.sourceKind !== null) member(value.sourceKind, sharedResourceSourceKinds)
    id(value.field)
    member(value.classification, bootstrapEdgeClassifications)
    digest(value.projectionDigest)
    return { ...value, source: identity(value.source),
      destination: value.destination === null ? null : identity(value.destination) }
  }).sort((a, b) => compare(a.sourceKind ?? '', b.sourceKind ?? '') || compare(a.source.model, b.source.model) ||
    compareKeys(a.source.key, b.source.key) || compare(a.field, b.field) ||
    compare(a.destination?.model ?? '', b.destination?.model ?? '') ||
    (a.destination && b.destination ? compareKeys(a.destination.key, b.destination.key) : 0))
  distinct(ordered, value => canonicalSharedResourceJson({
    sourceKind: value.sourceKind, source: value.source, field: value.field, destination: value.destination,
  }))
  return ordered
}
function resourceOrder<T extends Readonly<{ kind: SharedResourceKind; resourceId: string }>>(values: T[]): T[] {
  values.sort((a, b) => compare(a.kind, b.kind) || compare(a.resourceId, b.resourceId))
  distinct(values, value => canonicalSharedResourceJson([value.kind, value.resourceId]))
  return values
}
export function bootstrapResourceSetDigest(values: readonly BootstrapResourceSummary[]): string {
  bounded(values, sharedResourceBootstrapBounds.resourceKeys)
  const ordered = resourceOrder(values.map(value => {
    exact(value, ['kind', 'resourceId', 'dependencyDigest'])
    member(value.kind, sharedResourceKinds)
    id(value.resourceId)
    digest(value.dependencyDigest)
    return { ...value }
  }))
  return sharedResourceDigest('M06_SHARED_BOOTSTRAP_RESOURCE_SET_V1', ordered)
}
export function bootstrapGuardSetBeforeDigest(values: readonly BootstrapGuardSummary[]): string {
  bounded(values, sharedResourceBootstrapBounds.resourceKeys)
  const ordered = resourceOrder(values.map(value => {
    exact(value, ['kind', 'resourceId', 'epoch', 'coverageState', 'coverageDigest', 'resourceState', 'createdAt', 'deletedAt'])
    member(value.kind, sharedResourceKinds)
    id(value.resourceId)
    nextSharedResourceEpoch(value.epoch)
    member(value.coverageState, ['UNKNOWN', 'COMPLETE_V1'])
    member(value.resourceState, ['LIVE', 'DELETED'])
    if (value.coverageState === 'UNKNOWN') {
      if (value.coverageDigest !== null) refuse('BOOTSTRAP_GUARD_STATE')
    } else digest(value.coverageDigest)
    timestamp(value.createdAt)
    if (value.deletedAt !== null) timestamp(value.deletedAt)
    if ((value.resourceState === 'LIVE') !== (value.deletedAt === null)) refuse('BOOTSTRAP_GUARD_STATE')
    return { ...value }
  }))
  return sharedResourceDigest('M06_SHARED_BOOTSTRAP_GUARD_SET_V1', ordered)
}
export function orderBootstrapDomainEpochs(values: readonly BootstrapDomainEpoch[]): BootstrapDomainEpoch[] {
  if (!Array.isArray(values) || values.length !== 5) return refuse('BOOTSTRAP_EPOCH_VECTOR')
  bounded(values, 5)
  const ordered = values.map(value => {
    exact(value, ['kind', 'epoch'])
    member(value.kind, sharedResourceBootstrapDomainOrder)
    count(value.epoch, 2_147_483_646)
    return { ...value }
  }).sort((a, b) => compare(a.kind, b.kind))
  if (ordered.some((value, index) => value.kind !== sharedResourceBootstrapDomainOrder[index]))
    refuse('BOOTSTRAP_EPOCH_VECTOR')
  return ordered
}
function zeroPredicates(values: readonly BootstrapZeroPredicateSummary[]): BootstrapZeroPredicateSummary[] {
  if (!Array.isArray(values) || values.length !== bootstrapZeroPredicateIds.length)
    return refuse('BOOTSTRAP_ZERO_PREDICATE')
  bounded(values, bootstrapZeroPredicateIds.length)
  const ordered = values.map(value => {
    exact(value, ['predicateId', 'count', 'projectionDigest'])
    member(value.predicateId, bootstrapZeroPredicateIds)
    if (value.count !== 0) refuse('BOOTSTRAP_ZERO_PREDICATE')
    digest(value.projectionDigest)
    return { ...value }
  }).sort((a, b) => compare(a.predicateId, b.predicateId))
  distinct(ordered, value => value.predicateId)
  return ordered
}

export type BootstrapSourceUniverseInput = Readonly<{
  protocolVersion: 1; proofKind: 'JOURNEY_FREE_V1'; targetProjectId: string;
  sourceBuildDigest: string; schemaDigest: string; queryInventoryDigest: string; parserInventoryDigest: string;
  censusSchemaDigest: string; sourceCensusDigest: string; sourceModelSummaries: readonly BootstrapModelSummary[];
  typedEdgeSummaries: readonly BootstrapEdgeSummary[]; selectedResourceSetDigest: string;
  selectedDescriptorDigest: string; zeroPredicateSummaries: readonly BootstrapZeroPredicateSummary[];
}>
/** Hashes supplied metadata; a matching result proves neither source closure nor historical absence. */
export function bootstrapSourceUniverseDigest(value: BootstrapSourceUniverseInput): string {
  exact(value, ['protocolVersion', 'proofKind', 'targetProjectId', 'sourceBuildDigest', 'schemaDigest',
    'queryInventoryDigest', 'parserInventoryDigest', 'censusSchemaDigest', 'sourceCensusDigest',
    'sourceModelSummaries', 'typedEdgeSummaries', 'selectedResourceSetDigest', 'selectedDescriptorDigest',
    'zeroPredicateSummaries'])
  if (value.protocolVersion !== 1 || value.proofKind !== 'JOURNEY_FREE_V1') refuse('BOOTSTRAP_SHAPE')
  id(value.targetProjectId)
  for (const field of ['sourceBuildDigest', 'schemaDigest', 'queryInventoryDigest', 'parserInventoryDigest',
    'censusSchemaDigest', 'sourceCensusDigest', 'selectedResourceSetDigest', 'selectedDescriptorDigest'] as const)
    digest(value[field])
  return sharedResourceDigest('M06_SHARED_SOURCE_UNIVERSE_V1', {
    ...value, sourceModelSummaries: orderBootstrapModelSummaries(value.sourceModelSummaries),
    typedEdgeSummaries: orderBootstrapEdges(value.typedEdgeSummaries),
    zeroPredicateSummaries: zeroPredicates(value.zeroPredicateSummaries),
  })
}
export type BootstrapProofInput = Readonly<{
  protocolVersion: 1; proofKind: 'JOURNEY_FREE_V1'; targetProjectId: string;
  writerClosureDigest: string; readerClosureDigest: string; sourceUniverseDigest: string;
  sourceBuildDigest: string; queryInventoryDigest: string; parserInventoryDigest: string;
  domainEpochVectorBefore: readonly BootstrapDomainEpoch[]; domainEpochVectorAfter: readonly BootstrapDomainEpoch[];
  selectedGuardSetBeforeDigest: string; completedAt: string;
}>
export function bootstrapReconciliationDigest(value: BootstrapProofInput): string {
  exact(value, ['protocolVersion', 'proofKind', 'targetProjectId', 'writerClosureDigest', 'readerClosureDigest',
    'sourceUniverseDigest', 'sourceBuildDigest', 'queryInventoryDigest', 'parserInventoryDigest',
    'domainEpochVectorBefore', 'domainEpochVectorAfter', 'selectedGuardSetBeforeDigest', 'completedAt'])
  if (value.protocolVersion !== 1 || value.proofKind !== 'JOURNEY_FREE_V1') refuse('BOOTSTRAP_SHAPE')
  id(value.targetProjectId)
  for (const field of ['writerClosureDigest', 'readerClosureDigest', 'sourceUniverseDigest', 'sourceBuildDigest',
    'queryInventoryDigest', 'parserInventoryDigest', 'selectedGuardSetBeforeDigest'] as const) digest(value[field])
  timestamp(value.completedAt)
  const before = orderBootstrapDomainEpochs(value.domainEpochVectorBefore)
  const after = orderBootstrapDomainEpochs(value.domainEpochVectorAfter)
  if (before.some((entry, index) => nextSharedResourceEpoch(entry.epoch) !== after[index].epoch))
    refuse('BOOTSTRAP_EPOCH_VECTOR')
  return sharedResourceDigest('M06_SHARED_JOURNEY_FREE_PROOF_V1', {
    ...value, domainEpochVectorBefore: before, domainEpochVectorAfter: after,
  })
}
export type BootstrapGuardProofInput = Readonly<{
  protocolVersion: 1; targetProjectId: string; kind: SharedResourceKind; resourceId: string;
  sourceUniverseDigest: string; reconciliationDigest: string; dependencyDigest: string;
}>
export function bootstrapGuardCoverageDigest(value: BootstrapGuardProofInput): string {
  exact(value, ['protocolVersion', 'targetProjectId', 'kind', 'resourceId', 'sourceUniverseDigest',
    'reconciliationDigest', 'dependencyDigest'])
  if (value.protocolVersion !== 1) refuse('BOOTSTRAP_SHAPE')
  id(value.targetProjectId)
  id(value.resourceId)
  member(value.kind, sharedResourceKinds)
  digest(value.sourceUniverseDigest)
  digest(value.reconciliationDigest)
  digest(value.dependencyDigest)
  return sharedResourceDigest('M06_SHARED_JOURNEY_FREE_GUARD_V1', value)
}
