import { PrismaClient, type Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { OutcomeCleanupCell, outcomeSafeInteger, outcomeSourceBounds } from './codex-app-server/outcome-source-contract'

class ProviderSourceDatabaseError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'ProviderSourceDatabaseError'
  }
}
declare const databaseBrand: unique symbol
/** Minted only by the original private two-client factory. Never imported from durable data. */
export type ProviderSourceDatabase = Readonly<{ [databaseBrand]: true }>
export type ProviderSourceTransaction = Prisma.TransactionClient
export type ProviderSourceOperationKind = 'INITIALIZE' | 'SEND' | 'RECEIPT' | 'CLOSE' | 'ENCODING_HOLE' | 'RECONCILE'
export type ProviderSourcePhase = 'INITIALIZE' | 'RESERVE' | 'SEND_CANONICAL' | 'RECONCILE_CANONICAL' | 'FLUSH' | 'SEAL'
export type ProviderSourceRequestScope = Readonly<{ intentId: string; observationKey: string; requestHash: string }>
export type ProviderSourceDatabaseHold = Readonly<{
  complete(finalizeSource: () => void): void
  retire(operation?: Promise<unknown>): void
}>
type SettingsRow = Record<string, unknown>
type Engine = {
  name: string
  start(...args: unknown[]): Promise<unknown>
  stop(...args: unknown[]): Promise<unknown>
  library?: { QueryEngine?: unknown }
  QueryEngineConstructor?: unknown
  engine?: { disconnect(...args: unknown[]): Promise<unknown> }
}
type CleanupLayer = 'CLIENT' | 'ENGINE' | 'NATIVE'
type Mint = {
  client: PrismaClient
  raw: object
  engine: Engine
  configuration: Record<string, unknown>
  closeRequested: boolean
  cleanupAdmitted: boolean
  holds: number
  cells: Record<CleanupLayer, OutcomeCleanupCell>
  actions: Record<CleanupLayer, (...args: unknown[]) => Promise<unknown>>
  arguments: Partial<Record<CleanupLayer, unknown[]>>
  binding?: Binding
  stopCalls: number
  nativeCalls: number
  info: string[]
  disconnect(): Promise<void>
}
type HoldRecord = {
  readonly binding: Binding
  readonly token: ProviderSourceDatabase
  readonly kind: ProviderSourceOperationKind
  readonly scope?: ProviderSourceRequestScope
  readonly capability: ProviderSourceDatabaseHold
  phaseIndex: number
  phase?: ProviderSourcePhase
  retired: boolean
  closed: boolean
  operation?: Promise<unknown>
  resolutionLookups: number
}
type LookupRecord = {
  readonly binding: Binding
  readonly hold?: HoldRecord
  operation?: Promise<SettingsRow[]>
  retired: boolean
}
type Binding = {
  client: PrismaClient
  resolver: PrismaClient
  canonical: Mint
  reader: Mint
  filename: string
  device: number
  inode: number
  ready: boolean
  initializing: boolean
  finalCloseRequested: boolean
  pumping: boolean
  hold?: HoldRecord
  lookup?: LookupRecord
  initializationFailure?: Readonly<{ operation?: Promise<unknown>; error: unknown }>
  lookupFailure?: LookupRecord
  operation?: Promise<unknown>
  cleanup?: Promise<void>
  cleanupOperation?: Promise<unknown>
  cleanupFailure?: Readonly<{ operation?: Promise<unknown>; error: unknown }>
  // The retained private closure captures its actual source owner/operation; never retried.
  handoffFailure?: Readonly<{ hold: HoldRecord; finalizeSource: () => void; error: unknown }>
  library?: Readonly<{ path: string; digest: string; constructor: unknown }>
}
const holds = new WeakMap<ProviderSourceDatabaseHold, HoldRecord>()
const byClient = new WeakMap<PrismaClient, ProviderSourceDatabase>()
const bindings = new WeakMap<ProviderSourceDatabase, Binding>()
const mints = new WeakMap<PrismaClient, Mint>()
const MintConstructor = PrismaClient
const MintPrototype = PrismaClient.prototype
// Strong retention is intentional for unresolved initialization, engine, lookup and cleanup operations.
let active: Binding | undefined
let retired: Binding | undefined

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
  if (!databaseUrl.startsWith('file:')) fail('source_database_url')
  const filename = databaseUrl.slice(5)
  if (!path.isAbsolute(filename) || filename.includes('?') || filename.includes('#') || filename.includes('\0'))
    fail('source_database_url')
  return filename
}
function ownData(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('source_prisma_original_pair')
  return descriptor.value
}
function assertOriginalPair(mint: Mint): void {
  const client = mint.client,
    proxy = client as unknown as Record<string, unknown>
  if (Object.getPrototypeOf(mint.raw) !== MintPrototype || Object.getPrototypeOf(client) !== Object.prototype)
    fail('source_prisma_original_pair')
  if (
    ownData(MintPrototype, 'constructor') !== MintConstructor ||
    ownData(MintConstructor, 'prototype') !== MintPrototype
  )
    fail('source_prisma_original_pair')
  const fields = {
    _originalClient: mint.raw,
    _appliedParent: client,
    _engine: mint.engine,
    _engineConfig: mint.configuration,
  }
  for (const [key, value] of Object.entries(fields)) {
    if (ownData(mint.raw, key) !== value || proxy[key] !== value) fail('source_prisma_original_pair')
  }
}
function assertLibraryConfiguration(mint: Mint): void {
  const configuration = mint.configuration as {
    activeProvider?: string
    adapter?: unknown
    generator?: { config?: { engineType?: string } }
  }
  if (
    (mint.client as unknown as { _clientVersion?: string })._clientVersion !== '6.19.3' ||
    mint.engine.name !== 'LibraryEngine'
  )
    fail('source_prisma_library_engine_required')
  if (
    configuration.activeProvider !== 'sqlite' ||
    configuration.adapter ||
    configuration.generator?.config?.engineType !== 'library'
  )
    fail('source_prisma_library_engine_required')
}
function assertMint(client: PrismaClient): Mint {
  // Unknown candidates are refused before any getter, descriptor or prototype inspection.
  const mint = mints.get(client)
  if (!mint) fail('source_database_binding')
  assertOriginalPair(mint)
  assertLibraryConfiguration(mint)
  return mint
}
function mintList(owned: Binding): Mint[] {
  return owned.reader ? [owned.canonical, owned.reader] : [owned.canonical]
}
function independentRetirement(owned: Binding): boolean {
  return (
    !!owned.initializationFailure ||
    !!owned.lookupFailure ||
    !!owned.cleanupFailure ||
    !!owned.handoffFailure ||
    mintList(owned).some(mint =>
      Object.values(mint.cells).some(cell => cell.state === 'REJECTED' || cell.state === 'RETAINED_BLOCKED'),
    )
  )
}
function isRetired(owned: Binding): boolean {
  return independentRetirement(owned) || !!owned.hold?.retired
}
function closing(owned: Binding): boolean {
  return owned.finalCloseRequested || mintList(owned).some(mint => mint.closeRequested)
}
function fullyClosed(owned: Binding): boolean {
  return (
    !owned.initializing &&
    !owned.hold &&
    !owned.lookup &&
    mintList(owned).length === 2 &&
    mintList(owned).every(
      mint =>
        mint.cells.CLIENT.state === 'FULFILLED' &&
        Object.values(mint.cells).every(cell => cell.state === 'UNREQUESTED' || cell.state === 'FULFILLED'),
    )
  )
}
function reserveLane(owned: Binding): void {
  if ((active && active !== owned) || (retired && retired !== owned)) fail('source_custody_slot_unavailable')
  active = owned
}
function updateLane(owned: Binding): void {
  if (isRetired(owned)) {
    retired = owned
    active = owned
    return
  }
  if (retired === owned) retired = undefined
  if (
    active === owned &&
    !owned.initializing &&
    !owned.hold &&
    !owned.lookup &&
    (!closing(owned) || fullyClosed(owned))
  )
    active = undefined
}
/** Admit/observe exactly one original layer; the driver retains its fixed outer-to-inner order. */
function pumpCleanupCell(owned: Binding, mint: Mint, layer: CleanupLayer): void {
  const cell = mint.cells[layer]
  if (cell.state !== 'QUEUED') return
  if (independentRetirement(owned)) {
    cell.request(true)
    return
  }
  if (owned.initializing || owned.hold || owned.lookup) return
  mint.cleanupAdmitted = true
  cell.admit(
    () => {
      if (layer === 'ENGINE') mint.stopCalls++
      if (layer === 'NATIVE') mint.nativeCalls++
      return mint.actions[layer](...(mint.arguments[layer] ?? []))
    },
    rejected => {
      // The cell records its cause before any public rejection is observable.
      if (rejected) {
        retired = owned
        active = owned
      }
      pumpCleanup(owned)
      updateLane(owned)
    },
  )
}
/** Six fixed own-layer leaves; synchronous descent never adopts an enclosing completion. */
function pumpCleanup(owned: Binding): void {
  if (owned.pumping || owned.handoffFailure) return
  owned.pumping = true
  try {
    for (const mint of mintList(owned)) {
      for (const layer of ['CLIENT', 'ENGINE', 'NATIVE'] as const) {
        pumpCleanupCell(owned, mint, layer)
      }
    }
  } finally {
    owned.pumping = false
    updateLane(owned)
  }
}
function requestCleanup(mint: Mint, layer: CleanupLayer, args: unknown[] = []): Promise<unknown> {
  const cell = mint.cells[layer]
  const published = cell.publishedPromise
  if (published) return published // No lane reservation, mutation or pump for existing work.
  const owned = mint.binding
  if (!owned) fail('source_database_cleanup_unowned')
  reserveLane(owned)
  mint.closeRequested = true
  if (cell.state === 'UNREQUESTED') mint.arguments[layer] = args.slice()
  const completion = cell.request(independentRetirement(owned)) // Publish before invoking any layer.
  pumpCleanup(owned)
  return completion
}
function mintClient(url: string): Mint {
  const client = new MintConstructor({ datasources: { db: { url } }, log: [{ emit: 'event', level: 'info' }] })
  const proxy = client as unknown as Record<string, unknown>
  const raw = proxy._originalClient
  if (!raw || typeof raw !== 'object' || raw === client) fail('source_prisma_original_pair')
  const engine = ownData(raw, '_engine') as Engine
  const configuration = ownData(raw, '_engineConfig') as Record<string, unknown>
  const underlyingStart = engine.start.bind(engine)
  const mint: Mint = {
    client,
    raw,
    engine,
    configuration,
    closeRequested: false,
    cleanupAdmitted: false,
    holds: 1,
    cells: { CLIENT: new OutcomeCleanupCell(), ENGINE: new OutcomeCleanupCell(), NATIVE: new OutcomeCleanupCell() },
    actions: {
      CLIENT: client.$disconnect.bind(client),
      ENGINE: engine.stop.bind(engine),
      NATIVE: () => fail('source_prisma_disconnect_unowned'),
    },
    arguments: {},
    stopCalls: 0,
    nativeCalls: 0,
    info: [],
    // This cell invokes the genuine Promise<void> client method and retains its own stable result.
    disconnect: () => requestCleanup(mint, 'CLIENT') as Promise<void>,
  }
  mints.set(client, mint)
  assertMint(client)
  client.$on('info', row => {
    if (mint.info.length < 8) mint.info.push(String(row.message).slice(0, 500))
  })
  Object.defineProperty(engine, 'start', {
    configurable: false,
    writable: false,
    value: (...args: unknown[]) => {
      // Close intent alone cannot poison genuine protected continuations or the surviving reader.
      if (mint.cleanupAdmitted) fail('source_database_no_reconnect')
      return underlyingStart(...args)
    },
  })
  Object.defineProperty(engine, 'stop', {
    configurable: false,
    writable: false,
    value: (...args: unknown[]) => requestCleanup(mint, 'ENGINE', args),
  })
  Object.defineProperty(client, '$disconnect', { configurable: false, writable: false, value: mint.disconnect })
  return mint
}
const flagsSql = `SELECT q.query_only AS queryOnly,r.read_uncommitted AS readUncommitted,
 b.timeout AS busyTimeout,f.foreign_keys AS foreignKeys,y.synchronous AS synchronous,
 j.journal_mode AS journalMode,d.file AS databaseFile
 FROM pragma_query_only q CROSS JOIN pragma_read_uncommitted r CROSS JOIN pragma_busy_timeout b
 CROSS JOIN pragma_foreign_keys f CROSS JOIN pragma_synchronous y CROSS JOIN pragma_journal_mode j
 CROSS JOIN pragma_database_list d WHERE d.name='main'`
