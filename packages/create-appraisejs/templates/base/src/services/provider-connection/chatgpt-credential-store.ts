import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { ChatGptCredentials } from './chatgpt-identity'

const MAX_RECORD_BYTES = 64 * 1024
const PRIVATE_FILE_MODE = 0o600
const PRIVATE_DIRECTORY_MODE = 0o700
const MAX_REGISTRATIONS = 256

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

/** Caller chooses an application-owned directory outside the project and keeps records server-side. */
export function createChatGptCredentialStore(directory: string): {
  getOrCreateHostId(): Promise<string>
  listRegistrations(): Promise<ChatGptRegistration[]>
  readSelected(): Promise<ChatGptCredentials | undefined>
  read(clientId: string, subject: string): Promise<ChatGptCredentials | undefined>
  write(record: ChatGptCredentials): Promise<void>
  disconnect(clientId: string, subject: string): Promise<void>
} {
  const hostFile = path.join(directory, 'host-id')
  const selectedFile = path.join(directory, 'selected-account.json')
  return {
    async getOrCreateHostId() {
      await privateDirectory(directory, true)
      const existing = await readPrivateFile(hostFile, 2)
      if (existing !== undefined) {
        if (!/^urn:uuid:[0-9a-f-]{36}$/.test(existing)) throw unavailable()
        return existing
      }
      const hostId = `urn:uuid:${randomUUID()}`
      const temporary = path.join(directory, `.host-${randomUUID()}.tmp`)
      const handle = await open(
        temporary,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        PRIVATE_FILE_MODE,
      )
      let published = false
      try {
        try {
          await handle.writeFile(hostId)
          await handle.sync()
        } finally {
          await handle.close()
        }
        try {
          await link(temporary, hostFile)
          published = true
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        }
      } finally {
        await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error
        })
      }
      const settled = await readPrivateFile(hostFile, 2)
      if (!settled || !/^urn:uuid:[0-9a-f-]{36}$/.test(settled)) throw unavailable()
      if (published) {
        const directoryHandle = await open(directory, constants.O_RDONLY)
        try {
          await directoryHandle.sync()
        } finally {
          await directoryHandle.close()
        }
      }
      return settled
    },
    async listRegistrations() {
      if (!(await privateDirectory(directory, false))) return []
      const names = (await readdir(directory)).filter(name => /^registration-[a-f0-9]{64}\.json$/.test(name))
      if (names.length > MAX_REGISTRATIONS) throw unavailable()
      const entries = await Promise.all(names.map(name => readRegistration(path.join(directory, name))))
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
      const content = await readPrivateFile(path.join(directory, recordName(clientId, subject)))
      if (content === undefined) return undefined
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        throw unavailable()
      }
      if (!validRecord(parsed, clientId, subject)) throw unavailable()
      return parsed
    },
    async write(record) {
      await privateDirectory(directory, true)
      if (!validRecord(record, record.client_id, record.subject)) throw unavailable()
      const hostId = await this.getOrCreateHostId()
      if (record.ext_agent_host_id !== hostId) throw unavailable()
      await atomicPrivateWrite(
        path.join(directory, recordName(record.client_id, record.subject)),
        JSON.stringify(record),
      )
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
    },
    async disconnect(clientId, subject) {
      if (!(await privateDirectory(directory, false))) return
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
    },
  }
}
