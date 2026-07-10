import { expect, type Locator, type Page } from '@playwright/test'

import { saveForm, expectPageHeading } from './ui'

function labeledMultiSelectCombobox(page: Page, label: string): Locator {
  return page.getByText(label, { exact: true }).locator('..').getByRole('combobox', { name: 'Select options' })
}

export async function selectFilterTags(page: Page, ...tagNames: string[]): Promise<void> {
  const combobox = labeledMultiSelectCombobox(page, 'Filter Tags')

  for (const tagName of tagNames) {
    await combobox.click()
    await page.getByRole('option', { name: tagName }).click()
  }
}

export async function selectTestSuites(page: Page, ...suiteNames: string[]): Promise<void> {
  const combobox = labeledMultiSelectCombobox(page, 'Test Suites')

  for (const suiteName of suiteNames) {
    await combobox.click()
    await page.getByRole('option', { name: suiteName }).click()
  }
}

export async function addTemplateStepToFlow(page: Page, stepName = 'Open seeded page'): Promise<void> {
  const emptyStateAdd = page.getByRole('button', { name: 'Add node', exact: true })
  const toolbarAdd = page.getByRole('button', { name: 'Add Node' })

  if (await emptyStateAdd.isVisible()) {
    await emptyStateAdd.click()
  } else {
    await toolbarAdd.click()
  }

  await expect(page.getByRole('dialog', { name: 'Add Node' })).toBeVisible()
  const addNodeDialog = page.getByRole('dialog', { name: 'Add Node' })
  await addNodeDialog.getByRole('textbox', { name: 'Label' }).fill(stepName)
  await addNodeDialog.getByRole('combobox', { name: 'Template Step' }).click()
  await page.getByPlaceholder('Search template steps…').fill(stepName)
  await page.getByRole('option', { name: stepName }).click()
  const urlParameter = addNodeDialog.getByRole('textbox', { name: /^url/i })
  if (await urlParameter.isVisible()) {
    await urlParameter.fill('/')
  }
  await addNodeDialog.getByRole('button', { name: /^Save$/ }).click()
  await expect(addNodeDialog).toBeHidden()
  await expect(page.getByText(stepName, { exact: true }).first()).toBeVisible()
}

export async function editRecordName(page: Page, name: string, nextName: string): Promise<void> {
  await page.getByLabel('Name').fill(nextName)
  await saveForm(page)
  await expect(page.getByText(nextName, { exact: true }).first()).toBeVisible()
  await expect(page.getByText(name, { exact: true }).first()).toBeHidden()
}

export async function createLocatorGroup(
  page: Page,
  name: string,
  moduleName: string,
  route = '/login',
): Promise<void> {
  await page.goto('/locator-groups/create')
  await expectPageHeading(page, 'Create Locator Group')
  await page.getByLabel('Name').fill(name)
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: moduleName }).click()
  await page.getByLabel('Route').fill(route)
  await saveForm(page)
  await expect(page).toHaveURL(/\/locator-groups$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function createLocator(page: Page, name: string, selector: string, groupName: string): Promise<void> {
  await page.goto('/locators/create')
  await expectPageHeading(page, 'Create Locator')
  await page.getByLabel('Locator Name').fill(name)
  await page.getByLabel('Selector').fill(selector)
  await page.getByRole('radio', { name: /Use existing group/i }).click()
  await page.getByRole('combobox', { name: 'Locator Group' }).click()
  await page.getByRole('option', { name: groupName }).click()
  await page.getByRole('button', { name: 'Save Locator' }).click()
  await expect(page).toHaveURL(/\/locators$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function createTemplateStepGroup(page: Page, name: string): Promise<void> {
  await page.goto('/template-step-groups/create')
  await expectPageHeading(page, 'Create Template Step Group')
  await page.getByLabel('Name').fill(name)
  await saveForm(page)
  await expect(page).toHaveURL(/\/template-step-groups$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function createTemplateStep(page: Page, name: string, groupName: string): Promise<void> {
  await page.goto('/template-steps/create')
  await expectPageHeading(page, 'Create Template Step')
  await page.getByLabel('Name').fill(name)
  await page.getByText('Template Step Group').locator('..').getByRole('combobox').click()
  await page.getByRole('option', { name: groupName }).click()
  await page.getByLabel('Signature').fill(`Given I ${name.toLowerCase()}`)
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page).toHaveURL(/\/template-steps$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function createTemplateTestCase(page: Page, name: string): Promise<void> {
  await page.goto('/template-test-cases/create')
  await expectPageHeading(page, 'Create Template Test Case')
  await page.getByLabel('Title').fill(name)
  await addTemplateStepToFlow(page)
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page).toHaveURL(/\/template-test-cases$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function createTestSuite(
  page: Page,
  name: string,
  moduleName: string,
  testCaseTitle?: string,
): Promise<void> {
  await page.goto('/test-suites/create')
  await expectPageHeading(page, 'Create Test Suite')
  await page.getByPlaceholder('Enter name for your test suite').fill(name)
  await page.getByLabel('Module').click()
  await page.getByRole('option', { name: moduleName }).click()
  if (testCaseTitle) {
    await page.getByRole('button', { name: 'Select test case(s)' }).click()
    await page.getByPlaceholder('Search by title, description, or tag...').fill(testCaseTitle)
    await page
      .getByRole('row', { name: new RegExp(testCaseTitle) })
      .getByRole('checkbox')
      .click()
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByText('Selected test case(s)')).toBeVisible()
  }
  await page.getByRole('button', { name: /^Save$/ }).click()
  await expect(page).toHaveURL(/\/test-suites$/)
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}

export async function fillTestCaseDetails(
  page: Page,
  title: string,
  tagName = 'E2E Smoke',
  suiteName = 'E2E Auth Suite',
): Promise<void> {
  await page.getByRole('textbox', { name: 'Title' }).fill(title)
  await selectTestSuites(page, suiteName)
  await selectFilterTags(page, tagName)
  await page.getByRole('button', { name: /Continue/ }).click()
}

export async function saveTestCase(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save test case' }).click()
  await expect(page).toHaveURL(/\/test-cases$/)
}

export async function createTestCaseWithSeededStep(page: Page, title: string): Promise<void> {
  await page.goto('/test-cases/create')
  await expectPageHeading(page, 'Create New Test Case')
  await fillTestCaseDetails(page, title)
  await expect(page.getByText('Test Case Flow', { exact: true }).first()).toBeVisible()
  await addTemplateStepToFlow(page)
  await saveTestCase(page)
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible()
}

export async function editEnvironment(page: Page, id: string, nextName: string): Promise<void> {
  await page.goto(`/environments/modify/${id}`)
  await expectPageHeading(page, 'Modify Environment')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(nextName)
  await saveForm(page)
  await expect(page).toHaveURL(/\/environments$/)
}

export async function editTag(page: Page, id: string, nextName: string, expression: string): Promise<void> {
  await page.goto(`/tags/modify/${id}`)
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(nextName)
  await page.getByRole('textbox', { name: 'Tag Expression', exact: true }).fill(expression)
  await saveForm(page)
  await expect(page).toHaveURL(/\/tags$/)
}
