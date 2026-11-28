import { randomUUID } from 'node:crypto'
import prisma from '../../src/config/db-config'
import { hashQualityJourneyExecutionValue as hash } from '../../src/lib/quality-journey'
import {
  createAppManagedJourney,
  getQualityJourney,
  submitDurableQualityJourneyCommand,
} from '../../src/services/coordinator/quality-journey-service'
import { trustedHumanCoordinatorSession } from '../../src/services/coordinator/quality-journey-coordinator-session'
import {
  registerQualityJourneyCoordinatorSession,
  activateQualityJourneyCoordinatorSession,
} from '../../src/services/coordinator/quality-journey-session-service'
import { prepareAppManagedAnalysisTask } from '../../src/services/coordinator/app-managed-analysis-task'
import { appManagedAnalysisDefinitions } from '../../src/services/coordinator/app-managed-analysis-contract'
import { publishQualityJourneyAnalysis } from '../../src/services/coordinator/quality-journey-analysis-service'
import { appendConversationTurn } from '../../src/services/conversation/conversation-service'
import { ServiceError } from '../../src/services/shared/errors'

type FixtureQuestion = {
  questionId: string
  prompt: string
  rationale: string
  required: boolean
  suggestedAnswers?: string[]
}
async function startJourney(targetProjectId: string) {
  const { journey } = await createAppManagedJourney({
    targetProjectId,
    idempotencyKey: randomUUID(),
    requirement: { objective: 'Review checkout criteria' },
  })
  const suffix = randomUUID()
  const scope = { journeyId: journey.journeyId, targetProjectId }
  await submitDurableQualityJourneyCommand(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      ...scope,
      actor: 'USER',
      command: 'SUBMIT_REQUIREMENT',
      commandId: `brief-${suffix}`,
      idempotencyKey: `brief-${suffix}`,
      expectedStateHash: journey.stateHash,
      inputArtifactRefs: [],
      payload: {
        journeyRevisionId: journey.activeRevisionIds.journey,
        requirementHash: hash({ objective: 'Review checkout criteria' }),
      },
    },
    prisma,
    trustedHumanCoordinatorSession,
  )
  const current = await prisma.qualityJourney.findUniqueOrThrow({ where: { id: journey.journeyId } })
  const principalId = `appraise-local:${targetProjectId}`
  const registered = await registerQualityJourneyCoordinatorSession(
    { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: suffix },
    prisma,
  )
  await activateQualityJourneyCoordinatorSession(
    {
      ...scope,
      coordinatorPrincipalId: principalId,
      coordinatorSessionId: registered.session.id,
      authority: trustedHumanCoordinatorSession,
      approvedBy: 'local-ui',
      requestId: suffix,
      expectedOwnershipVersion: current.ownershipVersion,
      expectedStateHash: current.stateHash,
    },
    prisma,
  )
  return journey.journeyId
}

type AnalysisFixtureInput = {
  targetProjectId: string
  questions: FixtureQuestion[]
  existing?: { journeyId: string }
  orderNumberPilot?: { journeyId: string; predecessorRevisionId: string } | true
  successor?: { journeyId: string; predecessorRevisionId: string }
}

