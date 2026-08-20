import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { describe, it, expect } from 'vitest'
import { getInstallCommand, getPlaywrightInstallCommand, patchPackageJsonScripts } from './install.js'

const TEMPLATE_SCRIPTS = {
  'install-dependencies': 'npm install --legacy-peer-deps',
  setup: 'npm run install-dependencies && npm run setup:db && npm run build:local && npm run protect-seeded-files',
  'appraisejs:setup': 'npm run setup',
  'appraisejs:sync': 'npm run sync-step-definitions',
  'build:local':
    'npm run generate-db-client && npm run build:cucumber-runtime && npm run build:locator-picker-companion && next build',
  'protect-seeded-files': 'npx tsx scripts/protect-seeded-files.ts',
  'setup-env': 'npx tsx scripts/setup-env.ts',
  'generate-db-client': 'npx prisma generate --schema prisma/schema.prisma',
  'migrate-db': 'npx prisma migrate deploy',
  'install-playwright': 'npx playwright install',
  'setup:db': 'npm run setup-env && npm run generate-db-client && npm run migrate-db && npm run sync-step-definitions',
  'setup:full': 'npm run install-dependencies && npm run setup:db && npm run build:local',
  'sync-step-definitions': 'npx tsx scripts/sync-step-definitions.ts',
}

async function patchAndRead(dir: string, pm: 'npm' | 'pnpm' | 'yarn' | 'bun') {
  await fs.writeJson(path.join(dir, 'package.json'), { name: 'appraisejs', scripts: { ...TEMPLATE_SCRIPTS } })
  await patchPackageJsonScripts(dir, pm)
  return fs.readJson(path.join(dir, 'package.json'))
}

