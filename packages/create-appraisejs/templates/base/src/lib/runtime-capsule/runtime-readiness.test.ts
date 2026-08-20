import { describe, expect, it, vi } from 'vitest'

import { assertManagedRuntimeReady, managedRuntimeArtifactPaths } from './runtime-readiness'

describe('managed runtime readiness', () => {
  it('checks both runtime entrypoints before execution', async () => {
    const stat = vi.fn().mockResolvedValue({ isFile: () => true })
    await expect(assertManagedRuntimeReady('/repo', stat)).resolves.toEqual([
      '/repo/packages/cucumber-runtime/dist/index.js',
      '/repo/packages/cucumber-runtime/dist/hooks.js',
    ])
    expect(stat).toHaveBeenCalledTimes(2)
  })

  it('returns bounded recovery guidance when runtime artifacts are absent', async () => {
    await expect(assertManagedRuntimeReady('/repo', vi.fn().mockRejectedValue(new Error('missing')))).rejects.toThrow(
      'npm run build:cucumber-runtime',
    )
    expect(managedRuntimeArtifactPaths('/repo')).toHaveLength(2)
  })

  it('rejects directories at runtime artifact paths', async () => {
    await expect(
      assertManagedRuntimeReady('/repo', vi.fn().mockResolvedValue({ isFile: () => false })),
    ).rejects.toThrow('npm run build:cucumber-runtime')
  })
})