async function seed({
  targetProjectId,
  questions,
  existing,
  orderNumberPilot,
  successor: answered,
}: AnalysisFixtureInput) {
  const successor = answered ?? (typeof orderNumberPilot === 'object' ? orderNumberPilot : undefined)
  const journeyId = successor?.journeyId ?? existing?.journeyId ?? (await startJourney(targetProjectId))
  const scope = { journeyId, targetProjectId }
  let { journey } = await getQualityJourney(scope, prisma)
  if (existing && !journey.currentCoordinatorSessionId) {
    if (journey.hostingMode !== 'APP_SERVER_LOCAL_V1' || journey.stage !== 'ANALYSIS')
      throw new Error('Existing checkout Analysis requires the UI-created local Journey in Analysis.')
    const principalId = `appraise-local:${targetProjectId}`
    const requestId = randomUUID()
    const registered = await registerQualityJourneyCoordinatorSession(
      { ...scope, ownerPrincipalId: principalId, hostKind: 'APP_SERVER_LOCAL_V1', idempotencyKey: requestId },
      prisma,
    )
    await activateQualityJourneyCoordinatorSession(
      {
        ...scope,
        coordinatorPrincipalId: principalId,
        coordinatorSessionId: registered.session.id,
        authority: trustedHumanCoordinatorSession,
        approvedBy: 'local-ui',
        requestId,
        expectedOwnershipVersion: journey.ownershipVersion,
        expectedStateHash: journey.stateHash,
      },
      prisma,
    )
    ;({ journey } = await getQualityJourney(scope, prisma))
  }
  const session = await prisma.qualityJourneyCoordinatorSession.findUniqueOrThrow({
    where: { id: journey.currentCoordinatorSessionId! },
  })
  const principalId = session.ownerPrincipalId
  const suffix = randomUUID()
  const owner = {
    ...scope,
    coordinatorPrincipalId: principalId,
    coordinatorSessionId: session.id,
    coordinatorGeneration: session.generation!,
  }
  const task = await prepareAppManagedAnalysisTask(
    {
      ...owner,
      principal: { principalId, assurance: 'PROJECT_CREDENTIAL_ONLY' },
      assignmentSecret: `fixture-secret-${suffix}`,
      idempotencyKey: suffix,
    },
    { client: prisma, canonicalDefinitions: appManagedAnalysisDefinitions },
  )
  const artifactId = `charter-${suffix}`
  const revisionId = `analysis-${suffix}`
  const confirmationSignal = orderNumberPilot && !successor ? 'The confirmation page is shown' : 'An order ID is shown'
  const itemSignal = 'Only the selected item is purchased'
  const recordedAnswers = answered
    ? await prisma.qualityJourneyAnalysisAnswer.findMany({
        where: { journeyId, question: { analysisRevisionId: answered.predecessorRevisionId } },
        select: { answerId: true, artifact: { select: { artifactJson: true } } },
      })
    : []
  const charter = {
    charterId: artifactId,
    analysisRevisionId: revisionId,
    cycleId: journey.activeCycleId,
    requirementRevisionId: journey.activeRevisionIds.journey,
    objectives: ['Checkout works'],
    scope: {
      included: [
        'Guest checkout',
        ...recordedAnswers.map(row => JSON.parse(row.artifact.artifactJson).answer as string),
      ],
      excluded: ['Refunds'],
    },
    actors: ['Shopper'],
    requirements: [
      { requirementId: 'REQ-CHECKOUT', statement: 'A shopper submits an order.', sourceRefs: ['intake.objective'] },
    ],
    obligations: [
      {
        obligationId: 'AC-CONFIRM',
        requirementId: 'REQ-CHECKOUT',
        statement:
          orderNumberPilot && successor
            ? 'The order confirmation includes an order number.'
            : 'An order confirmation appears.',
        acceptanceSignals: [confirmationSignal],
      },
      ...(orderNumberPilot
        ? [
            {
              obligationId: 'AC-ITEM',
              requirementId: 'REQ-CHECKOUT',
              statement: 'The selected item is purchased.',
              acceptanceSignals: [itemSignal],
            },
          ]
        : []),
    ],
    constraints: ['No production payments'],
    assumptions: ['A test account exists'],
    risks: ['Duplicate submission'],
    acceptanceSignals: orderNumberPilot ? [confirmationSignal, itemSignal] : [confirmationSignal],
    retiredRequirementIds: [],
    questions,
    resolvedQuestionAnswerIds: recordedAnswers.map(row => row.answerId),
  }
  try {
    const submitted = await task.delivery.invoke({
      toolName: 'quality_journey_analysis_submit',
      arguments: {
        idempotencyKey: task.submissionIdempotencyKey,
        charter,
        ...(successor ? { predecessorAnalysisRevisionId: successor.predecessorRevisionId } : {}),
      },
      callId: `submit-${suffix}`,
    })
    if (!submitted.receipt.accepted) throw new Error('Fixture Analysis did not receive canonical acceptance.')
  } finally {
    task.delivery.fence()
  }
  const analysis = await prisma.qualityJourneyAnalysisRevision.findUniqueOrThrow({ where: { id: revisionId } })
  const analysisState = (await getQualityJourney(scope, prisma)).journey
  if (!questions.some(question => question.required)) {
    await publishQualityJourneyAnalysis(
      {
        schemaVersion: 'appraise.quality-journey/v1',
        ...scope,
        actor: 'RUNNER',
        command: 'PUBLISH_ANALYSIS',
        commandId: `publish-${suffix}`,
        idempotencyKey: `publish-${suffix}`,
        expectedStateHash: analysisState.stateHash,
        inputArtifactRefs: [
          { kind: 'ANALYSIS_CHARTER_REVISION', artifactId, revisionId, contentHash: analysis.contentHash },
        ],
        payload: { artifactRevisionId: revisionId, artifactHash: analysis.contentHash },
      },
      prisma,
      owner,
    )
  }
  return { targetProjectId, journey: { journeyId: journey.journeyId }, revisionId }
}

const input = JSON.parse(process.argv[2] ?? '{}') as
  | AnalysisFixtureInput
  | {
      approvalProbe: Parameters<typeof appendConversationTurn>[0]
    }
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('project.db'))
  throw new Error('Fixture requires the disposable browser database.')
async function runFixture() {
  if (!('approvalProbe' in input)) return seed(input)
  try {
    const turn = await appendConversationTurn(input.approvalProbe, prisma)
    return { outcome: 'COMMITTED', replayed: turn.replayed }
  } catch (error) {
    if (error instanceof ServiceError) return { outcome: error.code }
    throw error
  }
}

void runFixture()
  .then(result => {
    process.stdout.write(`APPRAISE_E2E_FIXTURE=${JSON.stringify(result)}\n`)
  })
  .finally(() => prisma.$disconnect())
