import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BLANK_TEMPLATE_PREP_SYNC_SCRIPTS,
  TEMPLATE_PREP_SYNC_SCRIPTS,
  getTemplatePrepSyncScripts,
  shouldAbortOnFallbackSeed,
  verifyPreparedTemplateState,
  type TemplateMetadata,
  type TemplateStepDataCounts,
} from './prepare-template-utils.js'

async function createPreparedTemplateFixture(rootDir: string): Promise<void> {
  await fs.ensureDir(path.join(rootDir, 'prisma'))
  await fs.ensureDir(path.join(rootDir, 'automation', 'config', 'environments'))
  await fs.ensureDir(path.join(rootDir, 'automation', 'mapping'))
  await fs.ensureDir(path.join(rootDir, 'automation', 'steps', 'actions'))

  await fs.writeFile(path.join(rootDir, 'gitignore'), 'node_modules\n')
  await fs.writeFile(path.join(rootDir, 'prisma', 'dev.db'), 'db')
  await fs.writeFile(
    path.join(rootDir, 'automation', 'config', 'environments', 'environments.json'),
    '{"demo":{"baseUrl":"https://example.com","apiBaseUrl":"","email":"","password":""}}',
  )
  await fs.writeFile(path.join(rootDir, 'automation', 'mapping', 'locator-map.json'), '[]')
  await fs.writeFile(path.join(rootDir, 'automation', 'steps', 'actions', 'click.step.ts'), '// bundled step')
}

async function getStarterCounts(): Promise<TemplateStepDataCounts> {
  return { stepCount: 3, stepGroupCount: 2 }
}

async function getBlankCounts(): Promise<TemplateStepDataCounts> {
  return { stepCount: 0, stepGroupCount: 0 }
}

describe('TEMPLATE_PREP_SYNC_SCRIPTS', () => {
  it('only runs the template-step sync stages during template preparation', () => {
    expect(TEMPLATE_PREP_SYNC_SCRIPTS).toEqual(['sync-template-step-groups', 'sync-template-steps'])
  })
})

describe('getTemplatePrepSyncScripts', () => {
  it('returns the starter sync order for starter', () => {
    expect(getTemplatePrepSyncScripts('starter')).toEqual(TEMPLATE_PREP_SYNC_SCRIPTS)
  })

  it('uses a blank-specific sync order that clears template steps first', () => {
    expect(getTemplatePrepSyncScripts('blank')).toEqual(BLANK_TEMPLATE_PREP_SYNC_SCRIPTS)
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

  it('accepts a prepared starter template with required assets and no reports', async () => {
    const dir = await createTempTemplateDir()
    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).resolves.toBeUndefined()
  })

  it('accepts a prepared blank template when bundled step files and step data are absent', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'automation', 'steps'))

    await expect(verifyPreparedTemplateState(dir, 'blank', undefined, getBlankCounts)).resolves.toBeUndefined()
  })

  it('fails when the environments starter file is missing', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'automation', 'config', 'environments', 'environments.json'))

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /starter environments file/,
    )
  })

  it('fails when report artifacts are present', async () => {
    const dir = await createTempTemplateDir()
    await fs.ensureDir(path.join(dir, 'automation', 'reports', 'run-123', 'logs'))
    await fs.writeFile(path.join(dir, 'automation', 'reports', 'run-123', 'logs', 'run.log'), 'artifact')

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /report artifacts/,
    )
  })

  it('fails when the locator map starter file is not an empty array', async () => {
    const dir = await createTempTemplateDir()
    await fs.writeFile(path.join(dir, 'automation', 'mapping', 'locator-map.json'), '[{"name":"login","path":"/login"}]')

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /empty locator map/,
    )
  })

  it('fails when the packaged gitignore file is missing', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'gitignore'))

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /packaged gitignore/,
    )
  })

  it('fails when a stale nested prisma database is present', async () => {
    const dir = await createTempTemplateDir()
    await fs.ensureDir(path.join(dir, 'prisma', 'prisma'))
    await fs.writeFile(path.join(dir, 'prisma', 'prisma', 'dev.db'), 'stale')

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /stale nested database/,
    )
  })

  it('fails when starter loses its bundled step files', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'automation', 'steps'))

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /missing bundled step files/,
    )
  })

  it('fails when blank still ships bundled step files', async () => {
    const dir = await createTempTemplateDir()

    await expect(verifyPreparedTemplateState(dir, 'blank', undefined, getBlankCounts)).rejects.toThrow(
      /should not include bundled step files/,
    )
  })

  it('fails when blank database still contains bundled step data', async () => {
    const dir = await createTempTemplateDir()
    await fs.remove(path.join(dir, 'automation', 'steps'))

    await expect(verifyPreparedTemplateState(dir, 'blank', undefined, getStarterCounts)).rejects.toThrow(
      /should not include bundled step data/,
    )
  })

  it('fails when OS artifacts are present', async () => {
    const dir = await createTempTemplateDir()
    await fs.writeFile(path.join(dir, 'automation', 'steps', '.DS_Store'), 'artifact')

    await expect(verifyPreparedTemplateState(dir, 'starter', undefined, getStarterCounts)).rejects.toThrow(
      /OS artifacts/,
    )
  })
})
