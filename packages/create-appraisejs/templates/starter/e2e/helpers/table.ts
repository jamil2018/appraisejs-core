import { expect, type Page } from '@playwright/test'

export async function filterTableByName(page: Page, value: string, placeholder = 'Filter by name...'): Promise<void> {
  await page.getByPlaceholder(placeholder).first().fill(value)
}

export async function openRowMenu(page: Page, rowIndex = 0): Promise<void> {
  await page.getByRole('button', { name: 'Open menu' }).nth(rowIndex).click()
}

export async function editRowByName(page: Page, name: string): Promise<void> {
  await filterTableByName(page, name)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: /Edit/ }).getByRole('link').click()
  await expect(page).toHaveURL(/\/modify\//)
}

export async function confirmDeleteDialog(page: Page): Promise<void> {
  await page.getByRole('menuitem', { name: /Delete/ }).click()
  await page.getByRole('button', { name: /^Delete$/ }).click()
  await expect(page.getByText('Item(s) deleted successfully', { exact: true })).toBeVisible()
}

export async function deleteRowByName(
  page: Page,
  name: string,
  filterPlaceholder = 'Filter by name...',
): Promise<void> {
  await filterTableByName(page, name, filterPlaceholder)
  await openRowMenu(page)
  await confirmDeleteDialog(page)
}

export async function expectRowHidden(
  page: Page,
  name: string,
  filterPlaceholder = 'Filter by name...',
): Promise<void> {
  await filterTableByName(page, name, filterPlaceholder)
  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0)
}

export async function expectRowVisible(page: Page, name: string): Promise<void> {
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible()
}
