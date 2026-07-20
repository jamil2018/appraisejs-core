import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { parseYamlArtifact, validationArtifactSchema, type PlanArtifact } from '@/lib/plan-contract'
import { validationAstSubmissionSchema, type ValidationAstSubmission } from '@/lib/validation-ast/schemas'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { templateStepGroupPath } from './template-step-group-path'
import {
  readVisibleResourceOwnerships,
  type ProjectResourceEntityType,
} from '@/services/project-resource/project-resource-ownership-service'

type Options = { client?: PrismaClient; projectDirectory?: string }
const reusableTemplateStepSelect = {
  id: true,
  name: true,
  description: true,
  signature: true,
  templateStepGroupId: true,
  operationId: true,
  operationVersion: true,
  operationDescriptorHash: true,
  humanProjectionId: true,
  operationMigrationState: true,
  parameters: { select: { name: true, type: true, order: true }, orderBy: { order: 'asc' } },
  templateStepGroup: { select: { id: true, name: true, description: true, type: true } },
} as const
type ReusableRef = {
  id: string
  name?: string
  description?: string | null
  signature?: string
  parameters?: Array<{ name: string; type: string; order: number }>
  groupId?: string
  groupName?: string
  groupDescription?: string | null
  groupType?: string
  path?: string
  canonicalOperation?: {
    id: string
    version: string
    descriptorHash: string
    humanProjectionId: string
  }
  managedAuthoringStatus?: 'ready' | 'handler-migration-required' | 'composition-migration-required'
}

