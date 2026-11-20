import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerAppraiseOperations } from '../../../packages/appraisejs/src/mcp/registry'
import { copyMigratedTestDatabase, createTargetProjectFixture } from '@/test/migrated-test-database'
import * as correctionService from './app-managed-analysis-correction'
import { getAppManagedAnalysisCorrection, issueAppManagedAnalysisCorrection } from './app-managed-analysis-correction'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import * as journeyService from './quality-journey-service'
import {
  answerQualityJourneyAnalysisQuestion,
  publishQualityJourneyAnalysis,
  requestQualityJourneyAnalysisRevision,
} from './quality-journey-analysis-service'
import { assertHistoricalHubQuiescent } from './quality-journey-provider-recovery'
import { prepareAppManagedAnalysisTask } from './app-managed-analysis-task'
import { trustedHumanCoordinatorSession } from './quality-journey-coordinator-session'
import { prepareQualityJourneyProviderRun } from './quality-journey-provider-run-service'
import {
  activateQualityJourneyCoordinatorSession,
  registerQualityJourneyCoordinatorSession,
} from './quality-journey-session-service'
import { createQualityJourney, submitDurableQualityJourneyCommand } from './quality-journey-service'

const workspaces: string[] = []
const clients: PrismaClient[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  await Promise.all(clients.splice(0).map(client => client.$disconnect()))
  await Promise.all(workspaces.splice(0).map(workspace => fs.rm(workspace, { recursive: true, force: true })))
})

async function setup(submit = true, local = false) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-managed-analysis-'))
  workspaces.push(workspace)
  const databasePath = path.join(workspace, 'test.db')
  await copyMigratedTestDatabase(databasePath)
  const client = new PrismaClient({ datasources: { db: { url: `file:${databasePath}` } } })
  clients.push(client)
  const targetProjectId = 'analysis-target'
  await createTargetProjectFixture(client, {
    id: targetProjectId,
    kind: 'LOCAL_WORKSPACE',
    canonicalIdentity: `path:${workspace}`,
    canonicalPath: workspace,
    displayName: 'Disposable Blogen Analysis',
    fingerprint: `sha256:${'b'.repeat(64)}`,
  })
  const requirement = {
    objective: 'Analyze Blogen post authoring and review.',
    context: 'Editors create draft posts, review them and publish approved content.',
    includedScope: ['Draft creation', 'Editor review'],
    excludedScope: ['Billing'],
    actors: ['Author', 'Editor'],
    risks: ['An unapproved draft is published.'],
  }
  const created = await createQualityJourney(
    {
      targetProjectId,
      idempotencyKey: 'blogen-analysis',
      requirement,
      hostingMode: 'APP_SERVER_LOCAL_V1',
    },
    client,
  )
  const scope = { journeyId: created.journey.journeyId, targetProjectId }
  const principal = {
    principalId: local ? `appraise-local:${targetProjectId}` : 'project:managed-blogen',
    assurance: 'PROJECT_CREDENTIAL_ONLY' as const,
  }
  const registration = await registerQualityJourneyCoordinatorSession(
    {
      ...scope,
      ownerPrincipalId: principal.principalId,
      hostKind: 'APP_SERVER_LOCAL_V1',
      idempotencyKey: 'blogen-owner',
    },
    client,
  )
  await activateQualityJourneyCoordinatorSession(
    {
      ...scope,
      coordinatorPrincipalId: principal.principalId,
      authority: trustedHumanCoordinatorSession,
      approvedBy: 'local-ui',
      coordinatorSessionId: registration.session.id,
      requestId: 'blogen-activate',
      expectedOwnershipVersion: 0,
      expectedStateHash: created.journey.stateHash,
    },
    client,
  )
  const revision = await client.qualityJourneyRevision.findUniqueOrThrow({
    where: { id: created.journey.activeRevisionIds.journey },
  })
  if (submit)
    await submitDurableQualityJourneyCommand(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        ...scope,
        commandId: 'blogen-submit',
        idempotencyKey: 'blogen-submit',
        actor: 'USER',
        command: 'SUBMIT_REQUIREMENT',
        expectedStateHash: created.journey.stateHash,
        inputArtifactRefs: [],
        payload: { journeyRevisionId: revision.id, requirementHash: revision.contentHash },
      },
      client,
      trustedHumanCoordinatorSession,
    )
  const input = {
    ...scope,
    coordinatorSessionId: registration.session.id,
    coordinatorGeneration: 1,
    coordinatorPrincipalId: principal.principalId,
    principal,
    assignmentSecret: 'private-app-managed-secret-'.repeat(2),
    idempotencyKey: 'blogen-initial-analysis',
    leaseSeconds: 900,
  }
  const canonicalDefinitions = registerAppraiseOperations({
    server: { registerTool: () => ({}), registerResource: () => ({}) } as never,
    api: {} as never,
    options: { baseUrl: 'http://127.0.0.1:3000', cwd: workspace, coordinatorId: 'managed-analysis-test' },
  })
  const options = { client, canonicalDefinitions }
  return {
    client,
    input,
    options,
    created,
    requirement,
    revision,
    prepare: () => prepareAppManagedAnalysisTask(input, options),
  }
}

