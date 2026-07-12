import { describe, expect, it, vi } from 'vitest'
import { runTestRunDiagnose } from './test-run-diagnose-cli.js'

const ready = {
  kind: 'capsule',
  diagnostic: {
    schemaVersion: '1',
    preflight: { status: 'ready' },
    blockers: [],
    nextRecoveryAction: { code: 'RUN_CAPSULE' },
    storedPath: '/secret/runtime',
  },
}

describe('test-run diagnose CLI presentation', () => {
  it('prints the exact diagnostic DTO in JSON mode', async () => {
    const lines: string[] = []
    const result = await runTestRunDiagnose(
      { runId: 'run-1', json: true },
      { diagnose: vi.fn().mockResolvedValue(ready), write: value => lines.push(value) },
    )
    expect(JSON.parse(lines.join('\n'))).toEqual(ready.diagnostic)
    expect(result.exitCode).toBe(0)
  })

  it('prints bounded ready output without leaking unselected diagnostic fields', async () => {
    const lines: string[] = []
    await runTestRunDiagnose(
      { runId: 'run-1', json: false },
      { diagnose: vi.fn().mockResolvedValue(ready), write: value => lines.push(value) },
    )
    expect(lines).toEqual(['Run run-1: capsule', 'Status: ready', 'Next: RUN_CAPSULE'])
    expect(lines.join('\n')).not.toContain('/secret/runtime')
  })

  it('returns exit 2 for recoverable blocked diagnostics and bounds redacted blockers', async () => {
    const lines: string[] = []
    const blockers = Array.from({ length: 20 }, (_, index) => ({
      code: `FILE_${index}`,
      message: index === 0 ? `missing ${'x'.repeat(500)}` : 'missing',
      recoveryAction: 'RETRY_PREFLIGHT',
      rawReceipt: 'secret-token',
      storedPath: '/secret/path',
    }))
    const result = await runTestRunDiagnose(
      { runId: 'run-2', json: false },
      {
        diagnose: vi.fn().mockResolvedValue({
          kind: 'capsule',
          diagnostic: { preflight: { status: 'blocked' }, blockers, nextRecoveryAction: { code: 'RETRY_PREFLIGHT' } },
        }),
        write: value => lines.push(value),
      },
    )
    expect(result.exitCode).toBe(2)
    expect(lines.slice(0, 3)).toEqual(['Run run-2: capsule', 'Status: blocked', 'Next: RETRY_PREFLIGHT'])
    expect(lines).toHaveLength(19)
    expect(Math.max(...lines.map(line => line.length))).toBeLessThan(520)
    expect(lines.join('\n')).not.toMatch(/secret-token|secret\/path|rawReceipt|storedPath/)
  })

  it('returns exit 2 when blockers exist even without a blocked preflight', async () => {
    const result = await runTestRunDiagnose(
      { runId: 'manual-run', json: true },
      {
        diagnose: vi.fn().mockResolvedValue({ evidence: { blockers: [{ code: 'INVALID_EVIDENCE' }] } }),
        write: vi.fn(),
      },
    )
    expect(result.exitCode).toBe(2)
  })

  it('propagates transport failures for the CLI error boundary to map to exit 1', async () => {
    const transportError = new Error('transport failed')
    await expect(
      runTestRunDiagnose(
        { runId: 'run-3', json: true },
        { diagnose: vi.fn().mockRejectedValue(transportError), write: vi.fn() },
      ),
    ).rejects.toBe(transportError)
  })
})
