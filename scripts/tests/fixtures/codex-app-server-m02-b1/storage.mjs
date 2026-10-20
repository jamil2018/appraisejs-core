/** B1 offline journal. It owns only a fresh OS temporary directory. No transport exists here. */
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const PREFIX = 'appraise-m02-b1-offline-'
const HARD_LIMITS = Object.freeze({ threadStarts: 15, turnStarts: 14, providerRequests: 55 })
const DEFAULT_LIMITS = Object.freeze({ threadStarts: 1, turnStarts: 1, providerRequests: 4 })
const DIRECTORY_FLAGS = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW
const MAX_JOURNAL_BYTES = 64 * 1024

export class StorageBlocked extends Error {
  constructor(message) {
    super(message)
    this.name = 'StorageBlocked'
  }
}

const identity = stat => `${stat.dev}:${stat.ino}`
const clone = value => structuredClone(value)

function checkedLimits(input) {
  const limits = input === undefined ? DEFAULT_LIMITS : input
  if (!limits || Object.keys(limits).sort().join(',') !== Object.keys(HARD_LIMITS).sort().join(',')) {
    throw new StorageBlocked('exact budget limits required')
  }
  for (const [kind, ceiling] of Object.entries(HARD_LIMITS)) {
    if (!Number.isSafeInteger(limits[kind]) || limits[kind] < 0 || limits[kind] > ceiling) {
      throw new StorageBlocked('budget exceeds reviewed policy')
    }
  }
  return clone(limits)
}

function checkedRoot(root) {
  if (
    typeof root !== 'string' ||
    dirname(resolve(root)) !== resolve(tmpdir()) ||
    !basename(root).startsWith(PREFIX) ||
    resolve(root) !== root
  ) {
    throw new StorageBlocked('only the B1 OS temporary root is permitted')
  }
}

