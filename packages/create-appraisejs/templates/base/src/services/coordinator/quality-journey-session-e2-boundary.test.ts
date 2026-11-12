import type { Prisma, PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./quality-journey-provider-recovery', () => ({
  assertProviderEffectsQuiescent: vi.fn(async () => undefined),
}))

import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import {
  activateQualityJourneyCoordinatorSession,
  transferQualityJourneyCoordinatorSession,
  type ActivateQualityJourneyCoordinatorSessionInput,
} from './quality-journey-session-service'

const journey = () => ({ id: 'journey', targetProjectId: 'target',
  hostingMode: 'APP_SERVER_LOCAL_V1', hostingContractVersion: 1, currentCoordinatorSessionId: null,
  ownershipVersion: 2, e2AdmissionVersion: 4, stateHash: 'state',
  updatedAt: new Date('2026-01-01T00:00:00.000Z') })
const successor = () => ({ id: 'successor', journeyId: 'journey', targetProjectId: 'target',
  ownerPrincipalId: 'principal', hostKind: 'APP_SERVER_LOCAL_V1', status: 'REGISTERED',
  generation: null, fencedAt: null, transitionRequestId: null,
  e2EnrollmentKind: null, e2EnrollmentDigest: null, e2EnrolledAt: null })
const input = (): ActivateQualityJourneyCoordinatorSessionInput => ({
  journeyId: 'journey', targetProjectId: 'target',
  coordinatorSessionId: 'successor', authority: trustedHumanCoordinatorSession,
  coordinatorPrincipalId: 'principal', requestId: 'request', expectedOwnershipVersion: 2,
  expectedStateHash: 'state', approvedBy: 'local-ui' as const })

function fixture(overrides: { journey?: Record<string, unknown>;
  successor?: Record<string, unknown>; predecessor?: Record<string, unknown> } = {}) {
  const current = { ...journey(), ...overrides.journey }
  const next = { ...successor(), ...overrides.successor }
  const previous = overrides.predecessor
  const ownershipUpdate = vi.fn(async () => ({ count: 1 }))
  const sessionUpdate = vi.fn(async () => next)
  const tx = {
    qualityJourney: {
      findFirst: vi.fn(async () => current), updateMany: ownershipUpdate,
    },
    qualityJourneyCoordinatorSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === next.id ? next : where.id === previous?.id ? previous : null),
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _max: { generation: previous ? 1 : null } })),
      update: sessionUpdate,
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    qualityJourneyCoordinatorHandoff: {
      count: vi.fn(async () => 0), aggregate: vi.fn(async () => ({ _max: { generation: null } })),
    },
    qualityJourneyWorkAttempt: { findMany: vi.fn(async () => []) },
    qualityJourneyOwnedBrowser: { findMany: vi.fn(async () => []) },
    qualityJourneyExecutionCycle: { findFirst: vi.fn(async () => null) },
    qualityJourneyExecutionTestRun: { count: vi.fn(async () => 0) },
  }
  const client = { $transaction: async <T>(callback: (transaction: Prisma.TransactionClient) => Promise<T>) =>
    callback(tx as unknown as Prisma.TransactionClient) } as unknown as PrismaClient
  return { client, tx, ownershipUpdate, sessionUpdate }
}

describe('M03 ownership transitions with the E2 admission version', () => {
  it('keeps all-null legacy activation and advances both versions in the same Journey CAS', async () => {
    const f = fixture()
    const result = await activateQualityJourneyCoordinatorSession(input(), f.client)
    expect(result).toMatchObject({ coordinatorSessionId: 'successor',
      coordinatorGeneration: 1, ownershipVersion: 3 })
    expect(f.ownershipUpdate).toHaveBeenCalledTimes(1)
    expect(f.ownershipUpdate).toHaveBeenCalledWith({
      where: expect.objectContaining({ currentCoordinatorSessionId: null,
        ownershipVersion: 2, e2AdmissionVersion: 4 }),
      data: expect.objectContaining({ ownershipVersion: { increment: 1 },
        e2AdmissionVersion: { increment: 1 } }),
    })
    expect(f.sessionUpdate).toHaveBeenCalledTimes(1)
  })

  it('refuses corrupt or E2-enrolled successors before ownership is mutated', async () => {
    for (const enrollment of [
      { e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: null, e2EnrolledAt: null },
      { e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: 'a'.repeat(64),
        e2EnrolledAt: new Date('2026-01-01T00:00:00.000Z') },
    ]) {
      const f = fixture({ successor: enrollment })
      await expect(activateQualityJourneyCoordinatorSession(input(), f.client))
        .rejects.toMatchObject({ code: 'CONFLICT' })
      expect(f.ownershipUpdate).not.toHaveBeenCalled()
      expect(f.sessionUpdate).not.toHaveBeenCalled()
    }
  })

  it('refuses E2 predecessor transfer until private retirement effectiveness can be proved', async () => {
    const f = fixture({ journey: { currentCoordinatorSessionId: 'predecessor' },
      predecessor: { id: 'predecessor', journeyId: 'journey', targetProjectId: 'target',
        ownerPrincipalId: 'principal', hostKind: 'APP_SERVER_LOCAL_V1',
        generation: 1, status: 'ACTIVE', fencedAt: null,
        e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: 'a'.repeat(64),
        e2EnrolledAt: new Date('2026-01-01T00:00:00.000Z') } })
    const transfer = { ...input(), successorSessionId: 'successor',
      predecessorSessionId: 'predecessor', predecessorGeneration: 1,
      reconciliationReceiptId: 'receipt' }
    await expect(transferQualityJourneyCoordinatorSession(transfer, f.client))
      .rejects.toThrow(/retirement effectiveness evidence/)
    expect(f.ownershipUpdate).not.toHaveBeenCalled()
    expect(f.sessionUpdate).not.toHaveBeenCalled()
  })

  it('refuses a corrupt admission version rather than wrapping or omitting the CAS', async () => {
    const f = fixture({ journey: { e2AdmissionVersion: 2_147_483_647 } })
    await expect(activateQualityJourneyCoordinatorSession(input(), f.client))
      .rejects.toThrow(/E2 admission version/)
    expect(f.ownershipUpdate).not.toHaveBeenCalled()
  })
})
