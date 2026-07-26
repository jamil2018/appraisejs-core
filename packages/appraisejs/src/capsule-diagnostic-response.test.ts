import { describe, expect, it } from 'vitest'
import { applyCapsuleDiagnosticMode } from './mcp.js'

const diagnostic = {
  schemaVersion: '1',
  run: { runId: 'run', testRunStatus: 'COMPLETED' },
  ownership: { targetProjectId: 'project', commandReceiptHash: 'secret-hash' },
  attempt: { state: 'FAILED' },
  command: { sealed: true },
  identities: { node: { version: '1' } },
  preflight: {
    status: 'blocked',
    failureOutput: { stdout: [], stderr: ['Undefined step: I create a note'], truncated: false },
  },
  blockers: [{ code: 'FILE_MISSING', recoveryAction: 'RETRY_PREFLIGHT' }],
  evidence: {
    failureSignatures: ['Expected HomeChores but found SecondWife'],
    links: { run: '/test-runs/run', logs: '/api/test-runs/run/logs' },
  },
  nextRecoveryAction: { code: 'RETRY_PREFLIGHT' },
  storedPath: '/must/not/escape',
  rawReceipt: { executable: '/secret/node' },
}

describe('capsule diagnostic response modes', () => {
  it.each(['summary', 'evidenceOnly', 'blockersOnly', 'linksOnly'] as const)('projects and redacts %s', mode => {
    const projected = applyCapsuleDiagnosticMode(diagnostic, mode)
    expect(JSON.stringify(projected)).not.toContain('storedPath')
    expect(JSON.stringify(projected)).not.toContain('rawReceipt')
    expect(JSON.stringify(projected)).not.toContain('secret-hash')
  })
  it('keeps the exact nested DTO for full mode', () => {
    expect(applyCapsuleDiagnosticMode(diagnostic, 'full')).toBe(diagnostic)
  })
  it('keeps bounded preflight output in blockers-only mode', () => {
    expect(applyCapsuleDiagnosticMode(diagnostic, 'blockersOnly')).toMatchObject({
      failureOutput: { stderr: ['Undefined step: I create a note'], truncated: false },
    })
  })
})
