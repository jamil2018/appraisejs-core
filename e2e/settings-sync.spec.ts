import { test, expect } from '@playwright/test'

import { disconnectPrisma, resetE2eData, seedCoreData } from './helpers/test-data'

const syncScriptLabels = [
  'Sync Plans',
  'Sync Modules',
  'Sync Environments',
  'Sync Tags',
  'Sync Step Definitions',
  'Sync Locator Groups',
  'Sync Locators',
  'Sync Test Suites',
  'Sync Test Cases',
] as const
import { expectPageHeading } from './helpers/ui'

test.describe('Settings sync @sync', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  for (const label of syncScriptLabels) {
    test(`sync script ${label} completes`, async ({ page }) => {
      test.setTimeout(120_000)

      await page.goto('/settings')
      await expectPageHeading(page, 'Settings')
      await page.getByRole('button', { name: label, exact: true }).click()
      await expect(page.getByText(/Sync completed|Sync failed/).first()).toBeVisible({ timeout: 90_000 })
      await expect(page.getByText(/fatal|uncaught/i)).toHaveCount(0)
    })
  }
})