async function checkedDirectory(root) {
  checkedRoot(root)
  const handle = await fs.open(root, DIRECTORY_FLAGS)
  try {
    const stat = await handle.stat()
    const pathStat = await fs.lstat(root)
    if (
      !stat.isDirectory() ||
      !pathStat.isDirectory() ||
      identity(stat) !== identity(pathStat) ||
      (stat.mode & 0o777) !== 0o700
    ) {
      throw new StorageBlocked('temporary directory identity or mode changed')
    }
    return { handle, id: identity(stat) }
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function checkedFile(path, expected) {
  const handle = await fs.open(path, FILE_FLAGS)
  try {
    const stat = await handle.stat()
    const pathStat = await fs.lstat(path)
    if (
      !stat.isFile() ||
      !pathStat.isFile() ||
      identity(stat) !== identity(pathStat) ||
      (expected && identity(stat) !== expected) ||
      (stat.mode & 0o777) !== 0o600
    ) {
      throw new StorageBlocked('journal file identity or mode changed')
    }
    return { handle, id: identity(stat) }
  } catch (error) {
    await handle.close()
    throw error
  }
}

function validateRestoredState(state) {
  if (
    !state ||
    Object.keys(state).sort().join(',') !== 'counts,entries,limits,schema,status' ||
    state.schema !== 'appraise.m02-b1-journal/v1' ||
    !['OPEN', 'UNKNOWN'].includes(state.status) ||
    !Array.isArray(state.entries)
  ) {
    throw new StorageBlocked('unrecognized journal state')
  }
  const limits = checkedLimits(state.limits)
  if (
    !state.counts ||
    Object.keys(state.counts).sort().join(',') !== Object.keys(HARD_LIMITS).sort().join(',') ||
    state.entries.length > Object.values(limits).reduce((sum, value) => sum + value, 0)
  ) {
    throw new StorageBlocked('invalid journal counts')
  }
  const counted = { threadStarts: 0, turnStarts: 0, providerRequests: 0 }
  const ids = new Set()
  for (const entry of state.entries) {
    if (
      !entry ||
      Object.keys(entry).sort().join(',') !== 'id,kind,status' ||
      !Object.hasOwn(counted, entry.kind) ||
      typeof entry.id !== 'string' ||
      !/^[A-Za-z0-9._:-]{1,128}$/.test(entry.id) ||
      !['reserved', 'acknowledged'].includes(entry.status) ||
      ids.has(entry.id)
    ) {
      throw new StorageBlocked('invalid journal entry')
    }
    ids.add(entry.id)
    counted[entry.kind] += 1
  }
  for (const kind of Object.keys(counted)) {
    if (state.counts[kind] !== counted[kind] || counted[kind] > limits[kind]) {
      throw new StorageBlocked('journal counters disagree with retained intents')
    }
  }
  return state
}

export class StorageJournal {
  #persist
  #state
  #recovered
  #fenced
  #busy = false

  constructor(persist, state, { recovered = false } = {}) {
    this.#persist = persist
    this.#state = state
    this.#recovered = recovered
    this.#fenced = recovered || state.status === 'UNKNOWN'
  }

  static async restore(root) {
    const directory = await checkedDirectory(root)
    try {
      const file = await checkedFile(join(root, 'journal.json'))
      try {
        if ((await file.handle.stat()).size > MAX_JOURNAL_BYTES) {
          throw new StorageBlocked('journal exceeds offline bound')
        }
        const buffer = Buffer.alloc(MAX_JOURNAL_BYTES + 1)
        let used = 0
        while (used < buffer.length) {
          const { bytesRead } = await file.handle.read(buffer, used, buffer.length - used, used)
          if (bytesRead === 0) break
          used += bytesRead
        }
        if (used > MAX_JOURNAL_BYTES) throw new StorageBlocked('journal exceeds offline bound')
        const state = validateRestoredState(JSON.parse(buffer.subarray(0, used).toString('utf8')))
        // A recovered process has no proof whether an earlier send occurred.
        return new StorageJournal(null, state, { recovered: true })
      } finally {
        await file.handle.close()
      }
    } finally {
      await directory.handle.close()
    }
  }

  snapshot() {
    return {
      ...clone(this.#state),
      pending: this.#state.entries.filter(entry => entry.status === 'reserved').map(entry => entry.id),
      fenced: this.#fenced,
      recovered: this.#recovered,
    }
  }

  #ensureOpen() {
    if (this.#busy) {
      this.#fenced = true
      this.#state.status = 'UNKNOWN'
      throw new StorageBlocked('overlapping journal operation; run fenced')
    }
    if (this.#fenced || !this.#persist || this.#state.status !== 'OPEN') {
      throw new StorageBlocked('journal fenced; no replay or budget reset')
    }
  }

  async #mutate(change) {
    this.#ensureOpen()
    this.#busy = true
    change()
    try {
      await this.#persist(this.#state)
      if (this.#fenced) throw new StorageBlocked('overlapping operation; run fenced')
    } catch {
      this.#fenced = true
      this.#state.status = 'UNKNOWN'
      throw new StorageBlocked('durability uncertain; consumed intent retained and run fenced')
    } finally {
      this.#busy = false
    }
  }

  async reserve(kind, id) {
    this.#ensureOpen()
    if (!Object.hasOwn(HARD_LIMITS, kind) || typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(id)) {
      throw new StorageBlocked('invalid reservation')
    }
    if (this.#state.entries.some(entry => entry.id === id)) {
      this.#fenced = true
      this.#state.status = 'UNKNOWN'
      throw new StorageBlocked('duplicate reservation; run fenced')
    }
    if (this.#state.counts[kind] >= this.#state.limits[kind]) {
      this.#fenced = true
      this.#state.status = 'UNKNOWN'
      throw new StorageBlocked('budget exhausted; run fenced')
    }
    await this.#mutate(() => {
      this.#state.counts[kind] += 1
      this.#state.entries.push({ kind, id, status: 'reserved' })
    })
    return this.snapshot() // Returned only after file and directory sync succeeded.
  }

  async acknowledge(id) {
    this.#ensureOpen()
    const entry = this.#state.entries.find(item => item.id === id)
    if (!entry || entry.status !== 'reserved') {
      this.#fenced = true
      this.#state.status = 'UNKNOWN'
      throw new StorageBlocked('missing or duplicate acknowledgement; run fenced')
    }
    await this.#mutate(() => {
      entry.status = 'acknowledged'
    })
    return this.snapshot()
  }

  async markUnknown() {
    this.#ensureOpen()
    this.#busy = true
    this.#state.status = 'UNKNOWN'
    this.#fenced = true
    try {
      await this.#persist(this.#state)
    } catch {
      throw new StorageBlocked('UNKNOWN record durability uncertain; run fenced')
    } finally {
      this.#busy = false
    }
    return this.snapshot()
  }
}

