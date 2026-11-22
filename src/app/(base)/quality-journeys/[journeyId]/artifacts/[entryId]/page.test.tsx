// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ project: vi.fn(), artifact: vi.fn(), notFound: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-artifact-library-service', () => ({
  getQualityJourneyLibraryArtifact: mocks.artifact,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    mocks.notFound()
    throw new Error('NEXT_NOT_FOUND')
  },
}))

import Page from './page'

describe('Journey artifact detail', () => {
  it.each(['CLOSURE%3Aone', 'CLOSURE:one'])('inspects %s within the selected project', async entryId => {
    mocks.project.mockResolvedValue({ id: 'project one' })
    mocks.artifact.mockResolvedValue({
      entry: { entryId: 'CLOSURE:one', kind: 'JOURNEY_CLOSURE', title: 'Closure receipt' },
    })

    render(
      await Page({
        params: Promise.resolve({ journeyId: 'journey', entryId }),
        searchParams: Promise.resolve({ project: 'project one' }),
      }),
    )

    expect(mocks.artifact).toHaveBeenCalledWith({
      journeyId: 'journey',
      targetProjectId: 'project one',
      entryId: 'CLOSURE:one',
    })
    expect(screen.getByRole('link', { name: 'Back to artifact library' })).toHaveAttribute(
      'href',
      '/quality-journeys/journey/artifacts?project=project%20one',
    )
    expect(screen.getByRole('heading', { name: 'Closure receipt' })).toBeInTheDocument()
  })

  it('rejects malformed URI escapes before reading an artifact', async () => {
    await expect(
      Page({
        params: Promise.resolve({ journeyId: 'journey', entryId: 'CLOSURE%invalid' }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mocks.notFound).toHaveBeenCalledOnce()
    expect(mocks.artifact).not.toHaveBeenCalled()
  })
})