describe('initial app-managed Analysis task with canonical SQLite authority', () => {
  it('claims and admits real work, binds the immutable brief, and prepares a scoped model-authored task without provider effects', async () => {
    const f = await setup()
    const task = await f.prepare()
    expect(task.replayed).toBe(false)
    expect(task.requirement).toMatchObject({
      artifactId: f.revision.id,
      contentHash: f.revision.contentHash,
      data: f.requirement,
    })
    expect(task.assignment.inputArtifacts).toContainEqual(
      expect.objectContaining({
        kind: 'JOURNEY_REVISION',
        artifactId: f.revision.id,
        contentHash: f.revision.contentHash,
      }),
    )
    expect(task.binding).toMatchObject({
      journeyId: f.input.journeyId,
      targetProjectId: f.input.targetProjectId,
      coordinatorSessionId: f.input.coordinatorSessionId,
      principal: f.input.principal,
      role: 'REQUIREMENT_ANALYZER',
    })
    const attempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: task.binding.attemptId },
    })
    expect(attempt).toMatchObject({
      status: 'IN_PROGRESS',
      attempt: 1,
      externalPrincipalId: f.input.principal.principalId,
    })
    expect(attempt.externalAdmissionId).toBeTruthy()
    expect(task.envelope).toEqual([{ type: 'text', text: task.prompt }])
    expect(task.prompt).toContain(f.requirement.objective)
    expect(task.prompt).toContain(f.requirement.context)
    expect(task.prompt).toContain(f.revision.id)
    expect(task.prompt).toContain(task.submissionIdempotencyKey)
    expect(task.prompt).toContain('sourceRefs')
    expect(task.prompt).toContain('intake.objective')
    expect(task.prompt).not.toContain(f.input.assignmentSecret)
    expect(task.prompt).not.toContain(f.input.principal.principalId)
    expect(task.delivery.profile.tools.map(tool => tool.name)).toEqual([
      'quality_journey_analysis_get',
      'quality_journey_analysis_submit',
    ])
    expect(await f.client.qualityJourneyAnalysisRevision.count()).toBe(0)
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
    expect(await f.client.qualityJourneyProviderDispatchIntent.count()).toBe(0)
  })

  it('replays only the exact original claim and does not mint a second attempt or extend the lease', async () => {
    const f = await setup()
    const first = await f.prepare()
    const original = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: first.binding.attemptId },
    })
    const replay = await f.prepare()
    expect(replay.replayed).toBe(true)
    expect(replay.binding).toEqual(first.binding)
    expect(replay.envelope).toEqual(first.envelope)
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
    expect(
      (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: first.binding.attemptId } }))
        .leaseExpiresAt,
    ).toEqual(original.leaseExpiresAt)
    await expect(
      prepareAppManagedAnalysisTask({ ...f.input, idempotencyKey: 'different-task' }, f.options),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      prepareAppManagedAnalysisTask({ ...f.input, assignmentSecret: 'wrong-secret-'.repeat(4) }, f.options),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(prepareAppManagedAnalysisTask({ ...f.input, leaseSeconds: 300 }, f.options)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
  })

  it('refuses unsubmitted work and stale or foreign session credentials before claiming', async () => {
    const unsubmitted = await setup(false)
    await expect(unsubmitted.prepare()).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(await unsubmitted.client.qualityJourneyWorkAttempt.count()).toBe(0)
    const f = await setup()
    await expect(
      prepareAppManagedAnalysisTask({ ...f.input, coordinatorGeneration: 9 }, f.options),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    await expect(
      prepareAppManagedAnalysisTask(
        { ...f.input, principal: { ...f.input.principal, principalId: 'project:foreign' } },
        f.options,
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(0)
  })

  it('requires the exact immutable requirement before consuming an attempt', async () => {
    const f = await setup()
    await f.client.qualityJourney.update({
      where: { id: f.input.journeyId },
      data: { activeRevisionIdsJson: JSON.stringify({ journey: 'missing-requirement' }) },
    })
    await expect(f.prepare()).rejects.toThrow('immutable Analysis requirement')
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(0)
  })

  it('requires recovery for an expired original lease or any already-prepared provider run', async () => {
    const f = await setup()
    const task = await f.prepare()
    await prepareQualityJourneyProviderRun(
      {
        ...task.binding,
        idempotencyKey: task.providerPreparationIdempotencyKey,
        providerNamespace: 'app-managed:analysis',
        configurationDigest: `sha256:${'c'.repeat(64)}`,
        envelopeDigest: `sha256:${'e'.repeat(64)}`,
      },
      f.client,
    )
    await expect(f.prepare()).rejects.toThrow('provider history')
    expect(await f.client.qualityJourneyWorkAttempt.count()).toBe(1)
    const expired = await setup()
    const expiredTask = await expired.prepare()
    await expired.client.qualityJourneyWorkAttempt.update({
      where: { id: expiredTask.binding.attemptId },
      data: { leaseExpiresAt: new Date(0) },
    })
    await expect(expired.prepare()).rejects.toThrow('lease expired')
    expect(await expired.client.qualityJourneyWorkAttempt.count()).toBe(1)
  })

  it('accepts Analyzer-authored output only through the canonical scoped delivery with the fixed submission key', async () => {
    const f = await setup()
    const task = await f.prepare()
    const call = {
      callId: 'model-analysis-call',
      toolName: 'quality_journey_analysis_submit',
      arguments: {
        idempotencyKey: task.submissionIdempotencyKey,
        charter: {
          charterId: 'blogen-charter',
          analysisRevisionId: 'blogen-analysis-revision',
          cycleId: f.created.journey.activeCycleId,
          requirementRevisionId: f.revision.id,
          objectives: ['Keep Blogen post publication under editorial control.'],
          scope: { included: ['Draft creation', 'Editor review'], excluded: ['Billing'] },
          actors: ['Author', 'Editor'],
          requirements: [
            {
              requirementId: 'REQ-POST-1',
              statement: 'An editor reviews an authored draft before publication.',
              sourceRefs: [
                'intake.objective',
                'intake.context',
                'intake.includedScope',
                'intake.excludedScope',
                'intake.actors',
                'intake.risks',
              ],
            },
          ],
          obligations: [
            {
              obligationId: 'OBL-REVIEW-1',
              requirementId: 'REQ-POST-1',
              statement: 'An unapproved draft remains unpublished.',
              acceptanceSignals: ['Draft remains unavailable to readers before approval.'],
            },
          ],
          constraints: [],
          assumptions: [],
          risks: ['Premature publication bypasses editorial review.'],
          acceptanceSignals: ['Only approved posts become public.'],
          retiredRequirementIds: [],
          questions: [],
          resolvedQuestionAnswerIds: [],
        },
      },
    }
    await expect(
      task.delivery.invoke({ ...call, arguments: { ...call.arguments, idempotencyKey: 'replacement-key' } }),
    ).rejects.toThrow('original task idempotency key')
    const accepted = await task.delivery.invoke(call)
    expect(accepted.receipt.accepted).toBe(true)
    expect(await f.client.qualityJourneyAnalysisRevision.count()).toBe(1)
    expect(await f.client.qualityJourneyExternalSubmissionAcceptance.count()).toBe(1)
    await expect(f.prepare()).rejects.toThrow('existing Analysis revision')
  })
})

async function acceptFixtureAnalysis(
  task: Awaited<ReturnType<typeof prepareAppManagedAnalysisTask>>,
  suffix: string,
  questionId?: string,
  send = true,
) {
  const context = JSON.parse(task.prompt.split('\n\n').find(part => part.startsWith('{'))!)
  const data = task.requirement.data
  const charter = {
    charterId: `correction-charter-${suffix}`,
    analysisRevisionId: `correction-analysis-${suffix}`,
    cycleId: context.cycleId,
    requirementRevisionId: context.requirementRevisionId,
    objectives: [data.objective],
    scope: { included: data.includedScope ?? [], excluded: data.excludedScope ?? [] },
    actors: data.actors ?? [],
    requirements: [
      {
        requirementId: 'REQ-DRAFT',
        statement: 'Editors review draft posts.',
        sourceRefs: Object.keys(data)
          .filter(key => key !== 'schemaVersion')
          .map(key => `intake.${key}`),
      },
    ],
    obligations: [
      {
        obligationId: 'OBL-DRAFT',
        requirementId: 'REQ-DRAFT',
        statement: 'Draft state is displayed.',
        acceptanceSignals: ['The draft is shown.'],
      },
    ],
    constraints: [],
    assumptions: [],
    risks: data.risks ?? [],
    acceptanceSignals: ['The draft is shown.'],
    retiredRequirementIds: [],
    questions: questionId
      ? [
          {
            questionId,
            prompt: `What is required for ${questionId}?`,
            rationale: 'The answer changes acceptance.',
            required: true,
          },
        ]
      : [],
    resolvedQuestionAnswerIds:
      context.followup?.questions.flatMap((question: { currentAnswer: { data: { answerId: string } } | null }) =>
        question.currentAnswer ? [question.currentAnswer.data.answerId] : [],
      ) ?? [],
  }
  if (!send) return charter
  try {
    const result = await task.delivery.invoke({
      toolName: 'quality_journey_analysis_submit',
      arguments: {
        idempotencyKey: task.submissionIdempotencyKey,
        ...(context.followup ? { predecessorAnalysisRevisionId: context.followup.predecessorAnalysisRevisionId } : {}),
        charter,
      },
      callId: `submit-correction-${suffix}`,
    })
    expect(result.receipt.accepted).toBe(true)
    return charter
  } finally {
    task.delivery.fence()
  }
}
async function answerFixtureQuestion(f: Awaited<ReturnType<typeof setup>>, revisionId: string, questionId: string) {
  return answerQualityJourneyAnalysisQuestion(
    {
      idempotencyKey: `answer-${questionId}`,
      answer: {
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId: f.input.journeyId,
        targetProjectId: f.input.targetProjectId,
        analysisRevisionId: revisionId,
        questionId,
        answerId: `answer-${questionId}`,
        answer: `Use ${questionId}.`,
        actor: 'USER',
      },
    },
    f.client,
    trustedHumanCoordinatorSession,
  )
}
const legacyFailure = {
  state: 'UNKNOWN',
  stage: 'CANONICAL_SUBMISSION',
  reason: 'CANONICAL_SUBMISSION_DID_NOT_COMPLETE',
  detail: 'Canonical handoff did not complete.',
}
async function strandFixtureTask(
  f: Awaited<ReturnType<typeof setup>>,
  task: Awaited<ReturnType<typeof prepareAppManagedAnalysisTask>>,
  failure: unknown = legacyFailure,
) {
  await f.client.qualityJourneyWorkAttempt.update({
    where: { id: task.binding.attemptId },
    data: {
      dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS',
      dispatchReservedAt: new Date(),
      dispatchStartedAt: new Date(),
      failureJson: canonicalContractJson(failure),
      leaseExpiresAt: new Date(0),
    },
  })
  task.delivery.fence()
  const journey = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.input.journeyId } })
  return {
    journeyId: journey.id,
    targetProjectId: journey.targetProjectId,
    expectedStateHash: journey.stateHash,
    attemptId: task.binding.attemptId,
    failureHash: hashCanonical(failure),
  }
}

