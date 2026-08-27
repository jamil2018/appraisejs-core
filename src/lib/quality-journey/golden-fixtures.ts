import { z } from 'zod'
import {
  artifactReferenceContractSchema,
  journeyArtifactLinkSchema,
  journeyClosureSchema,
  journeyCommandResultSchema,
  journeyCommandSchema,
  journeyWorkItemStatusSchema,
  qualityJourneyStageSchema,
  testOutcomeAttributionSchema,
  workerSpawnReceiptSchema,
} from './contracts'
import { qualityJourneyTransitions, workItemTransitions } from './lifecycle'
import type { QualityJourneyStage } from './contracts'

const hash = (character: string) => `sha256:${character.repeat(64)}`
const sequenceHash = (value: number) => `sha256:${value.toString(16).padStart(64, '0')}`
const baseCommand = {
  schemaVersion: 'appraise.quality-journey/v1' as const,
  journeyId: 'journey-golden',
  targetProjectId: 'target-golden',
  inputArtifactRefs: [],
}

function commandActor(command: z.infer<typeof journeyCommandSchema>['command']) {
  if (command === 'PUBLISH_RUN_RESULT') return 'MANAGED_RUNTIME'
  if (
    [
      'DECIDE_ANALYSIS',
      'REQUEST_ANALYSIS_REVISION',
      'DECIDE_SCENARIOS',
      'REQUEST_SCENARIO_REVISION',
      'REQUEST_REPORT_REVISION',
      'START_REMEDIATION_CYCLE',
      'CLOSE_JOURNEY',
      'RISK_ACCEPT_AND_CLOSE',
      'RESUME_BLOCKER',
    ].includes(command)
  )
    return 'USER'
  return command === 'SUBMIT_REQUIREMENT' ? 'USER' : 'RUNNER'
}

function commandSequence() {
  let stateHash = sequenceHash(1)
  let sequence = 1
  return (
    command: z.infer<typeof journeyCommandSchema>['command'],
    payload: unknown,
    stage: z.infer<typeof qualityJourneyStageSchema>,
    stale = false,
  ) => {
    const commandId = `command-${sequence}-${stale ? 'stale-' : ''}${command.toLowerCase().replaceAll('_', '-')}`
    const request = journeyCommandSchema.parse({
      ...baseCommand,
      commandId,
      actor: commandActor(command),
      command,
      expectedStateHash: stateHash,
      idempotencyKey: commandId,
      payload,
    })
    const successorStateHash = sequenceHash(sequence + 1)
    const expected = stale
      ? journeyCommandResultSchema.parse({
          schemaVersion: baseCommand.schemaVersion,
          outcome: 'CONFLICT',
          commandId,
          code: 'STALE_STATE_HASH',
          currentStateHash: successorStateHash,
          currentStage: stage,
          safeNextCommands: [command],
        })
      : journeyCommandResultSchema.parse({
          schemaVersion: baseCommand.schemaVersion,
          outcome: 'COMMITTED',
          commandId,
          eventId: `event-${commandId}`,
          successorStateHash,
          successorStage: stage,
          replayed: false,
        })
    if (!stale) stateHash = successorStateHash
    sequence += 1
    return { kind: 'COMMAND' as const, request, expected }
  }
}

