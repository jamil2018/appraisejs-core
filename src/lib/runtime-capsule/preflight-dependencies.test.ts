import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultCapsulePreflightDependencies } from './preflight-dependencies'

const roots: string[] = []
afterEach(async () => Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))))

async function createOutputRoots() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-preflight-output-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-preflight-outside-'))
  roots.push(root, outside)
  return { root, outside }
}

describe('capsule preflight output probe', () => {
  it('proves writable contained output without leaving probe bytes', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-preflight-output-'))
    roots.push(root)
    await defaultCapsulePreflightDependencies.probeOutput(root, 'reports/preflight.json')
    expect(await fs.readdir(path.join(root, 'reports'))).toEqual([])
  })

  it('rejects a symlinked output ancestor', async () => {
    const { root, outside } = await createOutputRoots()
    await fs.symlink(outside, path.join(root, 'reports'))
    await expect(defaultCapsulePreflightDependencies.probeOutput(root, 'reports/preflight.json')).rejects.toThrow(
      /escapes/,
    )
  })

  it('rejects an ancestor swapped to an external symlink after the writability probe', async () => {
    const { root, outside } = await createOutputRoots()
    await defaultCapsulePreflightDependencies.probeOutput(root, 'reports/preflight.json')
    await fs.rmdir(path.join(root, 'reports'))
    await fs.symlink(outside, path.join(root, 'reports'))
    await expect(defaultCapsulePreflightDependencies.prepareOutput(root, 'reports/preflight.json')).rejects.toThrow(
      /symlink/,
    )
  })

  it('rejects a final output path swapped to a symlink', async () => {
    const { root, outside } = await createOutputRoots()
    await fs.mkdir(path.join(root, 'reports'))
    await fs.writeFile(path.join(outside, 'report.json'), 'outside')
    await fs.symlink(path.join(outside, 'report.json'), path.join(root, 'reports', 'preflight.json'))
    await expect(defaultCapsulePreflightDependencies.prepareOutput(root, 'reports/preflight.json')).rejects.toThrow(
      /symlink/,
    )
  })
})
