import { createHash } from 'node:crypto'

import { Prisma, type PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type { CoordinatorErrorEnvelope } from '@/services/shared/errors'

function digest(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function scrubbedDetailsJson(error: CoordinatorErrorEnvelope) {
  return canonicalContractJson(error.details ?? {})
}

export async function recordCoordinatorFailureReceipt(error: CoordinatorErrorEnvelope, client: PrismaClient = prisma) {
  const scrubbedDetails = scrubbedDetailsJson(error)
  const idempotencyKeyHash = error.operation.idempotencyKey ? digest(error.operation.idempotencyKey) : undefined
  const receiptHash = digest(
    canonicalContractJson({
      schemaVersion: error.schema,
      errorId: error.errorId,
      classification: error.classification,
      code: error.code,
      httpStatus: error.httpStatus,
      operation: {
        name: error.operation.name,
        ...(error.operation.planId ? { planId: error.operation.planId } : {}),
        ...(idempotencyKeyHash ? { idempotencyKeyHash } : {}),
      },
      operationOutcome: error.operationOutcome,
      retry: error.retry,
      scrubbedDetails,
    }),
  )
  const data = {
    schemaVersion: error.schema,
    errorId: error.errorId,
    classification: error.classification,
    code: error.code,
    httpStatus: error.httpStatus,
    operationName: error.operation.name,
    planId: error.operation.planId,
    idempotencyKeyHash,
    phase: 'failed',
    operationOutcome: error.operationOutcome,
    retryStrategy: error.retry.strategy,
    scrubbedDetailsJson: scrubbedDetails,
    receiptHash,
  }
  try {
    return await client.coordinatorFailureReceipt.create({ data })
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2003' || !data.planId) throw error
    return client.coordinatorFailureReceipt.create({ data: { ...data, planId: null } })
  }
}
