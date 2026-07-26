import { randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient, StepDefinitionStatus, StepExecutionKind } from '@prisma/client'
import { z } from 'zod'
import {
  canonicalStepDefinitionJson,
  computeStepExecutableReadiness,
  computeStepDefinitionHashes,
  stepDefinitionContentHash,
  stepDefinitionDraftAuthoringSchema,
  stepDefinitionSchema,
  stepPublicationReceiptSchema,
  builtInStepDefinitions,
  validateStepDefinitionComposition,
  type StepDefinition,
  type StepPublicationReceipt,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { browserOperationHandlerDescriptors } from '../../../packages/cucumber-runtime/src/operations/index.ts'
import operationDefinitions from '../../../packages/cucumber-runtime/src/operations/definitions.json' with { type: 'json' }
import { StepDefinitionExtensionService } from './step-definition-extension-service'
import { recordStepDefinitionTelemetry } from './step-definition-telemetry'
import {
  readyStepDefinitionRowsForSearch,
  readyStepDefinitionSearchIndexHash,
} from './ready-step-definition-search-index'

const LOCAL_HUMAN_REVIEW_AUTHORITY = 'local-human-ui'
const SOURCE_REVIEW_AUTHORITY = 'appraise:source-review'
const reuseEvidenceSchema = z.object({
  indexHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  searchedAt: z.string().datetime(),
  planId: z.string().min(1).max(200).optional(),
  correlationId: z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/),
  candidateReferences: z
    .array(z.object({ id: z.string().min(1).max(200), version: z.string().min(1).max(40) }))
    .max(25),
  receiptId: z.string().uuid(),
  reuseJustification: z.string().trim().min(1).max(2_000),
})
const draftListProjectionSchema = z.object({
  intent: z.object({ title: z.string().optional() }),
  provenance: z.object({ creationMethod: z.string() }),
})

export class StepDefinitionRegistryError extends Error {
  constructor(
    public readonly code:
      | 'draft_not_found'
      | 'definition_not_found'
      | 'stale_revision'
      | 'validation_failed'
      | 'review_required'
      | 'review_stale'
      | 'immutable_definition'
      | 'invalid_transition',
    message: string,
    public readonly details: unknown = null,
  ) {
    super(message)
    this.name = 'StepDefinitionRegistryError'
  }
}

export type StepDefinitionValidationReport = {
  valid: boolean
  draftHash: string
  blockers: Array<{ path: string; message: string }>
}

export type StepDefinitionPreview = {
  step: { id: string; version: string }
  draftHash: string
  hashes: ReturnType<typeof computeStepDefinitionHashes>
  human: StepDefinition['human']
  agent: StepDefinition['agent']
  execution: StepDefinition['execution']
}

function parseDraftJson(value: string): unknown {
  return JSON.parse(value)
}

function reviewReceipt(draft: { id: string; revision: number; draftHash: string }, authority: string) {
  const receipt = {
    kind: 'step-definition-human-review' as const,
    draftId: draft.id,
    revision: draft.revision,
    draftHash: draft.draftHash,
    authority,
  }
  return { receipt, hash: stepDefinitionContentHash(receipt) }
}

function executionKind(kind: Exclude<StepDefinition['execution']['kind'], 'unbound'>): StepExecutionKind {
  return kind === 'reviewed-extension' ? 'reviewed_extension' : kind
}

function trustedOperationConformance(definition: StepDefinition) {
  if (definition.execution.kind !== 'operation') return null
  if (definition.execution.runtime !== 'browser')
    throw new StepDefinitionRegistryError(
      'validation_failed',
      `Step Definition operations require a supported browser runtime, not ${definition.execution.runtime}.`,
    )
  const { handlerId, handlerVersion } = definition.execution
  const ref = `${handlerId}@${handlerVersion}`
  const handler = browserOperationHandlerDescriptors[ref]
  if (!handler)
    throw new StepDefinitionRegistryError(
      'validation_failed',
      `Trusted operation handler ${ref} is not registered for publication.`,
    )
  const operation = operationDefinitions.find(
    candidate => candidate.handler?.id === handlerId && candidate.handler?.version === handlerVersion,
  )
  if (!operation)
    throw new StepDefinitionRegistryError(
      'validation_failed',
      `Trusted operation handler ${ref} has no canonical executable contract.`,
    )
  const canonicalInputs = (
    inputs: Array<{ name: string; type: string; required: boolean; defaultValue?: unknown; constraints?: unknown }>,
  ) =>
    canonicalStepDefinitionJson(
      inputs.map(input => ({
        name: input.name,
        type: input.type,
        required: input.required,
        defaultValue: input.defaultValue,
        constraints: input.constraints
          ? {
              minimum: (input.constraints as { minimum?: unknown }).minimum,
              maximum: (input.constraints as { maximum?: unknown }).maximum,
              pattern: (input.constraints as { pattern?: unknown }).pattern,
              values: (input.constraints as { values?: unknown }).values,
            }
          : undefined,
      })),
    )
  const canonicalOutputs = (outputs: Array<{ name: string; type: string }>) =>
    canonicalStepDefinitionJson(outputs.map(output => ({ name: output.name, type: output.type })))
  if (
    canonicalInputs(definition.inputs) !== canonicalInputs(operation.inputs) ||
    canonicalOutputs(definition.outputs) !== canonicalOutputs(operation.outputs)
  )
    throw new StepDefinitionRegistryError(
      'validation_failed',
      `Step Definition input/output contract does not match trusted operation handler ${ref}.`,
    )
  return stepDefinitionContentHash({ kind: 'trusted-browser-handler', ref, contentHash: handler.contentHash })
}

