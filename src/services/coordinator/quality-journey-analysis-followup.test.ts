import { describe, expect, it } from 'vitest'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import {
  assertAnalysisFollowupAttemptBudget,
  compileAnalysisFollowupDescriptor,
  validateAnalysisFollowupIssuance,
  type AnalysisFollowupDescriptorV1,
} from './quality-journey-analysis-followup'

const ref = (kind: string, artifactId: string) => ({ kind, artifactId, contentHash: hashCanonical(artifactId) })
function snapshot(): AnalysisFollowupDescriptorV1 {
  return {
    schemaVersion: 'appraise.analysis-followup-descriptor/v1',
    journeyId: 'journey',
    targetProjectId: 'project',
    cycleId: 'cycle',
    workItemId: 'work',
    predecessor: {
      revisionId: 'A',
      artifact: { ...ref('ANALYSIS_CHARTER_REVISION', 'A'), revisionId: 'A' },
      attemptId: 'attempt-1',
      authorizationId: 'authorization-1',
      inputHash: hashCanonical('initial'),
    },
    requirement: { ...ref('JOURNEY_REVISION', 'requirement'), revisionId: 'requirement' },
    questions: [
      {
        questionId: 'required',
        required: true,
        question: { ...ref('ANALYSIS_QUESTION', 'required'), revisionId: 'A' },
        answer: ref('ANALYSIS_ANSWER', 'head'),
      },
      {
        questionId: 'optional',
        required: false,
        question: { ...ref('ANALYSIS_QUESTION', 'optional'), revisionId: 'A' },
        answer: null,
      },
    ],
    feedback: null,
    cause: { eventId: 'answer-event', sequence: 4 },
    advisoryInputRefs: [],
    advisoryDigest: hashCanonical([]),
    roleContractDigest: hashCanonical('role'),
  }
}

describe('immutable Analysis follow-up descriptor', () => {
  it('sorts the exact head view without clock, kernel state or minted authorization dependencies', () => {
    const first = snapshot()
    const reversed = snapshot()
    reversed.questions.reverse()
    expect(compileAnalysisFollowupDescriptor(first)).toEqual(compileAnalysisFollowupDescriptor(reversed))
    const compiled = compileAnalysisFollowupDescriptor(first)
    expect(compiled.ready).toBe(true)
    expect(compiled.inputArtifacts.map(a => a.kind)).toContain('JOURNEY_REVISION')
    expect(compiled.inputArtifacts.filter(a => a.kind === 'ANALYSIS_ANSWER')).toHaveLength(1)
    expect(first.questions[0]!.questionId).toBe('required')
    expect(compiled.causeHash).not.toBe(compiled.inputHash)
  })

  it('waits for required heads and permits an unanswered optional question', () => {
    const missing = snapshot()
    missing.questions[0]!.answer = null
    expect(compileAnalysisFollowupDescriptor(missing).ready).toBe(false)
    expect(compileAnalysisFollowupDescriptor(snapshot()).ready).toBe(true)
  })

  it.each(['requirement', 'predecessor', 'head', 'feedback', 'event'] as const)(
    'changes identity for changed %s',
    change => {
      const changed = snapshot()
      if (change === 'requirement')
        changed.requirement = { ...ref('JOURNEY_REVISION', 'new-requirement'), revisionId: 'new-requirement' }
      if (change === 'predecessor') changed.predecessor.attemptId = 'different-completed-attempt'
      if (change === 'head') changed.questions[0]!.answer = ref('ANALYSIS_ANSWER', 'corrected-head')
      if (change === 'feedback')
        changed.feedback = {
          commandId: 'revision-command',
          artifact: { ...ref('ANALYSIS_REVISION_FEEDBACK', 'feedback'), revisionId: 'A' },
        }
      if (change === 'event') changed.cause.eventId = 'other-event'
      const before = compileAnalysisFollowupDescriptor(snapshot()),
        after = compileAnalysisFollowupDescriptor(changed)
      expect(after.inputHash).not.toBe(before.inputHash)
      expect(after.causeHash).not.toBe(before.causeHash)
    },
  )

  it('authenticates issuance content independently of later work versions', () => {
    const compiled = compileAnalysisFollowupDescriptor(snapshot())
    const event = {
      schemaVersion: 'appraise.analysis-followup-issuance/v1',
      descriptor: compiled.descriptor,
      inputHash: compiled.inputHash,
      causeHash: compiled.causeHash,
      workItemId: 'work',
      authorizationId: 'new-authorization',
      issuedWorkItemVersion: 8,
    }
    expect(validateAnalysisFollowupIssuance(event).inputHash).toBe(compiled.inputHash)
    expect(validateAnalysisFollowupIssuance({ ...event, issuedWorkItemVersion: 9 }).inputHash).toBe(compiled.inputHash)
    expect(() =>
      validateAnalysisFollowupIssuance({ ...event, descriptor: { ...event.descriptor, cycleId: 'old' } }),
    ).toThrow()
    expect(() => validateAnalysisFollowupIssuance({ ...event, workItemId: 'other' })).toThrow()
  })

  it('rejects duplicate questions and invalid advisory content', () => {
    const duplicate = snapshot()
    duplicate.questions.push(duplicate.questions[0]!)
    expect(() => compileAnalysisFollowupDescriptor(duplicate)).toThrow(/ambiguous/)
    const invalid = snapshot()
    invalid.advisoryInputRefs.push({ seedId: 'unbound' })
    expect(() => compileAnalysisFollowupDescriptor(invalid)).toThrow(/advisory/)
  })
})

describe('both immutable follow-up attempt ceilings', () => {
  const budget = {
    authorizationAttempts: 0,
    authorizationMaxAttempts: 3,
    lifetimeAttempts: 2,
    currentAttempt: 2,
    maxAttempts: 3,
  }
  it('permits only the last lifetime attempt under a fresh authorization', () => {
    expect(() => assertAnalysisFollowupAttemptBudget(budget)).not.toThrow()
  })
  it.each([
    { lifetimeAttempts: 3, currentAttempt: 3 },
    { authorizationAttempts: 1, authorizationMaxAttempts: 1 },
    { currentAttempt: 3 },
    { currentAttempt: 1 },
    { authorizationAttempts: 3 },
    { currentAttempt: -1 },
    { lifetimeAttempts: 2.5 },
  ])('refuses exhausted or inconsistent counters %j', patch => {
    expect(() => assertAnalysisFollowupAttemptBudget({ ...budget, ...patch })).toThrow(/exhausted or inconsistent/)
  })
})
