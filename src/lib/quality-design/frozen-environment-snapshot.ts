import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from './state'

type FrozenEnvironmentOwner = {
  environment: { id: string }
  targetProjectId?: string
  environmentSnapshotHash?: string | null
  environmentSnapshotJson?: string | null
  environmentSnapshotVersion?: number | null
}

type RemoteEnvironmentRow = {
  id: string
  targetProjectId: string
  name: string
  baseUrl: string
  expectedPageTitle: string | null
  apiBaseUrl: string | null
  username: string | null
  credentialState: 'NONE' | 'REFERENCE_CONFIGURED' | string
  passwordEnvironmentVariable: string | null
  scopeVersion: number
}

export type FrozenEnvironmentSnapshotOptions = { required?: boolean }

function parsedHttpsOrigin(value: string, label: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin.`)
  }
  return parsed
}

function hasExactHttpsOriginShape(parsed: URL) {
  return (
    parsed.protocol === 'https:' &&
    !parsed.username &&
    !parsed.password &&
    !parsed.search &&
    !parsed.hash &&
    parsed.pathname === '/' &&
    (!parsed.port || parsed.port === '443')
  )
}

function canonicalOrigin(value: string, label: string) {
  const parsed = parsedHttpsOrigin(value, label)
  if (!hasExactHttpsOriginShape(parsed))
    throw new Error(`${label} must be an exact HTTPS origin without credentials, path, query, or fragment.`)
  return parsed.origin
}

const canonicalOriginSchema = (label: string) =>
  z
    .string()
    .min(1)
    .superRefine((value, context) => {
      try {
        if (canonicalOrigin(value, label) !== value)
          context.addIssue({ code: 'custom', message: `${label} must be canonical.` })
      } catch (error) {
        context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : String(error) })
      }
    })

/**
 * The only persisted remote environment packet. It deliberately records a
 * credential reference identity rather than a secret value, and has no
 * timestamp: scopeVersion is the durable optimistic-concurrency token.
 */
const frozenRemoteEnvironmentPacketSchema = z
  .object({
    id: z.string().min(1),
    targetProjectId: z.string().min(1),
    name: z.string().min(1),
    baseUrl: canonicalOriginSchema('Remote environment baseUrl'),
    expectedPageTitle: z.string().min(1).nullable(),
    apiBaseUrl: canonicalOriginSchema('Remote environment apiBaseUrl').nullable(),
    username: z.string().min(1).nullable(),
    hasPassword: z.boolean(),
    credentialBindingState: z.enum(['NONE', 'REFERENCE_CONFIGURED']),
    credentialReference: z.string().min(1).nullable(),
    scopeVersion: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    const configured = value.credentialBindingState === 'REFERENCE_CONFIGURED'
    if (value.hasPassword !== configured)
      context.addIssue({ code: 'custom', message: 'Credential password presence does not match its binding state.' })
    if ((value.credentialReference !== null) !== configured)
      context.addIssue({ code: 'custom', message: 'Credential reference does not match its binding state.' })
  })

export type FrozenRemoteEnvironmentPacket = z.infer<typeof frozenRemoteEnvironmentPacketSchema>

export function canonicalFrozenRemoteOrigin(value: string, label = 'Remote environment baseUrl') {
  return canonicalOrigin(value, label)
}

/** Builds the exact strict packet shared by scope issuance, TestRun creation,
 * persistence checks, materialization, and runtime evidence sealing. */
export function canonicalFrozenRemoteEnvironmentPacket(
  environment: RemoteEnvironmentRow,
): FrozenRemoteEnvironmentPacket {
  const configured = environment.credentialState === 'REFERENCE_CONFIGURED'
  const reference = environment.passwordEnvironmentVariable?.trim() || null
  return frozenRemoteEnvironmentPacketSchema.parse({
    id: environment.id,
    targetProjectId: environment.targetProjectId,
    name: environment.name,
    baseUrl: canonicalOrigin(environment.baseUrl, 'Remote environment baseUrl'),
    expectedPageTitle: environment.expectedPageTitle ?? null,
    apiBaseUrl: environment.apiBaseUrl
      ? canonicalOrigin(environment.apiBaseUrl, 'Remote environment apiBaseUrl')
      : null,
    username: environment.username ?? null,
    hasPassword: configured,
    credentialBindingState: configured ? 'REFERENCE_CONFIGURED' : 'NONE',
    credentialReference: reference,
    scopeVersion: environment.scopeVersion,
  })
}

export function frozenRemoteEnvironmentPacketSnapshot(environment: RemoteEnvironmentRow) {
  const packet = canonicalFrozenRemoteEnvironmentPacket(environment)
  return { packet, hash: hashCanonical(packet), json: canonicalContractJson(packet), version: packet.scopeVersion }
}

export function parseFrozenRemoteEnvironmentPacket(value: unknown): FrozenRemoteEnvironmentPacket {
  return frozenRemoteEnvironmentPacketSchema.parse(value)
}

/** Parses the immutable TestRun packet before it reaches runtime or evidence.
 * A hash-consistent noncanonical or incomplete JSON object is still rejected. */
export function frozenEnvironmentSnapshot<T extends FrozenEnvironmentOwner>(
  testRun: T,
  options: FrozenEnvironmentSnapshotOptions = {},
): FrozenRemoteEnvironmentPacket | null {
  if (!testRun.environmentSnapshotJson) {
    if (options.required)
      throw new Error('Remote evaluation scope TestRun lacks its required frozen environment snapshot.')
    return null
  }
  let raw: unknown
  try {
    raw = JSON.parse(testRun.environmentSnapshotJson) as unknown
  } catch {
    throw new Error('Frozen remote environment snapshot is not valid JSON.')
  }
  let packet: FrozenRemoteEnvironmentPacket
  try {
    packet = parseFrozenRemoteEnvironmentPacket(raw)
  } catch {
    throw new Error('Frozen remote environment snapshot is not a strict canonical remote packet.')
  }
  if (packet.id !== testRun.environment.id)
    throw new Error('Frozen remote environment snapshot does not match the TestRun environment.')
  if (testRun.targetProjectId && packet.targetProjectId !== testRun.targetProjectId)
    throw new Error('Frozen remote environment snapshot does not match the TestRun target project.')
  const json = canonicalContractJson(packet)
  if (testRun.environmentSnapshotJson !== json)
    throw new Error('Frozen remote environment snapshot is not canonically serialized.')
  if (!testRun.environmentSnapshotHash || hashCanonical(packet) !== testRun.environmentSnapshotHash)
    throw new Error('Frozen remote environment snapshot hash does not match the TestRun.')
  if (
    testRun.environmentSnapshotVersion === null ||
    testRun.environmentSnapshotVersion === undefined ||
    packet.scopeVersion !== testRun.environmentSnapshotVersion
  )
    throw new Error('Frozen remote environment snapshot version does not match the TestRun.')
  return packet
}

/** Runtime consumers need Environment-shaped credential fields, but every
 * mutable binding field is derived from the strict packet, never the row. */
export function runtimeEnvironmentFromFrozenPacket<T extends RemoteEnvironmentRow>(
  environment: T,
  packet: FrozenRemoteEnvironmentPacket,
): T {
  return {
    ...environment,
    id: packet.id,
    targetProjectId: packet.targetProjectId,
    name: packet.name,
    baseUrl: packet.baseUrl,
    expectedPageTitle: packet.expectedPageTitle,
    apiBaseUrl: packet.apiBaseUrl,
    username: packet.username,
    credentialState: packet.credentialBindingState,
    passwordEnvironmentVariable: packet.credentialReference,
    scopeVersion: packet.scopeVersion,
  }
}
