// @vitest-environment jsdom

import { BrowserEngine } from '@prisma/client'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import TestRunForm from './test-run-form'

const { push, toast, checkTestRunNameUniqueAction } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  checkTestRunNameUniqueAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
  }),
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  checkTestRunNameUniqueAction,
}))

vi.mock('@/components/test-suite/test-suite-picker', () => ({
  default: ({
    onSave,
  }: {
    onSave: (value: Array<{ testSuiteId: string; runAll: boolean; testCaseIds: string[] }>) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onSave([
          {
            testSuiteId: 'suite-1',
            runAll: true,
            testCaseIds: [],
          },
        ])
      }
    >
      Pick test suites
    </button>
  ),
}))

describe('TestRunForm', () => {
  it('submits test-suite scoped values and navigates to the created run', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn().mockResolvedValue({
      status: 200,
      data: { id: 'run-1' },
    })

    checkTestRunNameUniqueAction.mockResolvedValue({
      status: 200,
      data: { isUnique: true },
    })

    render(
      <TestRunForm
        defaultValues={{
          name: 'Nightly Smoke',
          environmentId: 'env-1',
          tags: ['tag-1'],
          testWorkersCount: 1,
          browserEngine: BrowserEngine.CHROMIUM,
          testSuites: [{ testSuiteId: 'suite-1', runAll: true, testCaseIds: [] }],
        }}
        successTitle="Test Run Created"
        successMessage="The test run has been created successfully"
        testSuites={[]}
        environments={[{ id: 'env-1', name: 'Staging' } as never]}
        tags={[{ id: 'tag-1', name: 'Smoke' } as never]}
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Pick test suites' }))
    await user.click(screen.getByRole('button', { name: 'Start' }))

    await waitFor(() => {
      expect(onSubmitAction).toHaveBeenCalledWith(
        undefined,
        {
          name: 'Nightly Smoke',
          environmentId: 'env-1',
          tags: [],
          testWorkersCount: 1,
          browserEngine: BrowserEngine.CHROMIUM,
          testSuites: [{ testSuiteId: 'suite-1', runAll: true, testCaseIds: [] }],
        },
        undefined,
      )
    })

    expect(toast).toHaveBeenCalledWith({
      title: 'Test Run Created',
      description: 'The test run has been created successfully',
    })
    expect(push).toHaveBeenCalledWith('/test-runs/run-1')
  })

  it('shows a validation message when tags mode is active without selected tags', async () => {
    const user = userEvent.setup()
    const onSubmitAction = vi.fn()

    render(
      <TestRunForm
        defaultValues={{
          name: 'Tag Run',
          environmentId: 'env-1',
          tags: [],
          testWorkersCount: 1,
          browserEngine: BrowserEngine.CHROMIUM,
          testSuites: [],
        }}
        successTitle="Test Run Created"
        successMessage="The test run has been created successfully"
        testSuites={[]}
        environments={[{ id: 'env-1', name: 'Staging' } as never]}
        tags={[{ id: 'tag-1', name: 'Smoke' } as never]}
        onSubmitAction={onSubmitAction}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(screen.getByText('Tags are required')).toBeInTheDocument()
    expect(onSubmitAction).not.toHaveBeenCalled()
  })
})
