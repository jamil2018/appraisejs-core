import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const guard = vi.hoisted(() => ({ prepare: vi.fn(async () => undefined), requestAnalysisRevision: vi.fn() }))
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
vi.mock('./conversation-analysis-review', () => ({
  requestConversationAnalysisRevision: guard.requestAnalysisRevision,
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
import { ServiceError } from '@/services/shared/errors'
import { workspaceRecordHref } from '@/lib/conversation/workspace-records'
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
const cursorMigration = path.join(
  process.cwd(),
  'prisma/migrations/20261125020000_add_cursor_conversation_reads/migration.sql',
)
const caseDeletionMigration = path.join(
  process.cwd(),
  'prisma/migrations/20261128030000_add_conversation_case_deletion_review/migration.sql',
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
  guard.requestAnalysisRevision.mockReset()
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
  execFileSync('sqlite3', [file, readFileSync(cursorMigration, 'utf8')])
  execFileSync('sqlite3', [file, readFileSync(caseDeletionMigration, 'utf8')])
  execFileSync('sqlite3', [file, `INSERT INTO "TargetProject" ("id") VALUES ('${projectA}'), ('${projectB}');`])
  client = new PrismaClient({ datasources: { db: { url: `file:${file}` } } })
})
afterEach(async () => {
  await client.$disconnect()
  rmSync(directory, { recursive: true, force: true })
})

describe('durable project conversations', () => {
  it('pins review requests to the saved Journey and rolls back a stale turn', async () => {
    const context = { kind: 'QUALITY_JOURNEY' as const, id: 'journey-a', title: 'Guest checkout' }
    const { conversation } = await appendConversationTurn(
      { targetProjectId: projectA, idempotencyKey: 'attach', content: 'Keep this review', context },
      client,
    )
    const scope = { targetProjectId: projectA, conversationId: conversation.id }
    const hash = `sha256:${'ab'.repeat(32)}`
    const analysisReview = { journeyId: context.id, revisionId: 'analysis-1', reviewHash: hash, stateHash: hash }
    const request = {
      ...scope,
      idempotencyKey: 'order-number',
      content: 'Also check that I get an order number.',
      analysisReview,
    }
    await expect(
      appendConversationTurn({ ...request, analysisReview: { ...analysisReview, journeyId: 'other' } }, client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(guard.requestAnalysisRevision).not.toHaveBeenCalled()

    guard.requestAnalysisRevision.mockRejectedValueOnce(new ServiceError('Review is stale', 'CONFLICT'))
    await expect(appendConversationTurn(request, client)).rejects.toMatchObject({ code: 'CONFLICT' })
    expect((await getProjectConversation(scope, client)).messages.map(message => message.content)).toEqual([
      'Keep this review',
    ])

    guard.requestAnalysisRevision.mockResolvedValueOnce({
      journeyId: context.id,
      targetProjectId: projectA,
      expectedStateHash: hash,
    })
    const committed = await appendConversationTurn(request, client)
    expect(committed.messages.map(message => message.ordinal)).toEqual([2, 3])
    expect((await appendConversationTurn(request, client)).replayed).toBe(true)
    expect((await replayConversationTurn(request, client))?.messages).toEqual(committed.messages)
    expect(guard.requestAnalysisRevision).toHaveBeenCalledTimes(2)
    await expect(
      appendConversationTurn({ ...request, analysisReview: { ...analysisReview, revisionId: 'analysis-2' } }, client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

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

  it('commits a root module, exact reply, and request key once with a scoped editor link', async () => {
    const full = await fullProjectDatabase('module-project')
    try {
      const request = {
        targetProjectId: 'module-project',
        idempotencyKey: 'module-once',
        content: 'Create a module named Checkout',
        createRootModuleName: 'Checkout',
      }
      const committed = await appendConversationTurn(request, full)
      const record = committed.messages[1].records[0]
      expect(committed.messages.map(row => row.role)).toEqual(['USER', 'APPRAISE'])
      expect(record).toEqual({ kind: 'MODULE', id: expect.any(String), title: 'Checkout' })
      expect(workspaceRecordHref(request.targetProjectId, record)).toBe(
        `/modules/modify/${record.id}?project=module-project`,
      )
      expect(await full.module.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({
        name: 'Checkout',
        parentId: null,
        targetProjectId: 'module-project',
      })
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'module-project', {
        existing: [],
        newRoots: [{ kind: 'MODULE', resourceId: record.id }],
        deleted: [],
      })
      guard.prepare.mockClear()
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      expect(await full.module.count({ where: { targetProjectId: 'module-project' } })).toBe(1)
      expect(guard.prepare).not.toHaveBeenCalled()
      expect((await replayConversationTurn(request, full))?.messages[1].records).toEqual([record])
    } finally {
      await full.$disconnect()
    }
  })

  it('commits an exact project tag and reply once, with rollback on duplicate or refused guard', async () => {
    const full = await fullProjectDatabase('tag-project')
    try {
      const request = {
        targetProjectId: 'tag-project',
        idempotencyKey: 'tag-once',
        content: 'Create a tag named Smoke with expression @smoke',
        createExactTag: { name: 'Smoke', tagExpression: '@smoke' },
      }
      const committed = await appendConversationTurn(request, full)
      const record = committed.messages[1].records[0]
      expect(record).toEqual({ kind: 'TAG', id: expect.any(String), title: 'Smoke' })
      expect(workspaceRecordHref('tag-project', record)).toBe(`/tags/modify/${record.id}?project=tag-project`)
      expect(await full.tag.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({
        name: 'Smoke',
        tagExpression: '@smoke',
        targetProjectId: 'tag-project',
      })
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'tag-project', {
        existing: [],
        newRoots: [],
        deleted: [],
      })
      guard.prepare.mockClear()
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      expect(await full.tag.count({ where: { targetProjectId: 'tag-project' } })).toBe(1)
      expect(guard.prepare).not.toHaveBeenCalled()
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'tag-duplicate' }, full)).rejects.toMatchObject(
        { code: 'VALIDATION' },
      )
      await expect(
        appendConversationTurn(
          { ...request, idempotencyKey: 'tag-forged', createExactTag: { name: 'Other', tagExpression: '@smoke' } },
          full,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'tag-refused',
            content: 'Create a tag named Other with expression @other',
            createExactTag: { name: 'Other', tagExpression: '@other' },
          },
          full,
        ),
      ).rejects.toThrow('guard refused')
      expect(await full.tag.count({ where: { targetProjectId: 'tag-project' } })).toBe(1)
      expect(await full.projectConversation.count({ where: { targetProjectId: 'tag-project' } })).toBe(1)
      expect(
        await full.projectConversationMessage.count({ where: { conversation: { targetProjectId: 'tag-project' } } }),
      ).toBe(2)
    } finally {
      await full.$disconnect()
    }
  })

  it('commits an exact environment and chat reply once, preserving project and loopback scope', async () => {
    const full = await fullProjectDatabase('environment-project')
    try {
      const request = {
        targetProjectId: 'environment-project',
        idempotencyKey: 'environment-once',
        content: 'Create an environment named Staging with base URL https://staging.example.test',
        createExactEnvironment: { name: 'Staging', baseUrl: 'https://staging.example.test' },
      }
      const committed = await appendConversationTurn(request, full)
      const record = committed.messages[1].records[0]
      expect(record).toEqual({ kind: 'ENVIRONMENT', id: expect.any(String), title: 'Staging' })
      expect(workspaceRecordHref('environment-project', record)).toBe(
        `/environments/modify/${record.id}?project=environment-project`,
      )
      expect(await full.environment.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({
        targetProjectId: 'environment-project',
        name: 'Staging',
        baseUrl: 'https://staging.example.test',
        username: null,
        passwordEnvironmentVariable: null,
        credentialState: 'NONE',
      })
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      expect(await full.environment.count({ where: { targetProjectId: 'environment-project' } })).toBe(1)
      await expect(
        appendConversationTurn({ ...request, idempotencyKey: 'environment-duplicate' }, full),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'environment-forged',
            createExactEnvironment: { name: 'Other', baseUrl: 'https://staging.example.test' },
          },
          full,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      await full.targetProject.create({
        data: {
          id: 'other-environment-project',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: 'path:/other-environment-project',
          canonicalPath: '/other-environment-project',
          displayName: 'Other environment project',
          fingerprint: 'other-environment-project',
        },
      })
      await full.environment.create({
        data: {
          targetProjectId: 'other-environment-project',
          name: 'Existing local',
          baseUrl: 'http://127.0.0.1:4173',
        },
      })
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'environment-reserved',
            content: 'Create an environment named Local with base URL http://localhost:4173',
            createExactEnvironment: { name: 'Local', baseUrl: 'http://localhost:4173' },
          },
          full,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT', details: { code: 'ENVIRONMENT_ORIGIN_RESERVED' } })
      await expect(
        appendConversationTurn(
          {
            targetProjectId: request.targetProjectId,
            idempotencyKey: 'environment-sensitive-url',
            content: 'Create an environment named Local with base URL https://example.test?token=fixture-token',
          },
          full,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      expect(await full.environment.count({ where: { targetProjectId: 'environment-project' } })).toBe(1)
      expect(await full.projectConversation.count({ where: { targetProjectId: 'environment-project' } })).toBe(1)
      expect(
        await full.projectConversationMessage.count({
          where: { conversation: { targetProjectId: 'environment-project' } },
        }),
      ).toBe(2)
    } finally {
      await full.$disconnect()
    }
  })

  it('commits a suite and chat reply through the guarded manual service in one scoped transaction', async () => {
    const full = await fullProjectDatabase('suite-project')
    try {
      const selectedModule = await full.module.create({ data: { targetProjectId: 'suite-project', name: 'Checkout' } })
      await full.targetProject.create({
        data: {
          id: 'other-suite-project',
          kind: 'LOCAL_WORKSPACE',
          canonicalIdentity: 'path:/other-suite-project',
          canonicalPath: '/other-suite-project',
          displayName: 'Other suite project',
          fingerprint: 'other-suite-project',
        },
      })
      await full.module.create({ data: { targetProjectId: 'other-suite-project', name: 'Checkout' } })
      const request = {
        targetProjectId: 'suite-project',
        idempotencyKey: 'suite-once',
        content: 'Create a test suite named “Checkout smoke” in module “Checkout”',
        createExactSuite: { name: 'Checkout smoke', moduleName: 'Checkout' },
      }
      const callerPayload = { moduleName: request.createExactSuite.moduleName, name: request.createExactSuite.name }
      const committing = appendConversationTurn({ ...request, createExactSuite: callerPayload }, full)
      callerPayload.name = 'Changed after submit'
      callerPayload.moduleName = 'Missing'
      const committed = await committing
      const record = committed.messages[1].records[0]
      expect(record).toEqual({ kind: 'TEST_SUITE', id: expect.any(String), title: 'Checkout smoke' })
      expect(workspaceRecordHref(request.targetProjectId, record)).toBe(
        `/test-suites/modify/${record.id}?project=suite-project`,
      )
      expect(await full.testSuite.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({
        name: 'Checkout smoke',
        moduleId: selectedModule.id,
        targetProjectId: 'suite-project',
      })
      expect(await full.tag.count({ where: { targetProjectId: 'suite-project', type: 'IDENTIFIER' } })).toBe(1)
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'suite-project', {
        existing: [],
        newRoots: [{ kind: 'TEST_SUITE', resourceId: record.id }],
        deleted: [],
      })
      guard.prepare.mockClear()
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      expect(guard.prepare).not.toHaveBeenCalled()

      await expect(
        appendConversationTurn(
          { ...request, idempotencyKey: 'suite-forged', createExactSuite: { name: 'Other', moduleName: 'Checkout' } },
          full,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'suite-missing',
            content: 'Create a test suite named “Other smoke” in module “Missing”',
            createExactSuite: { name: 'Other smoke', moduleName: 'Missing' },
          },
          full,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      await full.module.create({ data: { targetProjectId: 'suite-project', name: 'Archived', archivedAt: new Date() } })
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'suite-archived',
            content: 'Create a test suite named “Other smoke” in module “Archived”',
            createExactSuite: { name: 'Other smoke', moduleName: 'Archived' },
          },
          full,
        ),
      ).rejects.toMatchObject({ code: 'CONFLICT' })
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'suite-refused',
            content: 'Create a test suite named “Other smoke” in module “Checkout”',
            createExactSuite: { name: 'Other smoke', moduleName: 'Checkout' },
          },
          full,
        ),
      ).rejects.toThrow('guard refused')
      await full.module.create({ data: { targetProjectId: 'suite-project', name: 'Checkout' } })
      await expect(
        appendConversationTurn({ ...request, idempotencyKey: 'suite-ambiguous' }, full),
      ).rejects.toMatchObject({ code: 'CONFLICT' })

      expect(await full.testSuite.count({ where: { targetProjectId: 'suite-project' } })).toBe(1)
      expect(await full.tag.count({ where: { targetProjectId: 'suite-project', type: 'IDENTIFIER' } })).toBe(1)
      expect(await full.projectConversation.count({ where: { targetProjectId: 'suite-project' } })).toBe(1)
      expect(
        await full.projectConversationMessage.count({ where: { conversation: { targetProjectId: 'suite-project' } } }),
      ).toBe(2)
    } finally {
      await full.$disconnect()
    }
  })

  it('rolls back the suite, identifier tag, and turn if saving the reply fails', async () => {
    const targetProjectId = 'suite-reply-failure-project'
    const full = await fullProjectDatabase(targetProjectId)
    try {
      await full.module.create({ data: { targetProjectId, name: 'Checkout' } })
      const request = {
        targetProjectId,
        idempotencyKey: 'suite-reply-failure',
        content: 'Create a test suite named “Checkout smoke” in module “Checkout”',
        createExactSuite: { name: 'Checkout smoke', moduleName: 'Checkout' },
      }
      await full.$executeRaw`CREATE TRIGGER reject_chat_reply
        BEFORE INSERT ON ProjectConversationMessage WHEN NEW.role = 'APPRAISE'
        BEGIN SELECT RAISE(ABORT, 'fixture reply failure'); END`
      await expect(appendConversationTurn(request, full)).rejects.toThrow()
      expect(await full.testSuite.count({ where: { targetProjectId } })).toBe(0)
      expect(await full.tag.count({ where: { targetProjectId, type: 'IDENTIFIER' } })).toBe(0)
      expect(await full.projectConversation.count({ where: { targetProjectId } })).toBe(0)
      expect(await full.projectConversationMessage.count({ where: { conversation: { targetProjectId } } })).toBe(0)

      await full.$executeRaw`DROP TRIGGER reject_chat_reply`
      const saved = await appendConversationTurn(request, full)
      expect(saved.messages).toHaveLength(2)
      expect(await full.testSuite.count({ where: { targetProjectId } })).toBe(1)
      expect(await full.tag.count({ where: { targetProjectId, type: 'IDENTIFIER' } })).toBe(1)
    } finally {
      await full.$disconnect()
    }
  })

  it('treats distinct module submissions as distinct writes even with the same name', async () => {
    const full = await fullProjectDatabase('module-project')
    try {
      const first = await appendConversationTurn(
        {
          targetProjectId: 'module-project',
          idempotencyKey: 'module-first',
          content: 'Create a module named Checkout',
          createRootModuleName: 'Checkout',
        },
        full,
      )
      const second = await appendConversationTurn(
        {
          targetProjectId: 'module-project',
          conversationId: first.conversation.id,
          idempotencyKey: 'module-second',
          content: 'Create a module named Checkout',
          createRootModuleName: 'Checkout',
        },
        full,
      )
      expect(second.messages[1].records[0].id).not.toBe(first.messages[1].records[0].id)
      expect(await full.module.count({ where: { targetProjectId: 'module-project', name: 'Checkout' } })).toBe(2)
    } finally {
      await full.$disconnect()
    }
  })

  it('rejects forged, attached, foreign scope, and guard-refused module requests without a write', async () => {
    const full = await fullProjectDatabase('module-project')
    try {
      const base = {
        targetProjectId: 'module-project',
        content: 'Add a checkout module',
        createRootModuleName: 'checkout',
      }
      await expect(
        appendConversationTurn({ ...base, idempotencyKey: 'forged', createRootModuleName: 'Payments' }, full),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      await expect(
        appendConversationTurn(
          {
            ...base,
            idempotencyKey: 'attached',
            context: {
              kind: 'TEST_CASE',
              id: 'case-a',
              title: 'Case',
            },
          },
          full,
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION' })
      await expect(
        appendConversationTurn({ ...base, targetProjectId: 'other-project', idempotencyKey: 'foreign' }, full),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(appendConversationTurn({ ...base, idempotencyKey: 'guard' }, full)).rejects.toThrow('guard refused')
      expect(await full.module.count()).toBe(0)
      expect(await full.projectConversation.count()).toBe(0)
      expect(await full.projectConversationMessage.count()).toBe(0)
    } finally {
      await full.$disconnect()
    }
  })

  it('renames one exact filter tag while retaining expression and relationships, with replay and stale refusal', async () => {
    const full = await fullProjectDatabase('tag-rename-project')
    try {
      const tag = await full.tag.create({
        data: { targetProjectId: 'tag-rename-project', type: 'FILTER', name: 'Smoke', tagExpression: '@smoke' },
      })
      await full.testCase.create({
        data: {
          id: 'tagged-case',
          targetProjectId: 'tag-rename-project',
          title: 'Guest checkout',
          description: 'Keep',
          tags: { connect: { id: tag.id } },
        },
      })
      const request = {
        targetProjectId: 'tag-rename-project',
        idempotencyKey: 'tag-rename-once',
        content: 'Rename tag “Smoke” with expression @smoke to “Release smoke”',
        renameExactTag: { currentName: 'Smoke', tagExpression: '@smoke', nextName: 'Release smoke' },
      }
      await expect(
        appendConversationTurn(
          { ...request, idempotencyKey: 'forged', renameExactTag: { ...request.renameExactTag, nextName: 'Wrong' } },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 400 })
      const collidingTag = await full.tag.create({
        data: {
          targetProjectId: 'tag-rename-project',
          type: 'FILTER',
          name: 'Release smoke',
          tagExpression: '@release-smoke',
        },
      })
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'collision' }, full)).rejects.toMatchObject({
        statusCode: 400,
      })
      await full.tag.delete({ where: { id: collidingTag.id } })
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'guard' }, full)).rejects.toThrow(
        'guard refused',
      )
      expect(await full.projectConversationMessage.count()).toBe(0)
      guard.prepare.mockClear()
      const committed = await appendConversationTurn(request, full)
      expect(committed.messages[1].records).toEqual([{ kind: 'TAG', id: tag.id, title: 'Release smoke' }])
      expect(await full.tag.findUniqueOrThrow({ where: { id: tag.id } })).toMatchObject({
        name: 'Release smoke',
        tagExpression: '@smoke',
      })
      expect(
        (await full.testCase.findUniqueOrThrow({ where: { id: 'tagged-case' }, include: { tags: true } })).tags.map(
          row => row.id,
        ),
      ).toEqual([tag.id])
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'tag-rename-project', {
        existing: [{ kind: 'TEST_CASE', resourceId: 'tagged-case' }],
        newRoots: [],
        deleted: [],
      })
      guard.prepare.mockClear()
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'stale' }, full)).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(guard.prepare).not.toHaveBeenCalled()
    } finally {
      await full.$disconnect()
    }
  })

  it('renames one exact suite while preserving members and history, and refuses ambiguous or stale requests', async () => {
    const full = await fullProjectDatabase('suite-rename-project')
    try {
      const moduleRow = await full.module.create({
        data: { targetProjectId: 'suite-rename-project', name: 'Checkout' },
      })
      await full.testCase.create({
        data: {
          id: 'suite-member',
          targetProjectId: 'suite-rename-project',
          title: 'Guest checkout',
          description: 'Keep',
        },
      })
      const suite = await full.testSuite.create({
        data: {
          targetProjectId: 'suite-rename-project',
          moduleId: moduleRow.id,
          name: 'Checkout smoke',
          description: 'Keep',
          testCases: { connect: { id: 'suite-member' } },
        },
      })
      const request = {
        targetProjectId: 'suite-rename-project',
        idempotencyKey: 'suite-rename-once',
        content: 'Rename test suite “Checkout smoke” in module “Checkout” to “Guest smoke”',
        renameExactSuite: { currentName: 'Checkout smoke', moduleName: 'Checkout', nextName: 'Guest smoke' },
      }
      await expect(
        appendConversationTurn(
          {
            ...request,
            idempotencyKey: 'forged',
            renameExactSuite: { ...request.renameExactSuite, nextName: 'Other smoke' },
          },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 400 })
      const duplicate = await full.testSuite.create({
        data: { targetProjectId: 'suite-rename-project', moduleId: moduleRow.id, name: 'Checkout smoke' },
      })
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'ambiguous' }, full)).rejects.toMatchObject({
        statusCode: 409,
      })
      await full.testSuite.delete({ where: { id: duplicate.id } })
      const collision = await full.testSuite.create({
        data: { targetProjectId: 'suite-rename-project', moduleId: moduleRow.id, name: 'Guest smoke' },
      })
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'collision' }, full)).rejects.toMatchObject({
        statusCode: 409,
      })
      await full.testSuite.delete({ where: { id: collision.id } })
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'guard' }, full)).rejects.toThrow(
        'guard refused',
      )
      expect(await full.projectConversationMessage.count()).toBe(0)
      guard.prepare.mockClear()
      const committed = await appendConversationTurn(request, full)
      expect(committed.messages[1].records).toEqual([{ kind: 'TEST_SUITE', id: suite.id, title: 'Guest smoke' }])
      const saved = await full.testSuite.findUniqueOrThrow({ where: { id: suite.id }, include: { testCases: true } })
      expect(saved).toMatchObject({ name: 'Guest smoke', description: 'Keep', moduleId: moduleRow.id })
      expect(saved.testCases.map(row => row.id)).toEqual(['suite-member'])
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'suite-rename-project', {
        existing: [
          { kind: 'TEST_CASE', resourceId: 'suite-member' },
          { kind: 'TEST_SUITE', resourceId: suite.id },
        ],
        newRoots: [],
        deleted: [],
      })
      guard.prepare.mockClear()
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'stale' }, full)).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(guard.prepare).not.toHaveBeenCalled()
      expect(await full.projectConversationMessage.count()).toBe(2)
    } finally {
      await full.$disconnect()
    }
  })

  it('adds only the attached case to an exact suite, preserves membership, and replays without another write', async () => {
    const full = await fullProjectDatabase('membership-project')
    try {
      const moduleRow = await full.module.create({ data: { targetProjectId: 'membership-project', name: 'Checkout' } })
      await full.testCase.createMany({
        data: [
          { id: 'attached-case', targetProjectId: 'membership-project', title: 'Guest checkout', description: 'Keep' },
          { id: 'existing-case', targetProjectId: 'membership-project', title: 'Member already', description: 'Keep' },
        ],
      })
      const suite = await full.testSuite.create({
        data: {
          targetProjectId: 'membership-project',
          moduleId: moduleRow.id,
          name: 'Checkout smoke',
          description: 'Preserve',
          testCases: { connect: { id: 'existing-case' } },
        },
      })
      const request = {
        targetProjectId: 'membership-project',
        idempotencyKey: 'membership-once',
        content: 'Add this case to suite “Checkout smoke” in module “Checkout”',
        context: { kind: 'TEST_CASE' as const, id: 'attached-case', title: 'Guest checkout' },
        addAttachedCaseToSuite: { suiteName: 'Checkout smoke', moduleName: 'Checkout' },
      }
      const committed = await appendConversationTurn(request, full)
      expect(committed.messages[1].records).toEqual([{ kind: 'TEST_SUITE', id: suite.id, title: 'Checkout smoke' }])
      expect(
        (await full.testSuite.findUniqueOrThrow({ where: { id: suite.id }, include: { testCases: true } })).testCases
          .map(row => row.id)
          .sort(),
      ).toEqual(['attached-case', 'existing-case'])
      expect(guard.prepare).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'membership-project', {
        existing: [
          { kind: 'TEST_CASE', resourceId: 'attached-case' },
          { kind: 'TEST_CASE', resourceId: 'existing-case' },
          { kind: 'TEST_SUITE', resourceId: suite.id },
        ],
        newRoots: [],
        deleted: [],
      })
      guard.prepare.mockClear()
      const replay = await appendConversationTurn(request, full)
      expect(replay.replayed).toBe(true)
      expect(replay.messages.map(row => row.id)).toEqual(committed.messages.map(row => row.id))
      expect(guard.prepare).not.toHaveBeenCalled()
      const second = await appendConversationTurn({ ...request, idempotencyKey: 'membership-again' }, full)
      expect(second.messages[1].content).toContain('already in')
      expect(
        (await full.testSuite.findUniqueOrThrow({ where: { id: suite.id }, include: { testCases: true } })).testCases,
      ).toHaveLength(2)
    } finally {
      await full.$disconnect()
    }
  })

  it('refuses stale, ambiguous, foreign, and guard-blocked suite membership without a saved turn', async () => {
    const full = await fullProjectDatabase('membership-refusal-project')
    try {
      const moduleRow = await full.module.create({
        data: { targetProjectId: 'membership-refusal-project', name: 'Checkout' },
      })
      await full.testSuite.create({
        data: { targetProjectId: 'membership-refusal-project', moduleId: moduleRow.id, name: 'Checkout smoke' },
      })
      await full.testCase.create({
        data: {
          id: 'attached-case',
          targetProjectId: 'membership-refusal-project',
          title: 'Guest checkout',
          description: 'Keep',
        },
      })
      const request = {
        targetProjectId: 'membership-refusal-project',
        content: 'Add this case to suite “Checkout smoke” in module “Checkout”',
        context: { kind: 'TEST_CASE' as const, id: 'attached-case', title: 'Guest checkout' },
        addAttachedCaseToSuite: { suiteName: 'Checkout smoke', moduleName: 'Checkout' },
      }
      await expect(
        appendConversationTurn(
          { ...request, idempotencyKey: 'stale', context: { ...request.context, title: 'Old checkout' } },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 409 })
      await expect(
        appendConversationTurn(
          { ...request, idempotencyKey: 'foreign', context: { ...request.context, id: 'foreign-case' } },
          full,
        ),
      ).rejects.toMatchObject({ statusCode: 400 })
      await full.testSuite.create({
        data: { targetProjectId: 'membership-refusal-project', moduleId: moduleRow.id, name: 'Checkout smoke' },
      })
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'ambiguous' }, full)).rejects.toMatchObject({
        statusCode: 409,
      })
      await full.testSuite.deleteMany({ where: { targetProjectId: 'membership-refusal-project' } })
      await full.testSuite.create({
        data: { targetProjectId: 'membership-refusal-project', moduleId: moduleRow.id, name: 'Checkout smoke' },
      })
      guard.prepare.mockRejectedValueOnce(new Error('guard refused'))
      await expect(appendConversationTurn({ ...request, idempotencyKey: 'guard' }, full)).rejects.toThrow(
        'guard refused',
      )
      expect(await full.projectConversation.count()).toBe(0)
      expect(await full.projectConversationMessage.count()).toBe(0)
      expect(await full.testSuite.count({ where: { testCases: { some: { id: 'attached-case' } } } })).toBe(0)
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
    execFileSync('sqlite3', [
      file,
      `
      INSERT INTO "ProjectConversationMessage" ("id", "conversationId", "ordinal", "role", "content", "turnId")
        VALUES ('claude-unknown', 'legacy', 3, 'USER', 'Find test case named Checkout', 'turn-3');
      INSERT INTO "ProjectConversationRead" ("id", "conversationId", "messageId", "provider", "engine", "state", "expiresAt", "settledAt", "releasedAt")
        VALUES ('released-claude', 'legacy', 'claude-unknown', 'CLAUDE', 'CLAUDE_CODE', 'UNKNOWN', 1767225600000, 1767225600000, 1767225600000);
    `,
    ])
    const beforeCursorAttempts = execFileSync(
      'sqlite3',
      [file, 'SELECT * FROM "ProjectConversationRead" ORDER BY "id";'],
      {
        encoding: 'utf8',
      },
    )
    const beforeCursorConversation = execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversation";'], {
      encoding: 'utf8',
    })
    execFileSync('sqlite3', [file, readFileSync(cursorMigration, 'utf8')])
    expect(
      execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversationRead" ORDER BY "id";'], {
        encoding: 'utf8',
      }),
    ).toBe(beforeCursorAttempts)
    expect(execFileSync('sqlite3', [file, 'SELECT * FROM "ProjectConversation";'], { encoding: 'utf8' })).toBe(
      beforeCursorConversation,
    )
    expect(execFileSync('sqlite3', [file, 'PRAGMA foreign_key_check;'], { encoding: 'utf8' })).toBe('')
    execFileSync('sqlite3', [file, readFileSync(caseDeletionMigration, 'utf8')])
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

  it('binds Cursor CLI to Cursor and keeps one saved-message attempt across providers', async () => {
    const input = await savedLookup()
    const search = vi.fn().mockResolvedValue(records)
    const provider = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await lookup()
      return 'completed'
    })
    await setConversationReadProvider(input, 'CHATGPT', client, 'CODEX')
    const original = await verifyConversationLookup({ ...input, expectedEngine: 'CODEX' }, provider, client, search)

    await setConversationReadProvider(input, 'CURSOR', client)
    const cursor = vi.fn<ConversationLookupProvider>(async ({ lookup }) => {
      await lookup()
      return 'completed'
    })
    expect(await verifyConversationLookup({ ...input, expectedEngine: 'CURSOR_CLI' }, cursor, client, search)).toEqual(
      original,
    )
    expect(cursor).not.toHaveBeenCalled()

    const next = await appendConversationTurn(
      {
        targetProjectId: projectA,
        conversationId: input.conversationId,
        idempotencyKey: 'cursor-next',
        content: 'Find test case named Checkout',
      },
      client,
    )
    const fresh = { ...input, messageId: next.messages[0].id }
    await expect(
      verifyConversationLookup({ ...fresh, expectedEngine: 'CLAUDE_CODE' }, cursor, client, search),
    ).rejects.toThrow('engine changed')
    await expect(
      verifyConversationLookup({ ...fresh, expectedEngine: 'CODEX' }, cursor, client, search),
    ).rejects.toThrow('engine changed')
    expect(cursor).not.toHaveBeenCalled()
    const receipt = await verifyConversationLookup({ ...fresh, expectedEngine: 'CURSOR_CLI' }, cursor, client, search)
    expect(receipt).toMatchObject({ engine: 'CURSOR_CLI', state: 'COMPLETED', records })
    expect(cursor).toHaveBeenCalledTimes(1)
    expect(await readConversationProviderState(input, [input.messageId, fresh.messageId], client)).toMatchObject({
      readProvider: 'CURSOR',
      chatGptEngine: 'CODEX',
      attempts: expect.arrayContaining([original, receipt]),
    })
    await setConversationReadProvider(input, 'CLAUDE', client)
    expect(
      await verifyConversationLookup({ ...fresh, expectedEngine: 'CLAUDE_CODE' }, provider, client, search),
    ).toEqual(receipt)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(await client.projectConversationRead.count({ where: { messageId: fresh.messageId } })).toBe(1)

    const invalid = await appendConversationTurn(
      {
        targetProjectId: projectA,
        conversationId: input.conversationId,
        idempotencyKey: 'cursor-invalid',
        content: 'Find test case named Checkout',
      },
      client,
    )
    await expect(
      client.projectConversationRead.create({
        data: {
          id: 'invalid-cursor-engine',
          conversationId: input.conversationId,
          messageId: invalid.messages[0].id,
          provider: 'CURSOR',
          engine: 'CODEX',
          state: 'FAILED',
          expiresAt: new Date(),
          settledAt: new Date(),
        },
      }),
    ).rejects.toThrow()
  })

  it('keeps a Cursor outcome uncertain across restart and does not replay it after acknowledgement', async () => {
    const input = await savedLookup()
    await setConversationReadProvider(input, 'CURSOR', client)
    const cursor = vi.fn<ConversationLookupProvider>().mockRejectedValue(new Error('lost reply after send'))
    const read = vi.fn()
    const attempt = await verifyConversationLookup({ ...input, expectedEngine: 'CURSOR_CLI' }, cursor, client, read)
    expect(attempt).toMatchObject({ engine: 'CURSOR_CLI', state: 'UNKNOWN', released: false })
    await client.$disconnect()
    client = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, 'scratch.db')}` } } })
    expect((await readConversationProviderState(input, [], client)).blocked).toEqual(attempt)
    await expect(setConversationReadProvider(input, 'CLAUDE', client)).rejects.toThrow('outstanding read')
    await releaseUnconfirmedConversationRead({ ...input, attemptId: attempt.id }, client)
    await setConversationReadProvider(input, 'CLAUDE', client)
    expect(
      await verifyConversationLookup({ ...input, expectedEngine: 'CLAUDE_CODE' }, cursor, client, read),
    ).toMatchObject({ id: attempt.id, engine: 'CURSOR_CLI', state: 'UNKNOWN', released: true })
    expect(cursor).toHaveBeenCalledTimes(1)
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
