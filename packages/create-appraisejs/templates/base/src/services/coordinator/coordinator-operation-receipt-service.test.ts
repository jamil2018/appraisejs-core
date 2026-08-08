import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/plan-runtime-schema-test-helper'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'

import {
  completeCoordinatorOperation,
  prepareCoordinatorOperation,
  readCoordinatorOperationResult,
  recordCoordinatorOperationOutcome,
  resolveCoordinatorOperationFailure,
} from './coordinator-operation-receipt-service'

describe('coordinator operation receipts', () => {
  let directory: string
  let client: PrismaClient

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-operation-receipt-'))
    const databasePath = path.join(directory, 'receipt.db')
    await copyMigratedTestDatabase(databasePath)
    client = sqliteTestClient(databasePath)
  })

  afterEach(async () => {
    await client.$disconnect()
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('replays an identical request and rejects a conflicting request', async () => {
    const input = {
      operationName: 'implementation_validation_reconcile',
      scopeKey: 'plan-one',
      idempotencyKey: 'reconcile-one',
      request: { runIds: ['run-one'] },
    }
    const first = await prepareCoordinatorOperation(input, client)
    await completeCoordinatorOperation(first.receipt, { status: 'reconciled' }, client)
    const replay = await prepareCoordinatorOperation(input, client)
    expect(first.replay).toBe(false)
    expect(replay).toMatchObject({ replay: true, receipt: { id: first.receipt.id } })

    await expect(
      prepareCoordinatorOperation({ ...input, request: { runIds: ['run-two'] } }, client),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('seals a bounded committed result and records pre-commit failure outcomes', async () => {
    const prepared = await prepareCoordinatorOperation(
      {
        operationName: 'completion',
        scopeKey: 'plan-two',
        idempotencyKey: 'complete-one',
        request: { contentHash: 'sha256:one' },
      },
      client,
    )
    const completed = await completeCoordinatorOperation(prepared.receipt, { ok: true }, client)
    expect(completed).toMatchObject({ phase: 'completed', operationOutcome: 'committed' })
    expect(readCoordinatorOperationResult<{ ok: boolean }>(completed)).toEqual({ ok: true })

    const failed = await prepareCoordinatorOperation(
      {
        operationName: 'baseline_start',
        scopeKey: 'plan-two',
        idempotencyKey: 'baseline-one',
        request: {},
      },
      client,
    )
    await expect(recordCoordinatorOperationOutcome(failed.receipt, 'not_committed', client)).resolves.toMatchObject({
      phase: 'failed',
      operationOutcome: 'not_committed',
    })
  })

  it('resolves failures from durable receipt state without downgrading a committed mutation', async () => {
    const prepared = await prepareCoordinatorOperation(
      {
        operationName: 'baseline_cancel',
        scopeKey: 'plan-three',
        idempotencyKey: 'cancel-one',
        request: {},
      },
      client,
    )
    await expect(resolveCoordinatorOperationFailure({ idempotencyKey: 'cancel-one' }, client)).resolves.toBe('unknown')
    await completeCoordinatorOperation(prepared.receipt, { lifecycle: 'baseline_changes_requested' }, client)
    await expect(resolveCoordinatorOperationFailure({ idempotencyKey: 'cancel-one' }, client)).resolves.toBe(
      'committed',
    )
  })

  it('waits for an identical concurrent operation and replays its committed receipt', async () => {
    const input = {
      operationName: 'validation_review_reconcile',
      scopeKey: 'plan-four',
      idempotencyKey: 'reconcile-concurrent',
      request: { revision: 1 },
    }
    const first = await prepareCoordinatorOperation(input, client)
    const concurrent = prepareCoordinatorOperation(input, client)
    await new Promise(resolve => setTimeout(resolve, 25))
    await completeCoordinatorOperation(first.receipt, { status: 'reconciled' }, client)
    await expect(concurrent).resolves.toMatchObject({
      replay: true,
      receipt: { id: first.receipt.id, operationOutcome: 'committed' },
    })
  })

  it('correlates failure outcomes to the exact operation and resumes proven rollback', async () => {
    const shared = { scopeKey: 'plan-five', idempotencyKey: 'shared-key', request: {} }
    const committed = await prepareCoordinatorOperation({ ...shared, operationName: 'route_baseline_cancel' }, client)
    await completeCoordinatorOperation(committed.receipt, { lifecycle: 'baseline_changes_requested' }, client)
    const failed = await prepareCoordinatorOperation({ ...shared, operationName: 'route_baseline_start' }, client)
    await recordCoordinatorOperationOutcome(failed.receipt, 'not_committed', client)

    await expect(
      resolveCoordinatorOperationFailure(
        { idempotencyKey: shared.idempotencyKey, operationName: 'route_baseline_start' },
        client,
      ),
    ).resolves.toBe('not_committed')
    const resumed = await prepareCoordinatorOperation({ ...shared, operationName: 'route_baseline_start' }, client)
    expect(resumed).toMatchObject({ replay: false, receipt: { id: failed.receipt.id, operationOutcome: 'unknown' } })
  })

  it('does not reclaim a live prepared receipt before its ownership lease expires', async () => {
    const input = {
      operationName: 'route_implementation_complete',
      scopeKey: 'plan-six',
      idempotencyKey: 'live-completion',
      request: { contentHash: 'sha256:live' },
      recoverUnknown: true,
    }
    const live = await prepareCoordinatorOperation(input, client)
    await expect(prepareCoordinatorOperation(input, client)).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      client.coordinatorOperationReceipt.findUniqueOrThrow({ where: { id: live.receipt.id } }),
    ).resolves.toMatchObject({ phase: 'prepared', operationOutcome: 'unknown', startedAt: live.receipt.startedAt })
  })

  it('fences stale owners and admits only one expired-lease reclaimer', async () => {
    const input = {
      operationName: 'route_baseline_reconcile',
      scopeKey: 'plan-seven',
      idempotencyKey: 'expired-reconcile',
      request: {},
      recoverUnknown: true,
    }
    const original = await prepareCoordinatorOperation(input, client)
    const expiredAt = new Date(Date.now() - 10 * 60 * 1_000)
    await client.coordinatorOperationReceipt.update({
      where: { id: original.receipt.id },
      data: { startedAt: expiredAt },
    })

    const [first, second] = await Promise.allSettled([
      prepareCoordinatorOperation(input, client),
      prepareCoordinatorOperation(input, client),
    ])
    const winners = [first, second].filter(result => result.status === 'fulfilled')
    const losers = [first, second].filter(result => result.status === 'rejected')
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    const winner = (winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof prepareCoordinatorOperation>>>).value
    expect(winner.receipt.ownerToken).not.toBe(original.receipt.ownerToken)

    await expect(completeCoordinatorOperation(original.receipt, { stale: true }, client)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(recordCoordinatorOperationOutcome(original.receipt, 'not_committed', client)).rejects.toMatchObject({
      code: 'CONFLICT',
    })
    await expect(completeCoordinatorOperation(winner.receipt, { recovered: true }, client)).resolves.toMatchObject({
      operationOutcome: 'committed',
    })
  })
})
