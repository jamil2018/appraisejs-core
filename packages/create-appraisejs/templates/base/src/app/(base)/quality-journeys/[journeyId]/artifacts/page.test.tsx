// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import Page from './page'
const mocks = vi.hoisted(() => ({ project: vi.fn(), list: vi.fn() }))
vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-artifact-library-service', () => ({
  listQualityJourneyArtifactLibrary: mocks.list,
}))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('preserves project and kind scope through inspection, export, and pagination', async () => {
  mocks.project.mockResolvedValue({ id: 'project one' })
  mocks.list.mockResolvedValue({
    kinds: ['JOURNEY_CLOSURE'],
    total: 100,
    offset: 40,
    limit: 40,
    entries: [
      {
        entryId: 'CLOSURE:one',
        kind: 'JOURNEY_CLOSURE',
        title: 'Closure receipt',
        sourceContentHash: 'sha256:receipt',
        createdAt: new Date('2026-09-05T00:00:00Z'),
      },
    ],
  })
  render(
    await Page({
      params: Promise.resolve({ journeyId: 'journey' }),
      searchParams: Promise.resolve({ project: 'project one', kind: 'JOURNEY_CLOSURE', offset: '40' }),
    }),
  )
  expect(mocks.list).toHaveBeenCalledWith({
    journeyId: 'journey',
    targetProjectId: 'project one',
    kind: 'JOURNEY_CLOSURE',
    offset: 40,
  })
  expect(screen.getByRole('link', { name: 'Inspect' })).toHaveAttribute(
    'href',
    '/quality-journeys/journey/artifacts/CLOSURE%3Aone?project=project%20one',
  )
  expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
    'href',
    '/quality-journeys/journey/artifacts?project=project+one&kind=JOURNEY_CLOSURE&offset=80',
  )
  expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute(
    'href',
    '/quality-journeys/journey/artifacts?project=project+one&kind=JOURNEY_CLOSURE&offset=0',
  )
  expect(screen.getByRole('link', { name: 'Export JSON' })).toHaveAttribute(
    'href',
    '/quality-journeys/journey/artifacts/export?project=project%20one',
  )
})
it('shows an empty history and normalizes an invalid offset', async () => {
  mocks.project.mockResolvedValue({ id: 'project' })
  mocks.list.mockResolvedValue({ kinds: [], total: 0, offset: 0, limit: 40, entries: [] })
  render(
    await Page({ params: Promise.resolve({ journeyId: 'journey' }), searchParams: Promise.resolve({ offset: '-2' }) }),
  )
  expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }))
  expect(screen.getByText('No matching artifacts')).toBeVisible()
  expect(screen.getByText('0 artifacts')).toBeVisible()
})
