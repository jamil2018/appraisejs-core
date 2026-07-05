import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  StepParameterType,
  TagType,
  TemplateStepGroupType,
  TemplateStepIcon,
  TemplateStepType,
  type Prisma,
  type PrismaClient,
} from '@prisma/client'

import type { ValidationArtifact } from '@/lib/plan-contract'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { ServiceError } from '@/services/shared/errors'

type RuntimeClient = PrismaClient | Prisma.TransactionClient
type TargetProjectMetadata = {
  id: string
  canonicalPath: string
  displayName: string
  fingerprint: string
} | null

type ValidationFileRoot = {
  projectRoot: string
  validationFileRoot: string
  targetProject: TargetProjectMetadata
}

const projectionTag = (planId: string) => `@appraise_plan_${planId}`
const testCaseTag = (testCaseId: string) => `@tc_${testCaseId}`
const testSuiteTag = (testSuiteId: string) => `@ts_${testSuiteId}`
const validationStepGroupName = 'Appraise validation projection'

function resolveValidationPath(root: string, filePath: string) {
  const absolutePath = path.resolve(root, filePath)
  const relative = path.relative(root, absolutePath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ServiceError(`Validation file path escapes the project: ${filePath}`, 'VALIDATION', undefined, {
      blockerType: 'missing_validation_files',
      path: filePath,
      resolvedRoot: root,
    })
  }
  return absolutePath
}

function declaredValidationPaths(validation: ValidationArtifact) {
  return [
    ...new Set([
      ...validation.files.filter(file => file.status !== 'deleted').map(file => file.path),
      ...validation.validations.flatMap(item => [...item.gherkinPaths, ...item.stepPaths, item.executable.path]),
      ...validation.manifestPaths,
    ]),
  ]
}

