// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  submit: vi.fn(),
  preview: vi.fn(),
  save: vi.fn(),
  refresh: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('../quality-journey-operator-actions', () => ({
  requestManualAutomationRecoveryAction: mocks.request,
  submitManualAutomationAction: mocks.submit,
  previewOperatorTriageAction: mocks.preview,
  saveOperatorTriageAction: mocks.save,
}))
import { ManualAutomationControl } from './manual-automation-control'
import { OperatorTriageControl } from './operator-triage-control'

const hash = `sha256:${'a'.repeat(64)}`
const currentHash = `sha256:${'b'.repeat(64)}`
const props = { journeyId: 'journey-1', stateHash: hash }
beforeEach(() => vi.clearAllMocks())

describe('operator preparation and evidence review', () => {
  it('does not issue or claim on render and requires explicit recovery followed by reviewed JSON submission', async () => {
    mocks.request.mockResolvedValue({ success: true, status: 200, data: { eventId: 'recovery-event' } })
    mocks.submit.mockResolvedValue({ success: true, status: 200 })
    render(
      <ManualAutomationControl
        {...props}
        recovery={{ attemptId: 'old-attempt', failureHash: hash }}
        issued={null}
        choices={{ bindings: [], scenarios: [] }}
      />,
    )
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(screen.getByText(/earlier Codex request remains UNKNOWN/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Create manual preparation recovery' }))
    await userEvent.click(screen.getByText('Operator preparation'))
    expect(mocks.request).toHaveBeenCalledWith({
      journeyId: props.journeyId,
      expectedStateHash: hash,
      attemptId: 'old-attempt',
      expectedFailureHash: hash,
    })
    const button = screen.getByRole('button', { name: 'Submit reviewed preparation' })
    fireEvent.change(screen.getByLabelText('Preparation JSON'), { target: { value: '{"scenarios":[]}' } })
    expect(button).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /I reviewed these mappings/ }))
    fireEvent.change(screen.getByLabelText('Preparation JSON'), { target: { value: '{"scenarios":[{}]}' } })
    expect(button).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /I reviewed these mappings/ }))
    await userEvent.click(button)
    expect(mocks.submit).toHaveBeenCalledWith({
      journeyId: props.journeyId,
      recoveryEventId: 'recovery-event',
      draftJson: '{"scenarios":[{}]}',
    })
    expect(screen.getByRole('status')).toHaveTextContent('execution consent')
    expect(button).toBeDisabled()
  })
  it('keeps pasted JSON and reports uncertainty without offering an immediate resubmission', async () => {
    mocks.submit.mockRejectedValue(new Error('transport interrupted'))
    render(<ManualAutomationControl {...props} recovery={null} issued={{ eventId: 'recovery-event' }} choices={{}} />)
    await userEvent.click(screen.getByText('Operator preparation'))
    fireEvent.change(screen.getByLabelText('Preparation JSON'), { target: { value: '{"scenarios":[]}' } })
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Submit reviewed preparation' }))
    expect(screen.getByLabelText('Preparation JSON')).toHaveValue('{"scenarios":[]}')
    expect(screen.getByRole('status')).toHaveTextContent('interrupted')
    expect(screen.getByRole('button', { name: 'Submit reviewed preparation' })).toBeDisabled()
  })
  it('loads a selected JSON file without submitting and rejects oversized files', async () => {
    render(<ManualAutomationControl {...props} recovery={null} issued={{ eventId: 'recovery-event' }} choices={{}} />)
    await userEvent.click(screen.getByText('Operator preparation'))
    const content = '{"scenarios":[]}'
    const file = new File([content], 'preparation.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => content })
    const input = screen.getByLabelText('Load a preparation JSON file (maximum 1 MB)')
    await userEvent.upload(input, file)
    expect(screen.getByLabelText('Preparation JSON')).toHaveValue(content)
    expect(mocks.submit).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    await userEvent.upload(input, new File(['x'.repeat(1_000_001)], 'large.json', { type: 'application/json' }))
    expect(screen.getByRole('status')).toHaveTextContent('exceeds 1 MB')
    expect(screen.getByLabelText('Preparation JSON')).toHaveValue(content)
  })
  it('loads sealed evidence explicitly and saves material findings against the returned state and evidence hashes', async () => {
    mocks.preview.mockResolvedValue({
      success: true,
      data: {
        inputHash: hash,
        expectedStateHash: currentHash,
        runs: [
          {
            testRunId: 'run-1',
            title: 'Confirmation',
            evidenceReceiptId: 'receipt-1',
            scenarioRevisionId: 'scenario-1',
            passed: false,
            canAttributeTargetFailure: false,
            steps: [{ name: 'Check confirmation', status: 'skipped' }],
          },
        ],
      },
    })
    mocks.save.mockResolvedValue({ success: true, status: 200 })
    render(<OperatorTriageControl {...props} />)
    expect(mocks.preview).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Review sealed run evidence' }))
    expect(mocks.preview).toHaveBeenCalledWith({ journeyId: props.journeyId, expectedStateHash: hash })
    expect(mocks.save).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Save reviewed report' })
    expect(button).toBeDisabled()
    await userEvent.type(screen.getByLabelText('What happened'), 'The step was skipped.')
    await userEvent.type(screen.getByLabelText('Expected behavior'), 'Confirmation appears.')
    await userEvent.type(screen.getByLabelText('Next action'), 'Inspect the environment.')
    await userEvent.click(button)
    expect(mocks.save).toHaveBeenCalledWith({
      journeyId: props.journeyId,
      expectedStateHash: currentHash,
      inputHash: hash,
      findings: [
        {
          testRunId: 'run-1',
          kind: 'INCONCLUSIVE',
          observation: 'The step was skipped.',
          expectation: 'Confirmation appears.',
          nextAction: 'Inspect the environment.',
        },
      ],
    })
    expect(screen.getByRole('status')).toHaveTextContent('Review the exact report')
    expect(button).toBeDisabled()
  })
  it('allows a passed-evidence report with no invented findings', async () => {
    mocks.preview.mockResolvedValue({
      success: true,
      data: {
        inputHash: hash,
        expectedStateHash: currentHash,
        runs: [{ testRunId: 'run-passed', title: 'Checkout', evidenceReceiptId: 'receipt-1', passed: true, steps: [] }],
      },
    })
    mocks.save.mockResolvedValue({ success: true, status: 200 })
    render(<OperatorTriageControl {...props} />)
    await userEvent.click(screen.getByRole('button', { name: 'Review sealed run evidence' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save reviewed report' }))
    expect(mocks.save.mock.calls[0][0].findings).toEqual([])
  })
})
