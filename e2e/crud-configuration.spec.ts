import { test, expect } from '@playwright/test'

import {
  disconnectPrisma,
  findEnvironmentByName,
  findModuleByName,
  findTagByName,
  resetE2eData,
  seedCoreData,
  seededIds,
} from './helpers/test-data'
import { createLocator, createLocatorGroup, createTemplateTestCase, editEnvironment, editTag } from './helpers/forms'
import { createEnvironment, createModule, createTag, saveForm } from './helpers/ui'
import { confirmDeleteDialog, deleteRowByName, expectRowHidden, openRowMenu } from './helpers/table'

test.describe('Configuration CRUD @crud', () => {
  test.beforeEach(async () => {
    await resetE2eData()
    await seedCoreData()
  })

  test.afterAll(async () => {
    await disconnectPrisma()
  })

  test('environment tag and locator entities support create edit and delete', async ({ page }) => {
    const environmentName = 'E2E Config Environment'
    const editedEnvironmentName = 'E2E Config Environment Edited'
    const tagName = 'E2E Config Tag'
    const editedTagName = 'E2E Config Tag Edited'
    const locatorGroupName = 'E2E Config Locator Group'
    const locatorName = 'E2E Config Locator'

    await createEnvironment(page, environmentName)
    const createdEnvironment = await findEnvironmentByName(environmentName)
    expect(createdEnvironment).not.toBeNull()
    await editEnvironment(page, createdEnvironment!.id, editedEnvironmentName)
    await expect(page.getByText(editedEnvironmentName, { exact: true }).first()).toBeVisible()

    await createTag(page, tagName, '@e2e-config')
    const createdTag = await findTagByName(tagName)
    expect(createdTag).not.toBeNull()
    await editTag(page, createdTag!.id, editedTagName, '@e2e-config-edited')
    await expect(page.getByText(editedTagName, { exact: true }).first()).toBeVisible()

    await createLocatorGroup(page, locatorGroupName, 'E2E Auth', '/config-login')
    await createLocator(page, locatorName, 'text=Config button', locatorGroupName)

    await page.goto(`/locators/modify/${seededIds.locator}`)
    await expect(page.getByRole('button', { name: 'Update Locator' })).toBeVisible()
    await page.getByLabel('Locator Name').fill('E2E Sign In Button Edited')
    await page.getByRole('button', { name: 'Update Locator' }).click()
    await expect(page).toHaveURL(/\/locators$/)
    await expect(page.getByText('E2E Sign In Button Edited', { exact: true }).first()).toBeVisible()

    await deleteRowByName(page, locatorName)
    await page.reload()
    await expectRowHidden(page, locatorName)

    await page.goto('/locator-groups')
    await deleteRowByName(page, locatorGroupName)
    await page.reload()
    await expectRowHidden(page, locatorGroupName)

    await page.goto('/tags')
    await deleteRowByName(page, editedTagName)
    await page.reload()
    await expectRowHidden(page, editedTagName)

    await page.goto('/environments')
    await page.getByRole('searchbox', { name: 'Search environments' }).fill(editedEnvironmentName)
    await openRowMenu(page)
    await confirmDeleteDialog(page)
    await page.reload()
    await page.getByRole('searchbox', { name: 'Search environments' }).fill(editedEnvironmentName)
    await expect(page.getByText(editedEnvironmentName, { exact: true })).toHaveCount(0)
  })

  test('template test cases support create and delete', async ({ page }) => {
    const templateCaseName = 'E2E Config Template Case'

    await createTemplateTestCase(page, templateCaseName)

    await page.goto('/template-test-cases')
    await deleteRowByName(page, templateCaseName)
    await page.reload()
    await expectRowHidden(page, templateCaseName)
  })

  test('module create edit delete remains available for configuration flows', async ({ page }) => {
    const moduleName = 'E2E Config Module'
    const editedModuleName = 'E2E Config Module Edited'

    await createModule(page, moduleName)
    const createdModule = await findModuleByName(moduleName)
    expect(createdModule).not.toBeNull()

    await page.goto(`/modules/modify/${createdModule?.id}`)
    await page.getByLabel('Name').fill(editedModuleName)
    await saveForm(page)
    await expect(page.getByText(editedModuleName, { exact: true }).first()).toBeVisible()

    await deleteRowByName(page, editedModuleName)
    await page.reload()
    await expectRowHidden(page, editedModuleName)
  })
})
