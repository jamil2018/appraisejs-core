import { PrismaClient, Prisma } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, rename } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ProviderSourceNativeConnectionScope } from './provider-source-database'

// These are connection-domain checks only. No native transport, physical source, qualification
// proof, business release or provider effect is constructed by this suite.
let workspace: string
let template: string
beforeAll(async () => {
  workspace = await mkdtemp(path.join(os.tmpdir(), 'appraise-c1-domain-'))
  template = path.join(workspace, 'migrated.sqlite')
  execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: `file:${template}` },
    stdio: 'pipe',
  })
}, 60_000)

async function fixture(options: { synthetic?: boolean; corruptCreated?: boolean; replay?: boolean } = {}) {
  vi.resetModules() // Each negative case retains its own original retired module/engine domain.
  const api = await import('./provider-source-database')
  const file = path.join(workspace, `${randomUUID()}.sqlite`)
  await copyFile(template, file)
  const scope: ProviderSourceNativeConnectionScope = Object.freeze({
    sourceId: `source-${randomUUID()}`,
    sourceIncarnation: randomUUID(),
    providerRunId: 'run',
    intentId: 'intent',
    providerNamespace: `native:${randomUUID()}`,
  })
  const setup = new PrismaClient({ datasources: { db: { url: `file:${file}?connection_limit=1` } } })
  // Inert SourceState marker fixture: no run/intent/observation receipt or positive physical proof.
  // The real migrated schema/triggers are retained; FK-free setup precedes the original factory.
  await setup.$executeRawUnsafe('PRAGMA foreign_keys=OFF')
  await setup.$executeRawUnsafe(
    `INSERT INTO QualityJourneyProviderSourceState
     (sourceId,sourceIncarnation,providerRunId,intentId,providerNamespace,identityJson,protocolDigest,qualificationDigest,head)
     VALUES (?,?,?,?,?,'{}','protocol','qualification','initial')`,
    scope.sourceId,
    scope.sourceIncarnation,
    scope.providerRunId,
    scope.intentId,
    scope.providerNamespace,
  )
  await setup.$executeRawUnsafe(
    `INSERT INTO QualityJourneyProviderSourceLedgerRecord
     (sourceId,sequence,previousHead,head,kind,dataJson,byteCount) VALUES (?,1,'initial','created','CREATED',?,1)`,
    scope.sourceId,
    JSON.stringify({ ...scope, ...(options.corruptCreated ? { sourceIncarnation: randomUUID() } : {}) }),
  )
  if (options.replay) {
    // Authored inert replay rows exercise the actual resolver SQL, not native source enrollment.
    const seed = async (table: string, values: Record<string, string | number>) => {
      const columns = await setup.$queryRawUnsafe<
        Array<{ name: string; type: string; notnull: bigint; dflt_value: unknown }>
      >(`PRAGMA table_info("${table}")`)
      const required = columns.filter(
        column => Object.hasOwn(values, column.name) || (Number(column.notnull) === 1 && column.dflt_value === null),
      )
      await setup.$executeRawUnsafe(
        `INSERT INTO "${table}" (${required.map(column => `"${column.name}"`).join(',')}) VALUES (${required.map(() => '?').join(',')})`,
        ...required.map(
          column =>
            values[column.name] ??
            (column.type === 'INTEGER' || column.type === 'DATETIME' ? 1 : `fixture-${column.name}`),
        ),
      )
    }
    await seed('QualityJourneyProviderRun', {
      id: 'run',
      providerNamespace: scope.providerNamespace,
      configurationDigest: 'configuration',
    })
    await seed('QualityJourneyProviderDispatchIntent', {
      id: 'intent',
      providerRunId: 'run',
      providerNamespace: scope.providerNamespace,
      sendBoundaryId: 'boundary',
    })
    await seed('QualityJourneyProviderObservation', {
      id: 'observation',
      intentId: 'intent',
      observationKey: 'observation',
      providerNamespace: scope.providerNamespace,
      sendBoundaryId: 'boundary',
    })
    await setup.$executeRawUnsafe(
      "UPDATE QualityJourneyProviderSourceState SET sequence=1,head='created',byteCount=1 WHERE sourceId=?",
      scope.sourceId,
    )
    await setup.$executeRawUnsafe(
      `INSERT INTO QualityJourneyProviderSourceLedgerRecord
      (sourceId,sequence,previousHead,head,kind,dataJson,byteCount) VALUES (?,2,'created','bound','RECEIPT_RESERVED',?,2)`,
      scope.sourceId,
      JSON.stringify({ version: 'M13_NATIVE_IDENTITY_BOUND_V1', fixtureOnly: true }),
    )
  }
  await setup.$disconnect()
  const captured: Array<{
    client: PrismaClient
    disconnect: (trace: string) => Promise<void>
    connect: (trace: string) => Promise<void>
  }> = []
  const connect = PrismaClient.prototype.$connect
  const spy = vi.spyOn(PrismaClient.prototype, '$connect').mockImplementation(async function (this: PrismaClient) {
    await connect.call(this)
    const native = (
      this as unknown as {
        _engine: { engine: { disconnect(trace: string): Promise<void>; connect(trace: string): Promise<void> } }
      }
    )._engine.engine
    captured.push({ client: this, disconnect: native.disconnect.bind(native), connect: native.connect.bind(native) })
  })
  const pair = (options.synthetic ? api.createProviderSourcePrismaClient : api.createProviderSourceNativePrismaClient)(
    `file:${file}`,
  )
  const database = await pair.ready
  spy.mockRestore()
  expect(captured).toHaveLength(2)
  return { api, file, scope, database, client: pair.client, resolver: captured[1].client, captured }
}
async function markerName(client: PrismaClient) {
  const rows = await client.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_temp_master WHERE type='table' AND name LIKE 'provider_source_c1_%'",
  )
  expect(rows).toHaveLength(1)
  return rows[0].name
}

