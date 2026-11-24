import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient, ProjectConversation, ProjectConversationMessage } from '@prisma/client'

import prisma from '@/config/db-config'
import { isSharedResourceId } from '@/lib/quality-journey/shared-resource-contract'
import { ServiceError } from '@/services/shared/errors'
import { renameTestCaseTitleInTransaction } from '@/services/test-case/test-case-service'

export const conversationRecordKinds = ['TEST_CASE', 'TEST_SUITE', 'CASE_TEMPLATE', 'TEST_RUN', 'REPORT'] as const
export type ConversationRecordKind = (typeof conversationRecordKinds)[number]
export type ConversationRecord = { kind: ConversationRecordKind; id: string; title: string }
export type ConversationContext = { kind: 'TEST_CASE' | 'TEST_RUN' | 'REPORT'; id: string; title: string }
export type AppendConversationTurnInput = {
  targetProjectId: string
  conversationId?: string
  idempotencyKey: string
  content: string
  context?: ConversationContext
  /** Only a trusted app boundary may supply a locally verified, read-only reply. */
  reply?: { content: string; records?: readonly ConversationRecord[] }
  /** Exact attached TEST_CASE rename; mutually exclusive with a precomputed reply. */
  renameAttachedCaseTo?: string
}
export type ConversationSummary = {
  id: string
  targetProjectId: string
  title: string
  createdAt: number
  updatedAt: number
}
export type ConversationMessage = {
  id: string
  conversationId: string
  ordinal: number
  role: 'USER' | 'APPRAISE'
  content: string
  context: ConversationContext | null
  records: ConversationRecord[]
  createdAt: number
}
export type ConversationTurn = { conversation: ConversationSummary; messages: ConversationMessage[]; replayed: boolean }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const bad = (message: string): never => {
  throw new ServiceError(message, 'VALIDATION', 400)
}
const conflict = (message: string): never => {
  throw new ServiceError(message, 'CONFLICT', 409)
}
const validateProject = (id: unknown): string => (isSharedResourceId(id) ? id : bad('Target project id is invalid.'))
const validateUuid = (id: unknown): string =>
  typeof id === 'string' && uuid.test(id) ? id.toLowerCase() : bad('Conversation id must be a UUID.')
const bounded = (value: unknown, name: string, max: number): string => {
  if (typeof value !== 'string') return bad(`${name} is invalid.`)
  const normalized = value.replace(/\r\n?/g, '\n').trim()
  if (!normalized || Buffer.byteLength(normalized, 'utf8') > max) return bad(`${name} is out of bounds.`)
  return normalized
}
const sourceId = (value: unknown, name: string): string =>
  typeof value === 'string' && /^[\x20-\x7e]{1,200}$/.test(value) ? value : bad(`${name} is invalid.`)
const sourceTitle = (value: unknown, name: string): string => {
  const title = bounded(value, name, 2_048)
  return title.length <= 512 ? title : bad(`${name} is out of bounds.`)
}
const chatContent = (value: unknown, name: string): string => {
  const content = bounded(value, name, 32_768)
  return content.length <= 8_000 ? content : bad(`${name} is out of bounds.`)
}
const attachment = (value: ConversationContext | undefined): ConversationContext | undefined => {
  if (value === undefined) return undefined
  if (!value || !['TEST_CASE', 'TEST_RUN', 'REPORT'].includes(value.kind)) return bad('Context kind is invalid.')
  return { kind: value.kind, id: sourceId(value.id, 'Context id'), title: sourceTitle(value.title, 'Context title') }
}
const replyRecords = (records: readonly ConversationRecord[] | undefined): ConversationRecord[] => {
  if (records === undefined) return []
  if (!Array.isArray(records) || records.length > 8) return bad('Reply records exceed the bound.')
  const seen = new Set<string>()
  return records.map(record => {
    if (!record || !conversationRecordKinds.includes(record.kind)) return bad('Reply record kind is invalid.')
    const result = {
      kind: record.kind,
      id: sourceId(record.id, 'Reply record id'),
      title: sourceTitle(record.title, 'Reply record title'),
    }
    const key = `${result.kind}:${result.id}`
    if (seen.has(key)) return bad('Duplicate reply record.')
    seen.add(key)
    return result
  })
}
const summary = (row: ProjectConversation): ConversationSummary => ({
  id: row.id,
  targetProjectId: row.targetProjectId,
  title: row.title,
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
})
const message = (row: ProjectConversationMessage): ConversationMessage => ({
  id: row.id,
  conversationId: row.conversationId,
  ordinal: row.ordinal,
  role: row.role,
  content: row.content,
  context: row.contextJson ? (JSON.parse(row.contextJson) as ConversationContext) : null,
  records: row.recordsJson ? (JSON.parse(row.recordsJson) as ConversationRecord[]) : [],
  createdAt: row.createdAt.getTime(),
})
const requestDigest = (content: string, context: { kind: ConversationContext['kind']; id: string } | undefined) =>
  createHash('sha256')
    .update(JSON.stringify({ content, context: context ? { kind: context.kind, id: context.id } : null }))
    .digest('hex')
