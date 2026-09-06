// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import Page from './page'

const mocks = vi.hoisted(() => ({ project: vi.fn(), read: vi.fn() }))

vi.mock('@/lib/active-project', () => ({ requireActiveProject: mocks.project }))
vi.mock('@/services/coordinator/quality-journey-compatibility-service', () => ({
  readQualityJourneyCompatibility: mocks.read,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('preserves project scope in exact revision history links and uses inert disabled pagination', async () => {
  mocks.project.mockResolvedValue({ id: 'project one' })
  mocks.read.mockResolvedValue({
    compatibility: 'READ_ONLY',
    page: { offset: 0, limit: 40, maxLimit: 100, total: 1 },
    detail: null,
    entries: [
      {
        qualityPlan: { id: 'plan-1', title: 'Checkout', description: null },
        revision: { id: 'revision-1', revision: 1, status: 'SCENARIOS_APPROVED' },
        counts: { validationVersions: 1, assessments: 1 },
      },
    ],
  })

  render(await Page({ searchParams: Promise.resolve({ project: 'project one' }) }))

  expect(mocks.read).toHaveBeenCalledWith({ targetProjectId: 'project one', offset: 0 })
  expect(screen.getByRole('link', { name: 'Inspect history' })).toHaveAttribute(
    'href',
    '/quality-journeys/compatibility?project=project+one&qualityPlanId=plan-1&revisionId=revision-1',
  )
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
})

it('renders read-only detail records without a Journey upgrade control', async () => {
  mocks.project.mockResolvedValue({ id: 'project' })
  mocks.read.mockResolvedValue({
    compatibility: 'READ_ONLY',
    page: { offset: 0, limit: 40, maxLimit: 100, total: 1 },
    entries: [],
    detail: {
      qualityPlan: { id: 'plan-1', title: 'Checkout' },
      revision: { id: 'revision-1', revision: 1, status: 'SCENARIOS_APPROVED', contentHash: 'sha256:revision' },
      requirementSnapshots: [{ id: 'snapshot-1', text: 'Card payment', contentHash: 'sha256:snapshot' }],
      requirementAnalyses: [],
      validationDesigns: [],
      validationVersions: [],
      assessments: [],
    },
  })

  render(
    await Page({
      searchParams: Promise.resolve({ project: 'project', qualityPlanId: 'plan-1', revisionId: 'revision-1' }),
    }),
  )

  expect(screen.getByText('No proven Journey lineage. This projection transfers no Journey authority.')).toBeVisible()
  expect(screen.getByText('Card payment')).toBeVisible()
  expect(screen.queryByRole('button', { name: /upgrade|create journey/i })).not.toBeInTheDocument()
})
