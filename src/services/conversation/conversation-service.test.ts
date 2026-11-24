import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const guard = vi.hoisted(() => ({ prepare: vi.fn(async () => undefined) }))
vi.mock('@/config/db-config', () => ({
  default: new Proxy(
    {},
    {
      get() {
        throw new Error('The production database must not be used by conversation tests.')
      },
    },
  ),
}))
vi.mock('@/services/coordinator/quality-journey-shared-resource-guard-service', () => ({
  prepareSharedResourceMutationInTransaction: guard.prepare,
}))

import {
  appendConversationTurn,
  getProjectConversation,
  listProjectConversations,
  listRecentProjectConversations,
  replayConversationTurn,
} from './conversation-service'
import { deleteTargetProject } from '@/services/target-project/target-project-service'

const migration = path.join(process.cwd(), 'prisma/migrations/20261124010000_add_project_conversations/migration.sql')
const projectA = 'project-a'
const projectB = 'project-b'
let directory: string
let client: PrismaClient

async function fullProjectDatabase(projectId: string): Promise<PrismaClient> {
  const fullFile = path.join(directory, `${projectId}.db`)
  const ddl = execFileSync(
    'npx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { cwd: process.cwd(), encoding: 'utf8' },
  )
  execFileSync('sqlite3', [fullFile], { input: ddl })
  const full = new PrismaClient({ datasources: { db: { url: `file:${fullFile}` } } })
  await full.targetProject.create({
    data: {
      id: projectId,
      kind: 'LOCAL_WORKSPACE',
      canonicalIdentity: `path:/disposable-${projectId}`,
      canonicalPath: `/disposable-${projectId}`,
      displayName: 'Disposable',
      fingerprint: `disposable-${projectId}`,
    },
  })
  return full
}

beforeEach(() => {
  guard.prepare.mockReset()
  guard.prepare.mockResolvedValue(undefined)
  directory = mkdtempSync(path.join(tmpdir(), 'appraise-conversation-'))
  const file = path.join(directory, 'scratch.db')
  // Begin from an existing project table, then apply the additive migration.
  execFileSync('sqlite3', [
    file,
    'PRAGMA foreign_keys = ON; CREATE TABLE "TargetProject" ("id" TEXT NOT NULL PRIMARY KEY);',
  ])
  execFileSync('sqlite3', [file, readFileSync(migration, 'utf8')])
  execFileSync('sqlite3', [file, `INSERT INTO "TargetProject" ("id") VALUES ('${projectA}'), ('${projectB}');`])
  client = new PrismaClient({ datasources: { db: { url: `file:${file}` } } })
})
afterEach(async () => {
  await client.$disconnect()
  rmSync(directory, { recursive: true, force: true })
})

