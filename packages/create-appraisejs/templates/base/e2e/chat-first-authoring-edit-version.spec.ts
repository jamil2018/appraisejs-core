import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { disconnectPrisma, resetGuardedAuthoringE2eData, seedCoreData, seededIds } from './helpers/test-data'

test.describe('Guarded manual authoring edits', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })
  test.afterAll(disconnectPrisma)

  test('a stale case editor keeps its draft and does not replace saved steps', async ({ page }) => {
    const caseId = seededIds.testCase
    const projectId = seededIds.targetProject
    await page.goto(`/test-cases/modify/${caseId}?project=${projectId}`)
    const title = page.getByRole('textbox', { name: 'Title' })
    await expect(title).toHaveValue('E2E seeded login works')
    const before = await prisma.testCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { steps: { include: { parameters: true } }, flowBlocks: { include: { nodes: true } } },
    })
    const concurrentTitle = 'Checkout changed elsewhere'
    await prisma.testCase.update({
      where: { id: caseId },
      data: { title: concurrentTitle, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) },
    })

    await title.fill('My unsaved checkout edit')
    await page.getByRole('button', { name: /Continue/ }).click()
    await page.getByRole('button', { name: 'Save test case' }).click()
    await expect(
      page.getByLabel('Error').getByText('This record changed. Reload it before saving your draft.'),
    ).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/test-cases/modify/${caseId}\\?project=${projectId}$`))
    await page.getByRole('button', { name: /Back/ }).click()
    await expect(title).toHaveValue('My unsaved checkout edit')

    const after = await prisma.testCase.findUniqueOrThrow({
      where: { id: caseId },
      include: { steps: { include: { parameters: true } }, flowBlocks: { include: { nodes: true } } },
    })
    expect(after).toMatchObject({ id: caseId, targetProjectId: projectId, title: concurrentTitle })
    expect(after.steps).toEqual(before.steps)
    expect(after.flowBlocks).toEqual(before.flowBlocks)
  })

  test('a case-template edit saves the exact selected version and returns to the same project', async ({ page }) => {
    const templateId = seededIds.templateTestCase
    const projectId = seededIds.targetProject
    await page.goto(`/template-test-cases/modify/${templateId}?project=${projectId}`)
    await page.getByRole('textbox', { name: 'Title' }).fill('Checkout template revised')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/template-test-cases\\?project=${projectId}$`))
    expect(await prisma.templateTestCase.findUniqueOrThrow({ where: { id: templateId } })).toMatchObject({
      id: templateId,
      targetProjectId: projectId,
      name: 'Checkout template revised',
    })
  })
})
