// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { QualityLifecycleControls } from './quality-lifecycle-controls'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn(), propose: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../quality-design-actions', () => ({
  answerQualityRequirementQueriesAction: vi.fn(),
  approveQualityValidationDesignAction: vi.fn(),
  compileQualityValidationsAction: vi.fn(),
  createQualityAssessmentAction: vi.fn(),
  proposeQualityValidationDesignAction: mocks.propose,
  publishQualityValidationsAction: vi.fn(),
}))

describe('QualityLifecycleControls', () => {
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
})
