import { expect, type Page } from '@playwright/test'

export async function filterTableByName(page: Page, value: string, placeholder = 'Filter by name...'): Promise<void> {
  await page.getByPlaceholder(placeholder).first().fill(value)
}

export async function openRowMenu(page: Page, rowIndex = 0): Promise<void> {
  await page.getByRole('button', { name: 'Open menu' }).nth(rowIndex).click()
}

export async function confirmDeleteDialog(page: Page): Promise<void> {
  await page.getByRole('menuitem', { name: /Delete/ }).click()
  await page.getByRole('button', { name: /^Delete$/ }).click()
}

export async function deleteRowByName(page: Page, name: string): Promise<void> {
  await filterTableByName(page, name)
  await openRowMenu(page)
  await confirmDeleteDialog(page)
}

export async function expectRowHidden(page: Page, name: string): Promise<void> {
  await filterTableByName(page, name)
  await expect(page.getByText(name, { exact: true }).first()).toBeHidden()
}

export async function expectRowVisible(page: Page, name: string): Promise<void> {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}
