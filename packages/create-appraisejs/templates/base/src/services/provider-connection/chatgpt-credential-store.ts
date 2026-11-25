import { spawn } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'

import type { ChatGptCredentials } from './chatgpt-identity'
import { providerSecretVault, type ProviderSecretVault } from './provider-secret-vault'

// Base64 ciphertext expands a valid legacy record by roughly one third.
const MAX_RECORD_BYTES = 128 * 1024
const PRIVATE_FILE_MODE = 0o600
const PRIVATE_DIRECTORY_MODE = 0o700
const MAX_REGISTRATIONS = 256
const KEY_ID_FILE = 'vault-key-id'
const LOCK_DATABASE = 'credential-write-lock.sqlite'
const CIPHER_VERSION = 1
const CIPHER_PURPOSE = 'appraisejs.chatgpt.credentials.v1'
const CIPHER_NONCE_BYTES = 12
const CIPHER_TAG_BYTES = 16
const KEY_BYTES = 32
const KEY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type ChatGptRegistration = { clientId: string; subject: string; email?: string }

function unavailable(): Error {
  return new Error('ChatGPT credential storage is unavailable on this host')
}

function requireUnix(): number {
  if (process.platform === 'win32' || typeof process.getuid !== 'function') throw unavailable()
  return process.getuid()
}

function validIdentity(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim()
}

function recordName(clientId: string, subject: string): string {
  if (!validIdentity(clientId) || !validIdentity(subject) || clientId === 'dynamic_agent_client') {
    throw new Error('Invalid ChatGPT credential identity')
  }
  return `account-${createHash('sha256')
    .update(JSON.stringify([clientId, subject]))
    .digest('hex')}.json`
}

function registrationName(clientId: string, subject: string): string {
  return recordName(clientId, subject).replace('account-', 'registration-')
}

async function privateDirectory(directory: string, create: boolean): Promise<boolean> {
  const uid = requireUnix()
  if (!path.isAbsolute(directory)) throw unavailable()
  // Check every existing component. A symlinked ancestor could otherwise redirect custody.
  const resolved = path.resolve(directory)
  const components = resolved.split(path.sep).filter(Boolean)
  let current = path.parse(resolved).root
  for (const component of components) {
    current = path.join(current, component)
    try {
      const stat = await lstat(current)
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw unavailable()
      if (current === resolved && (stat.uid !== uid || (stat.mode & 0o077) !== 0)) {
        throw unavailable()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      if (!create) return false
      await mkdir(current, { mode: current === resolved ? PRIVATE_DIRECTORY_MODE : 0o700 }).catch(
        (mkdirError: NodeJS.ErrnoException) => {
          if (mkdirError.code !== 'EEXIST') throw mkdirError
        },
      )
    }
  }
  const stat = await lstat(resolved)
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== uid || (stat.mode & 0o077) !== 0) {
    throw unavailable()
  }
  if ((await realpath(resolved)) !== resolved) throw unavailable()
  return true
}

async function inspectPrivateFile(filename: string, maxLinks = 1): Promise<boolean> {
  const uid = requireUnix()
  let stat
  try {
    stat = await lstat(filename)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.uid !== uid ||
    (stat.mode & 0o077) !== 0 ||
    stat.nlink < 1 ||
    stat.nlink > maxLinks ||
    stat.size > MAX_RECORD_BYTES
  ) {
    throw unavailable()
  }
  return true
}

async function readPrivateFile(filename: string, maxLinks = 1): Promise<string | undefined> {
  if (!(await inspectPrivateFile(filename, maxLinks))) return undefined
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      stat.uid !== requireUnix() ||
      (stat.mode & 0o077) !== 0 ||
      stat.nlink < 1 ||
      stat.nlink > maxLinks ||
      stat.size > MAX_RECORD_BYTES
    )
      throw unavailable()
    return await handle.readFile({ encoding: 'utf8' })
  } finally {
    await handle.close()
  }
}

