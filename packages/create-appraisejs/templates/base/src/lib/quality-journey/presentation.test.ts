import { describe, expect, it } from 'vitest'

import {
  displayStageForQualityJourney,
  codexHandoffGuidance,
  nextActionForQualityJourney,
  qualityJourneyStatusProjection,
  qualityJourneyDisplayStages,
  qualityJourneyVocabulary,
} from './presentation'

describe('Quality Journey presentation', () => {
  it('maps every canonical stage to one of the six user-facing stages, including backward loops', () => {
    expect(qualityJourneyDisplayStages).toHaveLength(6)
    expect(
      Object.fromEntries(
        [
          'INTAKE',
          'ANALYSIS',
          'ANALYSIS_REVIEW',
          'DISCOVERY',
          'SCENARIO_DESIGN',
          'SCENARIO_REVIEW',
          'AUTOMATION',
          'EXECUTION',
          'TRIAGE',
          'REPORT_REVIEW',
          'CLOSED',
        ].map(stage => [stage, displayStageForQualityJourney(stage).id]),
      ),
    ).toEqual({
      INTAKE: 'brief',
      ANALYSIS: 'approach',
      ANALYSIS_REVIEW: 'approach',
      DISCOVERY: 'scenarios',
      SCENARIO_DESIGN: 'scenarios',
      SCENARIO_REVIEW: 'scenarios',
      AUTOMATION: 'preparation',
      EXECUTION: 'run-tests',
      TRIAGE: 'results',
      REPORT_REVIEW: 'results',
      CLOSED: 'results',
    })
    expect(displayStageForQualityJourney('ANALYSIS')).toMatchObject({ label: 'Test approach' })
    expect(displayStageForQualityJourney('SCENARIO_DESIGN')).toMatchObject({ label: 'Test scenarios' })
  })

  it('prioritizes blockers, required questions, and exact reviews', () => {
    expect(
      nextActionForQualityJourney({ stage: 'ANALYSIS_REVIEW', blockerCount: 1, unresolvedRequiredQuestionCount: 1 }),
    ).toMatchObject({ title: qualityJourneyVocabulary.blockers, destination: 'activity' })
    expect(
      nextActionForQualityJourney({ stage: 'ANALYSIS_REVIEW', blockerCount: 0, unresolvedRequiredQuestionCount: 1 }),
    ).toMatchObject({ title: 'Answer required questions', destination: 'analysis' })
    expect(
      nextActionForQualityJourney({
        stage: 'ANALYSIS_REVIEW',
        blockerCount: 0,
        unresolvedRequiredQuestionCount: 0,
        pendingAnalysisDecision: true,
      }),
    ).toMatchObject({ title: 'Review the proposed test approach', destination: 'analysis' })
  })

  it('leads closed journeys with their outcome', () => {
    expect(
      nextActionForQualityJourney({ stage: 'CLOSED', blockerCount: 0, unresolvedRequiredQuestionCount: 0 }),
    ).toMatchObject({
      title: 'This journey is closed',
      destination: 'triage',
    })
  })

  it('keeps next actions understandable when revisions or reruns return to earlier stages', () => {
    expect(
      nextActionForQualityJourney({ stage: 'ANALYSIS', blockerCount: 0, unresolvedRequiredQuestionCount: 0 }),
    ).toMatchObject({ title: 'Ready to start', destination: 'analysis' })
    expect(
      nextActionForQualityJourney({
        stage: 'ANALYSIS',
        blockerCount: 0,
        unresolvedRequiredQuestionCount: 0,
        hasObservedWorkerProgress: true,
      }),
    ).toMatchObject({ title: 'Test approach is in progress', destination: 'analysis' })
    expect(
      nextActionForQualityJourney({ stage: 'SCENARIO_DESIGN', blockerCount: 0, unresolvedRequiredQuestionCount: 0 }),
    ).toMatchObject({ title: 'Test scenarios is in progress', destination: 'scenarios' })
    expect(
      nextActionForQualityJourney({ stage: 'EXECUTION', blockerCount: 0, unresolvedRequiredQuestionCount: 0 }),
    ).toMatchObject({ title: 'Run tests is in progress', destination: 'execution' })
  })

  it('uses explicit persistent Codex guidance without inferring worker progress', () => {
    expect(codexHandoffGuidance('PREPARED')).toMatchObject({ label: 'Ready to start' })
    expect(codexHandoffGuidance('LAUNCHING')).toMatchObject({ label: 'Opening Codex' })
    expect(codexHandoffGuidance('LAUNCHED')).toMatchObject({ label: 'Waiting for connection' })
    expect(codexHandoffGuidance('CONNECTED').description).toMatch(/only after it observes/i)
  })

  it.each([
    {
      name: 'not prepared',
      handoffStatus: 'NOT_PREPARED',
      summary: /analysis has not started/i,
      nextActor: 'You',
      lastObserved: /no codex handoff or connection/i,
    },
    {
      name: 'prepared',
      handoffStatus: 'PREPARED',
      summary: /prompt is ready to send/i,
      nextActor: 'You',
      lastObserved: /prompt was prepared/i,
    },
    {
      name: 'launching',
      handoffStatus: 'LAUNCHING',
      summary: /appraise is opening codex/i,
      nextActor: 'Appraise',
      lastObserved: /launch request was recorded/i,
    },
    {
      name: 'launched without a connection',
      handoffStatus: 'LAUNCHED',
      summary: /has not observed a connection/i,
      nextActor: 'You',
      lastObserved: /codex was opened/i,
    },
    {
      name: 'connected without submitted work',
      handoffStatus: 'CONNECTED',
      summary: /has not received submitted analysis work/i,
      nextActor: 'Coding agent',
      lastObserved: /connection was observed/i,
    },
    {
      name: 'failed',
      handoffStatus: 'FAILED',
      summary: /handoff failed/i,
      nextActor: 'You',
      lastObserved: /failed codex handoff/i,
    },
    {
      name: 'expired',
      handoffStatus: 'EXPIRED',
      summary: /handoff expired/i,
      nextActor: 'You',
      lastObserved: /expired codex handoff/i,
    },
    {
      name: 'unknown',
      handoffStatus: 'UNRECOGNIZED',
      summary: /connection status is unknown/i,
      nextActor: 'You',
      lastObserved: /connection status is unknown/i,
    },
  ])('derives a trustworthy status for $name handoffs', ({ handoffStatus, summary, nextActor, lastObserved }) => {
    const projection = qualityJourneyStatusProjection({
      stage: 'ANALYSIS',
      blockerCount: 0,
      unresolvedRequiredQuestionCount: 0,
      handoffStatus,
      handoffLaunchedAt: '2026-09-07T10:00:00.000Z',
      handoffConnectedAt: '2026-09-07T10:01:00.000Z',
      handoffFailedAt: '2026-09-07T10:02:00.000Z',
      observedAt: '2026-09-07T10:03:00.000Z',
    })

    expect(projection.summary).toMatch(summary)
    expect(projection.nextActor).toBe(nextActor)
    expect(projection.lastObserved.summary).toMatch(lastObserved)
    expect(projection.lastObserved.checkedAt).toBe('2026-09-07T10:03:00.000Z')
    expect(projection.action.destination).toBe('analysis')
  })

  it.each([
    {
      name: 'review required',
      input: { stage: 'ANALYSIS_REVIEW', pendingAnalysisDecision: true },
      expected: {
        summary: 'The proposed test approach is ready for your exact-version review.',
        nextActor: 'You',
        action: { label: 'Review test approach', destination: 'analysis' },
      },
    },
    {
      name: 'closed',
      input: { stage: 'CLOSED' },
      expected: {
        summary: 'This journey is closed.',
        nextActor: 'No one',
        action: { label: 'View results', destination: 'triage' },
      },
    },
  ])('derives a trustworthy status for $name journeys', ({ input, expected }) => {
    expect(
      qualityJourneyStatusProjection({
        stage: 'ANALYSIS',
        blockerCount: 0,
        unresolvedRequiredQuestionCount: 0,
        ...input,
      }),
    ).toMatchObject(expected)
  })

  it('keeps submitted review work ahead of stale handoff status and retains the handoff as secondary attention', () => {
    const projection = qualityJourneyStatusProjection({
      stage: 'ANALYSIS_REVIEW',
      blockerCount: 0,
      unresolvedRequiredQuestionCount: 0,
      pendingAnalysisDecision: true,
      hasObservedWorkerProgress: true,
      handoffStatus: 'LAUNCHED',
      observedWorkAt: '2026-09-07T10:04:00.000Z',
    })

    expect(projection).toMatchObject({
      summary: 'The proposed test approach is ready for your exact-version review.',
      nextActor: 'You',
      action: { label: 'Review test approach', destination: 'analysis' },
      lastObserved: {
        summary: 'Appraise has observed submitted analysis work.',
        evidenceAt: '2026-09-07T10:04:00.000Z',
      },
    })
    expect(projection.alsoNeedsAttention).not.toContain('Codex connection has not been observed')
  })

  it('retains lower-priority recovery and review attention when required questions take precedence', () => {
    const projection = qualityJourneyStatusProjection({
      stage: 'ANALYSIS_REVIEW',
      blockerCount: 0,
      unresolvedRequiredQuestionCount: 2,
      pendingAnalysisDecision: true,
      handoffStatus: 'FAILED',
    })

    expect(projection).toMatchObject({
      summary: '2 required questions must be answered.',
      nextActor: 'You',
      action: { label: 'Answer questions', destination: 'analysis' },
    })
    expect(projection.alsoNeedsAttention).toEqual(
      expect.arrayContaining(['The proposed test approach needs review', 'Codex handoff needs recovery']),
    )
  })
})