function hashContent(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function normalizedWords(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function scoreIntent(candidate: string, intent: string) {
  const ignored = new Set(['and', 'the', 'then', 'when', 'with', 'from', 'into', 'that', 'this', 'step', 'user'])
  const tokens = (value: string) =>
    new Set(normalizedWords(value).filter(part => part.length > 2 && !ignored.has(part)))
  const normalizedCandidate = normalizedWords(candidate).join(' ')
  const normalizedIntent = normalizedWords(intent).join(' ')
  const candidateTokens = tokens(candidate)
  const intentTokens = tokens(intent)
  const matchedTerms = [...intentTokens].filter(token => candidateTokens.has(token))
  const intentWords = [...intentTokens]
  const matchedPhrases = intentWords
    .slice(0, -1)
    .map((word, index) => `${word} ${intentWords[index + 1]}`)
    .filter(phrase => normalizedCandidate.includes(phrase))
  const exactPhrase = normalizedCandidate === normalizedIntent
  const containedPhrase = !exactPhrase && normalizedIntent.length > 0 && normalizedCandidate.includes(normalizedIntent)
  const phraseScore = exactPhrase ? 8 : containedPhrase ? 5 : matchedPhrases.length * 2
  return {
    score: matchedTerms.length + phraseScore,
    confidence:
      intentTokens.size === 0
        ? 0
        : Math.min(1, matchedTerms.length / intentTokens.size + (exactPhrase ? 0.4 : containedPhrase ? 0.25 : 0)),
    matchedTerms,
    matchedPhrases,
    exactPhrase,
  }
}

function signatureParameters(signature: string) {
  return Array.from(signature.matchAll(/\{([^}]+)\}/g), match => match[1]!.trim().toLowerCase())
}

export function rankReusableResources(resources: ReusableResources, intent: string, parameterNames: string[] = []) {
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
        const positionalFallback =
          requestedParameters.size > 0 && namedMatches === 0 && availableParameters.length >= requestedParameters.size
            ? 0.25
            : 0
        const compatibleParameterCount = namedMatches + positionalFallback
        const parameterCompatibility =
          requestedParameters.size === 0 ? 1 : compatibleParameterCount / requestedParameters.size
        const confidence = Math.min(1, match.confidence * 0.8 + parameterCompatibility * 0.2)
        return {
          value,
          score: match.score + namedMatches * 2 + positionalFallback,
          confidence,
          matchedTerms: match.matchedTerms,
          parameterCompatibility,
          explanation: `Matched ${match.matchedTerms.length} intent term(s) and ${match.matchedPhrases.length} ordered phrase(s); ${namedMatches}/${requestedParameters.size} requested parameter name(s) match the reusable signature.`,
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
      step =>
        `${step.name} ${step.description ?? ''} ${step.signature} ${step.templateStepGroup.name} ${step.templateStepGroup.description ?? ''}`,
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
        validationJson: true,
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
      select: reusableTemplateStepSelect,
      orderBy: { name: 'asc' },
    }),
    client.stepBlock.findMany({
      where: { targetProjectId },
      select: {
        id: true,
        name: true,
        intent: true,
        steps: {
          orderBy: { order: 'asc' },
          select: {
            templateStep: {
              select: reusableTemplateStepSelect,
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ])
  const ownerships = await readVisibleResourceOwnerships(targetProjectId, ['step-block'], client)
  if (ownerships === null) return { templateSteps, stepBlocks }
  return {
    templateSteps,
    stepBlocks: stepBlocks.filter(block => ownerships.has(`step-block:${block.id}`)),
  }
}

type ReusableResources = Awaited<ReturnType<typeof readReusableResources>>
type ResolvedTemplateStep = ReusableResources['templateSteps'][number]
type ResolvedStepBlock = ReusableResources['stepBlocks'][number]

function templateStepRef(step: ResolvedTemplateStep): ReusableRef {
  const canonicalOperation =
    step.operationId && step.operationVersion && step.operationDescriptorHash && step.humanProjectionId
      ? {
          id: step.operationId,
          version: step.operationVersion,
          descriptorHash: step.operationDescriptorHash,
          humanProjectionId: step.humanProjectionId,
        }
      : undefined
  return {
    id: step.id,
    name: step.name,
    description: step.description,
    signature: step.signature,
    parameters: step.parameters,
    groupId: step.templateStepGroupId,
    groupName: step.templateStepGroup.name,
    groupDescription: step.templateStepGroup.description,
    groupType: step.templateStepGroup.type,
    path: templateStepGroupPath(step.templateStepGroup.name, step.templateStepGroup.type),
    ...(canonicalOperation ? { canonicalOperation } : {}),
    managedAuthoringStatus: canonicalOperation ? 'ready' : 'handler-migration-required',
  }
}

function stepBlockRef(block: ResolvedStepBlock): ReusableRef {
  return { id: block.id, name: block.name, managedAuthoringStatus: 'composition-migration-required' }
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
    nextRecommendedAction: selected?.canonicalOperation
      ? 'Use selected.canonicalOperation as the managed AST operation reference, then call validation_ast_check.'
      : selected
        ? 'This human reusable result is not yet managed-authoring ready. Call operation_search for a canonical equivalent; do not copy its source or invent an overlapping custom operation.'
        : 'Review the bounded alternatives and call operation_search, then propose a justified custom operation only if no canonical capability is compatible.',
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

type AuthoringResources = {
  templateSteps: Array<{ id: string; name: string; signature: string }>
  stepBlocks: Array<{ id: string; name: string; intent?: string | null }>
  locatorGroups: Array<{ id: string; name: string; route: string }>
  locators: Array<{ id: string; name: string; value: string; locatorGroupId: string | null }>
  environments: Array<{
    id: string
    name: string
    baseUrl: string | null
    apiBaseUrl: string | null
    expectedPageTitle: string | null
  }>
}

const portableId = (value: string, fallback: string) => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
  return normalized || fallback
}

function starterSubmission(
  plan: PlanArtifact,
  sourceHash: string,
  resources: AuthoringResources,
): ValidationAstSubmission | null {
  if (plan.tasks.length === 0) return null

  const environmentId = resources.environments[0]?.id ?? 'replace-environment-id'
  const scenarios = plan.tasks.map((task, index) => {
    const scenarioId = portableId(task.id, `scenario-${index + 1}`)
    return {
      id: scenarioId,
      title: task.title,
      description: task.validationIntent,
      steps: [
        {
          id: `${scenarioId}-navigate`,
          keyword: 'Given' as const,
          description: 'the agent opens the target application',
          operation: { id: 'browser.navigation.goto', version: '1', inputs: { url: '/' } },
        },
        {
          id: `${scenarioId}-observe`,
          keyword: 'When' as const,
          description: 'the agent waits for the application to become ready',
          operation: { id: 'browser.waits.page-ready', version: '1', inputs: {} },
        },
        {
          id: `${scenarioId}-console-clean`,
          keyword: 'Then' as const,
          description: 'the browser reports no console or page errors',
          operation: { id: 'browser.assertions.no-console-errors', version: '1', inputs: {} },
        },
        {
          id: `${scenarioId}-network-clean`,
          keyword: 'And' as const,
          description: 'the browser reports no failed network activity',
          operation: { id: 'browser.assertions.no-failed-network-requests', version: '1', inputs: {} },
        },
      ],
    }
  })
  return validationAstSubmissionSchema.parse({
    expectedPlanHash: sourceHash,
    ast: {
      schemaVersion: 1,
      id: portableId(`${plan.planId}-validation`, 'plan-validation'),
      title: `${plan.goal} validation`,
      purpose: `Editable starter for the approved intent: ${plan.description}`,
      coversTaskIds: plan.tasks.map(task => task.id),
      matrix: [{ browser: 'chromium', environmentId }],
      scenarios,
      coverageArgument: {
        mappings: plan.tasks.map((task, index) => {
          const scenarioId = portableId(task.id, `scenario-${index + 1}`)
          return {
            kind: 'task' as const,
            targetId: task.id,
            scenarioIds: [scenarioId],
            stimulusStepIds: [`${scenarioId}-navigate`],
            observationStepIds: [`${scenarioId}-console-clean`, `${scenarioId}-network-clean`],
            rationale: `Starter mapping for ${task.validationIntent}`,
            state: 'uncovered' as const,
            limitation:
              'Add product-outcome assertions before preview; runtime cleanliness alone does not prove behavior.',
          }
        }),
      },
    },
    customExtensionProposals: [],
  })
}

export function buildValidationAuthoringKit(input: {
  plan: PlanArtifact
  sourceHash: string
  targetProject: { id: string; displayName: string; canonicalPath: string; fingerprint: string } | null
  resources: AuthoringResources
  validationJson?: string | null
  runtimeInputJson?: string | null
}) {
  const starter = starterSubmission(input.plan, input.sourceHash, input.resources)
  const canonicalJson = starter ? JSON.stringify(starter) : null
  const validation = input.validationJson ? validationArtifactSchema.parse(JSON.parse(input.validationJson)) : undefined
  const runtime = input.runtimeInputJson ? (JSON.parse(input.runtimeInputJson) as Record<string, unknown>) : undefined
  const mappings = validation?.validations.flatMap(node => node.coverageArgument?.mappings ?? []) ?? []
  const coveredTargets = new Set(
    mappings.filter(mapping => mapping.state === 'covered').map(mapping => mapping.targetId),
  )
  const taskCoverage = input.plan.tasks.map(task => ({
    taskId: task.id,
    title: task.title,
    validationIntent: task.validationIntent,
    state: coveredTargets.has(task.id) ? ('covered' as const) : ('uncovered' as const),
    mappings: mappings.filter(mapping => mapping.targetId === task.id),
  }))
  const requirementCoverage = (input.plan.requirementAssessment?.requirements ?? []).map(requirement => ({
    ...requirement,
    state:
      requirement.deferredReason !== undefined
        ? ('deferred' as const)
        : requirement.coveredBy.some(binding => coveredTargets.has(binding.taskId))
          ? ('covered' as const)
          : ('uncovered' as const),
  }))
  const recipes = [
    {
      id: 'navigation-visible-outcome',
      intent: 'Navigate, stimulate one behavior, and assert a visible outcome.',
      actionIds: ['browser.navigation.goto', 'browser.mouse.click', 'browser.assertions.visible'],
      resourceHint: 'Prefer an existing project locator and a shared-library action.',
    },
    {
      id: 'form-submit-outcome',
      intent: 'Fill a form, submit it, and assert user-visible feedback.',
      actionIds: ['browser.forms.fill', 'browser.mouse.click', 'browser.assertions.text'],
      resourceHint: 'Bind exact input, submit, and outcome locators before preview.',
    },
    {
      id: 'persistence-reload',
      intent: 'Create state, reload, and assert the state remains observable.',
      actionIds: ['browser.navigation.reload', 'browser.assertions.visible'],
      resourceHint: 'Use only when persistence is explicit approved intent.',
    },
  ]
  const runtimeChanges = input.resources.environments.length
    ? []
    : [
        {
          kind: 'register_environment',
          owner: 'user_or_agent_after_review',
          target: 'Appraise project resources',
          targetFilesChanged: false,
          reason: 'The AST matrix needs a project-scoped environment identity.',
        },
      ]
  return {
    contextPack: {
      schemaVersion: '1',
      approvedIntent: { goal: input.plan.goal, description: input.plan.description },
      constraints: input.plan.requirementAssessment?.requirements.filter(item => item.kind === 'constraint') ?? [],
      requirementIds: input.plan.requirementAssessment?.requirements.map(item => item.id) ?? [],
      tasks: input.plan.tasks.map(task => ({
        id: task.id,
        title: task.title,
        validationIntent: task.validationIntent,
      })),
      targetProject: input.targetProject,
      reusableResourceSummary: Object.fromEntries(
        Object.entries(input.resources).map(([kind, values]) => [kind, values.length]),
      ),
    },
    coverageExplorer: {
      taskCoverage,
      requirementCoverage,
      selectedRuntime: runtime ?? null,
      uncoveredIntentCount:
        taskCoverage.filter(item => item.state === 'uncovered').length +
        requirementCoverage.filter(item => item.state === 'uncovered').length,
    },
    astStarter: {
      editable: starter !== null,
      semanticOwner: 'agent',
      readiness: starter ? 'requires_agent_editing_and_appraise_review' : 'unavailable_no_plan_tasks',
      submission: starter,
      reason: starter ? null : 'The plan has no tasks from which to build a validation starter.',
    },
    astExchange: canonicalJson
      ? {
          mediaType: 'application/vnd.appraise.validation-ast+json;version=1',
          contentHash: hashContent(canonicalJson),
          canonicalJson,
          importTool: 'validation_ast_check',
        }
      : null,
    recipes,
    runtimePreparationProposal: {
      status: runtimeChanges.length ? 'review_required' : 'ready',
      targetWorkspaceMutation: 'none',
      changes: runtimeChanges,
      nextAllowedAction: runtimeChanges.length ? 'Review and register the missing environment.' : 'Edit the starter.',
    },
  }
}

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
  if (!projection?.targetProjectId) throw new Error('Plan must be bound to a target project.')
  const targetProjectId = projection.targetProjectId
  const [modules, testSuites, testCases, templateSteps, stepBlocks, locatorGroups, locators, environments] =
    await Promise.all([
      client.module.findMany({
        where: { targetProjectId },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: 'asc' },
      }),
      client.testSuite.findMany({
        where: { targetProjectId },
        select: { id: true, name: true, description: true, moduleId: true, testCases: { select: { id: true } } },
        orderBy: { name: 'asc' },
      }),
      client.testCase.findMany({
        where: { targetProjectId },
        select: { id: true, title: true, description: true },
        orderBy: { title: 'asc' },
      }),
      client.templateStep.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          signature: true,
          type: true,
          templateStepGroupId: true,
          parameters: { select: { name: true, type: true, order: true }, orderBy: { order: 'asc' } },
          templateStepGroup: { select: { id: true, name: true, description: true, type: true } },
        },
        orderBy: { name: 'asc' },
      }),
      client.stepBlock.findMany({
        where: { targetProjectId },
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
        where: { targetProjectId },
        select: { id: true, name: true, route: true, moduleId: true },
        orderBy: { name: 'asc' },
      }),
      client.locator.findMany({
        where: { targetProjectId },
        select: { id: true, name: true, value: true, locatorGroupId: true },
        orderBy: { name: 'asc' },
      }),
      client.environment.findMany({
        where: { targetProjectId },
        select: { id: true, name: true, baseUrl: true, apiBaseUrl: true, expectedPageTitle: true },
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
          if (resourceType === 'templateSteps' || !ownerships) return true
          return ownerships.has(`${entityTypeByResource[resourceType]}:${resource.id}`)
        })
        .map(resource => {
          const ownership = ownerships?.get(`${entityTypeByResource[resourceType]}:${resource.id}`)
          return {
            ...resource,
            ...((resourceType === 'locatorGroups' || resourceType === 'locators') && {
              version: '1',
              targetProjectId,
              astRef: `${resourceType === 'locatorGroups' ? 'group' : 'locator'}_${resource.id}`,
            }),
            scope: resourceType === 'templateSteps' ? 'shared_library' : (ownership?.scope ?? 'legacy_test_fixture'),
            provenance: ownership ?? null,
            ...(resourceType === 'environments' ? { reference: resource.id } : {}),
          }
        })
        .filter(resource => !query || JSON.stringify(resource).toLowerCase().includes(query))
        .slice(0, limit),
    ]),
  )
  const latestOperation = await client.validationAstPublishOperation?.findFirst({
    where: { planId },
    orderBy: { createdAt: 'desc' },
    select: { runtimeInputJson: true },
  })
  const contextHash = hashContent(
    JSON.stringify({
      planId,
      sourceHash: projection?.sourceHash,
      validationJson: projection.validationJson,
      runtimeInputJson: latestOperation?.runtimeInputJson,
      resources,
    }),
  )
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
    authoring: buildValidationAuthoringKit({
      plan,
      sourceHash: projection?.sourceHash ?? hashContent(JSON.stringify(plan)),
      targetProject: projection?.targetProject ?? null,
      resources: allResources,
      validationJson: projection.validationJson,
      runtimeInputJson: latestOperation?.runtimeInputJson,
    }),
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
