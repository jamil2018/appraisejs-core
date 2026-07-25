import { StepParameterType, TagType, TemplateStepIcon, type Prisma, type PrismaClient } from '@prisma/client'

import type { ValidationArtifact } from '@/lib/plan-contract'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { CompiledCustomExtension } from '@/lib/validation-ast'
import { canonicalTagExpression, canonicalTagName } from '@/lib/tag-filters'
import { ServiceError } from '@/services/shared/errors'
import { registerProjectResourceOwnership } from '@/services/project-resource/project-resource-ownership-service'

type ProjectionClient = PrismaClient | Prisma.TransactionClient
type TargetProjectMetadata = {
  id: string
  canonicalPath: string
  displayName: string
  fingerprint: string
} | null

const projectionTag = (planId: string) => `@appraise_plan_${planId}`
const testCaseTag = (testCaseId: string) => `@tc_${testCaseId}`
const testSuiteTag = (testSuiteId: string) => `@ts_${testSuiteId}`
export async function assertValidationEnvironmentsReady(
  validation: ValidationArtifact,
  client: ProjectionClient,
  targetProject: TargetProjectMetadata,
) {
  const requiredReferences = [
    ...new Set(validation.validations.flatMap(item => item.matrix.map(entry => entry.environment))),
  ]
  const existing = await client.environment.findMany({
    where: {
      ...(targetProject ? { targetProjectId: targetProject.id } : {}),
      OR: [{ id: { in: requiredReferences } }, { name: { in: requiredReferences } }],
    },
    select: { id: true, name: true },
  })
  const found = new Set(existing.flatMap(environment => [environment.id, environment.name]))
  const missingEnvironments = requiredReferences.filter(reference => !found.has(reference))
  if (missingEnvironments.length > 0) {
    throw new ServiceError(
      `Validation environments must exist before approval: ${missingEnvironments.join(', ')}.`,
      'CONFLICT',
      undefined,
      {
        blockerType: 'missing_environment',
        missingEnvironments,
        targetProject,
        nextRecommendedAction:
          'Create or confirm the missing environments in Appraise, then resubmit validation review.',
      },
    )
  }
}

async function ensureIdentifierTag(name: string, targetProjectId: string, client: ProjectionClient) {
  const canonicalName = canonicalTagName(name)
  const tagExpression = canonicalTagExpression(name)
  const existing = await client.tag.findFirst({
    where: {
      type: TagType.IDENTIFIER,
      targetProjectId,
      OR: [{ name: canonicalName }, { name }, { tagExpression }, { tagExpression: canonicalName }],
    },
  })
  if (existing) return existing
  return client.tag.create({ data: { name: canonicalName, tagExpression, type: TagType.IDENTIFIER, targetProjectId } })
}

function assertProjectionOwned(existing: { tags: Array<{ name: string }> } | null, entityType: string, id: string) {
  if (!existing || existing.tags.some(tag => canonicalTagExpression(tag.name).startsWith('@appraise_plan_'))) return
  throw new ServiceError(
    `Validation projection conflicts with existing ${entityType.toLowerCase()} "${id}".`,
    'CONFLICT',
    undefined,
    {
      blockerType: 'projection_conflict',
      entityType,
      entityId: id,
    },
  )
}

async function assertProjectionOwnedTestCase(id: string, targetProjectId: string, client: ProjectionClient) {
  const existing = await client.testCase.findUnique({ where: { id }, include: { tags: true } })
  if (existing && existing.targetProjectId !== targetProjectId)
    throw new ServiceError(`Validation projection conflicts with foreign test case "${id}".`, 'CONFLICT')
  assertProjectionOwned(existing, 'TestCase', id)
}

async function assertProjectionOwnedTestSuite(id: string, targetProjectId: string, client: ProjectionClient) {
  const existing = await client.testSuite.findUnique({ where: { id }, include: { tags: true } })
  if (existing && existing.targetProjectId !== targetProjectId)
    throw new ServiceError(`Validation projection conflicts with foreign test suite "${id}".`, 'CONFLICT')
  assertProjectionOwned(existing, 'TestSuite', id)
}

