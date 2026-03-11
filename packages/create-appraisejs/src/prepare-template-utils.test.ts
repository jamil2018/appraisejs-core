import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'
import {
  TEMPLATE_PREP_SYNC_SCRIPTS,
  shouldAbortOnFallbackSeed,
  verifyPreparedTemplateState,
  type TemplateMetadata,
} from './prepare-template-utils.js'

async function createPreparedTemplateFixture(rootDir: string): Promise<void> {
  await fs.ensureDir(path.join(rootDir, 'prisma'))
  await fs.ensureDir(path.join(rootDir, 'automation', 'config', 'environments'))
  await fs.ensureDir(path.join(rootDir, 'automation', 'mapping'))

  await fs.writeFile(path.join(rootDir, 'gitignore'), 'node_modules\n')
  await fs.writeFile(path.join(rootDir, 'prisma', 'dev.db'), 'db')
  await fs.writeFile(
    path.join(rootDir, 'automation', 'config', 'environments', 'environments.json'),
    '{"demo":{"baseUrl":"https://example.com","apiBaseUrl":"","email":"","password":""}}',
  )
  await fs.writeFile(path.join(rootDir, 'automation', 'mapping', 'locator-map.json'), '[]')
}

describe('TEMPLATE_PREP_SYNC_SCRIPTS', () => {
  it('only runs the template-step sync stages during template preparation', () => {
    expect(TEMPLATE_PREP_SYNC_SCRIPTS).toEqual(['sync-template-step-groups', 'sync-template-steps'])
  })
})

describe('shouldAbortOnFallbackSeed', () => {
  const previousMetadata: TemplateMetadata = {
    preparedAt: '2026-03-11T00:00:00.000Z',
    inputHash: 'previous-hash',
    databasePath: 'prisma/dev.db',
  }

  it('aborts when fallback seed is used and the template input hash changed', () => {
    expect(shouldAbortOnFallbackSeed(true, 'new-hash', previousMetadata)).toBe(true)
  })

  it('does not abort when fallback seed is not used', () => {
    expect(shouldAbortOnFallbackSeed(false, 'new-hash', previousMetadata)).toBe(false)
  })

  it('does not abort when the previous hash matches', () => {
    expect(shouldAbortOnFallbackSeed(true, 'previous-hash', previousMetadata)).toBe(false)
  })
})

describe('verifyPreparedTemplateState', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(tempDirs.map(dir => fs.remove(dir).catch(() => {})))
    tempDirs.length = 0
  })

  async function createTempTemplateDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-prepare-'))
    tempDirs.push(dir)
    await createPreparedTemplateFixture(dir)
    return dir
  }

  it('accepts a prepared template with required starter assets and no reports', async () => {
    const dir = await createTempTemplateDir()
    await expect(verifyPreparedTemplateState(dir)).resolves.toBeUndefined()
  })

  it('fails when the environments starter file is missing', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'automation', 'config', 'environments', 'environments.json'))

    await expect(verifyPreparedTemplateState(dir)).rejects.toThrow(/starter environments file/)
  })

  it('fails when report artifacts are present', async () => {
    const dir = await createTempTemplateDir()
    await fs.ensureDir(path.join(dir, 'automation', 'reports', 'logs'))
    await fs.writeFile(path.join(dir, 'automation', 'reports', 'logs', 'run.log'), 'artifact')

    await expect(verifyPreparedTemplateState(dir)).rejects.toThrow(/report artifacts/)
  })

  it('fails when the packaged gitignore file is missing', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'gitignore'))

    await expect(verifyPreparedTemplateState(dir)).rejects.toThrow(/packaged gitignore/)
  })

  it('fails when a stale nested prisma database is present', async () => {
    const dir = await createTempTemplateDir()
    await fs.ensureDir(path.join(dir, 'prisma', 'prisma'))
    await fs.writeFile(path.join(dir, 'prisma', 'prisma', 'dev.db'), 'stale')

    await expect(verifyPreparedTemplateState(dir)).rejects.toThrow(/stale nested database/)
  })
})
