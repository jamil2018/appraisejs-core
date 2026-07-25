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

  async function completeRequiredDefinition(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Title'), 'Send Account Notification')
    await user.type(screen.getByLabelText('Purpose'), 'Notify an account owner about an important change.')
    await user.click(screen.getByRole('combobox', { name: 'Group' }))
    await user.click(screen.getByRole('option', { name: /navigation/ }))
    await user.type(screen.getByLabelText('Readable Gherkin sentence'), 'I send an account notification')
  }

  it('presents four phases and locks saving and future phases until required fields are complete', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor groups={groups} />)

    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Connect implementation/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()

    await completeRequiredDefinition(user)

    expect(screen.getByRole('button', { name: /Connect implementation/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        human: expect.objectContaining({
          signature: 'I send an account notification',
        }),
      }),
    )
    expect(await screen.findByText('Draft revision 1')).toBeInTheDocument()
  })

  it('requires descriptions for inputs derived from named placeholders', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor groups={groups} />)

    await completeRequiredDefinition(user)
    fireEvent.change(screen.getByLabelText('Readable Gherkin sentence'), {
      target: { value: 'I greet {accountName}' },
    })

    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled()
    await user.type(screen.getByLabelText('Description'), 'The account name shown in the notification.')
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeEnabled()
  })

  it('keeps execution plumbing behind an explanatory advanced disclosure', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor groups={groups} />)

    await completeRequiredDefinition(user)
    await user.click(screen.getByRole('button', { name: /Connect implementation/ }))

    const summary = screen.getByText('Advanced execution settings')
    const disclosure = summary.closest('details')
    expect(disclosure).not.toHaveAttribute('open')
    expect(screen.getByText('Custom code · Node.js')).toBeInTheDocument()
    await user.click(summary)
    expect(disclosure).toHaveAttribute('open')
    expect(screen.getByText(/Custom code is the normal choice/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Allowed capabilities')).not.toBeInTheDocument()
    expect(screen.getByText(/does not grant code access/)).toBeInTheDocument()
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

    await completeRequiredDefinition(user)
    expect(screen.queryByText('custom.send-account-notification')).not.toBeInTheDocument()
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
