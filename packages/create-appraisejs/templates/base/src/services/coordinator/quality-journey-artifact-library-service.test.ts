import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, expect, it } from 'vitest'
import { copyMigratedTestDatabase } from '@/test/migrated-test-database'
import { createQualityJourney } from './quality-journey-service'
import {
  exportQualityJourney,
  getQualityJourneyLibraryArtifact,
  listQualityJourneyArtifactLibrary,
} from './quality-journey-artifact-library-service'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'journey-library-'))
  const database = path.join(directory, 'test.db')
  await copyMigratedTestDatabase(database)
  const client = new PrismaClient({ datasources: { db: { url: `file:${database}` } } })
  cleanups.push(async () => {
    await client.$disconnect()
    await rm(directory, { recursive: true, force: true })
  })
  for (const id of ['project-a', 'project-b'])
    await client.targetProject.create({
      data: {
        id,
        kind: 'LOCAL_WORKSPACE',
        canonicalIdentity: id,
        canonicalPath: `${directory}/${id}`,
        displayName: id,
        fingerprint: id,
      },
    })
  const owner = await createQualityJourney(
    {
      targetProjectId: 'project-a',
      idempotencyKey: 'owner',
      requirement: { objective: 'Checkout' },
    },
    client,
  )
  const foreign = await createQualityJourney(
    { targetProjectId: 'project-b', idempotencyKey: 'foreign', requirement: { objective: 'Private other project' } },
    client,
  )
  const sameTarget = await createQualityJourney(
    { targetProjectId: 'project-a', idempotencyKey: 'other', requirement: { objective: 'Private other journey' } },
    client,
  )
  const scope = { journeyId: owner.journey.journeyId, targetProjectId: 'project-a' }
  await client.qualityJourneyArtifact.create({
    data: {
      id: 'question-record',
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      cycleId: owner.journey.activeCycleId,
      identityKey: 'question:1',
      kind: 'ANALYSIS_QUESTION',
      artifactId: 'question-1',
      revisionId: 'revision-1',
      contentHash: `sha256:${'a'.repeat(64)}`,
      artifactJson: JSON.stringify({
        questionId: 'question-1',
        prompt: 'Which checkout?',
        required: true,
        rationale: 'Resolve scope',
        accessToken: 'SECRET-MARKER',
        headers: { Authorization: 'SECRET-MARKER' },
      }),
    },
  })
  return { client, scope, owner, foreign, sameTarget }
}

it('lists every projected entry with bounded pages and matching export identities on SQLite', async () => {
  const { client, scope } = await fixture()
  const first = await listQualityJourneyArtifactLibrary({ ...scope, limit: 2 }, client)
  const second = await listQualityJourneyArtifactLibrary({ ...scope, limit: 2, offset: 2 }, client)
  const exported = await exportQualityJourney(scope, client)
  expect(first.total).toBe(3)
  expect(first.entries).toHaveLength(2)
  expect(second.entries).toHaveLength(1)
  expect([...first.entries, ...second.entries].map(e => e.entryId).sort()).toEqual(
    exported.artifacts.map(e => e.entryId).sort(),
  )
  expect(first.entries.every(e => e.data === null)).toBe(true)
  const filtered = await listQualityJourneyArtifactLibrary({ ...scope, kind: 'ANALYSIS_QUESTION' }, client)
  expect(filtered.total).toBe(1)
  expect(filtered.entries[0]?.entryId).toBe('ARTIFACT:question-record')
  for (const entry of exported.artifacts)
    expect((await getQualityJourneyLibraryArtifact({ ...scope, entryId: entry.entryId }, client)).entry).toEqual(entry)
})