const artifact = (
  kind:
    'ANALYSIS_CHARTER_REVISION' | 'SCENARIO_REVISION' | 'SCENARIO_PORTFOLIO_REVISION' | 'TEST_REPORT_ANALYSIS_REVISION',
  artifactId: string,
) => ({ kind, artifactId, revisionId: `${artifactId}-revision`, contentHash: hash('d') })
const publish = (artifactRevisionId: string) => ({ artifactRevisionId, artifactHash: hash('d') })
const plainArtifact = (kind: 'JOURNEY_APPROVAL' | 'TEST_RUN' | 'EVIDENCE_RECEIPT', artifactId: string) => ({
  kind,
  artifactId,
  contentHash: hash('d'),
})
const fixtureStepSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('COMMAND'), request: journeyCommandSchema, expected: journeyCommandResultSchema })
    .strict(),
  z
    .object({ kind: z.literal('WORK_TRANSITION'), from: journeyWorkItemStatusSchema, to: journeyWorkItemStatusSchema })
    .strict(),
  z
    .object({
      kind: z.literal('SPAWN'),
      receipt: workerSpawnReceiptSchema,
      expectedWorkStatus: journeyWorkItemStatusSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('ARTIFACT_LINK'),
      link: journeyArtifactLinkSchema,
      expectedCode: z.enum(['TARGET_DEFECT', 'VALIDATION_DESIGN_DEFECT', 'PARTIAL_APPROVAL', 'RERUN_LINEAGE']),
    })
    .strict(),
  z.object({ kind: z.literal('CLOSURE'), closure: journeyClosureSchema }).strict(),
  z.object({ kind: z.literal('ATTRIBUTION'), attribution: testOutcomeAttributionSchema }).strict(),
])

export const qualityJourneyGoldenFixtureSchema = z
  .object({
    fixtureVersion: z.literal('appraise.quality-journey-golden/v1'),
    id: z.string().regex(/^[a-z0-9-]+$/),
    purpose: z.string().min(1),
    initialStage: qualityJourneyStageSchema,
    steps: z.array(fixtureStepSchema).min(1),
    expectedTerminalStage: qualityJourneyStageSchema,
  })
  .strict()
export type QualityJourneyGoldenFixture = z.infer<typeof qualityJourneyGoldenFixtureSchema>

type GoldenFixtureState = { stage: QualityJourneyStage; stateHash?: string }
type GoldenFixtureStep = QualityJourneyGoldenFixture['steps'][number]

function validateGoldenWorkTransition(
  fixtureId: string,
  step: Extract<GoldenFixtureStep, { kind: 'WORK_TRANSITION' }>,
) {
  if (!workItemTransitions[step.from].includes(step.to))
    throw new Error(`Golden fixture ${fixtureId} contains invalid work transition ${step.from} -> ${step.to}.`)
}

function applyGoldenCommand(
  fixtureId: string,
  step: Extract<GoldenFixtureStep, { kind: 'COMMAND' }>,
  state: GoldenFixtureState,
): GoldenFixtureState {
  if (state.stateHash && step.request.expectedStateHash !== state.stateHash)
    throw new Error(`Golden fixture ${fixtureId} breaks successor state-hash lineage.`)
  const currentState = { ...state, stateHash: state.stateHash ?? step.request.expectedStateHash }
  if (step.expected.outcome === 'CONFLICT') {
    if (step.expected.currentStage !== state.stage)
      throw new Error(`Golden fixture ${fixtureId} conflict changed stage.`)
    return currentState
  }
  if (step.expected.outcome !== 'COMMITTED') return currentState
  const committed = step.expected
  const transition = qualityJourneyTransitions.find(
    candidate =>
      candidate.from === state.stage &&
      candidate.command === step.request.command &&
      candidate.actor === step.request.actor &&
      candidate.to === committed.successorStage,
  )
  if (!transition) throw new Error(`Golden fixture ${fixtureId} has no matching lifecycle transition.`)
  return { stage: committed.successorStage, stateHash: committed.successorStateHash }
}

export function validateQualityJourneyGoldenFixture(value: unknown): QualityJourneyGoldenFixture {
  const fixture = qualityJourneyGoldenFixtureSchema.parse(value)
  let state: GoldenFixtureState = { stage: fixture.initialStage }
  for (const step of fixture.steps) {
    if (step.kind === 'WORK_TRANSITION') {
      validateGoldenWorkTransition(fixture.id, step)
      continue
    }
    if (step.kind !== 'COMMAND') continue
    state = applyGoldenCommand(fixture.id, step, state)
  }
  if (state.stage !== fixture.expectedTerminalStage)
    throw new Error(`Golden fixture ${fixture.id} ended at ${state.stage}, expected ${fixture.expectedTerminalStage}.`)
  return fixture
}

