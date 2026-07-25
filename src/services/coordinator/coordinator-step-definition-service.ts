import { z } from 'zod'
import { randomUUID } from 'node:crypto'

import prisma from '@/config/db-config'
import { normalizeCompositionChildren } from '@/lib/step-definition/composition-authoring'
import { ServiceError } from '@/services/shared/errors'
import { StepDefinitionExtensionService } from '@/services/step-definition/step-definition-extension-service'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'
import { recordStepDefinitionTelemetry } from '@/services/step-definition/step-definition-telemetry'
import {
  createReadySearchEvidence,
  readyStepDefinitionSearchIndexHash,
  searchReadyStepDefinitions,
} from '@/services/step-definition/ready-step-definition-search-index'

type StepDefinitionReadResult = {
  body: unknown
}

type StepDefinitionWriteResult = {
  body: unknown
  status?: number
}

type StepDefinitionServices = {
  extensions: StepDefinitionExtensionService
  registry: StepDefinitionRegistryService
}

const telemetrySurfaceSchema = z.enum(['human', 'agent'])
const correlationIdSchema = z.string().regex(/^[a-zA-Z0-9._:-]{1,100}$/)
const telemetryStepSchema = z.object({ id: z.string().min(1).max(200), version: z.string().min(1).max(40) })
const selectionRejectionSchema = z.object({
  surface: telemetrySurfaceSchema,
  step: telemetryStepSchema.optional(),
  reason: z.enum(['unusable_result', 'parameter_mismatch', 'overlap', 'runtime_readiness']),
  correlationId: correlationIdSchema.optional(),
  planId: z.string().min(1).max(200).optional(),
})
const selectionAcceptedSchema = z.object({
  surface: telemetrySurfaceSchema,
  step: telemetryStepSchema,
  correlationId: correlationIdSchema.optional(),
  planId: z.string().min(1).max(200).optional(),
})

type ReadOperationHandler = (
  services: StepDefinitionServices,
  operation: string[],
  search: URLSearchParams,
) => Promise<StepDefinitionReadResult>

type WriteOperationHandler = (
  services: StepDefinitionServices,
  operation: string[],
  body: unknown,
) => Promise<StepDefinitionWriteResult>

function operationNotFound(): never {
  throw new ServiceError('Coordinator API operation not found.', 'NOT_FOUND')
}

