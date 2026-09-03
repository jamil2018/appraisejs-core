import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'

import {
  assignmentManifestSchema,
  providerCapabilityProfileSchema,
  qualityJourneyContractVersion,
  roleDefinitionSchema,
  validateAssignmentManifest,
  workerResultEnvelopeSchema,
  workerSpawnReceiptSchema,
  type AssignmentManifest,
  type WorkerResultEnvelope,
  type WorkerSpawnReceipt,
} from './contracts'
import {
  qualityJourneyContractDigest,
  resolveQualityJourneyCapabilityProfile,
  resolveQualityJourneyRoleDefinition,
} from './role-definitions'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)

const spawnScopeSchema = assignmentManifestSchema.shape.scope
const runtimeBoundaryNameSchema = z.enum([
  'CONTEXT',
  'FILESYSTEM',
  'NETWORK',
  'TARGET',
  'CREDENTIAL',
  'LIFECYCLE_COMMAND',
])
const requestedBoundarySchema = z
  .object({ boundary: runtimeBoundaryNameSchema, allowedValues: z.array(z.string().min(1).max(2_000)).max(256) })
  .strict()

const workerSpawnRequestSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    requestId: id,
    assignmentId: id,
    journeyId: id,
    targetProjectId: id,
    workItemId: id,
    attemptId: id,
    role: roleDefinitionSchema.shape.role,
    roleDefinitionDigest: digest,
    capabilityProfile: providerCapabilityProfileSchema,
    capabilityProfileDigest: digest,
    requestedJudgment: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    requestedLatency: z.enum(['FAST', 'BALANCED', 'DELIBERATE']),
    inputHash: digest,
    assignment: assignmentManifestSchema,
    scope: spawnScopeSchema,
    requiredBoundaries: z.array(requestedBoundarySchema),
    requiredVerifiedBoundaries: z.array(runtimeBoundaryNameSchema),
  })
  .strict()
export type WorkerSpawnRequest = z.infer<typeof workerSpawnRequestSchema>

/**
 * Provider integrations live behind this capability-only boundary. Adapter
 * selection is deliberately not part of an Appraise authorization or spawn
 * request: a provider may change its worker implementation without changing
 * the Quality Journey identity or authority.
 */
export interface AgentFactoryProviderAdapter {
  readonly adapterId: string
  supports(request: WorkerSpawnRequest): boolean
  /** Implementations must treat dispatchKey as an idempotency key. */
  dispatch(request: WorkerSpawnRequest, dispatchKey: string): Promise<WorkerSpawnReceipt>
}

/** An adapter may throw this only when it can attest that no provider worker
 * was created for the dispatch key. All other failures are ambiguous. */
export class AgentFactoryDispatchNotStartedError extends Error {
  constructor(message = 'The provider adapter confirmed that no worker was started.') {
    super(message)
    this.name = 'AgentFactoryDispatchNotStartedError'
  }
}

const providerAdapters = new Map<string, AgentFactoryProviderAdapter>()

export function registerAgentFactoryProviderAdapter(adapter: AgentFactoryProviderAdapter): () => void {
  if (providerAdapters.has(adapter.adapterId))
    throw new Error(`Agent Factory adapter ${adapter.adapterId} is already registered.`)
  providerAdapters.set(adapter.adapterId, adapter)
  return () => providerAdapters.delete(adapter.adapterId)
}

export function clearAgentFactoryProviderAdaptersForTest(): void {
  providerAdapters.clear()
}

type SpawnRequestInput = {
  requestId: string
  attemptId: string
  manifest: AssignmentManifest
}

function resolveRegistryAuthority(manifest: AssignmentManifest) {
  const registryVersion = manifest.roleDefinition.version
  const roleDefinition = resolveQualityJourneyRoleDefinition(registryVersion, manifest.roleDefinition.role)
  const capabilityProfile = resolveQualityJourneyCapabilityProfile(
    registryVersion,
    manifest.capabilityProfile.profileId,
  )
  if (!roleDefinition || !capabilityProfile) throw new Error('Invalid assignment manifest: registry entry not found.')
  if (roleDefinition.capabilityProfileId !== capabilityProfile.profileId)
    throw new Error('Invalid assignment manifest: role and capability profile are not registered together.')
  return { roleDefinition, capabilityProfile, registryVersion }
}

function requestedBoundaryValues(
  manifest: AssignmentManifest,
  boundary: z.infer<typeof runtimeBoundaryNameSchema>,
  contextIsolation: 'NONE' | 'BOUNDED',
) {
  const values = {
    CONTEXT: [contextIsolation],
    FILESYSTEM: manifest.scope.filesystemPaths,
    NETWORK: manifest.scope.networkOrigins,
    TARGET: [manifest.scope.targetAccess, ...manifest.allowedTargetRoutes],
    CREDENTIAL: manifest.scope.credentialGrantIds,
    LIFECYCLE_COMMAND: manifest.scope.permittedCommands,
  }
  return [...new Set(values[boundary])].sort()
}