async function atomicPrivateWrite(filename: string, content: string): Promise<void> {
  if (Buffer.byteLength(content) > MAX_RECORD_BYTES) throw unavailable()
  await inspectPrivateFile(filename)
  const temporary = path.join(path.dirname(filename), `.chatgpt-${randomUUID()}.tmp`)
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  )
  try {
    try {
      await handle.writeFile(content, { encoding: 'utf8' })
      await handle.sync()
    } finally {
      await handle.close()
    }
    await inspectPrivateFile(filename)
    await rename(temporary, filename)
    const directoryHandle = await open(path.dirname(filename), constants.O_RDONLY)
    try {
      await directoryHandle.sync()
    } finally {
      await directoryHandle.close()
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

async function syncDirectory(directory: string) {
  const handle = await open(directory, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function publishPrivateFile(
  filename: string,
  content: string,
  prefix: string,
  onPublished?: () => void,
): Promise<boolean> {
  const temporary = path.join(path.dirname(filename), `.${prefix}-${randomUUID()}.tmp`)
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    PRIVATE_FILE_MODE,
  )
  try {
    try {
      await handle.writeFile(content)
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      await link(temporary, filename)
      onPublished?.()
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      return false
    }
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

type SqliteLock = { exec(statement: string): void; close(): void }
type SqliteConstructor = new (filename: string, options?: { timeout: number }) => SqliteLock

function nativeSqlite(): SqliteConstructor | undefined {
  try {
    const sqliteRuntime = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: SqliteConstructor }
    return sqliteRuntime.DatabaseSync
  } catch {
    return undefined
  }
}

async function privateLockDatabase(directory: string) {
  const filename = path.join(directory, LOCK_DATABASE)
  try {
    const handle = await open(
      filename,
      constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      PRIVATE_FILE_MODE,
    )
    await handle.close()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw unavailable()
  }
  if (!(await inspectPrivateFile(filename))) throw unavailable()
  return filename
}

async function acquireNativeLock(DatabaseSync: SqliteConstructor, filename: string): Promise<SqliteLock> {
  for (let attempt = 0; attempt <= 100; attempt += 1) {
    let database: SqliteLock | undefined
    try {
      database = new DatabaseSync(filename, { timeout: 0 })
      database.exec('BEGIN IMMEDIATE')
    } catch (error) {
      try {
        database?.close()
      } catch {
        throw unavailable()
      }
      if ((error as { errcode?: number }).errcode !== 5 || attempt === 100) throw unavailable()
      await new Promise(resolve => setTimeout(resolve, 50))
      continue
    }
    if (!database) throw unavailable()
    return database
  }
  throw unavailable()
}

async function withNativeLock<T>(database: SqliteLock, operation: () => Promise<T>): Promise<T> {
  try {
    const result = await operation()
    database.exec('COMMIT')
    return result
  } catch {
    try {
      database.exec('ROLLBACK')
    } catch {
      // The credential operation already failed.
    }
    throw unavailable()
  } finally {
    database.close()
  }
}

async function withCredentialWriteLock<T>(directory: string, operation: () => Promise<T>): Promise<T> {
  const filename = await privateLockDatabase(directory)
  const DatabaseSync = nativeSqlite()
  if (!DatabaseSync) return withExternalSqliteLock(directory, filename, operation)
  return withNativeLock(await acquireNativeLock(DatabaseSync, filename), operation)
}

async function withExternalSqliteLock<T>(directory: string, filename: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= 100; attempt += 1) {
    const child = spawn('/usr/bin/sqlite3', [filename], {
      cwd: directory,
      env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stderr.resume()
    const finished = new Promise<number>(resolve => child.once('close', code => resolve(code ?? 1)))
    const lines = createInterface({ input: child.stdout })
    let spawnFailed = false
    let readyTimeout: NodeJS.Timeout
    const ready = new Promise<boolean>(resolve => {
      lines.once('line', line => resolve(line === 'APPRAISE_LOCK_READY'))
      child.once('close', () => resolve(false))
      child.once('error', () => {
        spawnFailed = true
        resolve(false)
      })
      readyTimeout = setTimeout(() => {
        child.kill('SIGKILL')
        resolve(false)
      }, 2_000).unref()
    })
    child.stdin.on('error', () => undefined)
    child.stdin.write(".bail on\n.timeout 0\nBEGIN IMMEDIATE;\nSELECT 'APPRAISE_LOCK_READY';\n")
    const locked = await ready
    clearTimeout(readyTimeout!)
    if (!locked) {
      child.stdin.end()
      await finished
      lines.close()
      if (spawnFailed || attempt === 100) throw unavailable()
      await new Promise(resolve => setTimeout(resolve, 50))
      continue
    }
    try {
      const result = await operation()
      child.stdin.end('COMMIT;\n')
      if ((await finished) !== 0) throw unavailable()
      return result
    } catch {
      if (!child.stdin.writableEnded) child.stdin.end('ROLLBACK;\n')
      await finished
      throw unavailable()
    } finally {
      lines.close()
    }
  }
  throw unavailable()
}

function associatedData(filename: string): Buffer {
  return Buffer.from(JSON.stringify([CIPHER_PURPOSE, path.basename(filename)]))
}

const encryptedRecordSchema = z
  .object({
    kind: z.literal(CIPHER_PURPOSE),
    version: z.literal(CIPHER_VERSION),
    keyId: z.string().regex(KEY_ID_PATTERN),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    ciphertext: z.string().regex(/^[A-Za-z0-9_-]+$/),
    tag: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  })
  .strict()

type EncryptedRecord = z.infer<typeof encryptedRecordSchema>

function encryptedRecord(value: unknown): value is EncryptedRecord {
  return encryptedRecordSchema.safeParse(value).success
}

function encryptRecord(filename: string, record: ChatGptCredentials, keyId: string, key: Buffer): string {
  const nonce = randomBytes(CIPHER_NONCE_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(associatedData(filename))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(record), 'utf8'), cipher.final()])
  return JSON.stringify({
    kind: CIPHER_PURPOSE,
    version: CIPHER_VERSION,
    keyId,
    nonce: nonce.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
  } satisfies EncryptedRecord)
}

function decryptRecord(filename: string, record: EncryptedRecord, key: Buffer): unknown {
  const nonce = Buffer.from(record.nonce, 'base64url')
  const tag = Buffer.from(record.tag, 'base64url')
  if (nonce.length !== CIPHER_NONCE_BYTES || tag.length !== CIPHER_TAG_BYTES) throw unavailable()
  const decipher = createDecipheriv('aes-256-gcm', key, nonce)
  decipher.setAAD(associatedData(filename))
  decipher.setAuthTag(tag)
  const plaintext = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64url')), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as unknown
}

function validRecord(value: unknown, clientId: string, subject: string): value is ChatGptCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<ChatGptCredentials>
  return (
    record.issuer === 'https://auth.openai.com' &&
    record.client_id === clientId &&
    record.subject === subject &&
    validIdentity(record.ext_agent_host_id ?? '') &&
    typeof record.id_token === 'string' &&
    record.id_token.length <= 16_384 &&
    typeof record.access_token === 'string' &&
    record.access_token.length <= 16_384 &&
    typeof record.refresh_token === 'string' &&
    record.refresh_token.length <= 16_384 &&
    record.token_type === 'Bearer' &&
    Number.isSafeInteger(record.expires_in) &&
    (record.expires_in ?? 0) > 0 &&
    (record.expires_in ?? 0) <= 86_400 &&
    Array.isArray(record.scopes) &&
    record.scopes.length <= 64 &&
    record.scopes.every(scope => typeof scope === 'string' && scope.length <= 128) &&
    typeof record.saved_at === 'string' &&
    Number.isFinite(Date.parse(record.saved_at)) &&
    (record.email === undefined || (typeof record.email === 'string' && record.email.length <= 320))
  )
}

function validRegistration(value: unknown): value is ChatGptRegistration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Partial<ChatGptRegistration>
  return (
    Object.keys(entry).every(key => ['clientId', 'subject', 'email'].includes(key)) &&
    validIdentity(entry.clientId ?? '') &&
    entry.clientId !== 'dynamic_agent_client' &&
    validIdentity(entry.subject ?? '') &&
    (entry.email === undefined ||
      (typeof entry.email === 'string' && entry.email.length <= 320 && entry.email === entry.email.trim()))
  )
}

async function readRegistration(filename: string): Promise<ChatGptRegistration> {
  const content = await readPrivateFile(filename)
  if (content === undefined) throw unavailable()
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw unavailable()
  }
  if (!validRegistration(parsed) || path.basename(filename) !== registrationName(parsed.clientId, parsed.subject)) {
    throw unavailable()
  }
  return parsed
}

