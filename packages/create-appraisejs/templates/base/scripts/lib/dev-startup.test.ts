import { describe, expect, it, vi } from 'vitest'

import { ensureDevDatabaseReady } from './dev-startup.mjs'

describe('dev database readiness', () => {
  it('deploys pending migrations before development services start', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0 })

    ensureDevDatabaseReady('npm', { cwd: '/appraise', env: {}, spawnSync, stdio: 'pipe' })

    expect(spawnSync).toHaveBeenCalledWith('npm', ['run', 'migrate-db'], {
      cwd: '/appraise',
      env: {},
      stdio: 'pipe',
    })
  })

  it('stops startup when migration deployment fails', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 1 })

    expect(() => ensureDevDatabaseReady('npm', { cwd: '/appraise', env: {}, spawnSync, stdio: 'pipe' })).toThrow(
      'Database migration readiness failed with code 1.',
    )
  })
})
