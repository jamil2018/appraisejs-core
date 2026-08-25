import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'
import { validationArtifactSchema, type ValidationArtifact } from '@/lib/quality-design/validation-artifact-contract'
import {
  validateValidationAstRuntimeInput,
  validationAstPublishOperationIdFromReceiptHash,
  type ValidationAstRuntimeInput,
} from '@/lib/quality-design/validation-runtime-input-contract'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { ServiceError } from '@/services/shared/errors'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'

export type RuntimePublicationEnvelope = {
  idempotencyKey: string
  projection: unknown
  validationProjection: unknown
  runtimeInput: Record<string, unknown>
  reviewContent?: string
  extensionReviews: Array<{
    extensionId: string
    version: string
    sourceHash: string
    compiledHash: string
    artifactHash: string
    artifactJson: string
  }>
}

type RuntimeProjection = { gherkin?: unknown; validationNode?: Record<string, unknown> }
type ValidationRuntimeProjection = { gherkin?: unknown; validations?: Array<Record<string, unknown>> }
export type ProjectedInvocation = { caseId?: string; stepId?: string; invocation?: unknown }

const canonicalOperationByReference = new Map(
  defaultOperationDefinitions.map(operation => [`${operation.id}@${operation.version}`, operation]),
)

function objectRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function requiredRuntimeInput(record: Record<string, unknown>) {
  const runtimeInput = objectRecord(record.runtimeInput)
  if (!runtimeInput) throw new ServiceError('Quality runtime publication envelope is incomplete.', 'VALIDATION')
  return runtimeInput
}

function runtimePublicationEnvelope(realization: unknown): RuntimePublicationEnvelope {
  const outer = objectRecord(realization)
  const record = objectRecord(outer?.runtimePublication ?? outer)
  if (!record)
    throw new ServiceError(
      'Quality validation publication requires a sealed runtime publication envelope.',
      'VALIDATION',
    )
  if (
    !nonEmptyString(record.idempotencyKey) ||
    record.projection === undefined ||
    record.validationProjection === undefined
  )
    throw new ServiceError('Quality runtime publication envelope is incomplete.', 'VALIDATION')
  return {
    idempotencyKey: record.idempotencyKey,
    projection: record.projection,
    validationProjection: record.validationProjection,
    runtimeInput: requiredRuntimeInput(record),
    reviewContent: typeof record.reviewContent === 'string' ? record.reviewContent : undefined,
    extensionReviews: Array.isArray(record.extensionReviews)
      ? (record.extensionReviews as RuntimePublicationEnvelope['extensionReviews'])
      : [],
  }
}

function normalizeScenarioDocument(document: unknown) {
  if (typeof document !== 'string') return document
  const lines = document.replaceAll('\r\n', '\n').trim().split('\n')
  const scenarioIndex = lines.findIndex(line => /^\s*Scenario: /.test(line))
  if (scenarioIndex < 0) return document
  const steps = lines
    .slice(scenarioIndex + 1)
    .filter(line => /^\s+(?:Given|When|Then|And) /.test(line))
    .map(line => `  ${line.trimStart()}`)
  return [lines[scenarioIndex]!.trimStart(), ...steps].join('\n')
}

function normalizeGherkinDocuments(value: unknown) {
  const documents = typeof value === 'string' ? [value] : value
  return Array.isArray(documents) ? documents.map(normalizeScenarioDocument) : documents
}

/**
 * Produce the executable logical-node representation before either the
 * command projection or validation artifact is persisted.  Prisma ownership
 * columns (for example LocatorGroup.targetProjectId) are deliberately not in
 * this contract: ownership was already enforced by the target-scoped reader,
 * while the published node describes only executable content.
 */
function canonicalLogicalValidationNode(value: unknown) {
  return validationArtifactSchema.parse({ validations: [value] }).validations[0]!
}

function runtimeProjectionNodes(
  projection: RuntimeProjection,
  validationProjection: ValidationRuntimeProjection,
  astId: string,
) {
  const projectionNode = projection.validationNode && canonicalLogicalValidationNode(projection.validationNode)
  const canonicalValidation = validationArtifactSchema.parse(validationProjection) as ValidationRuntimeProjection
  const validationNode = canonicalValidation.validations?.find(node => node.id === astId)
  if (!projectionNode || !validationNode)
    throw new ServiceError('Quality runtime realization does not contain its validation node.', 'VALIDATION')
  // The two fields are separate durable receipts, but they must carry the
  // exact same logical node. Canonicalize them before provenance is added and
  // before either representation is serialized.
  projection.validationNode = projectionNode
  validationProjection.validations = canonicalValidation.validations
  return { projectionNode, validationNode }
}

