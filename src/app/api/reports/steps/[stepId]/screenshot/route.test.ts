import { Readable } from 'stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAccess, mockCreateReadStream, mockFindUnique } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockCreateReadStream: vi.fn(),
  mockFindUnique: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    access: mockAccess,
  },
  createReadStream: mockCreateReadStream,
}))

vi.mock('@/config/db-config', () => ({
  default: {
    reportStep: {
      findUnique: mockFindUnique,
    },
  },
}))

vi.mock('@/lib/automation/automation-path-roots', () => ({
  resolveStoredPath: vi.fn((storedPath: string) => `/resolved/${storedPath}`),
}))

import { GET } from './route'

describe('report screenshot route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when the report step is missing', async () => {
    mockFindUnique.mockResolvedValue(null)

    const response = await GET(new Request('http://localhost/api/reports/steps/step-1/screenshot'), {
      params: Promise.resolve({ stepId: 'step-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Report step not found' })
  })

  it('returns 404 when the step has no screenshot path', async () => {
    mockFindUnique.mockResolvedValue({ screenshotPath: null })

    const response = await GET(new Request('http://localhost/api/reports/steps/step-1/screenshot'), {
      params: Promise.resolve({ stepId: 'step-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Screenshot not available for this step' })
  })

  it('returns 404 when the screenshot file is missing', async () => {
    mockFindUnique.mockResolvedValue({ screenshotPath: 'shots/step-1.png' })
    mockAccess.mockRejectedValue(new Error('missing'))

    const response = await GET(new Request('http://localhost/api/reports/steps/step-1/screenshot'), {
      params: Promise.resolve({ stepId: 'step-1' }),
    })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Screenshot file not found' })
  })

  it('streams the screenshot when the file exists', async () => {
    mockFindUnique.mockResolvedValue({ screenshotPath: 'shots/step-1.png' })
    mockAccess.mockResolvedValue(undefined)
    mockCreateReadStream.mockReturnValue(Readable.from([Buffer.from('png')]))

    const response = await GET(new Request('http://localhost/api/reports/steps/step-1/screenshot'), {
      params: Promise.resolve({ stepId: 'step-1' }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    await expect(response.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer)
  })
})
