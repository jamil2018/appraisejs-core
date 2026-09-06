// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { JourneyProgressNotice } from './journey-progress-notice'

describe('JourneyProgressNotice', () => {
  it('offers an accessible manual refresh and returns to the observed state without starting a polling loop', async () => {
    render(<JourneyProgressNotice eventCount={2} stage="SCENARIO_REVIEW" stateHash="sha256:state" />)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Observed scenario review state with 2 durable lifecycle events.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh observed state' }))
    expect(refresh).toHaveBeenCalledOnce()
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Observed scenario review state with 2 durable lifecycle events. Refreshes are manual; no polling occurs while you edit a gate form.',
      ),
    )
  })
})