describe.sequential('C1 original cooperative SQLite connection domain', () => {
  it('pins installed query_only BEGIN/read/COMMIT and exact SQLITE_BUSY mapping', async () => {
    const f = await fixture()
    await f.client.$executeRawUnsafe('BEGIN EXCLUSIVE')
    await f.client.$executeRawUnsafe('ROLLBACK')
    await f.resolver.$executeRawUnsafe('BEGIN')
    await f.resolver.$queryRawUnsafe('SELECT sourceIncarnation FROM QualityJourneyProviderSourceState')
    const busy = await f.client.$executeRawUnsafe('BEGIN EXCLUSIVE').catch(error => error)
    expect(busy).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect(busy).toMatchObject({
      code: 'P2010',
      clientVersion: '6.19.3',
      meta: { code: '5', message: 'database is locked' },
    })
    expect(Reflect.ownKeys(busy.meta)).toEqual(['code', 'message'])
    await f.resolver.$executeRawUnsafe('COMMIT')
    await f.client.$executeRawUnsafe('BEGIN EXCLUSIVE')
    await f.client.$executeRawUnsafe('ROLLBACK')
    await f.api.disposeProviderSourceDatabase(f.database)
  })

  it('admits the finite baseline/hold/busy/release probe once without business mutations', async () => {
    const f = await fixture()
    const before = await f.client.$queryRawUnsafe('SELECT * FROM QualityJourneyProviderSourceState')
    const proof = await f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    f.api.assertProviderSourceNativeConnectionDomain(proof, f.database, f.scope)
    expect(await f.client.$queryRawUnsafe('SELECT * FROM QualityJourneyProviderSourceState')).toEqual(before)
    const snapshot = f.api.providerSourceDatabaseSnapshot(f.database)
    expect(snapshot.nativeDomain).toMatchObject({
      admitted: true,
      probing: false,
      canonicalTransaction: 'CLOSED',
      resolverTransaction: 'CLOSED',
    })
    expect(snapshot.nativeDomain?.operations.filter(operation => operation.label === 'HELD_BEGIN_EXCLUSIVE')).toEqual([
      { connection: 'canonical', label: 'HELD_BEGIN_EXCLUSIVE', state: 'REJECTED' },
    ])
    expect(() => f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).toThrow(
      'source_native_domain_admission',
    )
    expect(() =>
      f.api.assertProviderSourceNativeConnectionDomain(Object.freeze({}) as typeof proof, f.database, f.scope),
    ).toThrow('source_native_domain_binding')
    expect(() =>
      f.api.assertProviderSourceNativeConnectionDomain(proof, f.database, {
        ...f.scope,
        sourceIncarnation: randomUUID(),
      }),
    ).toThrow('source_native_domain_binding')
    await f.api.disposeProviderSourceDatabase(f.database)
  })

  it('preserves the old synthetic factory and refuses its promotion', async () => {
    const f = await fixture({ synthetic: true })
    expect(f.api.providerSourceDatabaseSnapshot(f.database).nativeDomain).toBeUndefined()
    expect(() => f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).toThrow(
      'source_native_domain_admission',
    )
    const hold = f.api.acquireProviderSourceDatabaseHold(f.database, 'INITIALIZE')
    await f.api.providerSourceTransaction(f.database, hold, 'INITIALIZE', async () => {})
    hold.complete(() => {})
    await f.api.disposeProviderSourceDatabase(f.database)
  })

  for (const connection of ['client', 'resolver'] as const) {
    it(`refuses missing original ${connection} TEMP marker`, async () => {
      const f = await fixture()
      const client = f[connection]
      if (connection === 'resolver') await client.$executeRawUnsafe('PRAGMA query_only=OFF')
      await client.$executeRawUnsafe(`DROP TABLE temp."${await markerName(client)}"`)
      if (connection === 'resolver') await client.$executeRawUnsafe('PRAGMA query_only=ON')
      await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow()
      expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
        retired: true,
        nativeDomain: { admitted: false, probing: true },
      })
    })

    it(`refuses ${connection} connection rotation through the actual native engine`, async () => {
      const f = await fixture()
      const original = f.captured[connection === 'client' ? 0 : 1]
      await original.disconnect('{}')
      await original.connect('{}')
      await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow()
      expect(f.api.providerSourceDatabaseSnapshot(f.database).nativeDomain?.admitted).toBe(false)
    })
  }

  it('refuses a different persistent incarnation and mismatched immutable CREATED marker', async () => {
    const f = await fixture({ corruptCreated: true })
    await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow(
      'source_native_persistent_marker',
    )
    expect(f.api.providerSourceDatabaseSnapshot(f.database).retired).toBe(true)
  })

  it('refuses copied-database scope and same-path file replacement', async () => {
    const f = await fixture()
    await expect(
      f.api.proveProviderSourceNativeConnectionDomain(f.database, { ...f.scope, sourceIncarnation: randomUUID() }),
    ).rejects.toThrow('source_native_persistent_marker')
    const g = await fixture()
    const replacement = `${g.file}.replacement`
    await copyFile(g.file, replacement)
    await rename(g.file, `${g.file}.original`)
    await rename(replacement, g.file)
    expect(() => g.api.proveProviderSourceNativeConnectionDomain(g.database, g.scope)).toThrow(
      'source_database_replaced',
    )
  })

  for (const [connection, setting] of [
    ['client', 'PRAGMA busy_timeout=1'],
    ['resolver', 'PRAGMA query_only=OFF'],
  ] as const) {
    it(`refuses changed ${connection} settings`, async () => {
      const f = await fixture()
      await f[connection].$queryRawUnsafe(setting)
      await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow(
        'source_database_durability',
      )
    })
  }

  it('refuses concurrent holds/lookups while probing and probing while an original hold exists', async () => {
    const f = await fixture()
    const hold = f.api.acquireProviderSourceDatabaseHold(f.database, 'INITIALIZE')
    expect(() => f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).toThrow(
      'source_native_domain_admission',
    )
    await f.api.providerSourceTransaction(f.database, hold, 'INITIALIZE', async () => {})
    hold.complete(() => {})
    const original = f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    expect(() => f.api.acquireProviderSourceDatabaseHold(f.database, 'INITIALIZE')).toThrow(
      'source_native_domain_not_admitted',
    )
    await expect(f.api.readProviderSourceCommittedSnapshot(f.database, 'intent', 'observation')).rejects.toThrow(
      'source_native_domain_not_admitted',
    )
    await original
    await f.api.disposeProviderSourceDatabase(f.database)
  })

  it('blocks cleanup during a probe and refuses enrollment once cleanup is requested', async () => {
    const f = await fixture()
    const operation = f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    const cleanup = f.api.disposeProviderSourceDatabase(f.database)
    expect(f.api.providerSourceDatabaseSnapshot(f.database).canonical.layers.client).toBe('QUEUED')
    await expect(operation).rejects.toThrow('source_database_admission_closed')
    let settled = false
    void cleanup.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
      retired: true,
      canonical: { holds: 1 },
      resolver: { holds: 1 },
      nativeDomain: { admitted: false },
    })
  })
})

