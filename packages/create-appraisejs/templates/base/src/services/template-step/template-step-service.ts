import prisma from '@/config/db-config'
import { templateStepSchema } from '@/constants/form-opts/template-test-step-form-opts'
import { automationProjectionService } from '@/lib/automation/projection-service'
import { ServiceError } from '@/services/shared/errors'
import { Prisma, StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import prettier from 'prettier'
import type { TemplateStep, TemplateStepParameter } from '@prisma/client'
import type { z } from 'zod'

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

async function normalizeFunctionDefinition(functionDefinition: string | null | undefined): Promise<string> {
  const source = functionDefinition?.trim()
  if (!source) {
    return ''
  }
  try {
    return (
      await prettier.format(source, {
        parser: 'typescript',
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 80,
        tabWidth: 2,
      })
    ).trim()
  } catch {
    return source
  }
}

const templateStepDetailInclude = {
  parameters: true,
  templateStepGroup: true,
} as const

export type TemplateStepDetail = Prisma.TemplateStepGetPayload<{ include: typeof templateStepDetailInclude }>

export async function listTemplateSteps() {
  return prisma.templateStep.findMany({
    include: {
      parameters: {
        select: { id: true, name: true },
      },
      templateStepGroup: true,
    },
  })
}

export async function deleteTemplateSteps(templateStepIds: string[]): Promise<void> {
  const stepsToDelete = await prisma.templateStep.findMany({
    where: { id: { in: templateStepIds } },
    select: { templateStepGroupId: true },
  })

  await prisma.$transaction(async tx => {
    await tx.templateTestCaseStepParameter.deleteMany({
      where: {
        templateTestCaseStep: {
          templateStepId: { in: templateStepIds },
        },
      },
    })
    await tx.testCaseStepParameter.deleteMany({
      where: {
        testCaseStep: {
          templateStepId: { in: templateStepIds },
        },
      },
    })
    await tx.templateStepParameter.deleteMany({
      where: { templateStepId: { in: templateStepIds } },
    })
    await tx.templateStep.deleteMany({ where: { id: { in: templateStepIds } } })
  })

  const affectedGroupIds = [...new Set(stepsToDelete.map(step => step.templateStepGroupId))]
  await Promise.all(affectedGroupIds.map(groupId => automationProjectionService.syncTemplateStepGroup(groupId)))
}

export async function createTemplateStep(value: z.infer<typeof templateStepSchema>): Promise<TemplateStep> {
  const description = normalizeOptionalText(value.description)
  const functionDefinition = await normalizeFunctionDefinition(value.functionDefinition)

  const newTemplateStep = await prisma.templateStep.create({
    data: {
      name: value.name,
      type: value.type as TemplateStepType,
      signature: value.signature,
      description,
      functionDefinition,
      parameters: {
        create: value.params.map(param => ({
          name: param.name,
          type: param.type as StepParameterType,
          order: param.order,
        })),
      },
      icon: value.icon as TemplateStepIcon,
      templateStepGroup: { connect: { id: value.templateStepGroupId } },
    },
  })

  await automationProjectionService.syncTemplateStepGroup(newTemplateStep.templateStepGroupId)
  return newTemplateStep
}

export async function updateTemplateStep(
  id: string | undefined,
  value: z.infer<typeof templateStepSchema>,
): Promise<TemplateStep> {
  if (!id) {
    throw new ServiceError('Template step ID is required', 'VALIDATION', 400)
  }

  const currentStep = await prisma.templateStep.findUnique({
    where: { id },
    select: { templateStepGroupId: true },
  })
  if (!currentStep) {
    throw new ServiceError('Template step not found', 'NOT_FOUND', 404)
  }

  const description = normalizeOptionalText(value.description)
  const functionDefinition = await normalizeFunctionDefinition(value.functionDefinition)

  const updatedTemplateStep = await prisma.templateStep.update({
    where: { id },
    data: {
      name: value.name,
      type: value.type as TemplateStepType,
      signature: value.signature,
      description,
      functionDefinition,
      parameters: {
        deleteMany: { templateStepId: id },
        create: value.params.map(param => ({
          name: param.name,
          type: param.type as StepParameterType,
          order: param.order,
        })),
      },
      icon: value.icon as TemplateStepIcon,
      templateStepGroup: { connect: { id: value.templateStepGroupId } },
    },
  })

  const affectedGroupIds = new Set([currentStep.templateStepGroupId, updatedTemplateStep.templateStepGroupId])
  await Promise.all(
    Array.from(affectedGroupIds).map(groupId => automationProjectionService.syncTemplateStepGroup(groupId)),
  )

  return updatedTemplateStep
}

export async function getTemplateStepByIdOrThrow(id: string): Promise<TemplateStepDetail> {
  const templateStep = await prisma.templateStep.findUnique({
    where: { id },
    include: templateStepDetailInclude,
  })
  if (!templateStep) {
    throw new ServiceError('Template step not found', 'NOT_FOUND', 404)
  }
  return templateStep
}

export async function listAllTemplateStepParameters(): Promise<TemplateStepParameter[]> {
  return prisma.templateStepParameter.findMany({})
}
