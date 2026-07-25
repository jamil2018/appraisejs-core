import { createHash } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  parseYamlArtifact,
  validationArtifactSchema,
  type PlanArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { validationAstSubmissionSchema, type ValidationAstSubmission } from '@/lib/validation-ast/schemas'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import {
  parseReadyStepDefinition,
  searchReadyStepDefinitions,
  type ReadyStepDefinitionRow,
} from '@/services/step-definition/ready-step-definition-search-index'
import {
  readVisibleResourceOwnerships,
  type ProjectResourceEntityType,
} from '@/services/project-resource/project-resource-ownership-service'

type Options = { client?: PrismaClient; projectDirectory?: string }
type OwnershipMap = NonNullable<Awaited<ReturnType<typeof readVisibleResourceOwnerships>>>
type AuthoringResource = { id: string } & Record<string, unknown>

function hashContent(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

type ReadyStepDefinition = ReadyStepDefinitionRow

export function rankReadyStepDefinitions(
  definitions: ReadyStepDefinition[],
  intent: string,
  parameterNames: string[] = [],
  includeUnmatched = false,
) {
  return searchReadyStepDefinitions(definitions, { intent, parameterNames, includeUnmatched })
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

export async function resolveReusableValidationSteps(
  planId: string,
  input: { intent: string; parameterNames?: string[]; limit?: number },
  options: Options = {},
) {
  const startedAt = Date.now()
  const { client, plan } = await readPlanContext(planId, options)
  const definitions = await client.stepDefinition.findMany({
    where: { status: 'ready' },
    select: { id: true, version: true, title: true, description: true, definitionJson: true },
    orderBy: [{ id: 'asc' }, { version: 'asc' }],
  })
  const ranked = searchReadyStepDefinitions(definitions, {
    intent: input.intent,
    parameterNames: input.parameterNames,
    planContext: JSON.stringify(plan),
  })
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 25)
  const threshold = 0.5
  const steps = ranked.slice(0, limit).map(({ value, ...match }, index) => ({
    ...value,
    rank: index + 1,
    ...match,
  }))
  const selected = steps
    .filter(candidate => candidate.score >= 2 && candidate.confidence >= threshold)
    .sort((left, right) => right.score - left.score || right.confidence - left.confidence)[0]
  return {
    discoveryKind: 'ready-step-definition',
    intent: input.intent,
    threshold,
    selected: selected ?? null,
    recommendedStep: selected ?? null,
    steps,
    metrics: {
      resolverCalls: 1,
      fallbackRequired: !selected,
      selectedRank: selected?.rank ?? null,
      candidatesConsidered: definitions.length,
      returnedCandidates: steps.length,
      durationMs: Date.now() - startedAt,
    },
    nextRecommendedAction: selected
      ? 'Use selected.step as the exact Validation AST invocation reference, then call validation_ast_check.'
      : 'Create and publish a reviewed Step Definition only if no ready Step Definition can express the required behavior.',
  }
}

type ValidationResourceType =
  'modules' | 'testSuites' | 'testCases' | 'stepDefinitions' | 'locatorGroups' | 'locators' | 'environments'

type AuthoringResources = {
  stepDefinitions: Array<ReadyStepDefinition>
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
): { submission: ValidationAstSubmission | null; missingStepIds: string[] } {
  if (plan.tasks.length === 0) return { submission: null, missingStepIds: [] }

  const requiredStepIds = [
    'browser.navigation.goto',
    'browser.waits.page-ready',
    'browser.assertions.no-console-errors',
    'browser.assertions.no-failed-network-requests',
  ]
  const definitions = new Map(resources.stepDefinitions.map(item => [item.id, parseReadyStepDefinition(item)]))
  const missingStepIds = requiredStepIds.filter(id => !definitions.has(id))
  if (missingStepIds.length) return { submission: null, missingStepIds }

  const environmentId = resources.environments[0]?.id ?? 'replace-environment-id'
  const invocation = (
    id: (typeof requiredStepIds)[number],
    inputs: Record<string, string>,
    keyword: 'Given' | 'When' | 'Then' | 'And',
    description: string,
  ) => ({ step: definitions.get(id)!.step, inputs, presentation: { keyword, description } })
  const scenarios = plan.tasks.map((task, index) => {
    const scenarioId = portableId(task.id, `scenario-${index + 1}`)
    return {
      id: scenarioId,
      title: task.title,
      description: task.validationIntent,
      steps: [
        {
          id: `${scenarioId}-navigate`,
          invocation: invocation(
            'browser.navigation.goto',
            { url: '/' },
            'Given',
            'the agent opens the target application',
          ),
        },
        {
          id: `${scenarioId}-observe`,
          invocation: invocation(
            'browser.waits.page-ready',
            {},
            'When',
            'the agent waits for the application to become ready',
          ),
        },
        {
          id: `${scenarioId}-console-clean`,
          invocation: invocation(
            'browser.assertions.no-console-errors',
            {},
            'Then',
            'the browser reports no console or page errors',
          ),
        },
        {
          id: `${scenarioId}-network-clean`,
          invocation: invocation(
            'browser.assertions.no-failed-network-requests',
            {},
            'And',
            'the browser reports no failed network activity',
          ),
        },
      ],
    }
  })
  return {
    submission: validationAstSubmissionSchema.parse({
      expectedPlanHash: sourceHash,
      ast: {
        schemaVersion: 2,
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
    }),
    missingStepIds: [],
  }
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
  const submission = starter?.submission ?? null
  const canonicalJson = submission ? JSON.stringify(submission) : null
  const validation = parseValidationArtifact(input.validationJson)
  const runtime = parseRuntimeInput(input.runtimeInputJson)
  const mappings = validation?.validations.flatMap(node => node.coverageArgument?.mappings ?? []) ?? []
  const coveredTargets = new Set(
    mappings.filter(mapping => mapping.state === 'covered').map(mapping => mapping.targetId),
  )
  const taskCoverage = taskCoverageFor(input.plan, mappings, coveredTargets)
  const requirementCoverage = requirementCoverageFor(input.plan, coveredTargets)
  const recipes = [
    {
      id: 'navigation-visible-outcome',
      intent: 'Navigate, stimulate one behavior, and assert a visible outcome.',
      stepIds: ['browser.navigation.goto', 'browser.mouse.click', 'browser.assertions.visible'],
      resourceHint: 'Use exact ready Step Definition references and an existing project locator.',
    },
    {
      id: 'form-submit-outcome',
      intent: 'Fill a form, submit it, and assert user-visible feedback.',
      stepIds: ['browser.forms.fill', 'browser.mouse.click', 'browser.assertions.text'],
      resourceHint: 'Bind exact input, submit, and outcome locators before preview.',
    },
    {
      id: 'persistence-reload',
      intent: 'Create state, reload, and assert the state remains observable.',
      stepIds: ['browser.navigation.reload', 'browser.assertions.visible'],
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
      schemaVersion: '2',
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
      editable: submission !== null,
      semanticOwner: 'agent',
      readiness: starterReadiness(submission, input.plan),
      submission,
      reason: starterReason(submission, input.plan, starter.missingStepIds),
    },
    astExchange: canonicalJson
      ? {
          mediaType: 'application/vnd.appraise.validation-ast+json;version=2',
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

function parseValidationArtifact(value?: string | null) {
  return value ? validationArtifactSchema.parse(JSON.parse(value)) : undefined
}

function parseRuntimeInput(value?: string | null) {
  return value ? (JSON.parse(value) as Record<string, unknown>) : undefined
}

function taskCoverageFor(
  plan: PlanArtifact,
  mappings: Array<NonNullable<ValidationArtifact['validations'][number]['coverageArgument']>['mappings'][number]>,
  coveredTargets: Set<string>,
) {
  return plan.tasks.map(task => ({
    taskId: task.id,
    title: task.title,
    validationIntent: task.validationIntent,
    state: coveredTargets.has(task.id) ? ('covered' as const) : ('uncovered' as const),
    mappings: mappings.filter(mapping => mapping.targetId === task.id),
  }))
}

function requirementCoverageFor(plan: PlanArtifact, coveredTargets: Set<string>) {
  return (plan.requirementAssessment?.requirements ?? []).map(requirement => ({
    ...requirement,
    state: requirement.deferredReason
      ? ('deferred' as const)
      : requirement.coveredBy.some(binding => coveredTargets.has(binding.taskId))
        ? ('covered' as const)
        : ('uncovered' as const),
  }))
}

function starterReadiness(submission: unknown, plan: PlanArtifact) {
  if (submission) return 'requires_agent_editing_and_appraise_review'
  return plan.tasks.length === 0 ? 'unavailable_no_plan_tasks' : 'unavailable_missing_exact_step_references'
}

function starterReason(submission: unknown, plan: PlanArtifact, missingStepIds: string[]) {
  if (submission) return null
  return plan.tasks.length === 0
    ? 'The plan has no tasks from which to build a validation starter.'
    : `The ready Step Definition registry is missing: ${missingStepIds.join(', ')}.`
}

function projectAuthoringResource(
  resourceType: ValidationResourceType,
  resource: AuthoringResource,
  entityType: ProjectResourceEntityType | undefined,
  ownerships: OwnershipMap | null,
  targetProjectId: string,
) {
  const ownership = entityType ? ownerships?.get(`${entityType}:${resource.id}`) : undefined
  return {
    ...resource,
    ...registryProjectionFor(resourceType, resource),
    ...locatorProjectionFor(resourceType, resource.id, targetProjectId),
    scope: resourceScopeFor(resourceType, ownership?.scope),
    provenance: ownership ?? null,
    ...environmentProjectionFor(resourceType, resource.id),
  }
}

function registryProjectionFor(resourceType: ValidationResourceType, resource: AuthoringResource) {
  if (resourceType !== 'stepDefinitions') return {}
  return parseReadyStepDefinition(resource as ReadyStepDefinition)
}

function locatorProjectionFor(resourceType: ValidationResourceType, id: string, targetProjectId: string) {
  if (resourceType !== 'locatorGroups' && resourceType !== 'locators') return {}
  const prefix = resourceType === 'locatorGroups' ? 'group' : 'locator'
  return { version: '1', targetProjectId, astRef: `${prefix}_${id}` }
}

function resourceScopeFor(resourceType: ValidationResourceType, ownershipScope?: string) {
  if (resourceType === 'stepDefinitions') return 'ready_registry'
  return ownershipScope ?? 'legacy_test_fixture'
}

function environmentProjectionFor(resourceType: ValidationResourceType, id: string) {
  return resourceType === 'environments' ? { reference: id } : {}
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
  const [modules, testSuites, testCases, stepDefinitions, locatorGroups, locators, environments] = await Promise.all([
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
    client.stepDefinition.findMany({
      where: { status: 'ready' },
      select: { id: true, version: true, title: true, description: true, definitionJson: true },
      orderBy: [{ id: 'asc' }, { version: 'asc' }],
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
    stepDefinitions,
    locatorGroups,
    locators,
    environments,
  }
  const ownerships = await readVisibleResourceOwnerships(
    projection.targetProjectId,
    ['module', 'test-suite', 'test-case', 'locator-group', 'locator', 'environment'],
    client,
  )
  const entityTypeByResource: Partial<Record<ValidationResourceType, ProjectResourceEntityType>> = {
    modules: 'module',
    testSuites: 'test-suite',
    testCases: 'test-case',
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
          if (resourceType === 'stepDefinitions' || !ownerships) return true
          return ownerships.has(`${entityTypeByResource[resourceType]}:${resource.id}`)
        })
        .map(resource =>
          projectAuthoringResource(
            resourceType,
            resource as AuthoringResource,
            entityTypeByResource[resourceType],
            ownerships,
            targetProjectId,
          ),
        )
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
