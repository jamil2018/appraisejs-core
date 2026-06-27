import { expect, test } from '@playwright/test'

import { syncPlans } from '../src/lib/plans/plan-sync-service'
import { disconnectPrisma, resetE2eData } from './helpers/test-data'

test.describe('Plan review', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await syncPlans()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('keeps graph and accessible list reviewable with keyboard-operable controls', async ({ page }, testInfo) => {
    const consoleErrors: string[] = []
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto('/plans/semantic-plan-flow-graph')
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
    await expect(list.getByText(/Relationships: depends-on to render-numbered-workflow/i)).toBeVisible()
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
