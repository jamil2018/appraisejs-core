import { expect, type Locator, type Page } from '@playwright/test'

import { completeNamedCreate, saveForm, expectPageHeading } from './ui'

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

export async function addStepDefinitionToFlow(page: Page): Promise<void> {
  await page.getByLabel('Step Definition results').selectOption({
    label: 'Navigate to URL (browser.navigation.goto@1)',
  })
  await page.getByRole('button', { name: 'Insert first step' }).click()
  await page.getByRole('textbox', { name: 'url' }).fill('/')
  await page.getByRole('button', { name: 'Save step' }).click()
  await expect(page.getByRole('button', { name: 'Remove Navigate to URL' })).toBeVisible()
  await page.waitForTimeout(250)
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
  await page.getByRole('main').getByRole('combobox').first().click()
  await page.getByRole('option', { name: moduleName }).click()
  await page.getByLabel('Route').fill(route)
  await completeNamedCreate(page, name, /\/locator-groups$/)
}

export async function createLocator(page: Page, name: string, selector: string, groupName: string): Promise<void> {
  await page.goto('/locators/create')
  await expectPageHeading(page, 'Create Locator')
  await page.getByLabel('Locator Name').fill(name)
  await page.getByLabel('Selector').fill(selector)
  await page.getByRole('radio', { name: /Use existing group/i }).click()
  await page.getByRole('combobox', { name: 'Locator Group' }).click()
  await page.getByRole('option', { name: groupName }).click()
  await completeNamedCreate(page, name, /\/locators$/, 'Save Locator')
}

export async function createTemplateTestCase(page: Page, name: string): Promise<void> {
  await page.goto('/template-test-cases/create')
  await expectPageHeading(page, 'Create Template Test Case')
  await page.getByLabel('Title').fill(name)
  await addStepDefinitionToFlow(page)
  await completeNamedCreate(page, name, /\/template-test-cases$/)
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
  await completeNamedCreate(page, name, /\/test-suites$/)
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
  await addStepDefinitionToFlow(page)
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