// Search binds bounded request context, full ready-index ranking, and privacy-safe lifecycle telemetry.
// fallow-ignore-next-line complexity
async function searchDefinitions(
  { registry }: StepDefinitionServices,
  _operation: string[],
  search: URLSearchParams,
): Promise<StepDefinitionReadResult> {
  const surface = telemetrySurfaceSchema.catch('agent').parse(search.get('surface'))
  const parameterNames = (search.get('parameterNames') ?? '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
    .slice(0, 32)
  const planId = search.get('planId')
  const correlationId = search.get('correlationId')
    ? correlationIdSchema.parse(search.get('correlationId'))
    : randomUUID()
  let planContext: string | undefined
  if (planId) {
    const plan = await prisma.planProjection.findUnique({
      where: { planId },
      select: { planId: true, tasks: { select: { title: true, description: true, validationIntent: true } } },
    })
    if (!plan) throw new ServiceError('Step discovery plan scope was not found.', 'NOT_FOUND')
    planContext = JSON.stringify(plan.tasks)
  }
  const definitions = await registry.listReadyForSearch()
  const limit = z.coerce.number().int().positive().max(25).catch(5).parse(search.get('limit'))
  const query = search.get('query') ?? ''
  const ranked = searchReadyStepDefinitions(definitions, {
    intent: query,
    parameterNames,
    planContext,
    includeUnmatched: !query,
  }).slice(0, limit)
  await recordStepDefinitionTelemetry(prisma, {
    surface,
    outcome: ranked.length ? 'query_match' : 'query_no_match',
    correlationId,
    ...(planId ? { planId } : {}),
    payload: ranked.length ? { candidateCount: ranked.length } : { reason: 'no_match' },
  })
  const reuseEvidence = createReadySearchEvidence({
    indexHash: readyStepDefinitionSearchIndexHash(definitions),
    searchedAt: new Date().toISOString(),
    correlationId,
    ...(planId ? { planId } : {}),
    candidateReferences: ranked.map(item => ({ id: item.value.step.id, version: item.value.step.version })),
  })
  const receipt = await prisma.stepDefinitionSearchReceipt.create({
    data: {
      indexHash: reuseEvidence.indexHash,
      candidateReferencesJson: JSON.stringify(reuseEvidence.candidateReferences),
      correlationId,
      ...(planId ? { planId } : {}),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  })
  return {
    body: {
      reuseEvidence: { ...reuseEvidence, receiptId: receipt.id },
      matches: ranked.map(({ value: item, confidence, explanation, parameterCompatibility }, index) => {
        return {
          step: item.step,
          title: item.title,
          description: item.description,
          human: item.human,
          agent: item.agent,
          inputs: item.inputs,
          outputs: item.outputs,
          executionReadiness: 'ready',
          hashes: {
            definition: item.integrity.definitionHash,
            humanProjection: item.integrity.humanProjectionHash,
            agentContract: item.integrity.agentContractHash,
            execution: item.integrity.executionHash,
          },
          rank: index + 1,
          confidence,
          parameterCompatibility,
          explanation,
        }
      }),
      nextRecommendedAction: 'Use the returned Step Reference directly in managed authoring.',
    },
  }
}

async function readDraft(
  { extensions, registry }: StepDefinitionServices,
  operation: string[],
): Promise<StepDefinitionReadResult> {
  const draftId = z.string().uuid().parse(operation[2])
  const draft = await registry.readDraft(draftId)
  return { body: { ...draft, artifact: await extensions.readDraftArtifact(draftId) } }
}

async function readDefinition(
  { registry }: StepDefinitionServices,
  operation: string[],
): Promise<StepDefinitionReadResult> {
  return {
    body: await registry.read(z.string().min(1).parse(operation[2]), z.string().min(1).parse(operation[3])),
  }
}

const readOperationHandlers: Record<string, ReadOperationHandler> = {
  search: searchDefinitions,
  drafts: readDraft,
  definitions: readDefinition,
}

async function createDraft(
  { registry }: StepDefinitionServices,
  _operation: string[],
  body: unknown,
): Promise<StepDefinitionWriteResult> {
  const input = z
    .object({
      definition: z.unknown(),
      reuseJustification: z.string().trim().min(1).max(2_000).optional(),
      reuseEvidence: z
        .object({
          indexHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          searchedAt: z.string().datetime(),
          planId: z.string().min(1).max(200).optional(),
          candidateReferences: z.array(telemetryStepSchema).max(25),
          correlationId: correlationIdSchema,
          receiptId: z.string().uuid(),
          reuseJustification: z.string().trim().min(1).max(2_000),
        })
        .optional(),
    })
    .safeParse(body)
  return {
    body: await registry.createDraft(
      normalizeDraftComposition(input.success ? input.data.definition : body),
      input.success ? input.data.reuseJustification : undefined,
      { reuseEvidence: input.success ? input.data.reuseEvidence : undefined },
    ),
    status: 201,
  }
}

function normalizeDraftComposition(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const draft = value as { execution?: { kind?: unknown; steps?: unknown } }
  if (draft.execution?.kind !== 'composition') return value
  return { ...draft, execution: { ...draft.execution, steps: normalizeCompositionChildren(draft.execution.steps) } }
}

const draftActionInput = z.object({ expectedRevision: z.number().int().positive() }).passthrough()

type DraftActionHandler = (
  services: StepDefinitionServices,
  draftId: string,
  input: z.infer<typeof draftActionInput>,
) => Promise<StepDefinitionWriteResult>

const draftActionHandlers: Record<string, DraftActionHandler> = {
  update: async ({ registry }, draftId, input) => ({
    body: await registry.updateDraft(draftId, input.expectedRevision, normalizeDraftComposition(input.definition)),
  }),
  delete: async ({ registry }, draftId, input) => {
    await registry.deleteDraft(draftId, input.expectedRevision)
    return { body: { draftId, deleted: true } }
  },
  validate: async ({ registry }, draftId) => ({ body: await registry.validateDraft(draftId) }),
  preview: async ({ registry }, draftId) => ({ body: await registry.previewDraft(draftId) }),
  artifact: async ({ extensions }, draftId, input) => ({
    body: await extensions.saveDraftArtifact(draftId, input.expectedRevision, input.artifact),
  }),
  compile: async ({ extensions }, draftId, input) => ({
    body: await extensions.compileDraftArtifact(draftId, input.expectedRevision),
  }),
}

async function writeDraft(
  services: StepDefinitionServices,
  operation: string[],
  body: unknown,
): Promise<StepDefinitionWriteResult> {
  if (operation.length === 2) return createDraft(services, operation, body)

  const draftId = z.string().uuid().parse(operation[2])
  const input = draftActionInput.parse(body)
  const handler = draftActionHandlers[operation[3]]
  if (!handler) return operationNotFound()
  return handler(services, draftId, input)
}

type DefinitionActionHandler = (
  services: StepDefinitionServices,
  stepId: string,
  version: string,
  body: unknown,
) => Promise<StepDefinitionWriteResult>

const definitionActionHandlers: Record<string, DefinitionActionHandler> = {
  version: async ({ registry }, stepId, version, body) => ({
    body: await registry.createVersionDraft({
      stepId,
      version,
      ...z.object({ newVersion: z.string(), createdBy: z.string().min(1) }).parse(body),
    }),
  }),
}

async function writeDefinition(
  services: StepDefinitionServices,
  operation: string[],
  body: unknown,
): Promise<StepDefinitionWriteResult> {
  const stepId = z.string().min(1).parse(operation[2])
  const version = z.string().min(1).parse(operation[3])
  const handler = definitionActionHandlers[operation[4]]
  if (!handler) return operationNotFound()
  return handler(services, stepId, version, body)
}

const writeOperationHandlers: Record<string, WriteOperationHandler> = {
  drafts: writeDraft,
  definitions: writeDefinition,
}

function createCoordinatorStepDefinitionService() {
  const services = {
    registry: new StepDefinitionRegistryService(prisma),
    extensions: new StepDefinitionExtensionService(prisma),
  }

  return {
    async read(operation: string[], search: URLSearchParams): Promise<StepDefinitionReadResult> {
      const handler = readOperationHandlers[operation[1]]
      if (!handler) return operationNotFound()
      return handler(services, operation, search)
    },

    async write(operation: string[], body: unknown): Promise<StepDefinitionWriteResult> {
      const handler = writeOperationHandlers[operation[1]]
      if (!handler) return operationNotFound()
      return handler(services, operation, body)
    },

    async recordSelectionRejected(input: unknown) {
      const event = selectionRejectionSchema.parse(input)
      await recordStepDefinitionTelemetry(prisma, {
        surface: event.surface,
        outcome: 'selection_rejected',
        ...(event.step ? { step: event.step } : {}),
        ...(event.correlationId ? { correlationId: event.correlationId } : {}),
        ...(event.planId ? { planId: event.planId } : {}),
        payload: { reason: event.reason },
      })
      return { recorded: true }
    },

    async recordSelectionSelected(input: unknown) {
      const event = selectionAcceptedSchema.parse(input)
      await recordStepDefinitionTelemetry(prisma, {
        surface: event.surface,
        outcome: 'selection_selected',
        step: event.step,
        ...(event.correlationId || event.planId ? { correlationId: event.correlationId ?? `plan:${event.planId}` } : {}),
        ...(event.planId ? { planId: event.planId } : {}),
        payload: {},
      })
      return { recorded: true }
    },
  }
}

export const coordinatorStepDefinitionService = createCoordinatorStepDefinitionService()
