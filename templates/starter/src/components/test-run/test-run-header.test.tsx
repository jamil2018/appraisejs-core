// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react'
import { TestRunResult, TestRunStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestRunHeader } from './test-run-header'
import type { TestRunDetailsData } from './test-run-details-helpers'

const { getTestRunByIdAction } = vi.hoisted(() => ({
  getTestRunByIdAction: vi.fn(),
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  getTestRunByIdAction,
}))

vi.mock('motion/react', () => import('@/test/motion-react-vitest-mocks').then(m => m.motionReactVitestMock))
vi.mock('motion/react-m', () => import('@/test/motion-react-vitest-mocks').then(m => m.motionReactMVitestMock))

function createTestRun(overrides?: Partial<TestRunDetailsData>): TestRunDetailsData {
  return {
    id: 'run-db-id',
    runId: 'run-1',
    name: 'Nightly run',
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
    testCases: [],
    tags: [],
    environment: {
      id: 'env-1',
      name: 'Staging',
      baseUrl: 'https://example.com',
      apiBaseUrl: null,
      username: null,
      password: null,
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
        completedAt: new Date('2024-01-01T00:00:10.000Z'),
        reports: [
          {
            id: 'report-1',
            name: 'Nightly report',
            description: null,
            reportPath: null,
            testRunId: 'run-db-id',
            createdAt: new Date('2024-01-01T00:00:10.000Z'),
            updatedAt: new Date('2024-01-01T00:00:10.000Z'),
          },
        ],
      }),
    })

    render(
      <TestRunHeader
        initialTestRun={createTestRun({
          status: TestRunStatus.COMPLETED,
          result: TestRunResult.PASSED,
          completedAt: new Date('2024-01-01T00:00:10.000Z'),
        })}
      />,
    )

    expect(screen.getByRole('button', { name: /generating report/i })).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByRole('button', { name: /view report/i })).toBeInTheDocument()
  })
})