function publicationConformanceEvidence(definition: StepDefinition, draft: DraftWithArtifact) {
  const trustedHandler = trustedOperationConformance(definition)
  if (trustedHandler) return trustedHandler
  if (definition.execution.kind === 'reviewed-extension') {
    const artifact = requireReviewableArtifact(draft.artifact)
    assertArtifactConformance(artifact)
    return artifact.conformanceHash
  }
  if (definition.execution.kind === 'composition')
    return stepDefinitionContentHash({
      kind: 'composition-closure',
      steps: definition.execution.steps.map(item => item.step),
    })
  throw new StepDefinitionRegistryError('validation_failed', 'An executable binding is required before publication.')
}

function persistedStatus(status: 'ready' | 'deprecated'): StepDefinitionStatus {
  return status
}

type DraftArtifact = NonNullable<Awaited<ReturnType<PrismaClient['stepDefinitionDraftArtifact']['findUnique']>>>

function requireReviewableArtifact(
  artifact: DraftArtifact | null,
): DraftArtifact & { compiledSource: string; compiledHash: string; conformanceHash: string } {
  if (!artifact?.compiledSource || !artifact.compiledHash || !artifact.conformanceHash)
    throw new StepDefinitionRegistryError(
      'validation_failed',
      'The reviewed extension must compile and pass conformance before review.',
    )
  return artifact as DraftArtifact & { compiledSource: string; compiledHash: string; conformanceHash: string }
}

function assertArtifactConformance(artifact: DraftArtifact) {
  const conformance = JSON.parse(artifact.conformanceJson ?? '{}') as { passed?: boolean }
  if (!conformance.passed)
    throw new StepDefinitionRegistryError('validation_failed', 'The reviewed extension has conformance blockers.')
}

function assertArtifactBinding(definition: StepDefinition, artifact: DraftArtifact) {
  if (definition.execution.kind !== 'reviewed-extension') return
  if (
    definition.execution.sourceHash !== artifact.sourceHash ||
    definition.execution.compiledHash !== artifact.compiledHash
  )
    throw new StepDefinitionRegistryError(
      'review_stale',
      'The execution binding hashes do not match the compiled reviewed extension.',
    )
}

async function bindReviewedArtifactForReview(database: PrismaClient, draftId: string, definition: StepDefinition) {
  if (definition.execution.kind !== 'reviewed-extension') return
  const artifact = requireReviewableArtifact(
    await database.stepDefinitionDraftArtifact.findUnique({ where: { draftId } }),
  )
  assertArtifactConformance(artifact)
  assertArtifactBinding(definition, artifact)
  const reviewedArtifactHash = StepDefinitionExtensionService.artifactHash({
    sourceHash: artifact.sourceHash,
    compiledHash: artifact.compiledHash,
    conformanceHash: artifact.conformanceHash,
    manifestJson: artifact.manifestJson,
  })
  await database.stepDefinitionDraftArtifact.update({ where: { draftId }, data: { reviewedArtifactHash } })
}

type DraftWithArtifact = Prisma.StepDefinitionDraftGetPayload<{ include: { artifact: true } }>
type PersistedDefinition = Awaited<ReturnType<PrismaClient['stepDefinition']['findUnique']>>
type DraftDefinition = z.infer<typeof stepDefinitionDraftAuthoringSchema>
type ReuseEvidence = z.infer<typeof reuseEvidenceSchema>
type CreateDraftOptions = { sourceRegistration?: boolean; reuseEvidence?: unknown }
type PublishDraftInput = { draftId: string; expectedRevision: number; conformanceRunId?: string }
type SearchReceipt = NonNullable<Awaited<ReturnType<PrismaClient['stepDefinitionSearchReceipt']['findUnique']>>>
type ReviewedExtensionArtifact = NonNullable<DraftWithArtifact['artifact']>
type PublishedReviewedExtensionArtifact = ReviewedExtensionArtifact & {
  compiledSource: string
  compiledHash: string
  conformanceJson: string
  conformanceHash: string
  reviewedArtifactHash: string
}
type ReviewedExtensionExecution = Extract<StepDefinition['execution'], { kind: 'reviewed-extension' }>

function assertBuiltInRegistration(definition: StepDefinition) {
  if (definition.identity.status !== 'ready' || definition.provenance.creationMethod !== 'built-in-source')
    throw new StepDefinitionRegistryError(
      'invalid_transition',
      'Built-in registration requires a source-owned ready Step Definition.',
    )
}

function assertBuiltInDefinitionIsUnchanged(
  existing: {
    definitionHash: string
    humanProjectionHash: string | null
    agentContractHash: string | null
    executionHash: string | null
  },
  definition: StepDefinition,
  hashes: ReturnType<typeof computeStepDefinitionHashes>,
) {
  if (
    existing.definitionHash !== hashes.definitionHash ||
    existing.humanProjectionHash !== hashes.humanProjectionHash ||
    existing.agentContractHash !== hashes.agentContractHash ||
    existing.executionHash !== hashes.executionHash
  )
    throw new StepDefinitionRegistryError(
      'immutable_definition',
      `Built-in ${definition.identity.id}@${definition.identity.version} changed without a new version.`,
    )
}

