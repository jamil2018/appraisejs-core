import { expect, type Page } from '@playwright/test'

export async function saveForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Save$/ }).click()
}

export async function expectPageHeading(page: Page, name: string | RegExp): Promise<void> {
  await expect(page.getByText(name, { exact: typeof name === 'string' }).first()).toBeVisible()
  const unavailable = page.getByRole('alert').filter({ hasText: 'Form unavailable' })
  if (await unavailable.isVisible()) {
    throw new Error((await unavailable.textContent()) ?? 'The form is unavailable.')
  }
}

export async function completeNamedCreate(
  page: Page,
  name: string,
  destination: RegExp,
  saveButton: string | RegExp = /^Save$/,
): Promise<void> {
  await page.getByRole('button', { name: saveButton }).click()
  await expect.poll(() => new URL(page.url()).pathname).toMatch(destination)
  await expect(page.getByText(name, { exact: true }).filter({ visible: true }).first()).toBeVisible()
}

export async function createModule(page: Page, name: string): Promise<void> {
  await page.goto('/modules/create')
  await expectPageHeading(page, 'Create Module')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await completeNamedCreate(page, name, /\/modules$/)
}

export async function createEnvironment(page: Page, name: string): Promise<void> {
  await page.goto('/environments/create')
  await expectPageHeading(page, 'Create Environment')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('textbox', { name: 'Base URL', exact: true }).fill('https://example.test')
  await page.getByRole('textbox', { name: 'API Base URL (Optional)', exact: true }).fill('https://api.example.test')
  await page.getByRole('textbox', { name: 'Username (Optional)', exact: true }).fill('e2e-user')
  await page.getByLabel('Password environment variable (Optional)', { exact: true }).fill('APPRAISE_E2E_PASSWORD')
  await completeNamedCreate(page, name, /\/environments$/)
}

export async function createTag(page: Page, name: string, expression: string): Promise<void> {
  await page.goto('/tags/create')
  await expectPageHeading(page, 'Create Tag')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name)
  await page.getByRole('textbox', { name: 'Tag Expression', exact: true }).fill(expression)
  await completeNamedCreate(page, name, /\/tags$/)
}
