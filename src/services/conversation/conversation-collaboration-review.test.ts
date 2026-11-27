import type { PrismaClient } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
  prepare: vi.fn(),
  divergent: vi.fn(),
}))

vi.mock('@/services/repository-collaboration/operation-service', () => ({
  collaborationPublicDigest: (value: string | null) => (value ? `sha256:${value}` : null),
  decideCollaborationOperationInTransaction: mocks.decide,
  prepareCollaborationOperation: mocks.prepare,
}))
vi.mock('@/services/repository-collaboration/divergent-reconciliation-service', () => ({
  decideDivergentCollaborationProposal: mocks.divergent,
}))

import {
  decideConversationCollaborationInTransaction,
  prepareConversationCollaboration,
  readConversationCollaborationReview,
} from './conversation-collaboration-review'

const digest = 'a'.repeat(64)
const payload = JSON.stringify({
  prepared: [{ recordKey: 'module:one', disposition: 'CONFLICT', requiresDecision: true }],
})
const operation = {
  id: 'operation-1',
  intent: 'RECEIVE',
  state: 'WAITING_FOR_DECISION',
  version: 2,
  preparedDigest: digest,
  preparedJson: payload,
  artifacts: [],
}

describe('conversation collaboration authority', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the original scoped operation and refuses a changed review before deciding', async () => {
    const findFirst = vi.fn().mockResolvedValue(operation)
    const tx = { collaborationOperation: { findFirst } } as unknown as PrismaClient
    const review = await readConversationCollaborationReview('project-1', tx, 'operation-1')
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'operation-1', binding: { targetProjectId: 'project-1' }, state: 'WAITING_FOR_DECISION' },
      }),
    )
    expect(review).toMatchObject({
      operationId: 'operation-1',
      preparedDigest: `sha256:${digest}`,
      reviewItems: [{ recordKey: 'module:one' }],
    })
    await expect(
      decideConversationCollaborationInTransaction(tx, {
        targetProjectId: 'project-1',
        review: { ...review!, expectedVersion: 1 },
        decision: 'USE_INCOMING',
      }),
    ).rejects.toThrow(/changed/)
    expect(mocks.decide).not.toHaveBeenCalled()
  })

  it('passes the complete exact decision set to canonical transaction authority', async () => {
    const tx = {
      collaborationOperation: { findFirst: vi.fn().mockResolvedValue(operation) },
    } as unknown as PrismaClient
    const review = (await readConversationCollaborationReview('project-1', tx, 'operation-1'))!
    mocks.decide.mockResolvedValue({ id: 'operation-1', state: 'READY' })
    expect(
      await decideConversationCollaborationInTransaction(tx, {
        targetProjectId: 'project-1',
        review,
        decision: 'USE_INCOMING',
      }),
    ).toEqual({ operationId: 'operation-1', state: 'READY', afterCommit: 'CONTINUE_ACCEPTED' })
    expect(mocks.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'operation-1',
        expectedVersion: 2,
        preparedDigest: `sha256:${digest}`,
        decisions: [{ recordKey: 'module:one', decision: 'USE_INCOMING' }],
      }),
      tx,
    )
  })

  it('observes a lost preparation response by stable key without a second dispatch', async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({ id: 'binding-1', policyVersion: 1 })
    const findOperation = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'operation-1',
        intent: 'RECEIVE',
        state: 'PREPARING',
        version: 1,
        preparedDigest: null,
      })
    const client = {
      collaborationBinding: { findUnique },
      collaborationOperation: { findUnique: findOperation },
    } as unknown as PrismaClient
    mocks.prepare.mockRejectedValue(new Error('response lost'))
    const result = await prepareConversationCollaboration(
      { targetProjectId: 'project-1', intent: 'RECEIVE', idempotencyKey: 'turn-1' },
      client,
    )
    expect(result).toMatchObject({ id: 'operation-1', state: 'PREPARING', outcome: 'OBSERVED' })
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
  })

  it('returns unknown no-dispatch when no operation can be observed', async () => {
    const client = {
      collaborationBinding: { findUnique: vi.fn().mockResolvedValue({ id: 'binding-1', policyVersion: 1 }) },
      collaborationOperation: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient
    mocks.prepare.mockRejectedValue(new Error('interrupted'))
    expect(
      await prepareConversationCollaboration(
        { targetProjectId: 'project-1', intent: 'RECEIVE', idempotencyKey: 'turn-1' },
        client,
      ),
    ).toEqual({ id: null, state: 'UNKNOWN', outcome: 'UNKNOWN_NO_DISPATCH' })
    expect(mocks.prepare).toHaveBeenCalledTimes(1)
  })
})
