import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { discoveryBrowserReceiptSchema } from '@/lib/quality-journey/discovery-browser-contracts'

export const c233Phases = [
  'lineage ready',
  'browser launched',
  'left target for IdP',
  'provider success observed',
  'human return armed',
  'returned to exact target',
  'access confirmed',
  'receipt captured',
  'Scout admission accepted',
  'synthetic owner restart verified',
  'revocation verified',
] as const

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const capturedSchema = z
  .object({
    artifactId: z.string(),
    contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    receipt: discoveryBrowserReceiptSchema,
  })
  .strict()

function assertAuthenticatedReturn(receipt: z.infer<typeof discoveryBrowserReceiptSchema>) {
  if (
    receipt.accessMode !== 'AUTHENTICATED_INTENT' ||
    receipt.accessOutcome !== 'ACCESS_CONFIRMED' ||
    receipt.humanReturn?.targetUrlHash !== hash(receipt.url) ||
    Date.parse(receipt.humanReturn.committedAt) > Date.parse(receipt.capturedAt)
  )
    throw new Error('Qualification requires a confirmed authenticated return receipt.')
}

function safeCaptured(value: unknown) {
  const captured = capturedSchema.parse(value)
  const receipt = captured.receipt
  assertAuthenticatedReturn(receipt)
  const facts = [
    `Appraise loaded /checkout at ${receipt.url}.`,
    'Appraise intentionally did not collect target-controlled page title content.',
    `Appraise observed access outcome ${receipt.accessOutcome}.`,
  ]
  if (
    !/^http:\/\/127\.0\.0\.1:\d+\/checkout$/.test(receipt.url) ||
    receipt.routeId !== '/checkout' ||
    receipt.title !== '[not persisted]' ||
    canonicalContractJson(receipt.observationFacts) !== canonicalContractJson(facts) ||
    receipt.observationFactsHash !== hash(facts) ||
    captured.artifactId !== receipt.artifactId ||
    captured.contentHash !== hash(receipt)
  )
    throw new Error('Qualification receipt does not match the bounded local fixture.')
  return captured
}

/** Retains only fixed phase outcomes and the exact Appraise-issued local fixture receipt. */
export function c233ProofWriter(directory: string) {
  const phases: Array<{ phase: (typeof c233Phases)[number]; at: string }> = []
  let captured: ReturnType<typeof safeCaptured> | undefined
  let terminal = false
  let writing = false
  const assertRunning = () => {
    if (terminal || writing) throw new Error('Qualification result is terminal or a write is pending.')
  }
  const persist = async (status: 'RUNNING' | 'FAILED' | 'BASIC_SMOKE_COMPLETE') => {
    writing = true
    const result = {
      schemaVersion: 'appraise.c233-qualification/v2',
      status,
      mfa: 'NOT_QUALIFIED',
      authenticatedOwnerRestart: 'NOT_QUALIFIED',
      gate: 'C_B04_OPEN',
      phases: [...phases],
      ...(captured ? { captured } : {}),
      updatedAt: new Date().toISOString(),
    }
    const temporary = path.join(directory, `.c233-${randomUUID()}.tmp`)
    try {
      await fs.mkdir(directory, { recursive: true, mode: 0o700 })
      await fs.writeFile(temporary, canonicalContractJson(result), { mode: 0o600, flag: 'wx' })
      await fs.rename(temporary, path.join(directory, 'c2-3-live-result.json'))
    } finally {
      writing = false
      await fs.rm(temporary, { force: true })
    }
  }
  return {
    phase: async (phase: (typeof c233Phases)[number]) => {
      assertRunning()
      z.enum(c233Phases).parse(phase)
      if (c233Phases[phases.length] !== phase) throw new Error('Qualification phase is not the exact next phase.')
      if (phase === 'receipt captured' && !captured)
        throw new Error('Qualification receipt must be retained before admission.')
      phases.push({ phase, at: new Date().toISOString() })
      await persist('RUNNING')
    },
    capture: async (value: unknown) => {
      assertRunning()
      if (phases.at(-1)?.phase !== 'access confirmed' || captured)
        throw new Error('Qualification capture is not available in this phase.')
      captured = safeCaptured(value)
      await persist('RUNNING')
    },
    fail: async () => {
      assertRunning()
      terminal = true
      await persist('FAILED')
    },
    complete: async () => {
      assertRunning()
      if (phases.length !== c233Phases.length || !captured)
        throw new Error('Qualification cannot complete without every phase and authenticated receipt.')
      terminal = true
      await persist('BASIC_SMOKE_COMPLETE')
    },
  }
}
