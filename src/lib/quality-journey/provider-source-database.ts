import { PrismaClient } from '@prisma/client'
import { realpathSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

class ProviderSourceDatabaseError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'ProviderSourceDatabaseError'
  }
}

type SqlValue = string | number | bigint | null | Uint8Array
export type SourceSqliteStatement = Readonly<{
  run(...values: SqlValue[]): { changes: number | bigint }
  get(...values: SqlValue[]): Record<string, unknown> | undefined
  all(...values: SqlValue[]): Record<string, unknown>[]
}>
export type SourceSqliteConnection = Readonly<{
  exec(sql: string): void
  prepare(sql: string): SourceSqliteStatement
  close(): void
}>
type SqliteConstructor = new (filename: string, options?: { readOnly?: boolean }) => SourceSqliteConnection

declare const databaseBrand: unique symbol
/** Opaque process-local association, never accepted from worker data. */
export type ProviderSourceDatabase = Readonly<{ [databaseBrand]: true }>
type Binding = Readonly<{ client: PrismaClient; filename: string; device: number; inode: number }>
const byClient = new WeakMap<PrismaClient, ProviderSourceDatabase>()
const bindings = new WeakMap<ProviderSourceDatabase, Binding>()
const require = createRequire(import.meta.url)

function fail(code: string): never {
  throw new ProviderSourceDatabaseError(code)
}
function exactFile(filename: string) {
  const canonical = realpathSync(filename)
  const stat = statSync(canonical)
  if (!stat.isFile()) fail('source_database_not_file')
  return { filename: canonical, device: stat.dev, inode: stat.ino }
}
function fileUrl(databaseUrl: string): string {
  // Only the resolved explicit datasource used to construct the client is admitted.
  if (!databaseUrl.startsWith('file:')) fail('source_database_url')
  const filename = databaseUrl.slice(5)
  if (!path.isAbsolute(filename) || filename.includes('?') || filename.includes('#') || filename.includes('\0'))
    fail('source_database_url')
  return filename
}
function actualBinding(binding: ProviderSourceDatabase): Binding {
  const owned = bindings.get(binding)
  if (!owned) fail('source_database_binding')
  assertLibraryEngine(owned.client, true)
  const current = exactFile(owned.filename)
  if (current.device !== owned.device || current.inode !== owned.inode) fail('source_database_replaced')
  return owned
}

type OriginalPrismaEngine = {
  _clientVersion?: string
  _engineConfig?: { activeProvider?: string; adapter?: unknown; generator?: { config?: { engineType?: string } } }
  _engine?: { name?: string; library?: { QueryEngine?: unknown }; QueryEngineConstructor?: unknown }
}
function assertGeneratedLibraryConfiguration(original: OriginalPrismaEngine): void {
  const configuration = original._engineConfig
  if (
    original._clientVersion !== '6.19.3' ||
    !configuration ||
    configuration.activeProvider !== 'sqlite' ||
    configuration.adapter ||
    configuration.generator?.config?.engineType !== 'library'
  )
    fail('source_prisma_library_engine_required')
}
function assertLibraryEngine(client: PrismaClient, loaded: boolean): void {
  const original = client as unknown as OriginalPrismaEngine
  assertGeneratedLibraryConfiguration(original)
  const engine = original._engine
  if (engine?.name !== 'LibraryEngine') fail('source_prisma_library_engine_required')
  if (
    loaded &&
    (typeof engine.library?.QueryEngine !== 'function' || typeof engine.QueryEngineConstructor !== 'function')
  )
    fail('source_prisma_library_engine_required')
}

/** Called only at the trusted original client construction sites, before source exposure. */
async function registerProviderSourceDatabase(
  client: PrismaClient,
  explicitDatabaseUrl: string,
): Promise<ProviderSourceDatabase> {
  assertLibraryEngine(client, false)
  const expected = exactFile(fileUrl(explicitDatabaseUrl))
  const rows = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
  assertLibraryEngine(client, true)
  const main = rows.find(row => row.name === 'main')
  if (!main?.file) fail('source_database_binding')
  const actual = exactFile(main.file)
  if (actual.filename !== expected.filename || actual.device !== expected.device || actual.inode !== expected.inode)
    fail('source_database_binding')
  const prior = byClient.get(client)
  if (prior) {
    const owned = actualBinding(prior)
    if (owned.filename !== expected.filename) fail('source_database_binding')
    return prior
  }
  const token = Object.freeze({}) as ProviderSourceDatabase
  bindings.set(token, Object.freeze({ client, ...expected }))
  byClient.set(client, token)
  return token
}

/** The client is constructed here; no caller-supplied duck client can enroll. */
export function createProviderSourcePrismaClient(explicitDatabaseUrl: string): {
  client: PrismaClient
  ready: Promise<ProviderSourceDatabase>
} {
  const resolvedUrl = `file:${exactFile(fileUrl(explicitDatabaseUrl)).filename}`
  const client = new PrismaClient({ datasources: { db: { url: resolvedUrl } } })
  return { client, ready: registerProviderSourceDatabase(client, resolvedUrl) }
}

export function providerSourceDatabaseFor(client: PrismaClient): ProviderSourceDatabase {
  const binding = byClient.get(client)
  if (!binding || actualBinding(binding).client !== client) fail('source_database_binding')
  return binding
}

export function assertProviderSourceDatabaseClient(binding: ProviderSourceDatabase, client: PrismaClient): void {
  if (actualBinding(binding).client !== client || byClient.get(client) !== binding) fail('source_database_binding')
}

/** Lazy builtin capability gate: no fallback, installation, or runtime-floor change. */
export function sourceSqliteConstructor(): SqliteConstructor {
  try {
    const sqliteModule = require('node:sqlite') as { DatabaseSync?: SqliteConstructor }
    if (typeof sqliteModule.DatabaseSync !== 'function') fail('source_sqlite_unavailable')
    const prototype = sqliteModule.DatabaseSync.prototype
    if (!['exec', 'prepare', 'close'].every(method => typeof prototype[method] === 'function'))
      fail('source_sqlite_unavailable')
    return sqliteModule.DatabaseSync
  } catch {
    return fail('source_sqlite_unavailable')
  }
}

/** Source connection to the very same canonical file. Does not change journal mode. */
export function openProviderSourceDatabase(binding: ProviderSourceDatabase): SourceSqliteConnection {
  const Database = sourceSqliteConstructor()
  const owned = actualBinding(binding)
  let connection: SourceSqliteConnection | undefined
  try {
    connection = new Database(owned.filename)
    connection.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 0;')
    const setting = (name: string) => Object.values(connection!.prepare(`PRAGMA ${name}`).get() ?? {})[0]
    if (
      setting('foreign_keys') !== 1 ||
      setting('synchronous') !== 2 ||
      setting('busy_timeout') !== 0 ||
      String(setting('journal_mode')).toLowerCase() !== 'delete'
    )
      fail('source_database_durability')
    actualBinding(binding)
    const tables = connection
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)")
      .all('QualityJourneyProviderSourceState', 'QualityJourneyProviderSourceLedgerRecord')
    if (tables.length !== 2) fail('source_database_unmigrated')
    return connection
  } catch (error) {
    connection?.close()
    if (error instanceof ProviderSourceDatabaseError) throw error
    return fail('source_database_unavailable')
  }
}
