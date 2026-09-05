import type { Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { automationTargetBindingSchema, preparedRuntimeCapsuleSchema } from '@/lib/quality-journey/automation-contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { hashRuntimeCapsuleValue } from './contracts'
import type { SealedRuntimeStepDefinition } from './step-definition-closure'
import { stepInvocationSchema } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'

const resourceHashes = z.array(z.object({ id: z.string(), contentHash: z.string() }).strict())
const sourceSchema = z
  .object({
    preparedCapsuleId: z.string(),
    capsuleHash: z.string(),
    manifestHash: z.string(),
    manifestJson: z.string(),
    materializationId: z.string(),
    scenarioRevisionId: z.string(),
    scenarioContentHash: z.string(),
    targetBindingId: z.string(),
    targetBindingHash: z.string(),
    testCaseId: z.string(),
    suiteId: z.string(),
    resourceHashes,
  })
  .passthrough()

type FrozenSource = z.infer<typeof sourceSchema>
type ExecutionCycle = Prisma.QualityJourneyExecutionCycleGetPayload<Record<string, never>>

async function verifyPreparedSource(client: PrismaClient, source: FrozenSource, cycle: ExecutionCycle) {
  const prepared = await client.qualityJourneyPreparedRuntimeCapsule.findUniqueOrThrow({
    where: { id: source.preparedCapsuleId },
    include: { materialization: true },
  })
  const capsuleIdentity = preparedRuntimeCapsuleSchema.parse({
    schemaVersion: 'appraise.quality-journey/v1',
    capsuleId: prepared.id,
    journeyId: prepared.journeyId,
    targetProjectId: prepared.targetProjectId,
    cycleId: prepared.cycleId,
    materializationId: prepared.materializationId,
    inputHash: prepared.inputHash,
    manifestHash: prepared.manifestHash,
    status: prepared.status,
  })
  if (
    prepared.journeyId !== cycle.journeyId ||
    prepared.targetProjectId !== cycle.targetProjectId ||
    prepared.manifestJson !== source.manifestJson ||
    prepared.manifestHash !== source.manifestHash ||
    hashRuntimeCapsuleValue(JSON.parse(source.manifestJson)) !== source.manifestHash ||
    hashRuntimeCapsuleValue(capsuleIdentity) !== source.capsuleHash ||
    prepared.capsuleHash !== source.capsuleHash
  )
    throw new Error('Journey prepared capsule content hashes are invalid.')
  verifyMaterializedScenario(prepared, source)
}

function verifyMaterializedScenario(
  prepared: Prisma.QualityJourneyPreparedRuntimeCapsuleGetPayload<{ include: { materialization: true } }>,
  source: FrozenSource,
) {
  if (
    prepared.materializationId !== source.materializationId ||
    prepared.materialization.scenarioRevisionId !== source.scenarioRevisionId ||
    prepared.materialization.scenarioContentHash !== source.scenarioContentHash ||
    prepared.materialization.status !== 'MATERIALIZED'
  )
    throw new Error('Journey prepared capsule lineage or content hashes are invalid.')
}

function verifyRunEnvironmentSnapshot(
  run: {
    environmentSnapshotJson: string | null
    environmentSnapshotHash: string | null
    environmentSnapshotVersion: number | null
  },
  cycle: ExecutionCycle,
) {
  if (
    run.environmentSnapshotJson !== cycle.environmentSnapshotJson ||
    run.environmentSnapshotHash !== cycle.environmentSnapshotHash ||
    run.environmentSnapshotVersion !== cycle.environmentSnapshotVersion
  )
    throw new Error('Journey runtime environment snapshot differs from its immutable execution cycle.')
}

export async function loadJourneyCapsuleSource(client: PrismaClient, testRunId: string) {
  const owner = await client.qualityJourneyExecutionTestRun.findUniqueOrThrow({
    where: { testRunId },
    include: { executionCycle: true, testRun: { include: { testCases: true } } },
  })
  const cycle = owner.executionCycle
  verifyRunEnvironmentSnapshot(owner.testRun, cycle)
  const sources = z.array(sourceSchema).parse(JSON.parse(cycle.preparedCapsulesJson))
  if (hashRuntimeCapsuleValue(JSON.parse(cycle.preparedCapsulesJson)) !== cycle.preparedCapsulesHash)
    throw new Error('Journey execution source snapshot was modified.')
  const source = sources.find(item => item.preparedCapsuleId === owner.preparedCapsuleId)
  if (
    !source ||
    owner.testRun.targetProjectId !== cycle.targetProjectId ||
    owner.testRun.runId !== owner.runId ||
    owner.testRun.environmentId !== cycle.environmentId ||
    owner.testRun.browserEngine !== cycle.browserEngine
  )
    throw new Error('Journey execution run ownership does not match its frozen cycle.')
  await verifyPreparedSource(client, source, cycle)
  const bindingRow = await client.qualityJourneyAutomationTargetBinding.findUniqueOrThrow({
    where: { id: source.targetBindingId },
  })
  const binding = automationTargetBindingSchema.parse(JSON.parse(bindingRow.bindingJson))
  if (
    hashRuntimeCapsuleValue(binding) !== source.targetBindingHash ||
    hashRuntimeCapsuleValue(JSON.parse(bindingRow.resourceHashJson)) !==
      hashRuntimeCapsuleValue(source.resourceHashes) ||
    binding.targetProjectId !== cycle.targetProjectId ||
    binding.testCase.id !== source.testCaseId ||
    binding.suite.id !== source.suiteId
  )
    throw new Error('Journey prepared source binding is corrupt.')
  const links = owner.testRun.testCases
  if (links.length !== 1 || links[0].testCaseId !== binding.testCase.id || links[0].testSuiteId !== binding.suite.id)
    throw new Error('Journey runtime case selection differs from its immutable source.')
  return {
    identity: {
      targetFingerprint: cycle.targetFingerprint,
      journeyId: cycle.journeyId,
      executionCycleId: cycle.id,
      cycleId: cycle.cycleId,
      ...source,
    },
    resourceHashes: source.resourceHashes,
    selection: [
      {
        suite: { id: binding.suite.id, name: binding.suite.name },
        testCase: {
          id: binding.testCase.id,
          title: binding.testCase.title,
          description: binding.testCase.description,
          steps: binding.testCase.steps.map((step, index) => ({
            id: `qjstep_${index}`,
            order: step.order,
            label: step.label,
            gherkinStep: step.gherkinStep,
            invocation: stepInvocationSchema.parse(JSON.parse(step.invocationJson)),
          })),
        },
      },
    ],
  }
}

export type JourneyCapsuleSource = Awaited<ReturnType<typeof loadJourneyCapsuleSource>>

/** Validate the same in-memory resource bytes supplied to the compiler. */
export function verifyJourneyResourceBytes(
  source: JourneyCapsuleSource,
  definitions: SealedRuntimeStepDefinition[],
  locators: Array<{ id: string; value: string; updatedAt: Date; targetProjectId: string }>,
) {
  const frozen = new Map(source.resourceHashes.map(item => [item.id, item.contentHash]))
  for (const definition of definitions) {
    if (frozen.get(`step:${definition.step.id}:${definition.step.version}`) !== definition.hashes.definition)
      throw new Error('Journey Step Definition bytes differ from the approved resource hash.')
    if (definition.definition.execution?.kind !== 'operation')
      throw new Error('Journey execution requires an exact canonical operation binding.')
  }
  for (const locator of locators) {
    const bytes = {
      id: locator.id,
      value: locator.value,
      updatedAt: locator.updatedAt,
      targetProjectId: locator.targetProjectId,
    }
    if (frozen.get(`locator:${locator.id}`) !== hashRuntimeCapsuleValue(bytes))
      throw new Error('Journey locator bytes differ from the approved resource hash.')
  }
  for (const [id, contentHash] of frozen) {
    if (!id.startsWith('operation:')) continue
    const operation = defaultOperationDefinitions.find(item => `operation:${item.id}:${item.version}` === id)
    if (!operation || hashRuntimeCapsuleValue(operation) !== contentHash)
      throw new Error('Journey operation handler differs from its approved resource hash.')
  }
}
