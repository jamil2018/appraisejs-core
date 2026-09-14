import { z } from 'zod'
import { qualityJourneyIdentifierSchema } from './contracts'

const id = qualityJourneyIdentifierSchema
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const timestamp = z.string().datetime()
const route = z.string().trim().min(1).max(2_000).regex(/^\//)
const safeFact = z.string().trim().min(1).max(1_000)

/** The only issuer accepted as first-party browser discovery evidence. */
export const discoveryBrowserReceiptIssuer = 'APPRAISE_DISCOVERY_BROWSER_V1' as const
export const discoveryBrowserReceiptKind = 'DISCOVERY_BROWSER_RECEIPT' as const
export const discoveryBrowserVerificationStrength = 'APPRAISE_OWNED_BROWSER' as const

const discoveryBrowserAccessModeSchema = z.enum(['ANONYMOUS', 'AUTHENTICATED_INTENT'])

export const discoveryBrowserReceiptSchema = z
  .object({
    schemaVersion: z.literal('appraise.discovery-browser-receipt/v1'),
    issuer: z.literal(discoveryBrowserReceiptIssuer),
    verificationStrength: z.literal(discoveryBrowserVerificationStrength),
    artifactId: id,
    sessionId: id,
    sessionGeneration: z.number().int().positive(),
    processInstanceId: id,
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    discoveryRevisionId: id,
    workItemId: id,
    environmentId: id,
    environmentScopeVersion: z.number().int().positive(),
    routeId: route,
    snapshotId: id,
    accessMode: discoveryBrowserAccessModeSchema,
    authFlowId: z.string().min(1).max(128).optional(),
    authPolicyHash: digest.optional(),
    authTransitOutcome: z.literal('RETURNED_TO_FROZEN_TARGET').optional(),
    accessOutcome: z.enum(['ACTIVE', 'ACCESS_CONFIRMED', 'MISSING_ACCESS']),
    capturedAt: timestamp,
    url: z.string().url().max(2_000),
    title: z.string().max(1_000),
    observationFacts: z.array(safeFact).min(1).max(64),
    observationFactsHash: digest,
    note: z.literal(
      'Human-confirmed browser access records local access only; it does not identify a natural person or attest IdP identity.',
    ),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.accessMode === 'AUTHENTICATED_INTENT') {
      if (!receipt.authFlowId || !receipt.authPolicyHash || receipt.authTransitOutcome !== 'RETURNED_TO_FROZEN_TARGET')
        context.addIssue({
          code: 'custom',
          message: 'Authenticated receipts must bind an authorized completed transit flow.',
        })
    } else if (receipt.authFlowId || receipt.authPolicyHash || receipt.authTransitOutcome)
      context.addIssue({ code: 'custom', message: 'Anonymous receipts cannot carry authentication transit fields.' })
  })

export type DiscoveryBrowserReceipt = z.infer<typeof discoveryBrowserReceiptSchema>
export type DiscoveryBrowserSessionState =
  | 'ACTIVE'
  | 'ACCESS_CONFIRMED'
  | 'MISSING_ACCESS'
  | 'EXPIRED'
  | 'LOGGED_OUT'
  | 'REVOKED'
  | 'CONTEXT_REPLACED'
  | 'CLOSED'
