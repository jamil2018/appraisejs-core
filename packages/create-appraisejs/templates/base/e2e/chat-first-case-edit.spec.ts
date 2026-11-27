import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { disconnectPrisma, resetGuardedAuthoringE2eData, seedCoreData, seededIds } from './helpers/test-data'

test.describe('Chat-first case edit pilot', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })
  test.afterAll(disconnectPrisma)

  test('typed authoring requests open the scoped editor for the exact record or a new case', async ({ page }) => {
    const projectId = seededIds.targetProject
    const initialCount = await prisma.testCase.count({ where: { targetProjectId: projectId } })
    await page.goto(`/conversations/new?project=${projectId}`)
    const composer = page.getByRole('textbox', { name: 'Message' })
    await composer.fill('Edit the test case named seeded login')
    await composer.press('Enter')
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const record = page.getByRole('link', { name: /Test case E2E seeded login works/i })
    await expect(record).toHaveAttribute('href', `/test-cases/modify/${seededIds.testCase}?project=${projectId}`)
    await composer.fill('Create a test case for checkout')
    await composer.press('Enter')
    const create = page.getByRole('link', { name: /Test case New test case/i })
    await expect(create).toHaveAttribute('href', `/test-cases/create?project=${projectId}`)
    await expect(page.getByRole('link', { name: 'Attach New test case' })).toHaveCount(0)
    await create.click()
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeVisible()
    expect(await prisma.testCase.count({ where: { targetProjectId: projectId } })).toBe(initialCount)
  })

  test('a scoped case list returns from the editor with its search, selection, and scroll state', async ({
    page,
    browser,
    baseURL,
  }) => {
    const caseId = seededIds.testCase
    const projectId = seededIds.targetProject
    const title = 'E2E seeded login works'
    const editPath = `/test-cases/modify/${caseId}?project=${projectId}`
    await page.setViewportSize({ width: 390, height: 720 })
    await page.goto(`/test-cases?project=${projectId}`)

    const search = page.getByRole('textbox', { name: 'Search test cases' })
    const table = page.getByRole('region', { name: 'Test cases' })
    await search.fill('seeded login')
    await page.getByRole('button', { name: 'Columns' }).click()
    await page.getByRole('menuitemcheckbox', { name: 'description' }).click()
    await page.keyboard.press('Escape')
    await expect(table.getByRole('columnheader', { name: 'Description' })).toBeVisible()
    await table.getByRole('checkbox', { name: `Select ${title}` }).check()
    const selectedEdit = page.getByRole('link', { name: 'Edit selected item' })
    await expect(selectedEdit).toHaveAttribute('href', editPath)
    await table.evaluate(element => {
      element.scrollLeft = 120
    })
    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
    const scrollLeft = await table.evaluate(element => element.scrollLeft)

    await selectedEdit.focus()
    await selectedEdit.press('Enter')
    await expect(page).toHaveURL(new RegExp(`test-cases/modify/${caseId}\\?project=${projectId}$`))
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(title)
    await page.goBack()
    await expect(search).toHaveValue('seeded login')
    await expect(table.getByRole('checkbox', { name: `Select ${title}` })).toBeChecked()
    await expect(table.getByRole('columnheader', { name: 'Description' })).toBeVisible()
    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBe(scrollLeft)

    await page.getByRole('button', { name: `Actions for ${title}` }).click()
    const rowEdit = page.getByRole('menuitem', { name: 'Edit', exact: true })
    await expect(rowEdit).toHaveAttribute('href', editPath)
    await rowEdit.click()
    await page.getByRole('textbox', { name: 'Title' }).fill('Checkout account is verified')
    await page.getByRole('button', { name: /Continue/ }).click()
    await page.getByRole('button', { name: 'Save test case' }).click()
    await expect(page).toHaveURL(new RegExp(`/test-cases\\?project=${projectId}$`))
    await expect(search).toHaveValue('seeded login')
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(table.getByText('Checkout account is verified', { exact: true })).toBeVisible()
    const stored = await prisma.testCase.findUniqueOrThrow({ where: { id: caseId } })
    expect(stored).toMatchObject({ id: caseId, targetProjectId: projectId, title: 'Checkout account is verified' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    const touch = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 720 } })
    try {
      await touch.addCookies([{ name: 'appraise-active-project', value: projectId, url: baseURL! }])
      const touchPage = await touch.newPage()
      await touchPage.goto(`/test-cases?project=${projectId}`)
      await touchPage.getByRole('textbox', { name: 'Search test cases' }).fill('Checkout account is verified')
      await touchPage.getByRole('button', { name: 'Actions for Checkout account is verified' }).tap()
      await touchPage.getByRole('menuitem', { name: 'Edit', exact: true }).tap()
      await expect(touchPage).toHaveURL(new RegExp(`test-cases/modify/${caseId}\\?project=${projectId}$`))
      await expect(touchPage.getByRole('textbox', { name: 'Title' })).toHaveValue('Checkout account is verified')
      expect(await touchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await touch.close()
    }
  })
})
