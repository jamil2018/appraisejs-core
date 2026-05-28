import { test, expect } from '@playwright/test'

import { disconnectPrisma, findModuleByName, resetE2eData, seedCoreData, seededIds } from './helpers/test-data'
import { createTestCaseWithSeededStep, createTestSuite } from './helpers/forms'
import { expectPageHeading, saveForm } from './helpers/ui'
import { deleteRowByName, expectRowHidden, filterTableByName } from './helpers/table'

test.describe('Test hierarchy CRUD @crud', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('test suite create edit and delete assign seeded cases', async ({ page }) => {
    const suiteName = 'E2E UI Suite'
    const editedSuiteName = 'E2E UI Suite Edited'

    await createTestSuite(page, suiteName, 'E2E Auth', 'E2E seeded login works')

    await page.goto('/test-suites')
    await filterTableByName(page, suiteName)
    await page.getByRole('button', { name: 'Open menu' }).first().click()
    await page.getByRole('menuitem', { name: /Edit/ }).click()
    await page.getByPlaceholder('Enter name for your test suite').fill(editedSuiteName)
    await saveForm(page)
    await expect(page.getByText(editedSuiteName, { exact: true }).first()).toBeVisible()

    await deleteRowByName(page, editedSuiteName)
    await page.reload()
    await expectRowHidden(page, editedSuiteName)
  })

  test('test case create modify preview and delete', async ({ page }) => {
    const caseTitle = 'E2E UI Auth Case'

    await createTestCaseWithSeededStep(page, caseTitle)

    await page.goto(`/test-cases/modify/${seededIds.testCase}`)
    await expectPageHeading(page, 'Modify Test Case')
    await page.getByRole('textbox', { name: 'Title' }).fill('E2E seeded login works updated')
    await page.getByRole('button', { name: /Continue/ }).click()
    await page.getByRole('button', { name: 'Show test scenario preview' }).click()
    await expect(page.getByText('Test Scenario(Preview)')).toBeVisible()

    await page.goto('/test-cases')
    await deleteRowByName(page, caseTitle)
    await page.reload()
    await expectRowHidden(page, caseTitle)
  })

  test('create test case from template lands on modify with prefilled flow', async ({ page }) => {
    await page.goto('/test-cases/create-from-template')
    await expectPageHeading(page, 'Create Test Case From Template')
    await page.getByLabel('Template Test Case').click()
    await page.getByRole('option', { name: 'E2E Login Template' }).click()
    await page.getByRole('button', { name: /Continue/ }).click()
    await page.getByRole('textbox', { name: 'Title' }).fill('E2E From Template Case')
    await page.getByRole('combobox', { name: 'Filter Tags' }).click()
    await page.getByRole('option', { name: 'E2E Smoke' }).click()
    await page.getByRole('button', { name: /Continue/ }).click()
    await expect(page.getByText('Test Case Flow', { exact: true }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Save test case' }).click()
    await expect(page).toHaveURL(/\/test-cases$/)
    await expect(page.getByText('E2E From Template Case', { exact: true }).first()).toBeVisible()
  })

  test('secondary module suite seed is visible for assignment coverage', async ({ page }) => {
    await page.goto('/test-suites')
    await expect(page.getByText('E2E Secondary Suite', { exact: true }).first()).toBeVisible()

    const secondModule = await findModuleByName('E2E Secondary')
    expect(secondModule).not.toBeNull()
  })
})
