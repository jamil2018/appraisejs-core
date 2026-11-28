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
import { getBriefFileContext, getBriefRecordContext } from '@/lib/quality-journey/record-context'

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
  it('saves an explicit Claude Code selection with the brief before confirmation', async () => {
    mocks.confirmDraft.mockResolvedValue({ success: true, data: { journeyId: 'journey-claude' } })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project-1" />)
    const worker = screen.getByRole('combobox', { name: 'Provider' })
    expect(worker).toHaveValue('CODEX')
    await user.selectOptions(worker, 'CLAUDE_CODE')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'sonnet')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Effort' }), 'high')
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Check checkout.')
    await user.click(screen.getByRole('button', { name: 'Start journey' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/quality-journeys/journey-claude?project=project-1'))
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        managedWorkerProvider: 'CLAUDE_CODE',
        managedWorkerModel: 'sonnet',
        managedWorkerEffort: 'high',
      }),
    )
    expect(mocks.confirmDraft).toHaveBeenCalledOnce()
  })

  it('offers one free-text brief and starts without mandatory configuration or a separate review', async () => {
    mocks.confirmDraft.mockResolvedValue({ success: true, data: { journeyId: 'journey-1' } })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project one" />)
    expect(screen.getByRole('heading', { level: 1, name: 'What would you like to check?' })).toBeVisible()
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

  it('keeps a draft editable while the selected provider needs setup', async () => {
    const user = userEvent.setup()
    render(
      <QualityJourneyCreateForm
        projectId="project-1"
        providerReadiness={{
          CODEX: {
            provider: 'CODEX',
            ready: true,
            state: 'ready',
            reason: null,
            actionLabel: null,
            settingsHref: '/settings/agent-setup?provider=CODEX',
          },
          CLAUDE_CODE: {
            provider: 'CLAUDE_CODE',
            ready: false,
            state: 'sign_in',
            reason: 'Claude Code needs your sign-in.',
            actionLabel: 'Sign in to Claude Code',
            settingsHref: '/settings/agent-setup?provider=CLAUDE_CODE',
          },
        }}
      />,
    )
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Check checkout.')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Provider' }), 'CLAUDE_CODE')
    expect(screen.getByText('Claude Code needs your sign-in.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sign in to Claude Code' })).toHaveAttribute(
      'href',
      '/settings/agent-setup?provider=CLAUDE_CODE',
    )
    expect(screen.getByRole('button', { name: 'Start journey' })).toBeDisabled()
    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(mocks.confirmDraft).not.toHaveBeenCalled()
  })

  it('clears a saved model and effort when the user selects provider defaults', async () => {
    const user = userEvent.setup()
    render(
      <QualityJourneyCreateForm
        projectId="project-1"
        draft={{
          id: 'draft-1',
          version: 2,
          draftHash: `sha256:${'a'.repeat(64)}`,
          currentStep: 0,
          requirement: { objective: 'Check checkout.' },
          managedWorkerProvider: 'CLAUDE_CODE',
          managedWorkerModel: 'sonnet',
          managedWorkerEffort: 'high',
        }}
      />,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'default')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Effort' }), 'default')
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({ managedWorkerModel: null, managedWorkerEffort: null }),
    )
  })

  it('autosaves the latest partial brief without starting a Journey', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project-1" />)
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
    render(<QualityJourneyCreateForm projectId="project-1" />)
    expect(mocks.createDraft).not.toHaveBeenCalled()
    expect(screen.getByText(/autosaves after your first edit/i)).toBeInTheDocument()
  })

  it('retains a verified record reference in the exact autosaved brief', async () => {
    const reference = {
      source: 'appraise.record/v1' as const,
      kind: 'test-case' as const,
      id: 'checkout-case',
      title: 'Guest checkout shows an order number',
    }
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project-1" recordContext={reference} />)
    expect(screen.getByText(reference.title)).toBeVisible()
    expect(mocks.createDraft).not.toHaveBeenCalled()

    await user.type(screen.getByLabelText('What do you want to validate?'), 'Verify the confirmation page.')
    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalledOnce(), { timeout: 1500 })
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        requirement: { objective: 'Verify the confirmation page.', context: JSON.stringify(reference) },
      }),
    )
    expect(mocks.confirmDraft).not.toHaveBeenCalled()
  })

  it('saves a selected text file with the record context and restores its chip from a draft', async () => {
    const reference = {
      source: 'appraise.record/v1' as const,
      kind: 'test-case' as const,
      id: 'checkout-case',
      title: 'Guest checkout',
    }
    const user = userEvent.setup()
    const view = render(<QualityJourneyCreateForm projectId="project-1" recordContext={reference} />)
    await user.upload(
      screen.getByLabelText('Text file'),
      new File(['Guest checkout title must appear.'], 'notes.md', { type: 'text/markdown' }),
    )
    expect(await screen.findByText('notes.md')).toBeVisible()
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Check the checkout title.')
    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalledOnce(), { timeout: 1500 })
    const saved = mocks.createDraft.mock.calls[0][0].requirement
    expect(getBriefFileContext(saved.context)?.file).toEqual({
      name: 'notes.md',
      content: 'Guest checkout title must appear.',
    })
    expect(getBriefRecordContext(saved.context)).toEqual(reference)

    view.unmount()
    render(
      <QualityJourneyCreateForm
        projectId="project-1"
        draft={{ id: 'draft-1', version: 2, draftHash: `sha256:${'a'.repeat(64)}`, currentStep: 0, requirement: saved }}
      />,
    )
    expect(screen.getByText('notes.md')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Remove file' }))
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalled(), { timeout: 1500 })
    expect(mocks.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requirement: { objective: 'Check the checkout title.', context: JSON.stringify(reference) },
      }),
    )
  })

  it('rejects an oversized attachment before it enters a saved brief', async () => {
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project-1" />)
    await user.upload(screen.getByLabelText('Text file'), new File(['a'.repeat(6_001)], 'large.txt'))
    expect(await screen.findByRole('alert')).toHaveTextContent('under 6 KB')
    expect(screen.queryByText('large.txt')).not.toBeInTheDocument()
    expect(mocks.createDraft).not.toHaveBeenCalled()
  })

  it('offers save recovery and prevents starting over a conflicting version', async () => {
    mocks.createDraft.mockResolvedValueOnce({ success: false, error: 'A newer saved version exists.' })
    const user = userEvent.setup()
    render(<QualityJourneyCreateForm projectId="project-1" />)
    await user.type(screen.getByLabelText('What do you want to validate?'), 'Keep this edit.')
    expect(await screen.findByRole('button', { name: 'Load saved version' }, { timeout: 1500 })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument()
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
    render(<QualityJourneyCreateForm projectId="project-1" />)
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