function parsePublicationReceipt(receiptJson: string): StepPublicationReceipt | null {
  const parsed = stepPublicationReceiptSchema.safeParse(JSON.parse(receiptJson))
  return parsed.success ? parsed.data : null
}

function upgradedPublicationReceipt(
  definition: StepDefinition,
  hashes: ReturnType<typeof computeStepDefinitionHashes>,
  receipt: {
    registryManifestHash: string
    conformanceRunId: string
    reviewAuthority: string
    publishedAt: Date
  },
) {
  return stepPublicationReceiptSchema.parse({
    step: definition.identity,
    ...hashes,
    registryManifestHash: receipt.registryManifestHash,
    executableReadiness: computeStepExecutableReadiness(
      definition,
      receipt.registryManifestHash,
      receipt.conformanceRunId,
    ),
    conformanceRunId: receipt.conformanceRunId,
    reviewAuthority: receipt.reviewAuthority,
    publishedAt: receipt.publishedAt.toISOString(),
  })
}

function assertDraftCreationIsAllowed(definition: DraftDefinition, options: CreateDraftOptions) {
  if (definition.provenance.creationMethod === 'built-in-source' && !options.sourceRegistration)
    throw new StepDefinitionRegistryError(
      'invalid_transition',
      'Built-in Step Definitions may only be registered by the source-owned synchronization path.',
    )
  if (builtInStepDefinitions.some(item => item.identity.id === definition.identity.id) && !options.sourceRegistration)
    throw new StepDefinitionRegistryError(
      'invalid_transition',
      `Step Definition ID ${definition.identity.id} is reserved for source-owned registration.`,
    )
}

function parseReuseEvidence(definition: DraftDefinition, candidate: unknown): ReuseEvidence | undefined {
  return definition.provenance.creationMethod === 'agent-command' ? reuseEvidenceSchema.parse(candidate) : undefined
}

function assertReuseEvidenceIsFresh(reuseEvidence: ReuseEvidence | undefined) {
  if (!reuseEvidence) return
  const searchedAt = Date.parse(reuseEvidence.searchedAt)
  if (searchedAt > Date.now())
    throw new StepDefinitionRegistryError('validation_failed', 'Agent draft reuse evidence timestamp is in the future.')
  if (Date.now() - searchedAt > 30 * 60 * 1000)
    throw new StepDefinitionRegistryError(
      'validation_failed',
      'Agent draft reuse evidence is older than 30 minutes; search the ready registry again.',
    )
}

function requirePublishedReviewedArtifact(artifact: DraftWithArtifact['artifact']): PublishedReviewedExtensionArtifact {
  if (
    !artifact?.compiledSource ||
    !artifact.compiledHash ||
    !artifact.conformanceJson ||
    !artifact.conformanceHash ||
    !artifact.reviewedArtifactHash
  )
    throw new StepDefinitionRegistryError('review_required', 'The reviewed extension artifact is incomplete.')
  return artifact as PublishedReviewedExtensionArtifact
}

function reviewedExtensionArtifactHash(artifact: PublishedReviewedExtensionArtifact) {
  return StepDefinitionExtensionService.artifactHash({
    sourceHash: artifact.sourceHash,
    compiledHash: artifact.compiledHash,
    conformanceHash: artifact.conformanceHash,
    manifestJson: artifact.manifestJson,
  })
}

function assertReviewedArtifactIsCurrent(artifact: PublishedReviewedExtensionArtifact, artifactHash: string) {
  if (artifactHash !== artifact.reviewedArtifactHash)
    throw new StepDefinitionRegistryError('review_stale', 'The reviewed extension artifact changed after review.')
}

async function assertReviewedExtensionIsActive(
  transaction: Prisma.TransactionClient,
  execution: ReviewedExtensionExecution,
) {
  const prior = await transaction.stepReviewedExtension.findUnique({
    where: { id_version: { id: execution.extensionId, version: execution.extensionVersion } },
  })
  if (prior?.revokedAt)
    throw new StepDefinitionRegistryError(
      'validation_failed',
      'A revoked reviewed extension cannot be bound to a newly published Step Definition.',
    )
}

function parsePersistedDefinition(row: NonNullable<PersistedDefinition>): StepDefinition {
  const authored = parseDraftJson(row.definitionJson) as StepDefinition
  const parsed = stepDefinitionSchema.parse({
    ...authored,
    identity: { ...authored.identity, status: 'ready' },
  })
  return { ...parsed, identity: { ...parsed.identity, status: row.status } }
}

async function loadCompositionClosure(transaction: Prisma.TransactionClient, definition: StepDefinition) {
  if (definition.execution.kind !== 'composition') return []
  const closure: Array<{ definition: StepDefinition; status: 'ready' | 'deprecated' }> = []
  const pending = [...definition.execution.steps.map(entry => entry.step)].sort((left, right) =>
    `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`),
  )
  const visited = new Set<string>()
  while (pending.length > 0) {
    const identity = pending.shift()!
    const key = `${identity.id}@${identity.version}`
    if (visited.has(key)) continue
    visited.add(key)
    const row = await transaction.stepDefinition.findUnique({
      where: { id_version: { id: identity.id, version: identity.version } },
    })
    if (!row) continue
    const child = parsePersistedDefinition(row)
    closure.push({ definition: child, status: row.status })
    if (child.execution.kind === 'composition') pending.push(...child.execution.steps.map(entry => entry.step))
  }
  return closure
}

