import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { parseYamlArtifact, type PlanArtifact } from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { templateStepGroupPath } from './template-step-group-path'
import {
  readVisibleResourceOwnerships,
  type ProjectResourceEntityType,
} from '@/services/project-resource/project-resource-ownership-service'

type Options = { client?: PrismaClient; projectDirectory?: string }
type ReusableRef = { id: string; name?: string; groupId?: string; groupName?: string; path?: string }

function hashContent(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function scoreIntent(candidate: string, intent: string) {
  const ignored = new Set(['and', 'the', 'then', 'when', 'with', 'from', 'into', 'that', 'this', 'step', 'user'])
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(part => part.length > 2 && !ignored.has(part)),
    )
  const candidateTokens = tokens(candidate)
  const intentTokens = tokens(intent)
  const matchedTerms = [...intentTokens].filter(token => candidateTokens.has(token))
  return {
    score: matchedTerms.length,
    confidence: intentTokens.size === 0 ? 0 : matchedTerms.length / intentTokens.size,
    matchedTerms,
  }
}

function signatureParameters(signature: string) {
  return Array.from(signature.matchAll(/\{([^}]+)\}/g), match => match[1]!.trim().toLowerCase())
}

function rankReusableResources(resources: ReusableResources, intent: string, parameterNames: string[] = []) {
  const requestedParameters = new Set(parameterNames.map(name => name.trim().toLowerCase()).filter(Boolean))
  const rank = <T extends { id: string; name: string }>(
    values: T[],
    searchable: (value: T) => string,
    parameters: (value: T) => string[],
  ) =>
    values
      .map(value => {
        const match = scoreIntent(searchable(value), intent)
        const availableParameters = parameters(value)
        const namedMatches = [...requestedParameters].filter(name => availableParameters.includes(name)).length
        const compatibleParameterCount = Math.min(
          requestedParameters.size,
          Math.max(namedMatches, availableParameters.length),
        )
        const parameterCompatibility =
          requestedParameters.size === 0 ? 1 : compatibleParameterCount / requestedParameters.size
        const confidence = Math.min(1, match.confidence * 0.8 + parameterCompatibility * 0.2)
        return {
          value,
          score: match.score + compatibleParameterCount,
          confidence,
          matchedTerms: match.matchedTerms,
          parameterCompatibility,
          explanation: `Matched ${match.matchedTerms.length} intent term(s); ${compatibleParameterCount}/${requestedParameters.size} requested parameter(s) fit the reusable signature.`,
        }
      })
      .filter(candidate => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.confidence - left.confidence ||
          left.value.name.localeCompare(right.value.name),
      )

  return {
    templateSteps: rank(
      resources.templateSteps,
      step => `${step.name} ${step.signature}`,
      step => signatureParameters(step.signature),
    ),
    stepBlocks: rank(
      resources.stepBlocks,
      block =>
        `${block.name} ${block.intent ?? ''} ${block.steps.map(step => `${step.templateStep.name} ${step.templateStep.signature}`).join(' ')}`,
      block => block.steps.flatMap(step => signatureParameters(step.templateStep.signature)),
    ),
  }
}

async function readPlanContext(planId: string, options: Options = {}) {
  const client = options.client ?? prisma
  const projectRoot = await findProjectRoot(options.projectDirectory)
  const repository = new PlanArtifactRepository(projectRoot)
  const [planStored, projection] = await Promise.all([
    repository.read('plan', planId),
    client.planProjection.findUnique({
      where: { planId },
      select: {
        sourceHash: true,
        targetProjectId: true,
        targetProject: {
          select: { id: true, displayName: true, canonicalPath: true, fingerprint: true },
        },
        tasks: {
          orderBy: { position: 'asc' },
          select: { taskId: true, title: true, description: true, validationIntent: true },
        },
      },
    }),
  ])
  return {
    client,
    projectRoot,
    repository,
    planStored,
    plan: parseYamlArtifact('plan', planStored.content) as PlanArtifact,
    projection,
  }
}

