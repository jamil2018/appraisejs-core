import { createHash } from 'node:crypto'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  journeyCommandResultSchema,
  journeyCommandSchema,
  qualityJourneyContractVersion,
  type JourneyCommand,
  type QualityJourneyStage,
} from './contracts'
import { qualityJourneyTransitions } from './lifecycle'
import { hashQualityJourneyState, type QualityJourneyStateHashInput } from './state'
import { expectedQualityJourneyWorkItemIds } from './runner'

export type QualityJourneyLifecycleEvent = {
  eventId: string
  sequence: number
  journeyId: string
  targetProjectId: string
  commandId: string
  idempotencyKey: string
  command: JourneyCommand['command']
  actor: JourneyCommand['actor']
  predecessorStage: QualityJourneyStage
  predecessorStateHash: string
  successorStage: QualityJourneyStage
  successorStateHash: string
}

type CommittedCommand = {
  requestHash: string
  result: Extract<ReturnType<typeof journeyCommandResultSchema.parse>, { outcome: 'COMMITTED' }>
}

export type QualityJourneyKernelState = QualityJourneyStateHashInput & {
  stateHash: string
  events: readonly QualityJourneyLifecycleEvent[]
  committedCommands: Readonly<Record<string, CommittedCommand>>
}

export function createQualityJourneyKernelState(
  input: Omit<
    QualityJourneyStateHashInput,
    | 'stage'
    | 'activeRevisionIds'
    | 'analysisReviewHash'
    | 'unresolvedQuestionIds'
    | 'blockerIds'
    | 'activeWorkItemIds'
    | 'permittedCommands'
  > &
    Partial<
      Pick<
        QualityJourneyStateHashInput,
        | 'stage'
        | 'activeRevisionIds'
        | 'analysisReviewHash'
        | 'unresolvedQuestionIds'
        | 'blockerIds'
        | 'activeWorkItemIds'
      >
    >,
): QualityJourneyKernelState {
  return finalize({
    ...input,
    stage: input.stage ?? 'INTAKE',
    activeRevisionIds: input.activeRevisionIds ?? {},
    unresolvedQuestionIds: input.unresolvedQuestionIds ?? [],
    blockerIds: input.blockerIds ?? [],
    activeWorkItemIds: input.activeWorkItemIds ?? [],
    events: [],
    committedCommands: {},
  })
}

export function submitQualityJourneyCommand(
  current: QualityJourneyKernelState,
  value: unknown,
): { state: QualityJourneyKernelState; result: ReturnType<typeof journeyCommandResultSchema.parse> } {
  const command = journeyCommandSchema.parse(value)
  if (command.journeyId !== current.journeyId || command.targetProjectId !== current.targetProjectId) {
    return rejected(current, command, 'JOURNEY_SCOPE_MISMATCH', 'Command scope does not match the journey.')
  }

  const requestHash = hashCommand(command)
  const committed = current.committedCommands[command.idempotencyKey]
  if (committed) {
    if (committed.requestHash !== requestHash) return conflict(current, command, 'IDEMPOTENCY_KEY_REUSED')
    return {
      state: current,
      result: journeyCommandResultSchema.parse({ ...committed.result, replayed: true }),
    }
  }
  if (command.expectedStateHash !== current.stateHash) return conflict(current, command, 'STALE_STATE_HASH')

  const transition = qualityJourneyTransitions.find(
    candidate =>
      candidate.from === current.stage && candidate.command === command.command && candidate.actor === command.actor,
  )
  if (!transition)
    return rejected(current, command, 'TRANSITION_NOT_ALLOWED', 'The command is not allowed for this stage and actor.')
  const blockerId = commandBlockerId(command)
  if (blockerId && !current.blockerIds.includes(blockerId)) return conflict(current, command, 'PRECONDITION_FAILED')

  const predecessorStateHash = current.stateHash
  const projected = applyProjection(current, command, transition.to)
  const sequence = current.events.length + 1
  const eventId = deterministicEventId(current.journeyId, sequence, command.commandId, requestHash)
  const parsedResult = journeyCommandResultSchema.parse({
    schemaVersion: qualityJourneyContractVersion,
    outcome: 'COMMITTED',
    commandId: command.commandId,
    eventId,
    successorStateHash: projected.stateHash,
    successorStage: projected.stage,
    replayed: false,
  })
  if (parsedResult.outcome !== 'COMMITTED') throw new Error('Committed command result failed contract parsing.')
  const result = parsedResult
  const event: QualityJourneyLifecycleEvent = {
    eventId,
    sequence,
    journeyId: current.journeyId,
    targetProjectId: current.targetProjectId,
    commandId: command.commandId,
    idempotencyKey: command.idempotencyKey,
    command: command.command,
    actor: command.actor,
    predecessorStage: current.stage,
    predecessorStateHash,
    successorStage: projected.stage,
    successorStateHash: projected.stateHash,
  }
  return {
    state: {
      ...projected,
      events: [...current.events, event],
      committedCommands: { ...current.committedCommands, [command.idempotencyKey]: { requestHash, result } },
    },
    result,
  }
}

