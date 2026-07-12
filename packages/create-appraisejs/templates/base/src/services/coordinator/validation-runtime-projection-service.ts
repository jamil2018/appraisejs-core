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

import prisma from '@/config/db-config'
import type { ValidationArtifact } from '@/lib/plan-contract'
import type { CompiledCustomExtension } from '@/lib/validation-ast'
import { hashFileContent } from '@/lib/validation-review/file-review'
import { canonicalTagExpression, canonicalTagName } from '@/lib/tag-filters'
import { ServiceError } from '@/services/shared/errors'

import { templateStepGroupPath } from './template-step-group-path'
import { validateValidationLocatorBindings } from './validation-locator-resolution-service'

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
  client?: RuntimeClient
}
type RuntimeProjection = NonNullable<ValidationArtifact['runtimeProjections']>[number]
type RuntimePreflight = NonNullable<ValidationArtifact['runtimePreflight']>
type RuntimePreflightBlocker = RuntimePreflight['blockers'][number]

const projectionTag = (planId: string) => `@appraise_plan_${planId}`
const testCaseTag = (testCaseId: string) => `@tc_${testCaseId}`
const testSuiteTag = (testSuiteId: string) => `@ts_${testSuiteId}`
const validationStepGroupName = 'Appraise validation projection'
function runtimeImport(projectRoot: string) {
  const runtimePath = path.join(projectRoot, 'packages/cucumber-runtime/dist/index.js').replace(/\\/g, '/')
  return `import { When, Then, CustomWorld, expect, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '${runtimePath}';\nimport type { SelectorName } from '${runtimePath}';`
}

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

async function readFileIfExists(filePath: string) {
  return fs.readFile(filePath, 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  })
}

async function writeRuntimeFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content)
}

async function copyRuntimeFile(source: string, destination: string) {
  if (source === destination) return
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.copyFile(source, destination)
}

function runtimeProjection(input: {
  role: RuntimeProjection['role']
  declaredPath: string
  targetPath: string
  runtimePath: string
  materialization: RuntimeProjection['materialization']
  content: string | null
}): RuntimeProjection {
  return {
    role: input.role,
    declaredPath: input.declaredPath,
    targetPath: input.targetPath,
    runtimePath: input.runtimePath,
    materialization: input.materialization,
    contentHash: input.content === null ? null : hashFileContent(input.content),
  }
}

function suiteIdByTestCase(validation: ValidationArtifact) {
  const suiteByCase = new Map<string, string>()
  for (const node of validation.validations) {
    for (const suite of node.appraiseArtifacts.testSuites) {
      for (const testCaseId of suite.testCaseIds) {
        const existingSuiteId = suiteByCase.get(testCaseId)
        if (existingSuiteId && existingSuiteId !== suite.id) {
          throw new ServiceError(
            `Projected test case "${testCaseId}" belongs to multiple suites.`,
            'VALIDATION',
            undefined,
            { blockerType: 'projection_conflict', entityType: 'TestCase', entityId: testCaseId },
          )
        }
        suiteByCase.set(testCaseId, suite.id)
      }
    }
  }
  return suiteByCase
}

export function featureTextForPath(planId: string, validation: ValidationArtifact, featurePath: string) {
  const nodes = validation.validations.filter(node => node.gherkinPaths.includes(featurePath))
  const suiteByCase = suiteIdByTestCase(validation)
  return [
    projectionTag(planId),
    `Feature: ${path.basename(featurePath, path.extname(featurePath))}`,
    '',
    ...nodes.flatMap(node =>
      node.appraiseArtifacts.testCases.flatMap(testCase => {
        const suiteId = suiteByCase.get(testCase.id)
        if (!suiteId) {
          throw new ServiceError(
            `Projected test case "${testCase.id}" is not assigned to a suite.`,
            'VALIDATION',
            undefined,
            { blockerType: 'projection_conflict', entityType: 'TestCase', entityId: testCase.id },
          )
        }
        return [
          `  @appraise_validation_${node.id} ${testSuiteTag(suiteId)} ${testCaseTag(testCase.id)}`,
          `  Scenario: ${testCase.title}`,
          ...testCase.steps.sort((left, right) => left.order - right.order).map(step => `    ${step.gherkinStep}`),
          '',
        ]
      }),
    ),
  ].join('\n')
}

