import { test, expect } from '@playwright/test'

import { disconnectPrisma, findTestRunById, resetE2eData, seedCoreData, seededIds } from './helpers/test-data'
import { expectPageHeading } from './helpers/ui'

test.describe('Runs and reports @runs', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('test runs list shows seeded variants and recent failed filter', async ({ page }) => {
    await page.goto('/test-runs')
    await expectPageHeading(page, 'Test Runs')
    await expect(page.getByText('E2E Completed Run', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('E2E Failed Run', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('E2E Queued Run', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('E2E Running Run', { exact: true }).first()).toBeVisible()

    await page.goto('/test-runs?filter=recentFailed')
    await expect(page.getByText('E2E Failed Run', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('E2E Completed Run', { exact: true }).first()).toBeHidden()
  })

  test('test run detail shows status and report navigation', async ({ page }) => {
    await page.goto(`/test-runs/${seededIds.testRun}`)
    await expectPageHeading(page, 'Test Run Details')
    await expect(page.getByText('E2E Completed Run')).toBeVisible()
    await expect(page.getByText('Finished', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('E2E seeded login works')).toBeVisible()

    await page.getByRole('link', { name: /View Report/ }).click()
    await expectPageHeading(page, /Test Run Report:/)
    await expect(page.getByText('Total Tests')).toBeVisible()
  })

  test('create test run form loads selections without starting execution', async ({ page }) => {
    await page.goto('/test-runs/create')
    await expectPageHeading(page, 'Create Test Run')
    await page.getByLabel('Name').fill('E2E Draft Run')
    await page.getByLabel('Environment').click()
    await page.getByRole('option', { name: 'E2E Local' }).click()
    await page.getByRole('combobox', { name: 'Test tags' }).click()
    await page.getByRole('option', { name: 'E2E Smoke' }).click()
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  test('reports list and metric drill-down pages render seeded data', async ({ page }) => {
    await page.goto('/reports')
    await expectPageHeading(page, 'Reports')
    await expect(page.getByText('E2E Completed Run', { exact: true }).first()).toBeVisible()

    await page.goto('/reports/test-cases?filter=repeatedlyFailing')
    await expectPageHeading(page, 'Failing Test Cases Report')
    await expect(page.getByText('E2E seeded login works', { exact: true }).first()).toBeVisible()

    await page.goto('/reports/test-cases?filter=flaky')
    await expect(page.getByText('E2E seeded login works', { exact: true }).first()).toBeVisible()

    await page.goto('/reports/test-suites?filter=notExecutedRecently')
    await expectPageHeading(page, 'Test Suites Report')
    await expect(page.getByText('E2E Auth Suite', { exact: true }).first()).toBeVisible()
  })

  test('cancel run updates seeded running run status', async ({ page }) => {
    await page.goto(`/test-runs/${seededIds.runningTestRun}`)
    await expectPageHeading(page, 'Test Run Details')
    await page.getByRole('button', { name: /Cancel Run/i }).click()

    await expect
      .poll(async () => {
        const run = await findTestRunById(seededIds.runningTestRun)
        return run?.status
      })
      .toMatch(/CANCELLED|CANCELLING/)
  })
})
