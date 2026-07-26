// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StepDefinitionDraftEditor } from './step-definition-draft-editor'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  toast: vi.fn(),
  create: vi.fn(),
  revise: vi.fn(),
  compile: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  read: vi.fn(),
  review: vi.fn(),
  saveArtifact: vi.fn(),
  validate: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('@/actions/step-definition/step-definition-actions', () => ({
  createStepDefinitionDraftAction: mocks.create,
  reviseStepDefinitionDraftAction: mocks.revise,
  compileStepDefinitionDraftArtifactAction: mocks.compile,
  previewStepDefinitionDraftAction: mocks.preview,
  publishStepDefinitionDraftAction: mocks.publish,
  readStepDefinitionDraftAction: mocks.read,
  reviewStepDefinitionDraftAction: mocks.review,
  saveStepDefinitionDraftArtifactAction: mocks.saveArtifact,
  validateStepDefinitionDraftAction: mocks.validate,
}))
vi.mock('./step-definition-code-editor', () => ({
  StepDefinitionCodeEditor: ({ onChange, value }: { onChange: (value: string) => void; value: string }) => (
    <textarea aria-label="User-owned handler source" value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ success: true, status: 200, data: { id: 'draft-1', revision: 1 } })
  mocks.revise.mockResolvedValue({ success: true, status: 200, data: { id: 'draft-1', revision: 2 } })
  mocks.saveArtifact.mockResolvedValue({ success: true, status: 200, data: {} })
  mocks.compile.mockResolvedValue({
    success: true,
    status: 200,
    data: { revision: 2, diagnostics: [], conformance: { passed: true } },
  })
  mocks.read.mockImplementation(async () => {
    const created = mocks.create.mock.calls[0]?.[0]
    return {
      success: true,
      status: 200,
      data: {
        id: 'draft-1',
        revision: 2,
        definition: created
          ? {
              ...created,
              execution: {
                ...created.execution,
                sourceHash: `sha256:${'1'.repeat(64)}`,
                compiledHash: `sha256:${'2'.repeat(64)}`,
              },
            }
          : undefined,
      },
    }
  })
  mocks.validate.mockResolvedValue({ success: true, status: 200, data: { valid: true } })
  mocks.preview.mockResolvedValue({ success: true, status: 200, data: { draftHash: 'hash' } })
  mocks.review.mockResolvedValue({ success: true, status: 200, data: {} })
  mocks.publish.mockResolvedValue({
    success: true,
    status: 200,
    data: {
      step: { id: 'custom.send-account-notification', version: '1' },
      definitionHash: `sha256:${'a'.repeat(64)}`,
    },
  })
})

