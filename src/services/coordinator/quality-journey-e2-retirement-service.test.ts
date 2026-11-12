import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { e2CampaignPolicyDigest } from '@/lib/quality-journey/e2-campaign-policy-contract'

import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import {
  assertE2BusinessAdmission,
  commitE2RetirementRequest,
  type E2BusinessScope,
  type E2RetirementScope,
} from './quality-journey-e2-retirement-service'

const digest = 'a'.repeat(64)
const sample = new Date('2026-10-24T00:00:00.000Z')
const policy = {
  id: 'policy', allocationDigest: 'b'.repeat(64), journeyId: 'journey', targetProjectId: 'target',
  sourceTupleDigest: digest, policyVersion: 'M06_E2_CAMPAIGN_POLICY_V1', policyDigest: '', createdAt: sample,
  nativeStartWindowMs: 1000, dnsWindowMs: 1000, tcpWindowMs: 1000, tlsWindowMs: 1000,
  upgradeWindowMs: 1000, providerRequestWindowMs: 1000, mcpCallWindowMs: 1000,
  actorMaxOperations: 32, actorMaxBytes: 8_388_608, actorMaxFrames: 512, actorMaxSetup: 4,
  actorMaxProviderRequests: 5, actorMaxMcpCalls: 16, journeyMaxNativeStarts: 6, journeyMaxTurnStarts: 5,
  maxNativeStarts: 6, maxProviderRequests: 5, maxOperations: 192, maxBytes: 50_331_648,
  maxFrames: 3072, maxSetup: 24, maxMcpCalls: 96, nativeStartsReserved: 0,
  providerRequestsReserved: 0, operationsReserved: 0, bytesReserved: 0, framesReserved: 0,
  setupReserved: 0, mcpCallsReserved: 0, version: 0,
}
policy.policyDigest = e2CampaignPolicyDigest(policy)
const credentials = {
  journeyId: 'journey', targetProjectId: 'target', coordinatorSessionId: 'session',
  coordinatorGeneration: 2, coordinatorPrincipalId: 'principal',
}
const business: E2BusinessScope = {
  journeyId: 'journey', targetProjectId: 'target', coordinatorSessionId: 'session',
  generation: 2, credentials,
}
const retirement: E2RetirementScope = {
  journeyId: 'journey', targetProjectId: 'target', coordinatorSessionId: 'session',
  generation: 2, requestId: 'request-1', requestedAt: sample,
  authority: { kind: 'CURRENT_SESSION', credentials },
}

function mockTransaction(options: { legacy?: boolean; orphan?: boolean; missing?: boolean;
  partial?: boolean; loseAdmissionCas?: boolean; missingPolicy?: boolean; missingPolicyJoin?: boolean; foreignPolicy?: boolean } = {}) {
  const journey = {
    id: 'journey', targetProjectId: 'target', currentCoordinatorSessionId: 'session',
    hostingMode: 'APP_SERVER_LOCAL_V1', hostingContractVersion: 1, ownershipVersion: 4, e2AdmissionVersion: 7,
    status: 'ACTIVE',
  }
  const session = {
    id: 'session', journeyId: 'journey', targetProjectId: 'target',
    generation: 2, status: 'ACTIVE', fencedAt: null, hostKind: 'APP_SERVER_LOCAL_V1',
    ownerPrincipalId: 'principal', e2EnrollmentKind: options.legacy ? null : 'E2_V1',
    e2EnrollmentDigest: options.legacy || options.partial ? null : options.foreignPolicy ? 'f'.repeat(64) : digest,
    e2EnrolledAt: options.legacy ? null : sample,
  }
  const row = {
    id: 'retirement', journeyId: 'journey', targetProjectId: 'target',
    coordinatorSessionId: 'session', generation: 2, state: 'ACTIVE',
    requestId: null as string | null, requestedAt: null as Date | null,
    requestReason: null as string | null, effectiveAt: null as Date | null,
    effectiveEvidenceDigest: null as string | null, version: 0,
    campaignPolicyId: options.missingPolicyJoin ? null : policy.id,
  }
  const updateJourney = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
    if (options.loseAdmissionCas || where.id !== journey.id || where.targetProjectId !== journey.targetProjectId ||
      where.currentCoordinatorSessionId !== journey.currentCoordinatorSessionId ||
      where.ownershipVersion !== journey.ownershipVersion || where.e2AdmissionVersion !== journey.e2AdmissionVersion ||
      where.status !== journey.status) return { count: 0 }
    journey.e2AdmissionVersion += 1
    return { count: 1 }
  })
  const updateRetirement = vi.fn(async ({ where, data }: {
    where: Record<string, unknown>; data: Record<string, unknown>
  }) => {
    if (where.id !== row.id || where.state !== row.state || where.version !== row.version) return { count: 0 }
    row.state = data.state as string
    row.requestId = data.requestId as string
    row.requestedAt = data.requestedAt as Date
    row.requestReason = data.requestReason as string
    row.version += 1
    return { count: 1 }
  })
  const tx = {
    qualityJourney: {
      findFirst: vi.fn(async () => structuredClone(journey)),
      updateMany: updateJourney,
    },
    qualityJourneyCoordinatorSession: { findUnique: vi.fn(async () => structuredClone(session)) },
    qualityJourneyE2Retirement: {
      findMany: vi.fn(async () => structuredClone(options.missing ? [] : options.legacy && !options.orphan ? [] : [row])),
      updateMany: updateRetirement,
    },
    qualityJourneyE2CampaignPolicy: { findUnique: vi.fn(async () => options.missingPolicy ? null : { ...policy }) },
  } as unknown as Prisma.TransactionClient
  return { tx, journey, session, row, updateJourney, updateRetirement }
}

