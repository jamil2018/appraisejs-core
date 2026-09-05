import { assertQualityJourneyMutable } from './quality-journey-terminal'
import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/config/db-config'
import { qualityJourneyRemediationScope } from './quality-journey-remediation-scope'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  hashQualityJourneyExecutionValue,
  qualityJourneyExecutionCancelSchema,
  qualityJourneyExecutionConsentGrantSchema,
  qualityJourneyExecutionConsentScopeSchema,
  qualityJourneyExecutionReadSchema,
  qualityJourneyExecutionReconcileSchema,
  qualityJourneyExecutionStartSchema,
  qualityJourneyRerunApprovalSchema,
  qualityJourneyRerunProposalSchema,
  qualityJourneyRerunStartSchema,
  type QualityJourneyExecutionRuntimeAdapter,
} from '@/lib/quality-journey'
import { ServiceError } from '@/services/shared/errors'
import { freezeJourneyExecutionEnvironment } from '@/lib/quality-journey/execution-environment'
import { classifyJourneyExecutionEffects } from '@/lib/quality-journey/execution-effects'
import { processManager } from '@/lib/test-run/process-manager'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { submitDurableQualityJourneyCommandInTransaction } from './quality-journey-service'

type Db = PrismaClient | Prisma.TransactionClient
type FrozenPreparedCapsules = Awaited<ReturnType<typeof freezePreparedCapsules>>
type ExecutionReservationReplay = { replayed: true; executionCycleId: string }
type ExecutionReservationReady = {
  journey: Awaited<ReturnType<typeof scopedJourney>>
  requestHash: string
  rerun: boolean
  source: Awaited<ReturnType<typeof loadRerunPredecessor>>
  frozen: FrozenPreparedCapsules
}
const json = (value: unknown) => canonicalContractJson(value)
const hash = (value: unknown) => hashQualityJourneyExecutionValue(value)
const stableId = (prefix: string, ...parts: string[]) =>
  `${prefix}_${createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 24)}`

function defaultRuntimeAdapter(): QualityJourneyExecutionRuntimeAdapter {
  return {
    async start(input) {
      const { startQualityJourneyExecutionRuntime } = await import('./quality-journey-runtime-service')
      await startQualityJourneyExecutionRuntime(input)
    },
    async cancel(input) {
      const { cancelQualityJourneyExecutionRuntime } = await import('./quality-journey-runtime-service')
      await cancelQualityJourneyExecutionRuntime(input)
    },
    async reconcile(input) {
      const { reconcileQualityJourneyExecutionRuntime } = await import('./quality-journey-runtime-service')
      await reconcileQualityJourneyExecutionRuntime(input)
    },
  }
}

let runtimeAdapter: QualityJourneyExecutionRuntimeAdapter = defaultRuntimeAdapter()

export function registerQualityJourneyExecutionRuntimeAdapter(adapter: QualityJourneyExecutionRuntimeAdapter) {
  runtimeAdapter = adapter
}

export function resetQualityJourneyExecutionRuntimeAdapter() {
  runtimeAdapter = defaultRuntimeAdapter()
}

function conflict(message: string) {
  return new ServiceError(message, 'CONFLICT', 409)
}

async function scopedJourney(input: { journeyId: string; targetProjectId: string }, db: Db) {
  const journey = await db.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!journey) throw new ServiceError('Quality Journey target scope was not found.', 'NOT_FOUND', 404)
  return journey
}