function projectedRootInvocations(projectionNode: Record<string, unknown>): ProjectedInvocation[] {
  const artifacts = projectionNode.appraiseArtifacts as
    { testCases?: Array<{ id?: string; steps?: Array<{ id?: string; invocation?: unknown }> }> } | undefined
  const invocations = (artifacts?.testCases ?? []).flatMap(testCase =>
    (testCase.steps ?? []).map(step => ({ caseId: testCase.id, stepId: step.id, invocation: step.invocation })),
  )
  if (invocations.some(item => !item.caseId || !item.stepId || !item.invocation))
    throw new ServiceError('Quality runtime realization has incomplete projected Step Invocations.', 'VALIDATION')
  return invocations
}

/** The compiler closure is keyed by immutable Step Definition identity. Exact
 * repetitions collapse, while two hashes for one id@version are a conflict. */
export function canonicalStepDefinitionClosure(rootInvocations: ProjectedInvocation[]) {
  const definitions = new Map<string, ReturnType<typeof stepInvocationSchema.parse>['step']>()
  for (const item of rootInvocations) {
    const invocation = stepInvocationSchema.parse(item.invocation)
    const step = invocation.step
    const identity = `${step.id}@${step.version}`
    const existing = definitions.get(identity)
    if (existing && existing.definitionHash !== step.definitionHash)
      throw new ServiceError(
        'Quality runtime realization has conflicting exact Step Definition references.',
        'CONFLICT',
        409,
        {
          code: 'conflicting_step_definition_reference',
          stepId: step.id,
          version: step.version,
        },
      )
    definitions.set(identity, step)
  }
  return [...definitions.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, step]) => step)
}

/**
 * Hooks deliberately start every managed scenario with a new about:blank
 * page.  Keep the navigation precondition here, before any immutable
 * publication or run can be created, using canonical operation semantics
 * rather than author-facing wording or a list of Step Definition IDs.
 */
function assertScenarioPageContext(rootInvocations: ProjectedInvocation[]) {
  const establishedCases = new Set<string>()
  for (const item of rootInvocations) {
    const invocation = stepInvocationSchema.parse(item.invocation)
    const caseId = item.caseId
    const stepId = item.stepId
    if (!caseId || !stepId) continue
    const operation = canonicalOperationByReference.get(`${invocation.step.id}@${invocation.step.version}`)
    if (!operation) continue
    if (operation.pageContext === 'establishes') {
      establishedCases.add(caseId)
      continue
    }
    // Locator consumption and assertion categories are the catalog's stable
    // page-dependent semantics. Other browser utilities (for example random
    // data generation) remain valid before navigation.
    const requiresPageContext =
      operation.pageContext === 'requires' ||
      (operation.runtime === 'browser' &&
        (operation.inputs.some(input => input.type === 'locator') ||
          operation.categories.some(category => category.includes('assertion')) ||
          operation.capabilities.some(capability => capability.includes('assertion'))))
    if (requiresPageContext && !establishedCases.has(caseId))
      throw new ServiceError(
        'Each browser scenario must navigate before its first page-dependent interaction or assertion.',
        'VALIDATION',
        400,
        {
          code: 'scenario_page_context_required',
          targetOutcome: 'not_evaluated',
          caseId,
          stepId,
          operation: `${operation.id}@${operation.version}`,
        },
      )
  }
}

function normalizeCompilerReceipt(runtimeInput: Record<string, unknown>) {
  const receipt = runtimeInput.compilerReceipt as Record<string, unknown>
  if (!receipt) return
  const receiptContent = { ...receipt }
  delete receiptContent.contentHash
  runtimeInput.compilerReceipt = { ...receiptContent, contentHash: hashCanonical(receiptContent) }
}

function normalizeExtensionPolicy(runtimeInput: Record<string, unknown>) {
  const policy = runtimeInput.extensionPolicy as {
    projectId?: string
    projectFingerprint?: string
    capabilityImports?: Record<string, string[]>
  }
  if (!policy?.projectId || !policy.projectFingerprint) return
  runtimeInput.extensionPolicy = createCustomExtensionPolicy({
    projectId: policy.projectId,
    projectFingerprint: policy.projectFingerprint,
    capabilityImports: policy.capabilityImports ?? {},
  })
}

/**
 * Compact preflight intent excludes command and review receipts only. The
 * complete realization remains integrity-bound, including review content.
 */
