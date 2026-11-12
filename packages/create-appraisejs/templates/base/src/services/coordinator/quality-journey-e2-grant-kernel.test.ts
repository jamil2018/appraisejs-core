import type { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { e2EnvelopeDigest, type E2FiniteEnvelope } from '@/lib/quality-journey/provider-grant-contract'
import { e2CampaignPolicyDigest, type E2CampaignPolicyRow } from
  '@/lib/quality-journey/e2-campaign-policy-contract'
import {
  E2_REVIEWED_PROVIDER_INTENT_POLICY_DIGEST,
  E2_REVIEWED_PROVIDER_INTENT_POLICY_JSON,
  applyInertE2GrantSqlKernel,
  e2KernelPreparationId,
  type E2KernelExpectedCustody,
  type E2KernelFreshIds,
  type E2KernelRequest,
} from './quality-journey-e2-grant-kernel'

const H = (character: string) => character.repeat(64)
const T0 = Date.parse('2026-01-01T00:00:00.000Z')
const at = (offsetMs: number) => new Date(T0 + offsetMs)
const startEnvelope = (): E2FiniteEnvelope => ({
  version: 'M06_E2_FINITE_V1', runId: 'run', intentId: 'intent', operationId: 'op0',
  rangeId: 'op0', parentOperationId: null, sourceTupleDigest: H('a'), sequence: 0,
  kind: 'NATIVE_START', setupStage: null, payloadDigest: null, payloadByteLength: null,
  payloadReceiveTimeoutMs: null, maxBytes: 0, maxFrames: 0, maxControlFrames: 0,
  maxDescendants: 1,
})
const requestFor = (envelope: E2FiniteEnvelope): E2KernelRequest => ({
  journeyId: 'journey', targetProjectId: 'target', coordinatorSessionId: 'session',
  generation: 1, credentials: { journeyId: 'journey', targetProjectId: 'target',
    coordinatorSessionId: 'session', coordinatorGeneration: 1, coordinatorPrincipalId: 'principal' },
  providerRunId: 'run', intentId: 'intent', attemptId: 'attempt', authorizationId: 'auth',
  leaseId: 'lease', assignmentGeneration: 1, requestDigest: H('b'), envelope,
  claimOwner: 'claim-owner', claimEpoch: 1,
})
const expected = (): E2KernelExpectedCustody => ({
  campaignPolicyId: 'allocation', allocationDigest: H('c'), policyDigest: H('0'),
  providerIntentPolicyDigest: E2_REVIEWED_PROVIDER_INTENT_POLICY_DIGEST,
  sourceEventDigest: H('d'), constructorDigest: H('e'), parentIncarnationDigest: H('f'),
  prospectiveChildNonceDigest: H('1'), privateChannelDigest: H('2'),
  actorCustodyId: 'actor', originalChildIncarnationDigest: null,
})
const freshIds: E2KernelFreshIds = { grantId: 'grant-new', handoffId: 'handoff-new',
  sendBoundaryId: 'send-new', retirementRequestId: 'retire-new' }

function policy(): E2CampaignPolicyRow {
  const row = {
    id: 'allocation', allocationDigest: H('c'), journeyId: 'journey', targetProjectId: 'target',
    sourceTupleDigest: H('a'), policyVersion: 'M06_E2_CAMPAIGN_POLICY_V1',
    policyDigest: H('0'), nativeStartWindowMs: 10_000, dnsWindowMs: 10_000,
    tcpWindowMs: 10_000, tlsWindowMs: 10_000, upgradeWindowMs: 10_000,
    providerRequestWindowMs: 10_000, mcpCallWindowMs: 10_000,
    actorMaxOperations: 32, actorMaxBytes: 8_388_608, actorMaxFrames: 512,
    actorMaxSetup: 4, actorMaxProviderRequests: 5, actorMaxMcpCalls: 16,
    journeyMaxNativeStarts: 6, journeyMaxTurnStarts: 5,
    maxNativeStarts: 6, maxProviderRequests: 5, maxOperations: 192,
    maxBytes: 50_331_648, maxFrames: 3_072, maxSetup: 24, maxMcpCalls: 96,
    nativeStartsReserved: 0, providerRequestsReserved: 0, operationsReserved: 0,
    bytesReserved: 0, framesReserved: 0, setupReserved: 0, mcpCallsReserved: 0,
    version: 0, createdAt: at(0),
  }
  return { ...row, policyDigest: e2CampaignPolicyDigest(row) }
}

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
function startTables(request: E2KernelRequest, custody: E2KernelExpectedCustody): Tables {
  const envelope = request.envelope
  const p = policy()
  return {
    qualityJourney: [{ id: 'journey', targetProjectId: 'target', hostingMode: 'APP_SERVER_LOCAL_V1', hostingContractVersion: 1,
      currentCoordinatorSessionId: 'session', status: 'ACTIVE', ownershipVersion: 0,
      e2AdmissionVersion: 0, e2NativeStartsReserved: 0, e2TurnStartsReserved: 0 }],
    qualityJourneyCoordinatorSession: [{ id: 'session', journeyId: 'journey',
      targetProjectId: 'target', generation: 1, status: 'ACTIVE', fencedAt: null,
      hostKind: 'APP_SERVER_LOCAL_V1', ownerPrincipalId: 'principal',
      e2EnrollmentKind: 'E2_V1', e2EnrollmentDigest: H('a'), e2EnrolledAt: at(0) }],
    qualityJourneyE2CampaignPolicy: [p as unknown as Row],
    qualityJourneyE2Retirement: [{ id: 'retirement', journeyId: 'journey', targetProjectId: 'target',
      coordinatorSessionId: 'session', generation: 1, campaignPolicyId: 'allocation',
      state: 'ACTIVE', version: 0, requestId: null, requestedAt: null, requestReason: null,
      effectiveAt: null, effectiveEvidenceDigest: null }],
    qualityJourneyE2OperationPreparation: [{ id: e2KernelPreparationId('allocation', 'run',
      envelope.operationId), journeyId: 'journey', targetProjectId: 'target',
      coordinatorSessionId: 'session', generation: 1, providerRunId: 'run', intentId: 'intent',
      campaignPolicyId: 'allocation', operationId: envelope.operationId, kind: envelope.kind,
      setupStage: envelope.setupStage, sourceTupleDigest: envelope.sourceTupleDigest,
      requestDigest: request.requestDigest, envelopeDigest: e2EnvelopeDigest(envelope),
      sourceEventDigest: custody.sourceEventDigest, preparedAtEpochMs: BigInt(T0 + 1000),
      windowDurationMs: 10_000, windowDueAtEpochMs: BigInt(T0 + 11_000) }],
    qualityJourneyWorkAttempt: [{ id: 'attempt', workItemId: 'work', authorizationId: 'auth',
      leaseId: 'lease', assignmentGeneration: 1, attempt: 1, status: 'IN_PROGRESS',
      cancelledAt: null, leaseExpiresAt: at(120_000), workItem: {
        id: 'work', journeyId: 'journey', targetProjectId: 'target', status: 'IN_PROGRESS',
        currentAttempt: 1 } }],
    qualityJourneyWorkAuthorization: [{ id: 'auth', journeyId: 'journey',
      targetProjectId: 'target', workItemId: 'work', maxAttempts: 3,
      cancelledAt: null, revokedAt: null, successorAuthorization: null }],
    qualityJourneyProviderRun: [{ id: 'run', journeyId: 'journey', targetProjectId: 'target',
      sessionId: 'session', coordinatorGeneration: 1, attemptId: 'attempt',
      authorizationId: 'auth', leaseId: 'lease', assignmentGeneration: 1, status: 'PREPARED',
      unresolvedRetentionAt: at(86_400_000), terminalRetentionAt: null,
      terminalReconciledAt: null, turnsReserved: 0,
      policyJson: E2_REVIEWED_PROVIDER_INTENT_POLICY_JSON }],
    qualityJourneyProviderDispatchIntent: [{ id: 'intent', providerRunId: 'run',
      status: 'CLAIMED', claimOwner: 'claim-owner', claimEpoch: 1,
      claimExpiresAt: at(120_000), invalidatedAt: null,
      acknowledgementDueAt: null, turnDueAt: null, acknowledgedAt: null,
      sendBoundaryId: null, reconciledAt: null, createdAt: at(0) }],
    qualityJourneyProviderSlot: [{ id: 'HUB', providerRunId: null, intentId: null,
      sendBoundaryId: null, version: 0 }],
    qualityJourneyE2ActorCustody: [], qualityJourneyE2Grant: [],
  }
}

/** Disposable in-memory transaction model. The caller adopts the staged tables only on fulfillment. */
function stagedDb(source: Tables, loseUpdate?: string) {
  const tables = structuredClone(source)
  const log: string[] = []
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) =>
    value instanceof Date ? row[key] instanceof Date &&
      (row[key] as Date).getTime() === value.getTime() : row[key] === value)
  const change = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value)
        row[key] = Number(row[key]) + Number((value as { increment: number }).increment)
      else row[key] = value
    }
  }
  const tx = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    async findFirst(args: { where: Row }) {
      log.push(`${name}.findFirst`)
      return structuredClone(rows.find(row => matches(row, args.where)) ?? null)
    },
    async findUnique(args: { where: Row }) {
      log.push(`${name}.findUnique`)
      return structuredClone(rows.find(row => matches(row, args.where)) ?? null)
    },
    async findMany(args: { where: Row; take?: number; orderBy?: { sequence: 'asc' } }) {
      log.push(`${name}.findMany`)
      const found = rows.filter(row => matches(row, args.where))
      if (args.orderBy?.sequence === 'asc') found.sort((a, b) => Number(a.sequence) - Number(b.sequence))
      return structuredClone(found.slice(0, args.take))
    },
    async updateMany(args: { where: Row; data: Row }) {
      log.push(`${name}.updateMany`)
      if (name === loseUpdate) return { count: 0 }
      const found = rows.filter(row => matches(row, args.where))
      for (const row of found) change(row, args.data)
      return { count: found.length }
    },
    async create(args: { data: Row }) {
      log.push(`${name}.create`)
      rows.push(structuredClone(args.data))
      return structuredClone(args.data)
    },
  }])) as unknown as Prisma.TransactionClient
  return { tx, tables, log }
}

