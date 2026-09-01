// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  create: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('./quality-journey-actions', () => ({ createQualityJourneyAction: mocks.create }))

import { QualityJourneyCreateForm } from './quality-journey-create-form'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QualityJourneyCreateForm', () => {
  it('creates a requirement and navigates to its stable Quality Journey identifier', async () => {
    mocks.create.mockResolvedValue({ success: true, data: { journeyId: 'journey-1' } })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project one" />)

    await user.type(screen.getByLabelText('Requirement'), 'A shopper can submit an order.')
    await user.click(screen.getByRole('button', { name: 'Submit requirement' }))

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        objective: 'A shopper can submit an order.',
        idempotencyKey: expect.stringMatching(/^quality-journey:/),
      }),
    )
    expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/journey-1?project=project%20one')
  })

  it('shows an actionable error when creation does not yield a stable journey identifier', async () => {
    mocks.create.mockResolvedValue({ success: false, error: 'The active project no longer exists.' })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project-1" />)

    await user.type(screen.getByLabelText('Requirement'), 'A shopper can submit an order.')
    await user.click(screen.getByRole('button', { name: 'Submit requirement' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The active project no longer exists.')
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