function assertFile(owned: Binding, filename: string): void {
  const actual = exactFile(filename)
  if (actual.filename !== owned.filename || actual.device !== owned.device || actual.inode !== owned.inode)
    fail('source_database_replaced')
}
function assertFlags(owned: Binding, row: SettingsRow, queryOnly: boolean, complete: boolean): void {
  if (
    Number(row.queryOnly) !== Number(queryOnly) ||
    Number(row.readUncommitted) !== 0 ||
    Number(row.busyTimeout) !== 0 ||
    typeof row.databaseFile !== 'string'
  )
    fail('source_database_durability')
  if (
    complete &&
    (Number(row.foreignKeys) !== 1 ||
      Number(row.synchronous) !== 2 ||
      String(row.journalMode).toLowerCase() !== 'delete')
  )
    fail('source_database_durability')
  assertFile(owned, row.databaseFile)
}
function ownNativeDisconnect(mint: Mint): void {
  const native = mint.engine.engine
  if (!native || typeof native.disconnect !== 'function') fail('source_prisma_disconnect_unowned')
  mint.actions.NATIVE = native.disconnect.bind(native)
  Object.defineProperty(native, 'disconnect', {
    configurable: false,
    writable: false,
    value: (...args: unknown[]) => requestCleanup(mint, 'NATIVE', args),
  })
}
async function prepareConnectionSettings(mint: Mint, queryOnly: boolean): Promise<void> {
  for (const sql of [
    'PRAGMA foreign_keys=ON',
    'PRAGMA synchronous=FULL',
    'PRAGMA busy_timeout=0',
    'PRAGMA read_uncommitted=OFF',
    `PRAGMA query_only=${queryOnly ? 'ON' : 'OFF'}`,
  ]) {
    if (sql === 'PRAGMA busy_timeout=0') {
      const rows = await mint.client.$queryRawUnsafe<SettingsRow[]>(sql)
      if (rows.length !== 1 || Reflect.ownKeys(rows[0]).length !== 1 || Number(rows[0].timeout) !== 0)
        fail('source_database_busy_timeout')
    } else await mint.client.$executeRawUnsafe(sql)
  }
}
async function prepare(owned: Binding, mint: Mint, queryOnly: boolean): Promise<void> {
  assertMint(mint.client)
  await mint.client.$connect()
  ownNativeDisconnect(mint)
  await prepareConnectionSettings(mint, queryOnly)
  const flags = await mint.client.$queryRawUnsafe<SettingsRow[]>(flagsSql)
  if (flags.length !== 1) fail('source_database_binding')
  assertFlags(owned, flags[0], queryOnly, true)
  if (!mint.info.some(message => /pool with 1 connections?\b/i.test(message))) fail('source_prisma_pool_one')
}
function sharedQueryEngine(owned: Binding): unknown {
  const a = assertMint(owned.client),
    b = assertMint(owned.resolver),
    constructor = a.engine.library?.QueryEngine
  if (
    typeof constructor !== 'function' ||
    b.engine.library?.QueryEngine !== constructor ||
    a.engine.QueryEngineConstructor !== constructor ||
    b.engine.QueryEngineConstructor !== constructor
  )
    fail('source_prisma_library_identity')
  return constructor
}
function loadedLibraryPath(): string {
  const report = process.report.getReport() as unknown as { sharedObjects?: string[] }
  const libraries = [
    ...new Set(
      (report.sharedObjects ?? [])
        .filter(name => /query_engine.*\.(node|dylib)/.test(name))
        .map(name => realpathSync(name)),
    ),
  ]
  if (libraries.length !== 1) fail('source_prisma_library_identity')
  return libraries[0]
}
function provenance(owned: Binding): void {
  const constructor = sharedQueryEngine(owned),
    library = loadedLibraryPath()
  const digest = createHash('sha256').update(readFileSync(library)).digest('hex') // Static native code only.
  const previous = owned.library
  if (previous && (previous.path !== library || previous.digest !== digest || previous.constructor !== constructor))
    fail('source_prisma_library_identity')
  owned.library = Object.freeze({ path: library, digest, constructor })
}
function actualBinding(token: ProviderSourceDatabase): Binding {
  const owned = bindings.get(token)
  if (!owned || !owned.ready) fail('source_database_binding')
  assertMint(owned.client)
  assertMint(owned.resolver)
  assertFile(owned, owned.filename)
  return owned
}
function assertNewSourceAdmission(owned: Binding): void {
  if (closing(owned) || isRetired(owned) || mintList(owned).some(mint => mint.cleanupAdmitted))
    fail('source_database_admission_closed')
}
function originalHold(capability: ProviderSourceDatabaseHold): HoldRecord {
  const record = holds.get(capability)
  if (!record || record.closed || record.binding.hold !== record) fail('source_database_hold_binding')
  actualBinding(record.token)
  return record
}
const phases: Record<ProviderSourceOperationKind, readonly ProviderSourcePhase[]> = {
  INITIALIZE: ['INITIALIZE'],
  SEND: ['RESERVE', 'SEND_CANONICAL', 'FLUSH'],
  RECEIPT: ['RESERVE', 'FLUSH', 'SEAL'],
  CLOSE: ['RESERVE', 'FLUSH'],
  ENCODING_HOLE: ['RESERVE', 'FLUSH'],
  RECONCILE: ['RECONCILE_CANONICAL'],
}
function enterPhase(capability: ProviderSourceDatabaseHold, phase: ProviderSourcePhase): HoldRecord {
  const record = originalHold(capability)
  if (
    record.retired ||
    record.phase ||
    phases[record.kind][record.phaseIndex] !== phase ||
    independentRetirement(record.binding)
  )
    fail('source_database_continuation_binding')
  record.phase = phase
  return record
}
function finishPhase(record: HoldRecord, phase: ProviderSourcePhase): void {
  if (record.binding.hold !== record || record.closed || record.retired || record.phase !== phase)
    fail('source_database_continuation_binding')
  record.phase = undefined
  record.phaseIndex++
}
/** The real original hold blocks every destructor until private source finalization succeeds. */
function finalizeHold(record: HoldRecord, finalizeSource: () => void, resolveRetirement: boolean): void {
  try {
    const result: unknown = finalizeSource()
    if (result !== undefined) fail('source_database_finalizer_must_be_synchronous')
  } catch (error) {
    record.binding.handoffFailure ??= Object.freeze({ hold: record, finalizeSource, error })
    updateLane(record.binding) // Independent cause owns the lane before the error escapes.
    throw error // Keep the actual hold/counts/closure. No endHold, pump, retry or reconstruction.
  }
  if (resolveRetirement) record.retired = false
  endHold(record)
}
function endHold(record: HoldRecord): void {
  record.closed = true
  record.binding.hold = undefined
  for (const mint of mintList(record.binding)) mint.holds--
  pumpCleanup(record.binding)
  updateLane(record.binding)
}
/** Genuine factory proxy/raw pairs and initialization ownership precede all async preparation. */
export function createProviderSourcePrismaClient(explicitDatabaseUrl: string): {
  client: PrismaClient
  ready: Promise<ProviderSourceDatabase>
} {
  if (active || retired) fail('source_custody_slot_unavailable')
  const file = exactFile(fileUrl(explicitDatabaseUrl)),
    url = `file:${file.filename}?connection_limit=1`
  const canonical = mintClient(url)
  const owned = {
    ...file,
    client: canonical.client,
    canonical,
    ready: false,
    initializing: true,
    finalCloseRequested: false,
    pumping: false,
  } as Binding
  canonical.binding = owned
  active = owned
  const token = Object.freeze({}) as ProviderSourceDatabase
  bindings.set(token, owned)
  byClient.set(canonical.client, token)
  let ready: Promise<ProviderSourceDatabase>
  try {
    owned.reader = mintClient(url)
    owned.reader.binding = owned
    owned.resolver = owned.reader.client
    ready = (async () => {
      await prepare(owned, canonical, false)
      await prepare(owned, owned.reader, true)
      provenance(owned)
      owned.ready = true
      owned.initializing = false
      for (const mint of mintList(owned)) mint.holds--
      pumpCleanup(owned)
      updateLane(owned)
      return token
    })()
  } catch (error) {
    ready = Promise.reject(error)
  }
  owned.operation = ready
  void ready.catch(error => {
    owned.initializationFailure = { operation: ready, error }
    updateLane(owned)
    pumpCleanup(owned)
  })
  return { client: canonical.client, ready }
}
export function providerSourceDatabaseIsOwned(client: PrismaClient): boolean {
  return byClient.has(client)
}
/** Identity only: a closed canonical object still identifies its surviving original resolver. */
export function providerSourceDatabaseClient(token: ProviderSourceDatabase): PrismaClient {
  return actualBinding(token).client
}
export function providerSourceDatabaseFor(client: PrismaClient): ProviderSourceDatabase {
  const token = byClient.get(client)
  if (!token || actualBinding(token).client !== client) fail('source_database_binding')
  return token
}
export function assertProviderSourceDatabaseClient(token: ProviderSourceDatabase, client: PrismaClient): void {
  if (actualBinding(token).client !== client || byClient.get(client) !== token) fail('source_database_binding')
}
export function acquireProviderSourceDatabaseHold(
  token: ProviderSourceDatabase,
  kind: ProviderSourceOperationKind,
  scope?: ProviderSourceRequestScope,
): ProviderSourceDatabaseHold {
  const owned = actualBinding(token)
  assertNewSourceAdmission(owned)
  if (active || retired || owned.hold || owned.lookup) fail('source_custody_slot_unavailable')
  if (!Object.hasOwn(phases, kind) || (kind === 'RECONCILE') !== !!scope) fail('source_database_request_binding')
  const capturedScope = scope
    ? Object.freeze({ intentId: scope.intentId, observationKey: scope.observationKey, requestHash: scope.requestHash })
    : undefined
  if (
    capturedScope &&
    (!/^[a-zA-Z0-9_.:/-]{1,200}$/.test(capturedScope.intentId) ||
      !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(capturedScope.observationKey) ||
      !/^sha256:[a-f0-9]{64}$/.test(capturedScope.requestHash))
  )
    fail('source_database_request_binding')
  const capability = Object.freeze({
    complete: (finalizeSource: () => void) => {
      const record = originalHold(capability)
      if (
        active !== owned ||
        record.retired ||
        record.phase ||
        record.phaseIndex !== phases[record.kind].length ||
        independentRetirement(owned)
      )
        fail('source_database_hold_binding')
      finalizeHold(record, finalizeSource, false)
    },
    retire: (operation?: Promise<unknown>) => {
      const record = originalHold(capability)
      record.retired = true
      record.operation ??= operation
      updateLane(owned)
    },
  })
  const record: HoldRecord = {
    binding: owned,
    token,
    kind,
    scope: capturedScope,
    capability,
    phaseIndex: 0,
    retired: false,
    closed: false,
    resolutionLookups: 0,
  }
  holds.set(capability, record)
  owned.hold = record
  for (const mint of mintList(owned)) mint.holds++
  active = owned
  return capability
}
/** Resolve only this original hold; independent read/initialization/cleanup causes are never cleared. */
export function resolveProviderSourceDatabaseHold(
  capability: ProviderSourceDatabaseHold,
  finalizeSource: () => void,
): boolean {
  const record = originalHold(capability),
    owned = record.binding
  if (
    !record.retired ||
    record.kind !== 'RECONCILE' ||
    !record.scope ||
    independentRetirement(owned) ||
    owned.lookup ||
    active !== owned ||
    retired !== owned
  )
    return false
  finalizeHold(record, finalizeSource, true)
  return true
}
async function assertTransactionSettings(owned: Binding, tx: ProviderSourceTransaction): Promise<void> {
  const rows = await tx.$queryRawUnsafe<SettingsRow[]>(flagsSql)
  if (rows.length !== 1) fail('source_database_binding')
  assertFlags(owned, rows[0], false, true)
}
export async function assertProviderSourceTransactionSettingsForClient(
  client: PrismaClient,
  tx: ProviderSourceTransaction,
  capability: ProviderSourceDatabaseHold,
  phase: 'SEND_CANONICAL' | 'RECONCILE_CANONICAL',
): Promise<void> {
  const record = originalHold(capability)
  if (record.binding.client !== client || providerSourceDatabaseFor(client) !== record.token)
    fail('source_database_binding')
  enterPhase(capability, phase)
  await assertTransactionSettings(record.binding, tx)
  finishPhase(record, phase)
}
/** Existing original capability and bounded phase, never token/count as continuation authority. */
export async function providerSourceTransaction<T>(
  token: ProviderSourceDatabase,
  capability: ProviderSourceDatabaseHold,
  phase: ProviderSourcePhase,
  action: (tx: ProviderSourceTransaction) => Promise<T>,
): Promise<T> {
  const record = originalHold(capability)
  if (record.token !== token) fail('source_database_binding')
  enterPhase(capability, phase)
  const result = await record.binding.client.$transaction(async tx => {
    originalHold(capability)
    await assertTransactionSettings(record.binding, tx)
    return action(tx)
  })
  finishPhase(record, phase)
  return result
}
type ReplayColumn = Readonly<{
  expression: string
  key: string
  kind: 'text' | 'integer' | 'date'
  nullable?: boolean
  bytes?: number
}>
const replayColumns: readonly ReplayColumn[] = [
  { expression: 'o.id', key: 'observationId', kind: 'text' },
  { expression: 'o.intentId', key: 'intentId', kind: 'text' },
  { expression: 'o.observationKey', key: 'observationKey', kind: 'text' },
  { expression: 'o.kind', key: 'kind', kind: 'text' },
  { expression: 'o.requestHash', key: 'requestHash', kind: 'text' },
  { expression: 'o.sendBoundaryId', key: 'observationBoundary', kind: 'text' },
  { expression: 'o.providerNamespace', key: 'observationNamespace', kind: 'text' },
  { expression: 'o.threadId', key: 'observationThread', kind: 'text', nullable: true },
  { expression: 'o.turnId', key: 'observationTurn', kind: 'text', nullable: true },
  { expression: 'o.evidenceDigest', key: 'evidenceDigest', kind: 'text' },
  {
    expression: 'o.reconciliationJson',
    key: 'reconciliationJson',
    kind: 'text',
    nullable: true,
    bytes: outcomeSourceBounds.envelopeBytes,
  },
  { expression: 'o.createdAt', key: 'observationCreatedAt', kind: 'date' },
  { expression: 'i.providerRunId', key: 'providerRunId', kind: 'text' },
  { expression: 'i.sendBoundaryId', key: 'sendBoundaryId', kind: 'text' },
  { expression: 'i.claimEpoch', key: 'claimEpoch', kind: 'integer' },
  { expression: 'i.providerNamespace', key: 'providerNamespace', kind: 'text' },
  { expression: 'i.threadId', key: 'intentThreadId', kind: 'text', nullable: true },
  { expression: 'i.turnId', key: 'turnId', kind: 'text', nullable: true },
  { expression: 'i.reconciledAt', key: 'reconciledAt', kind: 'date', nullable: true },
  { expression: 'r.configurationDigest', key: 'configurationDigest', kind: 'text' },
  { expression: 'r.threadId', key: 'runThreadId', kind: 'text', nullable: true },
  { expression: 'r.status', key: 'runStatus', kind: 'text' },
  { expression: 'r.turnsReserved', key: 'turnsReserved', kind: 'integer' },
  ...[
    ['sourceId', 'sourceId'],
    ['sourceIncarnation', 'sourceIncarnation'],
    ['protocolDigest', 'protocolDigest'],
    ['qualificationDigest', 'qualificationDigest'],
    ['lifecycle', 'lifecycle'],
    ['providerRunId', 'sourceRunId'],
    ['intentId', 'sourceIntentId'],
    ['providerNamespace', 'sourceNamespace'],
    ['head', 'head'],
    ['sealedHead', 'sealedHead'],
    ['sealedEnvelopeDigest', 'sealedEnvelopeDigest'],
    ['committedObservationId', 'committedObservationId'],
    ['committedRequestHash', 'committedRequestHash'],
    ['pendingBatchId', 'pendingBatchId'],
    ['pendingBatchStartHead', 'pendingBatchStartHead'],
    ['pendingBatchRequestDigest', 'pendingBatchRequestDigest'],
  ].map(([column, key]): ReplayColumn => ({ expression: `s.${column}`, key, kind: 'text', nullable: true })),
  {
    expression: 's.identityJson',
    key: 'identityJson',
    kind: 'text',
    nullable: true,
    bytes: outcomeSourceBounds.envelopeBytes,
  },
  ...[
    'epoch',
    'sequence',
    'byteCount',
    'commitFenceVersion',
    'pendingBatchRecordAllowance',
    'pendingBatchByteAllowance',
  ].map((key): ReplayColumn => ({ expression: `s.${key}`, key, kind: 'integer', nullable: true })),
]
function replayColumnGuard(column: ReplayColumn): string {
  const expression = column.expression
  const text = `(typeof(${expression})='text' AND length(CAST(${expression} AS BLOB))<=${column.bytes ?? 200})`
  const integer = `(typeof(${expression})='integer' AND ${expression}>=0 AND ${expression}<=${Number.MAX_SAFE_INTEGER})`
  const scalar =
    column.kind === 'text'
      ? text
      : column.kind === 'integer'
        ? integer
        : `(${integer} OR (typeof(${expression})='text' AND length(CAST(${expression} AS BLOB))<=${outcomeSourceBounds.envelopeBytes}))`
  return column.nullable ? `(${expression} IS NULL OR ${scalar})` : scalar
}
const replaySql = `SELECT
 ${replayColumns.map(column => `CASE WHEN ${replayColumnGuard(column)} THEN ${column.expression} ELSE NULL END AS "${column.key}"`).join(',\n')},
 CASE WHEN ${replayColumns.map(replayColumnGuard).join(' AND ')} THEN 1 ELSE 0 END AS boundsValid,
 pq.query_only AS queryOnly,pu.read_uncommitted AS readUncommitted,pb.timeout AS busyTimeout,
 CASE WHEN length(CAST(pd.file AS BLOB))<=${outcomeSourceBounds.journalBytes} THEN pd.file ELSE NULL END AS databaseFile
 FROM QualityJourneyProviderDispatchIntent i JOIN QualityJourneyProviderRun r ON r.id=i.providerRunId
 JOIN QualityJourneyProviderObservation o ON o.intentId=i.id AND o.observationKey=?
 LEFT JOIN QualityJourneyProviderSourceState s ON s.intentId=i.id
 CROSS JOIN pragma_query_only pq CROSS JOIN pragma_read_uncommitted pu
 CROSS JOIN pragma_busy_timeout pb CROSS JOIN pragma_database_list pd
 WHERE i.id=? AND pd.name='main' LIMIT 2`