// Fault injection below only removes cooperation or delays original cleanup/query settlement.
// It never constructs an accepted physical-source capability.
describe.sequential('C1 sticky refusal and transaction continuity', () => {
  for (const fault of ['plain-error', 'SQLITE_LOCKED', 'malformed-BUSY'] as const) {
    it(`retains uncertainty for ${fault} rather than accepting an arbitrary rejection`, async () => {
      const f = await fixture()
      const original = f.client.$executeRawUnsafe.bind(f.client)
      let begins = 0
      Object.defineProperty(f.client, '$executeRawUnsafe', {
        value: (sql: string, ...args: unknown[]) => {
          if (sql === 'BEGIN EXCLUSIVE' && ++begins === 2) {
            const error =
              fault === 'plain-error'
                ? new Error('database is locked')
                : new Prisma.PrismaClientKnownRequestError('injected negative SQLite result', {
                    code: 'P2010',
                    clientVersion: '6.19.3',
                    meta:
                      fault === 'SQLITE_LOCKED'
                        ? { code: '6', message: 'database table is locked' }
                        : { code: 5, message: 'database is locked' },
                  })
            return Promise.reject(error)
          }
          return original(sql, ...args)
        },
      })
      await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow()
      expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
        retired: true,
        nativeDomain: {
          admitted: false,
          canonicalTransaction: 'UNKNOWN',
          resolverTransaction: 'CLOSED',
        },
      })
    })
  }

  it('rolls back an unexpectedly successful original BEGIN but preserves refusal', async () => {
    const f = await fixture()
    const original = f.client.$executeRawUnsafe.bind(f.client)
    let begins = 0
    Object.defineProperty(f.client, '$executeRawUnsafe', {
      value: async (sql: string, ...args: unknown[]) => {
        if (sql === 'BEGIN EXCLUSIVE' && ++begins === 2) await f.resolver.$executeRawUnsafe('COMMIT')
        return original(sql, ...args)
      },
    })
    await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow(
      'source_native_domain_exclusion_missing',
    )
    expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
      retired: true,
      nativeDomain: {
        admitted: false,
        canonicalTransaction: 'CLOSED',
        resolverTransaction: 'UNKNOWN',
      },
    })
    // The successful original exclusive transaction really was rolled back.
    await original('BEGIN EXCLUSIVE')
    await original('ROLLBACK')
  })

  it('retains the actual pending COMMIT and never reprobes after its late settlement', async () => {
    const f = await fixture()
    const original = f.resolver.$executeRawUnsafe.bind(f.resolver)
    let finish!: () => void
    const blocked = new Promise<void>(resolve => {
      finish = resolve
    })
    Object.defineProperty(f.resolver, '$executeRawUnsafe', {
      value: (sql: string, ...args: unknown[]) =>
        sql === 'COMMIT' ? blocked.then(() => original(sql, ...args)) : original(sql, ...args),
    })
    const operation = f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    await expect(operation).rejects.toThrow('source_native_domain_deadline')
    expect(f.api.providerSourceDatabaseSnapshot(f.database).nativeDomain).toMatchObject({
      admitted: false,
      resolverTransaction: 'UNKNOWN',
      operations: expect.arrayContaining([{ connection: 'resolver', label: 'COMMIT', state: 'PENDING' }]),
    })
    finish()
    await blocked
    await new Promise(resolve => setImmediate(resolve))
    expect(() => f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).toThrow(
      'source_database_admission_closed',
    )
    expect(f.api.providerSourceDatabaseSnapshot(f.database).retired).toBe(true)
  })

  for (const cleanup of ['pending', 'rejected'] as const) {
    it(`keeps ${cleanup} original rollback cleanup held and refuses proof`, async () => {
      const f = await fixture()
      const resolverOriginal = f.resolver.$executeRawUnsafe.bind(f.resolver)
      const canonicalOriginal = f.client.$executeRawUnsafe.bind(f.client)
      let begins = 0
      Object.defineProperty(f.client, '$executeRawUnsafe', {
        value: (sql: string, ...args: unknown[]) => {
          if (sql === 'BEGIN EXCLUSIVE' && ++begins === 2) return Promise.reject(new Error('negative held-BEGIN fault'))
          return canonicalOriginal(sql, ...args)
        },
      })
      Object.defineProperty(f.resolver, '$executeRawUnsafe', {
        value: (sql: string, ...args: unknown[]) => {
          if (sql === 'ROLLBACK')
            return cleanup === 'pending'
              ? new Promise(() => {})
              : Promise.reject(new Error('negative rollback rejection'))
          return resolverOriginal(sql, ...args)
        },
      })
      await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toThrow(
        'negative held-BEGIN fault',
      )
      expect(f.api.providerSourceDatabaseSnapshot(f.database).nativeDomain).toMatchObject({
        admitted: false,
        resolverTransaction: 'UNKNOWN',
        operations: expect.arrayContaining([
          { connection: 'resolver', label: 'ROLLBACK', state: cleanup === 'pending' ? 'PENDING' : 'REJECTED' },
        ]),
      })
      const disposal = f.api.disposeProviderSourceDatabase(f.database)
      let settled = false
      void disposal.then(
        () => {
          settled = true
        },
        () => {
          settled = true
        },
      )
      await Promise.resolve()
      expect(settled).toBe(false)
      expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
        retired: true,
        canonical: { cleanupAdmitted: false },
        resolver: { cleanupAdmitted: false },
      })
      // Original pending/rejected rollback promises remain retained; destructors never run.
    })
  }

  it('checks canonical TEMP on the actual native transaction after the first CAS and rolls it back', async () => {
    const f = await fixture()
    const proof = await f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    const hold = f.api.acquireProviderSourceDatabaseHold(f.database, 'RECONCILE', {
      intentId: f.scope.intentId,
      observationKey: 'observation',
      requestHash: `sha256:${'a'.repeat(64)}`,
    })
    await f.client.$executeRawUnsafe(`DROP TABLE temp."${await markerName(f.client)}"`)
    let afterCheck = false
    await expect(
      f.client.$transaction(async tx => {
        await tx.$executeRawUnsafe(
          'UPDATE QualityJourneyProviderSourceState SET commitFenceVersion=commitFenceVersion+1 WHERE sourceId=?',
          f.scope.sourceId,
        )
        await f.api.assertProviderSourceTransactionSettingsForClient(f.client, tx, hold, 'RECONCILE_CANONICAL')
        afterCheck = true
      }),
    ).rejects.toThrow()
    expect(afterCheck).toBe(false)
    const rows = await f.client.$queryRawUnsafe<Array<{ commitFenceVersion: bigint }>>(
      'SELECT commitFenceVersion FROM QualityJourneyProviderSourceState',
    )
    expect(Number(rows[0].commitFenceVersion)).toBe(0)
    expect(() => f.api.assertProviderSourceNativeConnectionDomain(proof, f.database, f.scope)).toThrow(
      'source_native_domain_binding',
    )
  })
})

