'use server'

import prisma from '@/config/db-config'
import { ServiceError, serviceErrorToActionResponse, unknownErrorToActionResponse } from '@/services/shared/errors'
import {
  StepDefinitionRegistryError,
  StepDefinitionRegistryService,
} from '@/services/step-definition/step-definition-registry-service'
import { StepDefinitionExtensionService } from '@/services/step-definition/step-definition-extension-service'
import { coordinatorStepDefinitionService } from '@/services/coordinator/coordinator-step-definition-service'
import type { ActionResponse } from '@/types/form/actionHandler'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  computeStepReferenceHash,
  stepDefinitionSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import type { StepDefinitionDraftSummary, StepDefinitionOption } from '@/types/step-definition-option'

const draftIdSchema = z.string().uuid()
const revisionSchema = z.number().int().positive()
const stepIdentitySchema = z.object({ stepId: z.string().min(1), version: z.string().min(1) })
const readyDefinitionSearchSchema = z.string().trim().min(1).max(200)
const readyStepReferenceSchema = z.object({ id: z.string().min(1).max(200), version: z.string().min(1).max(40) })
const exactStepReferenceSchema = readyStepReferenceSchema.extend({
  definitionHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
})
const deprecationReasonSchema = z.string().trim().min(1).max(1_000)
const registry = new StepDefinitionRegistryService(prisma)
const extensions = new StepDefinitionExtensionService(prisma)

function validationError(error: z.ZodError): ActionResponse {
  return {
    status: 400,
    success: false,
    error: 'Invalid Step Definition request.',
    details: { issues: error.issues },
  }
}

function registryError(error: StepDefinitionRegistryError): ActionResponse {
  const status =
    error.code === 'draft_not_found' || error.code === 'definition_not_found'
      ? 404
      : error.code === 'stale_revision' || error.code === 'review_stale' || error.code === 'immutable_definition'
        ? 409
        : 400
  return {
    status,
    success: false,
    error: error.message,
    ...(error.details && typeof error.details === 'object' && !Array.isArray(error.details)
      ? { details: error.details as Record<string, unknown> }
      : {}),
  }
}

async function respond<T>(operation: () => Promise<T>, revalidate = false): Promise<ActionResponse> {
  try {
    const data = await operation()
    if (revalidate) {
      revalidatePath('/step-definitions')
      revalidatePath('/step-definitions/create')
    }
    return { status: 200, success: true, data }
  } catch (error) {
    if (error instanceof z.ZodError) return validationError(error)
    if (error instanceof StepDefinitionRegistryError) return registryError(error)
    if (error instanceof ServiceError) return serviceErrorToActionResponse(error)
    return unknownErrorToActionResponse(error, 'Step Definition action failed')
  }
}

export async function createStepDefinitionDraftAction(definition: unknown): Promise<ActionResponse> {
  return respond(() => registry.createDraft(definition), true)
}

export async function listStepDefinitionDraftsAction(): Promise<ActionResponse> {
  return respond(async () => (await registry.listHumanDrafts()) satisfies StepDefinitionDraftSummary[])
}

export async function searchReadyStepDefinitionContractsAction(query: string): Promise<ActionResponse> {
  return respond(async () => {
    const search = new URLSearchParams({
      query: readyDefinitionSearchSchema.parse(query),
      limit: '10',
      surface: 'human',
    })
    return (await coordinatorStepDefinitionService.read(['step-definitions', 'search'], search)).body
  })
}

export async function rejectReadyStepDefinitionSelectionAction(input: {
  step?: { id: string; version: string }
  reason: 'unusable_result' | 'parameter_mismatch' | 'overlap' | 'runtime_readiness'
}): Promise<ActionResponse> {
  return respond(() =>
    coordinatorStepDefinitionService.recordSelectionRejected({
      surface: 'human',
      ...(input.step ? { step: readyStepReferenceSchema.parse(input.step) } : {}),
      reason: input.reason,
    }),
  )
}

// Records a deliberate human selection without retaining the search text or UI input.
export async function selectReadyStepDefinitionAction(input: {
  step: { id: string; version: string }
  journeyId?: string
  correlationId?: string
}): Promise<ActionResponse> {
  return respond(() =>
    coordinatorStepDefinitionService.recordSelectionSelected({
      surface: 'human',
      step: readyStepReferenceSchema.parse(input.step),
      ...(input.journeyId ? { journeyId: z.string().min(1).max(200).parse(input.journeyId) } : {}),
      ...(input.correlationId
        ? {
            correlationId: z
              .string()
              .regex(/^[a-zA-Z0-9._:-]{1,100}$/)
              .parse(input.correlationId),
          }
        : {}),
    }),
  )
}

export async function listReadyStepDefinitionOptionsAction(): Promise<ActionResponse> {
  return respond(async () => {
    const rows = await registry.listAllReady()
    return rows.map(stepDefinitionOption)
  })
}