// fallow-ignore-next-line complexity
function uniqueRuntimeEntries(validation: ValidationArtifact) {
  const entries = new Map<string, RuntimeProjection['role']>()
  for (const filePath of validation.reusedStepPaths ?? []) entries.set(filePath, 'step')
  for (const ref of validation.reusedTemplateStepRefs ?? []) {
    if (ref.path) entries.set(ref.path, 'step')
  }
  for (const node of validation.validations) {
    for (const filePath of node.gherkinPaths) entries.set(filePath, 'gherkin')
    for (const filePath of node.stepPaths) entries.set(filePath, 'step')
    entries.set(node.executable.path, entries.get(node.executable.path) ?? 'executable')
  }
  for (const filePath of validation.files.filter(file => file.status !== 'deleted').map(file => file.path)) {
    entries.set(filePath, entries.get(filePath) ?? 'file')
  }
  for (const filePath of validation.manifestPaths) entries.set(filePath, entries.get(filePath) ?? 'manifest')
  return [...entries].map(([declaredPath, role]) => ({ declaredPath, role }))
}

function stripLeadingJSDoc(functionDefinition: string) {
  return functionDefinition.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/u, '').trim()
}

function groupJSDoc(input: { name: string; description?: string | null; type?: string | null }) {
  return [
    '/**',
    ` * @name ${input.name}`,
    ...(input.description ? [` * @description ${input.description}`] : []),
    ` * @type ${input.type ?? 'VALIDATION'}`,
    ' */',
  ].join('\n')
}

async function templateStepGroupContentForPath(filePath: string, projectRoot: string, client: RuntimeClient) {
  const groups = await client.templateStepGroup.findMany({
    include: { templateSteps: { orderBy: { createdAt: 'asc' } } },
    orderBy: { name: 'asc' },
  })
  const group = groups.find(item => templateStepGroupPath(item.name, item.type) === filePath)
  if (!group) return null
  const definitions = group.templateSteps
    .map(step => {
      const functionDefinition = step.functionDefinition?.trim()
      if (!functionDefinition) return null
      return [
        '/**',
        ` * @name ${step.name}`,
        ...(step.description ? [` * @description ${step.description}`] : []),
        ` * @icon ${step.icon}`,
        ' */',
        stripLeadingJSDoc(functionDefinition),
      ].join('\n')
    })
    .filter((definition): definition is string => Boolean(definition))
    .join('\n\n')
  const body =
    definitions ||
    '// This file is generated automatically. Add template steps to this group to generate executable content.'
  return `${groupJSDoc(group)}\n${runtimeImport(projectRoot)}\n\n${body}\n`
}

function preflightBlocker(
  code: string,
  declaredPath: string,
  message: string,
  recovery: string,
  phrase?: string,
): RuntimePreflightBlocker {
  return {
    code,
    path: ['runtimeProjections', declaredPath],
    ...(phrase ? { phrase } : {}),
    message,
    recovery,
  }
}

