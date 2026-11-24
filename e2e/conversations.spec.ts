import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import {
  disconnectPrisma,
  resetE2eData,
  resetGuardedAuthoringE2eData,
  seedCoreData,
  seededIds,
} from './helpers/test-data'

async function clearTestChats() {
  const scope = { targetProjectId: seededIds.targetProject }
  await prisma.$transaction([
    prisma.projectConversationMessage.deleteMany({ where: { conversation: scope } }),
    prisma.projectConversation.deleteMany({ where: scope }),
  ])
}

test.describe('Project conversations', () => {
  test.beforeEach(async () => {
    await clearTestChats()
    await resetE2eData()
    await seedCoreData()
  })

  test.afterEach(clearTestChats)
  test.afterAll(disconnectPrisma)

  test('new chat saves a bounded workspace lookup and resumes from the project sidebar', async ({ page }) => {
    await page.goto('/quality-journeys/new')
    await page.getByRole('link', { name: 'New chat', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'What are you working on?' })).toBeVisible()

    const request = 'Find test cases for seeded login'
    await page.getByRole('textbox', { name: 'Message' }).fill(request)
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const result = page.getByRole('list', { name: 'Matching project records' }).getByRole('link', {
      name: 'Test case E2E seeded login works',
    })
    await expect(result).toHaveAttribute('href', new RegExp(`/test-cases/modify/${seededIds.testCase}\\?project=`))

    await page.reload()
    await expect(result).toBeVisible()
    await page.getByRole('link', { name: 'New Journey', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'What would you like to check?' })).toBeVisible()
    const recent = page.getByRole('navigation', { name: 'Recent chats and Journeys by project' })
    await recent.getByRole('link', { name: new RegExp(request) }).click()
    await expect(result).toBeVisible()
  })

  test('a case attaches its exact project record to a saved message', async ({ page }) => {
    await page.goto('/test-cases')
    await page.getByRole('button', { name: 'Actions for E2E seeded login works', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Discuss in chat' }).click()
    await expect(page.locator('form').getByText('E2E seeded login works')).toBeVisible()
    await page.getByRole('textbox', { name: 'Message' }).fill('Check the regression coverage before release.')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page.getByRole('list', { name: 'Messages' }).getByText('E2E seeded login works')).toBeVisible()
    await page.reload()
    const transcript = page.getByRole('list', { name: 'Messages' })
    await expect(transcript.getByText('E2E seeded login works')).toBeVisible()
  })
})

test.describe('Guarded chat editing', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })
  test.afterEach(clearTestChats)
  test.afterAll(disconnectPrisma)

  test('finds and renames an exact case in one chat and opens the updated editor', async ({ page }) => {
    await page.goto('/conversations/new')
    const input = page.getByRole('textbox', { name: 'Message' })
    await input.fill('Find test cases for seeded login')
    await page.getByRole('button', { name: 'Send message' }).click()
    await page.getByRole('link', { name: 'Attach E2E seeded login works' }).click()
    await expect(page.locator('form').getByText('E2E seeded login works')).toBeVisible()

    await input.fill('Rename this case to “Checkout account is ready”')
    await page.getByRole('button', { name: 'Send message' }).click()
    const transcript = page.getByRole('list', { name: 'Messages' })
    const updated = transcript.getByRole('link', { name: 'Test case Checkout account is ready' })
    const chatUrl = page.url()
    await expect(updated).toBeVisible()
    await page.reload()
    await expect(updated).toBeVisible()
    await updated.click()
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Checkout account is ready')
    const stored = await prisma.testCase.findUnique({ where: { id: seededIds.testCase }, select: { title: true } })
    expect(stored?.title).toBe('Checkout account is ready')

    await page.getByRole('textbox', { name: 'Title' }).fill('Checkout account is verified')
    await page.getByRole('button', { name: /Continue/ }).click()
    await page.getByRole('button', { name: 'Save test case' }).click()
    await expect(page).toHaveURL(/\/test-cases$/)

    await page.goto(chatUrl)
    await input.fill('Find test cases for Checkout account is verified')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(transcript.getByRole('link', { name: 'Test case Checkout account is verified' })).toBeVisible()
  })
})
