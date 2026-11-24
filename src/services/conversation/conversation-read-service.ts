import { randomUUID } from 'node:crypto'
import type {
  Prisma,
  PrismaClient,
  ProjectConversationChatGptEngine,
  ProjectConversationRead,
  ProjectConversationReadProvider,
} from '@prisma/client'
import { z } from 'zod'

import prisma from '@/config/db-config'
import { workspaceRecordKinds, type WorkspaceRecord } from '@/lib/conversation/workspace-records'
import { parseWorkspaceRequest, type WorkspaceRequest } from '@/lib/conversation/workspace-request'
import { ServiceError } from '@/services/shared/errors'
import { searchWorkspaceRecords } from '@/services/workspace-search/workspace-record-search'

const runTimeoutMs = 45_000
const reservationLifetimeMs = 60_000
type Scope = { targetProjectId: string; conversationId: string }
type ReadInput = Scope & { messageId: string; expectedEngine?: ProjectConversationChatGptEngine }
type ReadDatabase = Prisma.TransactionClient | PrismaClient

export type ConversationReadAttempt = {
  id: string
  messageId: string
  engine: ProjectConversationChatGptEngine
  state: ProjectConversationRead['state']
  released: boolean
  records: WorkspaceRecord[]
}

export type ConversationLookupProvider = (input: {
  query: WorkspaceRequest
  lookup: () => Promise<readonly WorkspaceRecord[]>
  signal: AbortSignal
}) => Promise<'completed' | 'failed'>

const workspaceRecords = z
  .array(
    z.object({
      kind: z.enum(workspaceRecordKinds),
      id: z.string().min(1).max(200),
      title: z.string().min(1).max(512),
    }),
  )
  .max(8)

function readRecords(serialized: string | null) {
  if (serialized === null) return []
  try {
    return workspaceRecords.parse(JSON.parse(serialized))
  } catch {
    throw new ServiceError('Saved provider results could not be read.', 'CONFLICT')
  }
}

function snapshot(row: ProjectConversationRead, now: Date): ConversationReadAttempt {
  const expired = row.state === 'RUNNING' && row.expiresAt <= now
  return {
    id: row.id,
    messageId: row.messageId,
    engine: row.engine,
    state: expired ? 'UNKNOWN' : row.state,
    released: row.releasedAt !== null,
    records: readRecords(row.recordsJson),
  }
}

function conversationWhere(scope: Scope) {
  return { id: scope.conversationId, targetProjectId: scope.targetProjectId }
}

async function scopedConversation(db: ReadDatabase, scope: Scope) {
  const conversation = await db.projectConversation.findFirst({
    where: conversationWhere(scope),
    select: { readProvider: true, chatGptEngine: true },
  })
  if (!conversation) throw new ServiceError('Conversation not found.', 'NOT_FOUND')
  return conversation
}

async function acknowledgeExpiry(tx: ReadDatabase, conversationId: string, now: Date) {
  await tx.projectConversationRead.updateMany({
    where: { blockedConversationId: conversationId, state: 'RUNNING', expiresAt: { lte: now } },
    data: { state: 'UNKNOWN', settledAt: now },
  })
}

