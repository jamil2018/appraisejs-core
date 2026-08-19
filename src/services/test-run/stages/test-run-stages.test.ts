import { describe, expect, it, vi } from 'vitest'

import { collectRunOutput, resolveCollectedRunOutcome } from './collect-run-evidence'
import { executeRun } from './execute-run'

describe('test-run stages', () => {
  it('returns the executor stage result unchanged', async () => {
    const result = { process: { name: 'run' }, reportPath: '/tmp/report.json' }
    await expect(executeRun({ launch: vi.fn().mockResolvedValue(result) })).resolves.toBe(result)
  })

  it('normalizes output in stable order and resolves terminal outcomes', () => {
    const logger = { info: vi.fn(), error: vi.fn() }
    const result = collectRunOutput(
      {
        output: { stdout: ['one\ntwo\n'], stderr: ['bad\n'] },
        startTime: new Date('2026-01-01T00:00:00.000Z'),
        endTime: new Date('2026-01-01T00:00:01.000Z'),
      } as never,
      0,
      logger,
    )
    expect(result.logEntries.map(entry => [entry.type, entry.message])).toEqual([
      ['stdout', 'one'],
      ['stdout', 'two'],
      ['stderr', 'bad'],
      ['status', 'Process exited with code 0'],
    ])
    expect(resolveCollectedRunOutcome({ cancelled: false, blocked: false, exitCode: 0, evidenceHealth: 'valid' })).toBe(
      'passed',
    )
    expect(resolveCollectedRunOutcome({ cancelled: true, blocked: true, exitCode: 0, evidenceHealth: 'valid' })).toBe(
      'cancelled',
    )
    expect(resolveCollectedRunOutcome({ cancelled: false, blocked: true, exitCode: 1, evidenceHealth: 'valid' })).toBe(
      'blocked',
    )
    expect(
      resolveCollectedRunOutcome({
        cancelled: false,
        blocked: true,
        exitCode: 1,
        evidenceHealth: 'invalid_missing_report',
      }),
    ).toBe('blocked')
    expect(resolveCollectedRunOutcome({ cancelled: false, blocked: false, exitCode: 1, evidenceHealth: 'valid' })).toBe(
      'failed',
    )
  })
})
