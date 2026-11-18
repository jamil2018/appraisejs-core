import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeNativeCredential } from '@/lib/quality-journey/codex-app-server/native-credential-topology'
import {
  createOriginalNativeCaseControl,
  driverDigest,
} from '../../../tasks/codex-app-server-journeys/m13-runtime/c1/native-driver-control.mts'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { prepareReviewedC1Task } from '../../../tasks/codex-app-server-journeys/m13-runtime/c1/runner.mts'

const boundary = vi.hoisted(() => ({ profile: vi.fn(), inspectPlan: vi.fn(), compose: vi.fn() }))
vi.mock('@/lib/quality-journey/codex-app-server/native-outcome-profile', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/quality-journey/codex-app-server/native-outcome-profile')>()),
  inspectNativeOutcomeProfile: boundary.profile,
}))
vi.mock('@/lib/quality-journey/codex-app-server/native-qualification-contract', () => ({
  nativeQualificationSourceFiles: () => [],
  inspectNativeQualificationPlan: boundary.inspectPlan,
  nativeQualificationDigest: (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`,
}))
vi.mock('../../../tasks/codex-app-server-journeys/m13-runtime/c0/inputs.mts', () => ({
  requiredC0TaskInputPaths: () => [],
}))
vi.mock('./quality-journey-native-qualification', () => ({ createNativeQualityJourneyQualification: boundary.compose }))
const roots: string[] = []
afterEach(() => {
  vi.clearAllMocks()
  roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true }))
})
async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'appraise-c1-task-'))
  roots.push(root)
  const profile = {},
    plan = {},
    control = { reviewerId: 'reviewer', nonce: 'nonce', reviewMs: 10000, reconciliationMs: 1000 }
  const manifest = {
    repositoryRoot: root,
    inputs: [],
    freshRoot: path.join(root, 'native'),
    campaignId: 'case',
    allowance: { consumingTurns: 1 },
    limits: { caseMs: 10000, cleanupMs: 1000 },
  }
  const record = {
    plan,
    profileDigest: `sha256:${'a'.repeat(64)}`,
    reviewControlDigest: `sha256:${createHash('sha256').update(canonicalContractJson(control)).digest('hex')}`,
  }
  boundary.profile.mockReturnValue(record)
  boundary.inspectPlan.mockReturnValue({ manifest })
  const owner = { freezeCandidate: vi.fn().mockResolvedValue({ candidateDigest: 'digest' }), revoke: vi.fn() }
  const composition = {
    start: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({ state: 'stopped', cleanup: { status: 'stopped' } }),
    snapshot: () => ({ state: 'stopped', originalStartState: 'FULFILLED' }),
    originalNativeOutcome: () => owner,
    disconnectOriginalSupervisor: vi.fn(),
    waitOriginalStop: vi.fn().mockResolvedValue({}),
    readAcceptedManagedDelivery: vi.fn(),
  }
  boundary.compose.mockResolvedValue(composition)
  const provided = {
    plan,
    nativeOutcome: { profile, database: {}, reviewControl: control },
    approvalEvidence: `sha256:${'b'.repeat(64)}`,
    evidenceDirectory: root,
  }
  const task = await prepareReviewedC1Task(provided as never, {} as never)
  return { task, composition, owner, profile, plan, provided, root, record }
}
describe('C1 task original pin and stop boundaries with inert composition', () => {
  it('rechecks the original profile before spend/canonical start and cannot borrow a caller replacement', async () => {
    const f = await fixture(),
      replacement = {}
    f.provided.nativeOutcome.profile = replacement
    f.provided.nativeOutcome.reviewControl.reviewMs = 99999
    boundary.profile.mockImplementation(candidate => {
      if (candidate === f.profile) throw new Error('frozen source changed')
      return f.record
    })
    expect(() => f.task.start()).toThrow(/frozen source changed/)
    expect(existsSync(f.task.evidencePath)).toBe(false)
    expect(f.composition.start).not.toHaveBeenCalled()
    expect(readFileSync(path.join(f.root, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).toContain(
      '"stage":"CASE_FAILURE","status":"UNKNOWN"',
    )
    expect(boundary.profile).toHaveBeenLastCalledWith(f.profile)
    await f.task.cancel()
  })
  it.each([
    [
      { valid: false, reason: 'FEATURE_CONTROL_UNVERIFIED', feature: 'shell_tool', rawResponse: 'private-response' },
      { valid: false, reason: 'FEATURE_CONTROL_UNVERIFIED', feature: 'shell_tool' },
    ],
    [
      { valid: false, reason: 'PUBLIC_CONTROLS_UNVERIFIED', privatePayload: 'private-inspection' },
      { valid: false, reason: 'PUBLIC_CONTROLS_UNVERIFIED' },
    ],
    [
      {
        valid: false,
        reason: 'UNEXPECTED_ACTIVE_CONFIGURATION',
        fields: ['headers', 'plugins', 'tools'],
        privatePayload: 'private-field-details',
      },
      { valid: false, reason: 'UNEXPECTED_ACTIVE_CONFIGURATION', fields: ['headers', 'plugins', 'tools'] },
    ],
    [null, null],
  ])(
    'persists only the curated configuration inspection on original start rejection: %j',
    async (inspection, expected) => {
      const f = await fixture()
      const rejection = new Error('private-error-message')
      const originalStart = Promise.reject(rejection)
      f.composition.start.mockReturnValue(originalStart)
      f.composition.snapshot = () => ({
        state: 'uncertain',
        originalStartState: 'REJECTED',
        configurationInspection: inspection,
        rawSnapshot: 'private-snapshot',
      })
      try {
        const started = f.task.start()
        expect(started).toBe(originalStart)
        await expect(started).rejects.toBe(rejection)
        expect(f.task.start()).toBe(originalStart)
        await new Promise<void>(resolve => setImmediate(resolve))
        const filename = path.join(f.root, 'case.c1-start-failure.json')
        const bytes = readFileSync(filename, 'utf8')
        expect(JSON.parse(bytes)).toEqual({
          version: 'M13_C1_START_FAILURE_V1',
          outcome: 'UNKNOWN',
          configurationInspection: expected,
        })
        expect(bytes).not.toMatch(/private-|rawResponse|privatePayload|rawSnapshot|message|stack/)
        expect(f.composition.start).toHaveBeenCalledOnce()
        expect(f.composition.waitOriginalStop).toHaveBeenCalledOnce()
        expect(readFileSync(path.join(f.root, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).toContain(
          '"stage":"CASE_CLOSE"',
        )
      } finally {
        await f.task.cancel()
      }
    },
  )
  it('preserves original rejection, stop, and diagnostic close when the failure observation cannot be written', async () => {
    const f = await fixture()
    const filename = path.join(f.root, 'case.c1-start-failure.json')
    writeFileSync(filename, 'original retained evidence', { flag: 'wx' })
    const rejection = new Error('private-error-never-retained')
    const originalStart = Promise.reject(rejection)
    let settleStop!: () => void
    const originalStop = new Promise<void>(resolve => {
      settleStop = resolve
    })
    f.composition.start.mockReturnValue(originalStart)
    f.composition.waitOriginalStop.mockReturnValue(originalStop as never)
    f.composition.snapshot = () => ({
      state: 'uncertain',
      originalStartState: 'REJECTED',
      configurationInspection: {
        valid: false,
        reason: 'UNEXPECTED_ACTIVE_CONFIGURATION',
        fields: ['plugins', 'tools'],
      },
      rawSnapshot: 'private-snapshot',
    })
    try {
      expect(f.task.start()).toBe(originalStart)
      await expect(originalStart).rejects.toBe(rejection)
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(f.composition.waitOriginalStop).toHaveBeenCalledOnce()
      expect(readFileSync(path.join(f.root, 'c1-acquisition-diagnostics.jsonl'), 'utf8')).not.toContain(
        '"stage":"CASE_CLOSE"',
      )
      settleStop()
      await originalStop
      await new Promise<void>(resolve => setImmediate(resolve))
      const trace = readFileSync(path.join(f.root, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
      expect(trace).toContain('"stage":"CASE_FAILURE","status":"UNKNOWN"')
      expect(trace).toContain('"stage":"CASE_CLOSE"')
      expect(trace).not.toMatch(/private-|rawSnapshot|message|stack/)
      expect(readFileSync(filename, 'utf8')).toBe('original retained evidence')
      expect(f.composition.start).toHaveBeenCalledOnce()
    } finally {
      settleStop()
      await f.task.cancel()
    }
    expect(f.composition.cancel).toHaveBeenCalledOnce()
  })
  it.each(['fulfilled', 'rejected'])('waits original stop %s before exposing a frozen candidate', async settlement => {
    const f = await fixture()
    await f.task.start()
    let resolve!: () => void, reject!: (reason: unknown) => void
    const original = new Promise<void>((done, failed) => {
      resolve = done
      reject = failed
    })
    f.composition.waitOriginalStop.mockReturnValue(original as never)
    const frozen = f.task.freezeCandidate()
    await Promise.resolve()
    expect(f.owner.freezeCandidate).not.toHaveBeenCalled()
    if (settlement === 'fulfilled') {
      resolve()
      await frozen
      expect(f.owner.freezeCandidate).toHaveBeenCalledOnce()
    } else {
      const refused = expect(frozen).rejects.toThrow('final persistence rejected')
      reject(new Error('final persistence rejected'))
      await refused
      expect(f.owner.freezeCandidate).not.toHaveBeenCalled()
    }
    expect(f.composition.start).toHaveBeenCalledOnce()
    await f.task.cancel()
  })
})

it.each(['ACQUISITION', 'TURN_REQUEST'] as const)(
  'retains durable %s diagnostics through original UNKNOWN control without replay or source disposal',
  async stage => {
    const f = await fixture()
    const diagnostics = boundary.compose.mock.calls[0][0].diagnostics
    const getters = vi.fn(() => {
      throw new Error('raw getter inspected')
    })
    const hostile = Object.create(null)
    for (const key of ['message', 'stack', 'cause', 'kind', 'pid', 'token'])
      Object.defineProperty(hostile, key, { enumerable: true, get: getters })
    f.composition.start.mockImplementation(() => {
      diagnostics.record('ACQUISITION', 'ENTERED')
      diagnostics.record('ACQUISITION', 'SETTLED')
      if (stage === 'TURN_REQUEST') diagnostics.record('TURN_REQUEST', 'ENTERED')
      return Promise.reject(hostile)
    })
    const credential = path.join(f.root, 'synthetic-auth.json')
    writeFileSync(credential, 'synthetic only', { mode: 0o600 })
    const source = describeNativeCredential(credential)
    const subjectDigest = driverDigest({ synthetic: true })
    const actualReviewPath = path.join(f.root, 'actual-review.txt')
    writeFileSync(actualReviewPath, 'Synthetic offline test only')
    // The control reader hashes the actual file bytes, using the same underlying SHA256 boundary.
    const hash = (bytes: string | Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
    const receipt = JSON.stringify({
      version: 'M13_NATIVE_DRIVER_CONTROL_V1',
      decision: 'ACCEPT',
      kind: 'CASE_PACKET',
      subjectDigest,
      reviewerId: 'synthetic-reviewer',
      actualReviewReceiptDigest: hash(readFileSync(actualReviewPath)),
    })
    const decisionPath = path.join(f.root, 'decision.json')
    writeFileSync(decisionPath, receipt)
    const disposed = vi.fn(),
      verify = vi.fn()
    const control = createOriginalNativeCaseControl({
      provenance: 'OFFLINE_SYNTHETIC',
      subjectDigest,
      source,
      leaseExpiresAt: Date.now() + 60000,
      toolName: 'synthetic',
      arguments: {},
      createOriginalTask: async () => f.task as never,
      verifyReconciled: verify,
      disposeOriginalSource: disposed,
    })
    const approval = { decisionPath, decisionDigest: hash(receipt), actualReviewPath }
    const originalStart = control.startVerifiedCase(approval)
    await expect(originalStart).rejects.toThrow('Original native-driver case remains UNKNOWN')
    expect(control.startVerifiedCase(approval)).toBe(originalStart)
    await expect(control.startVerifiedCase(approval)).rejects.toThrow(/UNKNOWN/)
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(f.composition.start).toHaveBeenCalledOnce()
    expect(control.snapshot()).toMatchObject({
      phase: 'UNKNOWN',
      sourceDisposalEntered: false,
      sourceDisposed: false,
      runtimeQualified: false,
      physicalQualified: false,
    })
    expect(disposed).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect(getters).not.toHaveBeenCalled()
    const trace = readFileSync(path.join(f.root, 'c1-acquisition-diagnostics.jsonl'), 'utf8')
    expect(trace).toContain(`"stage":"${stage}","status":"ENTERED"`)
    expect(trace).toContain('"stage":"CASE_FAILURE","status":"UNKNOWN"')
    expect(trace).not.toMatch(/raw getter|token|pid|synthetic-auth|snapshot/)
    expect(JSON.parse(readFileSync(f.task.evidencePath, 'utf8'))).toMatchObject({
      disposition: 'SPENT_BEFORE_EFFECTS',
      outcome: 'UNKNOWN',
      refundPermitted: false,
    })
    await f.task.cancel()
  },
)
