import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import {
  E2_CAMPAIGN_POLICY_DOMAIN,
  e2CampaignPolicyDigest,
  validateE2CampaignPolicyCounterTransition,
  validateE2CampaignPolicyRow,
  type E2CampaignPolicyRow,
} from './e2-campaign-policy-contract'

const digest = (character: string) => character.repeat(64)
const base = (): E2CampaignPolicyRow => {
  const row = {
    id: 'allocation-1', allocationDigest: digest('a'), journeyId: 'journey-1',
    targetProjectId: 'target-1', sourceTupleDigest: digest('b'),
    policyVersion: E2_CAMPAIGN_POLICY_DOMAIN, policyDigest: digest('0'),
    nativeStartWindowMs: 11_000, dnsWindowMs: 12_000, tcpWindowMs: 13_000,
    tlsWindowMs: 14_000, upgradeWindowMs: 15_000,
    providerRequestWindowMs: 16_000, mcpCallWindowMs: 17_000,
    actorMaxOperations: 32, actorMaxBytes: 8_388_608, actorMaxFrames: 512,
    actorMaxSetup: 4, actorMaxProviderRequests: 5, actorMaxMcpCalls: 16,
    journeyMaxNativeStarts: 6, journeyMaxTurnStarts: 5,
    maxNativeStarts: 6, maxProviderRequests: 5, maxOperations: 192,
    maxBytes: 50_331_648, maxFrames: 3_072, maxSetup: 24, maxMcpCalls: 96,
    nativeStartsReserved: 0, providerRequestsReserved: 0, operationsReserved: 0,
    bytesReserved: 0, framesReserved: 0, setupReserved: 0, mcpCallsReserved: 0,
    version: 0, createdAt: new Date('2026-01-01T00:00:00.000Z'),
  }
  return { ...row, policyDigest: e2CampaignPolicyDigest(row) }
}

describe('R2 retained campaign allocation contract', () => {
  it('uses the immutable projection and domain, independent of mutable reservations', () => {
    const row = base()
    const immutable = {
      actorMaxBytes: row.actorMaxBytes, actorMaxFrames: row.actorMaxFrames,
      actorMaxMcpCalls: row.actorMaxMcpCalls, actorMaxOperations: row.actorMaxOperations,
      actorMaxProviderRequests: row.actorMaxProviderRequests, actorMaxSetup: row.actorMaxSetup,
      allocationDigest: row.allocationDigest, dnsWindowMs: row.dnsWindowMs,
      id: row.id, journeyId: row.journeyId, journeyMaxNativeStarts: row.journeyMaxNativeStarts,
      journeyMaxTurnStarts: row.journeyMaxTurnStarts, maxBytes: row.maxBytes,
      maxFrames: row.maxFrames, maxMcpCalls: row.maxMcpCalls,
      maxNativeStarts: row.maxNativeStarts, maxOperations: row.maxOperations,
      maxProviderRequests: row.maxProviderRequests, maxSetup: row.maxSetup,
      mcpCallWindowMs: row.mcpCallWindowMs, nativeStartWindowMs: row.nativeStartWindowMs,
      policyVersion: row.policyVersion, providerRequestWindowMs: row.providerRequestWindowMs,
      sourceTupleDigest: row.sourceTupleDigest, targetProjectId: row.targetProjectId,
      tcpWindowMs: row.tcpWindowMs, tlsWindowMs: row.tlsWindowMs,
      upgradeWindowMs: row.upgradeWindowMs,
    }
    const reference = createHash('sha256')
      .update(`M06_E2_CAMPAIGN_POLICY_V1\n${JSON.stringify(immutable)}`)
      .digest('hex')
    expect(row.policyDigest).toBe(reference)
    expect(validateE2CampaignPolicyRow(row, { requireFresh: true })).toEqual(row)
    expect(e2CampaignPolicyDigest({ ...row, operationsReserved: 1, version: 1 })).toBe(reference)
  })

  it('refuses altered immutable fields, unknown fields, nonzero fresh allocation, and cap overflow', () => {
    const row = base()
    expect(() => validateE2CampaignPolicyRow({ ...row, dnsWindowMs: 12_001 }))
      .toThrow(/immutable digest/)
    expect(() => validateE2CampaignPolicyRow({ ...row, extra: 'adopt' })).toThrow(/row fields/)
    expect(() => validateE2CampaignPolicyRow({ ...row, operationsReserved: 1 },
      { requireFresh: true })).toThrow(/initial value/)
    expect(() => validateE2CampaignPolicyRow({ ...row, maxNativeStarts: 7 }))
      .toThrow(/nativeStartsReserved bound/)
    expect(() => validateE2CampaignPolicyRow({ ...row, nativeStartWindowMs: 0 }))
      .toThrow(/nativeStartWindowMs window/)
  })

  it('accepts only an exact one-grant monotonic transition under the same allocation', () => {
    const before = base()
    const charges = {
      nativeStartsReserved: 1, providerRequestsReserved: 0, operationsReserved: 1,
      bytesReserved: 0, framesReserved: 0, setupReserved: 0, mcpCallsReserved: 0,
    }
    const after = { ...before, nativeStartsReserved: 1, operationsReserved: 1, version: 1 }
    expect(validateE2CampaignPolicyCounterTransition(before, after, charges)).toEqual(after)
    expect(() => validateE2CampaignPolicyCounterTransition(before,
      { ...after, nativeStartsReserved: 0 }, charges)).toThrow(/nativeStartsReserved transition/)
    expect(() => validateE2CampaignPolicyCounterTransition(before,
      { ...after, version: 2 }, charges)).toThrow(/allocation transition/)
    const replacement = { ...after, id: 'allocation-reset' }
    replacement.policyDigest = e2CampaignPolicyDigest(replacement)
    expect(() => validateE2CampaignPolicyCounterTransition(before, replacement, charges))
      .toThrow(/allocation transition/)
  })
})