function assertMatchingEntity(
  existing: Record<string, unknown> | null,
  expected: Record<string, unknown>,
  entityType: string,
  entityId: string,
) {
  if (!existing) return
  for (const [key, value] of Object.entries(expected)) {
    if (existing[key] !== value) {
      throw new ServiceError(
        `Validation projection conflicts with existing ${entityType} "${entityId}".`,
        'CONFLICT',
        undefined,
        {
          blockerType: 'projection_conflict',
          entityType,
          entityId,
          field: key,
        },
      )
    }
  }
}

function parameterType(type: string | undefined) {
  const normalized = type?.toUpperCase()
  if (normalized && normalized in StepParameterType) return normalized as StepParameterType
  return StepParameterType.STRING
}

// fallow-ignore-next-line complexity
async function projectValidationArtifactsInTransaction(
  planId: string,
  validation: ValidationArtifact,
  client: ProjectionClient,
) {
  const plan =
    'findUnique' in client.planProjection
      ? await client.planProjection.findUnique({ where: { planId }, select: { targetProjectId: true } })
      : null
  if (!plan?.targetProjectId) throw new ServiceError('Plan must be bound to a target project.', 'CONFLICT')
  const targetProjectId = plan.targetProjectId
  const ownerTag = await ensureIdentifierTag(projectionTag(planId), targetProjectId, client)
  const moduleIds = new Set<string>()
  const locatorGroupIds = new Set<string>()
  const locatorIds = new Set<string>()

  for (const validationNode of validation.validations) {
    const artifacts = validationNode.appraiseArtifacts

    for (const artifactModule of artifacts.modules) {
      const existing = await client.module.findUnique({ where: { id: artifactModule.id } })
      assertMatchingEntity(
        existing,
        { name: artifactModule.name, parentId: artifactModule.parentId ?? null, targetProjectId },
        'Module',
        artifactModule.id,
      )
      await client.module.upsert({
        where: { id: artifactModule.id },
        update: { name: artifactModule.name, parentId: artifactModule.parentId ?? null },
        create: {
          id: artifactModule.id,
          name: artifactModule.name,
          parentId: artifactModule.parentId ?? null,
          targetProjectId,
        },
      })
      moduleIds.add(artifactModule.id)
    }

    for (const locatorGroup of artifacts.locatorGroups) {
      const existing = await client.locatorGroup.findUnique({ where: { id: locatorGroup.id } })
      assertMatchingEntity(
        existing,
        { name: locatorGroup.name, route: locatorGroup.route, moduleId: locatorGroup.moduleId, targetProjectId },
        'LocatorGroup',
        locatorGroup.id,
      )
      await client.locatorGroup.upsert({
        where: { id: locatorGroup.id },
        update: { name: locatorGroup.name, route: locatorGroup.route, moduleId: locatorGroup.moduleId },
        create: {
          id: locatorGroup.id,
          name: locatorGroup.name,
          route: locatorGroup.route,
          moduleId: locatorGroup.moduleId,
          targetProjectId,
        },
      })
      locatorGroupIds.add(locatorGroup.id)
    }

    for (const locator of artifacts.locators) {
      const existing = await client.locator.findUnique({ where: { id: locator.id } })
      assertMatchingEntity(
        existing,
        { name: locator.name, value: locator.value, locatorGroupId: locator.locatorGroupId, targetProjectId },
        'Locator',
        locator.id,
      )
      await client.locator.upsert({
        where: { id: locator.id },
        update: { name: locator.name, value: locator.value, locatorGroupId: locator.locatorGroupId },
        create: {
          id: locator.id,
          name: locator.name,
          value: locator.value,
          locatorGroupId: locator.locatorGroupId,
          targetProjectId,
        },
      })
      locatorIds.add(locator.id)
    }

    for (const testCase of artifacts.testCases) {
      await assertProjectionOwnedTestCase(testCase.id, targetProjectId, client)
      await client.testCase.upsert({
        where: { id: testCase.id },
        update: {
          title: testCase.title,
          description: testCase.description,
          tags: {
            connect: [
              { id: ownerTag.id },
              { id: (await ensureIdentifierTag(testCaseTag(testCase.id), targetProjectId, client)).id },
            ],
          },
        },
        create: {
          id: testCase.id,
          title: testCase.title,
          description: testCase.description,
          targetProjectId,
          tags: {
            connect: [
              { id: ownerTag.id },
              { id: (await ensureIdentifierTag(testCaseTag(testCase.id), targetProjectId, client)).id },
            ],
          },
        },
      })
      await client.testCaseStep.deleteMany({ where: { testCaseId: testCase.id } })
      for (const step of testCase.steps.sort((left, right) => left.order - right.order)) {
        // V2 managed validation owns an exact Step Invocation. It deliberately
        // does not look up, choose between, or create TemplateStep rows.
        if (!step.invocation)
          throw new ServiceError('Managed validation projection requires an exact Step Invocation.', 'CONFLICT')
        await client.testCaseStep.create({
          data: {
            id: step.id,
            testCaseId: testCase.id,
            order: step.order,
            gherkinStep: step.gherkinStep,
            icon: TemplateStepIcon.VALIDATION,
            label: step.label,
            operationInvocationJson: canonicalContractJson(step.invocation),
            parameters: {
              create: step.parameters.map((parameter, order) => ({
                name: parameter.name,
                value: parameter.value,
                order,
                type: parameterType(parameter.type),
                locatorId: parameter.locatorId ?? null,
              })),
            },
          },
        })
      }
    }

    for (const testSuite of artifacts.testSuites) {
      await assertProjectionOwnedTestSuite(testSuite.id, targetProjectId, client)
      const suiteIdentifierTag = await ensureIdentifierTag(testSuiteTag(testSuite.id), targetProjectId, client)
      await client.testSuite.upsert({
        where: { id: testSuite.id },
        update: {
          name: testSuite.name,
          description: testSuite.description ?? null,
          moduleId: testSuite.moduleId,
          targetProjectId,
          tags: { connect: [{ id: ownerTag.id }, { id: suiteIdentifierTag.id }] },
          testCases: { set: testSuite.testCaseIds.map(id => ({ id })) },
        },
        create: {
          id: testSuite.id,
          name: testSuite.name,
          description: testSuite.description ?? null,
          moduleId: testSuite.moduleId,
          targetProjectId,
          tags: { connect: [{ id: ownerTag.id }, { id: suiteIdentifierTag.id }] },
          testCases: { connect: testSuite.testCaseIds.map(id => ({ id })) },
        },
      })
    }
  }

  if (plan.targetProjectId) {
    const resources = [
      ...[...moduleIds].map(entityId => ({ entityType: 'module' as const, entityId })),
      ...[...locatorGroupIds].map(entityId => ({ entityType: 'locator-group' as const, entityId })),
      ...[...locatorIds].map(entityId => ({ entityType: 'locator' as const, entityId })),
      ...validation.validations.flatMap(item =>
        item.appraiseArtifacts.testSuites.map(resource => ({
          entityType: 'test-suite' as const,
          entityId: resource.id,
        })),
      ),
      ...validation.validations.flatMap(item =>
        item.appraiseArtifacts.testCases.map(resource => ({ entityType: 'test-case' as const, entityId: resource.id })),
      ),
    ]
    for (const resource of resources)
      await registerProjectResourceOwnership(
        {
          targetProjectId: plan.targetProjectId,
          ...resource,
          origin: 'validation-publication',
          provenance: { planId },
          content: resource,
        },
        client,
      )
  }

  return {
    modules: moduleIds.size,
    locatorGroups: locatorGroupIds.size,
    locators: locatorIds.size,
    testSuites: new Set(
      validation.validations.flatMap(item => item.appraiseArtifacts.testSuites.map(suite => suite.id)),
    ).size,
    testCases: new Set(
      validation.validations.flatMap(item => item.appraiseArtifacts.testCases.map(testCase => testCase.id)),
    ).size,
  }
}

