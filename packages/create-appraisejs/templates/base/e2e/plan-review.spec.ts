import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { serializeYamlArtifact, type PlanArtifact, type ReviewArtifact } from '../src/lib/plan-contract'
import { syncPlans } from '../src/lib/plans/plan-sync-service'
import { disconnectPrisma, resetE2eData } from './helpers/test-data'

const seededPlanId = 'e2e-semantic-plan-flow-graph'
const seededPlanPath = join(process.cwd(), 'appraise', 'plans', `${seededPlanId}.yaml`)
const seededReviewPath = join(process.cwd(), 'appraise', 'plans', 'reviews', `${seededPlanId}.review.yaml`)

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

function hashContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

async function removeSeededPlan(): Promise<void> {
  await Promise.all([rm(seededPlanPath, { force: true }), rm(seededReviewPath, { force: true })])
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

test.describe('Plan review', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedReviewablePlan()
    await syncPlans()
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
    await expect(page.getByRole('button', { name: /Revision approved|Approve exact revision/i })).toBeDisabled()

    await testInfo.attach('plan-review-graph', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    await page.getByRole('tab', { name: /Accessible list/i }).click()
    const list = page.getByRole('list', { name: 'Semantic plan review list' })
    await expect(list.getByRole('button', { name: /Derive deterministic task steps/i })).toBeVisible()
    await expect(list.getByRole('button', { name: /Render a numbered left-to-right workflow graph/i })).toBeVisible()
    await expect(list.getByText(/Relationships: depends-on to derive-deterministic-steps/i)).toBeVisible()
    await expect(list.getByText(/Stage 2/).first()).toBeVisible()

    const secondTask = list.getByRole('button', {
      name: /Render a numbered left-to-right workflow graph/i,
    })
    await secondTask.focus()
    await expect(secondTask).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('complementary').getByText('Render a numbered left-to-right workflow graph'),
    ).toBeVisible()
    await expect(page.getByLabel('Add remark')).toBeVisible()

    await page.getByRole('tab', { name: /Graph/i }).click()
    await page.getByRole('button', { name: /Reset view/i }).focus()
    await expect(page.getByRole('button', { name: /Reset view/i })).toBeFocused()
    await page.getByRole('textbox', { name: /Add remark/i }).focus()
    await expect(page.getByRole('textbox', { name: /Add remark/i })).toBeFocused()

    await testInfo.attach('plan-review-list', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    expect(consoleErrors).toEqual([])
  })
})
