import { test, expect } from '@playwright/test'

import { disconnectPrisma, resetE2eData, seedCoreData, seededIds } from './helpers/test-data'
import { createTestCaseWithSeededStep } from './helpers/forms'
import { expectPageHeading } from './helpers/ui'

test.describe('Test authoring @authoring', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('inline tag and test suite dialogs add selectable records', async ({ page }) => {
    await page.goto('/test-cases/create')
    await expectPageHeading(page, 'Create New Test Case')
    await page.getByRole('textbox', { name: 'Title' }).fill('E2E Inline Dialog Case')

    await page.getByRole('button', { name: 'Create filter tag' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E Inline Tag')
    await page.getByRole('textbox', { name: 'Tag Expression', exact: true }).fill('@e2e-inline')
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByRole('button', { name: 'E2E Inline Tag' })).toBeVisible()

    await page.getByRole('button', { name: 'Create test suite' }).click()
    await page.getByLabel('Name').fill('E2E Inline Suite')
    await page.getByLabel('Module').click()
    await page.getByRole('option', { name: 'E2E Auth' }).click()
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByRole('button', { name: 'E2E Inline Suite' })).toBeVisible()
  })

  test('flow panel mounts on modify page and scenario preview shows seeded steps', async ({ page }) => {
    await page.goto(`/test-cases/modify/${seededIds.testCase}`)
    await expectPageHeading(page, 'Modify Test Case')
    await page.getByRole('button', { name: /Continue/ }).click()
    await expect(page.getByText('Test Case Flow', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search nodes' })).toBeVisible()

    await page.getByRole('button', { name: 'Show test scenario preview' }).click()
    await expect(page.getByText('Test Scenario(Preview)')).toBeVisible()
    await expect(page.getByText('Given I open the seeded page')).toBeVisible()
  })

  test('full create flow adds a template-backed step before saving', async ({ page }) => {
    await createTestCaseWithSeededStep(page, 'E2E Authored Case')
    await page.goto('/test-cases')
    await expect(page.getByText('E2E Authored Case', { exact: true }).first()).toBeVisible()
  })
})
