import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

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
    data: { id: conversationId, targetProjectId: 'target-execution', title: 'Guest checkout' },
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
      expect(await value.client.qualityJourneyExecutionCycle.count()).toBe(0)
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
      const next = await requestConversationExecution(value.request, value.client)
      if (!('consentRequired' in next)) throw new Error('Expired grant must require new permission')
      expect(next.consentRequired.executionConsentId).not.toBe(input.executionConsentId)
      expect(starts).toHaveLength(0)
    } finally {
      await value.client.$disconnect()
    }
  })
})
