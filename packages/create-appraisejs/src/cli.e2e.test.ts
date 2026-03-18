import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs-extra'
import os from 'os'
import { getTemplatePath } from './copy-template.js'
import { patchPackageJsonScripts } from './install.js'

describe('CLI E2E', () => {
  let tempDir: string
  let destDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-e2e-'))
    destDir = path.join(tempDir, 'my-app')
  })

  afterEach(async () => {
    await fs.remove(tempDir).catch(() => {})
  })

  it('scaffolds app from the bundled template with a seeded database', async () => {
    const templatePath = getTemplatePath()
    if (!(await fs.pathExists(templatePath))) {
      console.warn('Skipping E2E: template not found (run npm run build first)')
      return
    }

    await fs.ensureDir(destDir)
    const pkgJsonPath = path.join(destDir, 'package.json')
    const gitignorePath = path.join(destDir, '.gitignore')
    const seededDbPath = path.join(destDir, 'prisma', 'dev.db')
    const staleNestedDbPath = path.join(destDir, 'prisma', 'prisma', 'dev.db')

    const { copyTemplate } = await import('./copy-template.js')
    await copyTemplate(destDir, undefined, undefined, 'npm')

    expect(await fs.pathExists(pkgJsonPath)).toBe(true)
    expect(await fs.pathExists(gitignorePath)).toBe(true)
    expect(await fs.pathExists(seededDbPath)).toBe(true)
    expect(await fs.pathExists(staleNestedDbPath)).toBe(false)
    const pkg = await fs.readJson(pkgJsonPath)
    expect(pkg.scripts?.dev).toBeDefined()
    expect(pkg.scripts?.setup).toContain('setup:db')
    expect(pkg.scripts?.['setup:db']).toContain('generate-db-client')
    expect(pkg.scripts?.setup).toContain('build:local')
    expect(pkg.scripts?.setup).toContain('protect-seeded-files')
    expect(pkg.scripts?.['build:local']).toContain('generate-db-client')
    expect(pkg.scripts?.['build:local']).toContain('build:cucumber-runtime')
    expect(pkg.scripts?.['build:local']).toContain('build:locator-picker-companion')
    expect(pkg.scripts?.['protect-seeded-files']).toBe('npx tsx scripts/protect-seeded-files.ts')
  })

  it('patchPackageJsonScripts rewrites real template scripts for chosen package manager', async () => {
    const templatePath = getTemplatePath()
    if (!(await fs.pathExists(templatePath))) {
      console.warn('Skipping E2E: template not found (run npm run build first)')
      return
    }

    const { copyTemplate } = await import('./copy-template.js')
    await copyTemplate(destDir, undefined, undefined, 'npm')

    const pkgBefore = await fs.readJson(path.join(destDir, 'package.json'))
    expect(pkgBefore.scripts['install-dependencies']).toBe('npm install --legacy-peer-deps')
    expect(pkgBefore.scripts.setup).toMatch(/npm run /)
    expect(pkgBefore.scripts['generate-db-client']).toBe('npx prisma generate --schema prisma/schema.prisma')

    await patchPackageJsonScripts(destDir, 'pnpm')

    const pkgAfter = await fs.readJson(path.join(destDir, 'package.json'))
    expect(pkgAfter.scripts['install-dependencies']).toBe('pnpm install')
    expect(pkgAfter.scripts.setup).toBe(
      'pnpm run install-dependencies && pnpm run setup:db && pnpm run build:local && pnpm run protect-seeded-files',
    )
    expect(pkgAfter.scripts['appraisejs:setup']).toBe('pnpm run setup')
    expect(pkgAfter.scripts['appraisejs:sync']).toBe('pnpm run sync-all')
    expect(pkgAfter.scripts['generate-db-client']).toContain('pnpm exec ')
    expect(pkgAfter.scripts['generate-db-client']).not.toContain('npx ')
    expect(pkgAfter.scripts['protect-seeded-files']).toContain('pnpm exec ')
    expect(pkgAfter.scripts['setup-env']).toContain('pnpm exec ')
    expect(pkgAfter.scripts['setup-env']).not.toContain('npx ')
    expect(pkgAfter.scripts['sync-all']).toContain('pnpm exec ')
    expect(pkgAfter.scripts['install-playwright']).toContain('pnpm exec ')
    expect(pkgAfter.scripts['install-playwright']).not.toContain('npx ')
  })

  it('patchPackageJsonScripts rewrites npx-using scripts for bun', async () => {
    const templatePath = getTemplatePath()
    if (!(await fs.pathExists(templatePath))) {
      console.warn('Skipping E2E: template not found (run npm run build first)')
      return
    }

    const { copyTemplate } = await import('./copy-template.js')
    await copyTemplate(destDir, undefined, undefined, 'npm')

    await patchPackageJsonScripts(destDir, 'bun')

    const pkgAfter = await fs.readJson(path.join(destDir, 'package.json'))
    expect(pkgAfter.scripts['protect-seeded-files']).toContain('bunx ')
    expect(pkgAfter.scripts['setup-env']).toContain('bunx ')
    expect(pkgAfter.scripts['sync-all']).toContain('bunx ')
    expect(pkgAfter.scripts['install-playwright']).toContain('bunx ')
    expect(pkgAfter.scripts['protect-seeded-files']).not.toContain('npx ')
    expect(pkgAfter.scripts['setup-env']).not.toContain('npx ')
  })
})
