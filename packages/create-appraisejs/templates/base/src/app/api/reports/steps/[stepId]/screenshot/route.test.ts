import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindUnique, mockReadBytes } = vi.hoisted(() => ({ mockFindUnique: vi.fn(), mockReadBytes: vi.fn() }))

vi.mock('@/config/db-config', () => ({ default: { reportStep: { findUnique: mockFindUnique } } }))
vi.mock('@/services/test-run/test-run-artifact-access-service', () => ({
  TestRunArtifactAccessService: class {
    readBytes = mockReadBytes
  },
}))

import { GET } from './route'

describe('report screenshot route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 when the report step is missing', async () => {
    mockFindUnique.mockResolvedValue(null)
    const response = await GET(new Request('http://localhost/api/reports/steps/step-1/screenshot?targetProjectId=p1'), {
      params: Promise.resolve({ stepId: 'step-1' }),
    })
    expect(response.status).toBe(404)
  })

  it('reads the screenshot through the run capsule with target containment', async () => {
    mockFindUnique.mockResolvedValue({
      screenshotPath: 'evidence/shots/step-1.png',
      reportScenario: {
        reportTestCases: [{ testRunTestCaseId: 'trtc-1' }],
        reportFeature: { report: { testRun: { runId: 'run-1', targetProjectId: 'p1' } } },
      },
    })
    mockReadBytes.mockResolvedValue({ bytes: Buffer.from('png'), contentType: 'image/png' })
    const response = await GET(new Request('http://localhost/api/reports/steps/step-1/screenshot?targetProjectId=p1'), {
      params: Promise.resolve({ stepId: 'step-1' }),
    })
    expect(mockReadBytes).toHaveBeenCalledWith({
      runId: 'run-1',
      kind: 'screenshot',
      testCaseId: 'trtc-1',
      storedPath: 'evidence/shots/step-1.png',
      expectedTargetProjectId: 'p1',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
  })
})
