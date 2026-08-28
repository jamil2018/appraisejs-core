import { describe, expect, it } from 'vitest'
import {
  createQualityJourneyKernelState,
  expireQualityJourneyLeases,
  runnableQualityJourneyRoles,
  reconstructQualityJourneyRunner,
  submitQualityJourneyCommand,
} from './index'

const digest = (character: string) => `sha256:${character.repeat(64)}`

function command(stateHash: string, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    commandId: 'command-submit-requirement',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    actor: 'USER',
    command: 'SUBMIT_REQUIREMENT',
    expectedStateHash: stateHash,
    idempotencyKey: 'submit-requirement-1',
    inputArtifactRefs: [],
    payload: { journeyRevisionId: 'journey-revision-1', requirementHash: digest('a') },
    ...overrides,
  }
}

describe('Quality Journey Phase 1 kernel', () => {
  it('commits one authoritative successor and appends one deterministic event', () => {
    const initial = createQualityJourneyKernelState({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      activeCycleId: 'cycle-1',
    })
    const committed = submitQualityJourneyCommand(initial, command(initial.stateHash))

    expect(committed.result).toMatchObject({ outcome: 'COMMITTED', successorStage: 'ANALYSIS', replayed: false })
    expect(committed.state.stage).toBe('ANALYSIS')
    expect(committed.state.activeRevisionIds).toEqual({ journey: 'journey-revision-1' })
    expect(committed.state.events).toHaveLength(1)
    expect(committed.state.events[0]).toMatchObject({
      sequence: 1,
      predecessorStateHash: initial.stateHash,
      successorStateHash: committed.state.stateHash,
    })
  })

  it('replays an identical command without another event and rejects changed reuse', () => {
    const initial = createQualityJourneyKernelState({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      activeCycleId: 'cycle-1',
    })
    const first = submitQualityJourneyCommand(initial, command(initial.stateHash))
    const replay = submitQualityJourneyCommand(first.state, command(initial.stateHash))
    expect(replay.result).toMatchObject({ outcome: 'COMMITTED', replayed: true })
    expect(replay.state.events).toHaveLength(1)

    const changed = submitQualityJourneyCommand(
      first.state,
      command(initial.stateHash, {
        commandId: 'command-changed',
        payload: { journeyRevisionId: 'journey-revision-2', requirementHash: digest('b') },
      }),
    )
    expect(changed.result).toMatchObject({ outcome: 'CONFLICT', code: 'IDEMPOTENCY_KEY_REUSED' })
    expect(changed.state).toBe(first.state)
  })

  it('rejects stale and unauthorized transitions without lifecycle events', () => {
    const initial = createQualityJourneyKernelState({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      activeCycleId: 'cycle-1',
    })
    expect(submitQualityJourneyCommand(initial, command(digest('f'))).result).toMatchObject({
      outcome: 'CONFLICT',
      code: 'STALE_STATE_HASH',
    })
    expect(submitQualityJourneyCommand(initial, command(initial.stateHash, { actor: 'RUNNER' })).result).toMatchObject({
      outcome: 'REJECTED',
      code: 'TRANSITION_NOT_ALLOWED',
    })
    expect(initial.events).toHaveLength(0)
  })

  it('allows only the first command derived from a shared predecessor hash to advance', () => {
    const initial = createQualityJourneyKernelState({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      activeCycleId: 'cycle-1',
    })
    const first = submitQualityJourneyCommand(initial, command(initial.stateHash))
    const competing = submitQualityJourneyCommand(
      first.state,
      command(initial.stateHash, {
        commandId: 'command-competing',
        idempotencyKey: 'submit-requirement-2',
      }),
    )
    expect(competing.result).toMatchObject({ outcome: 'CONFLICT', code: 'STALE_STATE_HASH' })
    expect(competing.state.events).toHaveLength(1)
  })

  it('requires an exact active blocker before committing a resume', () => {
    const withoutBlocker = createQualityJourneyKernelState({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      activeCycleId: 'cycle-1',
      stage: 'DISCOVERY',
    })
    const resume = {
      schemaVersion: 'appraise.quality-journey/v1',
      commandId: 'command-resume',
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      actor: 'USER',
      command: 'RESUME_BLOCKER',
      expectedStateHash: withoutBlocker.stateHash,
      idempotencyKey: 'resume-1',
      inputArtifactRefs: [],
      payload: { blockerId: 'blocker-1', resolutionArtifactIds: ['answer-1'] },
    }
    expect(submitQualityJourneyCommand(withoutBlocker, resume).result).toMatchObject({
      outcome: 'CONFLICT',
      code: 'PRECONDITION_FAILED',
    })

    const blocked = createQualityJourneyKernelState({
      journeyId: 'journey-1',
      targetProjectId: 'target-1',
      activeCycleId: 'cycle-1',
      stage: 'DISCOVERY',
      blockerIds: ['blocker-1'],
    })
    const resumed = submitQualityJourneyCommand(blocked, { ...resume, expectedStateHash: blocked.stateHash })
    expect(resumed.result).toMatchObject({ outcome: 'COMMITTED', successorStage: 'DISCOVERY' })
    expect(resumed.state.blockerIds).toEqual([])
    expect(resumed.state.stateHash).not.toBe(blocked.stateHash)
  })

  it('reconstructs runnable roles and expires only active elapsed leases', () => {
    expect(runnableQualityJourneyRoles('DISCOVERY', [])).toEqual(['SCOUT', 'RESOURCE_EXPLORER'])
    expect(
      runnableQualityJourneyRoles('DISCOVERY', [
        { workItemId: 'scout-1', role: 'SCOUT', status: 'IN_PROGRESS' },
        { workItemId: 'resource-1', role: 'RESOURCE_EXPLORER', status: 'COMPLETED' },
      ]),
    ).toEqual(['RESOURCE_EXPLORER'])
    expect(runnableQualityJourneyRoles('ANALYSIS_REVIEW', [])).toEqual([])
    expect(
      reconstructQualityJourneyRunner(
        'DISCOVERY',
        [{ workItemId: 'analysis-1', role: 'REQUIREMENT_ANALYZER', status: 'COMPLETED' }],
        [],
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'REQUIREMENT_ANALYZER', state: 'COMPLETED' }),
        expect.objectContaining({ role: 'SCOUT', state: 'RUNNABLE' }),
        expect.objectContaining({ role: 'AUTOMATOR', state: 'WAITING' }),
      ]),
    )

    expect(
      expireQualityJourneyLeases(
        [
          {
            workItemId: 'scout-1',
            role: 'SCOUT',
            status: 'IN_PROGRESS',
            leaseExpiresAt: '2026-08-28T00:00:00.000Z',
          },
          {
            workItemId: 'resource-1',
            role: 'RESOURCE_EXPLORER',
            status: 'COMPLETED',
            leaseExpiresAt: '2026-08-28T00:00:00.000Z',
          },
          {
            workItemId: 'scout-invalid-lease',
            role: 'SCOUT',
            status: 'IN_PROGRESS',
            leaseExpiresAt: 'not-a-date',
          },
        ],
        new Date('2026-08-28T00:01:00.000Z'),
      ),
    ).toEqual([
      expect.objectContaining({ workItemId: 'scout-1', status: 'LEASE_EXPIRED' }),
      expect.objectContaining({ workItemId: 'resource-1', status: 'COMPLETED' }),
      expect.objectContaining({ workItemId: 'scout-invalid-lease', status: 'IN_PROGRESS' }),
    ])
  })
})