export async function assertValidationFilesMaterialized(
  input: ValidationFileRoot & { validation: ValidationArtifact; verifyHashes?: boolean },
) {
  const missingFiles: Array<{ path: string; resolvedAbsolutePath: string }> = []
  const changedFiles: Array<{
    path: string
    resolvedAbsolutePath: string
    expectedHash: string | null
    currentHash: string | null
  }> = []
  const fileEvidence = new Map(input.validation.files.map(file => [file.path, file]))
  const currentHashes = new Map<string, string>()

  for (const filePath of declaredValidationPaths(input.validation)) {
    const absolutePath = resolveValidationPath(input.validationFileRoot, filePath)
    const content = await fs.readFile(absolutePath, 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (content === null) {
      missingFiles.push({ path: filePath, resolvedAbsolutePath: absolutePath })
      continue
    }
    const evidence = fileEvidence.get(filePath)
    const currentHash = hashFileContent(content)
    currentHashes.set(filePath, currentHash)
    if (input.verifyHashes !== false && evidence?.contentHash && currentHash !== evidence.contentHash) {
      changedFiles.push({
        path: filePath,
        resolvedAbsolutePath: absolutePath,
        expectedHash: evidence.contentHash,
        currentHash,
      })
    }
  }

  if (missingFiles.length > 0 || changedFiles.length > 0) {
    throw new ServiceError(
      `Validation files must exist with current hashes before review: ${[
        ...missingFiles.map(file => file.path),
        ...changedFiles.map(file => file.path),
      ].join(', ')}.`,
      'CONFLICT',
      undefined,
      {
        blockerType: 'missing_validation_files',
        missingFiles,
        changedFiles,
        targetProject: input.targetProject,
        hubProject: { canonicalPath: input.projectRoot },
        resolvedRoot: input.validationFileRoot,
        nextRecommendedAction:
          'Materialize the declared validation files in the target workspace, then retry validation_publish.',
      },
    )
  }

  return {
    ...input.validation,
    files: input.validation.files.map(file =>
      file.status === 'deleted' ? file : { ...file, contentHash: currentHashes.get(file.path) ?? file.contentHash },
    ),
  }
}

export async function assertValidationEnvironmentsReady(
  validation: ValidationArtifact,
  client: RuntimeClient,
  targetProject: TargetProjectMetadata,
) {
  const requiredNames = [
    ...new Set(validation.validations.flatMap(item => item.matrix.map(entry => entry.environment))),
  ]
  const existing = await client.environment.findMany({
    where: { name: { in: requiredNames } },
    select: { name: true },
  })
  const found = new Set(existing.map(environment => environment.name))
  const missingEnvironments = requiredNames.filter(name => !found.has(name))
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

async function ensureIdentifierTag(name: string, client: RuntimeClient) {
  const existing = await client.tag.findFirst({ where: { name, type: TagType.IDENTIFIER } })
  if (existing) return existing
  return client.tag.create({ data: { name, tagExpression: name, type: TagType.IDENTIFIER } })
}

async function assertProjectionOwnedTestCase(id: string, planId: string, client: RuntimeClient) {
  const existing = await client.testCase.findUnique({ where: { id }, include: { tags: true } })
  if (!existing) return
  if (!existing.tags.some(tag => tag.name.startsWith('@appraise_plan_'))) {
    throw new ServiceError(`Validation projection conflicts with existing test case "${id}".`, 'CONFLICT', undefined, {
      blockerType: 'projection_conflict',
      entityType: 'TestCase',
      entityId: id,
    })
  }
}

async function assertProjectionOwnedTestSuite(id: string, planId: string, client: RuntimeClient) {
  const existing = await client.testSuite.findUnique({ where: { id }, include: { tags: true } })
  if (!existing) return
  if (!existing.tags.some(tag => tag.name.startsWith('@appraise_plan_'))) {
    throw new ServiceError(`Validation projection conflicts with existing test suite "${id}".`, 'CONFLICT', undefined, {
      blockerType: 'projection_conflict',
      entityType: 'TestSuite',
      entityId: id,
    })
  }
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

async function ensureValidationTemplateStep(
  step: ValidationArtifact['validations'][number]['appraiseArtifacts']['testCases'][number]['steps'][number],
  client: RuntimeClient,
) {
  if (step.templateStepId) {
    const existing = await client.templateStep.findUnique({ where: { id: step.templateStepId } })
    if (existing) return existing
  }
  if (step.templateStepName) {
    const existing = await client.templateStep.findFirst({ where: { name: step.templateStepName } })
    if (existing) return existing
  }
  const group =
    (await client.templateStepGroup.findFirst({ where: { name: validationStepGroupName } })) ??
    (await client.templateStepGroup.create({
      data: {
        name: validationStepGroupName,
        description: 'Stable template steps created from approved validation artifacts.',
        type: TemplateStepGroupType.VALIDATION,
      },
    }))
  const name = step.templateStepName ?? `Validation step ${step.id}`
  const existing = await client.templateStep.findFirst({ where: { name, templateStepGroupId: group.id } })
  if (existing) return existing
  return client.templateStep.create({
    data: {
      name,
      description: 'Created from an approved validation artifact.',
      signature: step.gherkinStep,
      type: TemplateStepType.ASSERTION,
      icon: TemplateStepIcon.VALIDATION,
      templateStepGroupId: group.id,
      parameters: {
        create: step.parameters.map((parameter, order) => ({
          name: parameter.name,
          order,
          type: parameterType(parameter.type),
        })),
      },
    },
  })
}

// fallow-ignore-next-line complexity
async function projectValidationArtifactsInTransaction(
  planId: string,
  validation: ValidationArtifact,
  client: RuntimeClient,
) {
  const ownerTag = await ensureIdentifierTag(projectionTag(planId), client)
  const moduleIds = new Set<string>()
  const locatorGroupIds = new Set<string>()
  const locatorIds = new Set<string>()

  for (const validationNode of validation.validations) {
    const artifacts = validationNode.appraiseArtifacts

    for (const artifactModule of artifacts.modules) {
      const existing = await client.module.findUnique({ where: { id: artifactModule.id } })
      assertMatchingEntity(
        existing,
        { name: artifactModule.name, parentId: artifactModule.parentId ?? null },
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
        },
      })
      moduleIds.add(artifactModule.id)
    }

    for (const locatorGroup of artifacts.locatorGroups) {
      const existing = await client.locatorGroup.findUnique({ where: { id: locatorGroup.id } })
      assertMatchingEntity(
        existing,
        { name: locatorGroup.name, route: locatorGroup.route, moduleId: locatorGroup.moduleId },
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
        },
      })
      locatorGroupIds.add(locatorGroup.id)
    }

    for (const locator of artifacts.locators) {
      const existing = await client.locator.findUnique({ where: { id: locator.id } })
      assertMatchingEntity(
        existing,
        { name: locator.name, value: locator.value, locatorGroupId: locator.locatorGroupId },
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
        },
      })
      locatorIds.add(locator.id)
    }

    for (const testCase of artifacts.testCases) {
      await assertProjectionOwnedTestCase(testCase.id, planId, client)
      await client.testCase.upsert({
        where: { id: testCase.id },
        update: {
          title: testCase.title,
          description: testCase.description,
          tags: {
            connect: [{ id: ownerTag.id }, { id: (await ensureIdentifierTag(testCaseTag(testCase.id), client)).id }],
          },
        },
        create: {
          id: testCase.id,
          title: testCase.title,
          description: testCase.description,
          tags: {
            connect: [{ id: ownerTag.id }, { id: (await ensureIdentifierTag(testCaseTag(testCase.id), client)).id }],
          },
        },
      })
      await client.testCaseStep.deleteMany({ where: { testCaseId: testCase.id } })
      for (const step of testCase.steps.sort((left, right) => left.order - right.order)) {
        const templateStep = await ensureValidationTemplateStep(step, client)
        await client.testCaseStep.create({
          data: {
            id: step.id,
            testCaseId: testCase.id,
            order: step.order,
            gherkinStep: step.gherkinStep,
            icon: templateStep.icon,
            label: step.label,
            templateStepId: templateStep.id,
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
      await assertProjectionOwnedTestSuite(testSuite.id, planId, client)
      const suiteIdentifierTag = await ensureIdentifierTag(testSuiteTag(testSuite.id), client)
      await client.testSuite.upsert({
        where: { id: testSuite.id },
        update: {
          name: testSuite.name,
          description: testSuite.description ?? null,
          moduleId: testSuite.moduleId,
          tags: { connect: [{ id: ownerTag.id }, { id: suiteIdentifierTag.id }] },
          testCases: { set: testSuite.testCaseIds.map(id => ({ id })) },
        },
        create: {
          id: testSuite.id,
          name: testSuite.name,
          description: testSuite.description ?? null,
          moduleId: testSuite.moduleId,
          tags: { connect: [{ id: ownerTag.id }, { id: suiteIdentifierTag.id }] },
          testCases: { connect: testSuite.testCaseIds.map(id => ({ id })) },
        },
      })
    }
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

export async function assertProjectedBaselineRecords(
  planId: string,
  validation: ValidationArtifact,
  client: RuntimeClient,
  targetProject: TargetProjectMetadata,
) {
  const requiredCaseIds = [...new Set(validation.validations.flatMap(item => item.testCaseIds))]
  const testCases = await client.testCase.findMany({
    where: { id: { in: requiredCaseIds } },
    select: { id: true, TestSuite: { select: { id: true } } },
  })
  const foundCaseIds = new Set(testCases.map(testCase => testCase.id))
  const missingTestCaseIds = requiredCaseIds.filter(id => !foundCaseIds.has(id))
  if (missingTestCaseIds.length > 0) {
    throw new ServiceError(
      `Projected validation test cases are missing: ${missingTestCaseIds.join(', ')}.`,
      'CONFLICT',
      undefined,
      {
        blockerType: 'missing_projected_test_cases',
        missingTestCaseIds,
        targetProject,
        nextRecommendedAction: 'Resubmit validation review so Appraise can project approved validation artifacts.',
      },
    )
  }
  const testCaseIdsWithoutSuite = testCases
    .filter(testCase => testCase.TestSuite.length === 0)
    .map(testCase => testCase.id)
  if (testCaseIdsWithoutSuite.length > 0) {
    throw new ServiceError(
      `Projected validation test cases are not assigned to suites: ${testCaseIdsWithoutSuite.join(', ')}.`,
      'CONFLICT',
      undefined,
      {
        blockerType: 'test_case_without_suite',
        testCaseIdsWithoutSuite,
        targetProject,
      },
    )
  }
  await assertValidationEnvironmentsReady(validation, client, targetProject)
  void planId
}
