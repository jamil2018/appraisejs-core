import { createHash, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'

import prisma from '../src/config/db-config'
import { createTargetProjectFixture } from '../src/test/migrated-test-database'
import { createModule } from '../src/services/module/module-service'
import { disconnectPrisma, resetGuardedAuthoringE2eData, seedCoreData, seededIds } from './helpers/test-data'

async function completeDisposableModuleCoverage(projectId: string, ids: readonly string[]) {
  const expected = [...ids].sort()
  const actual = (await prisma.module.findMany({ where: { targetProjectId: projectId }, select: { id: true } }))
    .map(row => row.id)
    .sort()
  expect(actual).toEqual(expected)
  const guards = await prisma.qualityJourneySharedResourceGuard.findMany({
    where: { targetProjectId: projectId, kind: 'MODULE' },
    select: { resourceId: true, resourceState: true, coverageState: true },
  })
  expect(guards.map(row => row.resourceId).sort()).toEqual(expected)
  expect(guards.every(row => row.resourceState === 'LIVE' && row.coverageState === 'COMPLETE_V1')).toBe(true)
  expect(await prisma.qualityJourney.count({ where: { targetProjectId: projectId } })).toBe(0)
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  await prisma.qualityJourneySharedResourceCoverage.update({
    where: { targetProjectId_kind_protocolVersion: { targetProjectId: projectId, kind: 'MODULE', protocolVersion: 1 } },
    data: {
      state: 'COMPLETE',
      epoch: { increment: 1 },
      proofKind: 'JOURNEY_FREE_V1',
      completedAt: new Date(),
      writerClosureDigest: digest('SYNTHETIC_E2E_ONLY:writer:MODULE'),
      readerClosureDigest: digest('SYNTHETIC_E2E_ONLY:reader:MODULE'),
      sourceUniverseDigest: digest(
        JSON.stringify({ syntheticOnly: true, targetProjectId: projectId, kind: 'MODULE', resourceIds: expected }),
      ),
      reconciliationDigest: digest(`SYNTHETIC_E2E_ONLY:no-Journey:${projectId}:MODULE`),
    },
  })
}

test.describe('Scoped authoring collections', () => {
  test.beforeEach(async ({ page }) => {
    await resetGuardedAuthoringE2eData(page)
    await seedCoreData(true)
  })
  test.afterAll(disconnectPrisma)

  test('New and Edit stay on the URL project with the opposite active cookie, and bulk delete uses the selected IDs', async ({
    page,
    context,
    baseURL,
  }) => {
    const firstProjectId = seededIds.targetProject
    const secondProjectId = randomUUID()
    await createTargetProjectFixture(prisma, {
      id: secondProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `e2e-authoring:${secondProjectId}`,
      canonicalPath: `/tmp/${secondProjectId}`,
      displayName: 'Disposable authoring project',
      fingerprint: secondProjectId,
    })

    const collections = [
      { path: 'modules', name: 'E2E Auth', id: seededIds.module, create: 'New module' },
      { path: 'tags', name: 'E2E Smoke', id: seededIds.tag, create: 'New tag' },
      { path: 'test-suites', name: 'E2E Auth Suite', id: seededIds.testSuite, create: 'New test suite' },
      { path: 'test-cases', name: 'E2E seeded login works', id: seededIds.testCase, create: 'New test case' },
      {
        path: 'template-test-cases',
        name: 'E2E Login Template',
        id: seededIds.templateTestCase,
        create: 'New case template',
      },
    ] as const

    await context.addCookies([{ name: 'appraise-active-project', value: secondProjectId, url: baseURL! }])
    for (const collection of collections) {
      await page.goto(`/${collection.path}?project=${firstProjectId}`)
      const row = page.getByRole('row').filter({ hasText: collection.name })
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: `Actions for ${collection.name}` }).click()
      await expect(page.getByRole('menuitem', { name: 'Edit', exact: true })).toHaveAttribute(
        'href',
        `/${collection.path}/modify/${collection.id}?project=${firstProjectId}`,
      )
      await page.keyboard.press('Escape')
      await row.getByRole('checkbox', { name: `Select ${collection.name}` }).check()
      await expect(page.getByRole('link', { name: 'Edit selected item' })).toHaveAttribute(
        'href',
        `/${collection.path}/modify/${collection.id}?project=${firstProjectId}`,
      )
    }

    await context.addCookies([{ name: 'appraise-active-project', value: firstProjectId, url: baseURL! }])
    for (const collection of collections) {
      await page.goto(`/${collection.path}?project=${secondProjectId}`)
      await expect(page.getByRole('heading', { name: new RegExp(`No .+ yet`) })).toBeVisible()
      if (collection.path === 'test-cases') {
        await page.getByRole('button', { name: collection.create }).click()
        await expect(page.getByRole('menuitem', { name: 'From scratch' })).toHaveAttribute(
          'href',
          `/test-cases/create?project=${secondProjectId}`,
        )
        await page.keyboard.press('Escape')
      } else {
        await expect(page.getByRole('link', { name: collection.create })).toHaveAttribute(
          'href',
          `/${collection.path}/create?project=${secondProjectId}`,
        )
      }
    }

    await page.goto(`/modules?project=${secondProjectId}`)
    await page.getByRole('link', { name: 'New module' }).click()
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('CF08 delete one')
    await page.getByRole('button', { name: /^Save$/ }).click()
    await expect(page).toHaveURL(new RegExp(`/modules\\?project=${secondProjectId}$`))
    const first = await prisma.module.findFirstOrThrow({
      where: { targetProjectId: secondProjectId, name: 'CF08 delete one' },
    })
    const second = await createModule({ name: 'CF08 delete two' }, secondProjectId)
    const survivor = await createModule({ name: 'CF08 keep' }, secondProjectId)
    await completeDisposableModuleCoverage(secondProjectId, [first.id, second.id, survivor.id])
    await page.reload()
    await page.getByRole('textbox', { name: 'Search modules' }).fill('CF08 delete')
    const table = page.getByRole('region', { name: 'Modules' })
    await table.getByRole('checkbox', { name: 'Select CF08 delete one' }).check()
    await table.getByRole('checkbox', { name: 'Select CF08 delete two' }).check()
    const deleteDialog = page.getByRole('dialog', { name: 'Delete Item' })
    await page.getByRole('button', { name: 'Delete selected item(s)' }).click()
    await expect(deleteDialog).toContainText('Are you sure you want to delete the selected item(s)?')
    await deleteDialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await prisma.module.count({ where: { id: { in: [first.id, second.id, survivor.id] } } })).toBe(3)
    await page.getByRole('button', { name: 'Delete selected item(s)' }).click()
    await deleteDialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Deleting...' })).toBeHidden()
    await expect(deleteDialog).toBeHidden()
    expect(await prisma.module.count({ where: { id: { in: [first.id, second.id] } } })).toBe(0)
    expect(await prisma.module.findUnique({ where: { id: survivor.id } })).toMatchObject({
      targetProjectId: secondProjectId,
      name: 'CF08 keep',
    })
    expect(await prisma.module.findUnique({ where: { id: seededIds.module } })).toMatchObject({
      targetProjectId: firstProjectId,
      name: 'E2E Auth',
    })
  })
})
