import { promises as fs } from 'node:fs'

import type { PrismaClient } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPlanRuntimeTestWorkspace } from '@/test/validation-ast-test-fixtures'

import {
  createDelegatedCoordinatorReceipt,
  readDelegatedCoordinatorReceipt,
  revokeDelegatedCoordinatorReceipt,
  verifyDelegatedCoordinatorReceipt,
} from './delegated-coordinator-service'

const secret = 'delegation-test-secret'
const targetFingerprint = `sha256:${'a'.repeat(64)}`
const pathFingerprint = `sha256:${'b'.repeat(64)}`
let workspace: string
let client: PrismaClient

beforeEach(async () => {
  ;({ workspace, client } = await createPlanRuntimeTestWorkspace('appraise-delegation-', 'delegation.db'))
})

afterEach(async () => {
  await client.$disconnect()
  await fs.rm(workspace, { recursive: true, force: true })
})

async function planningReceipt(overrides: Record<string, unknown> = {}) {
  return createDelegatedCoordinatorReceipt(
    {
      parentCoordinatorId: 'parent-agent',
      delegatedCoordinatorId: 'isolated-agent',
      targetFingerprint,
      pathFingerprint,
      purpose: 'Register the target and create its reviewed plan.',
      permissions: ['target_project_register', 'plan_create'],
      prohibitions: ['validation_prepare', 'baseline_execute', 'implementation_execute'],
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      secret,
      ...overrides,
    },
    client,
  )
}

describe('durable delegated coordinator receipts', () => {
  it('authorizes bounded planning operations and records auditable consumption', async () => {
    const receipt = await planningReceipt()
    await expect(
      verifyDelegatedCoordinatorReceipt(
        {
          receipt,
          delegatedCoordinatorId: 'isolated-agent',
          targetFingerprint,
          pathFingerprint,
          permission: 'target_project_register',
          operationKey: 'register-target',
          secret,
        },
        client,
      ),
    ).resolves.toMatchObject({ parentCoordinatorId: 'parent-agent', delegatedCoordinatorId: 'isolated-agent' })
    await verifyDelegatedCoordinatorReceipt(
      {
        receipt,
        delegatedCoordinatorId: 'isolated-agent',
        targetFingerprint,
        pathFingerprint,
        permission: 'plan_create',
        operationKey: 'create-plan',
        secret,
      },
      client,
    )

    await expect(readDelegatedCoordinatorReceipt(receipt.claims.receiptId, client)).resolves.toMatchObject({
      purpose: 'Register the target and create its reviewed plan.',
      permissions: ['target_project_register', 'plan_create'],
      prohibitions: ['validation_prepare', 'baseline_execute', 'implementation_execute'],
      consumptions: [
        expect.objectContaining({ permission: 'target_project_register' }),
        expect.objectContaining({ permission: 'plan_create' }),
      ],
    })
  })

  it('fails closed for privilege escalation, wrong target, replay, expiry, and revocation', async () => {
    const receipt = await planningReceipt()
    const verify = (overrides: Record<string, unknown> = {}) =>
      verifyDelegatedCoordinatorReceipt(
        {
          receipt,
          delegatedCoordinatorId: 'isolated-agent',
          targetFingerprint,
          pathFingerprint,
          permission: 'plan_create',
          operationKey: 'create-plan',
          secret,
          ...overrides,
        },
        client,
      )

    await expect(verify({ permission: 'validation_prepare' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(verify({ targetFingerprint: `sha256:${'c'.repeat(64)}` })).rejects.toThrow(/target does not match/i)
    await expect(verify()).resolves.toBeDefined()
    await expect(verify()).rejects.toThrow(/already consumed/i)

    const expired = await planningReceipt({ expiresAt: new Date(Date.now() + 1_000).toISOString() })
    await expect(verify({ receipt: expired, now: new Date(Date.now() + 2_000) })).rejects.toThrow(/expired/i)

    const revoked = await planningReceipt()
    await revokeDelegatedCoordinatorReceipt({ id: revoked.claims.receiptId, revokedBy: 'parent-agent' }, client)
    await expect(verify({ receipt: revoked, operationKey: 'revoked-plan' })).rejects.toThrow(/revoked/i)
  })
})
