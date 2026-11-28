import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { setConversationReadProvider } from '../src/services/conversation/conversation-read-service'
import { createTestSuiteFromInput } from '../src/services/test-suite/test-suite-service'
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
    prisma.projectConversationRead.deleteMany({ where: { message: { conversation: scope } } }),
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

  test('keyboard submits a lookup and provider switching preserves its unresolved original', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/conversations/new')
    const composer = page.getByRole('textbox', { name: 'Message' })
    await composer.fill('Find test cases for seeded login')
    await composer.press('Shift+Enter')
    await expect(composer).toHaveValue('Find test cases for seeded login\n')
    await composer.press('Enter')
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)

    const picker = page.getByRole('region', { name: 'Lookup provider' })
    const enable = picker.getByRole('button', { name: 'Use ChatGPT for lookups' })
    await enable.focus()
    await expect(enable).toBeFocused()
    await enable.press('Enter')
    await expect(picker.getByText('Lookup provider · ChatGPT')).toBeVisible()
    const message = await prisma.projectConversationMessage.findFirstOrThrow({
      where: { role: 'USER', conversation: { targetProjectId: seededIds.targetProject } },
    })
    // A synthetic expired reservation exercises recovery without provider consent or traffic.
    await prisma.projectConversationRead.create({
      data: {
        conversationId: message.conversationId,
        messageId: message.id,
        provider: 'CHATGPT',
        state: 'RUNNING',
        blockedConversationId: message.conversationId,
        expiresAt: new Date(0),
      },
    })
    await page.reload()
    await expect(picker.getByRole('status')).toHaveText('ChatGPT lookup outcome unknown')
    await expect(picker.getByRole('button', { name: 'Use local lookups' })).toBeDisabled()
    await picker.getByRole('button', { name: 'Acknowledge unresolved lookup' }).click()
    await picker.getByRole('button', { name: 'Use local lookups' }).click()
    await expect(picker.getByText('Lookup provider · Local')).toBeVisible()
    await expect(
      page.getByRole('list', { name: 'Messages' }).getByText('ChatGPT lookup outcome unknown · Acknowledged'),
    ).toBeVisible()
    await expect(page.getByRole('link', { name: 'Test case E2E seeded login works' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('Guarded chat editing', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })
  test.afterEach(clearTestChats)
  test.afterAll(disconnectPrisma)

  for (const [provider, choice, engine, title] of [
    ['Codex', 'CHATGPT', 'CODEX', 'Codex checkout'],
    ['Claude Code', 'CLAUDE', 'RESPONSES', 'Claude checkout'],
  ] as const) {
    test(`creates a project module from text with a saved ${provider} lookup preference`, async ({ page }) => {
      const projectId = seededIds.targetProject
      await page.goto(`/conversations/new?project=${projectId}`)
      const input = page.getByRole('textbox', { name: 'Message' })
      await input.fill('Prepare the checkout workspace.')
      await input.press('Enter')
      await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
      const chatPath = page.url()
      const conversationId = new URL(chatPath).pathname.split('/').at(-1)!
      // Model a persisted preference reopened on a host without a connected provider.
      await setConversationReadProvider({ conversationId, targetProjectId: projectId }, choice, prisma, engine)
      await page.reload()
      const picker = page.getByRole('region', { name: 'Lookup provider' })
      await expect(picker.getByText(`Lookup provider · ${provider}`)).toBeVisible()
      await input.fill(`Create a module named “${title}”`)
      await input.press('Enter')
      const created = page.getByRole('list', { name: 'Matching project records' }).getByRole('link', {
        name: `Module ${title}`,
      })
      await expect(created).toBeVisible()
      const createdModule = await prisma.module.findFirstOrThrow({ where: { name: title, targetProjectId: projectId } })
      expect(createdModule.parentId).toBeNull()
      expect(
        await prisma.projectConversationRead.count({
          where: { message: { conversation: { targetProjectId: projectId } } },
        }),
      ).toBe(0)
      await page.reload()
      await expect(created).toHaveAttribute('href', `/modules/modify/${createdModule.id}?project=${projectId}`)
      await created.click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(title)
      await page.goto(chatPath)
      await expect(created).toBeVisible()
      expect(await prisma.module.count({ where: { name: title, targetProjectId: projectId } })).toBe(1)
    })

    test(`creates a scoped tag from text with a saved ${provider} lookup preference`, async ({ page }) => {
      const projectId = seededIds.targetProject
      const name = `${title} smoke`
      const expression = choice === 'CLAUDE' ? '@claude-checkout' : '@codex-checkout'
      await page.goto(`/conversations/new?project=${projectId}`)
      const input = page.getByRole('textbox', { name: 'Message' })
      await input.fill('Prepare the checkout workspace.')
      await input.press('Enter')
      await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
      const chatPath = page.url()
      const conversationId = new URL(chatPath).pathname.split('/').at(-1)!
      await setConversationReadProvider({ conversationId, targetProjectId: projectId }, choice, prisma, engine)
      await page.reload()
      await expect(page.getByRole('region', { name: 'Lookup provider' })).toContainText(`Lookup provider · ${provider}`)

      await input.fill(`Create a tag named “${name}” with expression ${expression}`)
      await input.press('Enter')
      const created = page.getByRole('list', { name: 'Matching project records' }).getByRole('link', {
        name: `Tag ${name}`,
      })
      await expect(created).toBeVisible()
      const tag = await prisma.tag.findFirstOrThrow({ where: { name, targetProjectId: projectId } })
      expect(tag.tagExpression).toBe(expression)
      await expect(created).toHaveAttribute('href', `/tags/modify/${tag.id}?project=${projectId}`)
      await page.reload()
      await created.click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name)
      await expect(page.getByRole('textbox', { name: 'Tag Expression', exact: true })).toHaveValue(expression)

      await page.goto(chatPath)
      await expect(created).toBeVisible()
      expect(await prisma.tag.count({ where: { name, targetProjectId: projectId } })).toBe(1)
      expect(await prisma.projectConversationRead.count({ where: { conversationId } })).toBe(0)
    })

    test(`creates a scoped environment from text with a saved ${provider} lookup preference`, async ({ page }) => {
      const projectId = seededIds.targetProject
      const name = `${title} environment`
      const baseUrl = choice === 'CLAUDE' ? 'https://claude.example.test' : 'https://codex.example.test'
      await page.goto(`/conversations/new?project=${projectId}`)
      const input = page.getByRole('textbox', { name: 'Message' })
      await input.fill('Prepare the checkout workspace.')
      await input.press('Enter')
      await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
      const chatPath = page.url()
      const conversationId = new URL(chatPath).pathname.split('/').at(-1)!
      await setConversationReadProvider({ conversationId, targetProjectId: projectId }, choice, prisma, engine)
      await page.reload()
      await expect(page.getByRole('region', { name: 'Lookup provider' })).toContainText(`Lookup provider · ${provider}`)

      await input.fill(`Create an environment named “${name}” with base URL ${baseUrl}`)
      await input.press('Enter')
      const created = page.getByRole('list', { name: 'Matching project records' }).getByRole('link', {
        name: `Environment ${name}`,
      })
      await expect(created).toBeVisible()
      const environment = await prisma.environment.findFirstOrThrow({ where: { name, targetProjectId: projectId } })
      expect(environment.baseUrl).toBe(baseUrl)
      await expect(created).toHaveAttribute('href', `/environments/modify/${environment.id}?project=${projectId}`)
      await page.reload()
      await created.click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name)
      await expect(page.getByRole('textbox', { name: 'Base URL', exact: true })).toHaveValue(baseUrl)

      await page.goto(chatPath)
      await expect(created).toBeVisible()
      expect(await prisma.environment.count({ where: { name, targetProjectId: projectId } })).toBe(1)
      expect(await prisma.projectConversationRead.count({ where: { conversationId } })).toBe(0)
    })

    test(`creates a scoped suite from text with a saved ${provider} lookup preference`, async ({ page }) => {
      const projectId = seededIds.targetProject
      const moduleRecord = await prisma.module.create({
        data: { name: `${title} suite module`, targetProjectId: projectId },
      })
      const name = `${title} smoke suite`
      await page.goto(`/conversations/new?project=${projectId}`)
      const input = page.getByRole('textbox', { name: 'Message' })
      await input.fill('Prepare the checkout workspace.')
      await input.press('Enter')
      await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
      const chatPath = page.url()
      const conversationId = new URL(chatPath).pathname.split('/').at(-1)!
      await setConversationReadProvider({ conversationId, targetProjectId: projectId }, choice, prisma, engine)
      await page.reload()
      await expect(page.getByRole('region', { name: 'Lookup provider' })).toContainText(`Lookup provider · ${provider}`)

      await input.fill(`Create a test suite named “${name}” in module “${moduleRecord.name}”`)
      await input.press('Enter')
      const created = page.getByRole('list', { name: 'Matching project records' }).getByRole('link', {
        name: `Test suite ${name}`,
      })
      await expect(created).toBeVisible()
      const suite = await prisma.testSuite.findFirstOrThrow({
        where: { name, targetProjectId: projectId },
        include: { tags: true },
      })
      expect(suite.moduleId).toBe(moduleRecord.id)
      expect(suite.tags).toHaveLength(1)
      await expect(created).toHaveAttribute('href', `/test-suites/modify/${suite.id}?project=${projectId}`)
      await page.reload()
      await created.click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name)
      await expect(page.getByRole('combobox', { name: 'Module', exact: true })).toContainText(moduleRecord.name)

      await page.goto(chatPath)
      await expect(created).toBeVisible()
      expect(await prisma.testSuite.count({ where: { name, targetProjectId: projectId } })).toBe(1)
      expect(await prisma.projectConversationRead.count({ where: { conversationId } })).toBe(0)
    })

    test(`updates exact suite membership and names with a saved ${provider} lookup preference`, async ({ page }) => {
      const projectId = seededIds.targetProject
      const moduleRecord = await prisma.module.create({
        data: { name: `${title} membership`, targetProjectId: projectId },
      })
      const suite = await createTestSuiteFromInput({ name: `${title} original`, moduleId: moduleRecord.id }, projectId)
      const expression = choice === 'CLAUDE' ? '@claude_guest_tag' : '@codex_guest_tag'
      const tag = await prisma.tag.create({
        data: {
          name: `${title} filter`,
          tagExpression: expression,
          targetProjectId: projectId,
          testCases: { connect: { id: seededIds.testCase } },
          testSuites: { connect: { id: suite.id } },
        },
      })
      await page.goto(`/conversations/new?project=${projectId}`)
      const input = page.getByRole('textbox', { name: 'Message' })
      await input.fill('Find test cases for seeded login')
      await input.press('Enter')
      await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
      const chatPath = page.url()
      const conversationId = new URL(chatPath).pathname.split('/').at(-1)!
      await setConversationReadProvider({ conversationId, targetProjectId: projectId }, choice, prisma, engine)
      await page.reload()
      await page.getByRole('link', { name: 'Attach E2E seeded login works' }).click()
      await expect(page.locator('form')).toContainText('E2E seeded login works')
      await input.fill(`Add this case to suite “${suite.name}” in module “${moduleRecord.name}”`)
      await input.press('Enter')
      await expect(
        page.getByText(`Added the attached case to the test suite “${suite.name}”.`, { exact: true }),
      ).toBeVisible()

      const renamedSuite = `${title} guest smoke`
      await input.fill(`Rename test suite “${suite.name}” in module “${moduleRecord.name}” to “${renamedSuite}”`)
      await input.press('Enter')
      const suiteLink = page.getByRole('link', { name: `Test suite ${renamedSuite}` })
      await expect(suiteLink).toHaveAttribute('href', `/test-suites/modify/${suite.id}?project=${projectId}`)
      const renamedTag = `${title} guest filter`
      await input.fill(`Rename filter tag “${tag.name}” with expression ${expression} to “${renamedTag}”`)
      await input.press('Enter')
      const tagLink = page.getByRole('link', { name: `Tag ${renamedTag}` })
      await expect(tagLink).toHaveAttribute('href', `/tags/modify/${tag.id}?project=${projectId}`)

      await page.reload()
      await suiteLink.click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(renamedSuite)
      await page.goto(chatPath)
      await tagLink.click()
      await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(renamedTag)
      await expect(page.getByRole('textbox', { name: 'Tag Expression', exact: true })).toHaveValue(expression)
      expect(
        await prisma.testSuite.findUnique({ where: { id: suite.id }, select: { testCases: { select: { id: true } } } }),
      ).toEqual({ testCases: [{ id: seededIds.testCase }] })
      expect(
        await prisma.tag.findUnique({ where: { id: tag.id }, include: { testSuites: true, testCases: true } }),
      ).toMatchObject({ testSuites: [{ id: suite.id }], testCases: [{ id: seededIds.testCase }] })
      expect(await prisma.projectConversationRead.count({ where: { conversationId } })).toBe(0)
    })
  }

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
    await expect(page).toHaveURL(new RegExp(`/test-cases\\?project=${seededIds.targetProject}$`))

    await page.goto(chatUrl)
    await input.fill('Find test cases for Checkout account is verified')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(transcript.getByRole('link', { name: 'Test case Checkout account is verified' })).toBeVisible()
  })
})
