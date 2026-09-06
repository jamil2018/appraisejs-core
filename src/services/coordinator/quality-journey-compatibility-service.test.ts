import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() }))

vi.mock('@/config/db-config', () => ({ default: { qualityPlanRevision: mocks } }))

import { readQualityJourneyCompatibility } from './quality-journey-compatibility-service'

const summary = {
  id: 'revision-1',
  qualityPlanId: 'plan-1',
  revision: 1,
  status: 'SCENARIOS_APPROVED',
  contentHash: 'sha256:revision',
  methodologyId: 'quality-os-core',
  methodologyVersion: '1.0.0',
  methodologyHash: 'sha256:methodology',
  predecessorRevisionId: null,
  approvedAt: new Date('2026-09-01T00:00:00Z'),
  createdAt: new Date('2026-09-01T00:00:00Z'),
  qualityPlan: { id: 'plan-1', title: 'Checkout quality', description: 'Safe summary' },
  _count: {
    requirementSnapshots: 1,
    requirementAnalyses: 1,
    validationDesigns: 1,
    validationVersions: 1,
    assessments: 1,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readQualityJourneyCompatibility', () => {
  it('lists target-scoped revision metadata with bounded pagination and no Journey authority', async () => {
    mocks.count.mockResolvedValue(2)
    mocks.findMany.mockResolvedValue([summary])

    const result = await readQualityJourneyCompatibility({ targetProjectId: 'target-1', offset: 5, limit: 500 })

    expect(result).toMatchObject({
      schema: 'appraise.quality-journey-compatibility/v1',
      schemaVersion: 1,
      compatibility: 'READ_ONLY',
      journeyAuthority: 'NONE',
      reason: 'NO_PROVEN_JOURNEY_LINEAGE',
      page: { offset: 5, limit: 100, maxLimit: 100, total: 2 },
      entries: [
        {
          qualityPlan: { id: 'plan-1', title: 'Checkout quality' },
          revision: { id: 'revision-1', contentHash: 'sha256:revision', status: 'SCENARIOS_APPROVED' },
          counts: { assessments: 1 },
        },
      ],
      detail: null,
    })
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetProjectId: 'target-1' } }))
    expect(Object.keys(mocks)).toEqual(['count', 'findFirst', 'findMany'])
  })

  it('requires an exact target-scoped plan and revision pair for detail without exposing raw JSON', async () => {
    mocks.findFirst.mockResolvedValue({
      ...summary,
      sourceSpecification: '{"credential":"SOURCE-SPECIFICATION-SECRET"}',
      requirementGraphJson: '{"credential":"SECRET-JSON"}',
      requirementSnapshots: [
        {
          id: 'snapshot-1',
          externalRef: 'REQ-1',
          text: 'Checkout accepts cards.',
          kind: 'USER_STORY',
          contentHash: 'sha256:snapshot',
          createdAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
      requirementAnalyses: [
        {
          id: 'analysis-1',
          revision: 1,
          status: 'APPROVED',
          decision: 'APPROVED',
          analysisHash: 'sha256:analysis',
          decisionRationale: 'Complete.',
          decidedBy: 'reviewer',
          decidedAt: null,
          approvedAt: null,
          approvedBy: null,
          approvalHash: null,
          createdAt: new Date('2026-09-01T00:00:00Z'),
          analysisJson: '{"token":"SECRET-JSON"}',
        },
      ],
      validationDesigns: [],
      validationVersions: [],
      assessments: [],
    })

    const result = await readQualityJourneyCompatibility({
      targetProjectId: 'target-1',
      qualityPlanId: 'plan-1',
      revisionId: 'revision-1',
    })

    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { targetProjectId: 'target-1', qualityPlanId: 'plan-1', id: 'revision-1' } }),
    )
    expect(result.detail).toMatchObject({
      requirementSnapshots: [{ id: 'snapshot-1', contentHash: 'sha256:snapshot' }],
      requirementAnalyses: [{ id: 'analysis-1', analysisHash: 'sha256:analysis' }],
    })
    expect(JSON.stringify(result)).not.toContain('SECRET-JSON')
    expect(JSON.stringify(result)).not.toContain('SOURCE-SPECIFICATION-SECRET')
  })

  it('rejects partial, cross-target, and wrong plan/revision detail references', async () => {
    await expect(
      readQualityJourneyCompatibility({ targetProjectId: 'target-1', qualityPlanId: 'plan-1' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    mocks.findFirst.mockResolvedValue(null)
    for (const input of [
      { targetProjectId: 'target-2', qualityPlanId: 'plan-1', revisionId: 'revision-1' },
      { targetProjectId: 'target-1', qualityPlanId: 'wrong-plan', revisionId: 'revision-1' },
    ])
      await expect(readQualityJourneyCompatibility(input)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
