import type { Prisma, PrismaClient } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

// This unit lane must never initialize the default database configuration/client.
vi.mock('@/config/db-config', () => ({ default: {} }))
vi.mock('./quality-journey-coordinator-session', () => ({
  assertCoordinatorMutationSession: vi.fn(),
  assertCurrentCoordinatorSession: vi.fn(),
  assertCoordinatorRecoverySession: vi.fn(),
  assertCoordinatorAttemptSession: vi.fn(),
  bindCoordinatorAttemptSession: vi.fn(),
  trustedHumanCoordinatorSession: Symbol('human-test-only'),
}))
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { qualityJourneyWorkItemId } from '@/lib/quality-journey'
import {
  claimExternalQualityJourneyAnalysisFollowup,
  ensureQualityJourneyAnalysisFollowupInTransaction,
  readQualityJourneyAnalysisFollowupIssuanceInTransaction,
  readQualityJourneyAnalysisFollowupInTransaction,
} from './quality-journey-service'

function fixture(requiredAnswered = true) {
  const scope = { journeyId: 'journey', targetProjectId: 'project' }
  const item = {
    id: qualityJourneyWorkItemId('journey', 'cycle', 'REQUIREMENT_ANALYZER'),
    ...scope,
    cycleId: 'cycle',
    role: 'REQUIREMENT_ANALYZER',
    status: 'COMPLETED',
    inputHash: hashCanonical('initial'),
    roleContractDigest: hashCanonical('role'),
    version: 2,
    currentAttempt: 1,
    advisoryInputRefsJson: '[]',
    inputArtifactRefsJson: '[]',
    authorizationScopeJson: '{}',
    allowedOutputsJson: '[]',
    completionCriteriaJson: '[]',
  }
  const row = {
    id: 'journey',
    targetProjectId: 'project',
    hostingMode: 'APP_SERVER_LOCAL_V1',
    stage: 'ANALYSIS',
    status: 'ACTIVE',
    activeCycleId: 'cycle',
    activeRevisionIdsJson: '{"journey":"requirement"}',
    activeWorkItemIdsJson: '[]',
    unresolvedQuestionIdsJson: requiredAnswered ? '[]' : '["q"]',
    blockerIdsJson: '[]',
    analysisReviewHash: hashCanonical('review'),
    stateHash: hashCanonical('kernel'),
    version: 2,
    currentCoordinatorSessionId: 'session',
  }
  const artifact = (kind: string, artifactId: string, payload: unknown, revisionId: string | null = null) => ({
    ...scope,
    cycleId: 'cycle',
    kind,
    artifactId,
    revisionId,
    contentHash: hashCanonical(payload),
    artifactJson: canonicalContractJson(payload),
  })
  const predecessorArtifact = artifact(
    'ANALYSIS_CHARTER_REVISION',
    'charter',
    { analysisRevisionId: 'A', requirementRevisionId: 'requirement', cycleId: 'cycle' },
    'A',
  )
  const priorManifest = { inputHash: item.inputHash }
  const predecessor = {
    ...scope,
    id: 'A',
    artifactRevisionId: 'A',
    artifactId: 'charter',
    cycleId: 'cycle',
    inputHash: item.inputHash,
    artifact: predecessorArtifact,
    contentHash: predecessorArtifact.contentHash,
    submittedWorkItemId: item.id,
    decision: null,
    submittedAttempt: {
      id: 'attempt-1',
      attempt: 1,
      workItemId: item.id,
      authorizationId: 'auth-1',
      status: 'COMPLETED',
      assignmentJson: canonicalContractJson(priorManifest),
      assignmentHash: hashCanonical(priorManifest),
    },
    questions: [
      {
        id: 'q-record',
        questionId: 'q',
        required: true,
        contentHash: hashCanonical({ q: true }),
        artifact: artifact('ANALYSIS_QUESTION', 'q', { q: true }, 'A'),
        answers: requiredAnswered
          ? [
              {
                id: 'a-record',
                answerId: 'answer',
                correctionOfAnswerId: null as string | null,
                contentHash: hashCanonical({ a: true }),
                artifact: artifact('ANALYSIS_ANSWER', 'answer', { a: true }),
              },
            ]
          : [],
      },
    ],
  }
  const authorizations = [
    { id: 'auth-1', ...scope, workItemId: item.id, maxAttempts: 3, revokedAt: null, cancelledAt: null },
  ]
  const events = [
    {
      id: 'answer-event',
      ...scope,
      sequence: 4,
      eventType: 'ANALYSIS_ANSWERED',
      commandId: null,
      payloadJson: canonicalContractJson({
        analysisRevisionId: 'A',
        answerId: requiredAnswered ? 'answer' : 'optional-answer',
      }),
    },
  ]
  // A partial round still has a real human cause: the optional answer is its own current head.
  if (!requiredAnswered)
    predecessor.questions.push({
      id: 'optional-record',
      questionId: 'optional',
      required: false,
      contentHash: hashCanonical({ q: true }),
      artifact: artifact('ANALYSIS_QUESTION', 'optional', { q: true }, 'A'),
      answers: [
        {
          id: 'optional-answer-record',
          answerId: 'optional-answer',
          correctionOfAnswerId: null as string | null,
          contentHash: hashCanonical({ a: true }),
          artifact: artifact('ANALYSIS_ANSWER', 'optional-answer', { a: true }),
        },
      ],
    })
  const wakes: unknown[] = []
  const tx = {
    qualityJourney: {
      findFirst: vi.fn(async () => row),
      updateMany: vi.fn(async ({ data }) => {
        Object.assign(row, { ...data, version: row.version + 1 })
        return { count: 1 }
      }),
    },
    qualityJourneyAnalysisRevision: { findMany: vi.fn(async () => [predecessor]) },
    qualityJourneyRevision: {
      findFirst: vi.fn(async () => ({
        id: 'requirement',
        contentJson: '{"objective":"Checkout"}',
        contentHash: hashCanonical({ objective: 'Checkout' }),
      })),
    },
    qualityJourneyWorkItem: {
      findUnique: vi.fn(async () => item),
      findUniqueOrThrow: vi.fn(async () => item),
      updateMany: vi.fn(async ({ data }) => {
        Object.assign(item, { ...data, version: item.version + 1 })
        return { count: 1 }
      }),
    },
    qualityJourneyWorkAuthorization: {
      findUnique: vi.fn(async ({ where }) => authorizations.find(a => a.id === where.id)),
      findFirst: vi.fn(async () => authorizations.at(-1)),
      create: vi.fn(async ({ data }) => {
        authorizations.push({ revokedAt: null, cancelledAt: null, ...data })
        return data
      }),
      updateMany: vi.fn(),
    },
    qualityJourneyArtifact: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
    qualityJourneyCommand: { findUnique: vi.fn(async (): Promise<unknown> => null) },
    qualityJourneyDraft: { findFirst: vi.fn(async () => null) },
    qualityJourneyCoordinatorSession: {
      findUnique: vi.fn(async () => ({
        id: 'session',
        ...scope,
        status: 'ACTIVE',
        generation: 1,
        hostKind: 'APP_SERVER_LOCAL_V1',
        fencedAt: null as Date | null,
      })),
    },
    qualityJourneyEvent: {
      findMany: vi.fn(async ({ where }) =>
        events.filter(e =>
          typeof where.eventType === 'string'
            ? e.eventType === where.eventType
            : where.eventType.in.includes(e.eventType),
        ),
      ),
      count: vi.fn(async () => events.length),
      create: vi.fn(async ({ data }) => {
        events.push(data)
        return data
      }),
    },
    qualityJourneyWorkAttempt: {
      count: vi.fn(async ({ where }) =>
        where.authorizationId ? (where.authorizationId === 'auth-1' ? 1 : 0) : item.currentAttempt,
      ),
      create: vi.fn(),
      findMany: vi.fn(async (): Promise<unknown[]> => []),
    },
    qualityJourneyWakeIntent: {
      findUnique: vi.fn(async () => wakes[0] ?? null),
      create: vi.fn(async ({ data }) => {
        wakes.push(data)
        return data
      }),
    },
    qualityJourneyProviderSlot: { findUnique: vi.fn(async (): Promise<unknown> => null) },
    qualityJourneyProviderRun: { findFirst: vi.fn(async (): Promise<unknown> => null) },
    qualityJourneyExternalWorkClaimReceipt: { findUnique: vi.fn(async () => null), create: vi.fn() },
  }
  return {
    scope,
    row,
    item,
    predecessor,
    authorizations,
    events,
    tx,
    db: tx as unknown as Prisma.TransactionClient,
    wakes,
  }
}

