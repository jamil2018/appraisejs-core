import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import {
  serializeYamlArtifact,
  type PlanArtifact,
  type ReviewArtifact,
  type ValidationArtifact,
} from '../src/lib/plan-contract'
import { syncPlans } from '../src/lib/plans/plan-sync-service'
import { reconcileManagedValidationReviewState } from '../src/services/coordinator/managed-validation-review-state'
import { disconnectPrisma, resetE2eData } from './helpers/test-data'

const seededPlanId = 'e2e-semantic-plan-flow-graph'
const seededPlanPath = join(process.cwd(), 'appraise', 'plans', `${seededPlanId}.yaml`)
const seededReviewPath = join(process.cwd(), 'appraise', 'plans', 'reviews', `${seededPlanId}.review.yaml`)
const validationPlanId = 'e2e-validation-review-approval'
const seededTargetProjectId = '00000000-0000-4000-8000-000000000001'
const validationPlanPath = join(process.cwd(), 'appraise', 'plans', `${validationPlanId}.yaml`)
const validationReviewPath = join(process.cwd(), 'appraise', 'plans', 'reviews', `${validationPlanId}.review.yaml`)
const validationArtifactPath = join(
  process.cwd(),
  'appraise',
  'plans',
  'validations',
  `${validationPlanId}.validation.yaml`,
)
const validationProductionPath = join(process.cwd(), 'src', 'app', 'weather-result.tsx')
const validationFeaturePath = join(process.cwd(), 'automation', 'features', 'validation-review.feature')
const validationStepPath = join(process.cwd(), 'automation', 'steps', 'validation-review.steps.ts')
const validationProductionContent = 'export function WeatherResult() { return null }'

const seededPlan: PlanArtifact = {
  version: '1',
  planId: seededPlanId,
  revision: 1,
  lifecycle: 'plan_approved',
  goal: 'Make plan dependency flow easy to follow',
  description: 'Exercise the semantic plan review graph and accessible list with deterministic E2E data.',
  tasks: [
    {
      id: 'derive-deterministic-steps',
      title: 'Derive deterministic task steps',
      description: 'Create stable task nodes for graph and list review.',
      acceptanceCriteria: ['The task appears in the graph and accessible list.'],
      validationIntent: 'Verify the first task can be reviewed from the accessible list.',
    },
    {
      id: 'render-numbered-workflow',
      title: 'Render a numbered left-to-right workflow graph',
      description: 'Render ordered stages so reviewers can understand the dependency flow.',
      acceptanceCriteria: ['The second task is reachable from keyboard navigation.'],
      validationIntent: 'Verify inspector selection follows accessible list keyboard activation.',
    },
  ],
  edges: [{ from: 'derive-deterministic-steps', to: 'render-numbered-workflow', type: 'depends-on' }],
  implementationGroups: [
    { id: 'semantic-review', taskIds: ['derive-deterministic-steps', 'render-numbered-workflow'] },
  ],
}

const validationPlan: PlanArtifact = {
  version: '1',
  planId: validationPlanId,
  revision: 1,
  lifecycle: 'awaiting_validation_review',
  goal: 'Approve validation review from the app',
  description: 'Exercise evidence approval and revision-level validation submission from the browser.',
  tasks: [
    {
      id: 'validation-workflow',
      title: 'Review validation workflow',
      description: 'Approve required validation evidence and submit the validation review.',
      acceptanceCriteria: ['The validation review emits validations_approved.'],
      validationIntent: 'Drive validation review through the browser UI.',
    },
  ],
  edges: [],
  implementationGroups: [{ id: 'quality', taskIds: ['validation-workflow'] }],
}

function hashContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

async function removeSeededPlan(): Promise<void> {
  await Promise.all([
    rm(seededPlanPath, { force: true }),
    rm(seededReviewPath, { force: true }),
    rm(validationPlanPath, { force: true }),
    rm(validationReviewPath, { force: true }),
    rm(validationArtifactPath, { force: true }),
    rm(validationProductionPath, { force: true }),
    rm(validationFeaturePath, { force: true }),
    rm(validationStepPath, { force: true }),
  ])
}