const reportReference = artifact('TEST_REPORT_ANALYSIS_REVISION', 'report-golden')
const riskClosure = journeyClosureSchema.parse({
  schemaVersion: baseCommand.schemaVersion,
  closureId: 'closure-risk',
  journeyId: 'journey-golden',
  cycleId: 'cycle-1',
  reportRevision: reportReference,
  decision: 'RISK_ACCEPTED',
  actorId: 'user-1',
  unresolvedItems: [{ itemId: 'risk-1', summary: 'Known browser limitation.', artifactRefs: [] }],
  riskAcceptance: {
    rationale: 'Accepted for this release.',
    acceptedItemIds: ['risk-1'],
    acceptedAt: '2026-08-28T00:00:00.000Z',
  },
  closedAt: '2026-08-28T00:00:00.000Z',
})
const link = (
  relation: 'APPROVES' | 'ATTRIBUTES' | 'RERUNS',
  source: z.infer<typeof artifactReferenceContractSchema>,
  target: z.infer<typeof artifactReferenceContractSchema>,
) =>
  journeyArtifactLinkSchema.parse({
    schemaVersion: baseCommand.schemaVersion,
    linkId: `link-${relation.toLowerCase()}-${source.artifactId}`,
    journeyId: 'journey-golden',
    targetProjectId: 'target-golden',
    cycleId: 'cycle-1',
    relation,
    source,
    target,
  })

const attribution = (kind: 'TARGET_DEFECT' | 'VALIDATION_DESIGN_DEFECT') =>
  testOutcomeAttributionSchema.parse({
    schemaVersion: baseCommand.schemaVersion,
    attributionId: `attribution-${kind.toLowerCase()}`,
    journeyId: 'journey-golden',
    targetProjectId: 'target-golden',
    cycleId: 'cycle-1',
    reportRevision: reportReference,
    kind,
    targetOutcome: kind === 'TARGET_DEFECT' ? 'FAILED' : 'NOT_EVALUATED',
    evidence: [plainArtifact('EVIDENCE_RECEIPT', 'evidence-1')],
    confidence: 'HIGH',
    competingHypotheses: [],
    rationale: 'The sealed evidence supports this attribution.',
  })

const happyCommand = commandSequence()
const analysisRevisionCommand = commandSequence()
const reconnectCommand = commandSequence()
const staleCommand = commandSequence()
const partialApprovalCommand = commandSequence()
const remediationCommand = commandSequence()
const targetDefectCommand = commandSequence()
const designDefectCommand = commandSequence()
const riskClosureCommand = commandSequence()

