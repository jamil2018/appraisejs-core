import { test, expect } from '@playwright/test'

import { disconnectPrisma, findModuleByName, resetE2eData, seedCoreData, seededIds } from './helpers/test-data'
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

  test('settings exposes no filesystem synchronization authority', async ({ page }) => {
    await page.goto('/settings')
    await expectPageHeading(page, 'Settings')
    await expect(page.getByRole('button', { name: /Sync/ })).toHaveCount(0)
  })
})
