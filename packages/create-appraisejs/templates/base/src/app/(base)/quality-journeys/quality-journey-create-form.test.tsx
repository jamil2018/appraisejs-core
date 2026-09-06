// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  createDraft: vi.fn(),
  saveDraft: vi.fn(),
  confirmDraft: vi.fn(),
  restoreDraft: vi.fn(),
  ensureEnvironment: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('./quality-journey-actions', () => ({
  createQualityJourneyDraftAction: mocks.createDraft,
  saveQualityJourneyDraftAction: mocks.saveDraft,
  confirmQualityJourneyDraftAction: mocks.confirmDraft,
  restoreQualityJourneyDraftAction: mocks.restoreDraft,
  ensureQualityJourneyIntakeEnvironmentAction: mocks.ensureEnvironment,
}))

import { QualityJourneyCreateForm } from './quality-journey-create-form'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createDraft.mockResolvedValue({
    success: true,
    data: { replayed: false, draft: { id: 'draft-1', version: 1, draftHash: `sha256:${'a'.repeat(64)}` } },
  })
  mocks.saveDraft.mockImplementation(async value => ({
    success: true,
    data: {
      draft: { id: 'draft-1', version: value.expectedVersion + 1, draftHash: `sha256:${'b'.repeat(64)}` },
    },
  }))
})

describe('QualityJourneyCreateForm', () => {
  const environments = [{ id: 'environment-1', name: 'Staging', baseUrl: 'https://staging.example.test' }]

  async function completeMinimum(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Outcome or behavior to validate'), 'A shopper can submit an order.')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByLabelText('Included behavior'), 'Checkout submission')
    await user.type(screen.getByLabelText('Observable outcomes that would satisfy you'), 'An order ID is shown')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByText('Staging'))
    await user.click(screen.getByRole('button', { name: 'Review Journey intake' }))
  }

  it('keeps at least one test dimension selected', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project-1" />)

    await user.type(screen.getByLabelText('Outcome or behavior to validate'), 'A shopper can submit an order.')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: '03Checks' }))
    const functional = screen.getByRole('checkbox', { name: 'Functional' })
    await user.click(functional)

    expect(functional).toBeChecked()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  it('creates a draft from a meaningful partial edit before the objective is supplied', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project-1" />)

    await user.type(screen.getByLabelText(/Context/), 'A launch depends on this behavior.')

    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({ requirement: expect.objectContaining({ context: 'A launch depends on this behavior.' }) }),
    )
  })

  it('creates a requirement and navigates to its stable Quality Journey identifier', async () => {
    mocks.confirmDraft.mockResolvedValue({ success: true, data: { journeyId: 'journey-1' } })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project one" />)

    await completeMinimum(user)
    expect(mocks.confirmDraft).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Confirm and create Journey' }))

    expect(mocks.confirmDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        expectedVersion: expect.any(Number),
        expectedDraftHash: expect.stringMatching(/^sha256:/),
        requirementHash: expect.stringMatching(/^sha256:/),
      }),
    )
    expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/journey-1?project=project%20one')
  })

  it('shows an actionable error when creation does not yield a stable journey identifier', async () => {
    mocks.confirmDraft.mockResolvedValue({ success: false, error: 'The active project no longer exists.' })
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
    expect(mocks.confirmDraft).not.toHaveBeenCalled()
  })

  it('routes an incomplete review to its first missing input and focuses it', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project-1" />)

    await user.click(screen.getByRole('button', { name: '04Test location' }))
    await user.click(screen.getByRole('button', { name: 'Review Journey intake' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Add a requirement objective before reviewing this brief.')
    await waitFor(() => expect(screen.getByLabelText('Outcome or behavior to validate')).toHaveFocus())
  })

  it('renders supplied multiline values as lists, omits empty optional rows, and edits one review section', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project-1" />)

    await completeMinimum(user)
    await user.click(screen.getByRole('button', { name: 'Edit intake' }))
    await user.click(screen.getByRole('button', { name: '02Scope and success' }))
    await user.type(screen.getByLabelText('Included behavior'), '\nOrder confirmation')
    await user.click(screen.getByRole('button', { name: '04Test location' }))
    await user.click(screen.getByRole('button', { name: 'Review Journey intake' }))

    expect(screen.getByText('Order confirmation')).toBeInTheDocument()
    expect(screen.queryByText('Not supplied')).not.toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Edit' })[1]!)
    expect(screen.getByRole('heading', { name: 'Scope and success' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Scope and success' })).toHaveFocus())
  })

  it('offers archived drafts a restore path instead of editing them', async () => {
    mocks.restoreDraft.mockResolvedValue({ success: true, data: { draft: { id: 'draft-1' } } })
    const user = userEvent.setup()
    render(
      <QualityJourneyCreateForm
        draft={{
          id: 'draft-1',
          status: 'ARCHIVED',
          version: 3,
          draftHash: `sha256:${'a'.repeat(64)}`,
          currentStep: 1,
          requirement: { objective: 'Archived brief' },
        }}
        initialEnvironments={environments}
        projectId="project-1"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Restore draft' }))
    expect(mocks.restoreDraft).toHaveBeenCalledWith({ draftId: 'draft-1', expectedVersion: 3 })
  })
})
