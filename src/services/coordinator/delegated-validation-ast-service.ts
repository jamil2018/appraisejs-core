import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import prisma from '@/config/db-config'
import {
  authorizeDelegatedReceipt,
  consumeDelegatedAuthorizationNonce,
  delegatedAuthorizationReceiptSchema,
  validationAstSubmissionSchema,
} from '@/lib/validation-ast'
import { ServiceError } from '@/services/shared/errors'

export async function submitDelegatedValidationAst(
  input: { submission: unknown; receipt: unknown; targetFingerprint: string; secret?: string; now?: Date },
  client: PrismaClient = prisma,
) {
  const secret = input.secret ?? process.env.APPRAISE_DELEGATED_AUTHORIZATION_SECRET
  if (!secret) throw new ServiceError('Delegated authorization is not configured.', 'CONFLICT')
  const submission = validationAstSubmissionSchema.parse(input.submission)
  const receipt = delegatedAuthorizationReceiptSchema.parse(input.receipt)
  try {
    return await client.$transaction(async transaction => {
      const claims = await authorizeDelegatedReceipt(receipt, {
        secret,
        targetFingerprint: input.targetFingerprint,
        briefOrPlanHash: submission.expectedPlanHash,
        actionClass: 'validation-ast',
        phase: 'check',
        now: input.now,
        consumeNonce: (nonce, expiresAt) =>
          consumeDelegatedAuthorizationNonce(transaction as PrismaClient, {
            nonce,
            issuer: receipt.claims.issuer,
            expiresAt,
            now: input.now,
          }),
      })
      const stored = await transaction.delegatedValidationAstSubmission.create({
        data: {
          nonce: claims.nonce,
          targetFingerprint: claims.targetFingerprint,
          planHash: claims.briefOrPlanHash,
          issuer: claims.issuer,
          astId: submission.ast.id,
          astJson: JSON.stringify(submission.ast),
          receiptJson: JSON.stringify(receipt),
        },
      })
      return {
        status: 'accepted-for-check' as const,
        submissionId: stored.id,
        astId: stored.astId,
        contentHash: `sha256:${createHash('sha256').update(stored.astJson).digest('hex')}`,
        nextAllowedAction: 'validation_ast_check',
      }
    })
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'tampered',
        'target-mismatch',
        'plan-hash-mismatch',
        'scope-escalation',
        'phase-escalation',
        'expired',
        'replay',
      ].includes(error.message)
    )
      throw new ServiceError(`Delegated AST submission rejected: ${error.message}.`, 'CONFLICT')
    throw error
  }
}
