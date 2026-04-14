import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRequestedSyncExecutionOrder } from '@/lib/sync/sync-registry'

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

import { execa } from 'execa'
import { runRequestedSync } from './sync-executor'

describe('runRequestedSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('executes requested sync scripts in dependency order', async () => {
    vi.mocked(execa).mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    } as never)

    const result = await runRequestedSync('sync-test-cases')

    expect(result).toMatchObject({
      requestedScriptId: 'sync-test-cases',
      executedScriptIds: resolveRequestedSyncExecutionOrder('sync-test-cases'),
      success: true,
    })
    expect(execa).toHaveBeenCalledTimes(resolveRequestedSyncExecutionOrder('sync-test-cases').length)
  })

  it('stops on the first failing script and reports the parsed cause', async () => {
    vi.mocked(execa)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'modules synced',
        stderr: '',
      } as never)
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'tags synced',
        stderr: '',
      } as never)
      .mockResolvedValueOnce({
        exitCode: 2,
        stdout: '',
        stderr: '\u001b[31mError: Missing suite definitions\u001b[39m',
      } as never)

    const result = await runRequestedSync('sync-test-cases')

    expect(result).toMatchObject({
      requestedScriptId: 'sync-test-cases',
      success: false,
      failedScriptId: 'sync-test-suites',
      exitCode: 2,
      executedScriptIds: ['sync-modules', 'sync-tags', 'sync-test-suites'],
      cause: 'Missing suite definitions',
    })
  })

  it('returns a failure result when the sync process throws', async () => {
    vi.mocked(execa).mockRejectedValue(new Error('spawn EACCES'))

    const result = await runRequestedSync('sync-modules')

    expect(result).toMatchObject({
      requestedScriptId: 'sync-modules',
      success: false,
      failedScriptId: 'sync-modules',
      executedScriptIds: ['sync-modules'],
      cause: 'spawn EACCES',
    })
  })
})
