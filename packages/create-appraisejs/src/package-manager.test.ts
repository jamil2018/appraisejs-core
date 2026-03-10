import { describe, expect, it } from 'vitest'
import { getPackageManagerProfile, rewriteScriptsForPackageManager } from './package-manager.js'

const TEMPLATE_SCRIPTS = {
  'install-dependencies': 'npm install --legacy-peer-deps',
  setup: 'npm run install-dependencies && npm run setup-env && npm run build:local',
  'appraisejs:setup': 'npm run setup',
  'appraisejs:sync': 'npm run sync-all',
  'build:local': 'npm run build:cucumber-runtime && next build',
  'setup-env': 'npx tsx scripts/setup-env.ts',
  'migrate-db': 'npx prisma migrate deploy',
  'install-playwright': 'npx playwright install',
  'setup:db': 'npm run setup-env && npm run migrate-db && npm run sync-all',
  'setup:full': 'npm run install-dependencies && npm run setup:db && npm run build:local',
  'sync-all': 'npx tsx scripts/sync-all.ts',
}

describe('getPackageManagerProfile', () => {
  it('returns the expected prefixes for pnpm', () => {
    expect(getPackageManagerProfile('pnpm')).toEqual({
      command: 'pnpm',
      installDependenciesScript: 'pnpm install',
      runPrefix: 'pnpm run',
      execPrefix: 'pnpm exec ',
    })
  })
})

describe('rewriteScriptsForPackageManager', () => {
  it('rewrites scripts for pnpm', () => {
    const scripts = rewriteScriptsForPackageManager(TEMPLATE_SCRIPTS, 'pnpm')

    expect(scripts['install-dependencies']).toBe('pnpm install')
    expect(scripts.setup).toBe('pnpm run install-dependencies && pnpm run setup-env && pnpm run build:local')
    expect(scripts['appraisejs:setup']).toBe('pnpm run setup')
    expect(scripts['appraisejs:sync']).toBe('pnpm run sync-all')
    expect(scripts['setup-env']).toBe('pnpm exec tsx scripts/setup-env.ts')
    expect(scripts['install-playwright']).toBe('pnpm exec playwright install')
  })

  it('rewrites scripts for yarn', () => {
    const scripts = rewriteScriptsForPackageManager(TEMPLATE_SCRIPTS, 'yarn')

    expect(scripts['install-dependencies']).toBe('yarn install')
    expect(scripts.setup).toBe('yarn run install-dependencies && yarn run setup-env && yarn run build:local')
    expect(scripts['setup-env']).toBe('yarn run tsx scripts/setup-env.ts')
    expect(scripts['install-playwright']).toBe('yarn run playwright install')
  })

  it('rewrites scripts for bun', () => {
    const scripts = rewriteScriptsForPackageManager(TEMPLATE_SCRIPTS, 'bun')

    expect(scripts['install-dependencies']).toBe('bun install')
    expect(scripts['setup-env']).toBe('bunx tsx scripts/setup-env.ts')
    expect(scripts['migrate-db']).toBe('bunx prisma migrate deploy')
    expect(scripts['sync-all']).toBe('bunx tsx scripts/sync-all.ts')
  })
})