export async function projectValidationArtifacts(
  input: { planId: string; validation: ValidationArtifact },
  client: PrismaClient,
) {
  return client.$transaction(tx => projectValidationArtifactsInTransaction(input.planId, input.validation, tx))
}

type CompiledProjectionInput = {
  planId: string
  validation: ValidationArtifact
  astId: string
  astHash: string
  compiledExtensions: CompiledCustomExtension[]
  assertCurrent?: (transaction: PrismaClient) => Promise<void>
  publishOperationId?: string
}

async function assertPublishOperationOwnership(input: CompiledProjectionInput, transaction: ProjectionClient) {
  if (!input.publishOperationId) return
  const operation = await transaction.validationAstPublishOperation.findUniqueOrThrow({
    where: { id: input.publishOperationId },
    include: { plan: true, targetProject: true },
  })
  const matches = [
    operation.planId === input.planId,
    operation.plan.sourceHash === operation.expectedPlanHash,
    operation.targetProject.fingerprint === operation.targetFingerprint,
  ]
  if (matches.some(match => !match)) throw new ServiceError('Publish operation ownership context changed.', 'CONFLICT')
}

async function recordCompiledEvent(
  input: CompiledProjectionInput,
  counts: Awaited<ReturnType<typeof projectValidationArtifactsInTransaction>>,
  plan: { id: string },
  transaction: ProjectionClient,
) {
  const latest = await transaction.planEvent.findFirst({
    where: { planProjectionId: plan.id },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  })
  const eventData = {
    planProjectionId: plan.id,
    publishOperationId: input.publishOperationId,
    sequence: (latest?.sequence ?? 0) + 1,
    type: 'validation_ast_compiled',
    payloadJson: JSON.stringify({
      operationId: input.publishOperationId,
      astId: input.astId,
      astHash: input.astHash,
      validationIds: input.validation.validations.map(item => item.id),
      compiledExtensionHashes: input.compiledExtensions.map(item => item.compiledHash),
      counts,
    }),
  }
  if (input.publishOperationId) {
    await transaction.planEvent.upsert({
      where: {
        publishOperationId_type: { publishOperationId: input.publishOperationId, type: 'validation_ast_compiled' },
      },
      update: {},
      create: eventData,
    })
    return
  }
  const compiledEvent = await transaction.planEvent.findFirst({
    where: { planProjectionId: plan.id, type: 'validation_ast_compiled', payloadJson: { contains: input.astHash } },
  })
  if (!compiledEvent) await transaction.planEvent.create({ data: eventData })
}

