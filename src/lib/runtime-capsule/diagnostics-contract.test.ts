import { describe, expect, it } from 'vitest'
import { runtimeCapsuleDiagnosticV1Schema } from './diagnostics-contract'

const h = `sha256:${'a'.repeat(64)}`
const diagnostic = {
  schemaVersion: '1',
  run: {
    runId: 'run',
    testRunStatus: 'RUNNING',
    result: 'PENDING',
    evidenceHealth: 'invalid_missing_report',
    active: true,
    processRegistered: false,
    startedAt: '2026-07-12T00:00:00.000Z',
  },
  ownership: {
    targetProjectId: 'project',
    validationHash: h,
    capsuleHash: h,
    commandReceiptHash: h,
    attemptId: 'attempt',
  },
  attempt: { state: 'RUNNING', active: true },
  command: {
    sealed: true,
    receiptKind: 'appraise.capsule-command',
    executionProfile: 'default',
    preflightProfile: 'preflight',
    browser: 'chromium',
    expectedCaseCount: 1,
  },
  identities: {
    node: { version: '1', platform: 'darwin', arch: 'arm64', contentHash: h },
    cucumber: { packageName: '@cucumber/cucumber', version: '1', contentHash: h, singletonKey: h },
    appraiseRuntime: { packageName: '@appraise/cucumber-runtime', version: '1', contentHash: h },
    compiler: {
      kind: 'precompiled-js',
      typescriptVersion: '1',
      declarationBundleHash: h,
      extensionCompilerVersion: '1',
    },
  },
  preflight: { status: 'ready', checkedAt: '2026-07-12T00:00:00.000Z', checks: [] },
  blockers: [],
  evidence: {
    expectedCaseCount: 1,
    matchedCaseCount: 0,
    scenarioCount: 0,
    failureSignatures: [],
    links: { run: '/test-runs/run', logs: '/logs/run' },
  },
  nextRecoveryAction: { code: 'WAIT_FOR_RUN', tool: 'test_run_read', reason: 'The managed run is still active.' },
} as const

describe('runtime capsule diagnostic contract', () => {
  it('accepts the bounded projection and rejects raw secret-bearing diagnostic fields', () => {
    expect(runtimeCapsuleDiagnosticV1Schema.parse(diagnostic)).toEqual(diagnostic)
    expect(
      runtimeCapsuleDiagnosticV1Schema.safeParse({
        ...diagnostic,
        argv: ['/Users/private'],
        env: { TOKEN: 'secret' },
        failure: 'stack',
      }).success,
    ).toBe(false)
  })

  it('bounds blocker and check collections', () => {
    expect(
      runtimeCapsuleDiagnosticV1Schema.safeParse({
        ...diagnostic,
        blockers: Array.from({ length: 17 }, () => ({ code: 'ATTEMPT_FAILED', recoveryAction: 'RETRY_MANAGED_RUN' })),
      }).success,
    ).toBe(false)
    expect(
      runtimeCapsuleDiagnosticV1Schema.safeParse({
        ...diagnostic,
        preflight: {
          ...diagnostic.preflight,
          checks: Array.from({ length: 14 }, () => ({ stage: 'receipt', status: 'passed', code: 'CHECK_PASSED' })),
        },
      }).success,
    ).toBe(false)
  })
})
