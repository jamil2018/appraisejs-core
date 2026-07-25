import { test, expect } from '@playwright/test'

import {
  disconnectPrisma,
  findModuleByName,
  generateSeededFeature,
  readGeneratedFeature,
  resetE2eData,
  seedCoreData,
  seededIds,
} from './helpers/test-data'
import { createModule, expectPageHeading } from './helpers/ui'

test.describe('Smoke @smoke', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('dashboard renders seeded entity metrics', async ({ page }) => {
    await page.goto('/')
    await expectPageHeading(page, 'Dashboard')
    await expect(page.getByRole('button', { name: 'Test Cases' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Test Suites' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Step Definitions' })).toBeVisible()
    await expect(page.getByText('Attention Needed')).toBeVisible()
  })

  test('module CRUD path creates edits and deletes a module', async ({ page }) => {
    const moduleName = 'E2E Smoke Module'
    const editedModuleName = 'E2E Smoke Module Edited'

    await createModule(page, moduleName)
    const createdModule = await findModuleByName(moduleName)
    expect(createdModule).not.toBeNull()

    await page.goto(`/modules/modify/${createdModule?.id}`)
    await page.getByLabel('Name').fill(editedModuleName)
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page).toHaveURL(/\/modules$/)
    await expect(page.getByText(editedModuleName, { exact: true }).first()).toBeVisible()
  })

  test('seeded completed run opens report summary', async ({ page }) => {
    await page.goto(`/test-runs/${seededIds.testRun}`)
    await expectPageHeading(page, 'Test Run Details')
    await expect(page.getByText('E2E Completed Run')).toBeVisible()

    await page.getByRole('link', { name: /View Report/ }).click()
    await expectPageHeading(page, /Test Run Report:/)
    await expect(page.getByText('E2E seeded login works')).toBeVisible()
  })

  test('settings sync all completes without a fatal error', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/settings')
    await expectPageHeading(page, 'Settings')
    await page.getByRole('button', { name: 'Sync All' }).click()
    await expect(page.getByText(/Sync completed|Sync failed/).first()).toBeVisible({ timeout: 90_000 })
    await expect(page.getByText(/fatal|uncaught/i)).toHaveCount(0)
  })

  test('feature generation writes suite-backed feature output', async () => {
    const featurePath = await generateSeededFeature()
    const featureContent = readGeneratedFeature()

    expect(featurePath.replaceAll('\\', '/')).toContain('automation/features/E2E Auth/e2e-auth-suite.feature')
    expect(featureContent).toContain('Feature: Seeded suite for E2E feature generation')
    expect(featureContent).toContain('@e2e-smoke')
    expect(featureContent).toContain('Scenario: [E2E seeded login works] Seeded login smoke case')
    expect(featureContent).toContain('Given the user navigates to the / url')
  })
})
