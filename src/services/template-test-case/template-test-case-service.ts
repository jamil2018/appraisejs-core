import prisma from '@/config/db-config'
import { templateTestCaseSchema } from '@/constants/form-opts/template-test-case-form-opts'
import { ServiceError } from '@/services/shared/errors'
import { flowBlockCreates, templateTestCaseStepCreates } from '@/services/shared/authored-step-persistence'
import { Prisma } from '@prisma/client'
import type { TemplateTestCase } from '@prisma/client'
import type { z } from 'zod'
import { type CanonicalTemplateStepMapping } from '@/lib/operation-catalog'

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

async function validateTemplateSteps(value: TemplateTestCaseInput) {
  const ids = [...new Set(value.steps.map(step => step.templateStepId))]
  const steps = await prisma.templateStep.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      operationId: true,
      operationVersion: true,
      operationDescriptorHash: true,
      humanProjectionId: true,
      operationMigrationState: true,
    },
  })
  if (steps.length !== ids.length)
    throw new ServiceError('One or more template steps were not found', 'VALIDATION', 400)
  return new Map(steps.map(step => [step.id, step satisfies CanonicalTemplateStepMapping & { id: string }]))
}

export async function createTemplateTestCase(
  value: TemplateTestCaseInput,
  targetProjectId: string,
): Promise<TemplateTestCase> {
  const operationMappings = await validateTemplateSteps(value)
  return prisma.templateTestCase.create({
    data: {
      name: value.title,
      description: value.description ?? '',
      targetProjectId,
      steps: { create: templateTestCaseStepCreates(value.steps, operationMappings) },
      flowBlocks: { create: flowBlockCreates(value.flowBlocks) },
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
  const operationMappings = await validateTemplateSteps(value)

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
  await prisma.templateTestCaseFlowBlock.deleteMany({ where: { templateTestCaseId: id } })

  return prisma.templateTestCase.update({
    where: { id },
    data: {
      name: value.title,
      description: value.description ?? '',
      steps: { create: templateTestCaseStepCreates(value.steps, operationMappings) },
      flowBlocks: { create: flowBlockCreates(value.flowBlocks) },
    },
    include: { steps: true },
  })
}