function buildWorkerSpawnRequest(input: SpawnRequestInput): WorkerSpawnRequest {
  const parsedManifest = assignmentManifestSchema.parse(input.manifest)
  const resolved = resolveRegistryAuthority(parsedManifest)
  const roleDefinition = roleDefinitionSchema.parse(resolved.roleDefinition)
  const capabilityProfile = providerCapabilityProfileSchema.parse(resolved.capabilityProfile)
  const manifest = validateAssignmentManifest(input.manifest, roleDefinition, capabilityProfile)
  if (
    manifest.roleDefinition.version !== resolved.registryVersion ||
    manifest.roleDefinition.digest !== qualityJourneyContractDigest(roleDefinition)
  )
    throw new Error('Invalid assignment manifest: role definition version or digest mismatch.')
  if (
    manifest.capabilityProfile.version !== resolved.registryVersion ||
    manifest.capabilityProfile.digest !== qualityJourneyContractDigest(capabilityProfile)
  )
    throw new Error('Invalid assignment manifest: capability profile version or digest mismatch.')
  return workerSpawnRequestSchema.parse({
    schemaVersion: qualityJourneyContractVersion,
    requestId: input.requestId,
    assignmentId: manifest.assignmentId,
    journeyId: manifest.journeyId,
    targetProjectId: manifest.targetProjectId,
    workItemId: manifest.workItemId,
    attemptId: input.attemptId,
    role: roleDefinition.role,
    roleDefinitionDigest: manifest.roleDefinition.digest,
    capabilityProfile,
    capabilityProfileDigest: manifest.capabilityProfile.digest,
    requestedJudgment: capabilityProfile.minimumJudgment,
    requestedLatency: capabilityProfile.latencyPreference,
    inputHash: manifest.inputHash,
    assignment: manifest,
    scope: manifest.scope,
    requiredBoundaries: capabilityProfile.requiredRuntimeBoundaries.map(boundary => ({
      boundary,
      allowedValues: requestedBoundaryValues(manifest, boundary, capabilityProfile.contextIsolation),
    })),
    requiredVerifiedBoundaries: capabilityProfile.requiredVerifiedRuntimeBoundaries,
  })
}

function validateCanonicalWorkerSpawnRequest(value: unknown): WorkerSpawnRequest {
  const parsed = workerSpawnRequestSchema.parse(value)
  const canonical = buildWorkerSpawnRequest({
    requestId: parsed.requestId,
    attemptId: parsed.attemptId,
    manifest: parsed.assignment,
  })
  if (canonicalContractJson(parsed) !== canonicalContractJson(canonical))
    throw new Error('Invalid worker spawn request: request does not match canonical assignment authority.')
  return parsed
}

export function createWorkerSpawnRequest(input: SpawnRequestInput): WorkerSpawnRequest {
  return buildWorkerSpawnRequest(input)
}

function receiptIdentityViolations(request: WorkerSpawnRequest, receipt: WorkerSpawnReceipt): string[] {
  const expected = [
    request.assignmentId,
    request.workItemId,
    request.attemptId,
    request.roleDefinitionDigest,
    request.capabilityProfileDigest,
  ]
  const actual = [
    receipt.assignmentId,
    receipt.workItemId,
    receipt.attemptId,
    receipt.roleDefinitionDigest,
    receipt.capabilityProfileDigest,
  ]
  return expected.some((value, index) => value !== actual[index]) ? ['spawn receipt identity mismatch'] : []
}

function requiredBoundaryViolations(
  boundary: string,
  allowedValues: readonly string[],
  evidence: WorkerSpawnReceipt['boundaries'][number] | undefined,
  requiresVerification: boolean,
): string[] {
  const violations: string[] = []
  if (!evidence) return [`required ${boundary} boundary was not reported`]
  if (evidence.status === 'UNVERIFIED' || evidence.status === 'UNSUPPORTED')
    return [`required ${boundary} boundary is ${evidence.status.toLowerCase()}`]
  if (requiresVerification && evidence.status !== 'VERIFIED')
    return [`required ${boundary} boundary must be verified before worker start`]
  if (JSON.stringify([...evidence.requested].sort()) !== JSON.stringify(allowedValues))
    violations.push(`requested ${boundary} boundary does not match the assignment`)
  if (!evidence.effective) violations.push(`effective ${boundary} boundary was not reported`)
  else if (evidence.effective.some(value => !allowedValues.includes(value)))
    violations.push(`effective ${boundary} boundary exceeds the assignment`)
  if ((requiresVerification || evidence.status === 'VERIFIED') && evidence.evidence.length === 0)
    violations.push(`verified ${boundary} boundary requires evidence`)
  return violations
}