describe('durable project conversations', () => {
  it('upgrades an existing SQLite project with restrictive FKs and survives client restart', async () => {
    const first = await appendConversationTurn(
      { targetProjectId: projectA, idempotencyKey: 'first', content: 'Check login' },
      client,
    )
    await client.$disconnect()
    client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'scratch.db')}` } } })
    const loaded = await getProjectConversation(
      { targetProjectId: projectA, conversationId: first.conversation.id },
      client,
    )
    expect(loaded.messages.map(item => item.content)).toEqual(['Check login'])
    await expect(client.targetProject.delete({ where: { id: projectA } })).rejects.toThrow()
    await expect(client.projectConversation.delete({ where: { id: first.conversation.id } })).rejects.toThrow()
  })

  it('scopes list and history, orders turns, and replays the original answer after source title changes', async () => {
    const first = await appendConversationTurn(
      {
        targetProjectId: projectA,
        idempotencyKey: 'one',
        content: '  Inspect login  ',
        context: { kind: 'TEST_CASE', id: 'case-1', title: 'Old title' },
        reply: { content: 'Found the test.', records: [{ kind: 'TEST_CASE', id: 'case-1', title: 'Old title' }] },
      },
      client,
    )
    const second = await appendConversationTurn(
      {
        targetProjectId: projectA,
        conversationId: first.conversation.id,
        idempotencyKey: 'two',
        content: 'What failed?',
        reply: { content: 'Nothing failed.' },
      },
      client,
    )
    expect(second.messages.map(item => item.ordinal)).toEqual([3, 4])
    const replay = await replayConversationTurn(
      {
        targetProjectId: projectA,
        idempotencyKey: 'one',
        content: 'Inspect login',
        context: { kind: 'TEST_CASE', id: 'case-1' },
      },
      client,
    )
    expect(replay?.replayed).toBe(true)
    expect(replay?.messages[1].records).toEqual([{ kind: 'TEST_CASE', id: 'case-1', title: 'Old title' }])
    const history = await getProjectConversation(
      { targetProjectId: projectA, conversationId: first.conversation.id },
      client,
    )
    expect(history.messages.map(item => item.ordinal)).toEqual([1, 2, 3, 4])
    expect(
      (
        await getProjectConversation(
          { targetProjectId: projectA, conversationId: first.conversation.id, beforeOrdinal: 3 },
          client,
        )
      ).messages.map(item => item.ordinal),
    ).toEqual([1, 2])
    expect(await listProjectConversations({ targetProjectId: projectB }, client)).toEqual([])
    await expect(
      getProjectConversation({ targetProjectId: projectB, conversationId: first.conversation.id }, client),
    ).rejects.toMatchObject({ statusCode: 404 })
    const sidebar = await listRecentProjectConversations([projectA, projectB], client)
    expect(sidebar[projectA][0].id).toBe(first.conversation.id)
    expect(sidebar[projectB]).toEqual([])
    const manyProjects = await listRecentProjectConversations(
      [projectA, ...Array.from({ length: 100 }, (_, index) => `other-${index}`)],
      client,
    )
    expect(Object.keys(manyProjects)).toHaveLength(101)
    expect(manyProjects[projectA][0].id).toBe(first.conversation.id)
  })

  it('rejects changed idempotency requests and retains the first committed pair', async () => {
    const first = await appendConversationTurn(
      { targetProjectId: projectA, idempotencyKey: 'same', content: 'Find reports', reply: { content: 'Report A' } },
      client,
    )
    const retry = await appendConversationTurn(
      {
        targetProjectId: projectA,
        idempotencyKey: 'same',
        content: 'Find reports',
        reply: { content: 'Changed answer' },
      },
      client,
    )
    expect(retry.replayed).toBe(true)
    expect(retry.messages.map(item => item.id)).toEqual(first.messages.map(item => item.id))
    await expect(
      appendConversationTurn({ targetProjectId: projectA, idempotencyKey: 'same', content: 'Delete reports' }, client),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(await client.projectConversationMessage.count({ where: { conversationId: first.conversation.id } })).toBe(2)
  })

  it('deletes finite conversation messages before conversations on a real disposable project database', async () => {
    const full = await fullProjectDatabase('delete-project')
    try {
      const turn = await appendConversationTurn(
        {
          targetProjectId: 'delete-project',
          idempotencyKey: 'first',
          content: 'Search tests',
          reply: { content: 'Found no tests.' },
        },
        full,
      )
      expect(await full.projectConversationMessage.count({ where: { conversationId: turn.conversation.id } })).toBe(2)
      await deleteTargetProject('delete-project', full)
      expect(await full.projectConversationMessage.count()).toBe(0)
      expect(await full.projectConversation.count()).toBe(0)
      expect(await full.targetProject.count()).toBe(0)
    } finally {
      await full.$disconnect()
    }
  })

  it('renames only the attached case title atomically with the turn and scoped shared-resource guard', async () => {
    const full = await fullProjectDatabase('rename-project')
    try {
      await full.testCase.create({
        data: {
          id: 'rename-case',
          targetProjectId: 'rename-project',
          title: 'Old checkout title',
          description: 'Keep this detail',
        },
      })
      const turn = await appendConversationTurn(
        {
          targetProjectId: 'rename-project',
          idempotencyKey: 'rename-one',
          content: 'Rename this case to Checkout smoke',
          context: { kind: 'TEST_CASE', id: 'rename-case', title: 'Old checkout title' },
          renameAttachedCaseTo: 'Checkout smoke',
        },
        full,
      )
      expect(turn.messages.map(row => row.role)).toEqual(['USER', 'APPRAISE'])
      expect(turn.messages.map(row => row.ordinal)).toEqual([1, 2])
      expect(turn.messages[1].records).toEqual([{ kind: 'TEST_CASE', id: 'rename-case', title: 'Checkout smoke' }])
      expect(
        await full.testCase.findUnique({
          where: { id: 'rename-case' },
          select: {
            title: true,
            description: true,
            targetProjectId: true,
            archivedAt: true,
          },
        }),
      ).toEqual({
        title: 'Checkout smoke',
        description: 'Keep this detail',
        targetProjectId: 'rename-project',
        archivedAt: null,
      })
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'rename-project', {
        existing: [{ kind: 'TEST_CASE', resourceId: 'rename-case' }],
        newRoots: [],
        deleted: [],
      })
    } finally {
      await full.$disconnect()
    }
  })

  it('rolls back stale, foreign, and guard-refused renames without a message or title change', async () => {
    const full = await fullProjectDatabase('rename-project')
    try {
      await full.targetProject.create({
        data: {
          id: 'foreign-project',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: 'path:/foreign-project',
          canonicalPath: '/foreign-project',
          displayName: 'Foreign',
          fingerprint: 'foreign-project',
        },
      })
      await full.testCase.createMany({
        data: [
          { id: 'own-case', targetProjectId: 'rename-project', title: 'Original title', description: 'Preserve' },
          { id: 'foreign-case', targetProjectId: 'foreign-project', title: 'Foreign title', description: 'Preserve' },
          {
            id: 'archived-case',
            targetProjectId: 'rename-project',
            title: 'Archived title',
            description: 'Preserve',
            archivedAt: new Date(),
          },
        ],
      })
      const base = {
        targetProjectId: 'rename-project',
        content: 'Rename this case to Revised title',
        renameAttachedCaseTo: 'Revised title',
      }
      await expect(
        appendConversationTurn(
          { ...base, idempotencyKey: 'stale', context: { kind: 'TEST_CASE', id: 'own-case', title: 'Stale title' } },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 409 })
      expect(guard.prepare).not.toHaveBeenCalled()
      await expect(
        appendConversationTurn(
          {
            ...base,
            idempotencyKey: 'foreign',
            context: { kind: 'TEST_CASE', id: 'foreign-case', title: 'Foreign title' },
          },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 404 })
      await expect(
        appendConversationTurn(
          {
            ...base,
            idempotencyKey: 'archived',
            context: { kind: 'TEST_CASE', id: 'archived-case', title: 'Archived title' },
          },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 404 })
      expect(guard.prepare).not.toHaveBeenCalled()
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(
        appendConversationTurn(
          { ...base, idempotencyKey: 'guard', context: { kind: 'TEST_CASE', id: 'own-case', title: 'Original title' } },
          full,
        ),
      ).rejects.toThrow('guard refused')
      expect(await full.projectConversation.count()).toBe(0)
      expect(await full.projectConversationMessage.count()).toBe(0)
      expect((await full.testCase.findUniqueOrThrow({ where: { id: 'own-case' } })).title).toBe('Original title')
      expect((await full.testCase.findUniqueOrThrow({ where: { id: 'foreign-case' } })).title).toBe('Foreign title')
    } finally {
      await full.$disconnect()
    }
  })

  it('replays a committed rename after manual edits or case deletion without repeating the mutation', async () => {
    const full = await fullProjectDatabase('rename-project')
    try {
      await full.testCase.create({
        data: {
          id: 'rename-case',
          targetProjectId: 'rename-project',
          title: 'First title',
          description: 'Keep',
        },
      })
      const request = {
        targetProjectId: 'rename-project',
        idempotencyKey: 'rename-once',
        content: 'Rename this case to Second title',
        context: { kind: 'TEST_CASE' as const, id: 'rename-case', title: 'First title' },
        renameAttachedCaseTo: 'Second title',
      }
      const committed = await appendConversationTurn(request, full)
      guard.prepare.mockClear()
      await full.testCase.update({ where: { id: 'rename-case' }, data: { title: 'Manual third title' } })
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      expect((await full.testCase.findUniqueOrThrow({ where: { id: 'rename-case' } })).title).toBe('Manual third title')
      await full.testCase.delete({ where: { id: 'rename-case' } })
      const recovered = await replayConversationTurn(
        {
          targetProjectId: request.targetProjectId,
          idempotencyKey: request.idempotencyKey,
          content: request.content,
          context: { kind: 'TEST_CASE', id: 'rename-case' },
        },
        full,
      )
      expect(recovered?.messages[1].records[0].title).toBe('Second title')
      expect(guard.prepare).not.toHaveBeenCalled()
      expect(
        await full.projectConversationMessage.count({ where: { conversationId: committed.conversation.id } }),
      ).toBe(2)
    } finally {
      await full.$disconnect()
    }
  })
})