function stepDefinitionOption(row: { id: string; version: string; definitionJson: string }): StepDefinitionOption {
  const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
  return {
    reference: { id: row.id, version: row.version, definitionHash: computeStepReferenceHash(definition) },
    title: definition.intent.title,
    description: definition.intent.description,
    signature: definition.human.signature,
    keywordCompatibility: definition.human.keywordCompatibility,
    groupId: definition.human.groupId,
    sourceOwned: definition.provenance.creationMethod === 'built-in-source',
    inputs: definition.inputs.map(input => ({
      name: input.name,
      type: input.type,
      required: input.required,
      ...(input.defaultValue === undefined ? {} : { defaultValue: input.defaultValue }),
    })),
  }
}

export async function listReferencedStepDefinitionOptionsAction(references: unknown): Promise<ActionResponse> {
  return respond(async () => {
    const exactReferences = z.array(exactStepReferenceSchema).max(512).parse(references)
    const uniqueReferences = Array.from(
      new Map(
        exactReferences.map(reference => [
          `${reference.id}@${reference.version}@${reference.definitionHash}`,
          reference,
        ]),
      ).values(),
    )
    return Promise.all(
      uniqueReferences.map(async reference => {
        const row = await registry.read(reference.id, reference.version)
        const option = stepDefinitionOption(row)
        if (option.reference.definitionHash !== reference.definitionHash) {
          throw new StepDefinitionRegistryError(
            'definition_not_found',
            `Step Definition ${reference.id}@${reference.version} no longer matches the persisted reference.`,
          )
        }
        return option
      }),
    )
  })
}

export async function readStepDefinitionDraftAction(draftId: string): Promise<ActionResponse> {
  return respond(() => registry.readDraft(draftIdSchema.parse(draftId)))
}

export async function reviseStepDefinitionDraftAction(input: {
  draftId: string
  expectedRevision: number
  definition: unknown
}): Promise<ActionResponse> {
  return respond(
    () =>
      registry.updateDraft(
        draftIdSchema.parse(input.draftId),
        revisionSchema.parse(input.expectedRevision),
        input.definition,
      ),
    true,
  )
}

export async function deleteStepDefinitionDraftAction(input: {
  draftId: string
  expectedRevision: number
}): Promise<ActionResponse> {
  return respond(async () => {
    await registry.deleteDraft(draftIdSchema.parse(input.draftId), revisionSchema.parse(input.expectedRevision))
    return { draftId: input.draftId }
  }, true)
}

export async function validateStepDefinitionDraftAction(draftId: string): Promise<ActionResponse> {
  return respond(() => registry.validateDraft(draftIdSchema.parse(draftId)))
}

export async function previewStepDefinitionDraftAction(draftId: string): Promise<ActionResponse> {
  return respond(() => registry.previewDraft(draftIdSchema.parse(draftId)))
}

export async function readStepDefinitionDraftArtifactAction(draftId: string): Promise<ActionResponse> {
  return respond(() => extensions.readDraftArtifact(draftIdSchema.parse(draftId)))
}

export async function saveStepDefinitionDraftArtifactAction(input: {
  draftId: string
  expectedRevision: number
  artifact: unknown
}): Promise<ActionResponse> {
  return respond(() =>
    extensions.saveDraftArtifact(
      draftIdSchema.parse(input.draftId),
      revisionSchema.parse(input.expectedRevision),
      input.artifact,
    ),
  )
}

export async function compileStepDefinitionDraftArtifactAction(input: {
  draftId: string
  expectedRevision: number
}): Promise<ActionResponse> {
  return respond(() =>
    extensions.compileDraftArtifact(draftIdSchema.parse(input.draftId), revisionSchema.parse(input.expectedRevision)),
  )
}

export async function reviewStepDefinitionDraftAction(input: {
  draftId: string
  expectedRevision: number
}): Promise<ActionResponse> {
  return respond(() =>
    registry.issueHumanReviewReceipt(draftIdSchema.parse(input.draftId), revisionSchema.parse(input.expectedRevision)),
  )
}

export async function publishStepDefinitionDraftAction(input: {
  draftId: string
  expectedRevision: number
}): Promise<ActionResponse> {
  return respond(
    () =>
      registry.publishDraft({
        draftId: draftIdSchema.parse(input.draftId),
        expectedRevision: revisionSchema.parse(input.expectedRevision),
      }),
    true,
  )
}

export async function createStepDefinitionVersionDraftAction(input: {
  stepId: string
  version: string
  newVersion: string
  createdBy?: string
}): Promise<ActionResponse> {
  return respond(() => {
    const identity = stepIdentitySchema.parse(input)
    return registry.createVersionDraft({
      ...identity,
      newVersion: z
        .string()
        .regex(/^\d+(?:\.\d+){0,2}$/)
        .parse(input.newVersion),
      createdBy: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .parse(input.createdBy ?? 'local-user'),
    })
  }, true)
}

export async function deprecateStepDefinitionAction(input: {
  stepId: string
  version: string
  reason: string
  replacement?: { id: string; version: string }
}): Promise<ActionResponse> {
  return respond(
    () =>
      registry.deprecateFromHumanUi({
        ...stepIdentitySchema.parse(input),
        reason: deprecationReasonSchema.parse(input.reason),
        ...(input.replacement ? { replacement: readyStepReferenceSchema.parse(input.replacement) } : {}),
      }),
    true,
  )
}
