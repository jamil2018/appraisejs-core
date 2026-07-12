import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  parseYamlArtifact,
  type PlanArtifact,
  type ValidationArtifact,
  type ValidationDraft,
  validationDraftSchema,
} from '@/lib/plan-contract'
import { PlanArtifactRepository } from '@/lib/plans/artifact-repository'
import { findProjectRoot } from '@/lib/plans/project-root'
import { ServiceError } from '@/services/shared/errors'

import { publishPreparedValidations } from './coordinator-validation-service'
import { validateValidationLocatorBindings } from './validation-locator-resolution-service'
import { templateStepGroupPath } from './template-step-group-path'

type Options = { client?: PrismaClient; projectDirectory?: string }
type ResponseMode = 'summary' | 'delta' | 'full'
type DraftMutationResult = {
  accepted: boolean
  planId: string
  draftId: string
  draftHash: string
  changedPaths: string[]
  counts: { validations: number; files: number; blockers: number; warnings: number }
  draft?: ValidationDraft
  blockers: ValidationDraft['blockers']
  warnings: string[]
  nextRecommendedAction: string
}
type FullDraftMutationResult = DraftMutationResult & { draft: ValidationDraft }
type ValidationStepMetadataInput = Pick<
  ValidationDraft,
  'reusedStepPaths' | 'newStepPaths' | 'customStepJustifications'
> &
  Partial<Pick<ValidationDraft, 'reusedTemplateStepRefs' | 'reusedStepBlockRefs'>>

const draftDirectory = 'appraise/plans/validation-drafts'
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const zeroHash = `sha256:${'0'.repeat(64)}`

type ReusableRef = ValidationDraft['reusedTemplateStepRefs'][number]
type DraftStepProposal = {
  intent: string
  gherkinText: string
  templateStepRef?: string
  stepBlockRef?: string
  customStepProposal?: {
    path?: string
    missingCapability?: string
    whyLocatorsAndExistingStepsAreInsufficient?: string
  }
  parameters?: Array<{ name: string; value: string; type?: string; locatorRef?: string }>
}
type ValidationTestShapeProposal = {
  title: string
  behavior: string
  coveredTaskIds: string[]
  suiteRef?: string
  steps: DraftStepProposal[]
  stepBlocks?: Array<{ blockRef?: string; intent: string; parameters?: Record<string, string> }>
  gherkinPath?: string
  stepPath?: string
  browser?: string
  environment?: string
}