async function scopedExecutionCycle(input: { journeyId: string; targetProjectId: string; cycleId: string }, db: Db) {
  await scopedJourney(input, db)
  const cycle = await db.qualityJourneyExecutionCycle.findFirst({
    where: { id: input.cycleId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (!cycle) throw new ServiceError('Quality Journey execution cycle is outside this target scope.', 'NOT_FOUND', 404)
  return cycle
}

async function freezePreparedCapsules(
  input: { journeyId: string; targetProjectId: string; cycleId: string; preparedRuntimeCapsuleIds: string[] },
  db: Db,
) {
  const rows = await db.qualityJourneyPreparedRuntimeCapsule.findMany({
    where: {
      id: { in: input.preparedRuntimeCapsuleIds },
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      cycleId: input.cycleId,
      status: 'PREPARED',
    },
    include: { materialization: { include: { targetBindingAssociations: { include: { targetBinding: true } } } } },
  })
  if (rows.length !== input.preparedRuntimeCapsuleIds.length)
    throw conflict('Prepared runtime capsules are missing, foreign, stale, or incomplete.')
  const frozen = await Promise.all(
    rows.map(async row => {
      if (hash(JSON.parse(row.manifestJson)) !== row.manifestHash)
        throw conflict('Prepared runtime capsule manifest hash is invalid.')
      const association = row.materialization.targetBindingAssociations[0]
      if (!association) throw conflict('Prepared runtime capsule lacks its immutable target binding.')
      const binding = association.targetBinding
      const invocations = JSON.parse(binding.bindingJson).testCase.steps.map((step: { invocationJson: string }) =>
        stepInvocationSchema.parse(JSON.parse(step.invocationJson)),
      )
      const definitions = await db.stepDefinition.findMany({
        where: {
          OR: invocations.map((invocation: { step: { id: string; version: string } }) => ({
            id: invocation.step.id,
            version: invocation.step.version,
            status: 'ready',
          })),
        },
      })
      const effects = classifyJourneyExecutionEffects(invocations, definitions)
      const resourceHashes = JSON.parse(binding.resourceHashJson) as unknown
      return {
        preparedCapsuleId: row.id,
        capsuleHash: row.capsuleHash,
        manifestHash: row.manifestHash,
        manifestJson: row.manifestJson,
        materializationId: row.materializationId,
        scenarioRevisionId: row.materialization.scenarioRevisionId,
        scenarioContentHash: row.materialization.scenarioContentHash,
        targetBindingId: binding.id,
        targetBindingHash: hash(JSON.parse(binding.bindingJson)),
        testCaseId: binding.testCaseId,
        suiteId: binding.suiteId,
        resourceHashes,
        ...effects,
      }
    }),
  )
  return frozen.sort((a, b) => a.preparedCapsuleId.localeCompare(b.preparedCapsuleId))
}

function consentScope(input: {
  targetProjectId: string
  targetFingerprint: string
  environmentId: string
  environmentSnapshotHash: string
  browserEngine: 'CHROMIUM' | 'FIREFOX' | 'WEBKIT'
  frozen: Awaited<ReturnType<typeof freezePreparedCapsules>>
}) {
  const actions = [...new Set(input.frozen.flatMap(capsule => capsule.actions ?? ['UNKNOWN_FROZEN_EFFECT']))].sort()
  return qualityJourneyExecutionConsentScopeSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    checkpoint: `START_EXECUTION:${input.environmentId}:${input.browserEngine}`,
    targetProjectId: input.targetProjectId,
    targetFingerprint: input.targetFingerprint,
    environmentSnapshotHash: input.environmentSnapshotHash,
    preparedRuntimeCapsuleIds: input.frozen.map(item => item.preparedCapsuleId),
    actions: actions.length ? actions : ['READ_ONLY_EXECUTION'],
    resourceHashes: Object.fromEntries(input.frozen.map(item => [item.preparedCapsuleId, hash(item.resourceHashes)])),
  })
}

async function ensureConsent(
  input: {
    journeyId: string
    targetProjectId: string
    consentId?: string
    scope: ReturnType<typeof consentScope>
    executionCycleId: string
  },
  tx: Prisma.TransactionClient,
) {
  const scopeHash = hash(input.scope)
  const consent = await findGrantedExecutionConsent(input, scopeHash, tx)
  if (!consent) return requestExecutionConsent(input, scopeHash, tx)
  await consumeExecutionConsent(consent, input.scope, scopeHash, tx)
  return { required: false as const, consentId: consent.id }
}

async function findGrantedExecutionConsent(
  input: {
    journeyId: string
    targetProjectId: string
    consentId?: string
  },
  scopeHash: string,
  tx: Prisma.TransactionClient,
) {
  return input.consentId
    ? await tx.qualityJourneyExecutionConsent.findFirst({
        where: { id: input.consentId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
      })
    : await tx.qualityJourneyExecutionConsent.findFirst({
        where: {
          journeyId: input.journeyId,
          targetProjectId: input.targetProjectId,
          scopeHash,
          status: 'GRANTED',
          usedAt: null,
          revokedAt: null,
          grantSource: 'UI',
          expiresAt: { gt: new Date() },
        },
      })
}

async function requestExecutionConsent(
  input: {
    journeyId: string
    targetProjectId: string
    scope: ReturnType<typeof consentScope>
    executionCycleId: string
  },
  scopeHash: string,
  tx: Prisma.TransactionClient,
) {
  const existing = await tx.qualityJourneyExecutionConsent.findFirst({
    where: { journeyId: input.journeyId, scopeHash, status: 'REQUESTED', usedAt: null, revokedAt: null },
  })
  const id = existing?.id ?? stableId('qjec', input.journeyId, scopeHash, input.executionCycleId, randomUUID())
  if (!existing)
    await tx.qualityJourneyExecutionConsent.create({
      data: {
        id,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        scopeJson: json(input.scope),
        scopeHash,
        grantSource: 'UI',
        status: 'REQUESTED',
      },
    })
  return { required: true as const, executionConsentId: id, scopeHash }
}

async function consumeExecutionConsent(
  consent: {
    id: string
    scopeHash: string
    scopeJson: string
    grantSource: string
    status: string
    usedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date | null
  },
  scope: ReturnType<typeof consentScope>,
  scopeHash: string,
  tx: Prisma.TransactionClient,
) {
  assertConsumableExecutionConsent(consent, scope, scopeHash)
  const consumed = await tx.qualityJourneyExecutionConsent.updateMany({
    where: {
      id: consent.id,
      status: 'GRANTED',
      usedAt: null,
      revokedAt: null,
      scopeHash,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    data: { status: 'CONSUMED', usedAt: new Date() },
  })
  if (consumed.count !== 1) throw new ServiceError('Execution consent was consumed concurrently.', 'UNAUTHORIZED', 403)
}

function assertConsumableExecutionConsent(
  consent: {
    scopeHash: string
    scopeJson: string
    grantSource: string
    status: string
    usedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date | null
  },
  scope: ReturnType<typeof consentScope>,
  scopeHash: string,
) {
  if (consent.scopeHash !== scopeHash || consent.scopeJson !== json(scope) || consent.grantSource !== 'UI')
    throw new ServiceError('Execution consent does not bind this exact checkpoint scope.', 'UNAUTHORIZED', 403)
  if (
    consent.status !== 'GRANTED' ||
    consent.usedAt ||
    consent.revokedAt ||
    (consent.expiresAt && consent.expiresAt <= new Date())
  )
    throw new ServiceError('Execution consent is unavailable.', 'UNAUTHORIZED', 403)
}

async function reserveExecution(
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>,
  tx: Prisma.TransactionClient,
  extra: { proposalId?: string; predecessorExecutionCycleId?: string; allowSubset?: boolean } = {},
) {
  const prepared = await prepareExecutionReservation(input, tx, extra)
  if (!('journey' in prepared)) return prepared
  const { journey, source, frozen, requestHash, rerun } = prepared
  if (!extra.allowSubset) await assertInitialPreparedSelection(input, journey, frozen, tx)
  const [environment, target] = await Promise.all([
    tx.environment.findFirst({ where: { id: input.environmentId, targetProjectId: input.targetProjectId } }),
    tx.targetProject.findUnique({ where: { id: input.targetProjectId }, select: { kind: true, fingerprint: true } }),
  ])
  if (!environment || !target) throw conflict('Execution environment or target is unavailable.')
  const environmentSnapshot = freezeJourneyExecutionEnvironment(environment, target.kind)
  const executionCycleId = stableId('qjex', input.journeyId, input.idempotencyKey)
  const consentRequired = frozen.some(item => !item.harmless)
  const consent = consentRequired
    ? await ensureConsent(
        {
          journeyId: input.journeyId,
          targetProjectId: input.targetProjectId,
          consentId: input.executionConsentId,
          scope: consentScope({
            targetProjectId: input.targetProjectId,
            targetFingerprint: target.fingerprint,
            environmentId: input.environmentId,
            environmentSnapshotHash: environmentSnapshot.hash,
            browserEngine: input.browserEngine,
            frozen,
          }),
          executionCycleId,
        },
        tx,
      )
    : null
  if (consent?.required) return { replayed: false, consentRequired: consent }
  const lifecycle = await reserveRerunLifecycle({ input, journey, source, extra, frozen, tx })
  return persistExecutionReservation({
    input,
    tx,
    extra,
    frozen,
    environmentSnapshot,
    targetFingerprint: target.fingerprint,
    executionCycleId,
    executionJourneyCycleId: lifecycle.cycleId,
    lifecycleStateHash: lifecycle.stateHash,
    requestHash,
    consumedConsentId: consent?.consentId,
    rerun,
  })
}

async function prepareExecutionReservation(
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>,
  tx: Prisma.TransactionClient,
  extra: { proposalId?: string; predecessorExecutionCycleId?: string },
): Promise<ExecutionReservationReplay | ExecutionReservationReady> {
  const initial = await validateExecutionReservationRequest(input, tx, extra)
  if ('replayed' in initial) return initial
  const source = await loadRerunPredecessor(input, tx, extra.predecessorExecutionCycleId)
  const frozen = source
    ? selectFrozenPreparedCapsules(source.preparedCapsulesJson, input.preparedRuntimeCapsuleIds)
    : await freezePreparedCapsules({ ...input, cycleId: initial.journey.activeCycleId }, tx)
  return { ...initial, source, frozen }
}

function selectFrozenPreparedCapsules(snapshotJson: string, selectedIds: string[]): FrozenPreparedCapsules {
  const snapshot = JSON.parse(snapshotJson) as FrozenPreparedCapsules
  const selected = snapshot.filter(capsule => selectedIds.includes(capsule.preparedCapsuleId))
  if (selected.length !== selectedIds.length)
    throw conflict('Rerun selection is outside the predecessor immutable prepared capsule scope.')
  return selected.sort((a, b) => a.preparedCapsuleId.localeCompare(b.preparedCapsuleId))
}

async function validateExecutionReservationRequest(
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>,
  tx: Prisma.TransactionClient,
  extra: { proposalId?: string; predecessorExecutionCycleId?: string },
): Promise<ExecutionReservationReplay | Omit<ExecutionReservationReady, 'source' | 'frozen'>> {
  const journey = await scopedJourney(input, tx)
  assertQualityJourneyMutable(journey)
  const rerun = Boolean(extra.proposalId)
  const requestHash = hash({
    input,
    proposalId: extra.proposalId,
    predecessorExecutionCycleId: extra.predecessorExecutionCycleId,
  })
  const replay = await tx.qualityJourneyExecutionCycle.findFirst({
    where: { journeyId: input.journeyId, idempotencyKey: input.idempotencyKey },
  })
  if (replay) {
    if (replay.requestHash !== requestHash)
      throw conflict('Execution idempotency key was reused with a different request.')
    return { replayed: true as const, executionCycleId: replay.id }
  }
  if (journey.stateHash !== input.expectedStateHash)
    throw conflict('Quality Journey state changed before execution reservation.')
  if (rerun ? !['TRIAGE', 'REPORT_REVIEW'].includes(journey.stage) : journey.stage !== 'AUTOMATION')
    throw conflict('Quality Journey is not ready to start this execution cycle.')
  return { journey, requestHash, rerun }
}

async function loadRerunPredecessor(
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>,
  tx: Prisma.TransactionClient,
  predecessorExecutionCycleId?: string,
) {
  if (!predecessorExecutionCycleId) return null
  const source = await tx.qualityJourneyExecutionCycle.findFirst({
    where: {
      id: predecessorExecutionCycleId,
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
    },
  })
  if (!source || !['COMPLETED', 'CANCELLED'].includes(source.status))
    throw conflict('Rerun predecessor is not a terminal execution scope.')
  if (hash(JSON.parse(source.preparedCapsulesJson)) !== source.preparedCapsulesHash)
    throw conflict('Rerun predecessor frozen prepared capsule scope is invalid.')
  return source
}

async function assertInitialPreparedSelection(
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>,
  journey: Awaited<ReturnType<typeof scopedJourney>>,
  frozen: Awaited<ReturnType<typeof freezePreparedCapsules>>,
  tx: Prisma.TransactionClient,
) {
  const allPrepared = await tx.qualityJourneyPreparedRuntimeCapsule.findMany({
    where: {
      journeyId: input.journeyId,
      targetProjectId: input.targetProjectId,
      cycleId: journey.activeCycleId,
      status: 'PREPARED',
    },
    select: { id: true },
  })
  if (json(allPrepared.map(item => item.id).sort()) !== json(input.preparedRuntimeCapsuleIds))
    throw conflict('Initial execution must cover every exact approved prepared runtime capsule.')
  const portfolio = journey.activeScenarioPortfolioRevisionId
    ? await tx.qualityJourneyScenarioPortfolioRevision.findUnique({
        where: { id: journey.activeScenarioPortfolioRevisionId },
        include: { scenarios: { include: { decisions: true } } },
      })
    : null
  const remediation = await qualityJourneyRemediationScope(journey.id, journey.activeCycleId, tx)
  const approvedScenarioIds = portfolio?.scenarios
    .filter(
      item =>
        item.decisions.some(decision => decision.decision === 'APPROVED') &&
        (!remediation || remediation.scenarioRevisionIds.includes(item.scenarioRevisionId)),
    )
    .map(item => item.scenarioRevisionId)
    .sort()
  const preparedScenarioIds = frozen.map(item => item.scenarioRevisionId).sort()
  if (!approvedScenarioIds || json(approvedScenarioIds) !== json(preparedScenarioIds))
    throw conflict('Execution is blocked until every approved scenario has an exact prepared capsule.')
}

async function reserveRerunLifecycle(input: {
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>
  journey: Awaited<ReturnType<typeof scopedJourney>>
  source: { cycleId: string } | null
  extra: { proposalId?: string }
  frozen: Awaited<ReturnType<typeof freezePreparedCapsules>>
  tx: Prisma.TransactionClient
}) {
  if (!input.extra.proposalId) return { cycleId: input.journey.activeCycleId, stateHash: input.journey.stateHash }
  if (!input.source || input.source.cycleId !== input.journey.activeCycleId)
    throw conflict('Rerun predecessor is not the terminal active execution scope.')
  const cycleId = stableId('qjcycle', input.input.journeyId, input.extra.proposalId)
  const latest = await input.tx.qualityJourneyCycle.findFirst({
    where: { journeyId: input.input.journeyId },
    orderBy: { sequence: 'desc' },
  })
  await input.tx.qualityJourneyCycle.create({
    data: {
      id: cycleId,
      journeyId: input.input.journeyId,
      sequence: (latest?.sequence ?? 0) + 1,
      predecessorCycleId: input.journey.activeCycleId,
      scopeJson: json({
        rerunProposalId: input.extra.proposalId,
        selectedPreparedCapsuleIds: input.frozen.map(item => item.preparedCapsuleId),
      }),
    },
  })
  const command = await submitDurableQualityJourneyCommandInTransaction(
    {
      schemaVersion: 'appraise.quality-journey/v1',
      command: 'START_RERUN_CYCLE',
      commandId: stableId('qjc', cycleId, 'rerun'),
      journeyId: input.input.journeyId,
      targetProjectId: input.input.targetProjectId,
      actor: 'USER',
      expectedStateHash: input.input.expectedStateHash,
      idempotencyKey: `rerun-cycle:${input.input.idempotencyKey}`,
      inputArtifactRefs: [],
      payload: { cycleId },
    },
    input.tx,
    true,
    false,
  )
  if (command.outcome !== 'COMMITTED') throw conflict('Rerun lifecycle transition could not be committed.')
  return { cycleId, stateHash: command.successorStateHash }
}

async function persistExecutionReservation(input: {
  input: ReturnType<typeof qualityJourneyExecutionStartSchema.parse>
  tx: Prisma.TransactionClient
  extra: { proposalId?: string; predecessorExecutionCycleId?: string }
  frozen: Awaited<ReturnType<typeof freezePreparedCapsules>>
  environmentSnapshot: ReturnType<typeof freezeJourneyExecutionEnvironment>
  targetFingerprint: string
  executionCycleId: string
  executionJourneyCycleId: string
  lifecycleStateHash: string
  requestHash: string
  consumedConsentId?: string
  rerun: boolean
}) {
  const {
    input: request,
    tx,
    extra,
    frozen,
    environmentSnapshot,
    targetFingerprint,
    executionCycleId,
    executionJourneyCycleId,
    lifecycleStateHash,
    requestHash,
    consumedConsentId,
    rerun,
  } = input
  const cycle = await tx.qualityJourneyExecutionCycle.create({
    data: {
      id: executionCycleId,
      journeyId: request.journeyId,
      targetProjectId: request.targetProjectId,
      cycleId: executionJourneyCycleId,
      predecessorExecutionCycleId: extra.predecessorExecutionCycleId,
      preparedCapsulesJson: json(frozen),
      preparedCapsulesHash: hash(frozen),
      environmentId: request.environmentId,
      environmentSnapshotJson: environmentSnapshot.json,
      environmentSnapshotHash: environmentSnapshot.hash,
      environmentSnapshotVersion: environmentSnapshot.version,
      targetFingerprint,
      browserEngine: request.browserEngine,
      stateHash: lifecycleStateHash,
      idempotencyKey: request.idempotencyKey,
      requestHash,
    },
  })
  if (consumedConsentId)
    await tx.qualityJourneyExecutionConsent.update({
      where: { id: consumedConsentId },
      data: { executionCycleId: cycle.id },
    })
  for (const capsule of frozen) {
    const run = await tx.testRun.create({
      data: {
        id: stableId('qjtr', executionCycleId, capsule.preparedCapsuleId),
        runId: randomUUID(),
        name: `Quality Journey ${request.journeyId} ${capsule.scenarioRevisionId}`,
        targetProjectId: request.targetProjectId,
        environmentId: request.environmentId,
        environmentSnapshotJson: environmentSnapshot.json,
        environmentSnapshotHash: environmentSnapshot.hash,
        environmentSnapshotVersion: environmentSnapshot.version,
        browserEngine: request.browserEngine,
        intent: 'INDEPENDENT',
        status: 'QUEUED',
        result: 'PENDING',
        testCases: { create: [{ testCaseId: capsule.testCaseId, testSuiteId: capsule.suiteId }] },
      },
    })
    await tx.qualityJourneyExecutionTestRun.create({
      data: {
        id: stableId('qjet', executionCycleId, capsule.preparedCapsuleId),
        executionCycleId,
        preparedCapsuleId: capsule.preparedCapsuleId,
        testRunId: run.id,
        runId: run.runId,
      },
    })
  }
  const command = rerun
    ? null
    : await submitDurableQualityJourneyCommandInTransaction(
        {
          schemaVersion: 'appraise.quality-journey/v1',
          command: 'START_EXECUTION',
          commandId: stableId('qjc', executionCycleId, 'start'),
          journeyId: request.journeyId,
          targetProjectId: request.targetProjectId,
          actor: 'RUNNER',
          expectedStateHash: request.expectedStateHash,
          idempotencyKey: `execution:${request.idempotencyKey}`,
          inputArtifactRefs: frozen.map(item => ({
            kind: 'RUNTIME_CAPSULE',
            artifactId: item.preparedCapsuleId,
            contentHash: item.capsuleHash,
          })),
          payload: {
            runtimeCapsuleIds: frozen.map(item => item.preparedCapsuleId),
            ...(request.executionConsentId ? { executionConsentId: request.executionConsentId } : {}),
          },
        },
        tx,
        true,
        false,
      )
  if (command && command.outcome !== 'COMMITTED')
    throw conflict('Execution lifecycle transition could not be committed.')
  if (extra.proposalId)
    await tx.qualityJourneyExecutionRerunProposal.update({
      where: { id: extra.proposalId },
      data: { successorExecutionCycleId: cycle.id, status: 'STARTED' },
    })
  return { replayed: false, executionCycleId }
}

export async function startQualityJourneyExecution(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyExecutionStartSchema.parse(value)
  const result = await client.$transaction(tx => reserveExecution(input, tx))
  if ('consentRequired' in result) return result
  if (!result.executionCycleId) throw conflict('Execution reservation did not produce a cycle identifier.')
  await runtimeAdapter.start({ executionCycleId: result.executionCycleId })
  return getQualityJourneyExecution(
    { journeyId: input.journeyId, targetProjectId: input.targetProjectId, cycleId: result.executionCycleId },
    client,
  )
}

export async function getQualityJourneyExecution(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyExecutionReadSchema.parse(value)
  await scopedJourney(input, client)
  const cycles = await client.qualityJourneyExecutionCycle.findMany({
    where: { journeyId: input.journeyId, ...(input.cycleId ? { id: input.cycleId } : {}) },
    include: { testRuns: { include: { testRun: { select: { status: true, result: true } } } }, evidenceReceipts: true },
    orderBy: { startedAt: 'asc' },
  })
  const [consents, proposals] = await Promise.all([
    client.qualityJourneyExecutionConsent.findMany({
      where: { journeyId: input.journeyId },
      orderBy: { createdAt: 'asc' },
    }),
    client.qualityJourneyExecutionRerunProposal.findMany({
      where: { journeyId: input.journeyId },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  return {
    cycles: cycles.map(cycle => ({
      id: cycle.id,
      status: cycle.status,
      environmentId: cycle.environmentId,
      browserEngine: cycle.browserEngine,
      testRuns: cycle.testRuns.map(binding => {
        const active = ['LAUNCHING', 'RUNNING'].includes(binding.status) || binding.testRun.status === 'RUNNING'
        return {
          testRunId: binding.testRunId,
          runId: binding.runId,
          status: binding.testRun.status,
          bindingStatus: binding.status,
          result: binding.testRun.result,
          scenarioRevisionId:
            (
              JSON.parse(cycle.preparedCapsulesJson) as Array<{ preparedCapsuleId: string; scenarioRevisionId: string }>
            ).find(item => item.preparedCapsuleId === binding.preparedCapsuleId)?.scenarioRevisionId ?? null,
          ...(active && !processManager.get(binding.runId)
            ? { diagnostic: { code: 'OWNERSHIP_LOST', duplicateLaunchPrevented: true } }
            : {}),
        }
      }),
      evidence: cycle.evidenceReceipts.map(receipt => ({ id: receipt.id, receiptHash: receipt.receiptHash })),
    })),
    consents: consents.map(consent => ({
      id: consent.id,
      scopeHash: consent.scopeHash,
      status: consent.status,
      reason: consent.reason,
      scope: JSON.parse(consent.scopeJson),
    })),
    proposals: proposals.map(proposal => ({
      id: proposal.id,
      proposalHash: proposal.proposalHash,
      status: proposal.status,
      reason: proposal.reason,
      selectedScenarioRevisionIds: JSON.parse(proposal.selectedScenariosJson),
    })),
  }
}

export async function grantQualityJourneyExecutionConsent(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyExecutionConsentGrantSchema.parse(value)
  return client.$transaction(async tx => {
    assertQualityJourneyMutable(await scopedJourney(input, tx))
    const consent = await tx.qualityJourneyExecutionConsent.findFirst({
      where: { id: input.executionConsentId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (
      !consent ||
      consent.scopeHash !== input.expectedScopeHash ||
      consent.status !== 'REQUESTED' ||
      consent.grantSource !== 'UI'
    )
      throw conflict('Execution consent cannot be granted for this scope.')
    return tx.qualityJourneyExecutionConsent.update({
      where: { id: consent.id },
      data: { status: 'GRANTED', grantedAt: new Date(), expiresAt: new Date(Date.now() + 15 * 60_000) },
    })
  })
}

export async function cancelQualityJourneyExecution(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyExecutionCancelSchema.parse(value)
  const cycle = await client.$transaction(async tx => {
    const journey = await scopedJourney(input, tx)
    assertQualityJourneyMutable(journey)
    const requestHash = hash(input)
    const replay = await tx.qualityJourneyExecutionCancellationReceipt.findFirst({
      where: { journeyId: input.journeyId, idempotencyKey: input.idempotencyKey },
      include: { executionCycle: true },
    })
    if (replay) {
      if (replay.requestHash !== requestHash)
        throw conflict('Cancellation idempotency key was reused with a different request.')
      return replay.executionCycle
    }
    if (journey.stateHash !== input.expectedStateHash)
      throw conflict('Quality Journey state changed before cancellation.')
    const target = await tx.qualityJourneyExecutionCycle.findFirst({
      where: {
        journeyId: input.journeyId,
        ...(input.cycleId ? { id: input.cycleId } : {}),
        status: { in: ['RESERVED', 'RUNNING', 'CANCELLING', 'CANCELLED'] },
      },
      orderBy: { startedAt: 'desc' },
    })
    if (!target) throw conflict('No active Quality Journey execution exists.')
    const cancelsWholeCycle = await cancelsEntireExecutionCycle(target.id, input.testRunIds, tx)
    if (cancelsWholeCycle && (target.status === 'RESERVED' || target.status === 'RUNNING'))
      await tx.qualityJourneyExecutionCycle.update({
        where: { id: target.id },
        data: { status: 'CANCELLING', cancellationReason: input.reason },
      })
    await tx.qualityJourneyExecutionCancellationReceipt.create({
      data: {
        id: stableId('qjecr', input.journeyId, input.idempotencyKey),
        journeyId: input.journeyId,
        executionCycleId: target.id,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
    })
    return target
  })
  await runtimeAdapter.cancel({ executionCycleId: cycle.id, testRunIds: input.testRunIds, reason: input.reason })
  return getQualityJourneyExecution(
    { journeyId: input.journeyId, targetProjectId: input.targetProjectId, cycleId: cycle.id },
    client,
  )
}

async function cancelsEntireExecutionCycle(
  executionCycleId: string,
  testRunIds: string[] | undefined,
  tx: Prisma.TransactionClient,
) {
  if (!testRunIds?.length) return true
  const [found, total] = await Promise.all([
    tx.qualityJourneyExecutionTestRun.count({ where: { executionCycleId, testRunId: { in: testRunIds } } }),
    tx.qualityJourneyExecutionTestRun.count({ where: { executionCycleId } }),
  ])
  if (found !== testRunIds.length) throw conflict('Cancellation test-run selection is outside this execution cycle.')
  return found === total
}

export async function reconcileQualityJourneyExecution(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyExecutionReconcileSchema.parse(value)
  const cycle = await client.$transaction(async tx => {
    assertQualityJourneyMutable(await scopedJourney(input, tx))
    return scopedExecutionCycle(input, tx)
  })
  await runtimeAdapter.reconcile({ executionCycleId: cycle.id })
  return getQualityJourneyExecution(
    { journeyId: input.journeyId, targetProjectId: input.targetProjectId, cycleId: input.cycleId },
    client,
  )
}

export async function proposeQualityJourneyRerun(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyRerunProposalSchema.parse(value)
  return client.$transaction(async tx => {
    assertQualityJourneyMutable(await scopedJourney(input, tx))
    const source = await tx.qualityJourneyExecutionCycle.findFirst({
      where: {
        id: input.sourceCycleId,
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        status: { in: ['COMPLETED', 'CANCELLED'] },
      },
      include: { evidenceReceipts: true },
    })
    if (!source) throw conflict('Rerun predecessor must be a terminal execution cycle.')
    const receiptIds = source.evidenceReceipts.map(item => item.id).sort()
    if (json(receiptIds) !== json(input.sourceEvidenceReceiptIds))
      throw conflict('Rerun scope must name exactly the predecessor evidence receipts.')
    const selectedScenarioRevisionIds = JSON.parse(source.preparedCapsulesJson).map(
      (capsule: { scenarioRevisionId: string }) => capsule.scenarioRevisionId,
    )
    if (!input.selectedScenarioRevisionIds.every(id => selectedScenarioRevisionIds.includes(id)))
      throw conflict('Rerun selection is outside the predecessor immutable execution scope.')
    const requestHash = hash(input)
    const existing = await tx.qualityJourneyExecutionRerunProposal.findFirst({
      where: { journeyId: input.journeyId, idempotencyKey: input.idempotencyKey },
    })
    if (existing) {
      if (existing.requestHash !== requestHash) throw conflict('Rerun proposal idempotency key was reused.')
      return existing
    }
    const reportBinding = await currentRerunReportBinding(input.journeyId, source.id, tx)
    const proposal = {
      ...reportBinding,
      sourceCycleId: input.sourceCycleId,
      sourceEvidenceReceiptIds: input.sourceEvidenceReceiptIds,
      selectedScenarioRevisionIds: input.selectedScenarioRevisionIds,
      reason: input.reason,
    }
    return tx.qualityJourneyExecutionRerunProposal.create({
      data: {
        id: stableId('qjrp', input.journeyId, input.idempotencyKey),
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        sourceExecutionCycleId: input.sourceCycleId,
        ...reportBinding,
        sourceEvidenceJson: json(input.sourceEvidenceReceiptIds),
        selectedScenariosJson: json(input.selectedScenarioRevisionIds),
        reason: input.reason,
        proposalHash: hash(proposal),
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
    })
  })
}

export async function approveQualityJourneyRerun(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyRerunApprovalSchema.parse(value)
  return client.$transaction(async tx => {
    assertQualityJourneyMutable(await scopedJourney(input, tx))
    const proposal = await tx.qualityJourneyExecutionRerunProposal.findFirst({
      where: { id: input.proposalId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (!proposal || proposal.proposalHash !== input.expectedProposalHash || proposal.status !== 'PROPOSED')
      throw conflict('Rerun proposal cannot be approved.')
    await assertRerunReportCurrent(proposal, tx)
    if (proposal.reportRevisionId)
      await tx.qualityJourneyReportReview.create({
        data: {
          id: stableId('qjrr', proposal.id),
          journeyId: input.journeyId,
          reportRevisionId: proposal.reportRevisionId,
          kind: 'RERUN_APPROVED',
          feedback: input.reason ?? proposal.reason,
          idempotencyKey: `rerun:${proposal.id}`,
          requestHash: hash({ proposalId: proposal.id, proposalHash: proposal.proposalHash }),
        },
      })
    return tx.qualityJourneyExecutionRerunProposal.update({
      where: { id: proposal.id },
      data: { status: 'APPROVED', approvedAt: new Date() },
    })
  })
}

export async function startQualityJourneyRerun(value: unknown, client: PrismaClient = prisma) {
  const input = qualityJourneyRerunStartSchema.parse(value)
  const result = await client.$transaction(async tx => {
    const proposal = await tx.qualityJourneyExecutionRerunProposal.findFirst({
      where: { id: input.proposalId, journeyId: input.journeyId, targetProjectId: input.targetProjectId },
    })
    if (!proposal || !['APPROVED', 'STARTED'].includes(proposal.status))
      throw new ServiceError('A persisted UI approval is required before rerunning.', 'UNAUTHORIZED', 403)
    if (proposal.status !== 'STARTED') await assertRerunReportCurrent(proposal, tx)
    const source = await tx.qualityJourneyExecutionCycle.findUniqueOrThrow({
      where: { id: proposal.sourceExecutionCycleId },
    })
    const frozen = JSON.parse(source.preparedCapsulesJson) as Array<{
      preparedCapsuleId: string
      scenarioRevisionId: string
    }>
    const selected = JSON.parse(proposal.selectedScenariosJson) as string[]
    const preparedRuntimeCapsuleIds = frozen
      .filter(item => selected.includes(item.scenarioRevisionId))
      .map(item => item.preparedCapsuleId)
      .sort()
    if (!preparedRuntimeCapsuleIds.length) throw conflict('Rerun approval does not select any frozen prepared capsule.')
    return reserveExecution(
      {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        preparedRuntimeCapsuleIds,
        environmentId: input.environmentId,
        browserEngine: input.browserEngine,
        executionConsentId: input.executionConsentId,
        expectedStateHash: input.expectedStateHash,
        idempotencyKey: input.idempotencyKey,
      },
      tx,
      { proposalId: proposal.id, predecessorExecutionCycleId: source.id, allowSubset: true },
    )
  })
  if ('consentRequired' in result) return result
  if (!result.executionCycleId) throw conflict('Rerun reservation did not produce a cycle identifier.')
  await runtimeAdapter.start({ executionCycleId: result.executionCycleId })
  return getQualityJourneyExecution(
    { journeyId: input.journeyId, targetProjectId: input.targetProjectId, cycleId: result.executionCycleId },
    client,
  )
}

async function currentRerunReportBinding(
  journeyId: string,
  sourceExecutionCycleId: string,
  tx: Prisma.TransactionClient,
  approvedProposal?: { id: string; proposalHash: string },
) {
  const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: journeyId } })
  if (journey.stage !== 'REPORT_REVIEW') return { reportRevisionId: null, reportHash: null }
  const report = await tx.qualityJourneyTriageReport.findFirst({
    where: { id: journey.activeTriageReportId ?? '', journeyId },
    include: { assignment: true, review: true },
  })
  if (
    !report ||
    !rerunReviewIsCurrent(report, approvedProposal) ||
    report.assignment.executionCycleId !== sourceExecutionCycleId
  )
    throw conflict('Report-review reruns must bind the current report and its exact execution cycle.')
  return { reportRevisionId: report.id, reportHash: report.contentHash }
}

function rerunReviewIsCurrent(
  report: { review: { kind: string; requestHash: string } | null },
  approvedProposal?: { id: string; proposalHash: string },
) {
  if (!approvedProposal) return !report.review
  return (
    report.review?.kind === 'RERUN_APPROVED' &&
    report.review.requestHash === hash({ proposalId: approvedProposal.id, proposalHash: approvedProposal.proposalHash })
  )
}

async function assertRerunReportCurrent(
  proposal: {
    id: string
    proposalHash: string
    status: string
    journeyId: string
    sourceExecutionCycleId: string
    reportRevisionId: string | null
    reportHash: string | null
  },
  tx: Prisma.TransactionClient,
) {
  const current = await currentRerunReportBinding(
    proposal.journeyId,
    proposal.sourceExecutionCycleId,
    tx,
    proposal.status === 'APPROVED' ? proposal : undefined,
  )
  if (proposal.reportRevisionId !== current.reportRevisionId || proposal.reportHash !== current.reportHash)
    throw conflict('Rerun report approval is stale; propose and approve the current report scope.')
}