async function publishReviewedExtension(
  transaction: Prisma.TransactionClient,
  draft: DraftWithArtifact,
  definition: StepDefinition,
) {
  if (definition.execution.kind !== 'reviewed-extension') return
  const artifact = requirePublishedReviewedArtifact(draft.artifact)
  const artifactHash = reviewedExtensionArtifactHash(artifact)
  assertReviewedArtifactIsCurrent(artifact, artifactHash)
  await assertReviewedExtensionIsActive(transaction, definition.execution)
  await transaction.stepReviewedExtension.create({
    data: {
      id: definition.execution.extensionId,
      version: definition.execution.extensionVersion,
      exportName: definition.execution.exportName,
      runtime: definition.execution.runtime,
      capabilitiesJson: canonicalStepDefinitionJson(definition.intent.capabilities),
      contractSource: artifact.contractSource,
      source: artifact.handlerSource,
      compiledSource: artifact.compiledSource,
      sourceHash: artifact.sourceHash,
      compiledHash: artifact.compiledHash,
      conformanceJson: artifact.conformanceJson,
      conformanceHash: artifact.conformanceHash,
      artifactHash,
      reviewedBy: draft.reviewedBy!,
    },
  })
}

export class StepDefinitionRegistryService {
  constructor(private readonly database: PrismaClient) {}

  async registerBuiltIn(definition: StepDefinition, conformanceRunId: string) {
    const ready = stepDefinitionSchema.parse(definition)
    assertBuiltInRegistration(ready)
    const hashes = computeStepDefinitionHashes(ready)
    const existing = await this.database.stepDefinition.findUnique({
      where: { id_version: { id: ready.identity.id, version: ready.identity.version } },
      include: { publicationReceipt: true },
    })
    return existing
      ? this.reconcileBuiltInRegistration(existing, ready, hashes)
      : this.createBuiltInRegistration(ready, conformanceRunId)
  }

  private async reconcileBuiltInRegistration(
    existing: NonNullable<Awaited<ReturnType<PrismaClient['stepDefinition']['findUnique']>>> & {
      publicationReceipt: {
        receiptJson: string
        registryManifestHash: string
        conformanceRunId: string
        reviewAuthority: string
        publishedAt: Date
      } | null
    },
    definition: StepDefinition,
    hashes: ReturnType<typeof computeStepDefinitionHashes>,
  ) {
    assertBuiltInDefinitionIsUnchanged(existing, definition, hashes)
    const publicationReceipt = existing.publicationReceipt
    if (!publicationReceipt)
      throw new StepDefinitionRegistryError(
        'validation_failed',
        `Built-in ${definition.identity.id}@${definition.identity.version} is missing its publication receipt.`,
      )
    const persistedReceipt = parsePublicationReceipt(publicationReceipt.receiptJson)
    if (persistedReceipt) return persistedReceipt

    const upgradedReceipt = upgradedPublicationReceipt(definition, hashes, publicationReceipt)
    await this.database.stepPublicationReceipt.update({
      where: { stepId_stepVersion: { stepId: definition.identity.id, stepVersion: definition.identity.version } },
      data: {
        receiptJson: canonicalStepDefinitionJson(upgradedReceipt),
        receiptHash: stepDefinitionContentHash(upgradedReceipt),
      },
    })
    return upgradedReceipt
  }

