import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ServiceError } from '@/services/shared/errors'

const mocks = vi.hoisted(() => ({
  listReports: vi.fn(),
  requireActiveProjectForMutation: vi.fn(),
}))

vi.mock('@/services/report/report-service', () => ({
  getAllTestCaseMetricsForFilter: vi.fn(),
  getAllTestSuiteMetricsForFilter: vi.fn(),
  getReportByIdOrThrow: vi.fn(),
  listReports: mocks.listReports,
}))
vi.mock('@/lib/active-project', () => ({
  requireActiveProjectForMutation: mocks.requireActiveProjectForMutation,
}))

import { getAllReportsAction } from './report-actions'

describe('getAllReportsAction', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('returns the expected project-selection response without logging a console error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.requireActiveProjectForMutation.mockRejectedValue(
      new ServiceError('Select an active project before accessing project data.', 'VALIDATION', 400),
    )

    await expect(getAllReportsAction()).resolves.toEqual({
      status: 400,
      success: false,
      error: 'Select an active project before accessing project data.',
    })
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('continues logging unexpected report failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failure = new Error('database unavailable')
    mocks.requireActiveProjectForMutation.mockRejectedValue(failure)

    await expect(getAllReportsAction()).resolves.toMatchObject({ status: 500, success: false })
    expect(consoleError).toHaveBeenCalledWith('[ReportActions] Error fetching all reports:', failure)
  })
})
