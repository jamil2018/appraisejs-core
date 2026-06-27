import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getAllEnvironmentsAction } from '@/actions/environments/environment-actions'
import { getAllTagsAction } from '@/actions/tags/tag-actions'
import { getAllTestSuiteTestCasesAction } from '@/actions/test-run/test-run-actions'

import { loadCreateTestRunPageData } from './create-test-run-page-data'

vi.mock('@/actions/environments/environment-actions', () => ({
  getAllEnvironmentsAction: vi.fn(),
}))

vi.mock('@/actions/tags/tag-actions', () => ({
  getAllTagsAction: vi.fn(),
}))

vi.mock('@/actions/test-run/test-run-actions', () => ({
  getAllTestSuiteTestCasesAction: vi.fn(),
}))

const getAllEnvironmentsActionMock = vi.mocked(getAllEnvironmentsAction)
const getAllTagsActionMock = vi.mocked(getAllTagsAction)
const getAllTestSuiteTestCasesActionMock = vi.mocked(getAllTestSuiteTestCasesAction)

describe('loadCreateTestRunPageData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when environment loading fails', async () => {
    getAllEnvironmentsActionMock.mockResolvedValue({ status: 500, error: 'env failed' })
    getAllTagsActionMock.mockResolvedValue({ status: 200, data: [] })

    await expect(loadCreateTestRunPageData()).resolves.toEqual({
      status: 'error',
      message: 'env failed',
    })
  })

  it('returns success when all loaders succeed', async () => {
    getAllEnvironmentsActionMock.mockResolvedValue({
      data: [{ id: 'env-1', name: 'Staging', createdAt: new Date(), updatedAt: new Date() }],
      status: 200,
    })
    getAllTagsActionMock.mockResolvedValue({
      data: [{ id: 'tag-1', name: 'smoke', createdAt: new Date(), updatedAt: new Date() }],
      status: 200,
    })
    getAllTestSuiteTestCasesActionMock.mockResolvedValue({ status: 200, data: [] })

    const result = await loadCreateTestRunPageData()

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.environments).toHaveLength(1)
      expect(result.tags).toHaveLength(1)
      expect(result.testSuites).toEqual([])
    }
  })
})
