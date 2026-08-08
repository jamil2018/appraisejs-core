import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import { Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { ServiceError } from '@/services/shared/errors'

const MAX_RESULT_BYTES = 64 * 1024
const UNKNOWN_PREPARED_LEASE_MS = 5 * 60 * 1_000

function digest(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function boundedResultJson(value: unknown) {
  const serialized = canonicalContractJson(value)
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESULT_BYTES) {
    throw new ServiceError('Coordinator operation receipt result exceeds its bounded storage limit.', 'INTERNAL')
  }
  return serialized
}

export async function prepareCoordinatorOperation(
  input: PrepareCoordinatorOperationInput,
  client: PrismaClient = prisma,
) {
  const requestJson = canonicalContractJson(input.request)
  const requestHash = digest(requestJson)
  try {
    const receipt = await client.coordinatorOperationReceipt.create({
      data: {
        operationName: input.operationName,
        scopeKey: input.scopeKey,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        requestJson,
        phase: 'prepared',
        operationOutcome: 'unknown',
        planId: input.planId,
      },
    })
    return { receipt, replay: false as const }
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    return resolveExistingReceipt(input, requestHash, client)
  }
}

type CoordinatorReceiptOwner = { id: string; ownerToken: string }

type PrepareCoordinatorOperationInput = {
  operationName: string
  scopeKey: string
  idempotencyKey: string
  request: unknown
  planId?: string
  recoverUnknown?: boolean
}

function receiptKey(input: Pick<PrepareCoordinatorOperationInput, 'operationName' | 'scopeKey' | 'idempotencyKey'>) {
  return {
    operationName_scopeKey_idempotencyKey: {
      operationName: input.operationName,
      scopeKey: input.scopeKey,
      idempotencyKey: input.idempotencyKey,
    },
  }
}

async function readReceipt(
  input: Pick<PrepareCoordinatorOperationInput, 'operationName' | 'scopeKey' | 'idempotencyKey'>,
  client: PrismaClient,
) {
  return client.coordinatorOperationReceipt.findUniqueOrThrow({ where: receiptKey(input) })
}

function preparedLeaseExpired(receipt: { phase: string; startedAt: Date }) {
  return receipt.phase === 'prepared' && Date.now() - receipt.startedAt.getTime() >= UNKNOWN_PREPARED_LEASE_MS
}

async function reclaimReceipt(
  receipt: {
    id: string
    phase: string
    operationOutcome: string
    startedAt: Date
  },
  input: PrepareCoordinatorOperationInput,
  client: PrismaClient,
) {
  const canRecover =
    receipt.operationOutcome === 'not_committed' ||
    (receipt.operationOutcome === 'unknown' &&
      input.recoverUnknown &&
      (receipt.phase === 'failed' || preparedLeaseExpired(receipt)))
  if (!canRecover) return undefined

  const ownerToken = randomUUID()
  const reclaimed = await client.coordinatorOperationReceipt.updateMany({
    where: {
      id: receipt.id,
      phase: receipt.phase,
      operationOutcome: receipt.operationOutcome,
      startedAt: receipt.startedAt,
    },
    data: {
      phase: 'prepared',
      operationOutcome: 'unknown',
      ownerToken,
      startedAt: new Date(),
      completedAt: null,
    },
  })
  if (reclaimed.count !== 1) return undefined
  return client.coordinatorOperationReceipt.findUniqueOrThrow({ where: { id: receipt.id } })
}

async function resolveExistingReceipt(
  input: PrepareCoordinatorOperationInput,
  requestHash: string,
  client: PrismaClient,
) {
  let receipt = await readReceipt(input, client)
  if (receipt.requestHash !== requestHash) {
    throw new ServiceError('Idempotency key is already bound to a different operation request.', 'CONFLICT', 409, {
      operationName: input.operationName,
      scopeKey: input.scopeKey,
      operationOutcome: receipt.operationOutcome,
    })
  }
  for (let attempt = 0; receipt.operationOutcome === 'unknown' && attempt < 50; attempt += 1) {
    await delay(10)
    receipt = await readReceipt(input, client)
  }
  const reclaimed = await reclaimReceipt(receipt, input, client)
  if (reclaimed) return { receipt: reclaimed, replay: false as const }
  if (receipt.operationOutcome !== 'committed') {
    throw new ServiceError(
      'An identical coordinator operation is still in progress or requires recovery.',
      'CONFLICT',
      409,
      {
        operationName: input.operationName,
        scopeKey: input.scopeKey,
        operationOutcome: receipt.operationOutcome,
      },
    )
  }
  return { receipt, replay: true as const }
}

export async function completeCoordinatorOperation(
  owner: CoordinatorReceiptOwner,
  result: unknown,
  client: PrismaClient = prisma,
) {
  const resultJson = boundedResultJson(result)
  const existing = await client.coordinatorOperationReceipt.findUniqueOrThrow({ where: { id: owner.id } })
  if (
    existing.ownerToken === owner.ownerToken &&
    existing.operationOutcome === 'committed' &&
    existing.resultHash === digest(resultJson)
  )
    return existing
  const completed = await client.coordinatorOperationReceipt.updateMany({
    where: { id: owner.id, ownerToken: owner.ownerToken, phase: 'prepared', operationOutcome: 'unknown' },
    data: {
      phase: 'completed',
      operationOutcome: 'committed',
      resultHash: digest(resultJson),
      resultJson,
      completedAt: new Date(),
    },
  })
  if (completed.count !== 1)
    throw new ServiceError('Coordinator operation ownership changed before completion.', 'CONFLICT')
  return client.coordinatorOperationReceipt.findUniqueOrThrow({ where: { id: owner.id } })
}

export async function recordCoordinatorOperationOutcome(
  owner: CoordinatorReceiptOwner,
  operationOutcome: 'not_started' | 'not_committed' | 'committed' | 'unknown',
  client: PrismaClient = prisma,
) {
  const recorded = await client.coordinatorOperationReceipt.updateMany({
    where: { id: owner.id, ownerToken: owner.ownerToken, phase: 'prepared', operationOutcome: 'unknown' },
    data: {
      phase: operationOutcome === 'committed' ? 'completed' : 'failed',
      operationOutcome,
      completedAt: new Date(),
    },
  })
  if (recorded.count !== 1)
    throw new ServiceError('Coordinator operation ownership changed before outcome recording.', 'CONFLICT')
  return client.coordinatorOperationReceipt.findUniqueOrThrow({ where: { id: owner.id } })
}

export function readCoordinatorOperationResult<T>(receipt: { resultJson: string | null }) {
  return receipt.resultJson ? (JSON.parse(receipt.resultJson) as T) : undefined
}

export async function resolveCoordinatorOperationFailure(
  input: { planId?: string; idempotencyKey?: string; operationName?: string },
  client: PrismaClient = prisma,
) {
  if (!input.idempotencyKey) return undefined
  const receipts = await client.coordinatorOperationReceipt.findMany({
    where: {
      idempotencyKey: input.idempotencyKey,
      ...(input.operationName ? { operationName: input.operationName } : {}),
      ...(input.planId ? { planId: input.planId } : {}),
    },
    orderBy: { startedAt: 'desc' },
  })
  if (receipts.length === 0) return undefined
  const receipt = receipts.find(item => item.operationOutcome !== 'unknown') ?? receipts[0]!
  if (receipt.operationOutcome === 'committed') return 'committed' as const
  if (receipt.operationOutcome === 'not_committed') return 'not_committed' as const
  return 'unknown' as const
}
