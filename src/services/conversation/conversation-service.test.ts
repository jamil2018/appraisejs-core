import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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
  getLatestConversationJourney,
  getProjectConversation,
  listProjectConversations,
  listRecentProjectConversations,
  replayConversationTurn,
} from './conversation-service'
import { deleteTargetProject } from '@/services/target-project/target-project-service'
import { copyMigratedTestDatabase, prepareMigratedTestDatabase } from '@/test/migrated-test-database'
import {
  readConversationProviderState,
  releaseUnconfirmedConversationRead,
  setConversationReadProvider,
  verifyConversationLookup,
  type ConversationLookupProvider,
} from './conversation-read-service'

const migration = path.join(process.cwd(), 'prisma/migrations/20261124010000_add_project_conversations/migration.sql')
const providerMigration = path.join(
  process.cwd(),
  'prisma/migrations/20261124020000_add_conversation_read_attempts/migration.sql',
)
const engineMigration = path.join(
  process.cwd(),
  'prisma/migrations/20261124030000_add_conversation_read_engines/migration.sql',
)
const claudeMigration = path.join(
  process.cwd(),
  'prisma/migrations/20261125010000_add_claude_conversation_reads/migration.sql',
)
const projectA = 'project-a'
const projectB = 'project-b'
let directory: string
let client: PrismaClient

async function fullProjectDatabase(projectId: string): Promise<PrismaClient> {
  const fullFile = path.join(directory, `${projectId}.db`)
  await copyMigratedTestDatabase(fullFile)
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

beforeAll(async () => {
  await prepareMigratedTestDatabase()
}, 30_000)

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
  execFileSync('sqlite3', [file, readFileSync(providerMigration, 'utf8')])
  execFileSync('sqlite3', [file, readFileSync(engineMigration, 'utf8')])
  execFileSync('sqlite3', [file, readFileSync(claudeMigration, 'utf8')])
  execFileSync('sqlite3', [file, `INSERT INTO "TargetProject" ("id") VALUES ('${projectA}'), ('${projectB}');`])
  client = new PrismaClient({ datasources: { db: { url: `file:${file}` } } })
})
afterEach(async () => {
  await client.$disconnect()
  rmSync(directory, { recursive: true, force: true })
})