async function assertNoOrphanEncryptedAccounts(directory: string) {
  const accounts = (await readdir(directory)).filter(name => /^account-[a-f0-9]{64}\.json$/.test(name))
  for (const account of accounts) {
    const content = await readPrivateFile(path.join(directory, account))
    if (content === undefined) throw unavailable()
    let value: unknown
    try {
      value = JSON.parse(content)
    } catch {
      throw unavailable()
    }
    if (value && typeof value === 'object' && 'kind' in value) throw unavailable()
  }
}

async function createKeyId(directory: string, keyFile: string, vault: ProviderSecretVault) {
  await assertNoOrphanEncryptedAccounts(directory)
  const newId = randomUUID()
  const secret = randomBytes(KEY_BYTES)
  try {
    await vault.create(newId, secret)
  } catch {
    throw unavailable()
  } finally {
    secret.fill(0)
  }
  let published = false
  try {
    published = await publishPrivateFile(keyFile, newId, 'key', () => {
      published = true
    })
    if (published) await syncDirectory(directory)
  } finally {
    if (!published) await vault.remove(newId).catch(() => undefined)
  }
  return published ? newId : await readPrivateFile(keyFile)
}

function parsePrivateJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    throw unavailable()
  }
}

function legacyAccountIdentity(parsed: unknown, name: string) {
  const candidate = parsed as Partial<ChatGptCredentials> | undefined
  if (!candidate || !validRecord(parsed, candidate.client_id ?? '', candidate.subject ?? '')) throw unavailable()
  if (recordName(candidate.client_id!, candidate.subject!) !== name) throw unavailable()
  return { clientId: candidate.client_id!, subject: candidate.subject! }
}

