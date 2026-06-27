import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs-extra'
import os from 'os'
import { copyTemplate, getBaseTemplatePath, getTemplatePath } from './copy-template.js'

describe('copy-template', () => {
  let tempDir: string
  let destDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-test-'))
    destDir = path.join(tempDir, 'output')
  })

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {})
  })

  describe('getTemplatePath', () => {
    it('returns a path ending with templates/starter for starter', () => {
      const templatePath = getTemplatePath('starter')
      expect(templatePath).toMatch(/[\\/]templates[\\/]flavors[\\/]starter$/)
    })

    it('returns a path ending with templates/blank for blank', () => {
      const templatePath = getTemplatePath('blank')
      expect(templatePath).toMatch(/[\\/]templates[\\/]flavors[\\/]blank$/)
    })

    it('returns the package-owned base template path', () => {
      expect(getBaseTemplatePath()).toMatch(/[\\/]templates[\\/]base$/)
    })
  })

  describe('copyTemplate', () => {
    async function createBaseFixture(): Promise<string> {
      const baseDir = path.join(tempDir, 'base')
      await fs.ensureDir(path.join(baseDir, 'src', 'app'))
      await fs.ensureDir(path.join(baseDir, 'node_modules', 'pkg'))
      await fs.ensureDir(path.join(baseDir, 'prisma'))
      await fs.writeJson(path.join(baseDir, 'package.json'), { name: 'test' })
      await fs.writeFile(path.join(baseDir, 'gitignore'), 'node_modules\n')
      await fs.writeFile(path.join(baseDir, '.env'), 'SECRET=1')
      await fs.writeFile(path.join(baseDir, 'package-lock.json'), '{}')
      await fs.writeFile(path.join(baseDir, 'prisma', 'schema.prisma'), 'datasource db {}')
      await fs.writeFile(path.join(baseDir, 'src', 'app', 'page.tsx'), 'export default function Page() {}')
      return baseDir
    }

    async function createFlavorFixture(name = 'starter'): Promise<string> {
      const flavorDir = path.join(tempDir, name)
      await fs.ensureDir(path.join(flavorDir, 'prisma'))
      await fs.writeFile(path.join(flavorDir, 'prisma', 'dev.db'), `${name}-db`)
      return flavorDir
    }

    it('copies base files then overlays flavor files while excluding node_modules, .env, and lockfiles', async () => {
      const baseDir = await createBaseFixture()
      const flavorDir = await createFlavorFixture()

      const { getCollectedFilesForTest } = await import('./copy-template.js')
      const collectedFiles = getCollectedFilesForTest(baseDir, 'npm')
      expect(collectedFiles).toContain('package.json')
      expect(collectedFiles).toContain('gitignore')
      expect(collectedFiles.some(f => f.includes('node_modules'))).toBe(false)
      expect(collectedFiles.some(f => f.includes('.env'))).toBe(false)
      const srcFiles = collectedFiles.filter(f => f.includes('src'))
      expect(srcFiles.length).toBeGreaterThan(0)

      await copyTemplate(destDir, undefined, baseDir, 'npm', 'starter', flavorDir)

      expect(await fs.pathExists(path.join(destDir, 'package.json'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, '.gitignore'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'gitignore'))).toBe(false)
      expect(await fs.pathExists(path.join(destDir, 'src'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'src', 'app', 'page.tsx'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'prisma', 'dev.db'))).toBe(true)
      expect(await fs.readFile(path.join(destDir, 'prisma', 'dev.db'), 'utf8')).toBe('starter-db')

      const hasNodeModules = await fs.pathExists(path.join(destDir, 'node_modules'))
      const hasEnv = await fs.pathExists(path.join(destDir, '.env'))
      const hasLock = await fs.pathExists(path.join(destDir, 'package-lock.json'))

      expect(hasNodeModules).toBe(false)
      expect(hasEnv).toBe(false)
      expect(hasLock).toBe(true)
    })

    it('does not copy .DS_Store artifacts', async () => {
      const baseDir = await createBaseFixture()
      const flavorDir = await createFlavorFixture()
      await fs.ensureDir(path.join(flavorDir, 'automation', 'steps'))
      await fs.writeFile(path.join(flavorDir, 'automation', 'steps', '.DS_Store'), 'artifact')

      await copyTemplate(destDir, undefined, baseDir, 'npm', 'starter', flavorDir)

      expect(await fs.pathExists(path.join(destDir, 'automation', 'steps', '.DS_Store'))).toBe(false)
    })

    it('copies package-lock.json when packageManager is npm', async () => {
      const baseDir = await createBaseFixture()
      const flavorDir = await createFlavorFixture()
      await fs.writeFile(path.join(baseDir, 'package-lock.json'), '{"lockfileVersion": 3}')

      await copyTemplate(destDir, undefined, baseDir, 'npm', 'starter', flavorDir)

      expect(await fs.pathExists(path.join(destDir, 'package-lock.json'))).toBe(true)
      expect(await fs.readFile(path.join(destDir, 'package-lock.json'), 'utf-8')).toBe('{"lockfileVersion": 3}')
    })

    it('does not copy package-lock.json when packageManager is not npm', async () => {
      const baseDir = await createBaseFixture()
      const flavorDir = await createFlavorFixture()

      await copyTemplate(destDir, undefined, baseDir, 'yarn', 'starter', flavorDir)

      expect(await fs.pathExists(path.join(destDir, 'package-lock.json'))).toBe(false)
    })

    it('retains internal package source and dist files in the scaffolded output', async () => {
      const baseDir = await createBaseFixture()
      const flavorDir = await createFlavorFixture()
      await fs.ensureDir(path.join(baseDir, 'packages', 'locator-picker-companion', 'src'))
      await fs.ensureDir(path.join(baseDir, 'packages', 'locator-picker-companion', 'dist'))
      await fs.writeFile(
        path.join(baseDir, 'packages', 'locator-picker-companion', 'package.json'),
        JSON.stringify({ name: '@locator-picker-companion' }),
      )
      await fs.writeFile(
        path.join(baseDir, 'packages', 'locator-picker-companion', 'tsconfig.json'),
        '{"extends":"../../tsconfig.json"}',
      )
      await fs.writeFile(path.join(baseDir, 'packages', 'locator-picker-companion', 'src', 'cli.ts'), 'export {};')
      await fs.writeFile(path.join(baseDir, 'packages', 'locator-picker-companion', 'dist', 'cli.js'), 'export {};')
      await fs.writeFile(
        path.join(baseDir, 'packages', 'locator-picker-companion', 'dist', 'launcher.js'),
        'export {};',
      )

      await copyTemplate(destDir, undefined, baseDir, 'npm', 'starter', flavorDir)

      expect(await fs.pathExists(path.join(destDir, 'packages', 'locator-picker-companion', 'package.json'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'packages', 'locator-picker-companion', 'tsconfig.json'))).toBe(
        true,
      )
      expect(await fs.pathExists(path.join(destDir, 'packages', 'locator-picker-companion', 'src', 'cli.ts'))).toBe(
        true,
      )
      expect(await fs.pathExists(path.join(destDir, 'packages', 'locator-picker-companion', 'dist', 'cli.js'))).toBe(
        true,
      )
      expect(
        await fs.pathExists(path.join(destDir, 'packages', 'locator-picker-companion', 'dist', 'launcher.js')),
      ).toBe(true)
    })
  })
})