describe('durable project conversations', () => {
  it('retains the latest exact Journey attachment and recognizes its message replay', async () => {
    const context = { kind: 'QUALITY_JOURNEY' as const, id: 'qjy_123', title: 'Guest checkout' }
    const input = {
      targetProjectId: projectA,
      idempotencyKey: 'journey-link',
      content: 'Keep this with my chat.',
      context,
    }
    const committed = await appendConversationTurn(input, client)
    const scope = { targetProjectId: projectA, conversationId: committed.conversation.id }
    expect(await getLatestConversationJourney(scope, client)).toBe(context.id)
    expect(await getLatestConversationJourney({ ...scope, targetProjectId: projectB }, client)).toBeUndefined()
    const replay = await replayConversationTurn(input, client)
    expect(replay).toMatchObject({ replayed: true, messages: [{ context }] })
  })

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
      const projectCount = await full.targetProject.count()
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
      expect(await full.targetProject.findUnique({ where: { id: 'delete-project' } })).toBeNull()
      expect(await full.targetProject.count()).toBe(projectCount - 1)
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

async function savedLookup(name = 'Guest checkout') {
  const turn = await appendConversationTurn(
    {
      targetProjectId: projectA,
      idempotencyKey: name,
      content: `Find test case named ${name}`,
    },
    client,
  )
  return { targetProjectId: projectA, conversationId: turn.conversation.id, messageId: turn.messages[0].id }
}

describe('durable provider reads', () => {
  const records = [{ kind: 'TEST_CASE' as const, id: 'checkout-disposable', title: 'Guest checkout' }]

  it('upgrades historical provider rows with their exact state, records, and blocker intact', async () => {
    const file = path.join(directory, 'legacy-provider.db')
    execFileSync('sqlite3', [
      file,
      'PRAGMA foreign_keys = ON; CREATE TABLE "TargetProject" ("id" TEXT NOT NULL PRIMARY KEY);',
    ])
    execFileSync('sqlite3', [file, readFileSync(migration, 'utf8')])
    execFileSync('sqlite3', [file, readFileSync(providerMigration, 'utf8')])
    execFileSync('sqlite3', [
      file,
      `
      INSERT INTO "TargetProject" ("id") VALUES ('${projectA}');
      INSERT INTO "ProjectConversation" ("id", "targetProjectId", "title", "nextOrdinal", "updatedAt", "readProvider")
        VALUES ('legacy', '${projectA}', 'Checkout', 3, CURRENT_TIMESTAMP, 'CHATGPT');
      INSERT INTO "ProjectConversationMessage" ("id", "conversationId", "ordinal", "role", "content", "turnId")
        VALUES ('old-complete', 'legacy', 1, 'USER', 'Find test case named Checkout', 'turn-1'),
               ('old-unknown', 'legacy', 2, 'USER', 'Find test case named Checkout', 'turn-2');
      INSERT INTO "ProjectConversationRead" ("id", "conversationId", "messageId", "provider", "state", "expiresAt", "settledAt", "recordsJson")
        VALUES ('complete', 'legacy', 'old-complete', 'CHATGPT', 'COMPLETED', 1767225600000, 1767225600000, '[{"kind":"TEST_CASE","id":"old","title":"Checkout"}]');
      INSERT INTO "ProjectConversationRead" ("id", "conversationId", "messageId", "provider", "state", "blockedConversationId", "expiresAt", "settledAt")
        VALUES ('unknown', 'legacy', 'old-unknown', 'CHATGPT', 'UNKNOWN', 'legacy', 1767225600000, 1767225600000);
    `,
    ])
    execFileSync('sqlite3', [file, readFileSync(engineMigration, 'utf8')])
    const priorAttempts = execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversationRead" ORDER BY "id";'], {
      encoding: 'utf8',
    })
    const priorConversation = execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversation";'], {
      encoding: 'utf8',
    })
    execFileSync('sqlite3', [file, readFileSync(claudeMigration, 'utf8')])
    expect(
      execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversationRead" ORDER BY "id";'], {
        encoding: 'utf8',
      }),
    ).toBe(priorAttempts)
    expect(execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversation";'], { encoding: 'utf8' })).toBe(
      priorConversation,
    )
    expect(execFileSync('sqlite3', [file, 'PRAGMA foreign_key_check;'], { encoding: 'utf8' })).toBe('')
    const upgraded = new PrismaClient({ datasources: { db: { url: `file:${file}` } } })
    try {
      const scope = { targetProjectId: projectA, conversationId: 'legacy' }
      const state = await readConversationProviderState(scope, ['old-complete', 'old-unknown'], upgraded)
      expect(state).toMatchObject({
        readProvider: 'CHATGPT',
        chatGptEngine: 'RESPONSES',
        attempts: [
          {
            id: 'complete',
            messageId: 'old-complete',
            engine: 'RESPONSES',
            state: 'COMPLETED',
            records: [{ id: 'old' }],
          },
          { id: 'unknown', messageId: 'old-unknown', engine: 'RESPONSES', state: 'UNKNOWN', released: false },
        ],
        blocked: { id: 'unknown', engine: 'RESPONSES' },
      })
      await expect(setConversationReadProvider(scope, 'CHATGPT', upgraded, 'CODEX')).rejects.toThrow('outstanding read')
    } finally {
      await upgraded.$disconnect()
    }
  })

  it('keeps lookup scope server-side and does not admit an external read in local mode', async () => {
    const input = await savedLookup()
    const provider = vi.fn<ConversationLookupProvider>()
    const search = vi.fn()
    await expect(verifyConversationLookup(input, provider, client, search)).rejects.toThrow('Choose a provider')
    const foreign = { ...input, targetProjectId: projectB }
    await expect(setConversationReadProvider(foreign, 'CHATGPT', client)).rejects.toThrow('not found')
    await expect(verifyConversationLookup(foreign, provider, client, search)).rejects.toThrow('not found')
    expect(provider).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })

  it('deduplicates overlapping sends, blocks switching while running and persists exact verified records', async () => {
    const input = await savedLookup()
    await setConversationReadProvider(input, 'CHATGPT', client)
    const search = vi.fn().mockResolvedValue(records)
    let complete!: () => void
    const wait = new Promise<void>(resolve => {
      complete = resolve
    })
    const provider = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await wait
      await lookup()
      return 'completed'
    })
    const inFlight = verifyConversationLookup(input, provider, client, search)
    try {
      await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(1))
      const duplicate = await verifyConversationLookup(input, provider, client, search)
      expect(duplicate.state).toBe('RUNNING')
      await expect(setConversationReadProvider(input, 'LOCAL', client)).rejects.toThrow('outstanding read')
      await expect(setConversationReadProvider(input, 'CHATGPT', client, 'CODEX')).rejects.toThrow('outstanding read')
      const second = await appendConversationTurn(
        {
          targetProjectId: projectA,
          conversationId: input.conversationId,
          idempotencyKey: 'other',
          content: 'Find test case for order number',
        },
        client,
      )
      await expect(
        verifyConversationLookup({ ...input, messageId: second.messages[0].id }, provider, client, search),
      ).rejects.toThrow('outstanding provider read')
    } finally {
      complete()
      await inFlight
    }
    const completed = await inFlight
    expect(completed).toMatchObject({ state: 'COMPLETED', records })
    expect(search).toHaveBeenCalledExactlyOnceWith(projectA, { kind: 'TEST_CASE', query: 'Guest checkout' })
    await setConversationReadProvider(input, 'LOCAL', client)
    expect(await verifyConversationLookup(input, provider, client, search)).toEqual(completed)
    expect(provider).toHaveBeenCalledTimes(1)
    const snapshot = await readConversationProviderState(input, [input.messageId], client)
    expect(snapshot).toMatchObject({ readProvider: 'LOCAL', attempts: [completed] })
    expect(snapshot.blocked).toBeUndefined()
  })

  it('keeps one saved-message attempt across engines and records a fresh native read with the selected engine', async () => {
    const input = await savedLookup()
    const search = vi.fn().mockResolvedValue(records)
    const responses = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await lookup()
      return 'completed'
    })
    await setConversationReadProvider(input, 'CHATGPT', client)
    const original = await verifyConversationLookup(input, responses, client, search)
    expect(original).toMatchObject({ engine: 'RESPONSES', state: 'COMPLETED', records })

    await setConversationReadProvider(input, 'CHATGPT', client, 'CODEX')
    const native = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await lookup()
      return 'completed'
    })
    expect(await verifyConversationLookup({ ...input, expectedEngine: 'CODEX' }, native, client, search)).toEqual(
      original,
    )
    expect(native).not.toHaveBeenCalled()

    const second = await appendConversationTurn(
      {
        targetProjectId: projectA,
        conversationId: input.conversationId,
        idempotencyKey: 'native-second',
        content: 'Find test case named Checkout',
      },
      client,
    )
    const fresh = { ...input, messageId: second.messages[0].id }
    await expect(verifyConversationLookup(fresh, native, client, search)).rejects.toThrow('engine changed')
    expect(native).not.toHaveBeenCalled()
    const nativeReceipt = await verifyConversationLookup({ ...fresh, expectedEngine: 'CODEX' }, native, client, search)
    expect(nativeReceipt).toMatchObject({ engine: 'CODEX', state: 'COMPLETED', records })
    expect(native).toHaveBeenCalledTimes(1)
    expect(await readConversationProviderState(input, [input.messageId, fresh.messageId], client)).toMatchObject({
      readProvider: 'CHATGPT',
      chatGptEngine: 'CODEX',
      attempts: expect.arrayContaining([original, nativeReceipt]),
    })
  })

  it('keeps one saved-message attempt across providers and persists Claude Code reads', async () => {
    const input = await savedLookup()
    const search = vi.fn().mockResolvedValue(records)
    const chatGpt = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await lookup()
      return 'completed'
    })
    await setConversationReadProvider(input, 'CHATGPT', client, 'CODEX')
    const original = await verifyConversationLookup({ ...input, expectedEngine: 'CODEX' }, chatGpt, client, search)

    await setConversationReadProvider(input, 'CLAUDE', client)
    const claude = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await lookup()
      return 'completed'
    })
    expect(await verifyConversationLookup({ ...input, expectedEngine: 'CLAUDE_CODE' }, claude, client, search)).toEqual(
      original,
    )
    expect(claude).not.toHaveBeenCalled()

    const second = await appendConversationTurn(
      {
        targetProjectId: projectA,
        conversationId: input.conversationId,
        idempotencyKey: 'claude-second',
        content: 'Find test case named Checkout',
      },
      client,
    )
    const fresh = { ...input, messageId: second.messages[0].id }
    await expect(
      verifyConversationLookup({ ...fresh, expectedEngine: 'CODEX' }, claude, client, search),
    ).rejects.toThrow('engine changed')
    const claudeReceipt = await verifyConversationLookup(
      { ...fresh, expectedEngine: 'CLAUDE_CODE' },
      claude,
      client,
      search,
    )
    expect(claudeReceipt).toMatchObject({ engine: 'CLAUDE_CODE', state: 'COMPLETED', records })
    expect(claude).toHaveBeenCalledTimes(1)
    expect(await readConversationProviderState(input, [input.messageId, fresh.messageId], client)).toMatchObject({
      readProvider: 'CLAUDE',
      chatGptEngine: 'CODEX',
      attempts: expect.arrayContaining([original, claudeReceipt]),
    })
    await setConversationReadProvider(input, 'CHATGPT', client, 'CODEX')
    expect(await verifyConversationLookup({ ...fresh, expectedEngine: 'CODEX' }, chatGpt, client, search)).toEqual(
      claudeReceipt,
    )
    expect(chatGpt).toHaveBeenCalledTimes(1)

    await expect(
      client.projectConversationRead.create({
        data: {
          id: 'invalid-provider-engine',
          conversationId: input.conversationId,
          messageId: fresh.messageId,
          provider: 'CLAUDE',
          engine: 'CODEX',
          state: 'FAILED',
          expiresAt: new Date(),
          settledAt: new Date(),
        },
      }),
    ).rejects.toThrow()
  })

  it('retains an uncertain Claude Code attempt while switching providers', async () => {
    const input = await savedLookup()
    await setConversationReadProvider(input, 'CLAUDE', client)
    const claude = vi.fn<ConversationLookupProvider>().mockRejectedValue(new Error('lost reply after send'))
    const read = vi.fn()
    const attempt = await verifyConversationLookup({ ...input, expectedEngine: 'CLAUDE_CODE' }, claude, client, read)
    expect(attempt).toMatchObject({ engine: 'CLAUDE_CODE', state: 'UNKNOWN', released: false })
    await expect(setConversationReadProvider(input, 'CHATGPT', client)).rejects.toThrow('outstanding read')
    await releaseUnconfirmedConversationRead({ ...input, attemptId: attempt.id }, client)
    await setConversationReadProvider(input, 'CHATGPT', client)
    const chatGpt = vi.fn<ConversationLookupProvider>()
    expect(await verifyConversationLookup(input, chatGpt, client, read)).toMatchObject({
      id: attempt.id,
      engine: 'CLAUDE_CODE',
      state: 'UNKNOWN',
      released: true,
    })
    expect(claude).toHaveBeenCalledTimes(1)
    expect(chatGpt).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('keeps uncertain outcomes on restart and acknowledges the exact original attempt without replay', async () => {
    const input = await savedLookup()
    await setConversationReadProvider(input, 'CHATGPT', client)
    const provider = vi.fn<ConversationLookupProvider>().mockRejectedValue(new Error('disconnect after send'))
    const read = vi.fn()
    const attempt = await verifyConversationLookup(input, provider, client, read)
    expect(attempt).toMatchObject({ state: 'UNKNOWN', released: false, records: [] })
    await client.$disconnect()
    client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'scratch.db')}` } } })
    expect((await readConversationProviderState(input, [], client)).blocked).toEqual(attempt)
    const exact = { ...input, attemptId: attempt.id }
    await expect(releaseUnconfirmedConversationRead({ ...exact, targetProjectId: projectB }, client)).rejects.toThrow(
      'not found',
    )
    await releaseUnconfirmedConversationRead(exact, client)
    await releaseUnconfirmedConversationRead(exact, client)
    await setConversationReadProvider(input, 'LOCAL', client)
    await setConversationReadProvider(input, 'CHATGPT', client, 'CODEX')
    expect(await verifyConversationLookup({ ...input, expectedEngine: 'CODEX' }, provider, client, read)).toMatchObject(
      {
        state: 'UNKNOWN',
        engine: 'RESPONSES',
        released: true,
      },
    )
    expect(provider).toHaveBeenCalledTimes(1)
    expect(read).not.toHaveBeenCalled()
  })

  it('preserves an expired reservation and rejects a late result after its original deadline', async () => {
    const input = await savedLookup()
    await setConversationReadProvider(input, 'CHATGPT', client)
    const provider: ConversationLookupProvider = async ({ lookup }) => {
      await lookup()
      await client.projectConversationRead.updateMany({
        where: { messageId: input.messageId },
        data: { expiresAt: new Date(0) },
      })
      return 'completed'
    }
    const attempt = await verifyConversationLookup(input, provider, client, vi.fn().mockResolvedValue(records))
    expect(attempt).toMatchObject({ state: 'UNKNOWN', records: [] })
    await expect(setConversationReadProvider(input, 'LOCAL', client)).rejects.toThrow('outstanding read')
    await releaseUnconfirmedConversationRead({ ...input, attemptId: attempt.id }, client)
    await setConversationReadProvider(input, 'LOCAL', client)
  })
})