function boundaryViolations(request: WorkerSpawnRequest, receipt: WorkerSpawnReceipt): string[] {
  const reported = new Map(receipt.boundaries.map(boundary => [boundary.boundary, boundary]))
  const uniqueness = reported.size === receipt.boundaries.length ? [] : ['runtime boundaries must be unique']
  const requested = new Set(request.requiredBoundaries.map(boundary => boundary.boundary))
  const unrequested = receipt.boundaries
    .filter(boundary => !requested.has(boundary.boundary as z.infer<typeof runtimeBoundaryNameSchema>))
    .map(boundary => `unrequested ${boundary.boundary} boundary was reported`)
  return request.requiredBoundaries.reduce<string[]>(
    (violations, boundary) => [
      ...violations,
      ...requiredBoundaryViolations(
        boundary.boundary,
        boundary.allowedValues,
        reported.get(boundary.boundary),
        request.requiredVerifiedBoundaries.includes(boundary.boundary),
      ),
    ],
    [...uniqueness, ...unrequested],
  )
}

function refusalBoundaryViolations(request: WorkerSpawnRequest, receipt: WorkerSpawnReceipt): string[] {
  const reported = new Map(receipt.boundaries.map(boundary => [boundary.boundary, boundary]))
  const violations = reported.size === receipt.boundaries.length ? [] : ['runtime boundaries must be unique']
  for (const boundary of receipt.boundaries) {
    const expected = request.requiredBoundaries.find(candidate => candidate.boundary === boundary.boundary)
    if (!expected) violations.push(`unrequested ${boundary.boundary} boundary was reported`)
    else if (JSON.stringify([...boundary.requested].sort()) !== JSON.stringify(expected.allowedValues))
      violations.push(`requested ${boundary.boundary} boundary does not match the assignment`)
  }
  return violations
}

function toolViolations(request: WorkerSpawnRequest, receipt: WorkerSpawnReceipt): string[] {
  if (receipt.outcome !== 'STARTED') return []
  const effectiveTools = new Set(receipt.effectiveWorker.toolIds)
  const permittedTools = new Set(request.scope.permittedTools)
  const violations: string[] = []
  if (effectiveTools.size !== receipt.effectiveWorker.toolIds.length)
    violations.push('effective worker tools must be unique')
  if (request.capabilityProfile.requiredTools.some(tool => !effectiveTools.has(tool)))
    violations.push('effective worker is missing a required tool')
  if (receipt.effectiveWorker.toolIds.some(tool => !permittedTools.has(tool)))
    violations.push('effective worker received an out-of-scope tool')
  if (request.capabilityProfile.forbiddenTools.some(tool => effectiveTools.has(tool)))
    violations.push('effective worker received a forbidden tool')
  return violations
}

const judgmentRank = { LOW: 1, MEDIUM: 2, HIGH: 3 } as const
const latencyRank = { FAST: 1, BALANCED: 2, DELIBERATE: 3 } as const

function effectiveCapabilityViolations(request: WorkerSpawnRequest, receipt: WorkerSpawnReceipt): string[] {
  if (receipt.outcome !== 'STARTED') return []
  const violations: string[] = []
  if (judgmentRank[receipt.effectiveWorker.reasoningLevel] < judgmentRank[request.requestedJudgment])
    violations.push('effective worker judgment is below the requested capability')
  if (latencyRank[receipt.effectiveWorker.latencyPreference] > latencyRank[request.requestedLatency])
    violations.push('effective worker latency exceeds the requested preference')
  return violations
}

export function validateWorkerSpawnReceipt(value: unknown, requestValue: unknown): WorkerSpawnReceipt {
  const request = validateCanonicalWorkerSpawnRequest(requestValue)
  const receipt = workerSpawnReceiptSchema.parse(value)
  if (receipt.outcome === 'REFUSED') {
    const unsupportedStatus = receipt.refusalCode === 'REQUIRED_BOUNDARY_UNSUPPORTED' ? 'UNSUPPORTED' : 'UNVERIFIED'
    const refusalBoundary = receipt.boundaries.find(boundary => boundary.status === unsupportedStatus)
    const violations = [
      ...receiptIdentityViolations(request, receipt),
      ...refusalBoundaryViolations(request, receipt),
      ...(refusalBoundary && request.requiredBoundaries.some(boundary => boundary.boundary === refusalBoundary.boundary)
        ? []
        : ['refusal must identify an unsupported or unverified required runtime boundary']),
      ...(refusalBoundary?.evidence.length ? [] : ['refusal boundary requires evidence']),
    ]
    if (violations.length > 0) throw new Error(`Invalid worker spawn receipt: ${violations.join('; ')}.`)
    return receipt
  }
  const violations = [
    ...receiptIdentityViolations(request, receipt),
    ...boundaryViolations(request, receipt),
    ...toolViolations(request, receipt),
    ...effectiveCapabilityViolations(request, receipt),
  ]
  if (violations.length > 0) throw new Error(`Invalid worker spawn receipt: ${violations.join('; ')}.`)
  return receipt
}