describe.sequential('C1 original positive replay projection', () => {
  it('returns bounded native CREATED/BOUND fields through the original clean resolver', async () => {
    const f = await fixture({ replay: true })
    await f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    const snapshot = await f.api.readProviderSourceCommittedSnapshot(f.database, 'intent', 'observation')
    expect(snapshot).toMatchObject({
      observationId: 'observation',
      nativeLedgerCount: 2,
      nativeCreatedCount: 1,
      nativeBoundCount: 1,
      nativeBoundSequence: 2,
      nativeBoundHead: 'bound',
      nativeBoundPreviousHead: 'created',
      nativeBoundByteCount: 2,
    })
    expect(JSON.parse(String(snapshot?.nativeCreatedJson))).toEqual(f.scope)
    expect(JSON.parse(String(snapshot?.nativeBoundJson))).toEqual({
      version: 'M13_NATIVE_IDENTITY_BOUND_V1',
      fixtureOnly: true,
    })
    await f.api.disposeProviderSourceDatabase(f.database)
  })

  for (const fault of ['missing', 'changed', 'extra'] as const) {
    it(`refuses ${fault} resolver TEMP marker on the actual positive replay`, async () => {
      const f = await fixture({ replay: true })
      await f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
      const table = await markerName(f.resolver)
      await f.resolver.$executeRawUnsafe('PRAGMA query_only=OFF')
      if (fault === 'missing') await f.resolver.$executeRawUnsafe(`DROP TABLE temp."${table}"`)
      if (fault === 'changed') await f.resolver.$executeRawUnsafe(`UPDATE temp."${table}" SET nonce='changed'`)
      if (fault === 'extra') await f.resolver.$executeRawUnsafe(`INSERT INTO temp."${table}" VALUES ('extra')`)
      await f.resolver.$executeRawUnsafe('PRAGMA query_only=ON')
      await expect(f.api.readProviderSourceCommittedSnapshot(f.database, 'intent', 'observation')).rejects.toThrow()
      expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
        retired: true,
        lookupPending: true,
        nativeDomain: { admitted: false },
      })
    })
  }
})

