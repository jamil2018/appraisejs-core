import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    expect(boundary.profile).toHaveBeenLastCalledWith(f.profile)
    await f.task.cancel()
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