const isUniqueConflict = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'

async function lookupReplay(
  client: PrismaClient,
  targetProjectId: string,
  conversationId: string | undefined,
  key: string,
  digest: string,
): Promise<ConversationTurn | null> {
  const conversation = conversationId
    ? await client.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
    : await client.projectConversation.findUnique({
        where: { targetProjectId_initialIdempotencyKey: { targetProjectId, initialIdempotencyKey: key } },
      })
  if (!conversation) return null
  const user = await client.projectConversationMessage.findUnique({
    where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey: key } },
  })
  if (!user) return null
  if (user.role !== 'USER' || user.requestHash !== digest)
    return conflict('Idempotency key was used for a different message.')
  const rows = await client.projectConversationMessage.findMany({
    where: { conversationId: conversation.id, turnId: user.turnId },
    orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
    take: 2,
  })
  if (rows.length < 1 || rows[0].id !== user.id) return conflict('Conversation turn is inconsistent.')
  return { conversation: summary(conversation), messages: rows.map(message), replayed: true }
}

/** Recover a committed answer before any mutable source record is resolved again. */
export async function replayConversationTurn(
  input: {
    targetProjectId: string
    conversationId?: string
    idempotencyKey: string
    content: string
    context?: { kind: ConversationContext['kind']; id: string }
  },
  client: PrismaClient = prisma,
): Promise<ConversationTurn | undefined> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = input.conversationId === undefined ? undefined : validateUuid(input.conversationId)
  const key = bounded(input.idempotencyKey, 'Idempotency key', 128)
  const content = chatContent(input.content, 'Message')
  const context = input.context
  if (
    context &&
    (!['TEST_CASE', 'TEST_RUN', 'REPORT'].includes(context.kind) || !/^[\x20-\x7e]{1,200}$/.test(context.id))
  )
    return bad('Context identity is invalid.')
  return (
    (await lookupReplay(client, targetProjectId, conversationId, key, requestDigest(content, context))) ?? undefined
  )
}

/** Append one user message and its optional verified local answer as a single SQLite transaction. */
export async function appendConversationTurn(
  input: AppendConversationTurnInput,
  client: PrismaClient = prisma,
): Promise<ConversationTurn> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = input.conversationId === undefined ? undefined : validateUuid(input.conversationId)
  const idempotencyKey = bounded(input.idempotencyKey, 'Idempotency key', 128)
  const content = chatContent(input.content, 'Message')
  const context = attachment(input.context)
  const isRename = input.renameAttachedCaseTo !== undefined
  if (isRename && (input.reply !== undefined || context?.kind !== 'TEST_CASE'))
    return bad('A case rename requires a test case attachment and no separate reply.')
  const response = input.reply && {
    content: chatContent(input.reply.content, 'Reply'),
    records: replyRecords(input.reply.records),
  }
  const digest = requestDigest(content, context)
  const prior = await lookupReplay(client, targetProjectId, conversationId, idempotencyKey, digest)
  if (prior) return prior
  try {
    return await client.$transaction(async tx => {
      const project = await tx.targetProject.findUnique({ where: { id: targetProjectId }, select: { id: true } })
      if (!project) throw new ServiceError('Target project not found.', 'NOT_FOUND', 404)
      let conversation = conversationId
        ? await tx.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
        : await tx.projectConversation.findUnique({
            where: {
              targetProjectId_initialIdempotencyKey: { targetProjectId, initialIdempotencyKey: idempotencyKey },
            },
          })
      if (conversationId && !conversation) {
        const foreign = await tx.projectConversation.findUnique({ where: { id: conversationId }, select: { id: true } })
        if (foreign) throw new ServiceError('Conversation not found.', 'NOT_FOUND', 404)
      }
      if (!conversation)
        conversation = await tx.projectConversation.create({
          data: {
            id: conversationId ?? randomUUID(),
            targetProjectId,
            initialIdempotencyKey: idempotencyKey,
            title: content.replace(/\s+/g, ' ').slice(0, 100),
          },
        })
      const existing = await tx.projectConversationMessage.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: conversation.id, idempotencyKey } },
      })
      if (existing) {
        if (existing.requestHash !== digest) return conflict('Idempotency key was used for a different message.')
        const rows = await tx.projectConversationMessage.findMany({
          where: { conversationId: conversation.id, turnId: existing.turnId },
          orderBy: { ordinal: 'asc' },
          take: 2,
        })
        return { conversation: summary(conversation), messages: rows.map(message), replayed: true }
      }
      const count = response || isRename ? 2 : 1
      const allocated = await tx.projectConversation.update({
        where: { id: conversation.id },
        data: { nextOrdinal: { increment: count } },
      })
      const first = allocated.nextOrdinal - count
      let finalResponse = response
      if (isRename && context) {
        const renamed = await renameTestCaseTitleInTransaction(tx, {
          targetProjectId,
          testCaseId: context.id,
          expectedTitle: context.title,
          nextTitle: input.renameAttachedCaseTo!,
        })
        finalResponse = {
          content: `Renamed the test case to “${renamed.title}”.`,
          records: [{ kind: 'TEST_CASE', id: renamed.id, title: renamed.title }],
        }
      }
      const turnId = randomUUID()
      const user = await tx.projectConversationMessage.create({
        data: {
          conversationId: conversation.id,
          ordinal: first,
          role: 'USER',
          content,
          contextJson: context ? JSON.stringify(context) : null,
          turnId,
          idempotencyKey,
          requestHash: digest,
        },
      })
      const rows = [user]
      if (finalResponse)
        rows.push(
          await tx.projectConversationMessage.create({
            data: {
              conversationId: conversation.id,
              ordinal: first + 1,
              role: 'APPRAISE',
              content: finalResponse.content,
              recordsJson: finalResponse.records.length ? JSON.stringify(finalResponse.records) : null,
              turnId,
            },
          }),
        )
      return { conversation: summary(allocated), messages: rows.map(message), replayed: false }
    })
  } catch (error) {
    if (isUniqueConflict(error)) {
      const winner = await lookupReplay(client, targetProjectId, conversationId, idempotencyKey, digest)
      if (winner) return winner
      return conflict('Conversation write conflicted; retry with the same key.')
    }
    throw error
  }
}

