// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AssessmentExecutionControls } from './assessment-execution-controls'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), toast: vi.fn(), run: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }))
vi.mock('../../quality-plans/quality-design-actions', () => ({
  reconcileQualityAssessmentAction: vi.fn(),
  runQualityAssessmentAction: mocks.run,
  stopQualityAssessmentAction: vi.fn(),
}))

describe('AssessmentExecutionControls', () => {
  it('runs every immutable published matrix cell for a READY Assessment', async () => {
    mocks.run.mockResolvedValue({ success: true })
    const user = userEvent.setup()
    const runtimeCells = [
      {
        validationVersionId: 'validation-1',
        resultMatrixCell: 'FIREFOX:environment-1',
        environmentId: 'environment-1',
        browserEngine: 'FIREFOX' as const,
      },
    ]
    render(
      <AssessmentExecutionControls
        assessmentId="assessment-1"
        blockers={[]}
        ready
        runtimeCells={runtimeCells}
        status="READY"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Run complete matrix' }))

    await waitFor(() => {
      expect(mocks.run).toHaveBeenCalledWith(
        expect.objectContaining({
          assessmentId: 'assessment-1',
          runtime: { cells: runtimeCells },
        }),
      )
    })
    expect(mocks.refresh).toHaveBeenCalled()
  })
})