export class DisposableStore {
  #root
  #directory
  #fault
  #files = new Map()
  #journal

  constructor(root, directory, { fault, limits }) {
    this.#root = root
    this.#directory = directory
    this.#fault = fault
    this.#journal = new StorageJournal(state => this.#persist(state), {
      schema: 'appraise.m02-b1-journal/v1',
      status: 'OPEN',
      limits,
      counts: { threadStarts: 0, turnStarts: 0, providerRequests: 0 },
      entries: [],
    })
  }

  get root() {
    return this.#root
  }
  get journal() {
    return this.#journal
  }

  static async create({ fault, limits } = {}) {
    const approvedLimits = checkedLimits(limits)
    if (fault !== undefined && typeof fault !== 'function') throw new StorageBlocked('invalid fault hook')
    const root = await fs.mkdtemp(join(tmpdir(), PREFIX))
    let directory
    let store
    try {
      directory = await checkedDirectory(root)
      store = new DisposableStore(root, directory, { fault, limits: approvedLimits })
      const initialState = store.journal.snapshot()
      for (const key of ['pending', 'fenced', 'recovered']) delete initialState[key]
      await store.#persist(initialState, { initializing: true })
      return store
    } catch (error) {
      if (store) {
        // Cleanup remains identity-bound even for a failed initial write.
        try {
          await store.cleanup()
        } catch {
          /* retain ambiguous fixture */
        }
      } else if (directory) {
        await directory.handle.close()
      }
      throw error
    }
  }

  async #checkRoot() {
    const pathStat = await fs.lstat(this.#root)
    const handleStat = await this.#directory.handle.stat()
    if (
      !pathStat.isDirectory() ||
      identity(pathStat) !== this.#directory.id ||
      identity(handleStat) !== this.#directory.id ||
      (pathStat.mode & 0o777) !== 0o700
    ) {
      throw new StorageBlocked('owned root identity changed')
    }
  }

  async #persist(state, { initializing = false } = {}) {
    await this.#checkRoot()
    const target = join(this.#root, 'journal.json')
    if (!initializing) {
      const current = await checkedFile(target, this.#files.get(target))
      await current.handle.close()
    }
    const temporary = join(this.#root, `journal.${randomUUID()}.tmp`)
    const handle = await fs.open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    )
    this.#files.set(temporary, identity(await handle.stat()))
    try {
      if (!initializing) this.#fault?.('write')
      await handle.writeFile(JSON.stringify(state) + '\n')
      if (!initializing) this.#fault?.('file-sync')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await this.#checkRoot()
    if (!initializing) this.#fault?.('rename')
    const temporaryId = this.#files.get(temporary)
    await fs.rename(temporary, target)
    this.#files.delete(temporary)
    const renamed = await checkedFile(target, temporaryId)
    await renamed.handle.close()
    this.#files.set(target, renamed.id)
    if (!initializing) this.#fault?.('directory-sync')
    await this.#directory.handle.sync()
  }

  async cleanup() {
    await this.#checkRoot()
    const names = await fs.readdir(this.#root)
    if (names.length !== this.#files.size || names.some(name => !this.#files.has(join(this.#root, name)))) {
      throw new StorageBlocked('unexpected owned-root contents; cleanup refused')
    }
    for (const [path, expected] of this.#files) {
      const stat = await fs.lstat(path)
      if (!stat.isFile() || identity(stat) !== expected) throw new StorageBlocked('owned file identity changed')
    }
    for (const path of this.#files.keys()) await fs.unlink(path)
    this.#files.clear()
    await this.#directory.handle.close()
    await fs.rmdir(this.#root)
  }
}
