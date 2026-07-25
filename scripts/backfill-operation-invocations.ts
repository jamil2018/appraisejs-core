#!/usr/bin/env tsx

import prisma from '../src/config/db-config'
import {
  buildCanonicalInvocationJson,
  buildCanonicalStepBlockOperation,
  isMappedOperationTemplate,
} from '../src/lib/operation-catalog/invocation'

const apply = process.argv.includes('--apply')

const mappingSelect = {
  operationId: true,
  operationVersion: true,
  operationDescriptorHash: true,
  humanProjectionId: true,
  operationMigrationState: true,
} as const

const [testCaseSteps, templateCaseSteps, blockSteps] = await Promise.all([
  prisma.testCaseStep.findMany({
    include: { TemplateStep: { select: mappingSelect }, parameters: { orderBy: { order: 'asc' } } },
  }),
  prisma.templateTestCaseStep.findMany({
    include: { TemplateStep: { select: mappingSelect }, parameters: { orderBy: { order: 'asc' } } },
  }),
  prisma.stepBlockStep.findMany({
    include: {
      templateStep: {
        select: {
          ...mappingSelect,
          signature: true,
          parameters: { orderBy: { order: 'asc' }, select: { name: true } },
        },
      },
    },
  }),
])

const caseUpdates = testCaseSteps.flatMap(step => {
  const operationInvocationJson = buildCanonicalInvocationJson(step.TemplateStep ?? undefined, {
    gherkinStep: step.gherkinStep,
    parameters: step.parameters.map(parameter => ({ name: parameter.name, value: parameter.value })),
  })
  return operationInvocationJson && operationInvocationJson !== step.operationInvocationJson
    ? [{ id: step.id, operationInvocationJson }]
    : []
})
const templateUpdates = templateCaseSteps.flatMap(step => {
  const operationInvocationJson = buildCanonicalInvocationJson(step.TemplateStep ?? undefined, {
    gherkinStep: step.gherkinStep,
    parameters: step.parameters.map(parameter => ({ name: parameter.name, value: parameter.defaultValue })),
  })
  return operationInvocationJson && operationInvocationJson !== step.operationInvocationJson
    ? [{ id: step.id, operationInvocationJson }]
    : []
})

function blockUpdate(step: (typeof blockSteps)[number]) {
  const operation = buildCanonicalStepBlockOperation(step.templateStep)
  if (!operation) return null
  const unchanged = Object.entries(operation).every(([field, value]) => step[field as keyof typeof operation] === value)
  return unchanged ? null : { id: step.id, ...operation }
}

const blockUpdates = blockSteps.flatMap(step => blockUpdate(step) ?? [])

const manualOnlyRows =
  testCaseSteps.filter(step => !isMappedOperationTemplate(step.TemplateStep ?? undefined)).length +
  templateCaseSteps.filter(step => !isMappedOperationTemplate(step.TemplateStep)).length +
  blockSteps.filter(step => !isMappedOperationTemplate(step.templateStep)).length
const unchangedMappedRows =
  testCaseSteps.length +
  templateCaseSteps.length +
  blockSteps.length -
  manualOnlyRows -
  caseUpdates.length -
  templateUpdates.length -
  blockUpdates.length

console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'dry-run',
      testCaseSteps: caseUpdates.length,
      templateTestCaseSteps: templateUpdates.length,
      stepBlockSteps: blockUpdates.length,
      unchangedMappedRows,
      manualOnlyRows,
    },
    null,
    2,
  ),
)

if (apply) {
  await prisma.$transaction([
    ...caseUpdates.map(update =>
      prisma.testCaseStep.update({
        where: { id: update.id },
        data: { operationInvocationJson: update.operationInvocationJson },
      }),
    ),
    ...templateUpdates.map(update =>
      prisma.templateTestCaseStep.update({
        where: { id: update.id },
        data: { operationInvocationJson: update.operationInvocationJson },
      }),
    ),
    ...blockUpdates.map(update =>
      prisma.stepBlockStep.update({
        where: { id: update.id },
        data: {
          parameterMap: update.parameterMap,
          operationInvocationJson: update.operationInvocationJson,
          compositionVersionHash: update.compositionVersionHash,
        },
      }),
    ),
  ])
}

await prisma.$disconnect()