export async function listProjectConversations(
  input: { targetProjectId: string; limit?: number; cursor?: string },
  client: PrismaClient = prisma,
): Promise<ConversationSummary[]> {
  const targetProjectId = validateProject(input.targetProjectId)
  const limit = input.limit ?? 30
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return bad('Conversation list limit is invalid.')
  if (input.cursor) {
    validateUuid(input.cursor)
    const cursor = await client.projectConversation.findFirst({
      where: { id: input.cursor, targetProjectId },
      select: { id: true },
    })
    if (!cursor) throw new ServiceError('Conversation cursor not found.', 'NOT_FOUND', 404)
  }
  const rows = await client.projectConversation.findMany({
    where: { targetProjectId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  })
  return rows.map(summary)
}

export async function getProjectConversation(
  input: { targetProjectId: string; conversationId: string; limit?: number; beforeOrdinal?: number },
  client: PrismaClient = prisma,
): Promise<{ conversation: ConversationSummary; messages: ConversationMessage[] }> {
  const targetProjectId = validateProject(input.targetProjectId)
  const conversationId = validateUuid(input.conversationId)
  const limit = input.limit ?? 80
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) return bad('Conversation history limit is invalid.')
  if (input.beforeOrdinal !== undefined && (!Number.isInteger(input.beforeOrdinal) || input.beforeOrdinal < 1))
    return bad('Conversation history cursor is invalid.')
  const row = await client.projectConversation.findFirst({ where: { id: conversationId, targetProjectId } })
  if (!row) throw new ServiceError('Conversation not found.', 'NOT_FOUND', 404)
  const rows = await client.projectConversationMessage.findMany({
    where: { conversationId, ...(input.beforeOrdinal ? { ordinal: { lt: input.beforeOrdinal } } : {}) },
    orderBy: [{ ordinal: 'desc' }, { id: 'desc' }],
    take: limit,
  })
  return { conversation: summary(row), messages: rows.reverse().map(message) }
}

/** Bounded per-project relation reads for the workspace sidebar. */
export async function listRecentProjectConversations(
  projectIds: string[],
  client: PrismaClient = prisma,
): Promise<Record<string, { id: string; title: string; updatedAt: number }[]>> {
  if (!Array.isArray(projectIds) || projectIds.some(id => !isSharedResourceId(id)))
    return bad('Project list is invalid.')
  const unique = [...new Set(projectIds)]
  const result: Record<string, { id: string; title: string; updatedAt: number }[]> = Object.fromEntries(
    unique.map(id => [id, []]),
  )
  if (!unique.length) return result
  for (let offset = 0; offset < unique.length; offset += 100) {
    const rows = await client.targetProject.findMany({
      where: { id: { in: unique.slice(offset, offset + 100) } },
      select: {
        id: true,
        conversations: {
          select: { id: true, title: true, updatedAt: true },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take: 8,
        },
      },
    })
    for (const row of rows)
      result[row.id] = row.conversations.map(item => ({ ...item, updatedAt: item.updatedAt.getTime() }))
  }
  return result
}