function setupRequest() {
  const envelope = startEnvelope()
  const request = requestFor(envelope)
  const initialCustody = expected()
  const tables = startTables(request, initialCustody)
  const custody = { ...initialCustody,
    policyDigest: tables.qualityJourneyE2CampaignPolicy[0]!.policyDigest as string }
  return { request, custody, tables }
}

function providerRequestScenario(turnsReserved: number) {
  const envelope: E2FiniteEnvelope = { ...startEnvelope(), operationId: 'op2', rangeId: 'op2',
    parentOperationId: 'op1', sequence: 2, kind: 'PROVIDER_REQUEST', maxBytes: 16,
    maxFrames: 1, maxControlFrames: 0, maxDescendants: 0, payloadDigest: H('4'),
    payloadByteLength: 16, payloadReceiveTimeoutMs: 5000 }
  const request = requestFor(envelope)
  const custody = { ...expected(), originalChildIncarnationDigest: H('3') }
  const tables = startTables(request, custody)
  const p = tables.qualityJourneyE2CampaignPolicy[0]!
  Object.assign(p, { nativeStartsReserved: 1, operationsReserved: 2, setupReserved: 1,
    version: 2 })
  const resolvedCustody = { ...custody, policyDigest: p.policyDigest as string }
  Object.assign(tables.qualityJourney[0]!, { e2AdmissionVersion: 2, e2NativeStartsReserved: 1 })
  Object.assign(tables.qualityJourneyProviderRun[0]!, { status: 'UNKNOWN', turnsReserved })
  Object.assign(tables.qualityJourneyProviderDispatchIntent[0]!, { status: 'UNKNOWN',
    acknowledgementDueAt: at(60_000), turnDueAt: at(900_000),
    sendBoundaryId: 'send-old' })
  Object.assign(tables.qualityJourneyProviderSlot[0]!, { providerRunId: 'run',
    intentId: 'intent', sendBoundaryId: 'send-old', version: 1 })
  tables.qualityJourneyE2ActorCustody.push({ id: 'actor', providerRunId: 'run',
    journeyId: 'journey', targetProjectId: 'target', coordinatorSessionId: 'session',
    generation: 1, intentId: 'intent', slotId: 'HUB', sourceTupleDigest: H('a'),
    constructorDigest: custody.constructorDigest,
    parentIncarnationDigest: custody.parentIncarnationDigest,
    prospectiveChildNonceDigest: custody.prospectiveChildNonceDigest,
    privateChannelDigest: custody.privateChannelDigest,
    originalChildIncarnationDigest: H('3'), state: 'BOUND', operationsReserved: 2,
    bytesReserved: 0, framesReserved: 0, setupReserved: 1, providerRequestsReserved: 0,
    mcpCallsReserved: 0, recoveryControlsReserved: 0 })
  for (const [sequence, operationId, kind, setupStage] of [
    [0, 'op0', 'NATIVE_START', null], [1, 'op1', 'SETUP', 'DNS'],
  ] as const) tables.qualityJourneyE2Grant.push({ id: `prior-${sequence}`, providerRunId: 'run',
    actorCustodyId: 'actor', intentId: 'intent', operationId, sequence, kind, setupStage,
    sourceTupleDigest: H('a') })
  return { request, custody: resolvedCustody, tables }
}

