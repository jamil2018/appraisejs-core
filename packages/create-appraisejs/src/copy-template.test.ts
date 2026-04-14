import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs-extra'
import os from 'os'
import { copyTemplate, getTemplatePath } from './copy-template.js'

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
      expect(templatePath).toMatch(/[\\/]templates[\\/]starter$/)
    })

    it('returns a path ending with templates/blank for blank', () => {
      const templatePath = getTemplatePath('blank')
      expect(templatePath).toMatch(/[\\/]templates[\\/]blank$/)
    })
  })

  describe('copyTemplate', () => {
    it('copies template files and excludes node_modules, .env, and lockfiles while keeping the seeded db', async () => {
      const fixtureDir = path.join(tempDir, 'fixture')
      await fs.ensureDir(path.join(fixtureDir, 'src', 'app'))
      await fs.ensureDir(path.join(fixtureDir, 'node_modules', 'pkg'))
      await fs.ensureDir(path.join(fixtureDir, 'prisma'))
      await fs.writeJson(path.join(fixtureDir, 'package.json'), { name: 'test' })
      await fs.writeFile(path.join(fixtureDir, 'gitignore'), 'node_modules\n')
      await fs.writeFile(path.join(fixtureDir, '.env'), 'SECRET=1')
      await fs.writeFile(path.join(fixtureDir, 'package-lock.json'), '{}')
      await fs.writeFile(path.join(fixtureDir, 'prisma', 'dev.db'), 'db')
      await fs.writeFile(path.join(fixtureDir, 'src', 'app', 'page.tsx'), 'export default function Page() {}')

      const files = getTemplatePath()
      expect(files).toMatch(/[\\/]templates[\\/]starter$/)

      const { getCollectedFilesForTest } = await import('./copy-template.js')
      const collectedFiles = getCollectedFilesForTest(fixtureDir, 'npm')
      expect(collectedFiles).toContain('package.json')
      expect(collectedFiles).toContain('gitignore')
      expect(collectedFiles).toContain(path.join('prisma', 'dev.db'))
      expect(collectedFiles.some(f => f.includes('node_modules'))).toBe(false)
      expect(collectedFiles.some(f => f.includes('.env'))).toBe(false)
      const srcFiles = collectedFiles.filter(f => f.includes('src'))
      expect(srcFiles.length).toBeGreaterThan(0)

      await copyTemplate(destDir, undefined, fixtureDir, 'npm')

      expect(await fs.pathExists(path.join(destDir, 'package.json'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, '.gitignore'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'gitignore'))).toBe(false)
      expect(await fs.pathExists(path.join(destDir, 'src'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'src', 'app', 'page.tsx'))).toBe(true)
      expect(await fs.pathExists(path.join(destDir, 'prisma', 'dev.db'))).toBe(true)

      const hasNodeModules = await fs.pathExists(path.join(destDir, 'node_modules'))
      const hasEnv = await fs.pathExists(path.join(destDir, '.env'))
      const hasLock = await fs.pathExists(path.join(destDir, 'package-lock.json'))

      expect(hasNodeModules).toBe(false)
      expect(hasEnv).toBe(false)
      expect(hasLock).toBe(true)
    })

    it('does not copy .DS_Store artifacts', async () => {
      const fixtureDir = path.join(tempDir, 'fixture')
      await fs.ensureDir(path.join(fixtureDir, 'automation', 'steps'))
      await fs.writeJson(path.join(fixtureDir, 'package.json'), { name: 'test' })
      await fs.writeFile(path.join(fixtureDir, 'automation', 'steps', '.DS_Store'), 'artifact')

      await copyTemplate(destDir, undefined, fixtureDir, 'npm')

      expect(await fs.pathExists(path.join(destDir, 'automation', 'steps', '.DS_Store'))).toBe(false)
    })

    it('copies package-lock.json when packageManager is npm', async () => {
      const fixtureDir = path.join(tempDir, 'fixture')
      await fs.ensureDir(path.join(fixtureDir, 'src'))
      await fs.writeJson(path.join(fixtureDir, 'package.json'), { name: 'test' })
      await fs.writeFile(path.join(fixtureDir, 'package-lock.json'), '{"lockfileVersion": 3}')
      await fs.writeFile(path.join(fixtureDir, 'src', 'index.ts'), '// empty')

      await copyTemplate(destDir, undefined, fixtureDir, 'npm')

      expect(await fs.pathExists(path.join(destDir, 'package-lock.json'))).toBe(true)
      expect(await fs.readFile(path.join(destDir, 'package-lock.json'), 'utf-8')).toBe('{"lockfileVersion": 3}')
    })

    it('does not copy package-lock.json when packageManager is not npm', async () => {
      const fixtureDir = path.join(tempDir, 'fixture')
      await fs.ensureDir(path.join(fixtureDir, 'src'))
      await fs.writeJson(path.join(fixtureDir, 'package.json'), { name: 'test' })
      await fs.writeFile(path.join(fixtureDir, 'package-lock.json'), '{}')
      await fs.writeFile(path.join(fixtureDir, 'src', 'index.ts'), '// empty')

      await copyTemplate(destDir, undefined, fixtureDir, 'yarn')

      expect(await fs.pathExists(path.join(destDir, 'package-lock.json'))).toBe(false)
    })

    it('retains internal package source and dist files in the scaffolded output', async () => {
      const fixtureDir = path.join(tempDir, 'fixture')
      await fs.ensureDir(path.join(fixtureDir, 'packages', 'locator-picker-companion', 'src'))
      await fs.ensureDir(path.join(fixtureDir, 'packages', 'locator-picker-companion', 'dist'))
      await fs.writeJson(path.join(fixtureDir, 'package.json'), { name: 'test' })
      await fs.writeFile(
        path.join(fixtureDir, 'packages', 'locator-picker-companion', 'package.json'),
        JSON.stringify({ name: '@locator-picker-companion' }),
      )
      await fs.writeFile(
        path.join(fixtureDir, 'packages', 'locator-picker-companion', 'tsconfig.json'),
        '{"extends":"../../tsconfig.json"}',
      )
      await fs.writeFile(path.join(fixtureDir, 'packages', 'locator-picker-companion', 'src', 'cli.ts'), 'export {};')
      await fs.writeFile(path.join(fixtureDir, 'packages', 'locator-picker-companion', 'dist', 'cli.js'), 'export {};')
      await fs.writeFile(
        path.join(fixtureDir, 'packages', 'locator-picker-companion', 'dist', 'launcher.js'),
        'export {};',
      )

      await copyTemplate(destDir, undefined, fixtureDir, 'npm')

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
