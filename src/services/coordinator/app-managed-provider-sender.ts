import { canonicalContractJson } from '@/lib/catalog-contracts'
import { z } from 'zod'
import {
  classifyManagedAnalysisFailure,
  inspectManagedCodexPrerequisites,
  runManagedAnalysis,
} from '@/lib/quality-journey/codex-app-server/managed-analysis-sender'
import {
  bindClaudeCodeJourneySender,
  classifyClaudeCodeJourneyFailure,
} from '@/services/provider-connection/claude-code-journey-sender'
import { ServiceError } from '@/services/shared/errors'
import type { Prisma } from '@prisma/client'
import {
  parseManagedWorkerPreferences,
  type ManagedWorkerPreferences,
} from '@/lib/quality-journey/managed-worker-preferences'

export type ManagedJourneyProvider = 'CODEX' | 'CLAUDE_CODE'
const claudeDispatchIdentity = z.object({
  executableSha256: z.string().regex(/^[a-f0-9]{64}$/),
  accountFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  protocol: z.literal('claude-code-print/v1'),
})

export function managedJourneyProvider(journey: { managedWorkerProvider?: string | null }): ManagedJourneyProvider {
  if (journey.managedWorkerProvider === 'CLAUDE_CODE') return 'CLAUDE_CODE'
  if (journey.managedWorkerProvider === 'CODEX' || journey.managedWorkerProvider == null) return 'CODEX'
  throw new ServiceError('The Journey has an unsupported managed worker provider.', 'CONFLICT')
}

export function managedJourneyRoleEnabled(provider: ManagedJourneyProvider, codexEnabled: boolean) {
  return provider === 'CLAUDE_CODE' ? process.env.APPRAISE_LOCAL_CLAUDE_JOURNEY_ENABLED === 'true' : codexEnabled
}

export async function assertManagedProviderAtReservation(
  tx: Prisma.TransactionClient,
  input: { journeyId: string; targetProjectId: string },
  provider: ManagedJourneyProvider,
  preferences: ManagedWorkerPreferences = {},
) {
  const journey = await tx.qualityJourney.findFirst({
    where: { id: input.journeyId, targetProjectId: input.targetProjectId },
  })
  if (
    !journey ||
    journey.hostingMode !== 'APP_SERVER_LOCAL_V1' ||
    journey.status !== 'ACTIVE' ||
    managedJourneyProvider(journey) !== provider ||
    (journey.managedWorkerModel ?? undefined) !== (preferences.managedWorkerModel ?? undefined) ||
    (journey.managedWorkerEffort ?? undefined) !== (preferences.managedWorkerEffort ?? undefined)
  )
    throw new ServiceError('The Journey provider or authority changed before dispatch.', 'CONFLICT')
}

/** Bind the selected executable and account before a role claim. No provider fallback is allowed. */
export async function bindManagedJourneySender(
  provider: ManagedJourneyProvider,
  requestedPreferences: ManagedWorkerPreferences = {},
) {
  const preferences = parseManagedWorkerPreferences(provider, requestedPreferences)
  if (provider === 'CLAUDE_CODE') {
    const sender = await bindClaudeCodeJourneySender()
    const identity = claudeDispatchIdentity.parse(sender.identity)
    return {
      provider,
      managedDispatchIdentityJson: canonicalContractJson({
        provider,
        executableSha256: identity.executableSha256,
        accountFingerprint: identity.accountFingerprint,
        protocol: identity.protocol,
        ...(preferences.managedWorkerModel ? { model: preferences.managedWorkerModel } : {}),
        ...(preferences.managedWorkerEffort ? { effort: preferences.managedWorkerEffort } : {}),
      }),
      run: (prompt: string, outputSchema?: object, custody?: { attemptId: string }) => {
        void custody
        return sender.run(prompt, outputSchema, preferences)
      },
      failureDetail: classifyClaudeCodeJourneyFailure,
    }
  }
  const prerequisites = await inspectManagedCodexPrerequisites()
  if (!prerequisites.usableForDispatch)
    throw new ServiceError('Codex setup needs attention before this Journey can continue.', 'CONFLICT')
  return {
    provider,
    managedDispatchIdentityJson:
      preferences.managedWorkerModel || preferences.managedWorkerEffort
        ? canonicalContractJson({
            provider,
            model: preferences.managedWorkerModel ?? 'gpt-6.1-sol',
            effort: preferences.managedWorkerEffort ?? 'medium',
          })
        : null,
    run: (prompt: string, outputSchema?: Record<string, unknown>, custody?: { attemptId: string }) =>
      runManagedAnalysis(prompt, outputSchema, custody, preferences),
    failureDetail: classifyManagedAnalysisFailure,
  }
}
