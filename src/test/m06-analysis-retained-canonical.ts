import { compileRetainedAnalysisFollowup } from './m06-analysis-retained-composition'
import assert from 'node:assert/strict'
import { trustedHumanCoordinatorSession } from '@/services/coordinator/quality-journey-coordinator-session'
import {
  answerQualityJourneyAnalysisQuestion,
  publishQualityJourneyAnalysis,
  submitExternalQualityJourneyAnalysisSuccessor,
} from '@/services/coordinator/quality-journey-analysis-service'
import {
  claimExternalQualityJourneyAnalysisFollowup,
  admitExternalQualityJourneyAnalyzer,
  getQualityJourney,
} from '@/services/coordinator/quality-journey-service'
import { assertRetainedFields } from './m06-analysis-retained-lifetime'
import { allocateRetainedAnalysisFixture, type RetainedAnalysisScenarioContext } from './m06-analysis-retained-fixture'
export async function retainedCanonicalAnalysisABC(context: RetainedAnalysisScenarioContext) {
  const f = await allocateRetainedAnalysisFixture(context)
  const client = f.client
  function charter(journeyId: string, cycleId: string, requirementRevisionId: string, suffix = '1') {
    return {
      schemaVersion: 'appraise.quality-journey/v1' as const,
      charterId: `analysis-charter-${suffix}`,
      analysisRevisionId: `analysis-revision-${suffix}`,
      journeyId,
      targetProjectId: f.scope.targetProjectId,
      cycleId,
      requirementRevisionId,
      objectives: ['Allow checkout.'],
      scope: { included: ['Checkout'], excluded: [] },
      actors: ['Shopper'],
      requirements: [
        { requirementId: 'REQ-CHECKOUT-1', statement: 'A shopper submits an order.', sourceRefs: ['brief:1'] },
      ],
      obligations: [
        {
          obligationId: 'OBL-CHECKOUT-1',
          requirementId: 'REQ-CHECKOUT-1',
          statement: 'A confirmation appears.',
          acceptanceSignals: ['Confirmation'],
        },
      ],
      constraints: [],
      assumptions: ['The user is authenticated.'],
      risks: [],
      acceptanceSignals: ['Confirmation'],
      retiredRequirementIds: [],
      questions: [
        {
          questionId: 'question-payment',
          prompt: 'Which payment method is in scope?',
          required: true,
          rationale: 'The scenario depends on it.',
        },
      ],
      resolvedQuestionAnswerIds: [],
    }
  }
  const created = f.created,
    claim = { ...f.claimed, ownerToken: f.binding.assignmentSecret },
    authority = { credentials: f.credentials, human: trustedHumanCoordinatorSession } as const
  if (!authority) throw new Error('Managed fixture authority missing.')
  const scope = { journeyId: created.journey.journeyId, targetProjectId: f.scope.targetProjectId }
  const initial = charter(
    scope.journeyId,
    created.journey.activeCycleId,
    created.journey.activeRevisionIds.journey,
    'm06-followup-A',
  )
  initial.questions.push({
    questionId: 'question-shipping',
    prompt: 'Shipping?',
    required: true,
    rationale: 'Scope.',
  })
  const { ownerToken, ...authoredA } = {
    ...scope,
    workItemId: claim.workItem.id,
    attemptId: claim.attempt.id,
    leaseId: claim.attempt.leaseId,
    ownerToken: claim.ownerToken,
    idempotencyKey: 'm06-A-submit',
    charter: initial,
  }
  const a = await context.owner.track('original:submitExternalQualityJourneyAnalysisSuccessor', () =>
    submitExternalQualityJourneyAnalysisSuccessor(
      {
        ...authoredA,
        assignmentId: claim.assignment.assignmentId,
        assignmentGeneration: claim.assignmentGeneration,
        assignmentSecret: ownerToken,
      },
      f.principal,
      client,
      f.credentials,
    ),
  )
  const answer = async (revisionId: string, questionId: string, answerId: string) =>
    context.owner.track('original:answerQualityJourneyAnalysisQuestion', () =>
      answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: answerId,
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            ...scope,
            analysisRevisionId: revisionId,
            questionId,
            answerId,
            answer: 'Exact human scope.',
            actor: 'USER',
          },
        },
        client,
        authority.human,
      ),
    )
  await answer(a.analysisRevision.id, 'question-payment', 'm06-A-payment')
  assertRetainedFields(
    await context.owner.track('original:client.qualityJourneyWorkItem.findUniqueOrThrow', () =>
      client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: claim.workItem.id } }),
    ),
    {
      status: 'COMPLETED',
      currentAttempt: 1,
    },
  )
  assert.equal(
    await context.owner.track('original:client.qualityJourneyWorkAuthorization.count', () =>
      client.qualityJourneyWorkAuthorization.count({ where: { workItemId: claim.workItem.id } }),
    ),
    1,
  )
  await answer(a.analysisRevision.id, 'question-shipping', 'm06-A-shipping')
  const issuedB = await compileRetainedAnalysisFollowup(context.owner, client, scope)
  assert.equal(issuedB.status, 'ISSUED')
  assert.notEqual(
    issuedB.expected!.inputHash,
    (
      await context.owner.track('original:client.qualityJourney.findUniqueOrThrow', () =>
        client.qualityJourney.findUniqueOrThrow({ where: { id: scope.journeyId } }),
      )
    ).stateHash,
  )
  await assert.rejects(
    context.owner.track('original:answerQualityJourneyAnalysisQuestion', () =>
      answerQualityJourneyAnalysisQuestion(
        {
          idempotencyKey: 'm06-pending-correction',
          answer: {
            schemaVersion: 'appraise.quality-journey/v1',
            ...scope,
            analysisRevisionId: a.analysisRevision.id,
            questionId: 'question-payment',
            answerId: 'm06-pending-correction',
            correctionOfAnswerId: 'm06-A-payment',
            answer: 'Must remain local.',
            actor: 'USER',
          },
        },
        client,
        authority.human,
      ),
    ),
    { code: 'CONFLICT' },
  )
  const principal = {
    principalId: authority.credentials.coordinatorPrincipalId,
    assurance: 'PROJECT_CREDENTIAL_ONLY' as const,
  }
  const submitNext = async (
    expected: NonNullable<typeof issuedB.expected>,
    predecessorAnalysisRevisionId: string,
    suffix: string,
    resolvedQuestionAnswerIds: string[],
  ) => {
    const assignmentSecret = `m06-original-secret-${suffix}-01234567890123456789`
    const input = {
      ...scope,
      ...authority.credentials,
      role: 'REQUIREMENT_ANALYZER' as const,
      principal,
      assignmentSecret,
      idempotencyKey: `m06-${suffix}-claim`,
      expected,
    }
    const next = await context.owner.track('original:claimExternalQualityJourneyAnalysisFollowup', () =>
      claimExternalQualityJourneyAnalysisFollowup(input, client),
    )
    const replay = await context.owner.track('original:claimExternalQualityJourneyAnalysisFollowup', () =>
      claimExternalQualityJourneyAnalysisFollowup(input, client),
    )
    assert.equal(replay.replayed, true)
    assert.equal(replay.attempt.id, next.attempt.id)
    await context.owner.track('original:admitExternalQualityJourneyAnalyzer', () =>
      admitExternalQualityJourneyAnalyzer(
        {
          ...scope,
          ...authority.credentials,
          principal,
          assignmentSecret,
          workItemId: next.workItem.id,
          attemptId: next.attempt.id,
          assignmentId: next.assignment.assignmentId,
          assignmentGeneration: next.assignmentGeneration,
          leaseId: next.attempt.leaseId,
          idempotencyKey: `m06-${suffix}-admit`,
        },
        client,
      ),
    )
    const nextCharter = {
      ...charter(
        scope.journeyId,
        created.journey.activeCycleId,
        created.journey.activeRevisionIds.journey,
        `m06-followup-${suffix}`,
      ),
      questions: [{ questionId: `question-${suffix}`, prompt: 'Next scope?', required: true, rationale: 'New scope.' }],
      resolvedQuestionAnswerIds,
    }
    const submission = {
      ...scope,
      workItemId: next.workItem.id,
      attemptId: next.attempt.id,
      leaseId: next.attempt.leaseId,
      assignmentId: next.assignment.assignmentId,
      assignmentGeneration: next.assignmentGeneration,
      assignmentSecret,
      idempotencyKey: `m06-${suffix}-submit`,
      predecessorAnalysisRevisionId,
      charter: nextCharter,
    }
    await assert.rejects(
      context.owner.track('original:submitExternalQualityJourneyAnalysisSuccessor', () =>
        submitExternalQualityJourneyAnalysisSuccessor(
          { ...submission, predecessorAnalysisRevisionId: 'older-or-foreign' },
          principal,
          client,
          authority.credentials,
        ),
      ),
      { code: 'CONFLICT' },
    )
    const accepted = await context.owner.track('original:submitExternalQualityJourneyAnalysisSuccessor', () =>
      submitExternalQualityJourneyAnalysisSuccessor(submission, principal, client, authority.credentials),
    )
    assert.equal(next.attempt.attempt, suffix === 'B' ? 2 : 3)
    assert.equal(next.assignment.stateHash, expected.inputHash)
    return accepted
  }
  const b = await submitNext(issuedB.expected!, a.analysisRevision.id, 'B', ['m06-A-payment', 'm06-A-shipping'])
  assert.equal(b.analysisRevision.predecessorRevisionId, a.analysisRevision.id)
  assert.equal(
    await context.owner.track('original:client.qualityJourneyAnalysisPublication.count', () =>
      client.qualityJourneyAnalysisPublication.count({ where: { journeyId: scope.journeyId } }),
    ),
    0,
  )
  await answer(b.analysisRevision.id, 'question-B', 'm06-B-answer')
  const issuedC = await compileRetainedAnalysisFollowup(context.owner, client, scope)
  const c = await submitNext(issuedC.expected!, b.analysisRevision.id, 'C', ['m06-B-answer'])
  assert.equal(c.analysisRevision.predecessorRevisionId, b.analysisRevision.id)
  await answer(c.analysisRevision.id, 'question-C', 'm06-C-answer')
  const counts = async () => ({
    attempts: await context.owner.track('original:client.qualityJourneyWorkAttempt.count', () =>
      client.qualityJourneyWorkAttempt.count({ where: { workItemId: claim.workItem.id } }),
    ),
    authorizations: await context.owner.track('original:client.qualityJourneyWorkAuthorization.count', () =>
      client.qualityJourneyWorkAuthorization.count({
        where: { workItemId: claim.workItem.id },
      }),
    ),
    runs: await context.owner.track('original:client.qualityJourneyProviderRun.count', () =>
      client.qualityJourneyProviderRun.count({ where: { journeyId: scope.journeyId } }),
    ),
    intents: await context.owner.track('original:client.qualityJourneyProviderDispatchIntent.count', () =>
      client.qualityJourneyProviderDispatchIntent.count({
        where: { run: { journeyId: scope.journeyId } },
      }),
    ),
  })
  assert.deepEqual(await counts(), { attempts: 3, authorizations: 3, runs: 0, intents: 0 })
  for (let scan = 0; scan < 2; scan++)
    assertRetainedFields(await compileRetainedAnalysisFollowup(context.owner, client, scope), {
      status: 'AUTHORITY_BLOCKED',
      expected: null,
    })
  assert.deepEqual(await counts(), { attempts: 3, authorizations: 3, runs: 0, intents: 0 })
  assertRetainedFields(
    await context.owner.track('original:client.qualityJourneyWorkItem.findUniqueOrThrow', () =>
      client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: claim.workItem.id } }),
    ),
    {
      status: 'COMPLETED',
      currentAttempt: 3,
    },
  )
  assert.equal(
    await context.owner.track('original:client.qualityJourneyAnalysisDecision.count', () =>
      client.qualityJourneyAnalysisDecision.count({ where: { journeyId: scope.journeyId } }),
    ),
    0,
  )
  const state = await context.owner.track('original:getQualityJourney', () => getQualityJourney(scope, client))
  assert.equal(state.journey.activeRevisionIds.analysis, undefined)
  for (const older of [a.analysisRevision, b.analysisRevision])
    await assert.rejects(
      context.owner.track('original:publishQualityJourneyAnalysis', () =>
        publishQualityJourneyAnalysis(
          {
            schemaVersion: 'appraise.quality-journey/v1',
            ...scope,
            actor: 'RUNNER',
            command: 'PUBLISH_ANALYSIS',
            commandId: `publish-old-${older.id}`,
            idempotencyKey: `publish-old-${older.id}`,
            expectedStateHash: state.journey.stateHash,
            inputArtifactRefs: [
              {
                kind: 'ANALYSIS_CHARTER_REVISION',
                artifactId: older.artifactId,
                revisionId: older.artifactRevisionId,
                contentHash: older.contentHash,
              },
            ],
            payload: { artifactRevisionId: older.artifactRevisionId, artifactHash: older.contentHash },
          },
          client,
          authority.credentials,
        ),
      ),
      { code: 'CONFLICT' },
    )
}
