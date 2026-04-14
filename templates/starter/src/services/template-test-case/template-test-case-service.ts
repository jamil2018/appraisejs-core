import prisma from '@/config/db-config'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { Prisma, StepParameterType } from '@prisma/client'
import type { TemplateTestCase } from '@prisma/client'
import type { z } from 'zod'

const templateTestCaseInclude = {
  steps: {
    include: {
      parameters: true,
    },
  },
} as const

export type TemplateTestCaseDetail = Prisma.TemplateTestCaseGetPayload<{ include: typeof templateTestCaseInclude }>

export async function listTemplateTestCases() {
  return prisma.templateTestCase.findMany({
    include: templateTestCaseInclude,
  })
}

export async function deleteTemplateTestCases(ids: string[]): Promise<void> {
  await prisma.$transaction(async tx => {
    await tx.templateTestCaseStepParameter.deleteMany({
      where: {
        templateTestCaseStep: {
          templateTestCaseId: { in: ids },
        },
      },
    })
    await tx.templateTestCaseStep.deleteMany({
      where: { templateTestCaseId: { in: ids } },
    })
    await tx.templateTestCase.deleteMany({ where: { id: { in: ids } } })
  })
}

export async function createTemplateTestCase(value: z.infer<typeof templateTestCaseSchema>): Promise<TemplateTestCase> {
  return prisma.templateTestCase.create({
    data: {
      name: value.title,
      description: value.description ?? '',
      steps: {
        create: value.steps.map(step => ({
          gherkinStep: step.gherkinStep,
          label: step.label,
          icon: step.icon,
          parameters: {
            create: step.parameters.map(param => ({
              name: param.name,
              defaultValue: param.value,
              type: param.type as StepParameterType,
              order: param.order,
            })),
          },
          TemplateStep: { connect: { id: step.templateStepId } },
          order: step.order,
        })),
      },
    },
  })
}

export async function getTemplateTestCaseByIdOrThrow(id: string): Promise<TemplateTestCaseDetail> {
  const templateTestCase = await prisma.templateTestCase.findUnique({
    where: { id },
    include: templateTestCaseInclude,
  })
  if (!templateTestCase) {
    throw new ServiceError('Template test case not found', 'NOT_FOUND', 404)
  }
  return templateTestCase
}

export async function updateTemplateTestCase(
  id: string | undefined,
  value: z.infer<typeof templateTestCaseSchema>,
): Promise<TemplateTestCase> {
  if (!id) {
    throw new ServiceError(
      "updateTemplateTestCase: 'id' parameter is required for updating a template test case.",
      'VALIDATION',
      400,
    )
  }

  const steps = await prisma.templateTestCaseStep.findMany({
    where: { templateTestCaseId: id },
    select: { id: true },
  })
  const stepIds = steps.map(step => step.id)

  if (stepIds.length > 0) {
    await prisma.templateTestCaseStepParameter.deleteMany({
      where: { templateTestCaseStep: { id: { in: stepIds } } },
    })
  }

  await prisma.templateTestCaseStep.deleteMany({ where: { templateTestCaseId: id } })

  return prisma.templateTestCase.update({
    where: { id },
    data: {
      name: value.title,
      description: value.description ?? '',
      steps: {
        create: value.steps.map(step => ({
          gherkinStep: step.gherkinStep,
          label: step.label ?? '',
          icon: step.icon ?? '',
          parameters: {
            create: step.parameters.map(param => ({
              name: param.name,
              defaultValue: param.value,
              type: param.type as StepParameterType,
              order: param.order,
            })),
          },
          templateStepId: step.templateStepId,
          order: step.order,
        })),
      },
    },
    include: { steps: true },
  })
}
