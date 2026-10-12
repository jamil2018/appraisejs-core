import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyRoleDefinitions, qualityJourneyRoleRegistryVersion } from './role-definitions'

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const role = z.enum([
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
])

const runtimeGrantPayloadSchema = z
  .object({
    schema: z.literal('appraise.managed-worker-runtime-grant/v1'),
    grantId: id,
    target: z.string().trim().min(1).max(2_000),
    targetProjectId: id,
    journeyId: id,
    workItemId: id,
    role,
    attemptId: id,
    generation: z.number().int().nonnegative(),
    leaseId: id,
    authorizationId: id,
    inputHash: digest,
    scopeHash: digest,
    profileDigest: digest,
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict()

export type ManagedWorkerRuntimePrincipal = Readonly<z.infer<typeof runtimeGrantPayloadSchema>>

export type CanonicalMcpDefinition = Readonly<{
  kind: 'tool' | 'resource'
  name: string
  description?: string
  inputSchema?: unknown
  annotations?: unknown
}>

const principalBindingSources = Object.freeze({
  actor: 'authorizationId',
  assignmentScopeHash: 'scopeHash',
  attemptId: 'attemptId',
  authorizationId: 'authorizationId',
  expectedInputHash: 'inputHash',
  expectedScopeHash: 'scopeHash',
  generation: 'generation',
  inputHash: 'inputHash',
  journeyId: 'journeyId',
  leaseId: 'leaseId',
  ownerToken: 'ownerToken',
  projectBearer: 'projectBearer',
  role: 'role',
  target: 'target',
  targetProjectId: 'targetProjectId',
  workItemId: 'workItemId',
} as const)
type PrincipalBindingSource = (typeof principalBindingSources)[keyof typeof principalBindingSources]

export type ManagedWorkerToolDefinition = Readonly<{
  name: string
  description?: string
  origin: 'mcp:appraise-quality-journey-worker'
  inputSchema: unknown
  canonicalInputSchemaHash: string
  workerInputSchemaHash: string
  principalBindings: readonly Readonly<{ path: readonly string[]; source: PrincipalBindingSource }>[]
}>

export type ManagedWorkerRegistrationProfile = Readonly<{
  schema: 'appraise.managed-worker-registration-profile/v1'
  registryVersion: typeof qualityJourneyRoleRegistryVersion
  role: z.infer<typeof role>
  abstractToolMap: Readonly<Record<string, readonly string[]>>
  tools: readonly ManagedWorkerToolDefinition[]
  contractDigest: string
}>

const roleToolMap = Object.freeze({
  REQUIREMENT_ANALYZER: Object.freeze({
    'artifact.read': Object.freeze(['quality_journey_analysis_get']),
    'artifact.propose': Object.freeze(['quality_journey_analysis_submit']),
    'work.output.submit': Object.freeze(['quality_journey_analysis_submit']),
  }),
  SCOUT: Object.freeze({
    'target.observe': Object.freeze(['quality_journey_discovery_get']),
    'evidence.publish': Object.freeze(['quality_journey_target_observation_submit']),
    'work.output.submit': Object.freeze(['quality_journey_target_observation_submit']),
  }),
  RESOURCE_EXPLORER: Object.freeze({
    'catalog.search': Object.freeze(['operation_search']),
    'artifact.read': Object.freeze(['quality_journey_discovery_get']),
    'work.output.submit': Object.freeze(['quality_journey_resource_resolution_submit']),
  }),
  TEST_SCENARIO_DESIGNER: Object.freeze({
    'artifact.read': Object.freeze(['quality_journey_scenarios_get']),
    'scenario.propose': Object.freeze(['quality_journey_scenarios_submit']),
    'work.output.submit': Object.freeze(['quality_journey_scenarios_submit']),
  }),
  AUTOMATOR: Object.freeze({
    'catalog.search': Object.freeze(['operation_search']),
    'automation.write': Object.freeze(['quality_journey_automation_materialize']),
    'runtime-capsule.publish': Object.freeze(['quality_journey_automation_materialize']),
    'work.output.submit': Object.freeze(['quality_journey_automation_materialize']),
  }),
  TRIAGER: Object.freeze({
    'artifact.read': Object.freeze(['quality_journey_triage_get']),
    'evidence.read': Object.freeze(['quality_journey_triage_evidence_read']),
    'report.propose': Object.freeze(['quality_journey_triage_submit']),
    'work.output.submit': Object.freeze(['quality_journey_triage_submit']),
  }),
} satisfies Record<z.infer<typeof role>, Readonly<Record<string, readonly string[]>>>)

export function createManagedWorkerRegistrationProfile(
  workerRole: z.infer<typeof role>,
  canonicalDefinitions: readonly CanonicalMcpDefinition[],
): ManagedWorkerRegistrationProfile {
  const parsedRole = role.parse(workerRole)
  const roleDefinition = qualityJourneyRoleDefinitions.find(definition => definition.role === parsedRole)
  if (!roleDefinition) throw new Error(`Unknown managed worker role: ${parsedRole}`)
  const mapping = roleToolMap[parsedRole]
  const permittedAbstractTools = new Set([...roleDefinition.permittedTools, ...roleDefinition.permittedCommands])
  for (const abstractTool of Object.keys(mapping)) {
    if (!permittedAbstractTools.has(abstractTool)) {
      throw new Error(`Worker gateway mapping exceeds canonical ${parsedRole} authority: ${abstractTool}`)
    }
  }
  for (const requiredTool of permittedAbstractTools) {
    if (!(requiredTool in mapping)) throw new Error(`Worker gateway mapping omitted ${parsedRole} tool ${requiredTool}`)
  }

  const canonicalTools = new Map(
    canonicalDefinitions
      .filter(definition => definition.kind === 'tool')
      .map(definition => [definition.name, definition]),
  )
  const concreteNames = [...new Set(Object.values(mapping).flat())]
  const tools = concreteNames.map(name => {
    const canonical = canonicalTools.get(name)
    if (!canonical || canonical.inputSchema === undefined) {
      throw new Error(`Worker gateway tool is absent from the canonical MCP registry: ${name}`)
    }
    const transformed = omitPrincipalArguments(canonical.inputSchema)
    return Object.freeze({
      name,
      ...(canonical.description ? { description: canonical.description } : {}),
      origin: 'mcp:appraise-quality-journey-worker' as const,
      inputSchema: transformed.schema,
      canonicalInputSchemaHash: hash(canonical.inputSchema),
      workerInputSchemaHash: hash(transformed.schema),
      principalBindings: Object.freeze(transformed.bindings),
    })
  })
  const subject = {
    schema: 'appraise.managed-worker-registration-profile/v1' as const,
    registryVersion: qualityJourneyRoleRegistryVersion,
    role: parsedRole,
    abstractToolMap: mapping,
    tools: Object.freeze(tools),
  }
  return Object.freeze({ ...subject, contractDigest: hash(subject) })
}

export function sealManagedWorkerRuntimeGrant(
  input: Omit<z.input<typeof runtimeGrantPayloadSchema>, 'schema' | 'grantId' | 'issuedAt'> & {
    grantId?: string
    issuedAt?: string
  },
  secret: Uint8Array,
): string {
  assertSecret(secret)
  const payload = runtimeGrantPayloadSchema.parse({
    ...input,
    schema: 'appraise.managed-worker-runtime-grant/v1',
    grantId: input.grantId ?? randomUUID(),
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  })
  if (Date.parse(payload.expiresAt) <= Date.parse(payload.issuedAt)) {
    throw new Error('Managed worker runtime grant expiry must follow issuance.')
  }
  const encoded = Buffer.from(canonicalContractJson(payload)).toString('base64url')
  return `v1.${encoded}.${sign(encoded, secret)}`
}

export function verifyManagedWorkerRuntimeGrant(
  sealedGrant: string,
  secret: Uint8Array,
  now = new Date(),
): ManagedWorkerRuntimePrincipal {
  assertSecret(secret)
  const [version, encoded, signature, ...extra] = sealedGrant.split('.')
  if (version !== 'v1' || !encoded || !signature || extra.length > 0) throw new Error('Malformed managed worker grant.')
  const expected = Buffer.from(sign(encoded, secret))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Managed worker grant signature is invalid.')
  }
  const principal = runtimeGrantPayloadSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
  if (Date.parse(principal.expiresAt) <= now.getTime()) throw new Error('Managed worker grant has expired.')
  return Object.freeze(principal)
}

type AuthorizationDecision = {
  decisionDigest: string
  ownerToken?: string
  projectBearer?: string
}

export async function executeManagedWorkerGatewayCall({
  sealedGrant,
  secret,
  profile,
  toolName,
  arguments: workerArguments,
  authorize,
  invoke,
  clock = () => new Date(),
}: {
  sealedGrant: string
  secret: Uint8Array
  profile: ManagedWorkerRegistrationProfile
  toolName: string
  arguments: Record<string, unknown>
  authorize: (input: {
    principal: ManagedWorkerRuntimePrincipal
    stage: 'before_io' | 'after_io'
    requestHash: string
    resultHash?: string
    ioOutcome?: 'returned' | 'threw'
  }) => Promise<AuthorizationDecision>
  invoke: (input: {
    principal: ManagedWorkerRuntimePrincipal
    toolName: string
    arguments: Record<string, unknown>
  }) => Promise<unknown>
  clock?: () => Date
}) {
  const principal = verifyManagedWorkerRuntimeGrant(sealedGrant, secret, clock())
  assertProfileIntegrity(profile)
  if (principal.role !== profile.role) throw new Error('Managed worker grant role does not match the gateway profile.')
  if (principal.profileDigest !== profile.contractDigest)
    throw new Error('Managed worker grant is not bound to this gateway profile.')
  const tool = profile.tools.find(candidate => candidate.name === toolName)
  if (!tool) throw new Error('Tool is not registered for this worker role.')
  const callerAuthority = findPrincipalArguments(workerArguments)
  if (callerAuthority.length > 0) {
    throw new Error(`Worker arguments attempted to select trusted principal fields: ${callerAuthority.join(', ')}`)
  }

  const unsignedRequestHash = hash({ toolName, arguments: workerArguments, grantDigest: hash(sealedGrant) })
  const preIo = await authorize({ principal, stage: 'before_io', requestHash: unsignedRequestHash })
  digest.parse(preIo.decisionDigest)
  const trustedArguments = injectPrincipalArguments(workerArguments, tool.principalBindings, principal, preIo)
  const requestHash = hash({ toolName, arguments: trustedArguments })
  let result: unknown
  let invocationError: unknown
  try {
    result = await invoke({ principal, toolName, arguments: trustedArguments })
  } catch (error) {
    invocationError = error
  }
  const ioOutcome = invocationError === undefined ? 'returned' : 'threw'
  const resultHash =
    invocationError === undefined ? hash(result) : hash({ outcome: 'threw', error: canonicalError(invocationError) })

  try {
    const postPrincipal = verifyManagedWorkerRuntimeGrant(sealedGrant, secret, clock())
    if (canonicalContractJson(postPrincipal) !== canonicalContractJson(principal)) {
      throw new Error('Managed worker grant identity changed during I/O.')
    }
    const postIo = await authorize({
      principal: postPrincipal,
      stage: 'after_io',
      requestHash,
      resultHash,
      ioOutcome,
    })
    digest.parse(postIo.decisionDigest)
    const receipt = brokerReceipt({
      principal,
      sealedGrant,
      profile,
      toolName,
      requestHash,
      resultHash,
      preIoAuthorization: preIo.decisionDigest,
      postIoAuthorization: postIo.decisionDigest,
      accepted: invocationError === undefined,
      effectOutcome: invocationError === undefined ? 'occurred' : 'unknown',
    })
    if (invocationError !== undefined) {
      throw new ManagedWorkerInvocationError('Managed worker I/O failed with an ambiguous effect outcome.', receipt, {
        cause: invocationError,
      })
    }
    return {
      result,
      receipt,
    }
  } catch (error) {
    if (error instanceof ManagedWorkerInvocationError) throw error
    const receipt = brokerReceipt({
      principal,
      sealedGrant,
      profile,
      toolName,
      requestHash,
      resultHash,
      preIoAuthorization: preIo.decisionDigest,
      postIoAuthorization: null,
      accepted: false,
      effectOutcome: invocationError === undefined ? 'occurred' : 'unknown',
    })
    throw new ManagedWorkerPostIoAuthorizationError('Managed worker authorization failed after I/O.', receipt, {
      cause: error,
    })
  }
}

export class ManagedWorkerPostIoAuthorizationError extends Error {
  constructor(
    message: string,
    readonly receipt: ReturnType<typeof brokerReceipt>,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ManagedWorkerPostIoAuthorizationError'
  }
}

export class ManagedWorkerInvocationError extends Error {
  constructor(
    message: string,
    readonly receipt: ReturnType<typeof brokerReceipt>,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ManagedWorkerInvocationError'
  }
}

export function managedWorkerRoleToolMap() {
  return roleToolMap
}

function brokerReceipt(input: {
  principal: ManagedWorkerRuntimePrincipal
  sealedGrant: string
  profile: ManagedWorkerRegistrationProfile
  toolName: string
  requestHash: string
  resultHash: string
  preIoAuthorization: string
  postIoAuthorization: string | null
  accepted: boolean
  effectOutcome: 'occurred' | 'unknown'
}) {
  return Object.freeze({
    schema: 'appraise.managed-worker-broker-receipt/v1',
    receiptId: randomUUID(),
    grantDigest: hash(input.sealedGrant),
    profileDigest: input.profile.contractDigest,
    targetProjectId: input.principal.targetProjectId,
    journeyId: input.principal.journeyId,
    attemptId: input.principal.attemptId,
    generation: input.principal.generation,
    leaseId: input.principal.leaseId,
    authorizationId: input.principal.authorizationId,
    toolName: input.toolName,
    requestHash: input.requestHash,
    resultHash: input.resultHash,
    preIoAuthorization: digest.parse(input.preIoAuthorization),
    postIoAuthorization: input.postIoAuthorization === null ? null : digest.parse(input.postIoAuthorization),
    accepted: input.accepted,
    effectOutcome: input.effectOutcome,
  })
}

function canonicalError(error: unknown) {
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : null
    return { name: error.name, message: error.message, code }
  }
  return { name: 'NonErrorThrow', message: String(error), code: null }
}

