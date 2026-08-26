// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { QualityLifecycleControls } from './quality-lifecycle-controls'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  propose: vi.fn(),
  createRemoteScope: vi.fn(),
  preflight: vi.fn(),
  prepare: vi.fn(),
}))

const approvedRemoteBinding = JSON.stringify([
  {
    validationId: 'validation-1',
    locatorIds: ['locator-login-form'],
    steps: [
      {
        stepId: 'browser.assertions.visible',
        version: '1',
        inputs: { target: 'locator-login-form' },
        keyword: 'Then',
        description: 'the login form is visible',
      },
    ],
  },
])

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../quality-design-actions', () => ({
  answerQualityRequirementQueriesAction: vi.fn(),
  approveQualityValidationDesignAction: vi.fn(),
  createQualityAssessmentAction: vi.fn(),
  createRemoteEvaluationScopeAction: mocks.createRemoteScope,
  assessmentPreflightAction: mocks.preflight,
  assessmentPrepareAction: mocks.prepare,
  proposeQualityValidationDesignAction: mocks.propose,
}))

describe('QualityLifecycleControls', () => {
  it('replaces raw runtime-publication controls with compact assessment preparation guidance', () => {
    render(
      <QualityLifecycleControls
        designHash="sha256:design"
        obligations={[]}
        qualityPlanId="plan-1"
        queries={[]}
        revisionId="revision-1"
        revisionStatus="SCENARIOS_APPROVED"
        validations={[{ id: 'validation-1', status: 'SCENARIO_APPROVED', compilationHash: null }]}
      />,
    )

    expect(screen.getByText('Assessment preparation')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run preflight' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Realization JSON')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compile validations' })).not.toBeInTheDocument()
  })

  it('does not treat a historical Published status as executable without an active generation', async () => {
    const user = userEvent.setup()
    render(
      <QualityLifecycleControls
        designHash="sha256:design"
        obligations={[]}
        qualityPlanId="plan-1"
        queries={[]}
        revisionId="revision-1"
        revisionStatus="REALIZED"
        validations={[
          { id: 'validation-1', status: 'PUBLISHED', compilationHash: 'sha256:historical', activeGeneration: null },
        ]}
      />,
    )

    await user.type(screen.getByLabelText('Subject digest'), 'sha256:subject')
    await user.type(screen.getByLabelText('Subject authority'), 'artifact://subject')

    expect(screen.getByRole('button', { name: 'Create Assessment' })).toBeDisabled()
    expect(screen.getByText(/historical Published status alone is not sufficient/i)).toBeInTheDocument()
  })

  it('submits an obligation-linked scenario proposal through the shared action', async () => {
    mocks.propose.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    render(
      <QualityLifecycleControls
        designHash={null}
        obligations={[
          {
            id: 'obligation-1',
            title: 'Receipt',
            intent: 'Show a receipt',
            minimumAssurance: 'STANDARD',
            limitations: null,
          },
        ]}
        qualityPlanId="plan-1"
        queries={[]}
        revisionId="revision-1"
        revisionStatus="REQUIREMENTS_APPROVED"
        validations={[]}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Propose scenarios' }))

    await waitFor(() => {
      expect(mocks.propose).toHaveBeenCalledWith(
        expect.objectContaining({ qualityPlanId: 'plan-1', revisionId: 'revision-1', proposal: expect.any(Object) }),
      )
    })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('wires a contract-valid remote binding through scope issuance, preflight, and preparation actions', async () => {
    mocks.createRemoteScope.mockResolvedValue({ success: true, data: { subjectRevisionId: 'remote-subject-1' } })
    mocks.preflight.mockResolvedValue({
      success: true,
      data: {
        algorithmVersion: 'appraise.quality-assessment-preflight/v2',
        scopeIntentHash: 'sha256:scope-intent',
        realizationIntentHash: 'sha256:realization-intent',
        preflightHash: 'sha256:preflight',
      },
    })
    mocks.prepare.mockResolvedValue({ success: true, data: { phase: 'STARTED' } })
    const user = userEvent.setup()
    render(
      <QualityLifecycleControls
        designHash="sha256:design"
        obligations={[]}
        qualityPlanId="plan-1"
        queries={[]}
        revisionId="revision-1"
        revisionStatus="SCENARIOS_APPROVED"
        targetKind="REMOTE_BLACK_BOX"
        validations={[{ id: 'validation-1', status: 'SCENARIO_APPROVED', compilationHash: null }]}
      />,
    )

    expect(screen.getByText(/evaluation scope only/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Subject digest')).not.toBeInTheDocument()
    await user.type(
      screen.getByLabelText('Existing environment ID', { selector: '#prepare-environment' }),
      'environment-1',
    )
    await user.clear(
      screen.getByLabelText('Approved compact validation bindings JSON', { selector: '#prepare-bindings' }),
    )
    await user.paste(approvedRemoteBinding)
    await user.click(screen.getAllByRole('button', { name: 'Create remote evaluation scope' })[0]!)

    await waitFor(() => {
      expect(mocks.createRemoteScope).toHaveBeenCalledWith(
        expect.objectContaining({
          qualityPlanId: 'plan-1',
          revisionId: 'revision-1',
          environmentId: 'environment-1',
          validationBindings: JSON.parse(approvedRemoteBinding),
        }),
      )
    })
    expect(
      screen.getByLabelText('Remote evaluation scope subject ID', { selector: '#prepare-remote-subject' }),
    ).toHaveValue('remote-subject-1')
    await user.click(screen.getByRole('button', { name: 'Run preflight' }))
    await waitFor(() =>
      expect(mocks.preflight).toHaveBeenCalledWith(
        expect.objectContaining({ subject: { subjectRevisionId: 'remote-subject-1' } }),
      ),
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Prepare and launch' })).toBeEnabled()
      expect(screen.getByText(/^Preflight algorithm:/)).toBeInTheDocument()
      expect(screen.getByText(/^Scope intent hash:/)).toBeInTheDocument()
      expect(screen.getByText(/^Realization intent hash:/)).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: 'Prepare and launch' }))
    await waitFor(() =>
      expect(mocks.prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: { subjectRevisionId: 'remote-subject-1' },
          expectedPreflight: {
            algorithmVersion: 'appraise.quality-assessment-preflight/v2',
            preflightHash: 'sha256:preflight',
          },
        }),
      ),
    )
  })

  it('drives a fresh local approved design through compact preflight and canonical preparation', async () => {
    mocks.preflight.mockResolvedValue({ success: true, data: { preflightHash: 'sha256:local-preflight' } })
    mocks.prepare.mockResolvedValue({ success: true, data: { phase: 'STARTED' } })
    const user = userEvent.setup()
    render(
      <QualityLifecycleControls
        designHash="sha256:design"
        obligations={[]}
        qualityPlanId="plan-1"
        queries={[]}
        revisionId="revision-1"
        revisionStatus="SCENARIOS_APPROVED"
        targetKind="LOCAL_WORKSPACE"
        validations={[{ id: 'validation-1', status: 'SCENARIO_APPROVED', compilationHash: null }]}
      />,
    )

    await user.type(
      screen.getByLabelText('Existing environment ID', { selector: '#prepare-environment' }),
      'environment-1',
    )
    await user.clear(
      screen.getByLabelText('Approved compact validation bindings JSON', { selector: '#prepare-bindings' }),
    )
    await user.paste('[]')
    await user.type(screen.getByLabelText('Preparation subject digest'), 'sha256:local-subject')
    await user.type(screen.getByLabelText('Preparation subject authority'), 'artifact://build-1')
    await user.click(screen.getByRole('button', { name: 'Run preflight' }))
    await waitFor(() =>
      expect(mocks.preflight).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: {
            subjectDigest: 'sha256:local-subject',
            authority: 'artifact://build-1',
            subjectKind: 'ARTIFACT',
          },
        }),
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Prepare and launch' }))
    await waitFor(() =>
      expect(mocks.prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: {
            subjectDigest: 'sha256:local-subject',
            authority: 'artifact://build-1',
            subjectKind: 'ARTIFACT',
          },
        }),
      ),
    )
    expect(mocks.prepare.mock.calls.at(-1)?.[0]).not.toHaveProperty('expectedPreflight')
  })
})