export function generationIntentProjection(realization: unknown) {
  type IntentEnvelope = {
    idempotencyKey?: string
    reviewContent?: string
    extensionReviews?: unknown
    projection?: { validationNode?: { astProvenance?: unknown } }
    validationProjection?: { validations?: Array<{ astProvenance?: unknown }> }
  }
  const source = structuredClone(realization) as IntentEnvelope & {
    runtimePublication?: IntentEnvelope
  }
  // Canonical persisted generations contain the envelope itself, while fresh
  // compiler callers hold the outer realization wrapper. Normalize both to
  // one projection before omitting the non-intent receipts.
  const envelope = source.runtimePublication ?? source
  const value = source.runtimePublication ? source : { runtimePublication: envelope }
  delete envelope.idempotencyKey
  delete envelope.reviewContent
  delete envelope.extensionReviews
  delete envelope.projection?.validationNode?.astProvenance
  for (const node of envelope.validationProjection?.validations ?? []) delete node.astProvenance
  return value
}

export type CanonicalQualityRealization = {
  envelope: RuntimePublicationEnvelope
  realization: { runtimePublication: RuntimePublicationEnvelope }
  validation: ValidationArtifact
  runtimeInput: ValidationAstRuntimeInput
  integrityHash: string
  intentHash: string
}

/**
 * The sole compiler-owned realization boundary. Every caller receives the
 * same canonical closure, provenance, artifact parse, runtime validation and
 * integrity/intent hashes from the same bytes.
 */
export function canonicalizeAndValidateQualityRealization(input: {
  realization: unknown
  target: { id: string; fingerprint: string }
}): CanonicalQualityRealization {
  const raw = runtimePublicationEnvelope(input.realization)
  const projection = structuredClone(raw.projection) as RuntimeProjection
  const validationProjection = structuredClone(raw.validationProjection) as ValidationRuntimeProjection
  projection.gherkin = normalizeGherkinDocuments(projection.gherkin)
  validationProjection.gherkin = normalizeGherkinDocuments(validationProjection.gherkin)
  const runtimeInput = structuredClone(raw.runtimeInput)
  const { projectionNode, validationNode } = runtimeProjectionNodes(
    projection,
    validationProjection,
    String(runtimeInput.astId ?? ''),
  )
  const rootInvocations = projectedRootInvocations(projectionNode)
  assertScenarioPageContext(rootInvocations)
  runtimeInput.rootInvocations = rootInvocations
  runtimeInput.stepDefinitions = canonicalStepDefinitionClosure(rootInvocations)
  normalizeCompilerReceipt(runtimeInput)
  normalizeExtensionPolicy(runtimeInput)
  runtimeInput.gherkinHash = hashCanonical(projection.gherkin)
  const runtimeInputHash = hashCanonical(runtimeInput)
  const astHash = String(runtimeInput.astHash ?? '')
  const receiptHash = String(runtimeInput.receiptHash ?? '')
  const provenance = {
    schemaVersion: '2' as const,
    astHash,
    executionAuthority: 'reviewed_publication' as const,
    publishOperationId: validationAstPublishOperationIdFromReceiptHash(receiptHash),
    receiptHash,
    runtimeInputHash,
  }
  projectionNode.astProvenance = provenance
  validationNode.astProvenance = provenance
  if (canonicalContractJson(validationNode) !== canonicalContractJson(projectionNode))
    throw new ServiceError('Quality runtime realization artifact does not match its projection.', 'VALIDATION')
  const envelope: RuntimePublicationEnvelope = {
    ...raw,
    projection,
    validationProjection,
    runtimeInput,
  }
  const validation = validationArtifactSchema.parse(envelope.validationProjection) as ValidationArtifact
  const artifactNode = validation.validations.find(node => node.id === runtimeInput.astId)
  if (!artifactNode)
    throw new ServiceError('Quality runtime realization artifact does not match its projection.', 'VALIDATION')
  const runtimeInputJson = canonicalContractJson(runtimeInput)
  const validatedRuntimeInput = validateValidationAstRuntimeInput({
    operation: {
      id: provenance.publishOperationId,
      targetProjectId: input.target.id,
      targetFingerprint: input.target.fingerprint,
      astId: runtimeInput.astId,
      astHash: runtimeInput.astHash,
      contextHash: runtimeInput.contextHash,
      previewHash: runtimeInput.previewHash,
      receiptHash: runtimeInput.receiptHash,
      runtimeInputHash,
      runtimeInputJson,
    },
    projectionJson: canonicalContractJson(projection),
    extensionReviews: envelope.extensionReviews,
  })
  const realization = { runtimePublication: envelope }
  return {
    envelope,
    realization,
    validation,
    runtimeInput: validatedRuntimeInput,
    integrityHash: hashCanonical(realization),
    intentHash: hashCanonical(generationIntentProjection(realization)),
  }
}
