import { chmod, lstat, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createChatGptCredentialStore } from './chatgpt-credential-store'
import type { ChatGptCredentials } from './chatgpt-identity'

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
    const store = createChatGptCredentialStore(directory)
    const hostId = await store.getOrCreateHostId()
    expect(hostId).toMatch(/^urn:uuid:/)
    expect(await store.getOrCreateHostId()).toBe(hostId)
    expect((await lstat(directory)).mode & 0o777).toBe(0o700)

    const first = credential(hostId)
    await store.write(first)
    expect(await store.read(first.client_id, first.subject)).toEqual(first)
    expect(await createChatGptCredentialStore(directory).readSelected()).toEqual(first)
    expect(await store.listRegistrations()).toEqual([{ clientId: 'oaiapp_one', subject: 'subject-one' }])
    const files = await readdir(directory)
    expect(files).toHaveLength(4)
    for (const file of files) expect((await lstat(path.join(directory, file))).mode & 0o777).toBe(0o600)

    const rotated = credential(hostId, { access_token: 'new-access', refresh_token: 'new-refresh' })
    await store.write(rotated)
    expect(await store.read(first.client_id, first.subject)).toEqual(rotated)
    expect(await readdir(directory)).toHaveLength(4)

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
    const store = createChatGptCredentialStore(directory)
    expect(await store.readSelected()).toBeUndefined()
    expect(await store.read('oaiapp_one', 'subject-one')).toBeUndefined()
    expect(await store.listRegistrations()).toEqual([])
    expect(await readdir(root)).toEqual([])
  })

  it('publishes one stable host ID across concurrent startup calls', async () => {
    const root = await fixtureDirectory()
    const store = createChatGptCredentialStore(path.join(root, 'private'))
    const ids = await Promise.all(Array.from({ length: 12 }, () => store.getOrCreateHostId()))
    expect(new Set(ids).size).toBe(1)
    expect(await store.getOrCreateHostId()).toBe(ids[0])
  })

  it('keeps registrations private and free of token material', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createChatGptCredentialStore(directory)
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
    const store = createChatGptCredentialStore(path.join(root, 'private'))
    await expect(store.write(credential('urn:uuid:another-host'))).rejects.toThrow(/unavailable/)
  })

  it('rejects symlinked and permissive custody', async () => {
    const root = await fixtureDirectory()
    const privateDirectory = path.join(root, 'private')
    await symlink(root, privateDirectory)
    await expect(createChatGptCredentialStore(privateDirectory).getOrCreateHostId()).rejects.toThrow(/unavailable/)
    await rm(privateDirectory)
    const store = createChatGptCredentialStore(privateDirectory)
    const hostId = await store.getOrCreateHostId()
    await chmod(privateDirectory, 0o755)
    await expect(store.write(credential(hostId))).rejects.toThrow(/unavailable/)
  })

  it('rejects a symlinked account file and does not follow it', async () => {
    const root = await fixtureDirectory()
    const directory = path.join(root, 'private')
    const store = createChatGptCredentialStore(directory)
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
})