describe('StepDefinitionDraftEditor', () => {
  async function completeRequiredDefinition(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Title'), 'Send Account Notification')
    await user.type(screen.getByLabelText('Purpose'), 'Notify an account owner about an important change.')
    await user.type(screen.getByLabelText('Readable Gherkin sentence'), 'I send an account notification')
  }

  function completeHandler() {
    fireEvent.change(screen.getByLabelText('User-owned handler source'), {
      target: {
        value:
          "import type { StepHandler } from './contract.js'\nexport const handler: StepHandler = async (_input, context) => {\n  context.signal.throwIfAborted()\n  return {}\n}",
      },
    })
  }

  it('presents four phases and locks saving and future phases until required fields are complete', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

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
    render(<StepDefinitionDraftEditor />)

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
    render(<StepDefinitionDraftEditor />)

    await completeRequiredDefinition(user)
    await user.click(screen.getByRole('button', { name: /Connect implementation/ }))

    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeDisabled()
    completeHandler()
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeEnabled()
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

  it('persists handler and example-name edits before compilation so a resumed draft keeps them', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

    await completeRequiredDefinition(user)
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    completeHandler()
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await user.clear(screen.getByLabelText('Example name'))
    await user.type(screen.getByLabelText('Example name'), 'Named recipient')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(mocks.saveArtifact).toHaveBeenLastCalledWith({
      draftId: 'draft-1',
      expectedRevision: 1,
      artifact: {
        handlerSource: expect.stringContaining('context.signal.throwIfAborted()'),
        examples: [{ name: 'Named recipient', inputs: {} }],
      },
    })
  })

  it('regenerates the saved artifact when definition-only execution settings change', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

    await completeRequiredDefinition(user)
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    completeHandler()
    await user.click(screen.getByText('Advanced execution settings'))
    await user.click(screen.getByRole('combobox', { name: 'Runs in' }))
    await user.click(screen.getByRole('option', { name: 'Browser automation' }))
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(mocks.revise).toHaveBeenCalled()
    expect(mocks.saveArtifact).toHaveBeenLastCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        artifact: expect.objectContaining({
          handlerSource: expect.stringContaining('context.signal.throwIfAborted()'),
        }),
      }),
    )
  })

  it('derives managed identity and discovery metadata from required user fields', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

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
        human: expect.objectContaining({ groupId: 'custom' }),
        intent: expect.objectContaining({ searchTerms: expect.arrayContaining(['send', 'account', 'notification']) }),
      }),
    )
  })

  it('keeps named-input examples and revision-bound evidence intact through the primary publication path', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

    await completeRequiredDefinition(user)
    fireEvent.change(screen.getByLabelText('Readable Gherkin sentence'), {
      target: { value: 'I greet {personName}' },
    })
    await user.type(screen.getByLabelText('Description'), 'The person to greet.')

    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    completeHandler()
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(screen.getByLabelText('Example personName')).toHaveValue('Example person name')
    await user.clear(screen.getByLabelText('Example personName'))
    await user.type(screen.getByLabelText('Example personName'), 'Ada')
    mocks.compile.mockResolvedValueOnce({
      success: true,
      status: 200,
      data: { revision: 3, diagnostics: [], conformance: { passed: true } },
    })
    mocks.read.mockImplementationOnce(async () => {
      const created = mocks.create.mock.calls[0]![0]
      return {
        success: true,
        status: 200,
        data: {
          id: 'draft-1',
          revision: 3,
          definition: {
            ...created,
            agent: { ...created.agent, examples: [{ ...created.agent.examples[0], inputs: { personName: 'Ada' } }] },
            execution: {
              ...created.execution,
              sourceHash: `sha256:${'1'.repeat(64)}`,
              compiledHash: `sha256:${'2'.repeat(64)}`,
            },
          },
        },
      }
    })
    await user.click(screen.getByRole('button', { name: 'Compile and run conformance' }))

    expect(mocks.saveArtifact).toHaveBeenCalledWith({
      draftId: 'draft-1',
      expectedRevision: 2,
      artifact: {
        handlerSource: expect.any(String),
        examples: [{ name: 'Happy path', inputs: { personName: 'Ada' } }],
      },
    })
    expect(await screen.findByText('Execution checks passed')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The handler passed static policy, compilation, and configured example execution. Review the behavior and projections before publishing.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Replace the generated placeholder, then compile the handler to produce execution evidence.'),
    ).not.toBeInTheDocument()

    const artifactSaveCountAfterCompile = mocks.saveArtifact.mock.calls.length
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(mocks.saveArtifact).toHaveBeenCalledTimes(artifactSaveCountAfterCompile)
    await user.click(screen.getByRole('button', { name: 'Review exact publication preview' }))

    expect(mocks.publish).not.toHaveBeenCalled()
    expect(await screen.findByText('Ready for final confirmation')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish immutable version' }))

    expect(mocks.review).toHaveBeenCalledWith({ draftId: 'draft-1', expectedRevision: 3 })
    expect(mocks.publish).toHaveBeenCalledWith({ draftId: 'draft-1', expectedRevision: 3 })
    expect(await screen.findByText('Reusable step published')).toBeInTheDocument()
    expect(screen.getByText('custom.send-account-notification@1')).toBeInTheDocument()
    expect(mocks.replace).toHaveBeenCalledWith(
      `/step-definitions/published?id=custom.send-account-notification&version=1&definitionHash=sha256%3A${'a'.repeat(64)}`,
    )
  })

  it('invalidates conformance after substantive example changes and revises before recompiling', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

    await completeRequiredDefinition(user)
    fireEvent.change(screen.getByLabelText('Readable Gherkin sentence'), {
      target: { value: 'I greet {personName}' },
    })
    await user.type(screen.getByLabelText('Description'), 'The person to greet.')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    completeHandler()
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await user.click(screen.getByRole('button', { name: 'Compile and run conformance' }))
    expect(await screen.findByText('Execution checks passed')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Example personName'))
    await user.type(screen.getByLabelText('Example personName'), 'Grace')

    expect(screen.getByText('Not executable yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeDisabled()

    mocks.revise.mockResolvedValueOnce({ success: true, status: 200, data: { id: 'draft-1', revision: 3 } })
    await user.click(screen.getByRole('button', { name: 'Compile and run conformance' }))
    expect(mocks.revise).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 'draft-1',
        expectedRevision: 2,
        definition: expect.objectContaining({
          agent: expect.objectContaining({ examples: [expect.objectContaining({ inputs: { personName: 'Grace' } })] }),
        }),
      }),
    )
  })

  it('keeps intermediate JSON example text editable and reports validity inline', async () => {
    const user = userEvent.setup()
    render(<StepDefinitionDraftEditor />)

    await completeRequiredDefinition(user)
    fireEvent.change(screen.getByLabelText('Readable Gherkin sentence'), {
      target: { value: 'I send {payload}' },
    })
    await user.type(screen.getByLabelText('Description'), 'The JSON payload to send.')
    expect(screen.getByRole('combobox', { name: 'Type for payload' })).toHaveAccessibleName('Type for payload')
    await user.click(screen.getByRole('combobox', { name: 'Type for payload' }))
    await user.click(screen.getByRole('option', { name: 'json' }))
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    completeHandler()
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    fireEvent.change(screen.getByLabelText('Example payload'), { target: { value: '{"name":' } })
    expect(screen.getByLabelText('Example payload')).toHaveValue('{"name":')
    expect(screen.getByText('Enter a valid JSON example before compiling.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compile and run conformance' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Example payload'), { target: { value: '{"name":"Ada"}' } })
    expect(screen.queryByText('Enter a valid JSON example before compiling.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compile and run conformance' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Compile and run conformance' }))
    expect(await screen.findByText('Execution checks passed')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Example payload'), { target: { value: '{"name":' } })
    expect(screen.getByText('Not executable yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compile and run conformance' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save and continue' })).toBeDisabled()
  })
})
