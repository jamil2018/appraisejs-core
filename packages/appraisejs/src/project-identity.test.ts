import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ensureLocalProjectIdentity } from './project-identity.js'

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
})