export const qualityJourneyGoldenFixtures: readonly QualityJourneyGoldenFixture[] = [
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'happy-path',
    purpose: 'Replay every normal exact-revision transition.',
    initialStage: 'INTAKE',
    steps: [
      happyCommand(
        'SUBMIT_REQUIREMENT',
        { journeyRevisionId: 'journey-revision-1', requirementHash: hash('d') },
        'ANALYSIS',
      ),
      happyCommand('PUBLISH_ANALYSIS', publish('analysis-revision-1'), 'ANALYSIS_REVIEW'),
      happyCommand(
        'DECIDE_ANALYSIS',
        { revisionId: 'analysis-revision-1', contentHash: hash('d'), decision: 'APPROVED' },
        'DISCOVERY',
      ),
      happyCommand('START_SCENARIO_DESIGN', {}, 'SCENARIO_DESIGN'),
      happyCommand('PUBLISH_SCENARIO_PORTFOLIO', publish('portfolio-revision-1'), 'SCENARIO_REVIEW'),
      happyCommand(
        'DECIDE_SCENARIOS',
        {
          portfolioRevisionId: 'portfolio-revision-1',
          portfolioHash: hash('d'),
          approvedScenarioRevisionIds: ['scenario-revision-1'],
          rejectedScenarioRevisionIds: [],
        },
        'AUTOMATION',
      ),
      happyCommand('START_EXECUTION', { runtimeCapsuleIds: ['capsule-1'] }, 'EXECUTION'),
      happyCommand('PUBLISH_RUN_RESULT', { testRunIds: ['run-1'], evidenceReceiptIds: ['evidence-1'] }, 'TRIAGE'),
      happyCommand('PUBLISH_TRIAGE_REPORT', publish('report-revision-1'), 'REPORT_REVIEW'),
      happyCommand(
        'CLOSE_JOURNEY',
        { closureId: 'closure-1', reportRevisionId: 'report-revision-1', reportHash: hash('d') },
        'CLOSED',
      ),
    ],
    expectedTerminalStage: 'CLOSED',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'analysis-revision-loop',
    purpose: 'Supersede reviewed analysis without mutating it.',
    initialStage: 'ANALYSIS_REVIEW',
    steps: [
      analysisRevisionCommand(
        'REQUEST_ANALYSIS_REVISION',
        { reviewedRevisionId: 'analysis-revision-1', reviewedHash: hash('d'), feedback: 'Clarify actor scope.' },
        'ANALYSIS',
      ),
      analysisRevisionCommand('PUBLISH_ANALYSIS', publish('analysis-revision-2'), 'ANALYSIS_REVIEW'),
    ],
    expectedTerminalStage: 'ANALYSIS_REVIEW',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'reconnect-and-reclaim',
    purpose: 'Resume an exact structured blocker.',
    initialStage: 'DISCOVERY',
    steps: [
      reconnectCommand('RESUME_BLOCKER', { blockerId: 'blocker-1', resolutionArtifactIds: ['answer-1'] }, 'DISCOVERY'),
    ],
    expectedTerminalStage: 'DISCOVERY',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'stale-command',
    purpose: 'Reject a stale compare-and-swap command.',
    initialStage: 'ANALYSIS_REVIEW',
    steps: [
      staleCommand(
        'DECIDE_ANALYSIS',
        { revisionId: 'analysis-revision-1', contentHash: hash('d'), decision: 'APPROVED' },
        'ANALYSIS_REVIEW',
        true,
      ),
    ],
    expectedTerminalStage: 'ANALYSIS_REVIEW',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'partial-scenario-approval',
    purpose: 'Bind individual approved and rejected revisions.',
    initialStage: 'SCENARIO_REVIEW',
    steps: [
      partialApprovalCommand(
        'DECIDE_SCENARIOS',
        {
          portfolioRevisionId: 'portfolio-revision-1',
          portfolioHash: hash('d'),
          approvedScenarioRevisionIds: ['scenario-1'],
          rejectedScenarioRevisionIds: ['scenario-2'],
          feedback: 'Scenario 2 duplicates coverage.',
        },
        'AUTOMATION',
      ),
      {
        kind: 'ARTIFACT_LINK',
        link: link(
          'APPROVES',
          plainArtifact('JOURNEY_APPROVAL', 'approval-1'),
          artifact('SCENARIO_REVISION', 'scenario-1'),
        ),
        expectedCode: 'PARTIAL_APPROVAL',
      },
    ],
    expectedTerminalStage: 'AUTOMATION',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'worker-replacement',
    purpose: 'Replace an expired attempt on the same work item.',
    initialStage: 'AUTOMATION',
    steps: [
      { kind: 'WORK_TRANSITION', from: 'IN_PROGRESS', to: 'LEASE_EXPIRED' },
      { kind: 'WORK_TRANSITION', from: 'LEASE_EXPIRED', to: 'REPLACEMENT_REQUESTED' },
      { kind: 'WORK_TRANSITION', from: 'REPLACEMENT_REQUESTED', to: 'WORKER_REQUESTED' },
    ],
    expectedTerminalStage: 'AUTOMATION',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'unsupported-provider-boundary',
    purpose: 'Refuse start when a required boundary is unsupported.',
    initialStage: 'TRIAGE',
    steps: [
      {
        kind: 'SPAWN',
        expectedWorkStatus: 'BLOCKED',
        receipt: {
          schemaVersion: baseCommand.schemaVersion,
          outcome: 'REFUSED',
          spawnReceiptId: 'spawn-refused',
          assignmentId: 'assignment-1',
          workItemId: 'work-1',
          attemptId: 'attempt-1',
          roleDefinitionDigest: hash('e'),
          capabilityProfileDigest: hash('f'),
          boundaries: [
            {
              boundary: 'LIFECYCLE_COMMAND',
              requested: 'No lifecycle mutation authority.',
              status: 'UNSUPPORTED',
              evidence: [],
            },
          ],
          refusalCode: 'REQUIRED_BOUNDARY_UNSUPPORTED',
          refusedAt: '2026-08-28T00:00:00.000Z',
        },
      },
    ],
    expectedTerminalStage: 'TRIAGE',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'remediation-rerun-cycle',
    purpose: 'Start an immutable successor cycle.',
    initialStage: 'REPORT_REVIEW',
    steps: [
      remediationCommand(
        'START_REMEDIATION_CYCLE',
        { reportRevisionId: 'report-revision-1', remediationScope: 'Rerun the failed checkout scenario.' },
        'AUTOMATION',
      ),
      {
        kind: 'ARTIFACT_LINK',
        link: link('RERUNS', plainArtifact('TEST_RUN', 'run-2'), plainArtifact('TEST_RUN', 'run-1')),
        expectedCode: 'RERUN_LINEAGE',
      },
    ],
    expectedTerminalStage: 'AUTOMATION',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'target-defect',
    purpose: 'Attribute sealed evidence to the target.',
    initialStage: 'TRIAGE',
    steps: [
      targetDefectCommand('PUBLISH_TRIAGE_REPORT', publish('report-golden-revision'), 'REPORT_REVIEW'),
      { kind: 'ATTRIBUTION', attribution: attribution('TARGET_DEFECT') },
      {
        kind: 'ARTIFACT_LINK',
        link: link('ATTRIBUTES', reportReference, plainArtifact('EVIDENCE_RECEIPT', 'evidence-1')),
        expectedCode: 'TARGET_DEFECT',
      },
    ],
    expectedTerminalStage: 'REPORT_REVIEW',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'validation-design-defect',
    purpose: 'Keep design defects distinct from target outcome.',
    initialStage: 'TRIAGE',
    steps: [
      designDefectCommand('PUBLISH_TRIAGE_REPORT', publish('report-golden-revision'), 'REPORT_REVIEW'),
      { kind: 'ATTRIBUTION', attribution: attribution('VALIDATION_DESIGN_DEFECT') },
      {
        kind: 'ARTIFACT_LINK',
        link: link('ATTRIBUTES', reportReference, plainArtifact('EVIDENCE_RECEIPT', 'evidence-1')),
        expectedCode: 'VALIDATION_DESIGN_DEFECT',
      },
    ],
    expectedTerminalStage: 'REPORT_REVIEW',
  },
  {
    fixtureVersion: 'appraise.quality-journey-golden/v1',
    id: 'risk-accepted-closure',
    purpose: 'Bind exact unresolved items and report revision.',
    initialStage: 'REPORT_REVIEW',
    steps: [
      riskClosureCommand(
        'RISK_ACCEPT_AND_CLOSE',
        {
          closureId: 'closure-risk',
          reportRevisionId: reportReference.revisionId,
          reportHash: reportReference.contentHash,
          rationale: 'Accepted for this release.',
          acceptedItemIds: ['risk-1'],
        },
        'CLOSED',
      ),
      { kind: 'CLOSURE', closure: riskClosure },
    ],
    expectedTerminalStage: 'CLOSED',
  },
]

for (const fixture of qualityJourneyGoldenFixtures) validateQualityJourneyGoldenFixture(fixture)
