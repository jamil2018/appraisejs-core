import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient, type Prisma } from '@prisma/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { copyMigratedTestDatabase, prepareMigratedTestDatabase } from '@/test/migrated-test-database'
import { seedPreparedJourneyExecution } from '@/test/prepared-journey-execution-fixture'
import {
  grantQualityJourneyExecutionConsent,
  registerQualityJourneyExecutionRuntimeAdapter,
  resetQualityJourneyExecutionRuntimeAdapter,
} from '@/services/coordinator/quality-journey-execution-service'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'

import {
  approveConversationExecution,
  approveConversationExecutionWithTurn,
  readConversationExecution,
  requestConversationExecution,
} from './conversation-execution-service'

const workspaces: string[] = []
const conversationId = '1fd145bd-dc85-49fa-9593-3671bdc47e59'
const otherConversationId = '7fd0ae61-6d32-42a1-999d-3742325e0f8d'

beforeAll(async () => prepareMigratedTestDatabase())
afterEach(async () => {
  resetQualityJourneyExecutionRuntimeAdapter()
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function fixture() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-chat-execution-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'appraise.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}?connection_limit=1` } } })
  const seeded = await seedPreparedJourneyExecution(client, workspace, {
    actualOperationId: 'browser.assertions.visible',
    manifestOperationId: 'browser.assertions.visible',
    managed: true,
    label: 'Guest checkout',
  })
  await client.projectConversation.create({
    data: { id: conversationId, targetProjectId: 'target-execution', title: 'Guest checkout', nextOrdinal: 2 },
  })
  await client.projectConversationMessage.create({
    data: {
      conversationId,
      ordinal: 1,
      role: 'USER',
      content: 'Check guest checkout',
      contextJson: JSON.stringify({ kind: 'QUALITY_JOURNEY', id: seeded.journeyId, title: 'Guest checkout' }),
      turnId: 'turn-1',
    },
  })
  const scope = { client, targetProjectId: 'target-execution', conversationId, journeyId: seeded.journeyId }
  const request = {
    targetProjectId: scope.targetProjectId,
    conversationId: scope.conversationId,
    journeyId: scope.journeyId,
    environmentId: 'environment-execution',
    browserEngine: 'CHROMIUM' as const,
    expectedStateHash: seeded.stateHash,
  }
  return { ...scope, request }
}

describe('saved chat execution permission (SQLite)', () => {
  it.each(['same', 'different-key', 'changed-digest'] as const)(
    'recovers only an overlapping identical typed permission submission (%s)',
    async variant => {
      const value = await fixture()
      const starts: string[] = []
      registerQualityJourneyExecutionRuntimeAdapter({
        start: async input => {
          starts.push(input.executionCycleId)
        },
        cancel: async () => undefined,
        reconcile: async () => undefined,
      })
      let overlap: ReturnType<typeof vi.spyOn> | undefined
      try {
        const requested = await requestConversationExecution(value.request, value.client)
        if (!('consentRequired' in requested)) throw new Error('Run permission was skipped')
        const winnerInput = {
          targetProjectId: value.targetProjectId,
          conversationId,
          journeyId: value.journeyId,
          executionConsentId: requested.consentRequired.executionConsentId,
          expectedScopeHash: requested.consentRequired.scopeHash,
          idempotencyKey: 'overlap-key',
          content: 'Allow and run these tests',
        }
        const loserInput = {
          ...winnerInput,
          ...(variant === 'different-key' ? { idempotencyKey: 'other-key' } : {}),
          ...(variant === 'changed-digest' ? { content: 'Allow and run these tests.' } : {}),
        }
        const originalTransaction = value.client.$transaction.bind(value.client)
        let winner: Awaited<ReturnType<typeof approveConversationExecutionWithTurn>> | undefined
        overlap = vi.spyOn(value.client, '$transaction')
        overlap.mockImplementationOnce((async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
          // The losing call already missed replay and read REQUESTED. Commit the
          // winner before its canonical reservation transaction starts.
          winner = await approveConversationExecutionWithTurn(winnerInput, value.client)
          return originalTransaction(callback)
        }) as PrismaClient['$transaction'])
        if (variant === 'same') {
          const loser = await approveConversationExecutionWithTurn(loserInput, value.client)
          expect(loser.replayed).toBe(true)
          expect(loser.messages.map(message => message.id)).toEqual(winner?.messages.map(message => message.id))
        } else {
          await expect(approveConversationExecutionWithTurn(loserInput, value.client)).rejects.toMatchObject({
            code: 'CONFLICT',
          })
        }
        expect(winner?.replayed).toBe(false)
        expect(starts).toHaveLength(1)
        expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(1)
        expect(await value.client.projectConversationMessage.count({ where: { conversationId } })).toBe(3)
      } finally {
        overlap?.mockRestore()
        await value.client.$disconnect()
      }
    },
  )

  it.each([false, true])('rejects a newer Run permission committed after the outer read (typed=%s)', async typed => {
    const value = await fixture()
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async input => {
        starts.push(input.executionCycleId)
      },
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    let race: ReturnType<typeof vi.spyOn> | undefined
    try {
      const requested = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in requested)) throw new Error('Run permission was skipped')
      const current = await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
        where: { id: requested.consentRequired.executionConsentId },
      })
      const originalTransaction = value.client.$transaction.bind(value.client)
      race = vi.spyOn(value.client, '$transaction')
      race.mockImplementationOnce((async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        await value.client.qualityJourneyExecutionConsent.create({
          data: {
            id: 'newer-chat-permission',
            journeyId: value.journeyId,
            targetProjectId: value.targetProjectId,
            scopeJson: current.scopeJson,
            scopeHash: current.scopeHash,
            grantSource: 'UI',
            status: 'REQUESTED',
            createdAt: new Date(current.createdAt.getTime() + 1_000),
          },
        })
        return originalTransaction(callback)
      }) as PrismaClient['$transaction'])
      const input = {
        targetProjectId: value.targetProjectId,
        conversationId,
        journeyId: value.journeyId,
        executionConsentId: current.id,
        expectedScopeHash: current.scopeHash,
      }
      if (typed)
        await expect(
          approveConversationExecutionWithTurn(
            {
              ...input,
              idempotencyKey: 'typed-race',
              content: 'Allow and run these tests',
            },
            value.client,
          ),
        ).rejects.toMatchObject({ code: 'CONFLICT' })
      else await expect(approveConversationExecution(input, value.client)).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(0)
      expect(await value.client.projectConversationMessage.count({ where: { conversationId } })).toBe(1)
      expect(
        await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({ where: { id: current.id } }),
      ).toMatchObject({ status: 'REQUESTED', grantedAt: null })
      expect(starts).toHaveLength(0)
    } finally {
      race?.mockRestore()
      await value.client.$disconnect()
    }
  })

  it('atomically records the typed human reply before a lost runner response and replays once after provider switch', async () => {
    const value = await fixture()
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async input => {
        starts.push(input.executionCycleId)
        throw new Error('Runner response lost')
      },
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in requested)) throw new Error('Run permission was skipped')
      const input = {
        targetProjectId: value.targetProjectId,
        conversationId: value.conversationId,
        journeyId: value.journeyId,
        executionConsentId: requested.consentRequired.executionConsentId,
        expectedScopeHash: requested.consentRequired.scopeHash,
        idempotencyKey: 'typed-run-once',
        content: 'Allow and run these tests',
      }
      await expect(approveConversationExecutionWithTurn(input, value.client)).rejects.toThrow('Runner response lost')
      const recorded = await value.client.projectConversationMessage.findMany({
        where: { conversationId, idempotencyKey: input.idempotencyKey },
      })
      expect(recorded).toHaveLength(1)
      expect(recorded[0]).toMatchObject({ role: 'USER', content: input.content })
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(1)
      await value.client.projectConversation.update({ where: { id: conversationId }, data: { readProvider: 'CLAUDE' } })
      const consumed = await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
        where: { id: input.executionConsentId },
      })
      await value.client.qualityJourneyExecutionConsent.create({
        data: {
          id: 'later-chat-permission',
          journeyId: value.journeyId,
          targetProjectId: value.targetProjectId,
          scopeJson: consumed.scopeJson,
          scopeHash: consumed.scopeHash,
          grantSource: 'UI',
          status: 'REQUESTED',
          createdAt: new Date(consumed.createdAt.getTime() + 1_000),
        },
      })
      const replay = await approveConversationExecutionWithTurn(input, value.client)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(message => message.role)).toEqual(['USER', 'APPRAISE'])
      expect(replay.messages[1].records).toEqual([
        { kind: 'QUALITY_JOURNEY', id: value.journeyId, title: 'View run activity' },
      ])
      expect(starts).toHaveLength(1)
      await expect(
        approveConversationExecutionWithTurn({ ...input, idempotencyKey: 'typed-run-second' }, value.client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(starts).toHaveLength(1)
      await expect(
        approveConversationExecutionWithTurn({ ...input, expectedScopeHash: `sha256:${'f'.repeat(64)}` }, value.client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await value.client.projectConversationMessage.count({ where: { conversationId } })).toBe(3)
    } finally {
      await value.client.$disconnect()
    }
  })

  it('rolls back canonical consent and reservation when the typed request key is already used', async () => {
    const value = await fixture()
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => {
        throw new Error('must not start')
      },
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in requested)) throw new Error('Run permission was skipped')
      await value.client.projectConversationMessage.create({
        data: {
          conversationId,
          ordinal: 2,
          role: 'USER',
          content: 'Different request',
          turnId: 'other-turn',
          idempotencyKey: 'already-used',
          requestHash: 'different-digest',
        },
      })
      await expect(
        approveConversationExecutionWithTurn(
          {
            targetProjectId: value.targetProjectId,
            conversationId,
            journeyId: value.journeyId,
            executionConsentId: requested.consentRequired.executionConsentId,
            expectedScopeHash: requested.consentRequired.scopeHash,
            idempotencyKey: 'already-used',
            content: 'Allow and run these tests',
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(0)
      expect(
        await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
          where: { id: requested.consentRequired.executionConsentId },
        }),
      ).toMatchObject({ status: 'REQUESTED', grantedAt: null })
    } finally {
      await value.client.$disconnect()
    }
  })
  it('binds exact permission to one chat and observes an uncertain launch after reconnect', async () => {
    const value = await fixture()
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async input => {
        starts.push(input.executionCycleId)
        throw new Error('Response lost after reservation')
      },
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in requested)) throw new Error('Run permission was skipped')
      const input = {
        targetProjectId: value.targetProjectId,
        conversationId: value.conversationId,
        journeyId: value.journeyId,
        executionConsentId: requested.consentRequired.executionConsentId,
        expectedScopeHash: requested.consentRequired.scopeHash,
      }
      const before = await readConversationExecution(value, value.client)
      expect(before.permission).toMatchObject({
        id: input.executionConsentId,
        status: 'REQUESTED',
        stale: false,
        expired: false,
        target: 'Guest checkout',
        environment: { name: 'local', baseUrl: 'http://127.0.0.1:3000' },
      })
      expect(before.permission?.scenarios).toMatchObject([{ title: 'Guest checkout' }])
      await expect(
        approveConversationExecution({ ...input, conversationId: otherConversationId }, value.client),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(approveConversationExecution(input, value.client)).resolves.toMatchObject({
        cycles: [{ status: 'RESERVED' }],
      })
      expect(starts).toHaveLength(1)
      await value.client.projectConversation.update({
        where: { id: conversationId },
        data: { readProvider: 'CLAUDE' },
      })
      await value.client.qualityJourney.update({
        where: { id: value.journeyId },
        data: { status: 'PAUSED' },
      })
      const reopened = await readConversationExecution(value, value.client)
      expect(reopened.paused).toBe(true)
      expect(reopened.execution.consents).toMatchObject([{ status: 'CONSUMED' }])
      expect(reopened.cycles).toHaveLength(1)
      await expect(approveConversationExecution(input, value.client)).resolves.toMatchObject({
        cycles: [{ id: reopened.cycles[0]!.id }],
      })
      expect(starts).toHaveLength(1)
    } finally {
      await value.client.$disconnect()
    }
  })

  it('requires fresh permission when the reviewed environment changes', async () => {
    const value = await fixture()
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async () => undefined,
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const requested = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in requested)) throw new Error('Run permission was skipped')
      const input = {
        targetProjectId: value.targetProjectId,
        conversationId: value.conversationId,
        journeyId: value.journeyId,
        executionConsentId: requested.consentRequired.executionConsentId,
        expectedScopeHash: requested.consentRequired.scopeHash,
      }
      await value.client.environment.update({
        where: { id: 'environment-execution' },
        data: { baseUrl: 'http://127.0.0.1:3999', scopeVersion: { increment: 1 } },
      })
      expect((await readConversationExecution(value, value.client)).permission).toMatchObject({ stale: true })
      await expect(approveConversationExecution(input, value.client)).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        approveConversationExecutionWithTurn(
          {
            ...input,
            idempotencyKey: 'typed-stale',
            content: 'Allow and run these tests',
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(0)
      expect(await value.client.projectConversationMessage.count({ where: { conversationId } })).toBe(1)
      expect(
        await value.client.qualityJourneyExecutionConsent.findUniqueOrThrow({
          where: { id: input.executionConsentId },
        }),
      ).toMatchObject({ status: 'REQUESTED', grantedAt: null })
      const next = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in next)) throw new Error('Changed environment must require new permission')
      expect(next.consentRequired.executionConsentId).not.toBe(input.executionConsentId)
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(0)
    } finally {
      await value.client.$disconnect()
    }
  })

  it('shows an expired grant and requests a new consent without dispatch', async () => {
    const value = await fixture()
    const starts: string[] = []
    registerQualityJourneyExecutionRuntimeAdapter({
      start: async input => void starts.push(input.executionCycleId),
      cancel: async () => undefined,
      reconcile: async () => undefined,
    })
    try {
      const first = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in first)) throw new Error('Run permission was skipped')
      const input = {
        targetProjectId: value.targetProjectId,
        conversationId: value.conversationId,
        journeyId: value.journeyId,
        executionConsentId: first.consentRequired.executionConsentId,
        expectedScopeHash: first.consentRequired.scopeHash,
      }
      await grantQualityJourneyExecutionConsent(
        {
          targetProjectId: input.targetProjectId,
          journeyId: input.journeyId,
          executionConsentId: input.executionConsentId,
          expectedScopeHash: input.expectedScopeHash,
        },
        value.client,
        trustedHumanCoordinatorSession,
      )
      await value.client.qualityJourneyExecutionConsent.update({
        where: { id: input.executionConsentId },
        data: { expiresAt: new Date(Date.now() - 1_000) },
      })
      expect((await readConversationExecution(value, value.client)).permission).toMatchObject({
        id: input.executionConsentId,
        expired: true,
      })
      await expect(approveConversationExecution(input, value.client)).rejects.toMatchObject({ code: 'CONFLICT' })
      await expect(
        approveConversationExecutionWithTurn(
          {
            ...input,
            idempotencyKey: 'typed-expired',
            content: 'Allow and run these tests',
          },
          value.client,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      expect(await value.client.projectConversationMessage.count({ where: { conversationId } })).toBe(1)
      const next = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in next)) throw new Error('Expired grant must require new permission')
      expect(next.consentRequired.executionConsentId).not.toBe(input.executionConsentId)
      expect(starts).toHaveLength(0)
    } finally {
      await value.client.$disconnect()
    }
  })
})