it('searches only public metadata before pagination and applies the same filter to counts', async () => {
  const { client, scope, owner } = await fixture()
  await client.qualityJourneyArtifact.create({
    data: {
      id: 'search-record',
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      cycleId: owner.journey.activeCycleId,
      identityKey: 'search:1',
      kind: 'RUNTIME_CAPSULE',
      artifactId: 'search-artifact',
      revisionId: 'search-revision',
      contentHash: 'sha256:search-hash',
      artifactJson: JSON.stringify({ token: 'SEARCH-SECRET' }),
    },
  })
  for (const query of ['search-record', 'search-artifact', 'search-revision', 'search-hash']) {
    const result = await listQualityJourneyArtifactLibrary({ ...scope, query }, client)
    expect(result.total).toBe(1)
    expect(result.entries.map(entry => entry.entryId)).toEqual(['ARTIFACT:search-record'])
  }
  const matching = await listQualityJourneyArtifactLibrary({ ...scope, query: 'sha256:', limit: 100 }, client)
  const first = await listQualityJourneyArtifactLibrary({ ...scope, query: 'sha256:', limit: 1 }, client)
  const second = await listQualityJourneyArtifactLibrary({ ...scope, query: 'sha256:', limit: 1, offset: 1 }, client)
  expect(matching.total).toBe(matching.entries.length)
  expect(first.total).toBe(matching.total)
  expect(second.total).toBe(matching.total)
  expect([...first.entries, ...second.entries].map(entry => entry.entryId)).toEqual(
    matching.entries.slice(0, 2).map(entry => entry.entryId),
  )
  expect((await listQualityJourneyArtifactLibrary({ ...scope, query: 'SEARCH-SECRET' }, client)).total).toBe(0)
  expect((await listQualityJourneyArtifactLibrary({ ...scope, query: '  search-artifact  ' }, client)).total).toBe(1)
})

it('keeps historical questions readable without operational fields and distinguishes source/projection hashes', async () => {
  const { client, scope } = await fixture()
  await client.qualityJourney.update({ where: { id: scope.journeyId }, data: { stage: 'CLOSED', status: 'CLOSED' } })
  const detail = await getQualityJourneyLibraryArtifact({ ...scope, entryId: 'ARTIFACT:question-record' }, client)
  expect(detail.entry.data).toEqual({
    questionId: 'question-1',
    prompt: 'Which checkout?',
    required: true,
    rationale: 'Resolve scope',
  })
  expect(detail.entry.projectionHash).not.toBe(detail.entry.sourceContentHash)
  const exported = await exportQualityJourney(scope, client)
  expect(JSON.stringify(exported)).not.toContain('SECRET-MARKER')
  expect(await exportQualityJourney(scope, client)).toEqual(exported)
})

it('rejects cross-target and cross-journey details and excludes their rows', async () => {
  const { client, scope, foreign, sameTarget } = await fixture()
  await expect(
    listQualityJourneyArtifactLibrary({ ...scope, targetProjectId: 'project-b' }, client),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const foreignId = `REQUIREMENT_REVISION:${foreign.journey.activeRevisionIds.journey}`
  const otherId = `REQUIREMENT_REVISION:${sameTarget.journey.activeRevisionIds.journey}`
  for (const entryId of [foreignId, otherId])
    await expect(getQualityJourneyLibraryArtifact({ ...scope, entryId }, client)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  expect(JSON.stringify(await exportQualityJourney(scope, client))).not.toContain('Private other')
})

it('lists metadata without parsing opaque payloads, while corrupted detail/export fail closed', async () => {
  const { client, scope, owner } = await fixture()
  await client.qualityJourneyArtifact.create({
    data: {
      id: 'corrupt',
      journeyId: scope.journeyId,
      targetProjectId: scope.targetProjectId,
      cycleId: owner.journey.activeCycleId,
      identityKey: 'corrupt',
      kind: 'RUNTIME_CAPSULE',
      artifactId: 'bad',
      contentHash: `sha256:${'b'.repeat(64)}`,
      artifactJson: '{',
    },
  })
  expect((await listQualityJourneyArtifactLibrary(scope, client)).total).toBe(4)
  await expect(getQualityJourneyLibraryArtifact({ ...scope, entryId: 'ARTIFACT:corrupt' }, client)).rejects.toThrow(
    'corrupt',
  )
  // An unrelated corrupt payload does not prevent reading the selected question.
  expect(
    (await getQualityJourneyLibraryArtifact({ ...scope, entryId: 'ARTIFACT:question-record' }, client)).entry.data,
  ).toMatchObject({ prompt: 'Which checkout?' })
  await expect(exportQualityJourney(scope, client)).rejects.toThrow('corrupt')
})
