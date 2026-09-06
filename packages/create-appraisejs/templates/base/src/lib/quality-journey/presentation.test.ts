import { describe, expect, it } from 'vitest'

import {
  displayStageForQualityJourney,
  codexHandoffGuidance,
  nextActionForQualityJourney,
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
})
