import prisma from '@/config/db-config'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { flowBlockCreates, templateTestCaseStepCreates } from '@/services/shared/authored-step-persistence'
import { resolveReadyExactStepDefinitions } from '@/services/shared/step-invocation-validation'
import { Prisma } from '@prisma/client'
import type { TemplateTestCase } from '@prisma/client'
import type { z } from 'zod'

const templateTestCaseInclude = {
  steps: {
    include: {
      parameters: true,
    },
  },
  flowBlocks: {
    include: {
      nodes: true,
    },
  },
} as const

export type TemplateTestCaseDetail = Prisma.TemplateTestCaseGetPayload<{ include: typeof templateTestCaseInclude }>
type TemplateTestCaseInput = z.input<typeof templateTestCaseSchema>

export async function listTemplateTestCases(targetProjectId: string) {
  return prisma.templateTestCase.findMany({
    where: { targetProjectId },
    include: templateTestCaseInclude,
  })
}

export async function deleteTemplateTestCases(ids: string[], targetProjectId: string): Promise<void> {
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
    await tx.templateTestCaseFlowBlock.deleteMany({
      where: { templateTestCaseId: { in: ids } },
    })
    await tx.templateTestCase.deleteMany({ where: { id: { in: ids }, targetProjectId } })
  })
}

async function validateStepInvocations(value: TemplateTestCaseInput) {
  const definitions = await resolveReadyExactStepDefinitions(value.steps)
  if (!definitions)
    throw new ServiceError('One or more Step Invocation references is not ready and exact', 'VALIDATION', 400)
  return definitions
}

function prepareTemplateTestCaseWrites(
  value: TemplateTestCaseInput,
  definitions: Awaited<ReturnType<typeof validateStepInvocations>>,
) {
  return {
    steps: templateTestCaseStepCreates(value.steps, definitions),
    flowBlocks: flowBlockCreates(value.flowBlocks),
  }
}

export async function createTemplateTestCase(
  value: TemplateTestCaseInput,
  targetProjectId: string,
): Promise<TemplateTestCase> {
  const definitions = await validateStepInvocations(value)
  const prepared = prepareTemplateTestCaseWrites(value, definitions)
  return prisma.templateTestCase.create({
    data: {
      name: value.title,
      description: value.description ?? '',
      targetProjectId,
      steps: { create: prepared.steps },
      flowBlocks: { create: prepared.flowBlocks },
    },
  })
}

export async function getTemplateTestCaseByIdOrThrow(
  id: string,
  targetProjectId: string,
): Promise<TemplateTestCaseDetail> {
  const templateTestCase = await prisma.templateTestCase.findFirst({
    where: { id, targetProjectId },
    include: templateTestCaseInclude,
  })
  if (!templateTestCase) {
    throw new ServiceError('Template test case not found', 'NOT_FOUND', 404)
  }
  return templateTestCase
}

export async function updateTemplateTestCase(
  id: string | undefined,
  value: TemplateTestCaseInput,
  targetProjectId: string,
): Promise<TemplateTestCase> {
  if (!id) {
    throw new ServiceError(
      "updateTemplateTestCase: 'id' parameter is required for updating a template test case.",
      'VALIDATION',
      400,
    )
  }
  await getTemplateTestCaseByIdOrThrow(id, targetProjectId)
  const definitions = await validateStepInvocations(value)
  const prepared = prepareTemplateTestCaseWrites(value, definitions)

  const steps = await prisma.templateTestCaseStep.findMany({
    where: { templateTestCaseId: id },
    select: { id: true },
  })
  const stepIds = steps.map(step => step.id)

  return prisma.$transaction(async tx => {
    if (stepIds.length > 0) {
      await tx.templateTestCaseStepParameter.deleteMany({
        where: { templateTestCaseStep: { id: { in: stepIds } } },
      })
    }
    await tx.templateTestCaseStep.deleteMany({ where: { templateTestCaseId: id } })
    await tx.templateTestCaseFlowBlock.deleteMany({ where: { templateTestCaseId: id } })

    return tx.templateTestCase.update({
      where: { id },
      data: {
        name: value.title,
        description: value.description ?? '',
        steps: { create: prepared.steps },
        flowBlocks: { create: prepared.flowBlocks },
      },
      include: { steps: true },
    })
  })
}
