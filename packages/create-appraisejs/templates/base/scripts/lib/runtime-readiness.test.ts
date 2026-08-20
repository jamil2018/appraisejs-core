import { describe, expect, it, vi } from 'vitest'

import { ensureCucumberRuntimeReadiness } from './runtime-readiness.mjs'

describe('Cucumber runtime readiness', () => {
  it('does not rebuild an existing runtime entrypoint', () => {
    const spawnSync = vi.fn()
    expect(ensureCucumberRuntimeReadiness('npm', { cwd: '/repo', existsSync: () => true, spawnSync })).toMatchObject({
      built: false,
    })
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('builds a missing runtime entrypoint before startup', () => {
    const spawnSync = vi.fn().mockReturnValue({ status: 0 })
    const existsSync = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
    expect(ensureCucumberRuntimeReadiness('npm', { cwd: '/repo', existsSync, spawnSync, stdio: 'pipe' })).toMatchObject(
      { built: true },
    )
    expect(spawnSync).toHaveBeenCalledWith(
      'npm',
      ['run', 'build:cucumber-runtime'],
      expect.objectContaining({ cwd: '/repo', stdio: 'pipe' }),
    )
  })

  it('fails startup if the runtime build does not produce its entrypoint', () => {
    expect(() =>
      ensureCucumberRuntimeReadiness('npm', {
        cwd: '/repo',
        existsSync: () => false,
        spawnSync: () => ({ status: 0 }),
        stdio: 'pipe',
      }),
    ).toThrow('did not produce')
  })
})
