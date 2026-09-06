// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { JourneyAnchorNavigation } from './journey-anchor-navigation'

describe('JourneyAnchorNavigation', () => {
  it('keeps the active project in every section link', () => {
    render(<JourneyAnchorNavigation journeyId="journey/a" projectId="project/a" />)

    expect(screen.getByRole('navigation', { name: 'Journey sections' })).toHaveTextContent('Progress')
    expect(screen.getByRole('link', { name: 'Automation' })).toHaveAttribute(
      'href',
      '/quality-journeys/journey%2Fa?project=project%2Fa#automation',
    )
  })
})
