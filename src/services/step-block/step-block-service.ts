import prisma from '@/config/db-config'
import { stepBlockSchema, type StepBlockFormValues } from '@/constants/form-opts/step-block-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { stepBlockStepCreates } from '@/services/shared/authored-step-persistence'
import { resolveReadyExactStepDefinitions } from '@/services/shared/step-invocation-validation'
import { Prisma } from '@prisma/client'
import {
  stepDefinitionContentHash,
  stepInvocationSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

const stepBlockInclude = {
  steps: {
    orderBy: { order: 'asc' },
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
      invocation: stepInvocationSchema.parse(step.invocation),
      order,
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

async function prepareStepBlock(value: StepBlockFormValues) {
  const input = normalizeStepBlockInput(value)
  const definitions = await resolveReadyExactStepDefinitions(input.steps)
  if (!definitions)
    throw new ServiceError('A Step Block requires exact ready Step Definition references', 'VALIDATION', 400)
  return {
    input,
    steps: stepBlockStepCreates(input.steps, definitions).map(step => ({
      ...step,
      compositionVersionHash: stepDefinitionContentHash({
        invocationJson: step.invocationJson,
        parameterMap: step.parameterMap,
      }),
    })),
  }
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
