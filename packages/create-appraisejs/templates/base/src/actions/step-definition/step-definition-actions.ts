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

const draftIdSchema = z.string().uuid()
const revisionSchema = z.number().int().positive()
const stepIdentitySchema = z.object({ stepId: z.string().min(1), version: z.string().min(1) })
const readyDefinitionSearchSchema = z.string().trim().min(1).max(200)
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
    if (revalidate) revalidatePath('/template-steps')
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

export async function searchReadyStepDefinitionContractsAction(query: string): Promise<ActionResponse> {
  return respond(async () => {
    const search = new URLSearchParams({ query: readyDefinitionSearchSchema.parse(query), limit: '10' })
    return (await coordinatorStepDefinitionService.read(['step-definitions', 'search'], search)).body
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
  reviewAuthority: string
}): Promise<ActionResponse> {
  return respond(() =>
    registry.submitForReview(
      draftIdSchema.parse(input.draftId),
      revisionSchema.parse(input.expectedRevision),
      z.string().trim().min(1).max(200).parse(input.reviewAuthority),
    ),
  )
}

export async function publishStepDefinitionDraftAction(input: {
  draftId: string
  expectedRevision: number
  conformanceRunId: string
}): Promise<ActionResponse> {
  return respond(
    () =>
      registry.publishDraft({
        draftId: draftIdSchema.parse(input.draftId),
        expectedRevision: revisionSchema.parse(input.expectedRevision),
        conformanceRunId: z.string().trim().min(1).max(200).parse(input.conformanceRunId),
      }),
    true,
  )
}

export async function deprecateStepDefinitionAction(input: {
  stepId: string
  version: string
  reason: string
  actor: string
  replacement?: { id: string; version: string }
}): Promise<ActionResponse> {
  return respond(() => {
    const identity = stepIdentitySchema.parse(input)
    return registry.deprecate({
      ...identity,
      reason: z.string().trim().min(1).max(2_000).parse(input.reason),
      actor: z.string().trim().min(1).max(200).parse(input.actor),
      replacement: input.replacement
        ? {
            id: z.string().min(1).parse(input.replacement.id),
            version: z.string().min(1).parse(input.replacement.version),
          }
        : undefined,
    })
  }, true)
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
