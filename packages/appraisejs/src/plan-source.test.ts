import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { resolvePlanSource } from './plan-source.js'

const directories: string[] = []

async function directory(prefix: string) {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  directories.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(value => fs.rm(value, { recursive: true, force: true })))
})

describe('online plan source ownership', () => {
  it('allows files inside the canonical project', async () => {
    const cwd = await directory('appraise-source-project-')
    const file = path.join(cwd, 'appraise', 'plans', 'plan.yaml')
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, 'version: "1"\n')

    await expect(resolvePlanSource(cwd, file, false)).resolves.toMatchObject({
      path: await fs.realpath(file),
      external: false,
    })
  })

  it('blocks traversal and symlink-resolved external files by default', async () => {
    const cwd = await directory('appraise-source-project-')
    const external = await directory('appraise-source-external-')
    const file = path.join(external, 'plan.yaml')
    const link = path.join(cwd, 'linked-plan.yaml')
    await fs.writeFile(file, 'version: "1"\n')
    await fs.symlink(file, link)

    await expect(
      resolvePlanSource(cwd, path.join(cwd, '..', path.basename(external), 'plan.yaml'), false),
    ).rejects.toThrow('--allow-external-plan-file')
    await expect(resolvePlanSource(cwd, link, false)).rejects.toThrow('--allow-external-plan-file')
  })

  it('allows an external file only with an explicit machine-readable warning', async () => {
    const cwd = await directory('appraise-source-project-')
    const external = await directory('appraise-source-external-')
    const file = path.join(external, 'plan.yaml')
    await fs.writeFile(file, 'version: "1"\n')

    await expect(resolvePlanSource(cwd, file, true)).resolves.toEqual({
      path: await fs.realpath(file),
      external: true,
      warning: 'external-plan-source',
    })
  })
})
