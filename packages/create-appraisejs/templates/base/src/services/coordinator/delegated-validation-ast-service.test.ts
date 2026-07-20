import type { PrismaClient } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { issueDelegatedAuthorizationReceipt } from '@/lib/validation-ast'
import { submitDelegatedValidationAst } from './delegated-validation-ast-service'

const hash = (value: string) => `sha256:${value.repeat(64)}`
const submission = {
  expectedPlanHash: hash('b'),
  ast: {
    schemaVersion: 1,
    id: 'delegated-ast',
    title: 'Delegated AST',
    purpose: 'Prove isolated authorized handoff.',
    coversTaskIds: ['task-one'],
    matrix: [{ environmentId: 'local' }],
    scenarios: [
      {
        id: 'scenario-one',
        title: 'Scenario',
        steps: [
          {
            id: 'step-one',
            keyword: 'Given',
            description: 'Start',
            operation: { id: 'browser.click', version: '1', inputs: {} },
          },
        ],
      },
    ],
    qualityConcerns: [],
    customExtensions: [],
  },
}

describe('delegated Validation AST handoff', () => {
  it('atomically consumes the nonce and records a non-compiling submission', async () => {
    const consumed = new Set<string>()
    const transaction = {
      delegatedAuthorizationNonce: {
        create: async ({ data }: { data: { nonce: string } }) => {
          if (consumed.has(data.nonce)) throw Object.assign(new Error('unique'), { code: 'P2002' })
          consumed.add(data.nonce)
          return data
        },
      },
      delegatedValidationAstSubmission: {
        create: async ({ data }: { data: { astId: string; astJson: string } }) => ({ id: 'submission-one', ...data }),
      },
    }
    const client = {
      $transaction: async (operation: (tx: unknown) => unknown) => operation(transaction),
    } as unknown as PrismaClient
    const receipt = issueDelegatedAuthorizationReceipt(
      {
        version: '1',
        permittedActionClass: 'validation-ast',
        targetFingerprint: hash('a'),
        briefOrPlanHash: hash('b'),
        issuer: 'coordinator',
        expiresAt: '2026-07-12T00:00:00.000Z',
        nonce: 'nonce-1234567890abcdef',
        maximumPhase: 'check',
      },
      'secret',
    )
    await expect(
      submitDelegatedValidationAst(
        { submission, receipt, targetFingerprint: hash('a'), secret: 'secret', now: new Date('2026-07-11T00:00:00Z') },
        client,
      ),
    ).resolves.toMatchObject({ status: 'accepted-for-check', nextAllowedAction: 'validation_ast_check' })
    await expect(
      submitDelegatedValidationAst(
        { submission, receipt, targetFingerprint: hash('a'), secret: 'secret', now: new Date('2026-07-11T00:00:00Z') },
        client,
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('replay') })
  })
})