function omitPrincipalArguments(
  schema: unknown,
  path: readonly string[] = [],
): { schema: unknown; bindings: { path: string[]; source: PrincipalBindingSource }[] } {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return { schema, bindings: [] }
  const value = schema as Record<string, unknown>
  const bindings: { path: string[]; source: PrincipalBindingSource }[] = []
  let properties = value.properties
  if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
    properties = Object.fromEntries(
      Object.entries(properties as Record<string, unknown>).flatMap(([key, propertySchema]) => {
        const source = principalBindingSources[key as keyof typeof principalBindingSources]
        if (source) {
          bindings.push({ path: [...path, key], source })
          return []
        }
        const nested = omitPrincipalArguments(propertySchema, [...path, key])
        bindings.push(...nested.bindings)
        return [[key, nested.schema]]
      }),
    )
  }
  const required = Array.isArray(value.required)
    ? value.required.filter(key => typeof key !== 'string' || !(key in principalBindingSources))
    : value.required
  return {
    schema: {
      ...value,
      ...(properties === undefined ? {} : { properties }),
      ...(required === undefined ? {} : { required }),
    },
    bindings,
  }
}

function findPrincipalArguments(value: unknown, path: readonly string[] = []): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value))
    return value.flatMap((entry, index) => findPrincipalArguments(entry, [...path, String(index)]))
  return Object.entries(value).flatMap(([key, nested]) => [
    ...(key in principalBindingSources ? [[...path, key].join('.')] : []),
    ...findPrincipalArguments(nested, [...path, key]),
  ])
}