describe('E2 transaction-local retirement and business fence', () => {
  it('contends on the Journey version before an E2 business write and refuses after request', async () => {
    const mock = mockTransaction()
    expect(await assertE2BusinessAdmission(mock.tx, business)).toEqual({
      kind: 'E2_V1', admissionVersion: 8,
    })
    expect(mock.updateJourney).toHaveBeenCalledTimes(1)
    const request = await commitE2RetirementRequest(mock.tx, retirement, 'PAUSE')
    expect(request).toMatchObject({ status: 'RETIRE_REQUESTED', admissionVersion: 9,
      receipt: { requestId: 'request-1', requestedAt: sample, requestReason: 'PAUSE' } })
    expect(mock.row.state).toBe('RETIRE_REQUESTED')
    await expect(assertE2BusinessAdmission(mock.tx, business)).rejects.toThrow('business admission retired')
    expect(mock.updateJourney).toHaveBeenCalledTimes(2)
  })

  it('returns the immutable first request on repeated invalidation without another write', async () => {
    const mock = mockTransaction()
    const first = await commitE2RetirementRequest(mock.tx, retirement, 'PAUSE')
    const repeated = await commitE2RetirementRequest(mock.tx, {
      ...retirement, requestId: 'request-2', requestedAt: new Date('2026-10-24T00:00:01.000Z'),
    }, 'REVOKE')
    if (first.status !== 'RETIRE_REQUESTED') throw new Error('expected first request latch')
    expect(repeated).toEqual({ status: 'READ_ONLY_RECEIPT', receipt: first.receipt })
    expect(mock.row.requestId).toBe('request-1')
    expect(mock.row.requestReason).toBe('PAUSE')
    expect(mock.updateJourney).toHaveBeenCalledTimes(1)
    expect(mock.updateRetirement).toHaveBeenCalledTimes(1)
  })

  it('preserves all-null legacy while rejecting orphan, partial and missing E2 enrollment', async () => {
    const legacy = mockTransaction({ legacy: true })
    expect(await assertE2BusinessAdmission(legacy.tx, business)).toEqual({ kind: 'LEGACY' })
    expect(await commitE2RetirementRequest(legacy.tx, retirement, 'PAUSE')).toEqual({ status: 'LEGACY_NO_E2' })
    expect(legacy.updateJourney).not.toHaveBeenCalled()
    for (const options of [{ legacy: true, orphan: true }, { partial: true }, { missing: true }]) {
      const mock = mockTransaction(options)
      await expect(assertE2BusinessAdmission(mock.tx, business)).rejects.toThrow()
      expect(mock.updateJourney).not.toHaveBeenCalled()
    }
  })

  it('rejects foreign credentials, mismatched digest, and a losing CAS without a retirement write', async () => {
    const foreign = mockTransaction()
    await expect(commitE2RetirementRequest(foreign.tx, { ...retirement,
      authority: { kind: 'CURRENT_SESSION', credentials: { ...credentials,
        coordinatorSessionId: 'foreign' } } }, 'PAUSE')).rejects.toThrow()
    const mismatch = mockTransaction({ foreignPolicy: true })
    await expect(assertE2BusinessAdmission(mismatch.tx, business)).rejects.toThrow('campaign policy lineage')
    expect(foreign.updateJourney).not.toHaveBeenCalled()
    const losing = mockTransaction({ loseAdmissionCas: true })
    await expect(commitE2RetirementRequest(losing.tx, retirement, 'PAUSE')).rejects.toThrow('retirement admission CAS')
    expect(losing.updateRetirement).not.toHaveBeenCalled()
  })

  it('refuses missing policy joins before a business CAS without requiring producer pins', async () => {
    for (const options of [{ missingPolicy: true }, { missingPolicyJoin: true }]) {
      const mock = mockTransaction(options)
      await expect(assertE2BusinessAdmission(mock.tx, business)).rejects.toThrow()
      expect(mock.updateJourney).not.toHaveBeenCalled()
    }
  })

  it('allows only the in-process local invalidator for the exact current session', async () => {
    const mock = mockTransaction()
    await expect(commitE2RetirementRequest(mock.tx, { ...retirement,
      authority: { kind: 'LOCAL_PROJECT_AUTHENTICATED', capability: Symbol('copied') as
        typeof trustedHumanCoordinatorSession } }, 'SOURCE_FAILURE')).rejects.toThrow()
    expect(mock.updateJourney).not.toHaveBeenCalled()
    expect(await commitE2RetirementRequest(mock.tx, { ...retirement,
      authority: { kind: 'LOCAL_PROJECT_AUTHENTICATED', capability: trustedHumanCoordinatorSession } }, 'SOURCE_FAILURE')).toMatchObject({
      status: 'RETIRE_REQUESTED', receipt: { requestReason: 'SOURCE_FAILURE' },
    })
    expect(mock.updateRetirement).toHaveBeenCalledTimes(1)
  })
})
