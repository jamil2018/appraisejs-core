import path from 'node:path'
import assert from 'node:assert/strict'
import { createProviderFixture } from '../src/test/quality-journey-provider-fixture'
import { createQualityJourneyAnalysisFixtureDelivery } from '../src/services/coordinator/quality-journey-analysis-delivery'
import { inspectQualityJourneyAnalysisContinuation } from '../src/services/coordinator/quality-journey-analysis-continuation'
import {
  answerQualityJourneyAnalysisQuestion,
  publishQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
} from '../src/services/coordinator/quality-journey-analysis-service'
import { getQualityJourney } from '../src/services/coordinator/quality-journey-service'
import { trustedHumanCoordinatorSession } from '../src/services/coordinator/quality-journey-coordinator-session'

const retain = process.argv.includes('--retain')
const fixture = await createProviderFixture()
const delivery = await createQualityJourneyAnalysisFixtureDelivery(
  fixture.prepareInput,
  {
    fixturePath: path.resolve('scripts/tests/fixtures/m06-analysis-child.mjs'),
    submissionIdempotencyKey: 'm06-initial-analysis',
  },
  fixture.client,
)
try {
  const result = await delivery.start()
  assert.equal(result.status, 'ACCEPTED')
  const revision = await fixture.client.qualityJourneyAnalysisRevision.findFirstOrThrow()
  assert.equal(await fixture.client.qualityJourneyAnalysisRevision.count(), 1)
  assert.equal(await fixture.client.qualityJourneyExternalSubmissionAcceptance.count(), 1)
  assert.equal(result.supervisor.providerTerminationProven, false)
  assert.equal(result.supervisor.cleanup?.groupExitObserved, true)
  const initialWait = await inspectQualityJourneyAnalysisContinuation(fixture.credentials, fixture.client)
  assert.equal(initialWait.outcome, 'HUMAN_WAIT')
  assert.equal(initialWait.dispatchAuthorized, false)
  const slot = await fixture.client.qualityJourneyProviderSlot.findUniqueOrThrow({ where: { id: 'HUB' } })
  assert.equal(slot.intentId, result.supervisor.intentId)
  if (!retain) {
    const answer = (answerId: string, correctionOfAnswerId?: string) => ({
      idempotencyKey: answerId,
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        ...fixture.scope,
        answerId,
        analysisRevisionId: revision.id,
        questionId: 'm06-required-question',
        answer: correctionOfAnswerId ? 'Debit card payment.' : 'Card payment.',
        actor: 'USER',
        ...(correctionOfAnswerId ? { correctionOfAnswerId } : {}),
      },
    })
    await answerQualityJourneyAnalysisQuestion(answer('m06-answer'), fixture.client, trustedHumanCoordinatorSession)
    await answerQualityJourneyAnalysisQuestion(
      answer('m06-answer-correction', 'm06-answer'),
      fixture.client,
      trustedHumanCoordinatorSession,
    )
    const answered = await getQualityJourney(fixture.scope, fixture.client)
    assert.deepEqual(answered.journey.unresolvedQuestionIds, [])
    const inputArtifactRefs = [
      {
        kind: 'ANALYSIS_CHARTER_REVISION',
        artifactId: revision.artifactId,
        revisionId: revision.artifactRevisionId,
        contentHash: revision.contentHash,
      },
    ]
    await publishQualityJourneyAnalysis(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        ...fixture.scope,
        commandId: 'm06-publish',
        idempotencyKey: 'm06-publish',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        expectedStateHash: answered.journey.stateHash,
        inputArtifactRefs,
        payload: { artifactRevisionId: revision.id, artifactHash: revision.contentHash },
      },
      fixture.client,
      fixture.credentials,
    )
    const published = await getQualityJourney(fixture.scope, fixture.client)
    await requestQualityJourneyAnalysisRevision(
      {
        expectedReviewHash: published.journey.analysisReviewHash,
        command: {
          schemaVersion: 'appraise.quality-journey/v1',
          ...fixture.scope,
          commandId: 'm06-revision-request',
          idempotencyKey: 'm06-revision-request',
          actor: 'USER',
          command: 'REQUEST_ANALYSIS_REVISION',
          expectedStateHash: published.journey.stateHash,
          inputArtifactRefs,
          payload: {
            reviewedRevisionId: revision.id,
            reviewedHash: revision.contentHash,
            feedback: 'Carry the debit card decision into the charter.',
          },
        },
      },
      fixture.client,
      trustedHumanCoordinatorSession,
    )
    const reopened = fixture.connect()
    try {
      const [a, b] = await Promise.all([
        inspectQualityJourneyAnalysisContinuation(fixture.credentials, reopened),
        inspectQualityJourneyAnalysisContinuation(fixture.credentials, fixture.client),
      ])
      assert.equal(a.outcome, 'PHYSICAL_RECONCILIATION_REQUIRED')
      assert.equal(a.observationKey, b.observationKey)
      assert.equal(a.dispatchAuthorized, false)
      assert.equal(a.occupiedIntentId, slot.intentId)
      assert.equal(await reopened.qualityJourneyWorkAttempt.count(), 1)
      assert.equal(await reopened.qualityJourneyProviderDispatchIntent.count(), 1)
      assert.equal(await reopened.qualityJourneyAnalysisAnswer.count(), 2)
      assert.equal(await reopened.qualityJourneyAnalysisPublication.count(), 1)
    } finally {
      await reopened.$disconnect()
    }
  }
  console.log(
    JSON.stringify({
      status: 'PASS',
      evidenceClass: 'owned-analysis-fixture-process-and-SQLite',
      canonicalAcceptance: true,
      initialContinuation: 'HUMAN_WAIT',
      followupContinuation: retain ? 'NOT_EXERCISED' : 'PHYSICAL_RECONCILIATION_REQUIRED',
      providerTerminationProven: false,
      slotOccupied: true,
      runtimeQualified: false,
      ...(retain
        ? {
            retained: {
              workspace: fixture.workspace,
              databasePath: fixture.databasePath,
              ...fixture.scope,
              analysisRevisionId: revision.id,
            },
          }
        : {}),
    }),
  )
} finally {
  await delivery.cancel()
  if (retain) await fixture.client.$disconnect()
  else await fixture.cleanup()
}