describe('transactional managed Analysis compiler (mocked persistence)', () => {
  it('rejects a missing exact expectation before opening a claim transaction', async () => {
    const transaction = vi.fn()
    await expect(
      claimExternalQualityJourneyAnalysisFollowup(
        { role: 'REQUIREMENT_ANALYZER' } as Parameters<typeof claimExternalQualityJourneyAnalysisFollowup>[0],
        { $transaction: transaction } as unknown as PrismaClient,
      ),
    ).rejects.toThrow()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('reads current corrected answer heads and their exact human cause without writing', async () => {
    const f = fixture()
    const question = f.predecessor.questions[0]!,
      previous = question.answers[0]!
    const payload = { a: 'corrected' }
    question.answers.push({
      ...previous,
      id: 'corrected-record',
      answerId: 'corrected-answer',
      correctionOfAnswerId: previous.id,
      contentHash: hashCanonical(payload),
      artifact: {
        ...previous.artifact,
        artifactId: 'corrected-answer',
        contentHash: hashCanonical(payload),
        artifactJson: canonicalContractJson(payload),
      },
    })
    f.events.push({
      ...f.events[0]!,
      id: 'correction-event',
      sequence: 5,
      payloadJson: canonicalContractJson({ analysisRevisionId: 'A', answerId: 'corrected-answer' }),
    })
    const snapshot = await readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    expect(snapshot?.descriptor.questions[0]?.answer?.artifactId).toBe('corrected-answer')
    expect(snapshot?.descriptor.cause).toEqual({ eventId: 'correction-event', sequence: 5 })
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWakeIntent.create).not.toHaveBeenCalled()
  })
  it('refuses two accepted leaves rather than selecting one by date', async () => {
    const f = fixture()
    f.tx.qualityJourneyAnalysisRevision.findMany.mockResolvedValue([
      f.predecessor,
      { ...f.predecessor, id: 'other-leaf' },
    ])
    await expect(readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /ambiguous accepted leaves/,
    )
    expect(f.tx.qualityJourneyWorkItem.findUnique).not.toHaveBeenCalled()
  })
  it('refuses ambiguous current heads before issuance or wake writes', async () => {
    const f = fixture(),
      question = f.predecessor.questions[0]!
    question.answers.push({ ...question.answers[0]!, id: 'unrelated-head', answerId: 'other-answer' })
    await expect(ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /answer heads are ambiguous/,
    )
    expect(f.tx.qualityJourneyWakeIntent.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })
  it('refuses a stale requirement and invalid predecessor assignment before any issuance', async () => {
    const f = fixture()
    f.tx.qualityJourneyRevision.findFirst.mockResolvedValue({
      id: 'wrong-requirement',
      contentJson: '{}',
      contentHash: hashCanonical({}),
    })
    await expect(readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /requirement identity is stale/,
    )
    f.predecessor.submittedAttempt.assignmentHash = hashCanonical('wrong persisted assignment')
    await expect(readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /completion lineage is invalid/,
    )
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })
  it('checks predecessor work scope before parsing assignment evidence or reading authorization', async () => {
    const f = fixture()
    f.item.cycleId = 'foreign-cycle'
    f.predecessor.submittedAttempt.assignmentJson = 'malformed-json'
    await expect(readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /completion lineage is invalid/,
    )
    expect(f.tx.qualityJourneyWorkAuthorization.findUnique).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })
  it('checks completed ordinal before authorization and refuses foreign prior authorization', async () => {
    const f = fixture()
    f.item.currentAttempt = 2
    await expect(readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /no matching accepted attempt/,
    )
    expect(f.tx.qualityJourneyWorkAuthorization.findUnique).not.toHaveBeenCalled()
    f.item.currentAttempt = 1
    f.authorizations[0]!.journeyId = 'foreign-journey'
    await expect(readQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).rejects.toThrow(
      /authorization is unavailable/,
    )
    expect(f.tx.qualityJourneyWorkAuthorization.findUnique).toHaveBeenCalledWith({ where: { id: 'auth-1' } })
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })
  it('retains the ready cause without issuing authority for a fenced coordinator session', async () => {
    const f = fixture()
    const current = await f.tx.qualityJourneyCoordinatorSession.findUnique()
    f.tx.qualityJourneyCoordinatorSession.findUnique.mockResolvedValue({
      ...current,
      fencedAt: new Date(),
    })
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toMatchObject({
      status: 'AUTHORITY_BLOCKED',
      expected: null,
    })
    expect(f.wakes).toHaveLength(1)
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })
  it('does not issue work for an empty required set without human input', async () => {
    const f = fixture()
    f.predecessor.questions = []
    f.events.length = 0
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toEqual({
      status: 'OBSERVED',
      expected: null,
    })
    expect(f.wakes).toHaveLength(0)
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })

  it('retains partial human input and wake while issuing zero work/authorization/attempts', async () => {
    const f = fixture(false)
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toMatchObject({
      status: 'WAITING_FOR_HUMAN',
      expected: null,
    })
    expect(f.wakes).toHaveLength(1)
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAttempt.create).not.toHaveBeenCalled()
  })

  it('coalesces exact pending revision feedback with partial heads without freezing completed work', async () => {
    const f = fixture(false)
    const command = {
      schemaVersion: 'appraise.quality-journey/v1',
      ...f.scope,
      commandId: 'revision-command',
      actor: 'USER',
      command: 'REQUEST_ANALYSIS_REVISION',
      expectedStateHash: f.row.stateHash,
      idempotencyKey: 'revision-command',
      inputArtifactRefs: [],
      payload: {
        reviewedRevisionId: 'A',
        reviewedHash: f.predecessor.contentHash,
        feedback: 'Please include shipping.',
      },
    }
    const payload = {
      schemaVersion: 'appraise.quality-journey/v1',
      ...f.scope,
      feedbackId: 'analysis-revision-feedback:revision-command',
      reviewedRevisionId: 'A',
      reviewedHash: f.predecessor.contentHash,
      feedback: command.payload.feedback,
      commandId: command.commandId,
    }
    f.tx.qualityJourneyArtifact.findMany.mockResolvedValue([
      {
        ...f.scope,
        cycleId: 'cycle',
        kind: 'ANALYSIS_REVISION_FEEDBACK',
        artifactId: payload.feedbackId,
        revisionId: 'A',
        contentHash: hashCanonical(payload),
        artifactJson: canonicalContractJson(payload),
      },
    ])
    f.tx.qualityJourneyCommand.findUnique.mockResolvedValue({
      id: command.commandId,
      journeyId: 'journey',
      requestJson: canonicalContractJson(command),
      requestHash: hashCanonical(command),
      resultJson: '{"outcome":"COMMITTED"}',
    })
    const result = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    expect(result).toMatchObject({ status: 'WAITING_FOR_HUMAN', expected: null })
    expect(f.item.status).toBe('COMPLETED')
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
  })

  it('issues once, restores the same logical item, and re-observes the identical cause after kernel/version changes', async () => {
    const f = fixture()
    const first = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    expect(first.status).toBe('ISSUED')
    expect(f.item.inputHash).not.toBe(f.row.stateHash)
    expect(JSON.parse(f.row.activeWorkItemIdsJson)).toEqual([f.item.id])
    expect(f.item.currentAttempt).toBe(1)
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toEqual(first)
    expect(f.tx.qualityJourneyWorkAuthorization.create).toHaveBeenCalledTimes(1)
    expect(f.events.filter(e => e.eventType === 'ANALYSIS_FOLLOWUP_ISSUED')).toHaveLength(1)
    expect(f.tx.qualityJourneyWorkAttempt.create).not.toHaveBeenCalled()
    expect(f.wakes).toHaveLength(1)
  })

  it.each(['PAUSED', 'CANCELLED', 'CLOSED'])('retains a hint but no new authority while %s', async status => {
    const f = fixture()
    f.row.status = status
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toMatchObject({ status: 'INACTIVE' })
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })

  it.each(['revokedAt', 'cancelledAt'] as const)('does not heal %s authority', async field => {
    const f = fixture()
    Object.assign(f.authorizations[0]!, { [field]: new Date() })
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toMatchObject({
      status: 'AUTHORITY_BLOCKED',
    })
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })

  it('preserves completed work and ready cause at the lifetime ceiling', async () => {
    const f = fixture()
    f.item.currentAttempt = 3
    f.predecessor.submittedAttempt.attempt = 3
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toMatchObject({
      status: 'AUTHORITY_BLOCKED',
    })
    expect(f.item.status).toBe('COMPLETED')
    expect(f.wakes).toHaveLength(1)
    expect(f.tx.qualityJourneyWorkAuthorization.create).not.toHaveBeenCalled()
  })

  it('refuses duplicate issuance records instead of selecting the newest', async () => {
    const f = fixture()
    const result = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    f.events.push({ ...f.events.at(-1)!, id: 'duplicate' })
    await expect(
      readQualityJourneyAnalysisFollowupIssuanceInTransaction(
        { ...f.scope, workItemId: f.item.id, authorizationId: result.expected!.authorizationId },
        f.db,
      ),
    ).rejects.toThrow(/requires recovery/)
  })

  it('retains the issuance version as claim-key provenance after claim/admission changes current work version', async () => {
    const f = fixture()
    const issued = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    f.item.status = 'WORKER_REQUESTED'
    f.item.currentAttempt = 2
    f.item.version += 1
    expect(await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)).toEqual(issued)
  })

  it.each(['global-conflict', 'unrecorded-dispatch'])('refuses %s before fresh internal claim effects', async kind => {
    const f = fixture()
    const issued = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    if (kind === 'global-conflict')
      f.tx.qualityJourneyProviderRun.findFirst.mockResolvedValue({ id: 'global-conflict' })
    else
      f.tx.qualityJourneyWorkAttempt.findMany.mockResolvedValue([{ id: 'historical', status: 'DISPATCH_UNRESOLVED' }])
    f.tx.qualityJourneyWorkItem.updateMany.mockClear()
    const client = {
      $transaction: async (callback: (tx: Prisma.TransactionClient) => unknown) => callback(f.db),
    } as unknown as PrismaClient
    await expect(
      claimExternalQualityJourneyAnalysisFollowup(
        {
          ...f.scope,
          role: 'REQUIREMENT_ANALYZER',
          expected: issued.expected!,
          principal: { principalId: 'coordinator:project', assurance: 'PROJECT_CREDENTIAL_ONLY' },
          assignmentSecret: 's'.repeat(32),
          idempotencyKey: 'historical-claim',
          coordinatorSessionId: 'session',
          coordinatorGeneration: 1,
          coordinatorPrincipalId: 'coordinator:project',
        },
        client,
      ),
    ).rejects.toThrow(/reconciliation/)
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAttempt.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyExternalWorkClaimReceipt.create).not.toHaveBeenCalled()
  })

  it('refuses a foreign occupied HUB before the internal claim CAS or new attempt', async () => {
    const f = fixture()
    const issued = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    f.tx.qualityJourneyProviderSlot.findUnique.mockResolvedValue({
      intentId: 'foreign-intent',
      providerRunId: 'foreign-run',
    })
    f.tx.qualityJourneyWorkItem.updateMany.mockClear()
    const client = {
      $transaction: async (callback: (tx: Prisma.TransactionClient) => unknown) => callback(f.db),
    } as unknown as PrismaClient
    await expect(
      claimExternalQualityJourneyAnalysisFollowup(
        {
          ...f.scope,
          role: 'REQUIREMENT_ANALYZER',
          expected: issued.expected!,
          principal: { principalId: 'coordinator:project', assurance: 'PROJECT_CREDENTIAL_ONLY' },
          assignmentSecret: 's'.repeat(32),
          idempotencyKey: 'occupied-claim',
          coordinatorSessionId: 'session',
          coordinatorGeneration: 1,
          coordinatorPrincipalId: 'coordinator:project',
        },
        client,
      ),
    ).rejects.toThrow(/physical reconciliation/)
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAttempt.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyExternalWorkClaimReceipt.create).not.toHaveBeenCalled()
  })

  it('enforces per-authorization exhaustion inside the internal claim with lifetime space remaining', async () => {
    const f = fixture()
    const issued = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    f.item.currentAttempt = 2
    f.authorizations.at(-1)!.maxAttempts = 1
    f.tx.qualityJourneyWorkAttempt.count.mockImplementation(async ({ where }) => (where.authorizationId ? 1 : 2))
    f.tx.qualityJourneyWorkItem.updateMany.mockClear()
    const client = {
      $transaction: async (callback: (tx: Prisma.TransactionClient) => unknown) => callback(f.db),
    } as unknown as PrismaClient
    await expect(
      claimExternalQualityJourneyAnalysisFollowup(
        {
          ...f.scope,
          role: 'REQUIREMENT_ANALYZER',
          expected: issued.expected!,
          principal: { principalId: 'coordinator:project', assurance: 'PROJECT_CREDENTIAL_ONLY' },
          assignmentSecret: 's'.repeat(32),
          idempotencyKey: 'exhausted-authorization',
          coordinatorSessionId: 'session',
          coordinatorGeneration: 1,
          coordinatorPrincipalId: 'coordinator:project',
        },
        client,
      ),
    ).rejects.toThrow(/exhausted or inconsistent/)
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAuthorization.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAttempt.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyExternalWorkClaimReceipt.create).not.toHaveBeenCalled()
  })

  it('enforces the lifetime ceiling inside internal claim before CAS, opt-in or receipt creation', async () => {
    const f = fixture()
    const issued = await ensureQualityJourneyAnalysisFollowupInTransaction(f.scope, f.db)
    f.item.currentAttempt = 3
    f.tx.qualityJourneyWorkItem.updateMany.mockClear()
    const client = {
      $transaction: async (callback: (tx: Prisma.TransactionClient) => unknown) => callback(f.db),
    } as unknown as PrismaClient
    await expect(
      claimExternalQualityJourneyAnalysisFollowup(
        {
          ...f.scope,
          role: 'REQUIREMENT_ANALYZER',
          expected: issued.expected!,
          principal: { principalId: 'coordinator:project', assurance: 'PROJECT_CREDENTIAL_ONLY' },
          assignmentSecret: 's'.repeat(32),
          idempotencyKey: 'internal-claim',
          coordinatorSessionId: 'session',
          coordinatorGeneration: 1,
          coordinatorPrincipalId: 'coordinator:project',
        },
        client,
      ),
    ).rejects.toThrow(/exhausted or inconsistent/)
    expect(f.tx.qualityJourneyWorkItem.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAuthorization.updateMany).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyWorkAttempt.create).not.toHaveBeenCalled()
    expect(f.tx.qualityJourneyExternalWorkClaimReceipt.create).not.toHaveBeenCalled()
  })
})