async function advancePublishProjection(input: CompiledProjectionInput, transaction: ProjectionClient) {
  if (!input.publishOperationId) return
  const advanced = await transaction.validationAstPublishOperation.updateMany({
    where: { id: input.publishOperationId, phase: 'artifacts_written' },
    data: { phase: 'projected', failure: null },
  })
  if (advanced.count !== 1) throw new ServiceError('Publish projection phase is stale.', 'CONFLICT')
}

async function projectCompiledValidationArtifactsInTransaction(
  input: CompiledProjectionInput,
  transaction: Prisma.TransactionClient,
) {
  await assertPublishOperationOwnership(input, transaction)
  await input.assertCurrent?.(transaction as PrismaClient)
  const counts = await projectValidationArtifactsInTransaction(input.planId, input.validation, transaction)
  const plan = await transaction.planProjection.findUniqueOrThrow({ where: { planId: input.planId } })
  await transaction.planProjection.update({
    where: { id: plan.id },
    data: { validationJson: JSON.stringify(input.validation) },
  })
  await recordCompiledEvent(input, counts, plan, transaction)
  await advancePublishProjection(input, transaction)
  return counts
}

export async function projectCompiledValidationArtifacts(input: CompiledProjectionInput, client: PrismaClient) {
  return client.$transaction(transaction => projectCompiledValidationArtifactsInTransaction(input, transaction))
}