function buildRuntimePreflight(
  projections: RuntimeProjection[],
  validation: ValidationArtifact,
  targetRoot: string,
  projectRoot: string,
): RuntimePreflight {
  const blockers = projections.flatMap(projection => {
    if (projection.contentHash) return []
    return [
      preflightBlocker(
        projection.role === 'step' ? 'missing-runtime-step-path' : 'missing-runtime-path',
        projection.declaredPath,
        `Runtime ${projection.role} path is missing: ${projection.runtimePath}.`,
        'Materialize the declared validation runtime file, mark the path as reused, or revise the validation draft.',
      ),
    ]
  })
  blockers.push(...validateValidationLocatorBindings(validation.validations))
  return {
    status: blockers.length > 0 ? 'blocked' : 'passed',
    checkedAt: new Date().toISOString(),
    blockers,
    runtimePreparation: {
      owner: 'appraise',
      binary: path.join(projectRoot, 'node_modules/@cucumber/cucumber/bin/cucumber.js'),
      targetFilesChanged: projections.some(projection => projection.materialization === 'generated'),
    },
    executionPackets: validation.validations.flatMap(node => {
      const suiteByCase = suiteIdByTestCase(validation)
      const tags = node.testCaseIds.map(testCaseId => {
        const suiteId = suiteByCase.get(testCaseId)
        if (!suiteId)
          throw new ServiceError(`Projected test case "${testCaseId}" is not assigned to a suite.`, 'VALIDATION')
        return `(${testSuiteTag(suiteId)} and ${testCaseTag(testCaseId)})`
      })
      const runtimePaths = new Map(projections.map(projection => [projection.declaredPath, projection.runtimePath]))
      return node.matrix.map(matrix => ({
        validationId: node.id,
        browser: matrix.browser,
        environment: matrix.environment,
        targetRoot,
        featurePaths: node.gherkinPaths.map(filePath => runtimePaths.get(filePath) ?? filePath),
        importPaths: node.stepPaths.map(filePath => runtimePaths.get(filePath) ?? filePath),
        tagExpression: tags.join(' or '),
        expectedScenarioCount: node.testCaseIds.length,
        reportPath: path.join(targetRoot, 'automation/reports/<runId>/cucumber.json'),
      }))
    }),
  }
}

function declaredValidationPaths(validation: ValidationArtifact) {
  return [
    ...new Set([
      ...(validation.reusedStepPaths ?? []),
      ...(validation.reusedTemplateStepRefs ?? [])
        .map(ref => ref.path)
        .filter((filePath): filePath is string => Boolean(filePath)),
      ...validation.files.filter(file => file.status !== 'deleted').map(file => file.path),
      ...validation.validations.flatMap(item => [...item.gherkinPaths, ...item.stepPaths, item.executable.path]),
      ...validation.manifestPaths,
    ]),
  ]
}

// fallow-ignore-next-line complexity
async function materializeRuntimeEntry(input: {
  entry: { declaredPath: string; role: RuntimeProjection['role'] }
  planId: string
  validation: ValidationArtifact
  validationFileRoot: string
  runtimeRoot: string
  reusedPaths: Set<string>
  featurePaths: Set<string>
  client: RuntimeClient
  projectRoot: string
}) {
  const targetPath = resolveValidationPath(input.validationFileRoot, input.entry.declaredPath)
  const runtimePath = resolveValidationPath(input.runtimeRoot, input.entry.declaredPath)

  if (input.entry.role === 'gherkin' && input.featurePaths.has(input.entry.declaredPath)) {
    const content = featureTextForPath(input.planId, input.validation, input.entry.declaredPath)
    await writeRuntimeFile(targetPath, content)
    if (runtimePath !== targetPath) await writeRuntimeFile(runtimePath, content)
    return runtimeProjection({
      ...input.entry,
      targetPath,
      runtimePath,
      materialization: 'generated',
      content,
    })
  }

  if (input.entry.role === 'step' && input.reusedPaths.has(input.entry.declaredPath)) {
    const content = await templateStepGroupContentForPath(input.entry.declaredPath, input.projectRoot, input.client)
    if (content !== null) {
      await writeRuntimeFile(targetPath, content)
      if (runtimePath !== targetPath) await writeRuntimeFile(runtimePath, content)
      return runtimeProjection({
        ...input.entry,
        targetPath,
        runtimePath,
        materialization: 'generated',
        content,
      })
    }
  }

  const targetContent = await readFileIfExists(targetPath)
  if (targetContent !== null) await copyRuntimeFile(targetPath, runtimePath)
  const runtimeContent = await readFileIfExists(runtimePath)
  return runtimeProjection({
    ...input.entry,
    targetPath,
    runtimePath,
    materialization:
      input.entry.role === 'step' && input.reusedPaths.has(input.entry.declaredPath)
        ? 'reused'
        : targetContent !== null && targetPath !== runtimePath
          ? 'copied'
          : 'declared',
    content: runtimeContent,
  })
}

