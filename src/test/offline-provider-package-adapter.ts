/** Repository-only adapter to the actual locally built/packed managed SDK composition. */
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import type { CanonicalMcpDefinition } from '@/lib/quality-journey/managed-worker-gateway'
import { createOfflineQualityJourneyRoleDelivery } from '@/services/coordinator/quality-journey-offline-role-delivery'
import type { ExternalQualityJourneySubmissionBinding } from '@/services/coordinator/quality-journey-service'

export async function createOfflineProviderPackageAdapter(options: {
  binding: ExternalQualityJourneySubmissionBinding
  canonicalDefinitions: readonly CanonicalMcpDefinition[]
  client: PrismaClient
  moduleUrl?: string
}) {
  const moduleUrl =
    options.moduleUrl ??
    process.env.APPRAISE_OFFLINE_PACKAGE_MODULE ??
    pathToFileURL(path.resolve('packages/appraisejs/dist/mcp/trusted-managed-worker-offline-composition.js')).href
  if (new URL(moduleUrl).protocol !== 'file:') throw new Error('Offline package module must be a local file')
  const packageModule = (await import(
    moduleUrl
  )) as typeof import('../../packages/appraisejs/src/mcp/trusted-managed-worker-offline-composition')

  let packageCalls = 0,
    canonicalCalls = 0
  const events: string[] = []
  const delivery = await createOfflineQualityJourneyRoleDelivery({
    ...options,
    exchange: async (toolName, args, canonical) => {
      packageCalls++
      events.push('PACKAGE_EXCHANGE')
      return composed.exchange(toolName, args, async () => {
        canonicalCalls++
        events.push('CANONICAL_CALLBACK')
        return canonical()
      })
    },
  })
  const composed = await packageModule.createTrustedManagedWorkerOfflineComposition({
    provenance: 'OFFLINE_SYNTHETIC',
    profile: delivery.profile,
    expectedProfileDigest: delivery.profileDigest,
    maxCalls: 16,
    maxResultBytes: 1_048_576,
  })
  return Object.freeze({
    ...delivery,
    close: composed.close,
    managedProfileDigest: composed.managedProfileDigest,
    supportedOperations: composed.supportedOperations,
    packageCalls: () => packageCalls,
    canonicalCalls: () => canonicalCalls,
    diagnostics: () => Object.freeze({ events: Object.freeze([...events]), composition: composed.snapshot() }),
  })
}
