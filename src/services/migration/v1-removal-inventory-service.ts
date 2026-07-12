import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import type { ValidationArtifact } from '@/lib/plan-contract'

const COMPLETED_PUBLISH_PHASES = new Set(['published', 'review_ready', 'completed'])

export type V1RemovalReason =
  | 'missing-validation'
  | 'missing-provenance'
  | 'non-v2-provenance'
  | 'missing-publish-operation'
  | 'broken-publish-operation'
  | 'managed-run-without-capsule'
  | 'managed-run-without-execution-attempt'
  | 'active-managed-execution'

export type V1RemovalPlanInventory = {
  planId: string
  reasons: V1RemovalReason[]
  validationIds: string[]
  testRunIds: string[]
  activeTestRunIds: string[]
}

export type V1RemovalInventory = {
  schemaVersion: 1
  affectedPlanCount: number
  affectedTestRunCount: number
  activeExecutionCount: number
  plans: V1RemovalPlanInventory[]
}

function parseValidation(value: string | null): ValidationArtifact | null {
  if (!value) return null
  try {
    return JSON.parse(value) as ValidationArtifact
  } catch {
    return null
  }
}

type InventoryProjection = Awaited<ReturnType<PrismaClient['planProjection']['findMany']>>[number] & {
  validationAstPublishOperations: Array<{
    id: string
    astHash: string
    receiptHash: string
    runtimeInputHash: string | null
    phase: string
  }>
  testRuns: Array<{
    runId: string
    status: string
    runtimeCapsule: { id: string } | null
    runtimeCapsuleExecutionAttempt: { id: string } | null
  }>
}

function provenanceReasons(validation: ValidationArtifact | null, projection: InventoryProjection) {
  const reasons = new Set<V1RemovalReason>()
  if (!validation) reasons.add('missing-validation')
  const operations = new Map(projection.validationAstPublishOperations.map(operation => [operation.id, operation]))
  for (const node of validation?.validations ?? []) addNodeProvenanceReason(node, operations, reasons)
  return reasons
}

function addNodeProvenanceReason(
  node: ValidationArtifact['validations'][number],
  operations: Map<string, InventoryProjection['validationAstPublishOperations'][number]>,
  reasons: Set<V1RemovalReason>,
) {
  const provenance = node.astProvenance
  if (!provenance) return void reasons.add('missing-provenance')
  if (provenance.schemaVersion !== '2') return void reasons.add('non-v2-provenance')
  const operation = operations.get(provenance.publishOperationId)
  if (!operation) return void reasons.add('missing-publish-operation')
  const broken =
    operation.astHash !== provenance.astHash ||
    operation.receiptHash !== provenance.receiptHash ||
    operation.runtimeInputHash !== provenance.runtimeInputHash ||
    !COMPLETED_PUBLISH_PHASES.has(operation.phase)
  if (broken) reasons.add('broken-publish-operation')
}

function runReasons(projection: InventoryProjection, reasons: Set<V1RemovalReason>) {
  for (const run of projection.testRuns) {
    if (!run.runtimeCapsule) reasons.add('managed-run-without-capsule')
    if (!run.runtimeCapsuleExecutionAttempt) reasons.add('managed-run-without-execution-attempt')
    if (run.status === 'QUEUED' || run.status === 'RUNNING') reasons.add('active-managed-execution')
  }
}

function classifyProjection(projection: InventoryProjection): V1RemovalPlanInventory | null {
  const validation = parseValidation(projection.validationJson)
  const reasons = provenanceReasons(validation, projection)
  runReasons(projection, reasons)
  if (reasons.size === 0) return null
  return {
    planId: projection.planId,
    reasons: [...reasons].sort() as V1RemovalReason[],
    validationIds: (validation?.validations ?? []).map(node => node.id).sort(),
    testRunIds: projection.testRuns.map(run => run.runId),
    activeTestRunIds: projection.testRuns
      .filter(run => run.status === 'QUEUED' || run.status === 'RUNNING')
      .map(run => run.runId),
  }
}

export async function inventoryV1Removal(client: PrismaClient = prisma): Promise<V1RemovalInventory> {
  const projections = await client.planProjection.findMany({
    where: { deletedAt: null },
    orderBy: { planId: 'asc' },
    select: {
      planId: true,
      validationJson: true,
      validationAstPublishOperations: {
        select: {
          id: true,
          astHash: true,
          receiptHash: true,
          runtimeInputHash: true,
          phase: true,
        },
      },
      testRuns: {
        orderBy: { runId: 'asc' },
        select: {
          runId: true,
          status: true,
          runtimeCapsule: { select: { id: true } },
          runtimeCapsuleExecutionAttempt: { select: { id: true } },
        },
      },
    },
  })

  const plans = projections
    .map(projection => classifyProjection(projection as InventoryProjection))
    .filter(Boolean) as V1RemovalPlanInventory[]

  return {
    schemaVersion: 1,
    affectedPlanCount: plans.length,
    affectedTestRunCount: plans.reduce((count, plan) => count + plan.testRunIds.length, 0),
    activeExecutionCount: plans.reduce((count, plan) => count + plan.activeTestRunIds.length, 0),
    plans,
  }
}
