import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
let directory: string, template: string
beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'appraise-c1-journal-'))
  template = path.join(directory, 'migrated.sqlite')
  execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${template}` },
    stdio: 'pipe',
  })
}, 60_000)
async function fixture() {
  vi.resetModules()
  const api = await import('../provider-source-database'),
    { NativeOutcomeJournal } = await import('./native-outcome-journal')
  const filename = path.join(directory, `${randomUUID()}.sqlite`)
  await copyFile(template, filename)
  const setup = new PrismaClient({ datasources: { db: { url: `file:${filename}?connection_limit=1` } } })
  await setup.$executeRawUnsafe('PRAGMA foreign_keys=OFF')
  const seed = async (table: string, values: Record<string, string | number>) => {
    const columns = await setup.$queryRawUnsafe<
      Array<{ name: string; type: string; notnull: bigint; dflt_value: unknown }>
    >(`PRAGMA table_info("${table}")`)
    const required = columns.filter(
      column => Object.hasOwn(values, column.name) || (Number(column.notnull) === 1 && column.dflt_value === null),
    )
    await setup.$executeRawUnsafe(
      `INSERT INTO "${table}" (${required.map(c => `"${c.name}"`).join(',')}) VALUES (${required.map(() => '?').join(',')})`,
      ...required.map(
        column =>
          values[column.name] ??
          (column.type === 'INTEGER' || column.type === 'DATETIME' ? 1 : `fixture-${column.name}`),
      ),
    )
  }
  const namespace = `native:${randomUUID()}`
  await seed('QualityJourneyProviderRun', {
    id: 'run',
    providerNamespace: namespace,
    configurationDigest: `sha256:${'a'.repeat(64)}`,
  })
  await seed('QualityJourneyProviderDispatchIntent', {
    id: 'intent',
    providerRunId: 'run',
    providerNamespace: namespace,
    sendBoundaryId: 'boundary',
  })
  await setup.$disconnect()
  const pair = api.createProviderSourceNativePrismaClient(`file:${filename}`),
    database = await pair.ready
  const identity = {
    runId: 'run',
    intentId: 'intent',
    sendBoundaryId: 'boundary',
    claimEpoch: 1,
    providerNamespace: namespace,
    configurationDigest: `sha256:${'a'.repeat(64)}`,
    transportId: 'transport',
    transportIncarnation: null,
    threadId: null,
    turnId: null,
  }
  const journal = new NativeOutcomeJournal({
    database,
    identity,
    sourceId: `source_${randomUUID()}`,
    sourceIncarnation: randomUUID(),
    protocolDigest: `sha256:${'b'.repeat(64)}`,
    qualificationDigest: `sha256:${'c'.repeat(64)}`,
  })
  await journal.initialize()
  const scope = {
    sourceId: journal.binding.sourceId,
    sourceIncarnation: journal.binding.sourceIncarnation,
    providerRunId: 'run',
    intentId: 'intent',
    providerNamespace: namespace,
  }
  const proof = await api.proveProviderSourceNativeConnectionDomain(database, scope)
  const finalIdentity = {
    ...identity,
    transportIncarnation: randomUUID(),
    threadId: randomUUID(),
    turnId: randomUUID(),
  }
  return { api, journal, database, client: pair.client, scope, proof, finalIdentity }
}
describe.sequential('native admission and final identity on real migrated disposable SQLite', () => {
  it('preserves immutable initial binding, appends exactly one final-ID receipt, and seals using unchanged triggers', async () => {
    const f = await fixture(),
      before = await f.client.qualityJourneyProviderSourceState.findUniqueOrThrow({
        where: { sourceId: f.scope.sourceId },
      })
    await f.journal.bindAndSeal(f.finalIdentity, `sha256:${'d'.repeat(64)}`)
    const after = await f.client.qualityJourneyProviderSourceState.findUniqueOrThrow({
      where: { sourceId: f.scope.sourceId },
    })
    expect(after.identityJson).toBe(before.identityJson)
    expect(after).toMatchObject({ lifecycle: 'SEALED', sequence: 2, sourceIncarnation: before.sourceIncarnation })
    const rows = await f.client.qualityJourneyProviderSourceLedgerRecord.findMany({
      where: { sourceId: f.scope.sourceId },
      orderBy: { sequence: 'asc' },
    })
    expect(rows.map(row => row.kind)).toEqual(['CREATED', 'RECEIPT_RESERVED'])
    expect(JSON.parse(rows[1].dataJson)).toMatchObject({
      version: 'M13_NATIVE_IDENTITY_BOUND_V1',
      finalIdentity: f.finalIdentity,
    })
    f.api.assertProviderSourceNativeConnectionDomain(f.proof, f.database, f.scope)
    expect(() =>
      f.journal.verifyLocked({ ...f.journal.state(), commitFenceVersion: 1 }, f.journal.records()),
    ).not.toThrow()
    expect(() =>
      f.journal.verifyLocked({ ...f.journal.state(), commitFenceVersion: 1 }, [
        { ...f.journal.records()[0], head: 'changed' },
      ]),
    ).toThrow()
    await expect(f.journal.bindAndSeal(f.finalIdentity, `sha256:${'d'.repeat(64)}`)).rejects.toThrow(/already bound/)
    await f.api.disposeProviderSourceDatabase(f.database)
  })
  it('keeps SQL binding immutable and rejects caller conflicting/partial identities without a new binding receipt', async () => {
    const f = await fixture()
    await expect(
      f.client.$executeRawUnsafe(
        'UPDATE QualityJourneyProviderSourceState SET identityJson=? WHERE sourceId=?',
        '{}',
        f.scope.sourceId,
      ),
    ).rejects.toThrow(/source_binding_immutable/)
    await expect(
      f.journal.bindAndSeal({ ...f.finalIdentity, claimEpoch: 2 }, `sha256:${'d'.repeat(64)}`),
    ).rejects.toThrow(/identity binding/)
    expect(
      await f.client.qualityJourneyProviderSourceLedgerRecord.count({ where: { sourceId: f.scope.sourceId } }),
    ).toBe(1)
    await expect(f.journal.bindAndSeal(f.finalIdentity, `sha256:${'d'.repeat(64)}`)).rejects.toThrow(/already bound/)
    await f.api.disposeProviderSourceDatabase(f.database)
  })
})
