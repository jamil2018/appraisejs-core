import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { chmod, lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createChatGptCredentialStore } from './chatgpt-credential-store'
import type { ProviderSecretVault } from './provider-secret-vault'
import type { ChatGptCredentials } from './chatgpt-identity'

const secrets = new Map<string, Buffer>()
const hasNativeSqlite = (() => {
  try {
    createRequire(import.meta.url)('node:sqlite')
    return true
  } catch {
    return false
  }
})()
const fixtureVault: ProviderSecretVault = {
  async read(id) {
    const secret = secrets.get(id)
    return secret && Buffer.from(secret)
  },
  async create(id, secret) {
    if (secrets.has(id)) throw new Error('existing key')
    secrets.set(id, Buffer.from(secret))
  },
  async remove(id) {
    secrets.delete(id)
  },
}

function createFixtureStore(directory: string, vault: ProviderSecretVault = fixtureVault) {
  return createChatGptCredentialStore(directory, vault)
}

const temporaryDirectories: string[] = []

async function fixtureDirectory() {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'appraise-chatgpt-test-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

function credential(hostId: string, overrides: Partial<ChatGptCredentials> = {}): ChatGptCredentials {
  return {
    issuer: 'https://auth.openai.com',
    subject: 'subject-one',
    client_id: 'oaiapp_one',
    ext_agent_host_id: hostId,
    id_token: 'synthetic-id',
    access_token: 'synthetic-access',
    refresh_token: 'synthetic-refresh',
    token_type: 'Bearer',
    expires_in: 3600,
    scopes: ['openid', 'chatgpt.tokens.use.direct'],
    saved_at: '2026-11-24T00:00:00.000Z',
    ...overrides,
  }
}

describe('private ChatGPT credential custody', () => {
  it('keeps a stable host ID, atomically replaces one identity, and disconnects it', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const hostId = await store.getOrCreateHostId()
    expect(hostId).toMatch(/^urn:uuid:/)
    expect(await store.getOrCreateHostId()).toBe(hostId)
    expect((await lstat(directory)).mode & 0o777).toBe(0o700)

    const first = credential(hostId)
    await store.write(first)
    expect(await store.read(first.client_id, first.subject)).toEqual(first)
    expect(await createFixtureStore(directory).readSelected()).toEqual(first)
    expect(await store.listRegistrations()).toEqual([{ clientId: 'oaiapp_one', subject: 'subject-one' }])
    const files = await readdir(directory)
    expect(files).toHaveLength(6)
    for (const file of files) expect((await lstat(path.join(directory, file))).mode & 0o777).toBe(0o600)

    const rotated = credential(hostId, { access_token: 'new-access', refresh_token: 'new-refresh' })
    await store.write(rotated)
    expect(await store.read(first.client_id, first.subject)).toEqual(rotated)
    expect(await readdir(directory)).toHaveLength(6)

    const second = credential(hostId, { subject: 'subject-two' })
    await store.write(second)
    await store.disconnect(first.client_id, first.subject)
    expect(await store.read(first.client_id, first.subject)).toBeUndefined()
    expect(await store.read(second.client_id, second.subject)).toEqual(second)
    expect(await store.readSelected()).toEqual(second)
    expect(await store.listRegistrations()).toEqual([
      { clientId: 'oaiapp_one', subject: 'subject-one' },
      { clientId: 'oaiapp_one', subject: 'subject-two' },
    ])
    await store.disconnect(second.client_id, second.subject)
    expect(await store.readSelected()).toBeUndefined()
    expect(await store.listRegistrations()).toHaveLength(2)
    expect(await store.getOrCreateHostId()).toBe(hostId)
  })

  it('does not initialize storage during read-only access', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'not-created')
    const store = createFixtureStore(directory)
    expect(await store.readSelected()).toBeUndefined()
    expect(await store.read('oaiapp_one', 'subject-one')).toBeUndefined()
    expect(await store.listRegistrations()).toEqual([])
    expect(await readdir(root)).toEqual([])
  })

  it('publishes one stable host ID across concurrent startup calls', async () => {
    const root = await fixtureDirectory()
    const store = createFixtureStore(path.join(root, 'private'))
    const ids = await Promise.all(Array.from({ length: 12 }, () => store.getOrCreateHostId()))
    expect(new Set(ids).size).toBe(1)
    expect(await store.getOrCreateHostId()).toBe(ids[0])
  })

  it('keeps registrations private and free of token material', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const record = credential(await store.getOrCreateHostId(), { email: 'verified@example.com' })
    await store.write(record)
    expect(await store.listRegistrations()).toEqual([
      { clientId: record.client_id, subject: record.subject, email: 'verified@example.com' },
    ])
    const file = path.join(
      directory,
      (await readdir(directory)).find(name => name.startsWith('registration-'))!,
    )
    const content = await readFile(file, 'utf8')
    expect(content).not.toContain('synthetic-access')
    expect(content).not.toContain('synthetic-refresh')
    expect(content).not.toContain('synthetic-id')
    expect((await lstat(file)).mode & 0o777).toBe(0o600)
    await store.disconnect(record.client_id, record.subject)
    expect(await store.listRegistrations()).toHaveLength(1)
  })

  it('rejects an identity bound to another host', async () => {
    const root = await fixtureDirectory()
    const store = createFixtureStore(path.join(root, 'private'))
    await expect(store.write(credential('urn:uuid:another-host'))).rejects.toThrow(/unavailable/)
  })

  it('rejects symlinked and permissive custody', async () => {
    const root = await fixtureDirectory()
    const privateDirectory = path.join(root, 'private')
    await symlink(root, privateDirectory)
    await expect(createFixtureStore(privateDirectory).getOrCreateHostId()).rejects.toThrow(/unavailable/)
    await rm(privateDirectory)
    const store = createFixtureStore(privateDirectory)
    const hostId = await store.getOrCreateHostId()
    await chmod(privateDirectory, 0o755)
    await expect(store.write(credential(hostId))).rejects.toThrow(/unavailable/)
  })

  it('rejects a symlinked account file and does not follow it', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const hostId = await store.getOrCreateHostId()
    const record = credential(hostId)
    await store.write(record)
    const accountFile = (await readdir(directory)).find(name => name.startsWith('account-'))!
    const filename = path.join(directory, accountFile)
    const target = path.join(root, 'target')
    await writeFile(target, 'leave-me-alone')
    await rm(filename)
    await symlink(target, filename)
    await expect(store.read(record.client_id, record.subject)).rejects.toThrow(/unavailable/)
    await expect(store.write(record)).rejects.toThrow(/unavailable/)
    expect(await readFile(target, 'utf8')).toBe('leave-me-alone')
  })

  it('stores authenticated ciphertext and reads it in a fresh instance', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const record = credential(await store.getOrCreateHostId())
    await store.write(record)
    const accountName = (await readdir(directory)).find(name => name.startsWith('account-'))!
    const ciphertext = await readFile(path.join(directory, accountName), 'utf8')
    expect(ciphertext).not.toContain(record.access_token)
    expect(ciphertext).not.toContain(record.refresh_token)
    expect(ciphertext).not.toContain(record.id_token)
    expect(JSON.parse(ciphertext)).toMatchObject({ kind: 'appraisejs.chatgpt.credentials.v1', version: 1 })
    expect(await createFixtureStore(directory).read(record.client_id, record.subject)).toEqual(record)
    expect(await createFixtureStore(directory).readSelected()).toEqual(record)
  })

  it('migrates selected and nonselected legacy account files on profile enumeration', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const hostId = await store.getOrCreateHostId()
    const first = credential(hostId, { subject: 'first' })
    const second = credential(hostId, { subject: 'second' })
    const orphan = credential(hostId, { subject: 'orphan' })
    const accountNames: string[] = []
    for (const record of [first, second, orphan]) {
      const digest = createHash('sha256')
        .update(JSON.stringify([record.client_id, record.subject]))
        .digest('hex')
      const filename = `account-${digest}.json`
      accountNames.push(filename)
      await writeFile(path.join(directory, filename), JSON.stringify(record), { mode: 0o600 })
      if (record !== orphan) {
        await writeFile(
          path.join(directory, `registration-${digest}.json`),
          JSON.stringify({ clientId: record.client_id, subject: record.subject }),
          { mode: 0o600 },
        )
      }
    }
    await writeFile(
      path.join(directory, 'selected-account.json'),
      JSON.stringify({ clientId: second.client_id, subject: second.subject }),
      { mode: 0o600 },
    )
    expect(await readdir(directory)).not.toContain('vault-key-id')
    expect(await store.listRegistrations()).toHaveLength(2)
    expect(await store.readSelected()).toEqual(second)
    for (const filename of accountNames) {
      const content = await readFile(path.join(directory, filename), 'utf8')
      expect(content).not.toContain('synthetic-access')
      expect(content).not.toContain('synthetic-refresh')
      expect(content).toContain('appraisejs.chatgpt.credentials.v1')
    }
  })

  it('rejects missing key material, changed ciphertext, and a copied account envelope', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const hostId = await store.getOrCreateHostId()
    const first = credential(hostId, { subject: 'first' })
    const second = credential(hostId, { subject: 'second' })
    await store.write(first)
    await store.write(second)
    const files = (await readdir(directory)).filter(name => name.startsWith('account-'))
    const firstFile = path.join(
      directory,
      `account-${createHash('sha256')
        .update(JSON.stringify([first.client_id, first.subject]))
        .digest('hex')}.json`,
    )
    const secondFile = files.map(name => path.join(directory, name)).find(name => name !== firstFile)!
    const original = await readFile(firstFile, 'utf8')
    const modified = JSON.parse(original)
    modified.ciphertext = `${modified.ciphertext.startsWith('A') ? 'B' : 'A'}${modified.ciphertext.slice(1)}`
    await writeFile(firstFile, JSON.stringify(modified))
    await expect(store.read(first.client_id, first.subject)).rejects.toThrow(/unavailable/)
    await writeFile(firstFile, original)
    await writeFile(secondFile, original)
    await expect(store.read(second.client_id, second.subject)).rejects.toThrow(/unavailable/)
    const keyId = await readFile(path.join(directory, 'vault-key-id'), 'utf8')
    secrets.delete(keyId)
    await expect(store.read(first.client_id, first.subject)).rejects.toThrow(/unavailable/)
    await expect(store.write(first)).rejects.toThrow(/unavailable/)
  })

  it('preserves legacy data if the operating system vault is unavailable', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const record = credential(await store.getOrCreateHostId())
    const digest = createHash('sha256')
      .update(JSON.stringify([record.client_id, record.subject]))
      .digest('hex')
    const accountFile = path.join(directory, `account-${digest}.json`)
    const plaintext = JSON.stringify(record)
    await writeFile(accountFile, plaintext, { mode: 0o600 })
    await writeFile(
      path.join(directory, 'selected-account.json'),
      JSON.stringify({ clientId: record.client_id, subject: record.subject }),
      { mode: 0o600 },
    )
    const unavailableVault: ProviderSecretVault = {
      read: async () => {
        throw new Error('private vault detail')
      },
      create: async () => {
        throw new Error('private vault detail')
      },
      remove: async () => {
        throw new Error('private vault detail')
      },
    }
    await expect(createFixtureStore(directory, unavailableVault).readSelected()).rejects.toThrow(
      'ChatGPT credential storage is unavailable on this host',
    )
    expect(await readFile(accountFile, 'utf8')).toBe(plaintext)
    expect(await readdir(directory)).not.toContain('vault-key-id')
  })

  it('preserves a newer credential after an older refresh and supports the largest valid tokens', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const hostId = await store.getOrCreateHostId()
    const large = credential(hostId, {
      id_token: 'i'.repeat(16_384),
      access_token: 'a'.repeat(16_384),
      refresh_token: 'r'.repeat(16_384),
      saved_at: '2026-11-26T10:00:00.000Z',
    })
    await store.write(large)
    expect(await createFixtureStore(directory).readSelected()).toEqual(large)
    const stale = credential(hostId, { saved_at: '2026-11-26T09:00:00.000Z' })
    await expect(store.write(stale)).rejects.toThrow(/unavailable/)
    expect(await store.readSelected()).toEqual(large)
  })

  it.skipIf(!hasNativeSqlite)('releases the credential write lock after a process is killed', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createFixtureStore(directory)
    const record = credential(await store.getOrCreateHostId())
    await store.write(record)
    const database = path.join(directory, 'credential-write-lock.sqlite')
    const holder = spawn(
      process.execPath,
      [
        '-e',
        "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(process.argv[1]); db.exec('BEGIN IMMEDIATE'); process.stdout.write('locked\\n'); setInterval(() => {}, 1000)",
        database,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    try {
      await new Promise<void>((resolve, reject) => {
        holder.stdout.once('data', (chunk: Buffer) => {
          if (chunk.toString() === 'locked\n') resolve()
          else reject(new Error('Failed to acquire the fixture lock.'))
        })
        holder.once('exit', () => reject(new Error('The fixture lock holder exited early.')))
      })
      holder.kill('SIGKILL')
      await new Promise(resolve => holder.once('exit', resolve))
      const refreshed = credential(record.ext_agent_host_id, {
        access_token: 'refreshed-after-restart',
        saved_at: '2026-11-26T11:00:00.000Z',
      })
      await store.write(refreshed)
      expect(await store.readSelected()).toEqual(refreshed)
    } finally {
      holder.kill('SIGKILL')
    }
  })
})
