import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  environment: { findMany: vi.fn() },
  module: { findMany: vi.fn() },
  locatorGroup: { findMany: vi.fn() },
}))
vi.mock('@/config/db-config', () => ({ default: db }))

import {
  assertDiscoveryPrerequisites,
  getQualityJourneyDiscoveryPrerequisites,
} from './quality-journey-discovery-prerequisites'

beforeEach(() => {
  vi.clearAllMocks()
  db.environment.findMany.mockResolvedValue([])
  db.module.findMany.mockResolvedValue([])
  db.locatorGroup.findMany.mockResolvedValue([])
})

describe('Discovery setup prerequisites', () => {
  it('reports each missing registry and its repair in a fresh project', async () => {
    const prerequisites = await getQualityJourneyDiscoveryPrerequisites('new-project')
    expect(prerequisites).toEqual({ ready: false, missing: ['environment', 'module', 'locator-group'] })
    expect(() => assertDiscoveryPrerequisites(prerequisites)).toThrow(
      /active environment.*destination module.*registered route/,
    )
    try {
      assertDiscoveryPrerequisites(prerequisites)
    } catch (error) {
      expect(error).toMatchObject({ code: 'CONFLICT', details: { missingDiscoverySetup: prerequisites.missing } })
    }
  })

  it('requires an active environment and module in the exact project and an active route group in an active module', async () => {
    await getQualityJourneyDiscoveryPrerequisites('project-b')
    expect(db.environment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetProjectId: 'project-b', archivedAt: null },
      }),
    )
    expect(db.module.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetProjectId: 'project-b', archivedAt: null },
      }),
    )
    expect(db.locatorGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          targetProjectId: 'project-b',
          archivedAt: null,
          module: { targetProjectId: 'project-b', archivedAt: null },
        },
      }),
    )
  })

  it('allows readiness with explicit project setup and without any pre-authored locators', async () => {
    db.environment.findMany.mockResolvedValue([{ id: 'environment' }])
    db.module.findMany.mockResolvedValue([{ id: 'module' }])
    db.locatorGroup.findMany.mockResolvedValue([{ id: 'group', route: '/login', moduleId: 'module' }])
    const prerequisites = await getQualityJourneyDiscoveryPrerequisites('project')
    expect(prerequisites).toEqual({ ready: true, missing: [] })
    expect(() => assertDiscoveryPrerequisites(prerequisites)).not.toThrow()
  })
})
