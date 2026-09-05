import type { Environment } from '@prisma/client'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  frozenRemoteEnvironmentPacketSnapshot,
  frozenEnvironmentSnapshot,
  runtimeEnvironmentFromFrozenPacket,
} from '@/lib/quality-design/frozen-environment-snapshot'
import { hashQualityJourneyExecutionValue } from './execution-contracts'

const url = z
  .string()
  .url()
  .refine(value => {
    const parsed = new URL(value)
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !parsed.hash
  }, 'Execution URLs must use HTTP(S) without embedded credentials or fragments.')
const localPacket = z
  .object({
    schemaVersion: z.literal('appraise.quality-journey-execution-environment/local-v1'),
    id: z.string().min(1),
    targetProjectId: z.string().min(1),
    name: z.string(),
    baseUrl: url,
    apiBaseUrl: url.nullable(),
    expectedPageTitle: z.string().nullable(),
    username: z.string().nullable(),
    credentialState: z.enum(['NONE', 'REFERENCE_CONFIGURED']),
    passwordEnvironmentVariable: z.string().nullable(),
    scopeVersion: z.number().int().positive(),
  })
  .strict()

export function freezeJourneyExecutionEnvironment(environment: Environment, targetKind: string) {
  if (targetKind === 'REMOTE_BLACK_BOX') return frozenRemoteEnvironmentPacketSnapshot(environment)
  const packet = localPacket.parse({
    schemaVersion: 'appraise.quality-journey-execution-environment/local-v1',
    id: environment.id,
    targetProjectId: environment.targetProjectId,
    name: environment.name,
    baseUrl: environment.baseUrl,
    apiBaseUrl: environment.apiBaseUrl,
    expectedPageTitle: environment.expectedPageTitle,
    username: environment.username,
    credentialState: environment.credentialState,
    passwordEnvironmentVariable: environment.passwordEnvironmentVariable,
    scopeVersion: environment.scopeVersion,
  })
  if ((packet.credentialState === 'REFERENCE_CONFIGURED') !== Boolean(packet.passwordEnvironmentVariable))
    throw new Error('Execution credential reference does not match its binding state.')
  return {
    json: canonicalContractJson(packet),
    hash: hashQualityJourneyExecutionValue(packet),
    version: packet.scopeVersion,
  }
}

export function restoreJourneyExecutionEnvironment(run: {
  targetProjectId?: string
  environment: Environment
  environmentSnapshotJson?: string | null
  environmentSnapshotHash?: string | null
  environmentSnapshotVersion?: number | null
}): Environment {
  if (!run.environmentSnapshotJson || !run.environmentSnapshotHash)
    throw new Error('Journey execution requires its frozen environment.')
  const value: unknown = JSON.parse(run.environmentSnapshotJson)
  const local = localPacket.safeParse(value)
  if (!local.success) {
    const packet = frozenEnvironmentSnapshot(run, { required: true })!
    return runtimeEnvironmentFromFrozenPacket(run.environment as never, packet) as Environment
  }
  if (
    hashQualityJourneyExecutionValue(local.data) !== run.environmentSnapshotHash ||
    local.data.scopeVersion !== run.environmentSnapshotVersion ||
    local.data.id !== run.environment.id ||
    (run.targetProjectId && local.data.targetProjectId !== run.targetProjectId)
  )
    throw new Error('Journey execution environment snapshot identity is invalid.')
  const environment = localPacket.omit({ schemaVersion: true }).strip().parse(local.data)
  return { ...run.environment, ...environment }
}
