import { describe, expect, it } from 'vitest'

import {
  displayStageForQualityJourney,
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
    ).toMatchObject({ title: 'Awaiting the next Journey update', destination: 'analysis' })
    expect(
      nextActionForQualityJourney({
        stage: 'ANALYSIS',
        blockerCount: 0,
        unresolvedRequiredQuestionCount: 0,
        hasObservedWorkerProgress: true,
      }),
    ).toMatchObject({ title: 'Awaiting the next Journey update', destination: 'analysis' })
    expect(
      nextActionForQualityJourney({ stage: 'SCENARIO_DESIGN', blockerCount: 0, unresolvedRequiredQuestionCount: 0 }),
    ).toMatchObject({ title: 'Awaiting the next Journey update', destination: 'scenarios' })
    expect(
      nextActionForQualityJourney({ stage: 'EXECUTION', blockerCount: 0, unresolvedRequiredQuestionCount: 0 }),
    ).toMatchObject({ title: 'Awaiting the next Journey update', destination: 'execution' })
  })

  it('requires migration for legacy hosting without projecting desktop handoffs', () => {
    const projection = qualityJourneyStatusProjection({
      stage: 'ANALYSIS',
      hostingMode: 'EXTERNAL_LEGACY',
      blockerCount: 0,
      unresolvedRequiredQuestionCount: 0,
    })
    expect(projection.summary).toMatch(/Migration required/)
    expect(projection.action).toEqual({ label: 'Review hosting ownership', destination: 'hosting' })
    expect(projection.lastObserved.summary).toBe('No submitted analysis work has been observed.')
    expect(JSON.stringify(projection)).not.toMatch(/prompt|open Codex|paste|launch/i)
  })

  it('does not imply a managed dispatcher or running work from admission alone', () => {
    const projection = qualityJourneyStatusProjection({
      stage: 'ANALYSIS',
      hostingMode: 'APP_SERVER_LOCAL_V1',
      blockerCount: 0,
      unresolvedRequiredQuestionCount: 0,
    })
    expect(projection.summary).toMatch(/Awaiting a worker result/)
    expect(projection.summary).toMatch(/available actions/)
    expect(projection.action.destination).toBe('analysis')
  })

  it.each([
    {
      name: 'review required',
      input: { stage: 'ANALYSIS_REVIEW', pendingAnalysisDecision: true, hasObservedWorkerProgress: true },
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

  it('retains lower-priority review attention when required questions take precedence', () => {
    const projection = qualityJourneyStatusProjection({
      stage: 'ANALYSIS_REVIEW',
      blockerCount: 0,
      unresolvedRequiredQuestionCount: 2,
      pendingAnalysisDecision: true,
      hasObservedWorkerProgress: true,
    })

    expect(projection).toMatchObject({
      summary: '2 required questions must be answered.',
      nextActor: 'You',
      action: { label: 'Answer questions', destination: 'analysis' },
    })
    expect(projection.alsoNeedsAttention).toContain('The proposed test approach needs review')
    expect(projection.alsoNeedsAttention).not.toContain('Codex handoff needs recovery')
  })

  it('does not claim an exact-version review exists without observed analysis work', () => {
    expect(
      qualityJourneyStatusProjection({
        stage: 'ANALYSIS_REVIEW',
        blockerCount: 0,
        unresolvedRequiredQuestionCount: 0,
        pendingAnalysisDecision: true,
        hasObservedWorkerProgress: false,
      }),
    ).toMatchObject({
      summary: 'No proposed test approach has been submitted for review.',
      nextActor: 'You',
      action: { label: 'View test approach', destination: 'analysis' },
    })
  })
})
