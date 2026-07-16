import { describe, expect, it, vi } from 'vitest'

import { evaluateReleaseLedger, runVerifiedFindingCommands, validateReleaseLedger } from './release-readiness.mjs'

function finding(index: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `A-${String(index).padStart(2, '0')}`,
    severity: index <= 2 ? 'critical' : index <= 8 ? 'high' : 'medium',
    title: `Finding ${index}`,
    owner: 'release-owner',
    status: 'open',
    releaseBlocking: true,
    verificationCommands: [`npm run verify:${index}`],
    requiredEvidence: [`Evidence ${index}`],
    ...overrides,
  }
}

function ledger(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    blockingSeverities: ['critical', 'high'],
    findings: Array.from({ length: 13 }, (_, index) => finding(index + 1)),
    ...overrides,
  }
}

describe('release-readiness ledger', () => {
  it('requires the complete A-01 through A-13 inventory and named evidence', () => {
    expect(validateReleaseLedger(ledger())).toEqual([])
    expect(validateReleaseLedger(ledger({ findings: [finding(1, { requiredEvidence: [] })] }))).toEqual(
      expect.arrayContaining(['A-01: requiredEvidence must contain named evidence', 'A-13: finding is missing']),
    )
  })

  it('keeps release blocking while an owned finding is open', () => {
    const result = evaluateReleaseLedger(ledger())
    expect(result.ok).toBe(false)
    expect(result.blockingFindings).toHaveLength(13)
  })

  it('rejects undocumented or expired waivers', () => {
    const findings = Array.from({ length: 13 }, (_, index) => finding(index + 1))
    findings[0] = finding(1, {
      status: 'waived',
      waiver: { owner: 'security', rationale: 'Temporary', expiresOn: '2025-01-01', review: '' },
    })
    expect(validateReleaseLedger(ledger({ findings }), { now: new Date('2026-07-16T00:00:00Z') })).toEqual(
      expect.arrayContaining(['A-01: waiver.review must be a non-empty string', 'A-01: waiver expired on 2025-01-01']),
    )
  })

  it('deduplicates and runs only commands for verified findings', () => {
    const findings = Array.from({ length: 13 }, (_, index) => finding(index + 1))
    findings[0] = finding(1, { status: 'verified', verificationCommands: ['npm run shared-check'] })
    findings[1] = finding(2, { status: 'verified', verificationCommands: ['npm run shared-check'] })
    const runner = vi.fn().mockReturnValue({ status: 0, stdout: 'ok', stderr: '' })

    expect(runVerifiedFindingCommands(ledger({ findings }), { runner })).toEqual([
      expect.objectContaining({ command: 'npm run shared-check', status: 0 }),
    ])
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(
      'npm run shared-check',
      expect.objectContaining({ maxBuffer: 32 * 1024 * 1024 }),
    )
  })
})