describe('patchPackageJsonScripts', () => {
  it('rewrites package.json scripts to use pnpm instead of npm', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-'))
    try {
      const pkg = await patchAndRead(dir, 'pnpm')
      expect(pkg.scripts['install-dependencies']).toBe('pnpm install')
      expect(pkg.scripts.setup).toBe(
        'pnpm run install-dependencies && pnpm run setup:db && pnpm run build:local && pnpm run protect-seeded-files',
      )
      expect(pkg.scripts['appraisejs:setup']).toBe('pnpm run setup')
      expect(pkg.scripts['appraisejs:sync']).toBe('pnpm run sync-step-definitions')
      expect(pkg.scripts['build:local']).toBe(
        'pnpm run generate-db-client && pnpm run build:cucumber-runtime && pnpm run build:locator-picker-companion && next build',
      )
      expect(pkg.scripts['protect-seeded-files']).toBe('pnpm exec tsx scripts/protect-seeded-files.ts')
      expect(pkg.scripts['setup-env']).toBe('pnpm exec tsx scripts/setup-env.ts')
      expect(pkg.scripts['generate-db-client']).toBe('pnpm exec prisma generate --schema prisma/schema.prisma')
      expect(pkg.scripts['migrate-db']).toBe('pnpm exec prisma migrate deploy')
      expect(pkg.scripts['install-playwright']).toBe('pnpm exec playwright install')
      expect(pkg.scripts['setup:db']).toBe(
        'pnpm run setup-env && pnpm run generate-db-client && pnpm run migrate-db && pnpm run sync-step-definitions',
      )
      expect(pkg.scripts['setup:full']).toBe(
        'pnpm run install-dependencies && pnpm run setup:db && pnpm run build:local',
      )
      expect(pkg.scripts['sync-step-definitions']).toBe('pnpm exec tsx scripts/sync-step-definitions.ts')
      expect(pkg.scripts['setup-env']).not.toContain('npx ')
    } finally {
      await fs.remove(dir).catch(() => {})
    }
  })

  it('rewrites scripts for npm (keeps legacy-peer-deps and npx)', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-npm-'))
    try {
      const pkg = await patchAndRead(dir, 'npm')
      expect(pkg.scripts['install-dependencies']).toBe('npm install --legacy-peer-deps')
      expect(pkg.scripts.setup).toContain('npm run install-dependencies')
      expect(pkg.scripts.setup).toContain('npm run setup:db')
      expect(pkg.scripts.setup).toContain('npm run protect-seeded-files')
      expect(pkg.scripts.setup).not.toContain('pnpm run')
      expect(pkg.scripts['build:local']).toContain('npm run build:locator-picker-companion')
      expect(pkg.scripts['protect-seeded-files']).toBe('npx tsx scripts/protect-seeded-files.ts')
      expect(pkg.scripts['setup-env']).toContain('npx ')
      expect(pkg.scripts['setup-env']).toBe('npx tsx scripts/setup-env.ts')
      expect(pkg.scripts['generate-db-client']).toBe('npx prisma generate --schema prisma/schema.prisma')
      expect(pkg.scripts['sync-step-definitions']).toBe('npx tsx scripts/sync-step-definitions.ts')
    } finally {
      await fs.remove(dir).catch(() => {})
    }
  })

  it('rewrites scripts for yarn', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-yarn-'))
    try {
      const pkg = await patchAndRead(dir, 'yarn')
      expect(pkg.scripts['install-dependencies']).toBe('yarn install')
      expect(pkg.scripts.setup).toBe(
        'yarn run install-dependencies && yarn run setup:db && yarn run build:local && yarn run protect-seeded-files',
      )
      expect(pkg.scripts['appraisejs:setup']).toBe('yarn run setup')
      expect(pkg.scripts['protect-seeded-files']).toBe('yarn run tsx scripts/protect-seeded-files.ts')
      expect(pkg.scripts['setup-env']).toBe('yarn run tsx scripts/setup-env.ts')
      expect(pkg.scripts['generate-db-client']).toBe('yarn run prisma generate --schema prisma/schema.prisma')
      expect(pkg.scripts['install-playwright']).toBe('yarn run playwright install')
      expect(pkg.scripts['sync-step-definitions']).not.toContain('npx ')
    } finally {
      await fs.remove(dir).catch(() => {})
    }
  })

  it('rewrites scripts for bun', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-patch-bun-'))
    try {
      const pkg = await patchAndRead(dir, 'bun')
      expect(pkg.scripts['install-dependencies']).toBe('bun install')
      expect(pkg.scripts.setup).toContain('bun run install-dependencies')
      expect(pkg.scripts.setup).toContain('bun run setup:db')
      expect(pkg.scripts.setup).toContain('bun run protect-seeded-files')
      expect(pkg.scripts['appraisejs:sync']).toBe('bun run sync-step-definitions')
      expect(pkg.scripts['protect-seeded-files']).toBe('bunx tsx scripts/protect-seeded-files.ts')
      expect(pkg.scripts['setup-env']).toBe('bunx tsx scripts/setup-env.ts')
      expect(pkg.scripts['generate-db-client']).toBe('bunx prisma generate --schema prisma/schema.prisma')
      expect(pkg.scripts['migrate-db']).toBe('bunx prisma migrate deploy')
      expect(pkg.scripts['sync-step-definitions']).toContain('bunx ')
      expect(pkg.scripts['sync-step-definitions']).not.toContain('npx ')
    } finally {
      await fs.remove(dir).catch(() => {})
    }
  })

  it('no-ops when package.json does not exist', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'create-appraisejs-noop-'))
    try {
      await patchPackageJsonScripts(dir, 'yarn')
      await expect(fs.pathExists(path.join(dir, 'package.json'))).resolves.toBe(false)
    } finally {
      await fs.remove(dir).catch(() => {})
    }
  })
})

describe('getInstallCommand', () => {
  it('returns npm run setup for npm', () => {
    const result = getInstallCommand('npm')
    expect(result).toEqual({ command: 'npm', args: ['run', 'setup'] })
    expect(`${result.command} ${result.args.join(' ')}`).toBe('npm run setup')
  })

  it('returns pnpm run setup for pnpm', () => {
    const result = getInstallCommand('pnpm')
    expect(result).toEqual({ command: 'pnpm', args: ['run', 'setup'] })
    expect(`${result.command} ${result.args.join(' ')}`).toBe('pnpm run setup')
  })

  it('returns yarn run setup for yarn', () => {
    const result = getInstallCommand('yarn')
    expect(result).toEqual({ command: 'yarn', args: ['run', 'setup'] })
    expect(`${result.command} ${result.args.join(' ')}`).toBe('yarn run setup')
  })

  it('returns bun run setup for bun', () => {
    const result = getInstallCommand('bun')
    expect(result).toEqual({ command: 'bun', args: ['run', 'setup'] })
    expect(`${result.command} ${result.args.join(' ')}`).toBe('bun run setup')
  })

  it('returns package-manager specific playwright install commands', () => {
    expect(getPlaywrightInstallCommand('npm', ['chromium', 'firefox'])).toEqual({
      command: 'npm',
      args: ['run', 'install-playwright', '--', 'chromium', 'firefox'],
    })
    expect(getPlaywrightInstallCommand('pnpm', [])).toEqual({
      command: 'pnpm',
      args: ['run', 'install-playwright', '--'],
    })
  })
})
