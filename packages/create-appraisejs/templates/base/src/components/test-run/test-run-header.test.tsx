// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { TestRunResult, TestRunStatus, TestRunTestCaseResult } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestRunHeader } from './test-run-header'
import type { TestRunDetailsData } from './test-run-details-helpers'

const { getTestRunByIdAction } = vi.hoisted(() => ({
  getTestRunByIdAction: vi.fn(),
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  getTestRunByIdAction,
}))

import '@/test/setup-motion-react-mocks'

const completedRunAt = new Date('2024-01-01T00:00:10.000Z')

function createTestRun(overrides?: Partial<TestRunDetailsData>): TestRunDetailsData {
  return {
    id: 'run-db-id',
    runId: 'run-1',
    targetProjectId: 'project-1',
    name: 'Nightly run',
    startedAt: new Date('2024-01-01T00:00:00.000Z'),
    completedAt: null,
    status: TestRunStatus.RUNNING,
    result: TestRunResult.PENDING,
    evidenceHealth: 'valid',
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    environmentId: 'env-1',
    testWorkersCount: 2,
    browserEngine: 'CHROMIUM',
    logPath: null,
    reportPath: null,
    testCases: [],
    tags: [],
    environment: {
      id: 'env-1',
      name: 'Staging',
      baseUrl: 'https://example.com',
      apiBaseUrl: null,
      username: null,
      passwordEnvironmentVariable: null,
      credentialState: 'NONE',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    reports: [],
    ...overrides,
  } as TestRunDetailsData
}

describe('TestRunHeader', () => {
  beforeEach(() => {
    vi.useRealTimers()
    getTestRunByIdAction.mockReset()
  })

  it('refreshes report state after a completed run publishes a report', async () => {
    vi.useFakeTimers()
    getTestRunByIdAction.mockResolvedValue({
      status: 200,
      data: createTestRun({
        status: TestRunStatus.COMPLETED,
        result: TestRunResult.PASSED,
        completedAt: completedRunAt,
        reports: [
          {
            id: 'report-1',
            name: 'Nightly report',
            description: null,
            reportPath: null,
            testRunId: 'run-db-id',
            targetProjectId: 'project-1',
            createdAt: completedRunAt,
            updatedAt: completedRunAt,
          },
        ],
      }),
    })

    const initialTestRun = createTestRun({
      status: TestRunStatus.COMPLETED,
      result: TestRunResult.PASSED,
      completedAt: completedRunAt,
    })

    render(<TestRunHeader initialTestRun={initialTestRun} />)

    expect(screen.getByRole('button', { name: /generating report/i })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByRole('link', { name: /view report/i })).toBeInTheDocument()
  })

  it('shows recorded failure and scopes the Journey action to the run', () => {
    render(
      <TestRunHeader
        initialTestRun={createTestRun({
          status: TestRunStatus.COMPLETED,
          result: TestRunResult.FAILED,
          testCases: [
            {
              id: 'case-1',
              result: TestRunTestCaseResult.FAILED,
              testCase: { title: 'Guest checkout', description: 'Checkout flow' },
            },
          ] as never,
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Run failed' })).toBeInTheDocument()
    expect(screen.getByText('Guest checkout')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Use in a Journey' })).toHaveAttribute(
      'href',
      '/quality-journeys/new?record=run-db-id&kind=test-run&project=project-1',
    )
  })

  it('labels unexecuted cases as pending while a run is queued', () => {
    render(
      <TestRunHeader
        initialTestRun={createTestRun({
          status: TestRunStatus.QUEUED,
          testCases: [
            {
              id: 'case-2',
              result: TestRunTestCaseResult.UNTESTED,
              testCase: { title: 'Search', description: 'Search flow' },
            },
          ] as never,
        })}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Run result pending' })).toBeInTheDocument()
    expect(screen.getByText('0 passed · 0 failed · 1 pending')).toBeInTheDocument()
  })
})
