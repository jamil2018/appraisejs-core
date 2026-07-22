import { randomUUID } from 'node:crypto'

import type { PrismaClient, StepDefinitionStatus, StepExecutionKind } from '@prisma/client'
import {
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  stepDefinitionContentHash,
  stepDefinitionDraftAuthoringSchema,
  stepDefinitionSchema,
  stepPublicationReceiptSchema,
  type StepDefinition,
  type StepPublicationReceipt,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

class StepDefinitionRegistryError extends Error {
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

function executionKind(kind: Exclude<StepDefinition['execution']['kind'], 'unbound'>): StepExecutionKind {
  return kind === 'reviewed-extension' ? 'reviewed_extension' : kind
}

function persistedStatus(status: 'ready' | 'deprecated'): StepDefinitionStatus {
  return status
}

export class StepDefinitionRegistryService {
  constructor(private readonly database: PrismaClient) {}

  async registerBuiltIn(definition: StepDefinition, conformanceRunId: string) {
    const ready = stepDefinitionSchema.parse(definition)
    if (ready.identity.status !== 'ready' || ready.provenance.creationMethod !== 'built-in-source')
      throw new StepDefinitionRegistryError(
        'invalid_transition',
        'Built-in registration requires a source-owned ready Step Definition.',
      )
    const hashes = computeStepDefinitionHashes(ready)
    const existing = await this.database.stepDefinition.findUnique({
      where: { id_version: { id: ready.identity.id, version: ready.identity.version } },
      include: { publicationReceipt: true },
    })
    if (existing) {
      if (
        existing.definitionHash !== hashes.definitionHash ||
        existing.humanProjectionHash !== hashes.humanProjectionHash ||
        existing.agentContractHash !== hashes.agentContractHash ||
        existing.executionHash !== hashes.executionHash
      )
        throw new StepDefinitionRegistryError(
          'immutable_definition',
          `Built-in ${ready.identity.id}@${ready.identity.version} changed without a new version.`,
        )
      return stepPublicationReceiptSchema.parse(JSON.parse(existing.publicationReceipt!.receiptJson))
    }

    const { reviewedBy, ...draftProvenance } = ready.provenance
    const draft = await this.createDraft({
      ...ready,
      identity: { ...ready.identity, status: 'draft' },
      provenance: draftProvenance,
    })
    await this.submitForReview(draft.id, draft.revision, reviewedBy!)
    return this.publishDraft({ draftId: draft.id, expectedRevision: draft.revision, conformanceRunId })
  }

  async createDraft(definition: unknown) {
    const parsed = stepDefinitionDraftAuthoringSchema.parse(definition)

    const draftHash = stepDefinitionContentHash(parsed)
    return this.database.stepDefinitionDraft.create({
      data: {
        id: randomUUID(),
        proposedStepId: parsed.identity.id,
        proposedVersion: parsed.identity.version,
        draftJson: canonicalStepDefinitionJson(parsed),
        draftHash,
      },
    })
  }

  async readDraft(draftId: string) {
    const draft = await this.database.stepDefinitionDraft.findUnique({ where: { id: draftId } })
    if (!draft)
      throw new StepDefinitionRegistryError('draft_not_found', `Step Definition draft ${draftId} was not found.`)
    return { ...draft, definition: parseDraftJson(draft.draftJson) }
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

  async submitForReview(draftId: string, expectedRevision: number, reviewAuthority: string) {
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

    return this.database.stepDefinitionDraft.update({
      where: { id: draftId },
      data: { reviewedDraftHash: draft.draftHash, reviewedBy: reviewAuthority, reviewedAt: new Date() },
    })
  }

  async publishDraft(input: { draftId: string; expectedRevision: number; conformanceRunId: string }) {
    return this.database.$transaction(async transaction => {
      const draft = await transaction.stepDefinitionDraft.findUnique({ where: { id: input.draftId } })
      if (!draft)
        throw new StepDefinitionRegistryError(
          'draft_not_found',
          `Step Definition draft ${input.draftId} was not found.`,
        )
      if (draft.revision !== input.expectedRevision)
        throw new StepDefinitionRegistryError(
          'stale_revision',
          `Step Definition draft ${input.draftId} revision is stale.`,
        )
      if (!draft.reviewedBy || !draft.reviewedDraftHash)
        throw new StepDefinitionRegistryError('review_required', 'Exact human review is required before publication.')
      if (draft.reviewedDraftHash !== draft.draftHash)
        throw new StepDefinitionRegistryError('review_stale', 'The reviewed draft hash no longer matches the draft.')

      const authored = stepDefinitionDraftAuthoringSchema.parse(parseDraftJson(draft.draftJson))
      const definition = stepDefinitionSchema.parse({
        ...authored,
        identity: { ...authored.identity, status: 'ready' },
        provenance: { ...authored.provenance, reviewedBy: draft.reviewedBy },
      })
      if (definition.execution.kind === 'unbound')
        throw new StepDefinitionRegistryError(
          'validation_failed',
          'An execution binding is required before publication.',
        )

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
        conformanceRunId: input.conformanceRunId,
        reviewAuthority: draft.reviewedBy,
        publishedAt,
      })
      const receiptJson = canonicalStepDefinitionJson(receipt)

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
              conformanceRunId: input.conformanceRunId,
              reviewAuthority: draft.reviewedBy,
              publishedAt: new Date(publishedAt),
            },
          },
        },
      })
      await transaction.stepDefinitionDraft.delete({ where: { id: input.draftId } })
      return receipt
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

  async list(input: { status?: 'ready' | 'deprecated'; query?: string; limit?: number; cursor?: string } = {}) {
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
    return this.database.stepDefinition.findMany({
      where: {
        status: input.status ? persistedStatus(input.status) : undefined,
        OR: input.query
          ? [
              { id: { contains: input.query } },
              { title: { contains: input.query } },
              { description: { contains: input.query } },
            ]
          : undefined,
      },
      orderBy: [{ id: 'asc' }, { version: 'asc' }],
      take: limit,
      ...(input.cursor
        ? { skip: 1, cursor: { id_version: { id: input.cursor.split('@')[0]!, version: input.cursor.split('@')[1]! } } }
        : {}),
      include: { humanProjection: true, executionBinding: true, publicationReceipt: true },
    })
  }

  async deprecate(input: {
    stepId: string
    version: string
    reason: string
    actor: string
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