export function resolveAgentFactoryProviderAdapter(requestValue: unknown, expectedAdapterId?: string) {
  const request = validateCanonicalWorkerSpawnRequest(requestValue)
  const adapter = expectedAdapterId
    ? providerAdapters.get(expectedAdapterId)
    : [...providerAdapters.values()].find(candidate => candidate.supports(request))
  if (!adapter)
    throw new Error('No compatible Agent Factory provider adapter is available for this capability profile.')
  if (!adapter.supports(request))
    throw new Error('Persisted Agent Factory provider adapter is incompatible with this capability profile.')
  return { adapter, request }
}

export async function dispatchWorkerSpawnRequest(
  requestValue: unknown,
  dispatchKey: string,
  expectedAdapterId?: string,
) {
  const { adapter, request } = resolveAgentFactoryProviderAdapter(requestValue, expectedAdapterId)
  const receipt = await adapter.dispatch(request, dispatchKey)
  return { adapterId: adapter.adapterId, receipt: validateWorkerSpawnReceipt(receipt, request) }
}

type ResultValidationContext = {
  spawnRequest: WorkerSpawnRequest
  spawnReceipt: WorkerSpawnReceipt
  currentInputHash: string
}

export function validateWorkerResult(value: unknown, context: ResultValidationContext): WorkerResultEnvelope {
  const request = validateCanonicalWorkerSpawnRequest(context.spawnRequest)
  const manifest = request.assignment
  const roleDefinition = resolveRegistryAuthority(manifest).roleDefinition
  const receipt = validateWorkerSpawnReceipt(context.spawnReceipt, request)
  const result = workerResultEnvelopeSchema.parse(value)
  const violations: string[] = []
  if (receipt.outcome !== 'STARTED') violations.push('result came from a refused worker')
  if (result.assignmentId !== manifest.assignmentId || result.assignmentId !== receipt.assignmentId)
    violations.push('assignment identity mismatch')
  if (result.workItemId !== manifest.workItemId || result.workItemId !== receipt.workItemId)
    violations.push('work-item identity mismatch')
  if (result.attemptId !== receipt.attemptId) violations.push('attempt identity mismatch')
  if (result.role !== manifest.roleDefinition.role || result.role !== roleDefinition.role)
    violations.push('role identity mismatch')
  if (result.roleContractDigest !== manifest.roleDefinition.digest) violations.push('role contract digest mismatch')
  if (receipt.roleDefinitionDigest !== manifest.roleDefinition.digest)
    violations.push('spawn receipt role contract digest mismatch')
  if (receipt.capabilityProfileDigest !== manifest.capabilityProfile.digest)
    violations.push('spawn receipt capability profile digest mismatch')
  if (result.inputHash !== manifest.inputHash || result.inputHash !== context.currentInputHash)
    violations.push('stale input hash')
  if (result.outputs.some(output => !manifest.writableArtifactKinds.includes(output.kind)))
    violations.push('result contains an out-of-scope artifact')
  if (violations.length > 0) throw new Error(`Invalid worker result: ${violations.join('; ')}.`)
  return result
}

type ReplacementInput = {
  assignmentId: string
  stateHash: string
  inputHash: string
  inputArtifacts: AssignmentManifest['inputArtifacts']
  lease: AssignmentManifest['lease']
  idempotencyKey: string
  replacement: NonNullable<AssignmentManifest['replacement']>
}

export function createReplacementAssignment(priorValue: unknown, replacement: ReplacementInput): AssignmentManifest {
  const prior = assignmentManifestSchema.parse(priorValue)
  const { roleDefinition, capabilityProfile } = resolveRegistryAuthority(prior)
  return validateAssignmentManifest(
    {
      ...prior,
      assignmentId: replacement.assignmentId,
      stateHash: replacement.stateHash,
      inputHash: replacement.inputHash,
      inputArtifacts: replacement.inputArtifacts,
      lease: replacement.lease,
      idempotencyKey: replacement.idempotencyKey,
      replacement: replacement.replacement,
    },
    roleDefinitionSchema.parse(roleDefinition),
    providerCapabilityProfileSchema.parse(capabilityProfile),
  )
}