describe('explicit input-bound Analysis correction grants', () => {
  it('preserves an exhausted original cap, submits a distinct correction, and admits a later genuinely new human cause', async () => {
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
    const f = await setup(true, true)
    const first = await f.prepare()
    const revision1 = await acceptFixtureAnalysis(first, 'one', 'QUESTION-ONE')
    await answerFixtureQuestion(f, revision1.analysisRevisionId, 'QUESTION-ONE')
    const second = await f.prepare()
    const revision2 = await acceptFixtureAnalysis(second, 'two', 'QUESTION-TWO')
    await answerFixtureQuestion(f, revision2.analysisRevisionId, 'QUESTION-TWO')
    const third = await f.prepare()
    const request = await strandFixtureTask(f, third)
    const oldItem = await f.client.qualityJourneyWorkItem.findUniqueOrThrow({ where: { id: third.binding.workItemId } })
    const oldAuths = await f.client.qualityJourneyWorkAuthorization.findMany({
      where: { workItemId: oldItem.id },
      orderBy: { id: 'asc' },
    })
    expect(oldItem.currentAttempt).toBe(3)
    expect(await getAppManagedAnalysisCorrection(request, f.client)).toEqual({
      attemptId: request.attemptId,
      failureHash: request.failureHash,
    })
    await expect(f.client.$transaction(tx => assertHistoricalHubQuiescent(tx))).rejects.toThrow('Historical')
    const issued = await issueAppManagedAnalysisCorrection(request, f.client)
    expect(issued.workItemId).not.toBe(oldItem.id)
    expect(issued.successorAttempt).toBe(1)
    const current = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.input.journeyId } })
    expect(JSON.parse(current.activeWorkItemIdsJson)).toContain(issued.workItemId)
    expect(JSON.parse(current.activeWorkItemIdsJson)).not.toContain(oldItem.id)
    expect(issued.expectedStateHash).toBe(current.stateHash)
    expect(current.stateHash).not.toBe(request.expectedStateHash)
    expect(
      (await f.client.qualityJourneyWorkAuthorization.findUniqueOrThrow({ where: { id: issued.authorizationId } }))
        .maxAttempts,
    ).toBe(1)
    await expect(f.client.$transaction(tx => assertHistoricalHubQuiescent(tx))).resolves.toBeUndefined()
    await expect(issueAppManagedAnalysisCorrection(request, f.client)).rejects.toMatchObject({ code: 'CONFLICT' })
    const correction = await f.prepare()
    expect(correction.binding.workItemId).toBe(issued.workItemId)
    expect(correction.binding.attemptId).not.toBe(third.binding.attemptId)
    expect(correction.submissionIdempotencyKey).not.toBe(third.submissionIdempotencyKey)
    const revision3 = await acceptFixtureAnalysis(correction, 'three', 'QUESTION-THREE')
    await answerFixtureQuestion(f, revision3.analysisRevisionId, 'QUESTION-THREE')
    const normalFollowup = await f.prepare()
    expect(normalFollowup.binding.workItemId).toBe(issued.workItemId)
    const followupAttempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: normalFollowup.binding.attemptId },
    })
    expect(followupAttempt.attempt).toBe(2)
    expect(followupAttempt.authorizationId).not.toBe(issued.authorizationId)
    await acceptFixtureAnalysis(normalFollowup, 'four')
    expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: oldItem.id } })).toBe(3)
    expect(
      await f.client.qualityJourneyWorkAuthorization.findMany({
        where: { workItemId: oldItem.id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(oldAuths)
    const retired = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: third.binding.attemptId },
    })
    expect(retired).toMatchObject({
      status: 'FAILED',
      dispatchAdapterId: 'APP_SERVER_LOCAL_V1_ANALYSIS',
      failureJson: canonicalContractJson(legacyFailure),
      dispatchReservedAt: null,
      dispatchStartedAt: null,
    })
    await expect(
      f.client.$transaction(tx =>
        journeyService.readQualityJourneyAnalysisFollowupInTransaction(
          f.input,
          new Proxy(tx, {
            get(target, property) {
              if (property === 'qualityJourneyEvent')
                return {
                  ...tx.qualityJourneyEvent,
                  findMany: async (args: { where?: { eventType?: string } }) =>
                    args.where?.eventType === 'ANALYSIS_CORRECTION_ISSUED'
                      ? []
                      : tx.qualityJourneyEvent.findMany(args as never),
                }
              return Reflect.get(target, property)
            },
          }),
        ),
      ),
    ).rejects.toThrow('no exact correction grant')
    expect(await f.client.qualityJourneyProviderRun.count()).toBe(0)
  }, 30_000)

  it('refuses unproven native effects, disabled owner opt-in, stale state/failure, and a second correction for the same input', async () => {
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
    const f = await setup(true, true)
    const task = await f.prepare()
    const request = await strandFixtureTask(f, task, {
      ...legacyFailure,
      stage: 'NATIVE_SEND',
      reason: 'NATIVE_SEND_DID_NOT_COMPLETE',
    })
    expect(await getAppManagedAnalysisCorrection(request, f.client)).toBeNull()
    await expect(issueAppManagedAnalysisCorrection(request, f.client)).rejects.toBeTruthy()
    const validRequest = await strandFixtureTask(f, task)
    await expect(
      issueAppManagedAnalysisCorrection({ ...validRequest, expectedStateHash: `sha256:${'f'.repeat(64)}` }, f.client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      issueAppManagedAnalysisCorrection({ ...validRequest, failureHash: `sha256:${'f'.repeat(64)}` }, f.client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'false')
    expect(await getAppManagedAnalysisCorrection(validRequest, f.client)).toBeNull()
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
    const issued = await issueAppManagedAnalysisCorrection(validRequest, f.client)
    const missingGrant = vi
      .spyOn(correctionService, 'readAppManagedAnalysisCorrectionIssuanceInTransaction')
      .mockResolvedValueOnce(null)
    await expect(f.prepare()).rejects.toThrow('exact correction grant')
    expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: issued.workItemId } })).toBe(0)
    missingGrant.mockRestore()
    const replacement = await f.prepare()
    const sameInputFailure = await strandFixtureTask(f, replacement)
    expect(await getAppManagedAnalysisCorrection(sameInputFailure, f.client)).toBeNull()
    expect(await f.client.qualityJourneyWorkItem.count()).toBe(2)
    expect(issued.workItemId).toBe(replacement.binding.workItemId)
  }, 20_000)
  it('checks changed answer/feedback snapshots before consuming a correction claim', async () => {
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
    const f = await setup(true, true)
    const first = await f.prepare()
    const revision = await acceptFixtureAnalysis(first, 'stale-one', 'QUESTION-STALE')
    await answerFixtureQuestion(f, revision.analysisRevisionId, 'QUESTION-STALE')
    const failed = await f.prepare()
    const request = await strandFixtureTask(f, failed)
    const issued = await issueAppManagedAnalysisCorrection(request, f.client)
    const snapshot = await f.client.$transaction(tx =>
      journeyService.readQualityJourneyAnalysisFollowupInTransaction(f.input, tx),
    )
    expect(snapshot).not.toBeNull()
    for (const change of [{ inputHash: `sha256:${'f'.repeat(64)}` }, { inputArtifacts: [] }]) {
      const reader = vi
        .spyOn(journeyService, 'readQualityJourneyAnalysisFollowupInTransaction')
        .mockResolvedValueOnce({ ...snapshot!, ...change })
      await expect(f.prepare()).rejects.toThrow('input changed before claim')
      expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: issued.workItemId } })).toBe(0)
      reader.mockRestore()
    }
    const valid = await f.prepare()
    expect(valid.binding.workItemId).toBe(issued.workItemId)
    expect(await f.client.qualityJourneyWorkAttempt.count({ where: { workItemId: issued.workItemId } })).toBe(1)
    valid.delivery.fence()
  }, 20_000)

  it('accepts an initial correction and permits an exact later review request without reusing the one-send grant', async () => {
    vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
    const f = await setup(true, true)
    const initial = await f.prepare()
    const request = await strandFixtureTask(f, initial)
    const issued = await issueAppManagedAnalysisCorrection(request, f.client)
    const correction = await f.prepare()
    const charter = await acceptFixtureAnalysis(correction, 'initial-corrected')
    const revision = await f.client.qualityJourneyAnalysisRevision.findUniqueOrThrow({
      where: { id: charter.analysisRevisionId },
    })
    const row = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: f.input.journeyId } })
    const scope = { journeyId: row.id, targetProjectId: row.targetProjectId }
    await publishQualityJourneyAnalysis(
      {
        ...scope,
        schemaVersion: 'appraise.quality-journey/v1',
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        commandId: 'publish-initial-corrected',
        idempotencyKey: 'publish-initial-corrected',
        expectedStateHash: row.stateHash,
        inputArtifactRefs: [
          {
            kind: 'ANALYSIS_CHARTER_REVISION',
            artifactId: revision.artifactId,
            revisionId: revision.id,
            contentHash: revision.contentHash,
          },
        ],
        payload: { artifactRevisionId: revision.id, artifactHash: revision.contentHash },
      },
      f.client,
      f.input,
    )
    const published = await f.client.qualityJourney.findUniqueOrThrow({ where: { id: row.id } })
    await requestQualityJourneyAnalysisRevision(
      {
        expectedReviewHash: published.analysisReviewHash,
        command: {
          ...scope,
          schemaVersion: 'appraise.quality-journey/v1',
          actor: 'USER',
          command: 'REQUEST_ANALYSIS_REVISION',
          commandId: 'review-initial-corrected',
          idempotencyKey: 'review-initial-corrected',
          expectedStateHash: published.stateHash,
          inputArtifactRefs: [
            {
              kind: 'ANALYSIS_CHARTER_REVISION',
              artifactId: revision.artifactId,
              revisionId: revision.id,
              contentHash: revision.contentHash,
            },
          ],
          payload: {
            reviewedRevisionId: revision.id,
            reviewedHash: revision.contentHash,
            feedback: 'Clarify the draft visibility criterion.',
          },
        },
      },
      f.client,
      trustedHumanCoordinatorSession,
    )
    const next = await f.prepare()
    const nextAttempt = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
      where: { id: next.binding.attemptId },
    })
    expect(nextAttempt.attempt).toBe(2)
    expect(nextAttempt.authorizationId).not.toBe(issued.authorizationId)
    await acceptFixtureAnalysis(next, 'review-corrected')
  }, 20_000)
  it.each(['INTERRUPTED_PRECOMMIT', 'DETERMINISTIC_REJECTION'])(
    'issues finite correction from proven sender cleanup with zero acceptance: %s',
    async kind => {
      vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
      const f = await setup(true, true)
      const task = await f.prepare()
      const charter = await acceptFixtureAnalysis(task, `retained-${kind}`, undefined, false)
      const candidate = {
        toolName: 'quality_journey_analysis_submit',
        arguments: { idempotencyKey: task.submissionIdempotencyKey, charter },
      }
      const marker = {
        state: 'UNKNOWN',
        senderCleanupVerified: true,
        nativeSendStarted: true,
        candidate,
        candidateHash: hashCanonical(candidate),
        submissionIdempotencyKey: task.submissionIdempotencyKey,
        ...(kind === 'INTERRUPTED_PRECOMMIT'
          ? { handoffPhase: 'CANONICAL_SUBMISSION', recoveryEligible: false }
          : {
              stage: 'CANONICAL_SUBMISSION',
              reason: 'CANONICAL_SUBMISSION_DID_NOT_COMPLETE',
              recoveryEligible: true,
              rejection: { kind: 'CANONICAL', code: 'CONFLICT', message: 'Exact submitted lineage was rejected.' },
            }),
      }
      const request = await strandFixtureTask(f, task, marker)
      expect(await getAppManagedAnalysisCorrection(request, f.client)).toMatchObject({
        attemptId: task.binding.attemptId,
      })
      if (kind === 'INTERRUPTED_PRECOMMIT') {
        await f.client.qualityJourneyWorkAttempt.update({
          where: { id: task.binding.attemptId },
          data: { leaseExpiresAt: new Date(Date.now() + 900_000) },
        })
        expect(await getAppManagedAnalysisCorrection(request, f.client)).toBeNull()
        await f.client.qualityJourneyWorkAttempt.update({
          where: { id: task.binding.attemptId },
          data: { leaseExpiresAt: new Date(0) },
        })
      }
      const issued = await issueAppManagedAnalysisCorrection(request, f.client)
      const correction = await f.prepare()
      expect(correction.binding.workItemId).toBe(issued.workItemId)
      await acceptFixtureAnalysis(correction, `accepted-${kind}`)
      const prior = await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({
        where: { id: task.binding.attemptId },
      })
      expect(prior.failureJson).toBe(canonicalContractJson(marker))
      expect(
        await f.client.qualityJourneyExternalSubmissionAcceptance.count({
          where: { attemptId: task.binding.attemptId },
        }),
      ).toBe(0)
    },
    20_000,
  )
  it.each([
    {
      kind: 'finished deterministic rejection',
      allowed: true,
      outcome: 'REJECTED_OR_UNKNOWN',
      rejection: { kind: 'CANONICAL', code: 'CONFLICT' },
    },
    { kind: 'in-flight recovery', allowed: false, outcome: undefined, rejection: undefined },
    { kind: 'accepted recovery', allowed: false, outcome: 'ACCEPTED', rejection: undefined },
    {
      kind: 'uncertain recovery rejection',
      allowed: false,
      outcome: 'REJECTED_OR_UNKNOWN',
      rejection: { kind: 'UNCLASSIFIED' },
    },
  ])(
    'retained recovery correction boundary: $kind',
    async ({ allowed, outcome, rejection }) => {
      vi.stubEnv('APPRAISE_LOCAL_CODEX_ANALYSIS_ENABLED', 'true')
      const f = await setup(true, true)
      const task = await f.prepare()
      const charter = await acceptFixtureAnalysis(task, 'used-retained', undefined, false)
      const candidate = {
        toolName: 'quality_journey_analysis_submit',
        arguments: { idempotencyKey: task.submissionIdempotencyKey, charter },
      }
      const marker = {
        ...legacyFailure,
        senderCleanupVerified: true,
        nativeSendStarted: true,
        recoveryEligible: true,
        candidate,
        candidateHash: hashCanonical(candidate),
        submissionIdempotencyKey: task.submissionIdempotencyKey,
        rejection: { kind: 'CANONICAL', code: 'CONFLICT' },
        canonicalRecoveryUsed: true,
        ...(outcome ? { canonicalRecoveryOutcome: outcome } : {}),
        ...(rejection ? { canonicalRecoveryRejection: rejection } : {}),
      }
      const request = await strandFixtureTask(f, task, marker)
      if (!allowed) {
        expect(await getAppManagedAnalysisCorrection(request, f.client)).toBeNull()
        await expect(issueAppManagedAnalysisCorrection(request, f.client)).rejects.toBeTruthy()
        expect(await f.client.qualityJourneyWorkItem.count()).toBe(1)
        return
      }
      expect(await getAppManagedAnalysisCorrection(request, f.client)).not.toBeNull()
      const issued = await issueAppManagedAnalysisCorrection(request, f.client)
      const correction = await f.prepare()
      expect(correction.binding.workItemId).toBe(issued.workItemId)
      await acceptFixtureAnalysis(correction, 'after-used-rejection')
      expect(
        (await f.client.qualityJourneyWorkAttempt.findUniqueOrThrow({ where: { id: task.binding.attemptId } }))
          .failureJson,
      ).toBe(canonicalContractJson(marker))
    },
    20_000,
  )
})
