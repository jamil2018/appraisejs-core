import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { copyMigratedTestDatabase } from '@/test/plan-runtime-schema-test-helper'
import { sqliteTestClient } from '@/test/validation-ast-test-fixtures'

import { recordCoordinatorFailureReceipt } from './coordinator-failure-receipt-service'

describe('coordinator failure receipts', () => {
  let directory: string
  let client: PrismaClient

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-failure-receipt-'))
    const databasePath = path.join(directory, 'receipt.db')
    await copyMigratedTestDatabase(databasePath)
    client = sqliteTestClient(databasePath)
  })

  afterEach(async () => {
    await client.$disconnect()
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('persists only allowlisted details with a hashed idempotency key and sealed receipt hash', async () => {
    const receipt = await recordCoordinatorFailureReceipt(
      {
        schema: 'appraise.error/v1',
        errorId: '11111111-1111-4111-8111-111111111111',
        occurredAt: '2026-08-07T00:00:00.000Z',
        classification: 'state_conflict',
        code: 'state_conflict',
        message: 'A project resource with the same unique identity already exists.',
        httpStatus: 409,
        operation: {
          name: 'plans/plan-one/validations/submit',
          idempotencyKey: 'secret-idempotency-key',
        },
        operationOutcome: 'not_committed',
        targetOutcome: 'not_evaluated',
        retry: {
          safe: true,
          strategy: 'read_state_then_retry',
          nextAction: { tool: 'coordinator_error_recovery', reason: 'Read current state and retry.' },
        },
        details: { constraint: 'unique' },
      },
      client,
    )

    expect(receipt).toMatchObject({
      schemaVersion: 'appraise.error/v1',
      classification: 'state_conflict',
      code: 'state_conflict',
      operationOutcome: 'not_committed',
      idempotencyKeyHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      scrubbedDetailsJson: '{"constraint":"unique"}',
      receiptHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(receipt)).not.toContain('secret-idempotency-key')
  })

  it('keeps a server receipt when an unknown plan ID would violate the optional plan relation', async () => {
    const receipt = await recordCoordinatorFailureReceipt(
      {
        schema: 'appraise.error/v1',
        errorId: '22222222-2222-4222-8222-222222222222',
        occurredAt: '2026-08-07T00:00:00.000Z',
        classification: 'resource_missing',
        code: 'resource_missing',
        message: 'The requested resource does not exist.',
        httpStatus: 404,
        operation: { name: 'plans/missing-plan', planId: 'missing-plan' },
        operationOutcome: 'not_started',
        targetOutcome: 'not_evaluated',
        retry: {
          safe: false,
          strategy: 'do_not_retry',
          nextAction: { tool: 'coordinator_error_recovery', reason: 'Read the current state.' },
        },
      },
      client,
    )
    expect(receipt).toMatchObject({ errorId: '22222222-2222-4222-8222-222222222222', planId: null })
  })
})
