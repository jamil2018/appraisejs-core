import { describe, expect, it } from 'vitest'

import { canonicalStepDiscoveryText, stepDiscoveryTerms } from './step-discovery'

describe('combined step discovery', () => {
  it('uses one responsive and viewport vocabulary for human and agent queries', () => {
    expect(stepDiscoveryTerms('responsive layout')).toEqual(
      new Set(['responsive', 'viewport', 'mobile', 'desktop', 'screen', 'breakpoint', 'layout']),
    )
  })

  it('indexes both human projections and agent examples', () => {
    expect(
      canonicalStepDiscoveryText({
        id: 'browser.viewport.set',
        title: 'Set viewport size',
        description: 'Set exact dimensions.',
        categories: ['browser.viewport'],
        capabilities: ['viewport'],
        agentProjection: { searchTerms: ['viewport'], examples: [{ description: 'Use a mobile viewport.' }] },
        humanProjections: [
          {
            title: 'Set viewport size',
            description: 'Set exact dimensions.',
            signature: 'the user sets the viewport to width {int} and height {int}',
            group: 'browser state',
          },
        ],
        aliases: [{ value: 'browser-state/set-viewport-size' }],
      }),
    ).toContain('Use a mobile viewport.')
  })
})