describe.sequential('C1 dedicated probe transaction admission', () => {
  it('refuses probing during an actual original interactive transaction and closes the inverse admission', async () => {
    const f = await fixture()
    let release!: () => void
    const barrier = new Promise<void>(resolve => {
      release = resolve
    })
    let entered!: () => void
    const inside = new Promise<void>(resolve => {
      entered = resolve
    })
    const actual = f.client.$transaction(async tx => {
      await tx.$queryRawUnsafe('SELECT sourceIncarnation FROM QualityJourneyProviderSourceState')
      entered()
      await barrier
    })
    await inside
    expect(f.api.providerSourceDatabaseSnapshot(f.database).nativeDomain?.interactiveTransactions).toBe(1)
    expect(() => f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).toThrow(
      'source_native_domain_admission',
    )
    release()
    await actual
    const probe = f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    expect(() => f.client.$transaction(async () => {})).toThrow('source_native_domain_transaction_admission')
    await probe
    await f.api.disposeProviderSourceDatabase(f.database)
  })
})

describe.sequential('C1 original capability and ambiguous transaction ownership', () => {
  it('refuses transferring an original domain capability to a byte-for-byte copied database', async () => {
    const f = await fixture()
    const proof = await f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    await f.api.disposeProviderSourceDatabase(f.database)
    const copied = `${f.file}.copy`
    await copyFile(f.file, copied)
    const pair = f.api.createProviderSourceNativePrismaClient(`file:${copied}`)
    const database = await pair.ready
    expect(() => f.api.assertProviderSourceNativeConnectionDomain(proof, database, f.scope)).toThrow(
      'source_native_domain_binding',
    )
    await f.api.disposeProviderSourceDatabase(database)
  })

  it('retains rejected canonical work in its original hold while allowing only its scoped resolver lookup', async () => {
    const f = await fixture({ replay: true })
    await f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)
    const requestHash = `sha256:${'a'.repeat(64)}`
    const hold = f.api.acquireProviderSourceDatabaseHold(f.database, 'RECONCILE', {
      intentId: 'intent',
      observationKey: 'observation',
      requestHash,
    })
    const actual = f.client.$transaction(async tx => {
      await f.api.assertProviderSourceTransactionSettingsForClient(f.client, tx, hold, 'RECONCILE_CANONICAL')
      throw new Error('negative canonical transaction reply')
    })
    await expect(actual).rejects.toThrow('negative canonical transaction reply')
    expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
      retired: true,
      held: true,
      nativeDomain: { interactiveTransactions: 0 },
    })
    hold.retire(actual)
    const snapshot = await f.api.readProviderSourceCommittedSnapshot(
      f.database,
      'intent',
      'observation',
      hold,
      requestHash,
    )
    expect(snapshot?.observationId).toBe('observation')
    // Only the domain hold is finalized; no physical-source proof or business release exists here.
    expect(f.api.resolveProviderSourceDatabaseHold(hold, () => {})).toBe(true)
    await f.api.disposeProviderSourceDatabase(f.database)
  })

  it('refuses a baseline exclusive transaction when an existing original reader already holds SHARED', async () => {
    const f = await fixture()
    await f.resolver.$executeRawUnsafe('BEGIN')
    await f.resolver.$queryRawUnsafe('SELECT sourceIncarnation FROM QualityJourneyProviderSourceState')
    await expect(f.api.proveProviderSourceNativeConnectionDomain(f.database, f.scope)).rejects.toMatchObject({
      code: 'P2010',
      meta: { code: '5' },
    })
    expect(f.api.providerSourceDatabaseSnapshot(f.database)).toMatchObject({
      retired: true,
      nativeDomain: { admitted: false, canonicalTransaction: 'UNKNOWN' },
    })
    // The probe does not adopt or release this external original transaction.
    await f.resolver.$executeRawUnsafe('ROLLBACK')
  })
})
