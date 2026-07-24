import { z } from 'zod'

import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'
import { StepDefinitionExtensionService } from '@/services/step-definition/step-definition-extension-service'
import { StepDefinitionRegistryService } from '@/services/step-definition/step-definition-registry-service'

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

async function searchDefinitions(
  { registry }: StepDefinitionServices,
  _operation: string[],
  search: URLSearchParams,
): Promise<StepDefinitionReadResult> {
  const definitions = await registry.list({
    status: 'ready',
    query: search.get('query') ?? undefined,
    limit: z.coerce.number().int().positive().max(25).catch(5).parse(search.get('limit')),
  })
  return {
    body: {
      matches: definitions.map(item => ({
        step: { id: item.id, version: item.version, definitionHash: item.definitionHash },
        title: item.title,
        description: item.description,
        human: item.humanProjection ? JSON.parse(item.humanProjection.projectionJson) : null,
        agent: JSON.parse(item.definitionJson).agent,
        executionReadiness: item.executionBinding ? 'ready' : 'unbound',
        hashes: {
          definition: item.definitionHash,
          humanProjection: item.humanProjectionHash,
          agentContract: item.agentContractHash,
          execution: item.executionHash,
        },
      })),
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
  return { body: await registry.createDraft(body), status: 201 }
}

const draftActionInput = z.object({ expectedRevision: z.number().int().positive() }).passthrough()

type DraftActionHandler = (
  services: StepDefinitionServices,
  draftId: string,
  input: z.infer<typeof draftActionInput>,
) => Promise<StepDefinitionWriteResult>

const draftActionHandlers: Record<string, DraftActionHandler> = {
  update: async ({ registry }, draftId, input) => ({
    body: await registry.updateDraft(draftId, input.expectedRevision, input.definition),
  }),
  delete: async ({ registry }, draftId, input) => {
    await registry.deleteDraft(draftId, input.expectedRevision)
    return { body: { draftId, deleted: true } }
  },
  validate: async ({ registry }, draftId) => ({ body: await registry.validateDraft(draftId) }),
  preview: async ({ registry }, draftId) => ({ body: await registry.previewDraft(draftId) }),
  review: async ({ registry }, draftId, input) => ({
    body: await registry.submitForReview(
      draftId,
      input.expectedRevision,
      z.string().min(1).parse(input.reviewAuthority),
    ),
  }),
  publish: async ({ registry }, draftId, input) => ({
    body: await registry.publishDraft({
      draftId,
      expectedRevision: input.expectedRevision,
      conformanceRunId: z.string().min(1).parse(input.conformanceRunId),
    }),
  }),
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

const definitionActionInput = z.object({
  reason: z.string().min(1),
  actor: z.string().min(1),
  replacement: z.object({ id: z.string(), version: z.string() }).optional(),
})

type DefinitionActionHandler = (
  services: StepDefinitionServices,
  stepId: string,
  version: string,
  body: unknown,
) => Promise<StepDefinitionWriteResult>

const definitionActionHandlers: Record<string, DefinitionActionHandler> = {
  deprecate: async ({ registry }, stepId, version, body) => ({
    body: await registry.deprecate({ stepId, version, ...definitionActionInput.parse(body) }),
  }),
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
  }
}

export const coordinatorStepDefinitionService = createCoordinatorStepDefinitionService()
