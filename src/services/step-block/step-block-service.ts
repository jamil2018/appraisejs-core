import prisma from '@/config/db-config'
import { stepBlockSchema, type StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
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
      parameterMap: JSON.stringify(JSON.parse(step.parameterMap)),
    })),
  }
}

export async function listStepBlocks(): Promise<StepBlockDetail[]> {
  return prisma.stepBlock.findMany({
    include: stepBlockInclude,
    orderBy: { name: 'asc' },
  })
}

export async function getStepBlockByIdOrThrow(id: string): Promise<StepBlockDetail> {
  const stepBlock = await prisma.stepBlock.findUnique({
    where: { id },
    include: stepBlockInclude,
  })
  if (!stepBlock) {
    throw new ServiceError('Step block not found', 'NOT_FOUND', 404)
  }
  return stepBlock
}

export async function createStepBlock(value: StepBlockFormValues): Promise<StepBlockDetail> {
  const input = normalizeStepBlockInput(value)
  return prisma.stepBlock.create({
    data: {
      name: input.name,
      description: input.description,
      intent: input.intent,
      steps: {
        create: input.steps,
      },
    },
    include: stepBlockInclude,
  })
}

export async function updateStepBlock(id: string | undefined, value: StepBlockFormValues): Promise<StepBlockDetail> {
  if (!id) {
    throw new ServiceError('Step block ID is required', 'VALIDATION', 400)
  }

  const input = normalizeStepBlockInput(value)

  return prisma.$transaction(async tx => {
    const existing = await tx.stepBlock.findUnique({ where: { id }, select: { id: true } })
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
          create: input.steps,
        },
      },
      include: stepBlockInclude,
    })
  })
}

export async function deleteStepBlocks(ids: string[]): Promise<void> {
  await prisma.stepBlock.deleteMany({ where: { id: { in: ids } } })
}
