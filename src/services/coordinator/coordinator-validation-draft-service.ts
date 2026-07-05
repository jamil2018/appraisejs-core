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

type Options = { client?: PrismaClient; projectDirectory?: string }
type DraftMutationResult = {
  accepted: boolean
  draft: ValidationDraft
  blockers: ValidationDraft['blockers']
  warnings: string[]
  nextRecommendedAction: string
}

const draftDirectory = 'appraise/plans/validation-drafts'
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const zeroHash = `sha256:${'0'.repeat(64)}`

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

function ensureId(input: string | undefined, fallback: string) {
  const id = input?.trim() ? input.trim() : fallback
  if (!idPattern.test(id)) throw new ServiceError(`Invalid draft resource ID "${id}".`, 'VALIDATION')
  return id
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
  for (const [index, node] of draft.validations.entries()) {
    const testCaseBlocker = nodeTestCaseBlocker(node, index)
    if (testCaseBlocker) blockers.push(testCaseBlocker)
    blockers.push(...nodeStepPathBlockers(node, index, draft))
  }
  return blockers
}

function toMutationResult(draft: ValidationDraft, nextRecommendedAction: string): DraftMutationResult {
  const blockers = checkDraft(draft)
  return {
    accepted: true,
    draft: { ...draft, blockers },
    blockers,
    warnings: draft.warnings,
    nextRecommendedAction,
  }
}

export async function readValidationContext(planId: string, options: Options = {}) {
  const { client, plan, projection } = await readPlanContext(planId, options)
  const [modules, testSuites, testCases, templateSteps, locatorGroups, locators, environments] = await Promise.all([
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
    resources: {
      modules,
      testSuites: testSuites.map(suite => ({ ...suite, testCaseIds: suite.testCases.map(testCase => testCase.id) })),
      testCases,
      templateSteps,
      locatorGroups,
      locators,
      environments,
    },
    proposalSchemas: [
      'appraise.resource/module-proposal/v1',
      'appraise.resource/environment-proposal/v1',
      'appraise.resource/template-step-proposal/v1',
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
    newStepPaths: [],
    customStepJustifications: [],
    blockers: [],
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return toMutationResult(
    await writeDraft(draft, options),
    'Call validation_context_read, then add draft nodes and files.',
  )
}

export async function readValidationDraft(planId: string, options: Options = {}) {
  const draft = await readDraftFile(planId, options)
  return toMutationResult(draft, 'Continue mutating the draft or call validation_draft_check.')
}

export async function resetValidationDraft(planId: string, options: Options = {}) {
  const file = await resolveDraftFile(planId, options.projectDirectory)
  await fs.rm(file, { force: true })
  return createValidationDraft(planId, options)
}

export async function upsertValidationNode(
  planId: string,
  node: ValidationDraft['validations'][number],
  options: Options = {},
) {
  const draft = await readDraftFile(planId, options)
  const nextNodes = draft.validations.filter(item => item.id !== node.id)
  nextNodes.push(node)
  const next = await writeDraft({ ...draft, status: 'draft', validations: nextNodes }, options)
  return toMutationResult(next, 'Call validation_file_upsert for changed files or validation_draft_check.')
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
  return toMutationResult(next, 'Call validation_draft_check before publishing.')
}

export async function upsertValidationTestCase(
  planId: string,
  proposal: {
    title: string
    behavior: string
    coveredTaskIds: string[]
    suiteRef?: string
    steps: Array<{
      intent: string
      gherkinText: string
      templateStepRef?: string
      parameters?: Array<{ name: string; value: string; type?: string; locatorRef?: string }>
    }>
    gherkinPath?: string
    stepPath?: string
    browser?: string
    environment?: string
  },
  options: Options = {},
) {
  const caseId = slug(proposal.title, 'validation-case')
  const suiteId = ensureId(
    proposal.suiteRef ? slug(proposal.suiteRef, 'validation-suite') : undefined,
    'validation-suite',
  )
  const moduleId = 'validation-module'
  const stepPath = proposal.stepPath ?? `automation/steps/${caseId}.steps.ts`
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
          steps: proposal.steps.map((step, index) => ({
            id: `${caseId}-step-${index + 1}`,
            order: index,
            label: step.intent,
            gherkinStep: step.gherkinText,
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
    stepPaths: [stepPath],
    executable: { path: gherkinPath, selector: proposal.title },
    matrix: [{ browser: proposal.browser ?? 'chromium', environment: proposal.environment ?? 'local' }],
    expectedFailures: [],
  }
  const result = await upsertValidationNode(planId, node, options)
  if (!proposal.steps.some(step => step.templateStepRef)) return result
  const draft = await readDraftFile(planId, options)
  const reusedStepPaths = Array.from(new Set([...draft.reusedStepPaths, stepPath])).sort()
  const next = await writeDraft({ ...draft, reusedStepPaths }, options)
  return toMutationResult(next, 'Call validation_file_upsert for changed files or validation_draft_check.')
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
    newStepPaths: draft.newStepPaths,
    customStepJustifications: draft.customStepJustifications,
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