function applyProjection(
  current: QualityJourneyKernelState,
  command: JourneyCommand,
  stage: QualityJourneyStage,
): QualityJourneyKernelState {
  const activeRevisionIds = { ...current.activeRevisionIds }
  if (command.command === 'SUBMIT_REQUIREMENT') activeRevisionIds.journey = command.payload.journeyRevisionId
  if (command.command === 'PUBLISH_ANALYSIS') activeRevisionIds.analysis = command.payload.artifactRevisionId
  if (command.command === 'PUBLISH_SCENARIO_PORTFOLIO')
    activeRevisionIds.scenarioPortfolio = command.payload.artifactRevisionId
  if (command.command === 'PUBLISH_TRIAGE_REPORT') activeRevisionIds.report = command.payload.artifactRevisionId
  const activeCycleId = command.command === 'START_RERUN_CYCLE' ? command.payload.cycleId : current.activeCycleId

  const resolvedBlockerId = commandBlockerId(command)
  return finalize({
    ...current,
    activeCycleId,
    stage,
    activeRevisionIds,
    blockerIds: resolvedBlockerId ? current.blockerIds.filter(id => id !== resolvedBlockerId) : current.blockerIds,
    activeWorkItemIds: expectedQualityJourneyWorkItemIds(current.journeyId, current.activeCycleId, stage),
  })
}

function finalize(
  input: Omit<QualityJourneyKernelState, 'stateHash' | 'permittedCommands'> & { permittedCommands?: readonly string[] },
): QualityJourneyKernelState {
  const permittedCommands = qualityJourneyTransitions
    .filter(transition => transition.from === input.stage)
    .map(transition => transition.command)
  const projection = { ...input, permittedCommands }
  return { ...projection, stateHash: hashQualityJourneyState(projection) }
}

function conflict(
  current: QualityJourneyKernelState,
  command: JourneyCommand,
  code: 'STALE_STATE_HASH' | 'IDEMPOTENCY_KEY_REUSED' | 'PRECONDITION_FAILED',
) {
  return {
    state: current,
    result: journeyCommandResultSchema.parse({
      schemaVersion: qualityJourneyContractVersion,
      outcome: 'CONFLICT',
      commandId: command.commandId,
      code,
      currentStateHash: current.stateHash,
      currentStage: current.stage,
      safeNextCommands: current.permittedCommands,
    }),
  }
}

function commandBlockerId(command: JourneyCommand): string | undefined {
  return command.command === 'RESUME_BLOCKER' ||
    command.command === 'RETRY_DISCOVERY' ||
    command.command === 'RETRY_AUTOMATION'
    ? command.payload.blockerId
    : undefined
}

function rejected(current: QualityJourneyKernelState, command: JourneyCommand, code: string, message: string) {
  return {
    state: current,
    result: journeyCommandResultSchema.parse({
      schemaVersion: qualityJourneyContractVersion,
      outcome: 'REJECTED',
      commandId: command.commandId,
      code,
      message,
    }),
  }
}

function hashCommand(command: JourneyCommand): string {
  return createHash('sha256').update(canonicalContractJson(command)).digest('hex')
}

function deterministicEventId(journeyId: string, sequence: number, commandId: string, requestHash: string): string {
  return `qje_${createHash('sha256').update(`${journeyId}:${sequence}:${commandId}:${requestHash}`).digest('hex').slice(0, 24)}`
}