async function readReusableResources(client: PrismaClient, targetProjectId: string) {
  const [templateSteps, stepBlocks] = await Promise.all([
    client.templateStep.findMany({
      select: {
        id: true,
        name: true,
        signature: true,
        templateStepGroupId: true,
        templateStepGroup: { select: { id: true, name: true, type: true } },
      },
      orderBy: { name: 'asc' },
    }),
    client.stepBlock.findMany({
      select: {
        id: true,
        name: true,
        intent: true,
        steps: {
          orderBy: { order: 'asc' },
          select: {
            templateStep: {
              select: {
                id: true,
                name: true,
                signature: true,
                templateStepGroupId: true,
                templateStepGroup: { select: { id: true, name: true, type: true } },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])
  const ownerships = await readVisibleResourceOwnerships(targetProjectId, ['template-step', 'step-block'], client)
  if (ownerships === null) return { templateSteps, stepBlocks }
  return {
    templateSteps: templateSteps.filter(step => ownerships.has(`template-step:${step.id}`)),
    stepBlocks: stepBlocks.filter(block => ownerships.has(`step-block:${block.id}`)),
  }
}

type ReusableResources = Awaited<ReturnType<typeof readReusableResources>>
type ResolvedTemplateStep = ReusableResources['templateSteps'][number]
type ResolvedStepBlock = ReusableResources['stepBlocks'][number]

function templateStepRef(step: ResolvedTemplateStep): ReusableRef {
  return {
    id: step.id,
    name: step.name,
    groupId: step.templateStepGroupId,
    groupName: step.templateStepGroup.name,
    path: templateStepGroupPath(step.templateStepGroup.name, step.templateStepGroup.type),
  }
}

function stepBlockRef(block: ResolvedStepBlock): ReusableRef {
  return { id: block.id, name: block.name }
}

// fallow-ignore-next-line complexity
export async function resolveReusableValidationSteps(
  planId: string,
  input: { intent: string; parameterNames?: string[]; limit?: number },
  options: Options = {},
) {
  const startedAt = Date.now()
  const { client, projection } = await readPlanContext(planId, options)
  if (!projection?.targetProjectId) throw new Error('Plan must be bound to a target project.')
  const resources = await readReusableResources(client, projection.targetProjectId)
  const ranked = rankReusableResources(resources, input.intent, input.parameterNames)
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 25)
  const threshold = 0.5
  const templateSteps = ranked.templateSteps.slice(0, limit).map(({ value, ...match }, index) => ({
    ...templateStepRef(value),
    signature: value.signature,
    rank: index + 1,
    ...match,
  }))
  const stepBlocks = ranked.stepBlocks.slice(0, limit).map(({ value, ...match }, index) => ({
    ...stepBlockRef(value),
    rank: index + 1,
    ...match,
  }))
  const selected = [...templateSteps, ...stepBlocks]
    .filter(candidate => candidate.score >= 2 && candidate.confidence >= threshold)
    .sort((left, right) => right.score - left.score || right.confidence - left.confidence)[0]
  return {
    intent: input.intent,
    threshold,
    selected: selected ?? null,
    alternatives: { templateSteps, stepBlocks },
    metrics: {
      resolverCalls: 1,
      fallbackRequired: !selected,
      selectedRank: selected?.rank ?? null,
      candidatesConsidered: resources.templateSteps.length + resources.stepBlocks.length,
      returnedCandidates: templateSteps.length + stepBlocks.length,
      durationMs: Date.now() - startedAt,
    },
    nextRecommendedAction: selected
      ? 'Use the selected reusable reference in validation_test_shape_propose.'
      : 'Review the bounded alternatives, then propose a justified custom step only if none is compatible.',
  }
}

type ValidationResourceType =
  | 'modules'
  | 'testSuites'
  | 'testCases'
  | 'templateSteps'
  | 'stepBlocks'
  | 'locatorGroups'
  | 'locators'
  | 'environments'

// fallow-ignore-next-line complexity
export async function readValidationContext(
  planId: string,
  options: Options & {
    resourceTypes?: ValidationResourceType[]
    query?: string
    limit?: number
    sinceHash?: string
  } = {},
) {
  const { client, plan, projection } = await readPlanContext(planId, options)
  const [modules, testSuites, testCases, templateSteps, stepBlocks, locatorGroups, locators, environments] =
    await Promise.all([
      client.module.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: 'asc' } }),
      client.testSuite.findMany({
        select: { id: true, name: true, description: true, moduleId: true, testCases: { select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
      client.testCase.findMany({ select: { id: true, title: true, description: true }, orderBy: { title: 'asc' } }),
      client.templateStep.findMany({
        select: { id: true, name: true, signature: true, type: true, templateStepGroupId: true },
        orderBy: { name: 'asc' },
      }),
      client.stepBlock.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          intent: true,
          steps: {
            orderBy: { order: 'asc' },
            select: {
              order: true,
              parameterMap: true,
              templateStep: {
                select: { id: true, name: true, signature: true, type: true, templateStepGroupId: true },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      client.locatorGroup.findMany({
        select: { id: true, name: true, route: true, moduleId: true },
        orderBy: { name: 'asc' },
      }),
      client.locator.findMany({
        select: { id: true, name: true, value: true, locatorGroupId: true },
        orderBy: { name: 'asc' },
      }),
      client.environment.findMany({
        select: { id: true, name: true, baseUrl: true, apiBaseUrl: true },
        orderBy: { name: 'asc' },
      }),
    ])
  const allResources = {
    modules,
    testSuites: testSuites.map(suite => ({ ...suite, testCaseIds: suite.testCases.map(testCase => testCase.id) })),
    testCases,
    templateSteps,
    stepBlocks,
    locatorGroups,
    locators,
    environments,
  }
  if (!projection?.targetProjectId) throw new Error('Plan must be bound to a target project.')
  const ownerships = await readVisibleResourceOwnerships(
    projection.targetProjectId,
    ['module', 'test-suite', 'test-case', 'template-step', 'step-block', 'locator-group', 'locator', 'environment'],
    client,
  )
  const entityTypeByResource: Record<ValidationResourceType, ProjectResourceEntityType> = {
    modules: 'module',
    testSuites: 'test-suite',
    testCases: 'test-case',
    templateSteps: 'template-step',
    stepBlocks: 'step-block',
    locatorGroups: 'locator-group',
    locators: 'locator',
    environments: 'environment',
  }
  const selectedTypes = options.resourceTypes ?? (Object.keys(allResources) as ValidationResourceType[])
  const query = options.query?.trim().toLowerCase()
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const resources = Object.fromEntries(
    selectedTypes.map(resourceType => [
      resourceType,
      allResources[resourceType]
        .filter(resource => {
          if (!ownerships) return true
          return ownerships.has(`${entityTypeByResource[resourceType]}:${resource.id}`)
        })
        .map(resource => {
          const ownership = ownerships?.get(`${entityTypeByResource[resourceType]}:${resource.id}`)
          return {
            ...resource,
            scope: ownership?.scope ?? 'legacy_test_fixture',
            provenance: ownership ?? null,
            ...(resourceType === 'environments' ? { reference: resource.id } : {}),
          }
        })
        .filter(resource => !query || JSON.stringify(resource).toLowerCase().includes(query))
        .slice(0, limit),
    ]),
  )
  const contextHash = hashContent(JSON.stringify({ planId, sourceHash: projection?.sourceHash, resources }))
  if (options.sinceHash === contextHash) {
    return { plan: { planId, revision: plan.revision, lifecycle: plan.lifecycle }, contextHash, notModified: true }
  }
  return {
    plan: {
      planId,
      revision: plan.revision,
      lifecycle: plan.lifecycle,
      sourceHash: projection?.sourceHash ?? hashContent(JSON.stringify(plan)),
      tasks: plan.tasks,
      projectedTasks: projection?.tasks ?? [],
    },
    targetProject: projection?.targetProject ?? null,
    contextHash,
    resources,
    proposalSchemas: [
      'appraise.resource/module-proposal/v1',
      'appraise.resource/environment-proposal/v1',
      'appraise.resource/template-step-proposal/v1',
      'appraise.resource/step-block-proposal/v1',
      'appraise.resource/locator-group-proposal/v1',
      'appraise.resource/locator-proposal/v1',
      'appraise.validation/test-suite-proposal/v1',
      'appraise.validation/test-case-proposal/v1',
      'appraise.validation/test-step-proposal/v1',
    ],
    nextRecommendedAction:
      'Propose any missing target resources, then author the managed Validation AST and call validation_ast_check.',
  }
}
