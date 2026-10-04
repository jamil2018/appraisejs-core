import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  disconnectLocalProjectIdentity,
  ensureLocalProjectIdentity,
  reconnectLocalProjectIdentity,
} from './project-identity.js'

const workspaces: string[] = []

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('local project identity', () => {
  it('rotates a deleted identity without requiring a process restart', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-identity-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"identity-test"}')
    const first = await ensureLocalProjectIdentity(cwd)
    await fs.rm(path.join(cwd, '.appraisejs', 'coordinator.json'))

    const rotated = await ensureLocalProjectIdentity(cwd)

    expect(rotated.identity.projectFingerprint).toBe(first.identity.projectFingerprint)
    expect(rotated.identity.token).not.toBe(first.identity.token)
    expect(rotated.created).toBe(true)
  })

  it('converges concurrent first requests on one identity', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-identity-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"identity-test"}')

    const identities = await Promise.all([ensureLocalProjectIdentity(cwd), ensureLocalProjectIdentity(cwd)])

    expect(new Set(identities.map(result => result.identity.token))).toHaveLength(1)
  })

  it('persists a tokenless disabled marker even before setup and requires explicit reconnect', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-identity-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"identity-test"}')
    const disconnected = await disconnectLocalProjectIdentity(cwd)
    const identityPath = path.join(cwd, '.appraisejs', 'coordinator.json')
    expect(JSON.parse(await fs.readFile(identityPath, 'utf8'))).toEqual({
      projectFingerprint: disconnected.details.projectFingerprint,
      token: '',
      disabled: true,
    })
    await expect(ensureLocalProjectIdentity(cwd)).rejects.toMatchObject({ code: 'identity-disabled' })
    await reconnectLocalProjectIdentity(cwd)
    const connected = await ensureLocalProjectIdentity(cwd)
    expect(connected.created).toBe(false)
    expect(connected.identity.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('rotates the prior token on reconnect and keeps the project fingerprint', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-identity-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"identity-test"}')
    const before = await ensureLocalProjectIdentity(cwd)
    await disconnectLocalProjectIdentity(cwd)
    await reconnectLocalProjectIdentity(cwd)
    const after = await ensureLocalProjectIdentity(cwd)
    expect(after.identity.projectFingerprint).toBe(before.identity.projectFingerprint)
    expect(after.identity.token).not.toBe(before.identity.token)
  })

  it('rejects disabled and empty-token identities even when their fields are otherwise plausible', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-identity-'))
    workspaces.push(cwd)
    await fs.writeFile(path.join(cwd, 'package.json'), '{"name":"identity-test"}')
    const first = await ensureLocalProjectIdentity(cwd)
    const identityPath = path.join(cwd, '.appraisejs', 'coordinator.json')
    for (const identity of [
      { ...first.identity, disabled: true },
      { projectFingerprint: first.identity.projectFingerprint, token: '' },
    ]) {
      await fs.writeFile(identityPath, JSON.stringify(identity))
      await expect(ensureLocalProjectIdentity(cwd)).rejects.toMatchObject({ code: 'identity-disabled' })
    }
  })
})
