// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StepDefinitionDraftEditor } from './step-definition-draft-editor'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  create: vi.fn(),
  revise: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('@/actions/step-definition/step-definition-actions', () => ({
  createStepDefinitionDraftAction: mocks.create,
  reviseStepDefinitionDraftAction: mocks.revise,
  compileStepDefinitionDraftArtifactAction: vi.fn(),
  previewStepDefinitionDraftAction: vi.fn(),
  publishStepDefinitionDraftAction: vi.fn(),
  readStepDefinitionDraftAction: vi.fn(),
  reviewStepDefinitionDraftAction: vi.fn(),
  saveStepDefinitionDraftArtifactAction: vi.fn(),
  validateStepDefinitionDraftAction: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ success: true, status: 200, data: { id: 'draft-1', revision: 1 } })
  mocks.revise.mockResolvedValue({ success: true, status: 200, data: { id: 'draft-1', revision: 2 } })
})

describe('StepDefinitionDraftEditor', () => {
  const groups = [
    {
      id: 'group-1',
      name: 'navigation',
      type: 'ACTION',
      description: 'Reusable browser navigation behavior.',
    },
  ]

  it('supports keyboard stage navigation and saves resumable drafts', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor groups={groups} />)

    await user.click(screen.getByRole('button', { name: /Human sentence/ }))
    const sentence = screen.getByLabelText('Readable Gherkin sentence')
    fireEvent.change(sentence, { target: { value: 'I greet {accountName}' } })
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        human: expect.objectContaining({
          signature: 'I greet {accountName}',
          parameterBindings: [{ placeholder: 'accountName', input: 'accountName' }],
        }),
      }),
    )
    expect(await screen.findByText('Draft revision 1')).toBeInTheDocument()
  })

  it('keeps publication disabled before compilation evidence exists', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor groups={groups} />)
    await user.click(screen.getByRole('button', { name: /Review & publish/ }))
    expect(screen.getByRole('button', { name: /publish immutable version/i })).toBeDisabled()
  })

  it('derives managed identity and discovery metadata from required user fields', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor groups={groups} />)

    expect(screen.queryByRole('textbox', { name: 'Stable ID' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Version' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveAttribute('placeholder', 'e.g. Send account notification')
    expect(screen.getByLabelText('Purpose')).toHaveAttribute(
      'placeholder',
      'Explain the single reusable behavior and when it should be used.',
    )

    await user.type(screen.getByLabelText('Title'), 'Send Account Notification')
    expect(screen.queryByText('custom.send-account-notification')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Group' }))
    await user.click(screen.getByRole('option', { name: /navigation/ }))
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({ id: 'custom.send-account-notification', version: '1' }),
        human: expect.objectContaining({ groupId: 'navigation' }),
        intent: expect.objectContaining({ searchTerms: expect.arrayContaining(['send', 'account', 'notification']) }),
      }),
    )
  })
})
