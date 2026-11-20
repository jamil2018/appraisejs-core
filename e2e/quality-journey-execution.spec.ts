import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import prisma from '../src/config/db-config'
import { createTargetProjectFixture } from '../src/test/migrated-test-database'
import { hashQualityJourneyExecutionValue as hash } from '../src/lib/quality-journey'
import { createQualityJourney } from '../src/services/coordinator/quality-journey-service'

test('Journey current focus hides future execution controls before materialization @smoke', async ({
  page,
  context,
  baseURL,
}) => {
  const targetProjectId = randomUUID()
  await createTargetProjectFixture(prisma, {
    id: targetProjectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `e2e:${targetProjectId}`,
    canonicalPath: `/tmp/${targetProjectId}`,
    displayName: 'Journey execution browser test',
    fingerprint: hash(targetProjectId),
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
  await expect(page.getByRole('region', { name: 'Current journey focus' })).toBeVisible()
  await expect(page.locator('#execution')).toHaveCount(0)
  await expect(page.getByText('History', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run tests', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Allow these tests' })).toHaveCount(0)
  expect(errors).toEqual([])
})