/** Actual bounded SELECT fields only; numeric SQLite scalars are normalized without text coercion. */
export type ProviderSourceCommittedSnapshot = Readonly<Record<string, string | number | null>>
function normalizeReplayScalar(column: ReplayColumn, value: unknown): string | number | null {
  if (value === null && column.nullable) return null
  if (column.kind === 'integer') return outcomeSafeInteger(value, Number.MAX_SAFE_INTEGER)
  if (column.kind === 'date' && typeof value !== 'string') return outcomeSafeInteger(value, Number.MAX_SAFE_INTEGER)
  if (typeof value !== 'string') fail('source_replay_scalar')
  return value
}
function normalizeReplaySnapshot(row: SettingsRow): ProviderSourceCommittedSnapshot {
  if (outcomeSafeInteger(row.boundsValid, 1) !== 1) fail('source_replay_bounds')
  const result: Record<string, string | number | null> = {}
  for (const column of replayColumns) result[column.key] = normalizeReplayScalar(column, row[column.key])
  return Object.freeze(result)
}
function assertLookupReaderAvailable(owned: Binding): void {
  if (active && active !== owned) fail('source_custody_slot_unavailable')
  if (owned.lookup) fail('source_replay_lookup_pending')
  if (!owned.library || independentRetirement(owned) || owned.reader.cleanupAdmitted)
    fail('source_replay_resolver_unavailable')
}
function assertResolutionLookupHold(
  owned: Binding,
  hold: HoldRecord,
  intentId: string,
  observationKey: string,
  requestHash: string | undefined,
): void {
  if (
    hold.binding !== owned ||
    !hold.retired ||
    hold.kind !== 'RECONCILE' ||
    hold.scope?.intentId !== intentId ||
    hold.scope.observationKey !== observationKey ||
    hold.scope.requestHash !== requestHash ||
    ++hold.resolutionLookups > outcomeSourceBounds.queries
  )
    fail('source_replay_resolution_binding')
}
function admitLookup(
  owned: Binding,
  intentId: string,
  observationKey: string,
  capability?: ProviderSourceDatabaseHold,
  requestHash?: string,
): LookupRecord {
  assertLookupReaderAvailable(owned)
  let hold: HoldRecord | undefined
  if (capability) {
    hold = originalHold(capability)
    assertResolutionLookupHold(owned, hold, intentId, observationKey, requestHash)
  } else if (owned.finalCloseRequested || owned.reader.closeRequested) fail('source_replay_admission_closed')
  provenance(owned)
  const lookup: LookupRecord = { binding: owned, hold, retired: false }
  owned.lookup = lookup // Exact private read ticket exists before any engine invocation.
  owned.reader.holds++
  reserveLane(owned)
  return lookup
}
/** One preowned reader SELECT. A held resolution uses only its exact original private request scope. */
export async function readProviderSourceCommittedSnapshot(
  token: ProviderSourceDatabase,
  intentId: string,
  observationKey: string,
  capability?: ProviderSourceDatabaseHold,
  requestHash?: string,
): Promise<ProviderSourceCommittedSnapshot | undefined> {
  const owned = actualBinding(token)
  const lookup = admitLookup(owned, intentId, observationKey, capability, requestHash)
  let fulfilled = false
  try {
    const query = owned.resolver.$queryRawUnsafe<SettingsRow[]>(replaySql, observationKey, intentId)
    lookup.operation = query
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new ProviderSourceDatabaseError('source_replay_deadline')), 1000)
      timer.unref()
    })
    let rows: SettingsRow[]
    try {
      rows = await Promise.race([query, deadline])
    } finally {
      if (timer) clearTimeout(timer)
    }
    if (rows.length > 1) fail('source_replay_ambiguous')
    if (!rows.length) {
      fulfilled = true
      return
    }
    assertFlags(owned, rows[0], true, false)
    const snapshot = normalizeReplaySnapshot(rows[0])
    fulfilled = true
    return snapshot
  } catch (error) {
    lookup.retired = true
    owned.lookupFailure = lookup
    updateLane(owned)
    pumpCleanup(owned)
    throw error
  } finally {
    // Actual rejected/pending read retains its original ticket, reader and Promise permanently.
    if (fulfilled) {
      if (owned.lookup !== lookup) fail('source_replay_lookup_binding')
      owned.lookup = undefined
      owned.reader.holds--
      pumpCleanup(owned)
      updateLane(owned) // A successful reader never drops an independent closing/retired fence.
    }
  }
}
function mintSnapshot(mint: Mint) {
  return Object.freeze({
    closed: mint.cells.CLIENT.state === 'FULFILLED',
    engineClosed: mint.cells.ENGINE.state === 'FULFILLED',
    nativeClosed: mint.cells.NATIVE.state === 'FULFILLED',
    closeRequested: mint.closeRequested,
    cleanupAdmitted: mint.cleanupAdmitted,
    layers: Object.freeze({
      client: mint.cells.CLIENT.state,
      engine: mint.cells.ENGINE.state,
      native: mint.cells.NATIVE.state,
    }),
    holds: mint.holds,
    stopCalls: mint.stopCalls,
    nativeCalls: mint.nativeCalls,
  })
}
export function providerSourceDatabaseSnapshot(token: ProviderSourceDatabase) {
  const owned = actualBinding(token)
  return Object.freeze({
    held: !!owned.hold,
    cleanupPending: closing(owned) && !fullyClosed(owned),
    retired: isRetired(owned),
    finalCloseRequested: owned.finalCloseRequested,
    lookupPending: !!owned.lookup,
    canonical: mintSnapshot(owned.canonical),
    resolver: mintSnapshot(owned.reader),
    library: owned.library ? Object.freeze({ path: owned.library.path, digest: owned.library.digest }) : undefined,
  })
}
/** Final close intent and cached completion precede both genuine client requests. */
export function disposeProviderSourceDatabase(token: ProviderSourceDatabase): Promise<void> {
  const owned = actualBinding(token)
  if (owned.cleanup) return owned.cleanup
  reserveLane(owned)
  owned.finalCloseRequested = true
  let resolve!: () => void, reject!: (error: unknown) => void
  owned.cleanup = new Promise<void>((done, failed) => {
    resolve = done
    reject = failed
  })
  void owned.cleanup.catch(() => {})
  const failed = (error: unknown) => {
    owned.cleanupFailure = { operation: owned.cleanupOperation, error }
    updateLane(owned)
    pumpCleanup(owned)
    reject(error)
  }
  try {
    const canonical = owned.canonical.disconnect(),
      reader = owned.reader.disconnect()
    owned.cleanupOperation = Promise.all([canonical, reader])
    const observation = owned.cleanupOperation.then(() => {
      if (!fullyClosed(owned)) {
        failed(new ProviderSourceDatabaseError('source_database_cleanup_incomplete'))
        return
      }
      updateLane(owned)
      resolve()
    }, failed)
    void observation.catch(failed)
  } catch (error) {
    failed(error)
  }
  return owned.cleanup
}