function injectPrincipalArguments(
  workerArguments: Record<string, unknown>,
  bindings: ManagedWorkerToolDefinition['principalBindings'],
  principal: ManagedWorkerRuntimePrincipal,
  authorization: AuthorizationDecision,
) {
  const output = structuredClone(workerArguments)
  for (const binding of bindings) {
    let cursor: Record<string, unknown> = output
    for (const segment of binding.path.slice(0, -1)) {
      const nested = cursor[segment]
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        throw new Error(`Worker arguments omitted the container required for trusted ${binding.path.join('.')}.`)
      }
      cursor = nested as Record<string, unknown>
    }
    const source = binding.source
    const value = source === 'ownerToken' || source === 'projectBearer' ? authorization[source] : principal[source]
    if (value === undefined) throw new Error(`Trusted authorization did not supply ${source}.`)
    cursor[binding.path.at(-1)!] = value
  }
  return output
}

function assertProfileIntegrity(profile: ManagedWorkerRegistrationProfile) {
  const { contractDigest, ...subject } = profile
  if (hash(subject) !== contractDigest) throw new Error('Managed worker gateway profile digest is invalid.')
}

function assertSecret(secret: Uint8Array) {
  if (!(secret instanceof Uint8Array) || secret.byteLength < 32)
    throw new Error('Managed worker grant signing secret must contain at least 32 bytes.')
}

function sign(encoded: string, secret: Uint8Array) {
  return createHmac('sha256', secret).update(encoded).digest('base64url')
}

function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}