  private async createBuiltInRegistration(definition: StepDefinition, conformanceRunId: string) {
    const { reviewedBy, ...draftProvenance } = definition.provenance
    void reviewedBy
    const draft = await this.createDraft(
      {
        ...definition,
        identity: { ...definition.identity, status: 'draft' },
        provenance: draftProvenance,
      },
      undefined,
      { sourceRegistration: true },
    )
    await this.issueReviewReceipt(draft.id, draft.revision, SOURCE_REVIEW_AUTHORITY)
    return this.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId })
  }

  async createDraft(definition: unknown, reuseJustification?: string, options: CreateDraftOptions = {}) {
    const parsed = stepDefinitionDraftAuthoringSchema.parse(definition)
    assertDraftCreationIsAllowed(parsed, options)
    const reuseEvidence = parseReuseEvidence(parsed, options.reuseEvidence)
    assertReuseEvidenceIsFresh(reuseEvidence)
    await this.assertReuseEvidenceIsCurrent(reuseEvidence)
    const created = await this.persistDraft(parsed, reuseJustification, reuseEvidence)
    await this.recordDraftCreation(parsed, reuseEvidence)
    return created
  }

  private async assertReuseEvidenceIsCurrent(reuseEvidence: ReuseEvidence | undefined) {
    if (!reuseEvidence) return
    const currentRows = await this.listAllReady()
    const currentIndexHash = readyStepDefinitionSearchIndexHash(currentRows)
    const receipt = await this.database.stepDefinitionSearchReceipt.findUnique({
      where: { id: reuseEvidence.receiptId },
    })
    const currentReferences = new Set(currentRows.map(item => `${item.id}@${item.version}`))
    this.assertSearchReceiptIsLive(receipt)
    this.assertReuseEvidenceMatchesReceipt(reuseEvidence, receipt, currentIndexHash)
    this.assertCandidateReferencesAreCurrent(reuseEvidence, currentReferences)
  }

  private assertSearchReceiptIsLive(receipt: SearchReceipt | null): asserts receipt is SearchReceipt {
    if (!receipt || receipt.expiresAt <= new Date()) this.throwInvalidReuseEvidence()
  }

  private assertReuseEvidenceMatchesReceipt(
    reuseEvidence: ReuseEvidence,
    receipt: SearchReceipt,
    currentIndexHash: string,
  ) {
    if (reuseEvidence.indexHash !== currentIndexHash) this.throwInvalidReuseEvidence()
    if (receipt.indexHash !== reuseEvidence.indexHash) this.throwInvalidReuseEvidence()
    if (receipt.correlationId !== reuseEvidence.correlationId) this.throwInvalidReuseEvidence()
    if (receipt.planId !== (reuseEvidence.planId ?? null)) this.throwInvalidReuseEvidence()
    if (receipt.candidateReferencesJson !== canonicalStepDefinitionJson(reuseEvidence.candidateReferences))
      this.throwInvalidReuseEvidence()
  }

  private assertCandidateReferencesAreCurrent(reuseEvidence: ReuseEvidence, currentReferences: Set<string>) {
    if (reuseEvidence.candidateReferences.some(item => !currentReferences.has(`${item.id}@${item.version}`)))
      this.throwInvalidReuseEvidence()
  }

  private throwInvalidReuseEvidence(): never {
    throw new StepDefinitionRegistryError(
      'validation_failed',
      'Agent draft reuse evidence is not bound to the current ready registry; search again before creating a draft.',
    )
  }

  private async persistDraft(
    definition: DraftDefinition,
    reuseJustification: string | undefined,
    reuseEvidence: ReuseEvidence | undefined,
  ) {
    return this.database.stepDefinitionDraft.create({
      data: {
        id: randomUUID(),
        proposedStepId: definition.identity.id,
        proposedVersion: definition.identity.version,
        draftJson: canonicalStepDefinitionJson(definition),
        draftHash: stepDefinitionContentHash(definition),
        reuseJustification: reuseEvidence?.reuseJustification ?? reuseJustification,
        reuseEvidenceJson: reuseEvidence ? canonicalStepDefinitionJson(reuseEvidence) : null,
      },
    })
  }

  private async recordDraftCreation(definition: DraftDefinition, reuseEvidence: ReuseEvidence | undefined) {
    const step = { id: definition.identity.id, version: definition.identity.version }
    await recordStepDefinitionTelemetry(this.database, {
      surface: definition.provenance.creationMethod === 'agent-command' ? 'agent' : 'human',
      outcome: 'draft_created',
      step,
      ...(reuseEvidence ? { correlationId: reuseEvidence.correlationId } : {}),
      ...(reuseEvidence?.planId ? { planId: reuseEvidence.planId } : {}),
      payload: {},
    })
    if (reuseEvidence)
      await recordStepDefinitionTelemetry(this.database, {
        surface: 'agent',
        outcome: 'selection_selected',
        step,
        correlationId: reuseEvidence.correlationId,
        ...(reuseEvidence.planId ? { planId: reuseEvidence.planId } : {}),
        payload: {},
      })
  }

  async readDraft(draftId: string) {
    const draft = await this.database.stepDefinitionDraft.findUnique({ where: { id: draftId } })
    if (!draft)
      throw new StepDefinitionRegistryError('draft_not_found', `Step Definition draft ${draftId} was not found.`)
    return { ...draft, definition: parseDraftJson(draft.draftJson) }
  }

  async listHumanDrafts() {
    const drafts = await this.database.stepDefinitionDraft.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })
    return drafts.flatMap(draft => {
      const projection = draftListProjectionSchema.safeParse(parseDraftJson(draft.draftJson))
      if (!projection.success || projection.data.provenance.creationMethod !== 'human-form') return []
      return [
        {
          id: draft.id,
          proposedStepId: draft.proposedStepId,
          proposedVersion: draft.proposedVersion,
          revision: draft.revision,
          title: projection.data.intent.title || draft.proposedStepId,
          updatedAt: draft.updatedAt.toISOString(),
        },
      ]
    })
  }

  async updateDraft(draftId: string, expectedRevision: number, definition: unknown) {
    const parsed = stepDefinitionDraftAuthoringSchema.parse(definition)

    const draftHash = stepDefinitionContentHash(parsed)
    const updated = await this.database.stepDefinitionDraft.updateMany({
      where: { id: draftId, revision: expectedRevision },
      data: {
        proposedStepId: parsed.identity.id,
        proposedVersion: parsed.identity.version,
        draftJson: canonicalStepDefinitionJson(parsed),
        draftHash,
        revision: { increment: 1 },
        validationReportJson: null,
        reviewedDraftHash: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReceiptJson: null,
        reviewReceiptHash: null,
      },
    })
    if (updated.count === 0) {
      const exists = await this.database.stepDefinitionDraft.findUnique({
        where: { id: draftId },
        select: { id: true },
      })
      throw new StepDefinitionRegistryError(
        exists ? 'stale_revision' : 'draft_not_found',
        exists
          ? `Step Definition draft ${draftId} revision is stale.`
          : `Step Definition draft ${draftId} was not found.`,
      )
    }
    await this.database.stepDefinitionDraftArtifact.updateMany({
      where: { draftId },
      data: {
        compiledSource: null,
        compiledHash: null,
        diagnosticsJson: null,
        conformanceJson: null,
        conformanceHash: null,
        reviewedArtifactHash: null,
      },
    })
    return this.readDraft(draftId)
  }

  async deleteDraft(draftId: string, expectedRevision: number) {
    const deleted = await this.database.stepDefinitionDraft.deleteMany({
      where: { id: draftId, revision: expectedRevision },
    })
    if (deleted.count === 0)
      throw new StepDefinitionRegistryError('stale_revision', `Step Definition draft ${draftId} was missing or stale.`)
  }

  async validateDraft(draftId: string): Promise<StepDefinitionValidationReport> {
    const draft = await this.readDraft(draftId)
    const draftDefinition = stepDefinitionDraftAuthoringSchema.parse(draft.definition)
    const reuseEvidence = draft.reuseEvidenceJson
      ? reuseEvidenceSchema.parse(JSON.parse(draft.reuseEvidenceJson))
      : null
    const result = stepDefinitionSchema.safeParse(draft.definition)
    const report: StepDefinitionValidationReport = {
      valid: result.success,
      draftHash: draft.draftHash,
      blockers: result.success
        ? []
        : result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
    }
    await this.database.stepDefinitionDraft.update({
      where: { id: draftId },
      data: { validationReportJson: canonicalStepDefinitionJson(report) },
    })
    await recordStepDefinitionTelemetry(this.database, {
      surface: draftDefinition.provenance.creationMethod === 'agent-command' ? 'agent' : 'human',
      outcome: result.success ? 'validation_passed' : 'validation_failed',
      step: { id: draftDefinition.identity.id, version: draftDefinition.identity.version },
      ...(reuseEvidence ? { correlationId: reuseEvidence.correlationId } : {}),
      ...(reuseEvidence?.planId ? { planId: reuseEvidence.planId } : {}),
      payload: result.success ? {} : { reason: 'runtime_readiness' },
    })
    return report
  }

  async previewDraft(draftId: string): Promise<StepDefinitionPreview> {
    const draft = await this.readDraft(draftId)
    const definition = stepDefinitionSchema.parse(draft.definition)
    return {
      step: { id: definition.identity.id, version: definition.identity.version },
      draftHash: draft.draftHash,
      hashes: computeStepDefinitionHashes(definition),
      human: definition.human,
      agent: definition.agent,
      execution: definition.execution,
    }
  }

  async issueHumanReviewReceipt(draftId: string, expectedRevision: number) {
    return this.issueReviewReceipt(draftId, expectedRevision, LOCAL_HUMAN_REVIEW_AUTHORITY)
  }

  private async issueReviewReceipt(draftId: string, expectedRevision: number, authority: string) {
    const draft = await this.readDraft(draftId)
    if (draft.revision !== expectedRevision)
      throw new StepDefinitionRegistryError('stale_revision', `Step Definition draft ${draftId} revision is stale.`)
    const report = await this.validateDraft(draftId)
    if (!report.valid)
      throw new StepDefinitionRegistryError(
        'validation_failed',
        'Step Definition draft has validation blockers.',
        report,
      )

    const definition = stepDefinitionSchema.parse(draft.definition)
    const reuseEvidence = draft.reuseEvidenceJson
      ? reuseEvidenceSchema.parse(JSON.parse(draft.reuseEvidenceJson))
      : null
    await bindReviewedArtifactForReview(this.database, draftId, definition)

    const receipt = reviewReceipt(draft, authority)
    const updated = await this.database.stepDefinitionDraft.update({
      where: { id: draftId },
      data: {
        reviewedDraftHash: draft.draftHash,
        reviewedBy: authority,
        reviewedAt: new Date(),
        reviewReceiptJson: canonicalStepDefinitionJson(receipt.receipt),
        reviewReceiptHash: receipt.hash,
      },
    })
    await recordStepDefinitionTelemetry(this.database, {
      surface: definition.provenance.creationMethod === 'agent-command' ? 'agent' : 'human',
      outcome: 'reviewed',
      step: { id: definition.identity.id, version: definition.identity.version },
      ...(reuseEvidence ? { correlationId: reuseEvidence.correlationId } : {}),
      ...(reuseEvidence?.planId ? { planId: reuseEvidence.planId } : {}),
      payload: {},
    })
    return updated
  }

  async publishDraft(input: PublishDraftInput) {
    return this.database.$transaction(transaction => this.publishDraftInTransaction(transaction, input))
  }

  private async publishDraftInTransaction(transaction: Prisma.TransactionClient, input: PublishDraftInput) {
    const draft = await this.loadPublishableDraft(transaction, input)
    const definition = this.definitionForPublication(draft)
    await this.assertCompositionCanPublish(transaction, definition)
    await publishReviewedExtension(transaction, draft, definition)
    const publication = await this.createPublicationReceipt(transaction, draft, definition)
    await this.persistPublishedDefinition(transaction, draft, definition, publication)
    await transaction.stepDefinitionDraft.delete({ where: { id: input.draftId } })
    await this.recordPublication(transaction, definition, draft.reuseEvidenceJson)
    return publication.receipt
  }

  private async loadPublishableDraft(transaction: Prisma.TransactionClient, input: PublishDraftInput) {
    const draft = await transaction.stepDefinitionDraft.findUnique({
      where: { id: input.draftId },
      include: { artifact: true },
    })
    if (!draft)
      throw new StepDefinitionRegistryError('draft_not_found', `Step Definition draft ${input.draftId} was not found.`)
    if (draft.revision !== input.expectedRevision)
      throw new StepDefinitionRegistryError(
        'stale_revision',
        `Step Definition draft ${input.draftId} revision is stale.`,
      )
    this.assertDraftReviewIsCurrent(draft)
    return draft
  }

  private assertDraftReviewIsCurrent(draft: DraftWithArtifact) {
    if (!draft.reviewedBy || !draft.reviewedDraftHash || !draft.reviewReceiptHash || !draft.reviewReceiptJson)
      throw new StepDefinitionRegistryError('review_required', 'Exact human review is required before publication.')
    if (draft.reviewedDraftHash !== draft.draftHash)
      throw new StepDefinitionRegistryError('review_stale', 'The reviewed draft hash no longer matches the draft.')
    const expectedReceipt = reviewReceipt(draft, draft.reviewedBy)
    if (
      draft.reviewReceiptHash !== expectedReceipt.hash ||
      draft.reviewReceiptJson !== canonicalStepDefinitionJson(expectedReceipt.receipt)
    )
      throw new StepDefinitionRegistryError('review_stale', 'The immutable review receipt no longer matches the draft.')
  }

  private definitionForPublication(draft: DraftWithArtifact) {
    const authored = stepDefinitionDraftAuthoringSchema.parse(parseDraftJson(draft.draftJson))
    const definition = stepDefinitionSchema.parse({
      ...authored,
      identity: { ...authored.identity, status: 'ready' },
      provenance: { ...authored.provenance, reviewedBy: draft.reviewedBy },
    })
    if (definition.execution.kind === 'unbound')
      throw new StepDefinitionRegistryError('validation_failed', 'An execution binding is required before publication.')
    return definition
  }

  private async assertCompositionCanPublish(transaction: Prisma.TransactionClient, definition: StepDefinition) {
    const diagnostics = validateStepDefinitionComposition(
      definition,
      await loadCompositionClosure(transaction, definition),
    )
    if (diagnostics.length > 0)
      throw new StepDefinitionRegistryError(
        'validation_failed',
        'Step Definition composition has publication blockers.',
        { diagnostics },
      )
  }

  private async createPublicationReceipt(
    transaction: Prisma.TransactionClient,
    draft: DraftWithArtifact,
    definition: StepDefinition,
  ) {
    // Publication derives immutable conformance evidence from the verified
    // binding. Callers may not select or attest a conformance run identity.
    const conformanceRunId = publicationConformanceEvidence(definition, draft)
    const hashes = computeStepDefinitionHashes(definition)
    const publishedAt = new Date().toISOString()
    const existingRefs = await transaction.stepDefinition.findMany({
      where: { status: 'ready' },
      select: { id: true, version: true, definitionHash: true },
      orderBy: [{ id: 'asc' }, { version: 'asc' }],
    })
    const registryManifestHash = stepDefinitionContentHash([
      ...existingRefs,
      { id: definition.identity.id, version: definition.identity.version, definitionHash: hashes.definitionHash },
    ])
    const receipt = stepPublicationReceiptSchema.parse({
      step: definition.identity,
      ...hashes,
      registryManifestHash,
      executableReadiness: computeStepExecutableReadiness(definition, registryManifestHash, conformanceRunId),
      conformanceRunId,
      reviewAuthority: draft.reviewedBy,
      publishedAt,
    })
    return {
      hashes,
      receipt,
      receiptJson: canonicalStepDefinitionJson(receipt),
      registryManifestHash,
      conformanceRunId,
      publishedAt,
    }
  }

  private async persistPublishedDefinition(
    transaction: Prisma.TransactionClient,
    draft: DraftWithArtifact,
    definition: StepDefinition,
    publication: Awaited<ReturnType<StepDefinitionRegistryService['createPublicationReceipt']>>,
  ) {
    const { hashes, receipt, receiptJson, registryManifestHash, conformanceRunId, publishedAt } = publication
    if (definition.execution.kind === 'unbound')
      throw new StepDefinitionRegistryError(
        'invalid_transition',
        'Ready Step Definitions require an executable binding.',
      )
    await transaction.stepDefinition.create({
      data: {
        id: definition.identity.id,
        version: definition.identity.version,
        status: persistedStatus('ready'),
        title: definition.intent.title,
        description: definition.intent.description,
        definitionJson: canonicalStepDefinitionJson(definition),
        ...hashes,
        provenanceJson: canonicalStepDefinitionJson(definition.provenance),
        publishedAt: new Date(publishedAt),
        humanProjection: {
          create: {
            signature: definition.human.signature,
            groupId: definition.human.groupId,
            projectionJson: canonicalStepDefinitionJson(definition.human),
            projectionHash: hashes.humanProjectionHash,
          },
        },
        executionBinding: {
          create: {
            kind: executionKind(definition.execution.kind),
            bindingJson: canonicalStepDefinitionJson(definition.execution),
            bindingHash: hashes.executionHash,
          },
        },
        publicationReceipt: {
          create: {
            receiptJson,
            receiptHash: stepDefinitionContentHash(receipt),
            registryManifestHash,
            conformanceRunId,
            reviewAuthority: draft.reviewedBy!,
            publishedAt: new Date(publishedAt),
          },
        },
      },
    })
  }

  private async recordPublication(
    transaction: Prisma.TransactionClient,
    definition: StepDefinition,
    reuseEvidenceJson: string | null,
  ) {
    const reuseEvidence = reuseEvidenceJson ? reuseEvidenceSchema.parse(JSON.parse(reuseEvidenceJson)) : null
    await recordStepDefinitionTelemetry(transaction, {
      surface: definition.provenance.creationMethod === 'agent-command' ? 'agent' : 'human',
      outcome: 'published',
      step: { id: definition.identity.id, version: definition.identity.version },
      ...(reuseEvidence ? { correlationId: reuseEvidence.correlationId } : {}),
      ...(reuseEvidence?.planId ? { planId: reuseEvidence.planId } : {}),
      payload: {},
    })
  }

  async read(stepId: string, version: string) {
    const definition = await this.database.stepDefinition.findUnique({
      where: { id_version: { id: stepId, version } },
      include: { humanProjection: true, executionBinding: true, publicationReceipt: true },
    })
    if (!definition)
      throw new StepDefinitionRegistryError(
        'definition_not_found',
        `Step Definition ${stepId}@${version} was not found.`,
      )
    return { ...definition, definition: stepDefinitionSchema.parse(JSON.parse(definition.definitionJson)) }
  }

  async createVersionDraft(input: { stepId: string; version: string; newVersion: string; createdBy: string }) {
    const current = await this.read(input.stepId, input.version)
    const definition = current.definition
    if (definition.provenance.creationMethod === 'built-in-source')
      throw new StepDefinitionRegistryError(
        'immutable_definition',
        `Source-owned Step Definition ${input.stepId}@${input.version} must be versioned by source registration.`,
      )
    return this.createDraft({
      ...definition,
      identity: { id: definition.identity.id, version: input.newVersion, status: 'draft' },
      provenance: {
        creationMethod: 'human-form',
        createdBy: input.createdBy,
        createdAt: new Date().toISOString(),
        sourceReference: `${input.stepId}@${input.version}`,
      },
      lifecycle: { ...definition.lifecycle, supersedes: { id: input.stepId, version: input.version } },
    })
  }

  async list(input: { status?: 'ready' | 'deprecated'; limit?: number; cursor?: string } = {}) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
    return this.database.stepDefinition.findMany({
      where: {
        status: input.status ? persistedStatus(input.status) : undefined,
      },
      orderBy: [{ id: 'asc' }, { version: 'asc' }],
      take: limit,
      ...(input.cursor
        ? { skip: 1, cursor: { id_version: { id: input.cursor.split('@')[0]!, version: input.cursor.split('@')[1]! } } }
        : {}),
      include: { humanProjection: true, executionBinding: true, publicationReceipt: true },
    })
  }

  async listAllReady() {
    const rows = []
    let cursor: string | undefined
    do {
      const page = await this.list({ status: 'ready', limit: 100, cursor })
      rows.push(...page)
      const last = page.at(-1)
      cursor = page.length === 100 && last ? `${last.id}@${last.version}` : undefined
    } while (cursor)
    return rows
  }

  async listReadyForSearch() {
    return readyStepDefinitionRowsForSearch(this.database)
  }

  async deprecateFromHumanUi(input: {
    stepId: string
    version: string
    reason: string
    replacement?: { id: string; version: string }
  }): Promise<StepPublicationReceipt> {
    return this.deprecateWithAuthority({ ...input, actor: LOCAL_HUMAN_REVIEW_AUTHORITY })
  }

  private async deprecateWithAuthority(input: {
    stepId: string
    version: string
    reason: string
    actor: typeof LOCAL_HUMAN_REVIEW_AUTHORITY | typeof SOURCE_REVIEW_AUTHORITY
    replacement?: { id: string; version: string }
  }): Promise<StepPublicationReceipt> {
    return this.database.$transaction(async transaction => {
      const current = await transaction.stepDefinition.findUnique({
        where: { id_version: { id: input.stepId, version: input.version } },
        include: { publicationReceipt: true },
      })
      if (!current)
        throw new StepDefinitionRegistryError(
          'definition_not_found',
          `Step Definition ${input.stepId}@${input.version} was not found.`,
        )
      if (current.status !== 'ready')
        throw new StepDefinitionRegistryError('invalid_transition', 'Only a ready definition can be deprecated.')
      if (input.replacement) {
        const replacement = await transaction.stepDefinition.findUnique({
          where: { id_version: input.replacement },
          select: { status: true },
        })
        if (replacement?.status !== 'ready')
          throw new StepDefinitionRegistryError(
            'invalid_transition',
            'A replacement must resolve to a ready definition.',
          )
      }

      await transaction.stepDefinition.update({
        where: { id_version: { id: input.stepId, version: input.version } },
        data: {
          status: persistedStatus('deprecated'),
          deprecatedAt: new Date(),
          deprecation: {
            create: {
              reason: input.reason,
              actor: input.actor,
              replacementStepId: input.replacement?.id,
              replacementVersion: input.replacement?.version,
            },
          },
        },
      })
      return stepPublicationReceiptSchema.parse(JSON.parse(current.publicationReceipt!.receiptJson))
    })
  }
}
