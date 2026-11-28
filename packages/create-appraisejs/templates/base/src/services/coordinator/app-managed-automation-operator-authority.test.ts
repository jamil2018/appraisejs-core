import type { Prisma } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { assertOperatorAutomationLocatorAuthority } from './app-managed-automation-operator-authority'

function fixture() {
  const now = new Date('2026-11-20T00:00:00Z')
  const failureJson = JSON.stringify({
    state: 'UNKNOWN',
    stage: 'NATIVE_SEND',
    senderCleanupVerified: false,
    canonicalSubmissionStarted: false,
    recoveryEligible: false,
  })
  const prior = {
    id: 'prior',
    workItemId: 'work',
    status: 'CANCELLED',
    cancelledAt: now,
    failureJson,
    assignmentId: 'old-assignment',
    authorizationId: 'authorization',
    dispatchAdapterId: 'APP_SERVER_LOCAL_V1_PREPARATION_AUTOMATOR',
    dispatchReservedAt: now,
    dispatchStartedAt: now,
    resultJson: null,
    resultHash: null,
  }
  const attempt = {
    id: 'successor',
    workItemId: 'work',
    replacesAttemptId: prior.id,
    externalAdmittedAt: now,
    externalAdmissionHash: 'sealed-admission',
    dispatchAdapterId: null,
    dispatchReservedAt: null,
    dispatchStartedAt: null,
    executionMode: 'EXTERNAL_V1',
    attempt: 2,
  }
  const payload = {
    schemaVersion: 'appraise.automator-manual-recovery/v1',
    workItemId: 'work',
    predecessorAttemptId: prior.id,
    predecessorAssignmentId: prior.assignmentId,
    authorizationId: prior.authorizationId,
    successorAttempt: 2,
    failureJson,
    failureHash: hashCanonical(JSON.parse(failureJson)),
    dispatchReservedAt: now.toISOString(),
    dispatchStartedAt: now.toISOString(),
    nativeOutcome: 'UNKNOWN',
    senderCleanupVerified: false,
    canonicalSubmissionStarted: false,
    acceptedSubmissionCount: 0,
    nativeSend: false,
  }
  const tx = {
    qualityJourneyWorkAttempt: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === attempt.id ? attempt : prior)),
    },
    qualityJourneyEvent: { findMany: vi.fn(async () => [{ payloadJson: JSON.stringify(payload) }]) },
    qualityJourneyExternalSubmissionAcceptance: { count: vi.fn(async () => 0) },
  }
  return {
    prior,
    attempt,
    payload,
    tx: tx as unknown as Prisma.TransactionClient,
    scope: { journeyId: 'journey', targetProjectId: 'target', workItemId: 'work', attemptId: attempt.id },
  }
}

describe('operator supplemental locator authority', () => {
  it('requires the exact fenced predecessor and admitted successor without native dispatch', async () => {
    const f = fixture()
    await expect(assertOperatorAutomationLocatorAuthority(f.scope, f.tx)).resolves.toBeUndefined()
    f.attempt.dispatchAdapterId = 'native' as never
    await expect(assertOperatorAutomationLocatorAuthority(f.scope, f.tx)).rejects.toThrow('exact admitted manual')
  })
  it.each(['failureHash', 'predecessorAssignmentId', 'authorizationId', 'dispatchStartedAt'])(
    'rejects changed immutable %s evidence',
    async key => {
      const f = fixture()
      ;(f.payload as Record<string, unknown>)[key] = 'changed'
      await expect(assertOperatorAutomationLocatorAuthority(f.scope, f.tx)).rejects.toThrow('exact admitted manual')
    },
  )
  it('rejects absence of original native fencing or sender outcome laundering', async () => {
    const f = fixture()
    f.payload.senderCleanupVerified = true
    await expect(assertOperatorAutomationLocatorAuthority(f.scope, f.tx)).rejects.toThrow('exact admitted manual')
    f.payload.senderCleanupVerified = false
    f.prior.status = 'IN_PROGRESS'
    await expect(assertOperatorAutomationLocatorAuthority(f.scope, f.tx)).rejects.toThrow('exact admitted manual')
  })
})
