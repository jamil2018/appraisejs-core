// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  create: vi.fn(),
  ensureEnvironment: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('./quality-journey-actions', () => ({
  createQualityJourneyAction: mocks.create,
  ensureQualityJourneyIntakeEnvironmentAction: mocks.ensureEnvironment,
}))

import { QualityJourneyCreateForm } from './quality-journey-create-form'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QualityJourneyCreateForm', () => {
  const environments = [{ id: 'environment-1', name: 'Staging', baseUrl: 'https://staging.example.test' }]

  async function completeMinimum(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Outcome or behavior to validate'), 'A shopper can submit an order.')
    await user.type(screen.getByLabelText('Included behavior'), 'Checkout submission')
    await user.click(screen.getByText('Staging'))
    await user.type(screen.getByLabelText('Observable outcomes that would satisfy you'), 'An order ID is shown')
    await user.click(screen.getByRole('button', { name: 'Review Journey intake' }))
  }

  it('creates a requirement and navigates to its stable Quality Journey identifier', async () => {
    mocks.create.mockResolvedValue({ success: true, data: { journeyId: 'journey-1' } })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project one" />)

    await completeMinimum(user)
    expect(mocks.create).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm and create Journey' }))

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: expect.objectContaining({
          objective: 'A shopper can submit an order.',
          coverageRigor: 'STANDARD',
          testDimensions: ['FUNCTIONAL'],
          includedScope: ['Checkout submission'],
          environmentIds: ['environment-1'],
          desiredEvidenceSignals: ['An order ID is shown'],
        }),
        idempotencyKey: expect.stringMatching(/^quality-journey:/),
      }),
    )
    expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/journey-1?project=project%20one')
  })

  it('shows an actionable error when creation does not yield a stable journey identifier', async () => {
    mocks.create.mockResolvedValue({ success: false, error: 'The active project no longer exists.' })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project-1" />)

    await completeMinimum(user)
    await user.click(screen.getByRole('button', { name: 'Confirm and create Journey' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The active project no longer exists.')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('returns from confirmation without persisting a Journey', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project-1" />)

    await completeMinimum(user)
    await user.click(screen.getByRole('button', { name: 'Edit intake' }))

    expect(screen.getByRole('button', { name: 'Review Journey intake' })).toBeEnabled()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
