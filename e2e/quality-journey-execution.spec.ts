import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import prisma from '../src/config/db-config'
import { createQualityJourney } from '../src/services/coordinator/quality-journey-service'

test('Journey execution overview renders safely before materialization @smoke', async ({ page, context, baseURL }) => {
  const targetProjectId = randomUUID()
  await prisma.targetProject.create({
    data: {
      id: targetProjectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `e2e:${targetProjectId}`,
      canonicalPath: `/tmp/${targetProjectId}`,
      displayName: 'Journey execution browser test',
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  })
  const created = await createQualityJourney({
    targetProjectId,
    idempotencyKey: randomUUID(),
    requirement: { objective: 'Verify managed execution visibility.' },
  })
  await context.addCookies([{ name: 'appraise-active-project', value: targetProjectId, url: baseURL! }])
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`/quality-journeys/${created.journey.journeyId}?project=${targetProjectId}`)
  await expect(page.getByText('Managed execution', { exact: true })).toBeVisible()
  await expect(page.getByText('No managed runs yet.', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start managed execution', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Grant consent for this scope' })).toHaveCount(0)
  expect(errors).toEqual([])
})
