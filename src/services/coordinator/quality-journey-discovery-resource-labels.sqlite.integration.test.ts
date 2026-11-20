import { afterEach, expect, it } from 'vitest'
import { prepareM10AutomationFixture } from '@/test/m10-journey-fixture'
import { readInternalDiscoveryAssignment } from './quality-journey-discovery-service'

const fixtures: Awaited<ReturnType<typeof prepareM10AutomationFixture>>[] = []
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(f => f.cleanup()))
})

it('projects labels through the canonical Resource Explorer read without changing frozen Discovery scope or hashes', async () => {
  let observed = false
  const f = await prepareM10AutomationFixture(undefined, {
    dispatch: event => event.directInvoke(),
    async beforeDiscoveryBrowser({ client, journeyId, discoveryRevisionId }) {
      const before = await client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({
        where: { id: discoveryRevisionId },
      })
      const assignment = await client.$transaction(async tx => {
        const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
        const item = await tx.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: before.resourceWorkItemId } })
        return readInternalDiscoveryAssignment(journey, { ...item, role: 'RESOURCE_EXPLORER' }, tx)
      })
      expect(assignment).toMatchObject({
        resourceLabels: expect.arrayContaining([{ resourceId: 'module:m10-module', label: 'M10 checkout' }]),
      })
      const scope = JSON.parse(before.resourceScopeJson)
      expect(assignment.scope).toEqual(scope)
      expect(
        await client.qualityJourneyDiscoveryRevision.findUniqueOrThrow({ where: { id: discoveryRevisionId } }),
      ).toEqual(before)
      observed = true
    },
  })
  fixtures.push(f)
  expect(observed).toBe(true)
}, 30_000)