async function seedReviewablePlan(): Promise<void> {
  await removeSeededPlan()
  const planContent = serializeYamlArtifact('plan', seededPlan)
  const planHash = hashContent(planContent)
  const review: ReviewArtifact = {
    version: '1',
    planId: seededPlanId,
    threads: [],
    planApprovals: [
      {
        id: 'approval-e2e-semantic-flow',
        revision: seededPlan.revision,
        contentHash: planHash,
        relevantHashes: { plan: planHash },
        approvedBy: 'e2e-reviewer',
        approvedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    fileApprovals: [],
  }

  await mkdir(join(process.cwd(), 'appraise', 'plans', 'reviews'), { recursive: true })
  await Promise.all([
    writeFile(seededPlanPath, planContent),
    writeFile(seededReviewPath, serializeYamlArtifact('review', review)),
  ])
}

async function seedValidationReviewPlan(): Promise<void> {
  await prisma.environment.upsert({
    where: { id: 'e2e-plan-review-local' },
    update: { baseUrl: 'http://127.0.0.1:3200' },
    create: { id: 'e2e-plan-review-local', name: 'local', baseUrl: 'http://127.0.0.1:3200' },
  })
  const planContent = serializeYamlArtifact('plan', validationPlan)
  const planHash = hashContent(planContent)
  const productionFileHash = hashContent(validationProductionContent)
  const review: ReviewArtifact = {
    version: '1',
    planId: validationPlanId,
    threads: [],
    planApprovals: [
      {
        id: 'approval-e2e-validation-flow',
        revision: validationPlan.revision,
        contentHash: planHash,
        relevantHashes: { plan: planHash },
        approvedBy: 'e2e-reviewer',
        approvedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    fileApprovals: [],
  }
  const validation: ValidationArtifact = {
    version: '1',
    planId: validationPlanId,
    revision: 1,
    baseRevision: {
      gitCommit: null,
      snapshotHash: hashContent('validation-review-snapshot'),
      reducedAssurance: true,
    },
    classificationOverrides: [],
    validations: [
      {
        id: 'browser-validation',
        taskIds: ['validation-workflow'],
        required: true,
        testCaseIds: ['validation-review-path'],
        appraiseArtifacts: {
          modules: [{ id: 'validation-module', name: 'Validation review' }],
          testSuites: [
            {
              id: 'validation-suite',
              name: 'Validation review suite',
              description: 'Reviews browser validation approval.',
              moduleId: 'validation-module',
              testCaseIds: ['validation-review-path'],
            },
          ],
          testCases: [
            {
              id: 'validation-review-path',
              title: 'Approve validation in the app',
              description: 'Approve evidence and submit the validation review.',
              steps: [
                {
                  id: 'open-validation-review',
                  order: 0,
                  label: 'Open validation review',
                  gherkinStep: 'Given I open the validation review page',
                  templateStepName: 'Navigate to URL',
                  parameters: [{ name: 'url', value: `/plans/${validationPlanId}?review=validation`, type: 'TEXT' }],
                },
              ],
            },
          ],
          locatorGroups: [
            { id: 'validation-page', name: 'Validation page', route: '/plans', moduleId: 'validation-module' },
          ],
          locators: [
            {
              id: 'submit-validation-review',
              name: 'Submit validation review',
              value: 'button:has-text("Submit validation review")',
              locatorGroupId: 'validation-page',
            },
          ],
        },
        gherkinPaths: ['automation/features/validation-review.feature'],
        stepPaths: ['automation/steps/validation-review.steps.ts'],
        executable: { path: 'automation/features/validation-review.feature', selector: 'Validation review suite' },
        matrix: [{ browser: 'chromium', environment: 'local' }],
        expectedFailures: [],
        astProvenance: {
          schemaVersion: '2',
          astHash: `sha256:${'a'.repeat(64)}`,
          executionAuthority: 'runtime_capsule',
          publishOperationId: 'astpub_validation_review_e2e',
          receiptHash: `sha256:${'b'.repeat(64)}`,
          runtimeInputHash: `sha256:${'c'.repeat(64)}`,
        },
      },
    ],
    approvals: [],
    validationDecisions: [],
    files: [
      {
        path: 'src/app/weather-result.tsx',
        classification: 'production',
        rationale: 'Production surface changed by validation-prep fixture.',
        status: 'added',
        beforeHash: null,
        contentHash: productionFileHash,
        patch:
          '--- /dev/null\n+++ b/src/app/weather-result.tsx\n@@\n+export function WeatherResult() { return null }\n',
        declared: true,
      },
    ],
    manifestPaths: ['src/app/weather-result.tsx'],
    baselineAttempts: [],
    baselineAcknowledgements: [],
    baselineDecision: 'pending',
  }

  await mkdir(join(process.cwd(), 'appraise', 'plans', 'reviews'), { recursive: true })
  await mkdir(join(process.cwd(), 'appraise', 'plans', 'validations'), { recursive: true })
  await mkdir(join(process.cwd(), 'src', 'app'), { recursive: true })
  await mkdir(join(process.cwd(), 'automation', 'features'), { recursive: true })
  await mkdir(join(process.cwd(), 'automation', 'steps'), { recursive: true })
  await Promise.all([
    writeFile(validationPlanPath, planContent),
    writeFile(validationReviewPath, serializeYamlArtifact('review', review)),
    writeFile(validationArtifactPath, serializeYamlArtifact('validation', validation)),
    writeFile(validationProductionPath, validationProductionContent),
    writeFile(validationFeaturePath, 'Feature: Validation review\n  Scenario: Validation review suite\n'),
    writeFile(
      validationStepPath,
      'import { Given } from "@cucumber/cucumber"\n\nGiven("I open the validation review page", function () {})\n',
    ),
  ])
}

async function seedValidationPublishOperation(): Promise<void> {
  const targetProject = await prisma.targetProject.findUniqueOrThrow({ where: { id: seededTargetProjectId } })
  await prisma.planProjection.update({
    where: { planId: seededPlanId },
    data: { targetProjectId: targetProject.id },
  })
  const projection = await prisma.planProjection.update({
    where: { planId: validationPlanId },
    data: { targetProjectId: targetProject.id },
  })
  const [planContent, validationContent, reviewContent] = await Promise.all([
    readFile(validationPlanPath, 'utf8'),
    readFile(validationArtifactPath, 'utf8'),
    readFile(validationReviewPath, 'utf8'),
  ])
  const digest = (label: string) => hashContent(`${validationPlanId}:${label}`)
  await prisma.planEvent.deleteMany({ where: { publishOperationId: 'astpub_validation_review_e2e' } })
  await prisma.validationAstPublishOperation.deleteMany({ where: { id: 'astpub_validation_review_e2e' } })
  await prisma.validationAstPublishOperation.create({
    data: {
      id: 'astpub_validation_review_e2e',
      planId: validationPlanId,
      planProjectionId: projection.id,
      targetProjectId: targetProject.id,
      targetFingerprint: targetProject.fingerprint,
      idempotencyKey: 'validation-review-e2e',
      operationHash: digest('operation'),
      phase: 'review_ready',
      expectedPlanHash: digest('expected-plan'),
      expectedPlanArtifactHash: digest('expected-plan-artifact'),
      expectedValidationHash: digest('expected-validation'),
      expectedReviewHash: digest('expected-review'),
      planHash: hashContent(planContent),
      validationHash: hashContent(validationContent),
      reviewHash: hashContent(reviewContent),
      planContent,
      validationContent,
      reviewContent,
      astId: 'validation-review-e2e',
      astHash: `sha256:${'a'.repeat(64)}`,
      contextHash: digest('context'),
      previewHash: digest('preview'),
      receiptHash: `sha256:${'b'.repeat(64)}`,
      projectionHash: digest('projection'),
      projectionJson: '{}',
      validationProjectionJson: projection.validationJson ?? validationContent,
      runtimeInputHash: `sha256:${'c'.repeat(64)}`,
      runtimeInputJson: '{}',
    },
  })
  const latestEvent = await prisma.planEvent.findFirst({
    where: { planProjectionId: projection.id },
    orderBy: { sequence: 'desc' },
  })
  await prisma.planEvent.create({
    data: {
      planProjectionId: projection.id,
      publishOperationId: 'astpub_validation_review_e2e',
      sequence: (latestEvent?.sequence ?? 0) + 1,
      type: 'validation_review_ready',
      payloadJson: '{}',
    },
  })
  await reconcileManagedValidationReviewState(validationPlanId)
}

test.describe('Plan review', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedReviewablePlan()
    await seedValidationReviewPlan()
    await syncPlans()
    await seedValidationPublishOperation()
  })

  test.afterAll(async () => {
    await removeSeededPlan()
    await disconnectPrisma()
  })

  test('keeps graph and accessible list reviewable with keyboard-operable controls', async ({ page }, testInfo) => {
    const consoleErrors: string[] = []
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto(`/plans/${seededPlanId}`)
    await expect(page.getByRole('heading', { name: 'Make plan dependency flow easy to follow' })).toBeVisible()
    await expect(page.getByLabel('Plan dependency graph')).toBeVisible()
    await expect(page.getByRole('button', { name: /Reset view/i })).toBeVisible()
    await page.getByRole('tab', { name: /Approval/i }).click()
    await expect(page.getByRole('button', { name: /Revision approved|Approve exact revision/i })).toBeDisabled()
    await page.getByRole('tab', { name: /Discussion/i }).click()

    await testInfo.attach('plan-review-graph', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByRole('tab', { name: /Accessible list/i }).click()
    await expect(page.getByRole('button', { name: /Select task 2: Derive deterministic task steps/i })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Select task 1: Render a numbered left-to-right workflow graph/i }),
    ).toBeVisible()
    await expect(page.getByText(/Stage 2/).first()).toBeVisible()

    const secondTask = page.getByRole('button', {
      name: /Select task 1: Render a numbered left-to-right workflow graph/i,
    })
    await expect(secondTask).toContainText(/depends-on to derive-deterministic-steps/i)
    await secondTask.focus()
    await expect(secondTask).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('complementary').getByText('Render a numbered left-to-right workflow graph'),
    ).toBeVisible()
    await expect(page.getByRole('textbox', { name: /Remark body/i })).toBeVisible()

    await page.getByRole('tab', { name: /Graph/i }).click()
    await page.getByRole('button', { name: /Reset view/i }).focus()
    await expect(page.getByRole('button', { name: /Reset view/i })).toBeFocused()
    await page.getByRole('textbox', { name: /Remark body/i }).focus()
    await expect(page.getByRole('textbox', { name: /Remark body/i })).toBeFocused()

    await testInfo.attach('plan-review-list', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    expect(consoleErrors).toEqual([])
  })

  test('submits validation review only after evidence and file approvals', async ({ page }) => {
    await page.goto(`/plans/${validationPlanId}?review=validation`)

    const validationsPanel = page.getByRole('tabpanel', { name: /validations/i })
    await expect(validationsPanel).toBeVisible()
    await page.getByRole('button', { name: /Approve evidence/i }).click()
    await expect(page.getByRole('button', { name: /Approved evidence/i })).toBeDisabled()
    await expect(page.getByRole('button', { name: /Submit validation review/i })).toBeDisabled()
    await expect(validationsPanel.getByRole('button', { name: /Start required baselines/i })).toHaveCount(0)

    const afterNodeApproval = await prisma.planProjection.findUniqueOrThrow({ where: { planId: validationPlanId } })
    expect(afterNodeApproval.lifecycle).toBe('awaiting_validation_review')

    await page.getByRole('button', { name: /Approve file/i }).click()
    await expect(page.getByText(/submitting the validation review emits validations_approved/i)).toBeVisible()
    await page.getByRole('button', { name: /Submit validation review/i }).click()

    await expect(page.getByText(/validations approved/i)).toBeVisible()
    await expect(validationsPanel.getByRole('button', { name: /Start required baselines/i })).toHaveCount(0)
    await expect(validationsPanel.getByText(/^Validation review is approved\./i)).toBeVisible()

    const projection = await prisma.planProjection.findUniqueOrThrow({
      where: { planId: validationPlanId },
      include: { events: { orderBy: { sequence: 'asc' } } },
    })
    expect(projection.lifecycle).toBe('validations_approved')
    expect(projection.events.map(event => event.type)).toContain('validations_approved')
  })
})
