import prisma from '@/config/db-config'
import { stepBlockSchema, type StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
import { buildCanonicalStepBlockOperation } from '@/lib/operation-catalog/invocation'
import { ServiceError } from '@/services/shared/errors'
import { Prisma } from '@prisma/client'

const stepBlockInclude = {
  steps: {
    orderBy: { order: 'asc' },
    include: {
      templateStep: {
        include: {
          parameters: { orderBy: { order: 'asc' } },
          templateStepGroup: true,
        },
      },
    },
  },
} satisfies Prisma.StepBlockInclude

export type StepBlockDetail = Prisma.StepBlockGetPayload<{ include: typeof stepBlockInclude }>

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeStepBlockInput(value: StepBlockFormValues) {
  const parsed = stepBlockSchema.parse(value)
  return {
    name: parsed.name.trim(),
    description: normalizeOptionalText(parsed.description),
    intent: normalizeOptionalText(parsed.intent),
    steps: parsed.steps.map((step, order) => ({
      templateStepId: step.templateStepId,
      order,
      parameterMap: '{}',
    })),
  }
}

export async function listStepBlocks(targetProjectId: string): Promise<StepBlockDetail[]> {
  return prisma.stepBlock.findMany({
    where: { targetProjectId },
    include: stepBlockInclude,
    orderBy: { name: 'asc' },
  })
}

export async function getStepBlockByIdOrThrow(id: string, targetProjectId: string): Promise<StepBlockDetail> {
  const stepBlock = await prisma.stepBlock.findFirst({
    where: { id, targetProjectId },
    include: stepBlockInclude,
  })
  if (!stepBlock) {
    throw new ServiceError('Step block not found', 'NOT_FOUND', 404)
  }
  return stepBlock
}

async function resolveTemplateSteps(templateStepIds: string[]) {
  const ids = [...new Set(templateStepIds)]
  const steps = await prisma.templateStep.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      signature: true,
      operationId: true,
      operationVersion: true,
      operationDescriptorHash: true,
      humanProjectionId: true,
      operationMigrationState: true,
      parameters: { orderBy: { order: 'asc' }, select: { name: true } },
    },
  })
  if (steps.length !== ids.length)
    throw new ServiceError('One or more template steps were not found', 'VALIDATION', 400)
  return new Map(steps.map(step => [step.id, step]))
}

function canonicalStepBlockSteps(
  steps: ReturnType<typeof normalizeStepBlockInput>['steps'],
  templates: Awaited<ReturnType<typeof resolveTemplateSteps>>,
) {
  return steps.map(step => {
    const template = templates.get(step.templateStepId)!
    const operation = buildCanonicalStepBlockOperation(template)
    if (!operation) return step
    return {
      ...step,
      ...operation,
    }
  })
}

async function prepareStepBlock(value: StepBlockFormValues) {
  const input = normalizeStepBlockInput(value)
  const templates = await resolveTemplateSteps(input.steps.map(step => step.templateStepId))
  return { input, steps: canonicalStepBlockSteps(input.steps, templates) }
}

export async function createStepBlock(value: StepBlockFormValues, targetProjectId: string): Promise<StepBlockDetail> {
  const { input, steps } = await prepareStepBlock(value)
  return prisma.stepBlock.create({
    data: {
      name: input.name,
      description: input.description,
      intent: input.intent,
      targetProjectId,
      steps: {
        create: steps,
      },
    },
    include: stepBlockInclude,
  })
}

export async function updateStepBlock(
  id: string | undefined,
  value: StepBlockFormValues,
  targetProjectId: string,
): Promise<StepBlockDetail> {
  if (!id) {
    throw new ServiceError('Step block ID is required', 'VALIDATION', 400)
  }

  const { input, steps } = await prepareStepBlock(value)

  return prisma.$transaction(async tx => {
    const existing = await tx.stepBlock.findFirst({ where: { id, targetProjectId }, select: { id: true } })
    if (!existing) {
      throw new ServiceError('Step block not found', 'NOT_FOUND', 404)
    }
    await tx.stepBlockStep.deleteMany({ where: { stepBlockId: id } })
    return tx.stepBlock.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        intent: input.intent,
        steps: {
          create: steps,
        },
      },
      include: stepBlockInclude,
    })
  })
}

export async function deleteStepBlocks(ids: string[], targetProjectId: string): Promise<void> {
  await prisma.stepBlock.deleteMany({ where: { id: { in: ids }, targetProjectId } })
}
