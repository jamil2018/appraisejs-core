// @vitest-environment jsdom

import { webcrypto } from 'node:crypto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  vi.stubGlobal('crypto', webcrypto)
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('QualityJourneyCreateForm', () => {
  const environments = [{ id: 'environment-1', name: 'Staging', baseUrl: 'https://staging.example.test' }]

  it('offers one free-text brief and starts without mandatory configuration or a separate review', async () => {
    mocks.confirmDraft.mockResolvedValue({ success: true, data: { journeyId: 'journey-1' } })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={environments} projectId="project one" />)
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Start journey' })).toBeDisabled()
    await user.type(screen.getByLabelText('What do you want to validate?'), 'A shopper can submit an order.')
    await user.click(screen.getByRole('button', { name: 'Start journey' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/journey-1?project=project%20one'))
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: { objective: 'A shopper can submit an order.' },
      }),
    )
    expect(mocks.confirmDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        requirementHash: expect.stringMatching(/^sha256:/),
      }),
    )
  })

  it('autosaves the latest partial brief without starting a Journey', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={[]} projectId="project-1" />)
    await user.type(screen.getByLabelText('What do you want to validate?'), 'First thought, refined before autosave.')
    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalledOnce(), { timeout: 1500 })
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: { objective: 'First thought, refined before autosave.' },
      }),
    )
    expect(mocks.confirmDraft).not.toHaveBeenCalled()
  })

  it('does not create a draft merely by visiting', () => {
    render(<QualityJourneyCreateForm initialEnvironments={[]} projectId="project-1" />)
    expect(mocks.createDraft).not.toHaveBeenCalled()
    expect(screen.getByText(/saved to this workspace after your first edit/i)).toBeInTheDocument()
  })

  it('offers save recovery and prevents starting over a conflicting version', async () => {
    mocks.createDraft.mockResolvedValueOnce({ success: false, error: 'A newer saved version exists.' })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={[]} projectId="project-1" />)
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Keep this edit.')
    expect(await screen.findByRole('button', { name: 'Retry save' }, { timeout: 1500 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Load saved version' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save my edits as a new draft' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start journey' })).toBeDisabled()
  })

  it('preserves all existing structured intent while editing the brief', async () => {
    const user = userEvent.setup()
    const requirement = {
      objective: 'Existing goal',
      context: 'Business context',
      coverageRigor: 'COMPREHENSIVE' as const,
      testDimensions: ['API' as const],
      includedScope: ['Checkout'],
      environmentIds: ['environment-1'],
      desiredEvidenceSignals: ['Order ID'],
      excludedScope: ['Refunds'],
      risks: ['Double submission'],
    }
    render(
      <QualityJourneyCreateForm
        initialEnvironments={environments}
        projectId="project-1"
        draft={{ id: 'draft-1', version: 4, draftHash: `sha256:${'a'.repeat(64)}`, currentStep: 3, requirement }}
      />,
    )
    await user.clear(screen.getByLabelText('What do you want to validate?'))
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Updated goal')
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requirement: { ...requirement, objective: 'Updated goal' },
      }),
    )
  })

  it('shows a creation error and preserves the brief for retry', async () => {
    mocks.confirmDraft.mockResolvedValue({ success: false, error: 'The active project no longer exists.' })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm initialEnvironments={[]} projectId="project-1" />)
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Checkout')
    await user.click(screen.getByRole('button', { name: 'Start journey' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The active project no longer exists.')
    expect(screen.getByLabelText('What do you want to validate?')).toHaveValue('Checkout')
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('offers archived drafts a restore path', async () => {
    mocks.restoreDraft.mockResolvedValue({ success: true, data: { draft: { id: 'draft-1' } } })
    const user = userEvent.setup()
    render(
      <QualityJourneyCreateForm
        initialEnvironments={environments}
        projectId="project-1"
        draft={{
          id: 'draft-1',
          status: 'ARCHIVED',
          version: 3,
          draftHash: `sha256:${'a'.repeat(64)}`,
          currentStep: 1,
          requirement: { objective: 'Archived brief' },
        }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Restore draft' }))
    expect(mocks.restoreDraft).toHaveBeenCalledWith({ draftId: 'draft-1', expectedVersion: 3 })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