describe('R2 inert grant SQL kernel against a staged transaction ledger', () => {
  it('commits one native-start reservation with final-sample/Journey-CAS adjacency', async () => {
    const { request, custody, tables } = setupRequest()
    const staged = stagedDb(tables)
    let samples = 0
    const result = await applyInertE2GrantSqlKernel(staged.tx, request, custody, freshIds, () => {
      staged.log.push('finalSample')
      samples += 1
      return at(5_000)
    })
    expect(result).toMatchObject({ status: 'DB_COMMITTED_INERT', outcome: 'GRANT',
      admissionVersion: 1, earliestDueAt: at(11_000) })
    expect(samples).toBe(1)
    expect(staged.log[0]).toBe('qualityJourneyE2Grant.findMany')
    expect(staged.log.slice(staged.log.indexOf('finalSample'),
      staged.log.indexOf('finalSample') + 2))
      .toEqual(['finalSample', 'qualityJourney.updateMany'])
    expect(staged.log.indexOf('qualityJourneyE2CampaignPolicy.updateMany'))
      .toBeGreaterThan(staged.log.indexOf('qualityJourney.updateMany'))
    expect(staged.tables.qualityJourneyE2CampaignPolicy[0]).toMatchObject({
      version: 1, nativeStartsReserved: 1, operationsReserved: 1 })
    expect(staged.tables.qualityJourney[0]).toMatchObject({ e2AdmissionVersion: 1,
      e2NativeStartsReserved: 1, e2TurnStartsReserved: 0 })
    expect(staged.tables.qualityJourneyProviderRun[0]).toMatchObject({ status: 'UNKNOWN',
      turnsReserved: 0 })
    expect(staged.tables.qualityJourneyE2Grant).toHaveLength(1)
    expect(staged.tables.qualityJourneyE2Grant[0]).toMatchObject({
      operationPreparationId: e2KernelPreparationId('allocation', 'run', 'op0'),
      admissionVersion: 1,
      state: 'COMMITTED_UNDELIVERED' })
    expect(result).not.toHaveProperty('command')
  })

  it('latches expiry at the persisted preparation due instant after the same final CAS', async () => {
    const { request, custody, tables } = setupRequest()
    const staged = stagedDb(tables)
    let samples = 0
    const result = await applyInertE2GrantSqlKernel(staged.tx, request, custody, freshIds, () => {
      staged.log.push('finalSample')
      samples += 1
      return at(11_000)
    })
    expect(result).toMatchObject({ status: 'DB_COMMITTED_INERT',
      outcome: 'RETIREMENT_REQUEST', retirementReason: 'SOURCE_FAILURE' })
    expect(samples).toBe(1)
    expect(staged.log.slice(staged.log.indexOf('finalSample'),
      staged.log.indexOf('finalSample') + 3)).toEqual([
      'finalSample', 'qualityJourney.updateMany', 'qualityJourneyE2Retirement.updateMany' ])
    expect(staged.tables.qualityJourneyE2Retirement[0]).toMatchObject({
      state: 'RETIRE_REQUESTED', requestId: 'retire-new', version: 1 })
    expect(staged.tables.qualityJourneyE2CampaignPolicy[0]).toMatchObject({ version: 0 })
    expect(staged.tables.qualityJourneyE2Grant).toHaveLength(0)
    expect(staged.tables.qualityJourneyProviderSlot[0]).toMatchObject({ providerRunId: null })
  })

  it('refuses policy, source and immutable preparation mismatches before a clock sample or write', async () => {
    const cases: Array<(tables: Tables) => void> = [
      tables => { tables.qualityJourneyProviderRun[0]!.policyJson = '{}' },
      tables => { tables.qualityJourneyE2CampaignPolicy[0]!.allocationDigest = H('9') },
      tables => {
        const replacement = tables.qualityJourneyE2CampaignPolicy[0]!
        replacement.id = 'allocation-reset'
        replacement.allocationDigest = H('9')
        replacement.policyDigest = e2CampaignPolicyDigest(replacement as unknown as E2CampaignPolicyRow)
      },
      tables => { tables.qualityJourneyE2OperationPreparation[0]!.windowDueAtEpochMs = BigInt(T0 + 12_000) },
      tables => { tables.qualityJourneyE2OperationPreparation[0]!.sourceEventDigest = H('8') },
    ]
    for (const alter of cases) {
      const { request, custody, tables } = setupRequest()
      alter(tables)
      const staged = stagedDb(tables)
      await expect(applyInertE2GrantSqlKernel(staged.tx, request, custody, freshIds,
        () => { staged.log.push('finalSample'); return at(5_000) })).rejects.toThrow()
      expect(staged.log).not.toContain('finalSample')
      expect(staged.log.some(entry => entry.endsWith('.updateMany') || entry.endsWith('.create')))
        .toBe(false)
    }
  })

  it('uses a read-only exact duplicate and refuses a changed duplicate', async () => {
    const { request, custody, tables } = setupRequest()
    const first = stagedDb(tables)
    await applyInertE2GrantSqlKernel(first.tx, request, custody, freshIds, () => at(5_000))
    const exact = stagedDb(first.tables)
    const replay = await applyInertE2GrantSqlKernel(exact.tx, request, custody, freshIds,
      () => { exact.log.push('finalSample'); return at(5_000) })
    expect(replay.status).toBe('READ_ONLY_RECEIPT')
    expect(exact.log).not.toContain('finalSample')
    expect(exact.log.some(entry => entry.endsWith('.updateMany') || entry.endsWith('.create')))
      .toBe(false)
    const changed = stagedDb(first.tables)
    changed.tables.qualityJourneyE2Grant[0]!.payloadDigest = H('7')
    await expect(applyInertE2GrantSqlKernel(changed.tx, request, custody, freshIds,
      () => at(5_000))).rejects.toThrow(/duplicate mismatch/)
  })

  it('treats a losing campaign CAS as rollback-required after the Journey CAS', async () => {
    const { request, custody, tables } = setupRequest()
    const staged = stagedDb(tables, 'qualityJourneyE2CampaignPolicy')
    await expect(applyInertE2GrantSqlKernel(staged.tx, request, custody, freshIds,
      () => at(5_000))).rejects.toThrow(/campaign budget CAS/)
    expect(staged.log).toContain('qualityJourney.updateMany')
    expect(staged.tables.qualityJourney[0]!.e2AdmissionVersion).toBe(1)
    // A real outer transaction must discard this staged snapshot; the source table was never adopted.
    expect(tables.qualityJourney[0]!.e2AdmissionVersion).toBe(0)
    expect(tables.qualityJourneyE2Grant).toHaveLength(0)
  })

  it('never returns a retirement receipt when its post-Journey latch CAS loses', async () => {
    const { request, custody, tables } = setupRequest()
    const staged = stagedDb(tables, 'qualityJourneyE2Retirement')
    await expect(applyInertE2GrantSqlKernel(staged.tx, request, custody, freshIds,
      () => at(11_000))).rejects.toThrow(/expiry latch CAS/)
    expect(staged.tables.qualityJourney[0]).toMatchObject({ e2AdmissionVersion: 1 })
    expect(tables.qualityJourney[0]).toMatchObject({ e2AdmissionVersion: 0 })
    expect(tables.qualityJourneyE2Retirement[0]).toMatchObject({ state: 'ACTIVE' })
    expect(tables.qualityJourneyE2Grant).toHaveLength(0)
  })

  it('keeps the reviewed per-run turn cap at three even while Journey and campaign allow five', async () => {
    const exhausted = providerRequestScenario(3)
    const denied = stagedDb(exhausted.tables)
    await expect(applyInertE2GrantSqlKernel(denied.tx, exhausted.request,
      exhausted.custody, freshIds, () => { denied.log.push('finalSample'); return at(5_000) }))
      .rejects.toThrow(/Journey or run budget/)
    expect(denied.log).not.toContain('finalSample')
    expect(denied.log.some(entry => entry.endsWith('.updateMany'))).toBe(false)

    const available = providerRequestScenario(2)
    const admitted = stagedDb(available.tables)
    const result = await applyInertE2GrantSqlKernel(admitted.tx, available.request,
      available.custody, freshIds, () => at(5_000))
    expect(result).toMatchObject({ status: 'DB_COMMITTED_INERT', outcome: 'GRANT' })
    expect(admitted.tables.qualityJourneyProviderRun[0]).toMatchObject({ turnsReserved: 3 })
    expect(admitted.tables.qualityJourney[0]).toMatchObject({ e2TurnStartsReserved: 1 })
    expect(admitted.tables.qualityJourneyE2CampaignPolicy[0]).toMatchObject({
      providerRequestsReserved: 1, operationsReserved: 3 })
  })

  it('does not renew an expired ACK window when acknowledgement arrived late', async () => {
    const scenario = providerRequestScenario(2)
    const p = scenario.tables.qualityJourneyE2CampaignPolicy[0]!
    p.providerRequestWindowMs = 120_000
    p.policyDigest = e2CampaignPolicyDigest(p as unknown as E2CampaignPolicyRow)
    scenario.custody.policyDigest = p.policyDigest as string
    const prep = scenario.tables.qualityJourneyE2OperationPreparation[0]!
    prep.windowDurationMs = 120_000
    prep.windowDueAtEpochMs = BigInt(T0 + 121_000)
    scenario.tables.qualityJourneyWorkAttempt[0]!.leaseExpiresAt = at(180_000)
    Object.assign(scenario.tables.qualityJourneyProviderRun[0]!, { status: 'ACKNOWLEDGED' })
    Object.assign(scenario.tables.qualityJourneyProviderDispatchIntent[0]!, {
      status: 'ACKNOWLEDGED', acknowledgedAt: at(60_001),
    })
    const staged = stagedDb(scenario.tables)
    const result = await applyInertE2GrantSqlKernel(staged.tx, scenario.request,
      scenario.custody, freshIds, () => at(65_000))
    expect(result).toMatchObject({ status: 'DB_COMMITTED_INERT',
      outcome: 'RETIREMENT_REQUEST', retirementReason: 'INTENT_DEADLINE_EXPIRED',
      earliestDueAt: at(60_000) })
    expect(staged.tables.qualityJourneyE2Grant).toHaveLength(2)
    expect(staged.tables.qualityJourneyE2CampaignPolicy[0]).toMatchObject({
      version: 2, providerRequestsReserved: 0 })
  })
})