function hashContent(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function now() {
  return new Date().toISOString()
}

function slug(input: string, fallback: string) {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return value || fallback
}

function refKey(ref: ReusableRef) {
  return ref.id
}

function uniqueRefs(refs: ReusableRef[]) {
  return Array.from(new Map(refs.map(ref => [refKey(ref), ref])).values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  )
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort()
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

function ensureId(input: string | undefined, fallback: string) {
  const id = input?.trim() ? input.trim() : fallback
  if (!idPattern.test(id)) throw new ServiceError(`Invalid draft resource ID "${id}".`, 'VALIDATION')
  return id
}

async function normalizeValidationEnvironments(node: ValidationDraft['validations'][number], client: PrismaClient) {
  const refs = uniqueStrings(node.matrix.map(entry => entry.environment))
  const environments = await client.environment.findMany({
    where: { OR: [{ id: { in: refs } }, { name: { in: refs } }] },
    select: { id: true, name: true },
  })
  const canonicalNames = new Map(
    environments.flatMap(environment => [
      [environment.id, environment.name],
      [environment.name, environment.name],
    ]),
  )
  const unknown = refs.filter(ref => !canonicalNames.has(ref))
  if (unknown.length > 0) {
    throw new ServiceError(`Unknown validation environments: ${unknown.join(', ')}.`, 'VALIDATION', undefined, {
      blockerType: 'missing_environment',
      missingEnvironments: unknown,
      nextRecommendedAction: 'Read validation context and use a known environment id or name.',
    })
  }
  return {
    ...node,
    matrix: node.matrix.map(entry => ({ ...entry, environment: canonicalNames.get(entry.environment)! })),
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

async function resolveDraftFile(planId: string, projectDirectory?: string, createDirectory = false) {
  const projectRoot = await findProjectRoot(projectDirectory)
  const directory = path.join(projectRoot, draftDirectory)
  if (createDirectory) await fs.mkdir(directory, { recursive: true })
  return path.join(directory, `${planId}.draft.json`)
}

async function writeDraft(draft: ValidationDraft, options: Options = {}) {
  const file = await resolveDraftFile(draft.planId, options.projectDirectory, true)
  const updated = validationDraftSchema.parse({ ...draft, updatedAt: now() })
  await fs.writeFile(file, `${JSON.stringify(updated, null, 2)}\n`)
  return updated
}

async function readDraftFile(planId: string, options: Options = {}) {
  const file = await resolveDraftFile(planId, options.projectDirectory)
  try {
    return validationDraftSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ServiceError('Validation draft not found.', 'NOT_FOUND')
    }
    throw error
  }
}

function draftRequiredBlockers(draft: ValidationDraft): ValidationDraft['blockers'] {
  const blockers: ValidationDraft['blockers'] = []
  if (draft.validations.length === 0) {
    blockers.push({
      code: 'missing-validation-nodes',
      path: ['validations'],
      message: 'At least one validation node is required before publication.',
      recovery: 'Call validation_node_upsert or validation_test_case_upsert with executable validation intent.',
    })
  }
  if (draft.files.length === 0) {
    blockers.push({
      code: 'missing-file-evidence',
      path: ['files'],
      message: 'At least one changed file must be declared for validation review.',
      recovery: 'Call validation_file_upsert for every path intentionally changed during validation preparation.',
    })
  }
  return blockers
}

function nodeTestCaseBlocker(
  node: ValidationDraft['validations'][number],
  index: number,
): ValidationDraft['blockers'][number] | undefined {
  const testCaseIds = new Set(node.appraiseArtifacts.testCases.map(testCase => testCase.id))
  if (node.testCaseIds.every(testCaseId => testCaseIds.has(testCaseId))) return undefined
  return {
    code: 'unresolved-test-case',
    path: ['validations', index, 'testCaseIds'],
    message: 'Validation node references a test case that is not present in Appraise artifact proposals.',
    recovery: 'Use validation_test_case_upsert or include the canonical test case in appraiseArtifacts.testCases.',
  }
}

function stepPathNeedsJustification(stepPath: string, draft: ValidationDraft) {
  return (
    stepPath.startsWith('automation/steps/') &&
    /\.(?:step|steps)\.ts$/.test(stepPath) &&
    !draft.reusedStepPaths.includes(stepPath) &&
    !draft.customStepJustifications.some(justification => justification.path === stepPath)
  )
}

function nodeStepPathBlockers(
  node: ValidationDraft['validations'][number],
  index: number,
  draft: ValidationDraft,
): ValidationDraft['blockers'] {
  return node.stepPaths
    .filter(stepPath => stepPathNeedsJustification(stepPath, draft))
    .map(stepPath => ({
      code: 'missing-custom-step-justification',
      path: ['validations', index, 'stepPaths'],
      message: `Custom step ${stepPath} requires a registry/template-step reuse gap justification.`,
      recovery: 'Add customStepJustifications for new custom steps or mark reused registry step paths.',
    }))
}

function checkDraft(draft: ValidationDraft): ValidationDraft['blockers'] {
  const blockers = draftRequiredBlockers(draft)
  blockers.push(...validateValidationLocatorBindings(draft.validations))
  for (const [index, node] of draft.validations.entries()) {
    const testCaseBlocker = nodeTestCaseBlocker(node, index)
    if (testCaseBlocker) blockers.push(testCaseBlocker)
    blockers.push(...nodeStepPathBlockers(node, index, draft))
  }
  return blockers
}

async function readReusableResources(client: PrismaClient) {
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
  return { templateSteps, stepBlocks }
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

function findTemplateStep(resources: ReusableResources, ref: string | undefined, intent: string) {
  if (ref) {
    const normalized = ref.toLowerCase()
    const exact = resources.templateSteps.find(
      step => step.id === ref || step.name.toLowerCase() === normalized || step.signature.toLowerCase() === normalized,
    )
    if (exact) return { step: exact, rewritten: false, score: Number.POSITIVE_INFINITY, matchedTerms: ['exact-ref'] }
  }
  const best = rankReusableResources(resources, intent).templateSteps.find(
    candidate => candidate.score >= 2 && candidate.confidence >= 0.5,
  )
  return best ? { step: best.value, rewritten: !ref, ...best } : null
}

function findStepBlock(resources: ReusableResources, ref: string | undefined, intent: string) {
  if (ref) {
    const normalized = ref.toLowerCase()
    const exact = resources.stepBlocks.find(block => block.id === ref || block.name.toLowerCase() === normalized)
    if (exact) return { block: exact, rewritten: false, score: Number.POSITIVE_INFINITY, matchedTerms: ['exact-ref'] }
  }
  const best = rankReusableResources(resources, intent).stepBlocks.find(
    candidate => candidate.score >= 2 && candidate.confidence >= 0.5,
  )
  return best ? { block: best.value, rewritten: !ref, ...best } : null
}

export async function resolveReusableValidationSteps(
  planId: string,
  input: { intent: string; parameterNames?: string[]; limit?: number },
  options: Options = {},
) {
  const startedAt = Date.now()
  const { client } = await readPlanContext(planId, options)
  const resources = await readReusableResources(client)
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

// fallow-ignore-next-line complexity
async function resolveValidationTestShape(
  client: PrismaClient,
  proposal: ValidationTestShapeProposal,
): Promise<{
  steps: DraftStepProposal[]
  reusedTemplateStepRefs: ReusableRef[]
  reusedStepBlockRefs: ReusableRef[]
  reusedStepPaths: string[]
  newStepPaths: string[]
  customStepJustifications: ValidationDraft['customStepJustifications']
  warnings: string[]
}> {
  const resources = await readReusableResources(client)
  const steps: DraftStepProposal[] = []
  const reusedTemplateStepRefs: ReusableRef[] = []
  const reusedStepBlockRefs: ReusableRef[] = []
  const customStepJustifications: ValidationDraft['customStepJustifications'] = []
  const warnings: string[] = []
  const newStepPaths: string[] = []

  for (const blockProposal of proposal.stepBlocks ?? []) {
    const resolvedBlock = findStepBlock(resources, blockProposal.blockRef, blockProposal.intent)
    if (!resolvedBlock) continue
    reusedStepBlockRefs.push(stepBlockRef(resolvedBlock.block))
    if (resolvedBlock.rewritten) {
      warnings.push(
        `Reused step block "${resolvedBlock.block.name}" for intent "${blockProposal.intent}" (score ${resolvedBlock.score}; matched: ${resolvedBlock.matchedTerms.join(', ')}).`,
      )
    }
    for (const blockStep of resolvedBlock.block.steps) {
      const stepRef = templateStepRef(blockStep.templateStep)
      reusedTemplateStepRefs.push(stepRef)
      steps.push({
        intent: blockStep.templateStep.name,
        gherkinText: blockStep.templateStep.signature,
        templateStepRef: blockStep.templateStep.id,
        parameters: Object.entries(blockProposal.parameters ?? {}).map(([name, value]) => ({ name, value })),
      })
    }
  }

  for (const step of proposal.steps) {
    const resolvedBlock = step.stepBlockRef ? findStepBlock(resources, step.stepBlockRef, step.intent) : null
    if (resolvedBlock) {
      reusedStepBlockRefs.push(stepBlockRef(resolvedBlock.block))
      for (const blockStep of resolvedBlock.block.steps) {
        reusedTemplateStepRefs.push(templateStepRef(blockStep.templateStep))
        steps.push({
          intent: blockStep.templateStep.name,
          gherkinText: blockStep.templateStep.signature,
          templateStepRef: blockStep.templateStep.id,
          parameters: step.parameters,
        })
      }
      continue
    }

    const resolvedStep = findTemplateStep(resources, step.templateStepRef, step.intent)
    if (resolvedStep) {
      const ref = templateStepRef(resolvedStep.step)
      reusedTemplateStepRefs.push(ref)
      steps.push({ ...step, templateStepRef: resolvedStep.step.id })
      if (resolvedStep.rewritten || step.customStepProposal) {
        warnings.push(
          `Reused template step "${resolvedStep.step.name}" for intent "${step.intent}" (score ${resolvedStep.score}; matched: ${resolvedStep.matchedTerms.join(', ')}).`,
        )
      }
      continue
    }

    steps.push(step)
    if (step.customStepProposal?.path) {
      newStepPaths.push(step.customStepProposal.path)
      if (
        step.customStepProposal.missingCapability &&
        step.customStepProposal.whyLocatorsAndExistingStepsAreInsufficient
      ) {
        customStepJustifications.push({
          path: step.customStepProposal.path,
          missingCapability: step.customStepProposal.missingCapability,
          whyLocatorsAndExistingStepsAreInsufficient:
            step.customStepProposal.whyLocatorsAndExistingStepsAreInsufficient,
        })
      }
    }
  }

  return {
    steps,
    reusedTemplateStepRefs: uniqueRefs(reusedTemplateStepRefs),
    reusedStepBlockRefs: uniqueRefs(reusedStepBlockRefs),
    reusedStepPaths: uniqueStrings(reusedTemplateStepRefs.map(ref => ref.path ?? '')),
    newStepPaths: uniqueStrings(newStepPaths),
    customStepJustifications,
    warnings,
  }
}

function toMutationResult(
  draft: ValidationDraft,
  nextRecommendedAction: string,
  responseMode: 'full',
  changedPaths?: string[],
): FullDraftMutationResult
function toMutationResult(
  draft: ValidationDraft,
  nextRecommendedAction: string,
  responseMode?: Exclude<ResponseMode, 'full'>,
  changedPaths?: string[],
): DraftMutationResult
function toMutationResult(
  draft: ValidationDraft,
  nextRecommendedAction: string,
  responseMode: ResponseMode = 'summary',
  changedPaths: string[] = [],
): DraftMutationResult {
  const blockers = checkDraft(draft)
  return {
    accepted: true,
    planId: draft.planId,
    draftId: draft.draftId,
    draftHash: hashContent(JSON.stringify(draft)),
    changedPaths,
    counts: {
      validations: draft.validations.length,
      files: draft.files.length,
      blockers: blockers.length,
      warnings: draft.warnings.length,
    },
    ...(responseMode === 'full' ? { draft: { ...draft, blockers } } : {}),
    blockers,
    warnings: draft.warnings,
    nextRecommendedAction,
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
  const selectedTypes = options.resourceTypes ?? (Object.keys(allResources) as ValidationResourceType[])
  const query = options.query?.trim().toLowerCase()
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const resources = Object.fromEntries(
    selectedTypes.map(resourceType => [
      resourceType,
      allResources[resourceType]
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
    nextRecommendedAction: 'Call validation_draft_create, then mutate the Appraise-owned draft.',
  }
}

export async function createValidationDraft(planId: string, options: Options = {}) {
  const { plan, projection } = await readPlanContext(planId, options)
  if (!['preparing_validations', 'validation_changes_requested'].includes(plan.lifecycle)) {
    throw new ServiceError('The plan is not preparing validations.', 'CONFLICT')
  }
  const timestamp = now()
  const draft = validationDraftSchema.parse({
    version: '1',
    planId,
    draftId: `validation-draft-${slug(planId, 'plan')}`.slice(0, 63).replace(/-+$/g, ''),
    revision: plan.revision,
    status: 'draft',
    targetProjectId: projection?.targetProjectId ?? null,
    sourceHash: projection?.sourceHash ?? hashContent(JSON.stringify(plan)),
    baseRevision: { gitCommit: null, snapshotHash: projection?.sourceHash ?? zeroHash, reducedAssurance: true },
    classificationOverrides: [],
    validations: [],
    files: [],
    manifestPaths: [],
    reusedStepPaths: [],
    reusedTemplateStepRefs: [],
    reusedStepBlockRefs: [],
    newStepPaths: [],
    customStepJustifications: [],
    runtimeProjections: [],
    blockers: [],
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return toMutationResult(
    await writeDraft(draft, options),
    'Call validation_context_read, then add draft nodes and files.',
    'full',
  )
}

export async function readValidationDraft(planId: string, options: Options & { responseMode?: ResponseMode } = {}) {
  const draft = await readDraftFile(planId, options)
  const nextAction = 'Continue mutating the draft or call validation_draft_check.'
  return options.responseMode === 'full'
    ? toMutationResult(draft, nextAction, 'full')
    : toMutationResult(draft, nextAction, options.responseMode ?? 'summary')
}

function assertExpectedDraftHash(draft: ValidationDraft, expectedDraftHash?: string) {
  const currentDraftHash = hashContent(JSON.stringify(draft))
  if (expectedDraftHash && expectedDraftHash !== currentDraftHash) {
    throw new ServiceError('The validation draft changed before this mutation.', 'CONFLICT', undefined, {
      expectedDraftHash,
      currentDraftHash,
      nextRecommendedAction: 'Read the current draft summary and retry with its exact draftHash.',
    })
  }
}

export async function resetValidationDraft(planId: string, expectedDraftHash?: string, options: Options = {}) {
  const draft = await readDraftFile(planId, options)
  assertExpectedDraftHash(draft, expectedDraftHash)
  const file = await resolveDraftFile(planId, options.projectDirectory)
  await fs.rm(file, { force: true })
  return createValidationDraft(planId, options)
}

export async function deleteValidationNode(
  planId: string,
  nodeId: string,
  expectedDraftHash: string,
  options: Options = {},
) {
  const draft = await readDraftFile(planId, options)
  assertExpectedDraftHash(draft, expectedDraftHash)
  const validations = draft.validations.filter(node => node.id !== nodeId)
  if (validations.length === draft.validations.length) throw new ServiceError('Validation node not found.', 'NOT_FOUND')
  const next = await writeDraft({ ...draft, status: 'draft', validations }, options)
  return toMutationResult(next, 'Call validation_draft_check before publishing.', 'delta', [`validations.${nodeId}`])
}

export async function deleteValidationFile(
  planId: string,
  filePath: string,
  expectedDraftHash: string,
  options: Options = {},
) {
  const draft = await readDraftFile(planId, options)
  assertExpectedDraftHash(draft, expectedDraftHash)
  const files = draft.files.filter(file => file.path !== filePath)
  if (files.length === draft.files.length) throw new ServiceError('Validation file not found.', 'NOT_FOUND')
  const next = await writeDraft(
    { ...draft, status: 'draft', files, manifestPaths: draft.manifestPaths.filter(path => path !== filePath) },
    options,
  )
  return toMutationResult(next, 'Call validation_draft_check before publishing.', 'delta', [`files.${filePath}`])
}

export async function upsertValidationNode(
  planId: string,
  node: ValidationDraft['validations'][number],
  options: Options = {},
) {
  const draft = await readDraftFile(planId, options)
  const normalizedNode = await normalizeValidationEnvironments(node, options.client ?? prisma)
  const nextNodes = draft.validations.filter(item => item.id !== normalizedNode.id)
  nextNodes.push(normalizedNode)
  const next = await writeDraft({ ...draft, status: 'draft', validations: nextNodes }, options)
  return toMutationResult(next, 'Call validation_file_upsert for changed files or validation_draft_check.', 'delta', [
    `validations.${normalizedNode.id}`,
  ])
}

export async function upsertValidationFile(
  planId: string,
  file: ValidationDraft['files'][number],
  options: Options = {},
) {
  const draft = await readDraftFile(planId, options)
  const files = draft.files.filter(item => item.path !== file.path)
  files.push(file)
  const manifestPaths = Array.from(new Set([...draft.manifestPaths, file.path])).sort()
  const next = await writeDraft({ ...draft, status: 'draft', files, manifestPaths }, options)
  return toMutationResult(next, 'Call validation_draft_check before publishing.', 'delta', [`files.${file.path}`])
}

export async function upsertValidationStepMetadata(
  planId: string,
  metadata: ValidationStepMetadataInput,
  options: Options = {},
) {
  const draft = await readDraftFile(planId, options)
  const next = await writeDraft(
    {
      ...draft,
      status: 'draft',
      reusedStepPaths: uniqueStrings(metadata.reusedStepPaths),
      reusedTemplateStepRefs: uniqueRefs(metadata.reusedTemplateStepRefs ?? draft.reusedTemplateStepRefs),
      reusedStepBlockRefs: uniqueRefs(metadata.reusedStepBlockRefs ?? draft.reusedStepBlockRefs),
      newStepPaths: uniqueStrings(metadata.newStepPaths),
      customStepJustifications: metadata.customStepJustifications,
    },
    options,
  )
  return toMutationResult(
    next,
    'Call validation_draft_check. Custom steps without matching justification remain blockers.',
  )
}

export async function upsertValidationTestCase(
  planId: string,
  proposal: ValidationTestShapeProposal,
  options: Options = {},
) {
  const client = options.client ?? prisma
  const caseId = slug(proposal.title, 'validation-case')
  const suiteId = ensureId(
    proposal.suiteRef ? slug(proposal.suiteRef, 'validation-suite') : undefined,
    'validation-suite',
  )
  const moduleId = 'validation-module'
  const resolved = await resolveValidationTestShape(client, proposal)
  const usesOnlyReusableSteps = resolved.steps.length > 0 && resolved.steps.every(step => step.templateStepRef)
  const stepPath = proposal.stepPath ?? (usesOnlyReusableSteps ? undefined : `automation/steps/${caseId}.steps.ts`)
  const gherkinPath = proposal.gherkinPath ?? `automation/features/${caseId}.feature`
  const node = {
    id: caseId,
    taskIds: proposal.coveredTaskIds,
    required: true,
    testCaseIds: [caseId],
    appraiseArtifacts: {
      modules: [{ id: moduleId, name: 'Validation module' }],
      testSuites: [{ id: suiteId, name: proposal.suiteRef ?? 'Validation suite', moduleId, testCaseIds: [caseId] }],
      testCases: [
        {
          id: caseId,
          title: proposal.title,
          description: proposal.behavior,
          steps: resolved.steps.map((step, index) => ({
            id: `${caseId}-step-${index + 1}`,
            order: index,
            label: step.intent,
            gherkinStep: step.gherkinText,
            templateStepId: step.templateStepRef,
            templateStepName: step.templateStepRef,
            parameters: (step.parameters ?? []).map(parameter => ({
              name: parameter.name,
              value: parameter.value,
              type: parameter.type,
              locatorName: parameter.locatorRef,
            })),
          })),
        },
      ],
      locatorGroups: [],
      locators: [],
    },
    gherkinPaths: [gherkinPath],
    stepPaths: stepPath ? [stepPath] : [],
    executable: { path: gherkinPath, selector: proposal.title },
    matrix: [{ browser: proposal.browser ?? 'chromium', environment: proposal.environment ?? 'local' }],
    expectedFailures: [],
  }
  await upsertValidationNode(planId, node, options)
  const draft = await readDraftFile(planId, options)
  const next = await writeDraft(
    {
      ...draft,
      reusedStepPaths: uniqueStrings([...draft.reusedStepPaths, ...resolved.reusedStepPaths]),
      reusedTemplateStepRefs: uniqueRefs([...draft.reusedTemplateStepRefs, ...resolved.reusedTemplateStepRefs]),
      reusedStepBlockRefs: uniqueRefs([...draft.reusedStepBlockRefs, ...resolved.reusedStepBlockRefs]),
      newStepPaths: uniqueStrings([...draft.newStepPaths, ...resolved.newStepPaths]),
      customStepJustifications: [
        ...draft.customStepJustifications,
        ...resolved.customStepJustifications.filter(
          justification => !draft.customStepJustifications.some(existing => existing.path === justification.path),
        ),
      ],
      warnings: uniqueStrings([...draft.warnings, ...resolved.warnings]),
    },
    options,
  )
  return toMutationResult(next, 'Call validation_file_upsert for changed files or validation_draft_check.')
}

export async function proposeValidationTestShape(
  planId: string,
  proposal: ValidationTestShapeProposal,
  options: Options = {},
) {
  return upsertValidationTestCase(planId, proposal, options)
}

export async function checkValidationDraft(planId: string, options: Options = {}) {
  const draft = await readDraftFile(planId, options)
  const blockers = checkDraft(draft)
  const status = blockers.length === 0 ? 'ready_for_review' : 'draft'
  const next = await writeDraft({ ...draft, status, blockers }, options)
  return toMutationResult(
    next,
    blockers.length === 0
      ? 'Call validation_draft_publish.'
      : 'Resolve blockers, then call validation_draft_check again.',
    'full',
  )
}

export async function publishValidationDraft(planId: string, draftId: string, options: Options = {}) {
  const draft = await readDraftFile(planId, options)
  if (draft.draftId !== draftId)
    throw new ServiceError('Validation draft ID does not match the active draft.', 'VALIDATION')
  const blockers = checkDraft(draft)
  if (blockers.length > 0) {
    const next = await writeDraft({ ...draft, blockers }, options)
    return {
      ...toMutationResult(next, 'Resolve blockers, then call validation_draft_publish again.'),
      published: false,
    }
  }
  const validation: ValidationArtifact = {
    version: '1',
    planId,
    revision: draft.revision,
    baseRevision: draft.baseRevision,
    classificationOverrides: draft.classificationOverrides,
    validations: draft.validations,
    approvals: [],
    reusedStepPaths: draft.reusedStepPaths,
    reusedTemplateStepRefs: draft.reusedTemplateStepRefs,
    reusedStepBlockRefs: draft.reusedStepBlockRefs,
    newStepPaths: draft.newStepPaths,
    customStepJustifications: draft.customStepJustifications,
    runtimeProjections: draft.runtimeProjections,
    runtimePreflight: draft.runtimePreflight,
    validationDecisions: [],
    files: draft.files,
    manifestPaths: draft.manifestPaths,
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
  }
  const published = await publishPreparedValidations(planId, validation, options)
  const next = await writeDraft({ ...draft, status: 'published', blockers: [] }, options)
  return {
    accepted: true,
    published: true,
    draft: next,
    blockers: [],
    warnings: next.warnings,
    validation: published,
    nextRecommendedAction: 'Open validation review and wait for Appraise validation approval or requested changes.',
  }
}
