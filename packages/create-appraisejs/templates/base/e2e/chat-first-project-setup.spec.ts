import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { disconnectPrisma, resetGuardedAuthoringE2eData, seedCoreData, seededIds } from './helpers/test-data'

const otherProjectId = '00000000-0000-4000-8000-000000000002'

test.describe('Chat-first project setup scope', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
    await prisma.targetProject.upsert({
      where: { id: otherProjectId },
      update: {},
      create: {
        id: otherProjectId,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: `workspace:/e2e/appraisejs/${otherProjectId}`,
        canonicalPath: `/e2e/appraisejs/${otherProjectId}`,
        displayName: 'Other project',
        fingerprint: `e2e-other-project-${otherProjectId}`,
      },
    })
  })
  test.afterAll(disconnectPrisma)

  test('a project A environment round trip survives project B selection in another tab', async ({ page, context }) => {
    const originalProjectId = seededIds.targetProject
    await page.goto(`/environments?project=${originalProjectId}`)
    await expect(page.getByRole('heading', { name: 'Environments' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'New environment' })).toHaveAttribute(
      'href',
      `/environments/create?project=${originalProjectId}`,
    )

    const otherTab = await context.newPage()
    await otherTab.goto('/projects')
    await otherTab.getByRole('button', { name: 'Select Other project' }).click()
    await expect
      .poll(async () => {
        const cookie = (await context.cookies()).find(item => item.name === 'appraise-active-project')
        return cookie?.value
      })
      .toBe(otherProjectId)

    await page.getByRole('link', { name: 'New environment' }).click()
    await expect(page).toHaveURL(`/environments/create?project=${originalProjectId}`)
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Staging A')
    await page.getByRole('textbox', { name: 'Base URL', exact: true }).fill('https://staging.example.test')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(`/environments?project=${originalProjectId}`)

    const created = await prisma.environment.findFirstOrThrow({
      where: { name: 'Staging A', targetProjectId: originalProjectId },
    })
    expect(created.baseUrl).toBe('https://staging.example.test')

    await page.getByRole('button', { name: 'Actions for Staging A' }).click()
    const edit = page.getByRole('menuitem', { name: 'Edit environment' })
    await expect(edit).toHaveAttribute('href', `/environments/modify/${created.id}?project=${originalProjectId}`)
    await edit.click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Staging A revised')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page).toHaveURL(`/environments?project=${originalProjectId}`)

    const revised = await prisma.environment.findUniqueOrThrow({ where: { id: created.id } })
    expect(revised).toMatchObject({ id: created.id, targetProjectId: originalProjectId, name: 'Staging A revised' })

    await otherTab.goto(`/environments?project=${otherProjectId}`)
    await expect(otherTab.getByRole('heading', { name: 'Staging A revised' })).toHaveCount(0)
    await otherTab.close()
  })

  test('provider setup stays in protected Settings and returns to the original saved chat', async ({
    page,
    context,
  }) => {
    const originalProjectId = seededIds.targetProject
    await page.goto(`/conversations/new?project=${originalProjectId}`)
    await page.getByRole('textbox', { name: 'Message' }).fill('connect Cursor')
    await page.getByRole('button', { name: 'Send message' }).click()
    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]+\?project=/)
    const chatUrl = new URL(page.url())
    const chatPath = `${chatUrl.pathname}${chatUrl.search}`
    const setupLink = page.getByRole('list', { name: 'Matching project records' }).getByRole('link', {
      name: 'Settings Provider settings',
    })
    await expect(setupLink).toHaveAttribute(
      'href',
      `/settings?project=${originalProjectId}&returnTo=${encodeURIComponent(chatPath)}`,
    )

    const otherTab = await context.newPage()
    await otherTab.goto('/projects')
    await otherTab.getByRole('button', { name: 'Select Other project' }).click()
    await expect
      .poll(async () => {
        const cookie = (await context.cookies()).find(item => item.name === 'appraise-active-project')
        return cookie?.value
      })
      .toBe(otherProjectId)

    await setupLink.click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Agent setup' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage environments' })).toHaveAttribute(
      'href',
      `/environments?project=${originalProjectId}`,
    )
    await expect(page.getByRole('link', { name: 'Return to chat' })).toHaveAttribute('href', chatPath)
    await page.getByRole('link', { name: 'Return to chat' }).click()
    await expect(page).toHaveURL(chatUrl.toString())
    await expect(page.getByRole('list', { name: 'Messages' }).getByText('connect Cursor')).toBeVisible()

    await page.goto(`/settings?project=${originalProjectId}&returnTo=${encodeURIComponent('//example.test/escape')}`)
    await expect(page.getByRole('link', { name: 'Return to chat' })).toHaveCount(0)
    await page.goto(
      `/settings?project=${originalProjectId}&returnTo=${encodeURIComponent(`/conversations/${chatUrl.pathname.split('/').at(-1)}?project=${otherProjectId}`)}`,
    )
    await expect(page.getByRole('link', { name: 'Return to chat' })).toHaveCount(0)
    await otherTab.close()
  })
})
