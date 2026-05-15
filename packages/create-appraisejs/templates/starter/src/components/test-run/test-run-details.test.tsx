// @vitest-environment jsdom

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  TestRunResult,
  TestRunStatus,
  TestRunTestCaseResult,
  TestRunTestCaseStatus,
} from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestRunDetails } from './test-run-details'
import type { TestRunDetailsData } from './test-run-details-helpers'

const {
  getTestRunByIdAction,
  spawnTraceViewerAction,
  checkTraceViewerStatusAction,
  cancelTestRunAction,
  toast,
} = vi.hoisted(() => ({
  getTestRunByIdAction: vi.fn(),
  spawnTraceViewerAction: vi.fn(),
  checkTraceViewerStatusAction: vi.fn(),
  cancelTestRunAction: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  getTestRunByIdAction,
  spawnTraceViewerAction,
  checkTraceViewerStatusAction,
  cancelTestRunAction,
}))

vi.mock('@/hooks/use-toast', () => ({
  toast,
}))

import '@/test/setup-motion-react-mocks'

function createTestRunDetails(overrides?: Partial<TestRunDetailsData>): TestRunDetailsData {
  return {
    id: 'run-db-id',
    name: 'Nightly run',
    runId: 'run-1',
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    completedAt: null,
    status: TestRunStatus.RUNNING,
    result: TestRunResult.PENDING,
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    environmentId: 'env-1',
    testWorkersCount: 2,
    browserEngine: 'CHROMIUM',
    logPath: null,
    reportPath: null,
    testCases: [
      {
        id: 'tc-1',
        testRunId: 'run-db-id',
        testCaseId: 'case-1',
        testSuiteId: 'suite-1',
        status: TestRunTestCaseStatus.PENDING,
        result: TestRunTestCaseResult.UNTESTED,
        tracePath: 'trace.zip',
        testCase: {
          title: 'Login test',
          description: 'Checks login',
        },
        testSuite: {
          id: 'suite-1',
          name: 'Smoke',
        },
      },
    ],
    tags: [
      {
        id: 'tag-1',
        name: 'smoke',
      },
    ],
    environment: {
      id: 'env-1',
      name: 'Staging',
    },
    reports: [],
    ...overrides,
  } as TestRunDetailsData
}

describe('TestRunDetails', () => {
  beforeEach(() => {
    vi.useRealTimers()
    getTestRunByIdAction.mockReset()
    spawnTraceViewerAction.mockReset()
    checkTraceViewerStatusAction.mockReset()
    cancelTestRunAction.mockReset()
    toast.mockReset()
  })

  it('polls a running run and updates the UI when it completes', async () => {
    vi.useFakeTimers()

    getTestRunByIdAction.mockResolvedValue({
      status: 200,
      data: createTestRunDetails({
        status: TestRunStatus.COMPLETED,
        result: TestRunResult.PASSED,
        completedAt: new Date('2024-01-01T00:00:10.000Z'),
        testCases: [
          {
            ...createTestRunDetails().testCases[0],
            status: TestRunTestCaseStatus.COMPLETED,
            result: TestRunTestCaseResult.PASSED,
          },
        ],
      }),
    })

    render(<TestRunDetails testRun={createTestRunDetails()} />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByText('Finished')).toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
    expect(screen.getByText('1 of 1 tests finished')).toBeInTheDocument()
  })

  it('handles trace viewer launches and cancellation actions', async () => {
    const user = userEvent.setup()

    spawnTraceViewerAction.mockResolvedValue({ status: 200, message: 'opened' })
    cancelTestRunAction.mockResolvedValue({ status: 200, message: 'Cancelled successfully' })
    checkTraceViewerStatusAction.mockResolvedValue({ status: 200, data: { isRunning: true } })

    render(
      <TestRunDetails
        testRun={createTestRunDetails({
          testCases: [
            {
              ...createTestRunDetails().testCases[0],
              status: TestRunTestCaseStatus.COMPLETED,
              result: TestRunTestCaseResult.FAILED,
            },
          ],
        })}
      />,
    )

    await user.click(screen.getByRole('button', { name: /view trace/i }))

    await waitFor(() => {
      expect(spawnTraceViewerAction).toHaveBeenCalledWith('run-1', 'tc-1')
    })

    await user.click(screen.getByRole('button', { name: /cancel run/i }))

    await waitFor(() => {
      expect(cancelTestRunAction).toHaveBeenCalledWith('run-1')
      expect(toast).toHaveBeenCalledWith({
        title: 'Test run cancelled',
        description: 'Cancelled successfully',
      })
    })
  })
})