export async function readConversationProviderState(
  scope: Scope,
  visibleMessageIds: readonly string[],
  client: PrismaClient = prisma,
) {
  const now = new Date()
  const { readProvider, chatGptEngine } = await scopedConversation(client, scope)
  const attempts = await client.projectConversationRead.findMany({
    where: {
      conversationId: scope.conversationId,
      message: { conversation: conversationWhere(scope) },
      OR: [{ blockedConversationId: scope.conversationId }, { messageId: { in: [...visibleMessageIds] } }],
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: visibleMessageIds.length + 1,
  })
  const blocked = attempts.find(item => item.blockedConversationId !== null)
  return {
    readProvider,
    chatGptEngine,
    attempts: attempts.map(row => snapshot(row, now)),
    blocked: blocked && snapshot(blocked, now),
  }
}

export async function setConversationReadProvider(
  scope: Scope,
  readProvider: ProjectConversationReadProvider,
  client: PrismaClient = prisma,
  engine: ProjectConversationChatGptEngine = 'RESPONSES',
) {
  return client.$transaction(async tx => {
    const { readProvider: previous, chatGptEngine: previousEngine } = await scopedConversation(tx, scope)
    if (previous === readProvider && (readProvider !== 'CHATGPT' || previousEngine === engine)) return
    const blocker = await tx.projectConversationRead.findUnique({
      where: { blockedConversationId: scope.conversationId },
      select: { id: true },
    })
    if (blocker) throw new ServiceError('Resolve the outstanding read before switching providers.', 'CONFLICT')
    await tx.projectConversation.update({
      where: conversationWhere(scope),
      data: readProvider === 'CHATGPT' ? { readProvider, chatGptEngine: engine } : { readProvider },
    })
  })
}

export async function releaseUnconfirmedConversationRead(
  scope: Scope & { attemptId: string },
  client: PrismaClient = prisma,
) {
  const now = new Date()
  await client.$transaction(async tx => {
    await scopedConversation(tx, scope)
    await acknowledgeExpiry(tx, scope.conversationId, now)
    const updated = await tx.projectConversationRead.updateMany({
      where: { id: scope.attemptId, blockedConversationId: scope.conversationId, state: 'UNKNOWN' },
      data: { blockedConversationId: null, releasedAt: now },
    })
    if (updated.count === 1) return
    const alreadyReleased = await tx.projectConversationRead.findFirst({
      where: { id: scope.attemptId, conversationId: scope.conversationId, state: 'UNKNOWN', releasedAt: { not: null } },
      select: { id: true },
    })
    if (!alreadyReleased) throw new ServiceError('This read has no unresolved outcome to acknowledge.', 'CONFLICT')
  })
}

async function readRequest(tx: ReadDatabase, input: ReadInput) {
  const message = await tx.projectConversationMessage.findFirst({
    where: { id: input.messageId, conversation: conversationWhere(input), role: 'USER' },
    select: { content: true },
  })
  const query = message && parseWorkspaceRequest(message.content)
  if (!query) throw new ServiceError('Choose a saved workspace lookup.', 'VALIDATION')
  return query
}

function existingAttempt(db: ReadDatabase, input: ReadInput) {
  return db.projectConversationRead.findFirst({
    where: {
      conversationId: input.conversationId,
      messageId: input.messageId,
      provider: 'CHATGPT',
      message: { conversation: conversationWhere(input) },
    },
  })
}

async function reserveRead(input: ReadInput, client: PrismaClient) {
  return client.$transaction(async tx => {
    const { readProvider, chatGptEngine } = await scopedConversation(tx, input)
    const existing = await existingAttempt(tx, input)
    if (existing) return { row: existing }
    if (readProvider !== 'CHATGPT') throw new ServiceError('Choose ChatGPT for this chat first.', 'CONFLICT')
    if (chatGptEngine !== (input.expectedEngine ?? 'RESPONSES')) {
      throw new ServiceError('The selected ChatGPT engine changed before this read started.', 'CONFLICT')
    }
    const blocker = await tx.projectConversationRead.findUnique({
      where: { blockedConversationId: input.conversationId },
      select: { id: true },
    })
    if (blocker) throw new ServiceError('This chat already has an outstanding provider read.', 'CONFLICT')
    const query = await readRequest(tx, input)
    const row = await tx.projectConversationRead.create({
      data: {
        id: randomUUID(),
        conversationId: input.conversationId,
        messageId: input.messageId,
        provider: readProvider,
        engine: chatGptEngine,
        state: 'RUNNING',
        blockedConversationId: input.conversationId,
        expiresAt: new Date(Date.now() + reservationLifetimeMs),
      },
    })
    return { row, query }
  })
}

type Outcome = { state: 'COMPLETED'; records: WorkspaceRecord[] } | { state: 'FAILED' | 'UNKNOWN' }

async function runRead(
  query: WorkspaceRequest,
  read: () => Promise<readonly WorkspaceRecord[]>,
  provider: ConversationLookupProvider,
  expiresAt: Date,
): Promise<Outcome> {
  const remainingMs = expiresAt.getTime() - Date.now()
  if (remainingMs <= 0) return { state: 'UNKNOWN' }
  const signal = AbortSignal.timeout(Math.min(runTimeoutMs, remainingMs))
  let records: WorkspaceRecord[] | undefined
  let requested = false
  let repeated = false
  try {
    const status = await provider({
      query,
      signal,
      async lookup() {
        signal.throwIfAborted()
        if (requested) {
          repeated = true
          throw new Error('Workspace read already requested.')
        }
        requested = true
        records = workspaceRecords.parse(await read())
        return records
      },
    })
    if (status === 'failed') return { state: 'FAILED' }
    if (records && !repeated && !signal.aborted) return { state: 'COMPLETED', records }
  } catch {
    // The provider may have accepted the request before the reply was interrupted.
  }
  return { state: 'UNKNOWN' }
}

async function settleRead(client: PrismaClient, row: ProjectConversationRead, outcome: Outcome) {
  const now = new Date()
  await client.$transaction(async tx => {
    await acknowledgeExpiry(tx, row.conversationId, now)
    await tx.projectConversationRead.updateMany({
      where: { id: row.id, blockedConversationId: row.conversationId, state: 'RUNNING', expiresAt: { gt: now } },
      data: {
        state: outcome.state,
        settledAt: now,
        blockedConversationId: outcome.state === 'UNKNOWN' ? row.conversationId : null,
        recordsJson: outcome.state === 'COMPLETED' ? JSON.stringify(outcome.records) : null,
      },
    })
  })
  const actual = await client.projectConversationRead.findUnique({ where: { id: row.id } })
  if (!actual) throw new ServiceError('Provider read not found.', 'NOT_FOUND')
  return snapshot(actual, now)
}

export async function verifyConversationLookup(
  input: ReadInput,
  provider: ConversationLookupProvider,
  client: PrismaClient = prisma,
  read = searchWorkspaceRecords,
) {
  const previous = await existingAttempt(client, input)
  if (previous) return snapshot(previous, new Date())
  const { row, query } = await reserveRead(input, client).catch(async error => {
    // Concurrent duplicates can collide on the message or conversation reservation.
    const winner = await existingAttempt(client, input)
    if (winner) return { row: winner, query: undefined }
    throw error
  })
  if (!query) return snapshot(row, new Date())
  const outcome = await runRead(query, () => read(input.targetProjectId, query), provider, row.expiresAt)
  return settleRead(client, row, outcome)
}