async function validateLegacyAccount(
  directory: string,
  name: string,
  read: (clientId: string, subject: string) => Promise<ChatGptCredentials | undefined>,
) {
  const content = await readPrivateFile(path.join(directory, name))
  if (content === undefined) throw unavailable()
  const parsed = parsePrivateJson(content)
  if (parsed && typeof parsed === 'object' && 'kind' in parsed) {
    if (!encryptedRecord(parsed)) throw unavailable()
    return
  }
  const { clientId, subject } = legacyAccountIdentity(parsed, name)
  await read(clientId, subject)
}

/** Caller chooses an application-owned directory outside the project and keeps records server-side. */
export function createChatGptCredentialStore(
  directory: string,
  vault: ProviderSecretVault = providerSecretVault,
): {
  getOrCreateHostId(): Promise<string>
  listRegistrations(): Promise<ChatGptRegistration[]>
  readSelected(): Promise<ChatGptCredentials | undefined>
  read(clientId: string, subject: string): Promise<ChatGptCredentials | undefined>
  write(record: ChatGptCredentials): Promise<void>
  disconnect(clientId: string, subject: string): Promise<void>
} {
  const hostFile = path.join(directory, 'host-id')
  const selectedFile = path.join(directory, 'selected-account.json')
  const keyFile = path.join(directory, KEY_ID_FILE)

  async function storedHostId() {
    const hostId = await readPrivateFile(hostFile, 2)
    if (!hostId || !/^urn:uuid:[0-9a-f-]{36}$/.test(hostId)) throw unavailable()
    return hostId
  }

  async function key(create: boolean): Promise<{ id: string; secret: Buffer } | undefined> {
    let id = await readPrivateFile(keyFile)
    if (id === undefined && !create) return undefined
    if (id === undefined) {
      // An encrypted record without its key pointer must stay inaccessible.
      id = await createKeyId(directory, keyFile, vault)
    }
    if (!id || !KEY_ID_PATTERN.test(id)) throw unavailable()
    let secret: Buffer | undefined
    try {
      secret = await vault.read(id)
    } catch {
      throw unavailable()
    }
    if (!secret || secret.length !== KEY_BYTES) {
      secret?.fill(0)
      throw unavailable()
    }
    return { id, secret }
  }

  async function decodeAccount(filename: string, content: string) {
    const parsed = parsePrivateJson(content)
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return { record: parsed, legacy: true }
    if (!encryptedRecord(parsed)) throw unavailable()
    const storedKey = await key(false)
    if (!storedKey || parsed.keyId !== storedKey.id) throw unavailable()
    try {
      return { record: decryptRecord(filename, parsed, storedKey.secret), legacy: false }
    } finally {
      storedKey.secret.fill(0)
    }
  }

  async function loadAccount(filename: string, clientId: string, subject: string) {
    const content = await readPrivateFile(filename)
    if (content === undefined) return undefined
    let decoded: Awaited<ReturnType<typeof decodeAccount>>
    try {
      decoded = await decodeAccount(filename, content)
    } catch {
      throw unavailable()
    }
    if (
      !validRecord(decoded.record, clientId, subject) ||
      decoded.record.ext_agent_host_id !== (await storedHostId())
    ) {
      throw unavailable()
    }
    return { record: decoded.record, legacy: decoded.legacy }
  }

  return {
    async getOrCreateHostId() {
      await privateDirectory(directory, true)
      const existing = await readPrivateFile(hostFile, 2)
      if (existing !== undefined) {
        if (!/^urn:uuid:[0-9a-f-]{36}$/.test(existing)) throw unavailable()
        return existing
      }
      const hostId = `urn:uuid:${randomUUID()}`
      const published = await publishPrivateFile(hostFile, hostId, 'host')
      const settled = await readPrivateFile(hostFile, 2)
      if (!settled || !/^urn:uuid:[0-9a-f-]{36}$/.test(settled)) throw unavailable()
      if (published) await syncDirectory(directory)
      return settled
    },
    async listRegistrations() {
      if (!(await privateDirectory(directory, false))) return []
      const files = await readdir(directory)
      const accounts = files.filter(name => /^account-[a-f0-9]{64}\.json$/.test(name))
      const names = files.filter(name => /^registration-[a-f0-9]{64}\.json$/.test(name))
      if (names.length > MAX_REGISTRATIONS || accounts.length > MAX_REGISTRATIONS) throw unavailable()
      for (const name of accounts) await validateLegacyAccount(directory, name, this.read)
      const entries = await Promise.all(names.map(name => readRegistration(path.join(directory, name))))
      for (const entry of entries) await this.read(entry.clientId, entry.subject)
      return entries.sort((left, right) =>
        `${left.clientId}\0${left.subject}`.localeCompare(`${right.clientId}\0${right.subject}`),
      )
    },
    async readSelected() {
      if (!(await privateDirectory(directory, false))) return undefined
      const content = await readPrivateFile(selectedFile)
      if (content === undefined) return undefined
      let selected: unknown
      try {
        selected = JSON.parse(content)
      } catch {
        throw unavailable()
      }
      if (!selected || typeof selected !== 'object' || Array.isArray(selected)) throw unavailable()
      const { clientId, subject } = selected as { clientId?: string; subject?: string }
      if (!validIdentity(clientId ?? '') || !validIdentity(subject ?? '')) throw unavailable()
      const record = await this.read(clientId!, subject!)
      if (!record) throw unavailable()
      return record
    },
    async read(clientId, subject) {
      if (!(await privateDirectory(directory, false))) return undefined
      const filename = path.join(directory, recordName(clientId, subject))
      const loaded = await loadAccount(filename, clientId, subject)
      if (!loaded?.legacy) return loaded?.record
      return withCredentialWriteLock(directory, async () => {
        const latest = await loadAccount(filename, clientId, subject)
        if (!latest) return undefined
        if (latest.legacy) {
          const storedKey = await key(true)
          if (!storedKey) throw unavailable()
          let encrypted: string
          try {
            encrypted = encryptRecord(filename, latest.record, storedKey.id, storedKey.secret)
          } finally {
            storedKey.secret.fill(0)
          }
          await atomicPrivateWrite(filename, encrypted)
        }
        return latest.record
      })
    },
    async write(record) {
      await privateDirectory(directory, true)
      if (!validRecord(record, record.client_id, record.subject)) throw unavailable()
      const hostId = await this.getOrCreateHostId()
      if (record.ext_agent_host_id !== hostId) throw unavailable()
      await withCredentialWriteLock(directory, async () => {
        const filename = path.join(directory, recordName(record.client_id, record.subject))
        const previous = await loadAccount(filename, record.client_id, record.subject)
        if (previous && Date.parse(record.saved_at) < Date.parse(previous.record.saved_at)) throw unavailable()
        const storedKey = await key(true)
        if (!storedKey) throw unavailable()
        let encrypted: string
        try {
          encrypted = encryptRecord(filename, record, storedKey.id, storedKey.secret)
        } finally {
          storedKey.secret.fill(0)
        }
        await atomicPrivateWrite(filename, encrypted)
        const registration: ChatGptRegistration = {
          clientId: record.client_id,
          subject: record.subject,
          ...(record.email ? { email: record.email } : {}),
        }
        await atomicPrivateWrite(
          path.join(directory, registrationName(record.client_id, record.subject)),
          JSON.stringify(registration),
        )
        await atomicPrivateWrite(selectedFile, JSON.stringify({ clientId: record.client_id, subject: record.subject }))
      })
    },
    async disconnect(clientId, subject) {
      if (!(await privateDirectory(directory, false))) return
      await withCredentialWriteLock(directory, async () => {
        const filename = path.join(directory, recordName(clientId, subject))
        const selected = await readPrivateFile(selectedFile)
        if (selected !== undefined) {
          let current: unknown
          try {
            current = JSON.parse(selected)
          } catch {
            throw unavailable()
          }
          if (
            current &&
            typeof current === 'object' &&
            !Array.isArray(current) &&
            (current as { clientId?: string }).clientId === clientId &&
            (current as { subject?: string }).subject === subject
          ) {
            await unlink(selectedFile)
          }
        }
        if (!(await inspectPrivateFile(filename))) return
        await unlink(filename)
      })
    },
  }
}