export async function materializeValidationRuntime(input: ValidationFileRoot & { validation: ValidationArtifact }) {
  const projections: RuntimeProjection[] = []
  const reusedPaths = new Set([
    ...(input.validation.reusedStepPaths ?? []),
    ...(input.validation.reusedTemplateStepRefs ?? [])
      .map(ref => ref.path)
      .filter((path): path is string => Boolean(path)),
  ])
  const featurePaths = new Set(input.validation.validations.flatMap(node => node.gherkinPaths))
  const runtimeRoot = input.targetProject ? input.validationFileRoot : input.projectRoot
  const client = input.client ?? prisma

  for (const entry of uniqueRuntimeEntries(input.validation)) {
    projections.push(
      await materializeRuntimeEntry({
        entry,
        planId: input.validation.planId,
        validation: input.validation,
        validationFileRoot: input.validationFileRoot,
        runtimeRoot,
        reusedPaths,
        featurePaths,
        client,
        projectRoot: input.projectRoot,
      }),
    )
  }

  const runtimePreflight = buildRuntimePreflight(
    projections,
    input.validation,
    input.validationFileRoot,
    input.projectRoot,
  )
  return { ...input.validation, runtimeProjections: projections, runtimePreflight }
}

export function assertRuntimePreflightPassed(validation: ValidationArtifact) {
  if (validation.runtimePreflight?.status !== 'blocked') return
  throw new ServiceError('Validation runtime preflight failed.', 'CONFLICT', undefined, {
    blockerType: 'validation_runtime_preflight',
    runtimePreflight: validation.runtimePreflight,
    nextRecommendedAction:
      'Resolve runtime projection blockers, republish validation artifacts, and resubmit validation review.',
  })
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
  const canonicalName = canonicalTagName(name)
  const tagExpression = canonicalTagExpression(name)
  const existing = await client.tag.findFirst({
    where: {
      type: TagType.IDENTIFIER,
      OR: [{ name: canonicalName }, { name }, { tagExpression }, { tagExpression: canonicalName }],
    },
  })
  if (existing) return existing
  return client.tag.create({ data: { name: canonicalName, tagExpression, type: TagType.IDENTIFIER } })
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

async function assertProjectionOwnedTestCase(id: string, client: RuntimeClient) {
  const existing = await client.testCase.findUnique({ where: { id }, include: { tags: true } })
  assertProjectionOwned(existing, 'TestCase', id)
}

async function assertProjectionOwnedTestSuite(id: string, client: RuntimeClient) {
  const existing = await client.testSuite.findUnique({ where: { id }, include: { tags: true } })
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
      await assertProjectionOwnedTestCase(testCase.id, client)
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
      await assertProjectionOwnedTestSuite(testSuite.id, client)
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

type CompiledProjectionInput = {
  planId: string
  validation: ValidationArtifact
  astId: string
  astHash: string
  compiledExtensions: CompiledCustomExtension[]
  assertCurrent?: (transaction: PrismaClient) => Promise<void>
  publishOperationId?: string
}

async function assertPublishOperationOwnership(input: CompiledProjectionInput, transaction: RuntimeClient) {
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
  transaction: RuntimeClient,
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

async function advancePublishProjection(input: CompiledProjectionInput, transaction: RuntimeClient) {
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
