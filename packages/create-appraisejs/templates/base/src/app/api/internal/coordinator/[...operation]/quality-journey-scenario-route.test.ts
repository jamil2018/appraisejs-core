import { describe, expect, it } from 'vitest'

import { postQualityJourneyScenarioRoute } from './quality-journey-scenario-route'

describe('scenario coordinator route', () => {
  it.each(['decisions', 'comments', 'comment-dispositions', 'revision-requests'])(
    'does not expose the human %s mutation to a project-credential caller',
    async operation => {
      await expect(
        postQualityJourneyScenarioRoute(['quality', 'journeys', 'journey-1', 'scenarios', operation], {
          target: 'target-1',
        }),
      ).resolves.toBeUndefined()
    },
  )
})
