import { describe, expect, it } from 'vitest'
import { discoveryBrowserReceiptSchema } from './discovery-browser-contracts'

const digest = (value: string) => `sha256:${value.repeat(64)}`

describe('discovery browser receipt contract', () => {
  it('accepts only the narrowly scoped, first-party receipt shape', () => {
    expect(
      discoveryBrowserReceiptSchema.parse({
        schemaVersion: 'appraise.discovery-browser-receipt/v1',
        issuer: 'APPRAISE_DISCOVERY_BROWSER_V1',
        verificationStrength: 'APPRAISE_OWNED_BROWSER',
        artifactId: 'receipt-1',
        sessionId: 'session-1',
        sessionGeneration: 1,
        processInstanceId: 'process-1',
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        cycleId: 'cycle-1',
        discoveryRevisionId: 'revision-1',
        workItemId: 'work-1',
        environmentId: 'environment-1',
        environmentScopeVersion: 1,
        routeId: '/checkout',
        snapshotId: 'snapshot-1',
        accessMode: 'ANONYMOUS',
        accessOutcome: 'ACTIVE',
        capturedAt: '2026-09-14T00:00:00.000Z',
        url: 'https://example.test/checkout',
        title: 'Checkout',
        observationFacts: ['Checkout is visible.'],
        observationFactsHash: digest('a'),
        note: 'Human-confirmed browser access records local access only; it does not identify a natural person or attest IdP identity.',
      }),
    ).toMatchObject({ issuer: 'APPRAISE_DISCOVERY_BROWSER_V1', accessOutcome: 'ACTIVE' })
  })

  it('rejects unscoped or credential-shaped receipt fields', () => {
    expect(() =>
      discoveryBrowserReceiptSchema.parse({
        schemaVersion: 'appraise.discovery-browser-receipt/v1',
        issuer: 'APPRAISE_DISCOVERY_BROWSER_V1',
        verificationStrength: 'APPRAISE_OWNED_BROWSER',
        artifactId: 'receipt-1',
        sessionId: 'session-1',
        sessionGeneration: 1,
        processInstanceId: 'process-1',
        journeyId: 'journey-1',
        targetProjectId: 'target-1',
        cycleId: 'cycle-1',
        discoveryRevisionId: 'revision-1',
        workItemId: 'work-1',
        environmentId: 'environment-1',
        environmentScopeVersion: 1,
        routeId: '/checkout',
        snapshotId: 'snapshot-1',
        accessMode: 'ANONYMOUS',
        accessOutcome: 'ACTIVE',
        capturedAt: '2026-09-14T00:00:00.000Z',
        url: 'https://example.test/checkout',
        title: 'Checkout',
        observationFacts: ['Checkout is visible.'],
        observationFactsHash: digest('a'),
        note: 'Human-confirmed browser access records local access only; it does not identify a natural person or attest IdP identity.',
        cookies: 'must-not-exist',
      }),
    ).toThrow()
  })
})
