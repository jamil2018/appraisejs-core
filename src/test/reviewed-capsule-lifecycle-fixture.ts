import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '@/lib/plan-contract'
import { createCustomExtensionPolicy } from '@/lib/validation-ast/extension-policy'
import { prepareValidationAstPublish } from '@/services/coordinator/validation-ast-publish-journal-service'

export const reviewedCapsuleHashText = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`
export const reviewedCapsuleHashValue = (value: unknown) => reviewedCapsuleHashText(canonicalContractJson(value))
export const reviewedCapsuleAstHash = reviewedCapsuleHashText('reviewed-ast')
const reviewedCapsuleGherkin = ['Scenario: Open home\n  When the user opens home']

export type ReviewedExtensionFixture = ReturnType<typeof reviewedExtensionFixture>

export function reviewedRuntimeInputFixture(
  projectId: string,
  fingerprint: string,
  reviewedReceiptHash: string,
  extensions: Array<{
    id: string
    version: string
    sourceHash: string
    compiledHash: string
    artifactHash: string
  }> = [],
) {
  const compilerReceipt = {
    schemaVersion: '1' as const,
    catalogHash: reviewedCapsuleHashText('catalog'),
    locatorGraphHash: reviewedCapsuleHashText('locators'),
    environments: ['local'],
    browsers: ['chromium'],
    runtimes: ['browser'],
  }
  return {
    schemaVersion: '1' as const,
    targetProjectId: projectId,
    targetFingerprint: fingerprint,
    astId: 'navigation',
    astHash: reviewedCapsuleAstHash,
    contextHash: reviewedCapsuleHashText('context'),
    previewHash: reviewedCapsuleHashText('preview'),
    receiptHash: reviewedReceiptHash,
    compilerReceipt: { ...compilerReceipt, contentHash: reviewedCapsuleHashValue(compilerReceipt) },
    extensionPolicy: structuredClone(
      createCustomExtensionPolicy({ projectId, projectFingerprint: fingerprint, capabilityImports: {} }),
    ) as ReturnType<typeof createCustomExtensionPolicy> & { capabilityImports: Record<string, string[]> },
    actions: [{ id: 'browser.navigation.goto', version: '1', contentHash: reviewedCapsuleHashText('action') }],
    locators: [],
    extensions,
    matrix: [{ browser: 'chromium', environment: 'local' }],
    expected: {
      scenarioCount: 1,
      scenarios: [{ scenarioId: 'open-home', caseId: 'home-case', stepIds: ['open-step'] }],
    },
    gherkinHash: reviewedCapsuleHashValue(reviewedCapsuleGherkin),
  }
}

export function reviewedExtensionFixture(projectId: string, fingerprint: string) {
  const source = "export const reviewedSource = 'exact'\n"
  const compiledSource = "export const reviewedCompiled = 'exact-reviewed-bytes'\n"
  const artifact = {
    schemaVersion: '1' as const,
    projectId,
    projectFingerprint: fingerprint,
    extension: {
      id: 'reviewed-extension',
      version: '1.2.3',
      title: 'Reviewed extension',
      description: 'Exact reviewed extension bytes.',
      inputs: [],
      outputs: [],
    },
    requiredCapabilities: [],
    imports: [],
    source,
    compiledSource,
    sourceHash: reviewedCapsuleHashText(source),
    compiledHash: reviewedCapsuleHashText(compiledSource),
    cucumberModulePath: path.resolve(process.cwd(), 'node_modules/@cucumber/cucumber/lib/index.js'),
  }
  return { artifact, artifactHash: reviewedCapsuleHashValue(artifact) }
}

export function validationForReviewedCapsule(
  planId: string,
  operationId: string,
  reviewedReceiptHash: string,
  reviewedRuntimeInputHash: string,
): ValidationArtifact {
  return {
    version: '1',
    planId,
    revision: 1,
    baseRevision: { gitCommit: null, snapshotHash: reviewedCapsuleHashText('snapshot'), reducedAssurance: false },
    classificationOverrides: [],
    validations: [
      {
        id: 'navigation',
        taskIds: ['open-home'],
        required: true,
        testCaseIds: ['home-case'],
        appraiseArtifacts: {
          modules: [{ id: 'home-module', name: 'Home' }],
          testSuites: [
            { id: 'home-suite', name: 'Home navigation', moduleId: 'home-module', testCaseIds: ['home-case'] },
          ],
          testCases: [
            {
              id: 'home-case',
              title: 'Open home',
              description: 'Open the home page.',
              steps: [
                {
                  id: 'open-step',
                  order: 0,
                  label: 'Open home',
                  gherkinStep: 'When the user opens home',
                  templateStepName: 'browser.navigation.goto@1',
                  parameters: [{ name: 'url', value: '/' }],
                },
              ],
            },
          ],
          locatorGroups: [],
          locators: [],
        },
        gherkinPaths: ['automation/features/navigation.feature'],
        stepPaths: [],
        executable: { path: 'automation/features/navigation.feature' },
        astProvenance: {
          schemaVersion: '2',
          astHash: reviewedCapsuleAstHash,
          executionAuthority: 'phase2_review_only',
          publishOperationId: operationId,
          receiptHash: reviewedReceiptHash,
          runtimeInputHash: reviewedRuntimeInputHash,
        },
        matrix: [{ browser: 'chromium', environment: 'local' }],
        expectedFailures: [],
      },
    ],
    approvals: [],
    validationDecisions: [],
    files: [],
    manifestPaths: [],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
  }
}

export async function seedReviewedCapsuleLifecycleFixture(options: {
  client: PrismaClient
  workspace: string
  environmentId: string
  projectId: string
  planId: string
  runId: string
  extension?: ReviewedExtensionFixture
  omitTestRun?: boolean
  planLifecycle?: PlanArtifact['lifecycle']
}) {
  const { client, workspace, environmentId, projectId, planId, runId, extension } = options
  const fingerprint = reviewedCapsuleHashText(projectId)
  await client.targetProject.upsert({
    where: { id: projectId },
    update: {},
    create: {
      id: projectId,
      canonicalPath: path.join(workspace, projectId),
      displayName: 'Same display name',
      fingerprint,
    },
  })
  const receiptHash = reviewedCapsuleHashText(`receipt-${planId}`)
  const operationId = `astpub_${receiptHash.slice(7)}`
  const extensionEvidence = extension
    ? [
        {
          id: extension.artifact.extension.id,
          version: extension.artifact.extension.version,
          sourceHash: extension.artifact.sourceHash,
          compiledHash: extension.artifact.compiledHash,
          artifactHash: extension.artifactHash,
        },
      ]
    : []
  const runtimeInput = reviewedRuntimeInputFixture(projectId, fingerprint, receiptHash, extensionEvidence)
  const runtimeInputJson = canonicalContractJson(runtimeInput)
  const runtimeInputHash = reviewedCapsuleHashValue(runtimeInput)
  const validation = validationForReviewedCapsule(planId, operationId, receiptHash, runtimeInputHash)
  const validationProjectionJson = JSON.stringify(validation)
  const projection = { validationNode: validation.validations[0]!, gherkin: reviewedCapsuleGherkin }
  const projectRoot = path.join(workspace, projectId)
  await fs.mkdir(path.join(projectRoot, 'appraise/plans/validations'), { recursive: true })
  await fs.mkdir(path.join(projectRoot, 'appraise/plans/reviews'), { recursive: true })
  await fs.writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: projectId, private: true }))
  const plan: PlanArtifact = {
    version: '1',
    planId,
    revision: 1,
    lifecycle: options.planLifecycle ?? 'awaiting_validation_review',
    goal: 'Open home',
    description: 'Open home',
    tasks: [
      {
        id: 'open-home',
        title: 'Open home',
        description: 'Open the home page.',
        acceptanceCriteria: ['The home page opens.'],
        validationIntent: 'Run the reviewed navigation validation.',
      },
    ],
    edges: [],
    implementationGroups: [{ id: 'navigation', taskIds: ['open-home'] }],
  }
  const review: ReviewArtifact = { version: '1', planId, threads: [], planApprovals: [], fileApprovals: [] }
  const planContent = serializeYamlArtifact('plan', plan)
  const validationContent = serializeYamlArtifact('validation', validation)
  const reviewContent = serializeYamlArtifact('review', review)
  const planHash = reviewedCapsuleHashText(planContent)
  const validationHash = reviewedCapsuleHashText(validationContent)
  const reviewHash = reviewedCapsuleHashText(reviewContent)
  await Promise.all([
    fs.writeFile(path.join(projectRoot, 'appraise/plans', `${planId}.yaml`), planContent),
    fs.writeFile(path.join(projectRoot, 'appraise/plans/validations', `${planId}.validation.yaml`), validationContent),
    fs.writeFile(path.join(projectRoot, 'appraise/plans/reviews', `${planId}.review.yaml`), reviewContent),
  ])
  const planProjection = await client.planProjection.upsert({
    where: { planId },
    update: {
      revision: 1,
      lifecycle: plan.lifecycle,
      goal: plan.goal,
      description: plan.description,
      sourceHash: planHash,
      planPath: path.join(projectRoot, 'appraise/plans', `${planId}.yaml`),
      reviewJson: JSON.stringify(review),
      validationJson: validationProjectionJson,
      targetProjectId: projectId,
    },
    create: {
      planId,
      slug: planId,
      revision: 1,
      lifecycle: plan.lifecycle,
      goal: 'Open home',
      description: 'Open home',
      sourceHash: planHash,
      planPath: path.join(projectRoot, 'appraise/plans', `${planId}.yaml`),
      reviewJson: JSON.stringify(review),
      validationJson: validationProjectionJson,
      lastValidProjectedAt: new Date(),
      targetProjectId: projectId,
    },
  })
  const testRun = options.omitTestRun
    ? null
    : await client.testRun.create({
        data: { name: `Capsule ${planId}`, runId, environmentId, planId, targetProjectId: projectId },
      })
  await client.module.upsert({ where: { id: 'home-module' }, update: {}, create: { id: 'home-module', name: 'Home' } })
  await client.testCase.upsert({
    where: { id: 'home-case' },
    update: {},
    create: { id: 'home-case', title: 'Open home', description: 'Open the home page.' },
  })
  await client.testSuite.upsert({
    where: { id: 'home-suite' },
    update: { testCases: { connect: { id: 'home-case' } } },
    create: {
      id: 'home-suite',
      name: 'Home navigation',
      moduleId: 'home-module',
      testCases: { connect: { id: 'home-case' } },
    },
  })
  await prepareValidationAstPublish(
    {
      id: operationId,
      planId,
      planProjectionId: planProjection.id,
      targetProjectId: projectId,
      targetFingerprint: fingerprint,
      idempotencyKey: `capsule-${planId}`,
      expectedPlanHash: planHash,
      expectedPlanArtifactHash: planHash,
      expectedReviewHash: reviewHash,
      planHash,
      validationHash,
      reviewHash,
      planContent,
      validationContent,
      reviewContent,
      astId: 'navigation',
      astHash: reviewedCapsuleAstHash,
      contextHash: reviewedCapsuleHashText('context'),
      previewHash: reviewedCapsuleHashText('preview'),
      receiptHash,
      projectionHash: reviewedCapsuleHashValue(projection),
      projectionJson: canonicalContractJson(projection),
      validationProjectionJson,
      runtimeInputHash,
      runtimeInputJson,
      extensionReviews: extension
        ? [
            {
              extensionId: extension.artifact.extension.id,
              version: extension.artifact.extension.version,
              sourceHash: extension.artifact.sourceHash,
              compiledHash: extension.artifact.compiledHash,
              artifactHash: extension.artifactHash,
              artifactJson: JSON.stringify(extension.artifact),
            },
          ]
        : [],
    },
    client,
  )
  await client.validationAstPublishOperation.update({ where: { id: operationId }, data: { phase: 'review_ready' } })
  return { operationId, testRun, planProjection, validation, runtimeInput, projectRoot }
}
