import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { PrismaClient } from '@prisma/client'

export const DELEGATED_PHASES = ['check', 'preview', 'publish'] as const
export const DELEGATED_ACTION_CLASSES = ['validation-ast', 'custom-extension'] as const
export const DELEGATED_AUTHORIZATION_VERSION = '1' as const

export const delegatedAuthorizationClaimsSchema = z.object({
  version: z.literal(DELEGATED_AUTHORIZATION_VERSION),
  permittedActionClass: z.enum(DELEGATED_ACTION_CLASSES),
  targetFingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  briefOrPlanHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  issuer: z.string().min(1),
  expiresAt: z.string().datetime({ offset: true }),
  nonce: z.string().min(16).max(256),
  maximumPhase: z.enum(DELEGATED_PHASES),
})

export const delegatedAuthorizationReceiptSchema = z.object({
  claims: delegatedAuthorizationClaimsSchema,
  signature: z.string().regex(/^hmac-sha256:[a-f0-9]{64}$/),
})

export type DelegatedAuthorizationClaims = z.infer<typeof delegatedAuthorizationClaimsSchema>
export type DelegatedAuthorizationReceipt = z.infer<typeof delegatedAuthorizationReceiptSchema>

const canonicalClaims = (claims: DelegatedAuthorizationClaims) => JSON.stringify(claims)
const sign = (claims: DelegatedAuthorizationClaims, secret: string) =>
  `hmac-sha256:${createHmac('sha256', secret).update(canonicalClaims(claims)).digest('hex')}`

export function issueDelegatedAuthorizationReceipt(claims: DelegatedAuthorizationClaims, secret: string) {
  const parsed = delegatedAuthorizationClaimsSchema.parse(claims)
  return delegatedAuthorizationReceiptSchema.parse({ claims: parsed, signature: sign(parsed, secret) })
}

export async function authorizeDelegatedReceipt(
  receiptValue: unknown,
  expected: {
    secret: string
    targetFingerprint: string
    briefOrPlanHash: string
    actionClass: DelegatedAuthorizationClaims['permittedActionClass']
    phase: (typeof DELEGATED_PHASES)[number]
    now?: Date
    consumeNonce: (nonce: string, expiresAt: string) => Promise<boolean>
  },
) {
  const receipt = delegatedAuthorizationReceiptSchema.parse(receiptValue)
  const expectedSignature = sign(receipt.claims, expected.secret)
  const actualBytes = Buffer.from(receipt.signature)
  const expectedBytes = Buffer.from(expectedSignature)
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
    throw new Error('tampered')
  if (receipt.claims.targetFingerprint !== expected.targetFingerprint) throw new Error('target-mismatch')
  if (receipt.claims.briefOrPlanHash !== expected.briefOrPlanHash) throw new Error('plan-hash-mismatch')
  if (receipt.claims.permittedActionClass !== expected.actionClass) throw new Error('scope-escalation')
  if (DELEGATED_PHASES.indexOf(expected.phase) > DELEGATED_PHASES.indexOf(receipt.claims.maximumPhase))
    throw new Error('phase-escalation')
  if (Date.parse(receipt.claims.expiresAt) <= (expected.now ?? new Date()).getTime()) throw new Error('expired')
  if (!(await expected.consumeNonce(receipt.claims.nonce, receipt.claims.expiresAt))) throw new Error('replay')
  return receipt.claims
}

export async function consumeDelegatedAuthorizationNonce(
  client: PrismaClient,
  input: { nonce: string; issuer: string; expiresAt: string; now?: Date },
) {
  const expiresAt = new Date(input.expiresAt)
  const now = input.now ?? new Date()
  if (expiresAt.getTime() <= now.getTime()) return false
  try {
    await client.delegatedAuthorizationNonce.create({
      data: { nonce: input.nonce, issuer: input.issuer, expiresAt, consumedAt: now },
    })
    return true
  } catch (error) {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') return false
    throw error
  }
}
