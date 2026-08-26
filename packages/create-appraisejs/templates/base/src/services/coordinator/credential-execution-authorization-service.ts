import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { CredentialExecutionAuthorizationIssuer, Prisma } from '@prisma/client'

import prisma from '@/config/db-config'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { defaultOperationRegistry } from '@/lib/operation-catalog'
import { ServiceError } from '@/services/shared/errors'
import {
  builtInStepDefinitions,
  computeStepReferenceHash,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

let credentialAuthorizationClient = prisma

/** Integration-only database seam. Production always uses the canonical
 * singleton; no request path can supply a client. */
export function setCredentialAuthorizationClientForTests(client?: typeof prisma) {
  credentialAuthorizationClient = client ?? prisma
}

const REQUEST_SCHEMA = 'appraise.credential-execution-request/v1'
const ASSERTION_TYPE = 'appraise-credential-execution+jwt'
const sha256 = (value: string | Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`
const opaque = () => randomBytes(32).toString('base64url')
const now = () => new Date()
const MAX_CLOCK_SKEW_SECONDS = 300
const MAX_ASSERTION_LIFETIME_SECONDS = 3600

type ExecutionScope = {
  targetProjectId: string
  assessmentId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  evaluationSubjectRevisionId: string
  subjectDigest: string
  environmentId: string
  publicationFingerprint: string
  runtimeInputHash: string
  bindings: Array<{ slot: string; reference: string }>
  requestHash: string
}

type CredentialBinding = { slot: string; reference: string }

function exactEnvironmentReference(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const reference = value as Record<string, unknown>
  return reference.ref === 'environment' && typeof reference.key === 'string' && Object.keys(reference).length === 2
    ? reference.key
    : undefined
}

/**
 * Only immutable published invocations can authorize an environment binding.
 * Exact canonical credential operations derive the one environment password
 * slot from catalog semantics; explicit environment references remain valid
 * only on a verified invocation. Legacy `env:` strings are never authority.
 */
function credentialReferences(rootInvocations: unknown[]): CredentialBinding[] {
  const entries = rootInvocations.flatMap(credentialBindingsForRoot)
  const deduplicated = new Map<string, CredentialBinding>()
  for (const entry of entries) {
    const existing = deduplicated.get(entry.slot)
    if (existing && existing.reference !== entry.reference)
      throw new ServiceError('Credential execution has ambiguous published environment bindings.', 'CONFLICT')
    deduplicated.set(entry.slot, entry)
  }
  return [...deduplicated.values()].sort((a, b) => a.slot.localeCompare(b.slot))
}

function credentialBindingsForRoot(root: unknown): CredentialBinding[] {
  if (!isRecord(root)) return []
  const invocation = canonicalPublishedInvocation(root)
  if (!invocation) return []
  const caseId = typeof root.caseId === 'string' ? root.caseId : 'root'
  const stepId = typeof root.stepId === 'string' ? root.stepId : 'step'
  if (invocation.operation.credentialSource === 'environment-resolved')
    return [{ slot: `${caseId}:${stepId}:password`, reference: 'environment:password' }]
  return Object.entries(invocation.inputs).flatMap(([inputName, value]) => {
    const declaredInput = invocation.operation.inputs.find(input => input.name === inputName)
    if (!declaredInput) return []
    const key = exactEnvironmentReference(value)
    return key ? [{ slot: `${caseId}:${stepId}:${inputName}`, reference: `environment:${key}` }] : []
  })
}

/** Resolves only the built-in operation that the sealed Step Invocation
 * actually references. An authored ID/version/hash cannot claim the catalog's
 * credential semantics by resemblance: every component must equal the
 * registry descriptor and its projected built-in Step Definition. */
function canonicalPublishedInvocation(root: unknown) {
  if (!isRecord(root) || !isRecord(root.invocation) || !isRecord(root.invocation.inputs)) return undefined
  const step = root.invocation.step
  if (
    !isRecord(step) ||
    typeof step.id !== 'string' ||
    typeof step.version !== 'string' ||
    typeof step.definitionHash !== 'string'
  )
    return undefined
  let operation: ReturnType<typeof defaultOperationRegistry.read>[number]
  try {
    operation = defaultOperationRegistry.read([{ id: step.id, version: step.version }])[0]!
  } catch {
    return undefined
  }
  const definition = builtInStepDefinitions.find(
    candidate => candidate.identity.id === operation.id && candidate.identity.version === operation.version,
  )
  if (
    !definition ||
    computeStepReferenceHash(definition) !== step.definitionHash ||
    definition.execution.kind !== 'operation' ||
    definition.execution.handlerId !== operation.handler.id ||
    definition.execution.handlerVersion !== operation.handler.version
  )
    return undefined
  return { operation, inputs: root.invocation.inputs }
}

export async function executionRequiresCredential(environmentId: string) {
  const environment = await prisma.environment.findUnique({
    where: { id: environmentId },
    select: { credentialState: true, passwordEnvironmentVariable: true },
  })
  if (!environment) return false
  if (environment.credentialState === 'REFERENCE_CONFIGURED' && !environment.passwordEnvironmentVariable)
    throw new ServiceError('Credential-configured environment has no password reference.', 'CONFLICT')
  if (environment.credentialState === 'NONE' && environment.passwordEnvironmentVariable)
    throw new ServiceError('Credential-free environment has a password reference.', 'CONFLICT')
  return environment.credentialState === 'REFERENCE_CONFIGURED'
}

export async function ensureCredentialExecutionRequest(scope: ExecutionScope) {
  const bindings = scope.bindings
  if (!bindings.some(binding => binding.reference === 'environment:password'))
    throw new ServiceError('Credential execution requires an exact published environment password binding.', 'CONFLICT')
  const bindingsHash = sha256(canonicalContractJson(bindings))
  const requestScope = {
    schema: REQUEST_SCHEMA,
    targetProjectId: scope.targetProjectId,
    assessmentId: scope.assessmentId,
    qualityPlanId: scope.qualityPlanId,
    qualityPlanRevisionId: scope.qualityPlanRevisionId,
    evaluationSubjectRevisionId: scope.evaluationSubjectRevisionId,
    subjectDigest: scope.subjectDigest,
    environmentId: scope.environmentId,
    publicationFingerprint: scope.publicationFingerprint,
    runtimeInputHash: scope.runtimeInputHash,
    credentialBindings: bindings,
    executionIntentHash: scope.requestHash,
  }
  const activeScopeKey = sha256(canonicalContractJson(requestScope))
  return credentialAuthorizationClient.$transaction(tx =>
    ensureRequestInTransaction(tx, scope, bindings, bindingsHash, requestScope, activeScopeKey),
  )
}

async function ensureRequestInTransaction(
  tx: Prisma.TransactionClient,
  scope: ExecutionScope,
  bindings: CredentialBinding[],
  bindingsHash: string,
  requestScope: Record<string, unknown>,
  activeScopeKey: string,
) {
  const time = now()
  await assertRequestScopeOwnership(tx, scope)
  const existing = await activeRequestOrRetireExpiredGrant(tx, activeScopeKey, time)
  if (existing) return existing
  await retireExpiredRequestScope(tx, activeScopeKey, time)
  return createExactRequest(tx, scope, bindings, bindingsHash, requestScope, activeScopeKey, time)
}

async function assertRequestScopeOwnership(tx: Prisma.TransactionClient, scope: ExecutionScope) {
  const [assessment, environment] = await Promise.all([
    tx.assessment.findUnique({
      where: { id: scope.assessmentId },
      select: {
        targetProjectId: true,
        qualityPlanId: true,
        qualityPlanRevisionId: true,
        evaluationSubjectRevisionId: true,
      },
    }),
    tx.environment.findUnique({ where: { id: scope.environmentId }, select: { targetProjectId: true } }),
  ])
  if (
    !assessment ||
    assessment.targetProjectId !== scope.targetProjectId ||
    assessment.qualityPlanId !== scope.qualityPlanId ||
    assessment.qualityPlanRevisionId !== scope.qualityPlanRevisionId ||
    assessment.evaluationSubjectRevisionId !== scope.evaluationSubjectRevisionId ||
    !environment ||
    environment.targetProjectId !== scope.targetProjectId
  )
    throw new ServiceError('Credential authorization scope no longer matches its target Assessment.', 'CONFLICT')
}

async function activeRequestOrRetireExpiredGrant(tx: Prisma.TransactionClient, activeScopeKey: string, time: Date) {
  const existing = await tx.assessmentExecutionRequest.findFirst({
    where: {
      activeScopeKey,
      expiresAt: { gt: time },
      revokedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    include: { grants: { select: { expiresAt: true, consumedAt: true, revokedAt: true } } },
  })
  if (existing) {
    const grant = existing.grants?.[0]
    if (grant && !grant.consumedAt && !grant.revokedAt && grant.expiresAt <= time) {
      await tx.assessmentExecutionRequest.updateMany({
        where: { id: existing.id, activeScopeKey, revokedAt: null },
        data: { revokedAt: time, activeScopeKey: null },
      })
    } else return existing
  }
  return null
}

function retireExpiredRequestScope(tx: Prisma.TransactionClient, activeScopeKey: string, time: Date) {
  // An expired request must no longer occupy the exact-scope uniqueness
  // slot. Revocation also clears this key below.
  return tx.assessmentExecutionRequest.updateMany({
    where: { activeScopeKey, expiresAt: { lte: time } },
    data: { activeScopeKey: null },
  })
}

async function createExactRequest(
  tx: Prisma.TransactionClient,
  scope: ExecutionScope,
  bindings: CredentialBinding[],
  bindingsHash: string,
  requestScope: Record<string, unknown>,
  activeScopeKey: string,
  time: Date,
) {
  // A nonce is part of a concrete authorization request, not its immutable
  // execution scope. It permits a new request after expiry or revocation.
  const canonical = { ...requestScope, issuanceNonce: opaque() }
  const requestHash = sha256(canonicalContractJson(canonical))
  try {
    return await tx.assessmentExecutionRequest.create({
      data: {
        targetProjectId: scope.targetProjectId,
        assessmentId: scope.assessmentId,
        qualityPlanId: scope.qualityPlanId,
        qualityPlanRevisionId: scope.qualityPlanRevisionId,
        evaluationSubjectRevisionId: scope.evaluationSubjectRevisionId,
        subjectDigest: scope.subjectDigest,
        environmentId: scope.environmentId,
        publicationFingerprint: scope.publicationFingerprint,
        runtimeInputHash: scope.runtimeInputHash,
        bindingsHash,
        activeScopeKey,
        requestHash,
        canonicalRequestJson: canonicalContractJson(canonical),
        expiresAt: new Date(time.getTime() + 10 * 60_000),
        bindings: { create: bindings.map(binding => ({ slot: binding.slot, reference: binding.reference })) },
      },
    })
  } catch (error) {
    // SQLite serializes most writers, but a unique collision is still a
    // normal replay outcome. Reload the exact active request rather than
    // exposing Prisma P2002 to an MCP/UI caller.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const replay = await tx.assessmentExecutionRequest.findFirst({
      where: { activeScopeKey, expiresAt: { gt: time }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    if (replay) return replay
    throw new ServiceError('AUTHORIZATION_REQUEST_CONFLICT', 'CONFLICT')
  }
}

export function credentialAuthorizationInput(scope: {
  assessmentId: string
  targetProjectId: string
  qualityPlanId: string
  qualityPlanRevisionId: string
  evaluationSubjectRevisionId: string
  subjectDigest: string
  environmentId: string
  publications: Array<{
    generationId: string
    publicationId: string
    operationHash: string
    runtimeInputHash: string
    runtimeInputJson: string
  }>
  requestHash: string
}): ExecutionScope {
  const bindings = credentialReferences(
    scope.publications.flatMap(publication => {
      try {
        const runtime = JSON.parse(publication.runtimeInputJson) as { rootInvocations?: unknown[] }
        return runtime.rootInvocations ?? []
      } catch {
        return []
      }
    }),
  )
  return {
    ...scope,
    publicationFingerprint: sha256(
      canonicalContractJson(
        scope.publications
          .map(item => ({
            generationId: item.generationId,
            publicationId: item.publicationId,
            operationHash: item.operationHash,
            runtimeInputHash: item.runtimeInputHash,
          }))
          .sort((left, right) =>
            `${left.generationId}:${left.publicationId}`.localeCompare(`${right.generationId}:${right.publicationId}`),
          ),
      ),
    ),
    runtimeInputHash: sha256(canonicalContractJson(scope.publications.map(item => item.runtimeInputHash).sort())),
    bindings,
  }
}

type TrustKey = {
  issuer: string
  kid: string
  publicKeyJwk: Record<string, unknown>
  validFrom: string
  signingEndsAt: string
  verificationEndsAt: string
  revokedAt?: string | null
}
type TrustFile = {
  version: 1
  audience: string
  clockSkewSeconds?: number
  maxAssertionLifetimeSeconds?: number
  keys: TrustKey[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function strictIsoDate(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date.getTime() : undefined
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number | undefined {
  const candidate = value ?? fallback
  return Number.isInteger(candidate) && (candidate as number) >= min && (candidate as number) <= max
    ? (candidate as number)
    : undefined
}

function validTrustKey(value: unknown): value is TrustKey {
  return validTrustKeyShape(value) && validTrustJwk(value.publicKeyJwk) && validTrustSchedule(value)
}

function validTrustKeyShape(value: unknown): value is TrustKey {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['issuer', 'kid', 'publicKeyJwk', 'validFrom', 'signingEndsAt', 'verificationEndsAt', 'revokedAt'],
      ['issuer', 'kid', 'publicKeyJwk', 'validFrom', 'signingEndsAt', 'verificationEndsAt'],
    ) &&
    typeof value.issuer === 'string' &&
    !!value.issuer &&
    typeof value.kid === 'string' &&
    !!value.kid &&
    isRecord(value.publicKeyJwk)
  )
}

function validTrustJwk(value: Record<string, unknown>) {
  if (
    !exactKeys(value, ['kty', 'crv', 'x']) ||
    value.kty !== 'OKP' ||
    value.crv !== 'Ed25519' ||
    typeof value.x !== 'string'
  )
    return false
  try {
    return decodeCanonicalBase64url(value.x).length === 32
  } catch {
    return false
  }
}

function validTrustSchedule(key: TrustKey) {
  const validFrom = strictIsoDate(key.validFrom),
    signingEndsAt = strictIsoDate(key.signingEndsAt),
    verificationEndsAt = strictIsoDate(key.verificationEndsAt),
    revokedAt = key.revokedAt == null ? undefined : strictIsoDate(key.revokedAt)
  return (
    validFrom !== undefined &&
    signingEndsAt !== undefined &&
    verificationEndsAt !== undefined &&
    validFrom <= signingEndsAt &&
    signingEndsAt <= verificationEndsAt &&
    (key.revokedAt == null || revokedAt !== undefined)
  )
}

async function trustFile(): Promise<TrustFile> {
  const path = process.env.APPRAISE_HOST_ASSERTION_TRUST_FILE
  if (!path) throw new ServiceError('HOST_ASSERTION_UNAVAILABLE', 'INTERNAL', 503)
  try {
    const raw = await readFile(path, 'utf8')
    assertNoDuplicateJsonMembers(raw)
    return parseTrustFile(raw)
  } catch {
    throw new ServiceError('HOST_ASSERTION_UNAVAILABLE', 'INTERNAL', 503)
  }
}

function parseTrustFile(raw: string): TrustFile {
  const parsed: unknown = JSON.parse(raw)
  if (!validTrustDocument(parsed)) throw new Error('invalid trust config')
  return parsed as TrustFile
}

function validTrustDocument(value: unknown): value is TrustFile {
  return validTrustDocumentShape(value) && validTrustDocumentKeys(value) && validTrustDocumentLimits(value)
}
function validTrustDocumentShape(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['version', 'audience', 'clockSkewSeconds', 'maxAssertionLifetimeSeconds', 'keys'],
      ['version', 'audience', 'keys'],
    ) &&
    value.version === 1 &&
    typeof value.audience === 'string' &&
    !!value.audience &&
    Array.isArray(value.keys) &&
    !!value.keys.length
  )
}
function validTrustDocumentKeys(value: Record<string, unknown>) {
  return Array.isArray(value.keys) && value.keys.every(validTrustKey) && uniqueTrustKeys(value.keys as TrustKey[])
}
function validTrustDocumentLimits(value: Record<string, unknown>) {
  return (
    boundedInteger(value.clockSkewSeconds, 30, 0, MAX_CLOCK_SKEW_SECONDS) !== undefined &&
    boundedInteger(value.maxAssertionLifetimeSeconds, 300, 1, MAX_ASSERTION_LIFETIME_SECONDS) !== undefined
  )
}

function uniqueTrustKeys(keys: TrustKey[]) {
  return new Set(keys.map(key => `${key.issuer}\u0000${key.kid}`)).size === keys.length
}

function decodeCanonicalBase64url(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw new Error('non-canonical base64url')
  const decoded = Buffer.from(segment, 'base64url')
  if (decoded.toString('base64url') !== segment) throw new Error('non-canonical base64url')
  return decoded
}

function parseSegment(segment: string) {
  try {
    const decoded = decodeCanonicalBase64url(segment).toString('utf8')
    assertNoDuplicateJsonMembers(decoded)
    const parsed: unknown = JSON.parse(decoded)
    if (!isRecord(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw new ServiceError('HOST_ASSERTION_INVALID', 'UNAUTHORIZED')
  }
}

/** JSON.parse accepts duplicate members by retaining the last one. The trust
 * and JWS formats are exact contracts, so scan object members first and deny
 * ambiguous input before JSON.parse sees it. */
function assertNoDuplicateJsonMembers(source: string) {
  new JsonDuplicateMemberScanner(source).scan()
}

class JsonDuplicateMemberScanner {
  private index = 0

  constructor(private readonly source: string) {}

  scan() {
    this.value()
    this.whitespace()
    if (this.index !== this.source.length) throw new Error('trailing JSON input')
  }

  private value(): void {
    this.whitespace()
    const character = this.source[this.index]
    if (character === '{') return this.object()
    if (character === '[') return this.array()
    if (character === '"') return void this.string()
    this.primitive()
  }

  private object() {
    this.index += 1
    this.whitespace()
    const keys = new Set<string>()
    if (this.consume('}')) return
    do {
      this.whitespace()
      const key = this.string()
      if (keys.has(key)) throw new Error('duplicate JSON member')
      keys.add(key)
      this.whitespace()
      this.expect(':')
      this.value()
      this.whitespace()
    } while (this.consume(','))
    this.expect('}')
  }

  private array() {
    this.index += 1
    this.whitespace()
    if (this.consume(']')) return
    do {
      this.value()
      this.whitespace()
    } while (this.consume(','))
    this.expect(']')
  }

  private string() {
    const start = this.index
    this.expect('"')
    while (this.index < this.source.length) {
      const character = this.source[this.index++]
      if (character === '\\') this.index += 1
      else if (character === '"') return JSON.parse(this.source.slice(start, this.index)) as string
    }
    throw new Error('unterminated string')
  }

  private primitive() {
    const start = this.index
    while (this.index < this.source.length && !/[\s,}\]]/.test(this.source[this.index]!)) this.index += 1
    if (start === this.index) throw new Error('expected JSON value')
  }

  private whitespace() {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1
  }

  private consume(character: string) {
    if (this.source[this.index] !== character) return false
    this.index += 1
    return true
  }

  private expect(character: string) {
    if (!this.consume(character)) throw new Error(`expected ${character}`)
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).every(key => keys.includes(key)) && keys.every(key => Object.hasOwn(value, key))
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]) {
  return Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.hasOwn(value, key))
}

function numericDate(value: unknown) {
  if (!Number.isInteger(value)) throw new ServiceError('HOST_ASSERTION_INVALID', 'UNAUTHORIZED')
  return value as number
}

export async function issueHostAssertionGrant(assertion: string) {
  const parsed = await verifiedHostAssertion(assertion)
  const claim = hostAuthorizationClaim(parsed.payload)
  const request = await hostBoundRequest(claim, parsed.payload.sub)
  return prisma.$transaction(tx => issueHostGrantInTransaction(tx, parsed, request))
}

type ParsedHostAssertion = {
  assertion: string
  encodedHeader: string
  encodedPayload: string
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signatureBytes: Buffer
  issuer: string
  keyId: string
  assertionJti: string
  key: TrustKey
  notBefore: number
  expires: number
}

async function verifiedHostAssertion(assertion: string): Promise<ParsedHostAssertion> {
  const parts = parseHostAssertionParts(assertion)
  const trust = await trustFile()
  const identity = hostAssertionIdentity(parts, trust)
  assertHostAssertionTime(identity, trust)
  verifyHostAssertionSignature(parts, identity.key)
  return { ...parts, ...identity }
}
function parseHostAssertionParts(assertion: string) {
  if (assertion.length > 12_000) throw invalidHostAssertion()
  const [encodedHeader, encodedPayload, signature, ...rest] = assertion.split('.')
  if (!encodedHeader || !encodedPayload || !signature || rest.length) throw invalidHostAssertion()
  const header = parseSegment(encodedHeader),
    payload = parseSegment(encodedPayload)
  const signatureBytes = hostSignatureBytes(signature)
  if (!validHostJwsShape(header, payload)) throw invalidHostAssertion()
  return { assertion, encodedHeader, encodedPayload, header, payload, signatureBytes }
}
function hostSignatureBytes(signature: string) {
  try {
    const bytes = decodeCanonicalBase64url(signature)
    if (bytes.length === 64) return bytes
  } catch {}
  throw invalidHostAssertion()
}
function validHostJwsShape(header: Record<string, unknown>, payload: Record<string, unknown>) {
  return (
    exactKeys(header, ['alg', 'kid', 'typ']) &&
    exactKeys(payload, ['iss', 'sub', 'aud', 'iat', 'nbf', 'exp', 'jti', 'authorization']) &&
    header.alg === 'EdDSA' &&
    header.typ === ASSERTION_TYPE &&
    typeof header.kid === 'string' &&
    !!header.kid
  )
}
function hostAssertionIdentity(
  parts: { header: Record<string, unknown>; payload: Record<string, unknown> },
  trust: TrustFile,
) {
  const issuer = typeof parts.payload.iss === 'string' ? parts.payload.iss : ''
  const assertionJti = typeof parts.payload.jti === 'string' ? parts.payload.jti : ''
  const keyId = parts.header.kid as string
  const key = trust.keys.find(candidate => candidate.issuer === issuer && candidate.kid === keyId)
  if (
    !key ||
    parts.payload.aud !== trust.audience ||
    !issuer ||
    !assertionJti ||
    typeof parts.payload.sub !== 'string' ||
    !parts.payload.sub
  )
    throw invalidHostAssertion()
  return {
    issuer,
    assertionJti,
    keyId,
    key,
    notBefore: numericDate(parts.payload.nbf),
    expires: numericDate(parts.payload.exp),
    issuedAt: numericDate(parts.payload.iat),
  }
}
function assertHostAssertionTime(
  identity: { key: TrustKey; issuedAt: number; notBefore: number; expires: number },
  trust: TrustFile,
) {
  const skew = boundedInteger(trust.clockSkewSeconds, 30, 0, MAX_CLOCK_SKEW_SECONDS)!,
    maximum = boundedInteger(trust.maxAssertionLifetimeSeconds, 300, 1, MAX_ASSERTION_LIFETIME_SECONDS)!,
    current = Math.floor(Date.now() / 1000)
  const validFrom = strictIsoDate(identity.key.validFrom)! / 1000,
    signingEndsAt = strictIsoDate(identity.key.signingEndsAt)! / 1000,
    verificationEndsAt = strictIsoDate(identity.key.verificationEndsAt)! / 1000,
    revokedAt = identity.key.revokedAt ? strictIsoDate(identity.key.revokedAt)! / 1000 : undefined
  if (
    !validAssertionLifetime(identity, maximum) ||
    !validAssertionWindow(identity, skew, current) ||
    !validTrustWindow(identity.issuedAt, current, validFrom, signingEndsAt, verificationEndsAt, revokedAt)
  )
    throw invalidHostAssertion()
}
function validAssertionLifetime(value: { issuedAt: number; notBefore: number; expires: number }, maximum: number) {
  return (
    value.expires > value.notBefore &&
    value.notBefore >= value.issuedAt - maximum &&
    value.expires - value.issuedAt <= maximum
  )
}
function validAssertionWindow(value: { notBefore: number; expires: number }, skew: number, current: number) {
  return current + skew >= value.notBefore && current - skew <= value.expires
}
function validTrustWindow(
  issuedAt: number,
  current: number,
  validFrom: number,
  signingEndsAt: number,
  verificationEndsAt: number,
  revokedAt: number | undefined,
) {
  return (
    issuedAt >= validFrom &&
    issuedAt <= signingEndsAt &&
    current <= verificationEndsAt &&
    (revokedAt === undefined || current < revokedAt)
  )
}
function verifyHostAssertionSignature(
  parts: { encodedHeader: string; encodedPayload: string; signatureBytes: Buffer },
  key: TrustKey,
) {
  try {
    const publicKey = createPublicKey({ key: key.publicKeyJwk as never, format: 'jwk' })
    if (
      publicKey.asymmetricKeyType !== 'ed25519' ||
      !verify(null, Buffer.from(`${parts.encodedHeader}.${parts.encodedPayload}`), publicKey, parts.signatureBytes)
    )
      throw new Error()
  } catch {
    throw invalidHostAssertion()
  }
}
function invalidHostAssertion(): ServiceError {
  return new ServiceError('HOST_ASSERTION_INVALID', 'UNAUTHORIZED')
}

type HostClaim = Record<string, unknown>
function hostAuthorizationClaim(payload: Record<string, unknown>): HostClaim {
  const claim = payload.authorization
  if (
    !isRecord(claim) ||
    !exactKeys(claim, [
      'schema',
      'requestId',
      'requestHash',
      'targetProjectId',
      'assessmentId',
      'qualityPlanId',
      'qualityPlanRevisionId',
      'subjectRevisionId',
      'environmentId',
      'publicationFingerprint',
      'runtimeInputHash',
      'credentialBindings',
    ]) ||
    claim.schema !== 'appraise.credential-execution-authorization/v1' ||
    typeof claim.requestId !== 'string' ||
    !claim.requestId ||
    typeof claim.requestHash !== 'string' ||
    !claim.requestHash
  )
    throw invalidHostAssertion()
  return claim
}
function hostClaimBindings(claim: HostClaim) {
  if (!Array.isArray(claim.credentialBindings)) throw invalidHostAssertion()
  const bindings = claim.credentialBindings.map(hostClaimBinding)
  if (new Set(bindings.map(binding => binding.slot)).size !== bindings.length) throw invalidHostAssertion()
  return bindings.sort((left, right) => left.slot.localeCompare(right.slot))
}
function hostClaimBinding(value: unknown): CredentialBinding {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['slot', 'ref']) ||
    typeof value.slot !== 'string' ||
    !value.slot ||
    typeof value.ref !== 'string' ||
    !value.ref
  )
    throw invalidHostAssertion()
  return { slot: value.slot, reference: value.ref }
}
async function hostBoundRequest(claim: HostClaim, subjectDigest: unknown) {
  const request = await prisma.assessmentExecutionRequest.findUnique({
    where: { id: claim.requestId as string },
    include: { bindings: true },
  })
  const bindings = hostClaimBindings(claim)
  if (!request || !hostClaimMatchesRequest(claim, request, subjectDigest, bindings)) throw invalidHostAssertion()
  return request
}
function hostClaimMatchesRequest(
  claim: HostClaim,
  request: {
    requestHash: string
    targetProjectId: string
    assessmentId: string
    qualityPlanId: string
    qualityPlanRevisionId: string
    environmentId: string
    publicationFingerprint: string
    runtimeInputHash: string
    evaluationSubjectRevisionId: string
    subjectDigest: string
    bindings: CredentialBinding[]
  },
  subjectDigest: unknown,
  bindings: CredentialBinding[],
) {
  return (
    requestIdentityMatches(claim, request, subjectDigest) &&
    requestRuntimeMatches(claim, request) &&
    requestBindingsMatch(request.bindings, bindings)
  )
}
function requestIdentityMatches(
  claim: HostClaim,
  request: {
    requestHash: string
    targetProjectId: string
    assessmentId: string
    qualityPlanId: string
    qualityPlanRevisionId: string
    evaluationSubjectRevisionId: string
    subjectDigest: string
  },
  subjectDigest: unknown,
) {
  return (
    request.requestHash === claim.requestHash &&
    request.targetProjectId === claim.targetProjectId &&
    request.assessmentId === claim.assessmentId &&
    request.qualityPlanId === claim.qualityPlanId &&
    request.qualityPlanRevisionId === claim.qualityPlanRevisionId &&
    request.evaluationSubjectRevisionId === claim.subjectRevisionId &&
    request.subjectDigest === subjectDigest
  )
}
function requestRuntimeMatches(
  claim: HostClaim,
  request: { environmentId: string; publicationFingerprint: string; runtimeInputHash: string },
) {
  return (
    request.environmentId === claim.environmentId &&
    request.publicationFingerprint === claim.publicationFingerprint &&
    request.runtimeInputHash === claim.runtimeInputHash
  )
}
function requestBindingsMatch(left: CredentialBinding[], right: CredentialBinding[]) {
  return (
    canonicalContractJson(left.map(binding => ({ slot: binding.slot, reference: binding.reference }))) ===
    canonicalContractJson(right)
  )
}
async function issueHostGrantInTransaction(
  tx: Prisma.TransactionClient,
  parsed: ParsedHostAssertion,
  request: Awaited<ReturnType<typeof hostBoundRequest>>,
) {
  const replay = await hostGrantReplay(tx, parsed.issuer, parsed.assertionJti)
  const assertionHash = sha256(parsed.assertion)
  if (replay) return replayedHostGrant(replay, assertionHash, request.id)
  if (await tx.assessmentExecutionAuthorizationGrant.findUnique({ where: { requestId: request.id } }))
    throw new ServiceError('AUTHORIZATION_REQUEST_CONFLICT', 'CONFLICT')
  if (request.expiresAt <= now() || request.revokedAt)
    throw new ServiceError('AUTHORIZATION_EXPIRED', 'UNAUTHORIZED', 403)
  return createOrReplayHostGrant(tx, parsed, request, assertionHash)
}
function hostGrantReplay(tx: Prisma.TransactionClient, issuer: string, jti: string) {
  return tx.assessmentExecutionAuthorizationGrant.findUnique({
    where: { hostIssuer_hostAssertionJti: { hostIssuer: issuer, hostAssertionJti: jti } },
  })
}
function replayedHostGrant(
  grant: {
    id: string
    hostAssertionHash: string | null
    expiresAt: Date
    issuerKind: CredentialExecutionAuthorizationIssuer
  },
  hash: string,
  requestId: string,
) {
  if (grant.hostAssertionHash !== hash) throw new ServiceError('HOST_ASSERTION_REPLAY_CONFLICT', 'CONFLICT')
  return { grantId: grant.id, requestId, expiresAt: grant.expiresAt.toISOString(), issuerKind: grant.issuerKind }
}
async function createOrReplayHostGrant(
  tx: Prisma.TransactionClient,
  parsed: ParsedHostAssertion,
  request: Awaited<ReturnType<typeof hostBoundRequest>>,
  assertionHash: string,
) {
  try {
    return hostGrantResult(
      request.id,
      await tx.assessmentExecutionAuthorizationGrant.create({
        data: {
          requestId: request.id,
          issuerKind: CredentialExecutionAuthorizationIssuer.HOST_ASSERTION,
          hostIssuer: parsed.issuer,
          hostKeyId: parsed.keyId,
          hostAssertionJti: parsed.assertionJti,
          hostAssertionHash: assertionHash,
          notBefore: new Date(parsed.notBefore * 1000),
          expiresAt: effectiveHostGrantExpiry(parsed.expires, parsed.notBefore, request.expiresAt),
        },
      }),
    )
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const replay = await hostGrantReplay(tx, parsed.issuer, parsed.assertionJti)
    if (replay) return replayedHostGrant(replay, assertionHash, request.id)
    throw new ServiceError('AUTHORIZATION_REQUEST_CONFLICT', 'CONFLICT')
  }
}
function effectiveHostGrantExpiry(expires: number, notBefore: number, requestExpiresAt: Date) {
  const effective = new Date(Math.min(expires * 1000, requestExpiresAt.getTime(), Date.now() + 300_000))
  if (effective <= now() || effective <= new Date(notBefore * 1000)) throw invalidHostAssertion()
  return effective
}
function hostGrantResult(
  requestId: string,
  grant: { id: string; expiresAt: Date; issuerKind: CredentialExecutionAuthorizationIssuer },
) {
  return { grantId: grant.id, requestId, expiresAt: grant.expiresAt.toISOString(), issuerKind: grant.issuerKind }
}

export async function issueLocalUiGrant(input: {
  requestId: string
  assessmentId: string
  targetProjectId: string
  sessionToken: string
  csrfToken: string
}) {
  const session = await validateLocalUiSession(input)
  const outcome = await credentialAuthorizationClient.$transaction(tx =>
    issueLocalUiGrantInTransaction(tx, input, session),
  )
  if ('retired' in outcome) throw new ServiceError('AUTHORIZATION_EXPIRED', 'UNAUTHORIZED', 403)
  return outcome
}

async function issueLocalUiGrantInTransaction(
  tx: Prisma.TransactionClient,
  input: { requestId: string; assessmentId: string; targetProjectId: string },
  session: { id: string; targetProjectId: string },
) {
  const request = await tx.assessmentExecutionRequest.findUnique({ where: { id: input.requestId } })
  if (!localRequestMatches(request, input, session)) throw new ServiceError('AUTHORIZATION_NOT_FOUND', 'NOT_FOUND')
  const existing = await tx.assessmentExecutionAuthorizationGrant.findUnique({ where: { requestId: request.id } })
  if (existing) {
    if (replayableLocalGrant(existing, session.id))
      return { grantId: existing.id, requestId: request.id, expiresAt: existing.expiresAt.toISOString() }
    if (!activeGrant(existing)) return retireLocalRequest(tx, request.id)
    throw new ServiceError('AUTHORIZATION_REQUEST_CONFLICT', 'CONFLICT')
  }
  return createOrReplayLocalGrant(tx, request, session.id)
}

async function createOrReplayLocalGrant(
  tx: Prisma.TransactionClient,
  request: LocalAuthorizationRequest,
  sessionId: string,
) {
  try {
    return await createLocalGrant(tx, request, sessionId)
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    const replay = await tx.assessmentExecutionAuthorizationGrant.findUnique({ where: { requestId: request.id } })
    if (replay && replayableLocalGrant(replay, sessionId))
      return { grantId: replay.id, requestId: request.id, expiresAt: replay.expiresAt.toISOString() }
    throw new ServiceError('AUTHORIZATION_REQUEST_CONFLICT', 'CONFLICT')
  }
}
async function createLocalGrant(tx: Prisma.TransactionClient, request: LocalAuthorizationRequest, sessionId: string) {
  const expiresAt = new Date(Math.min(request.expiresAt.getTime(), Date.now() + 300_000))
  if (expiresAt <= now()) throw new ServiceError('AUTHORIZATION_EXPIRED', 'UNAUTHORIZED', 403)
  const grant = await tx.assessmentExecutionAuthorizationGrant.create({
    data: {
      requestId: request.id,
      issuerKind: CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION,
      localUiSessionId: sessionId,
      notBefore: now(),
      expiresAt,
    },
  })
  return { grantId: grant.id, requestId: request.id, expiresAt: grant.expiresAt.toISOString() }
}

type LocalAuthorizationRequest = NonNullable<
  Awaited<ReturnType<Prisma.TransactionClient['assessmentExecutionRequest']['findUnique']>>
>

function localRequestMatches(
  request: LocalAuthorizationRequest | null,
  input: { assessmentId: string; targetProjectId: string },
  session: { targetProjectId: string },
): request is LocalAuthorizationRequest {
  return (
    !!request &&
    request.assessmentId === input.assessmentId &&
    request.targetProjectId === input.targetProjectId &&
    request.targetProjectId === session.targetProjectId &&
    request.expiresAt > now() &&
    !request.revokedAt
  )
}

function activeGrant(grant: { consumedAt: Date | null; revokedAt: Date | null; expiresAt: Date; notBefore: Date }) {
  return !grant.consumedAt && !grant.revokedAt && grant.expiresAt > now() && grant.notBefore <= now()
}
function replayableLocalGrant(
  grant: {
    issuerKind: CredentialExecutionAuthorizationIssuer
    localUiSessionId: string | null
    consumedAt: Date | null
    revokedAt: Date | null
    expiresAt: Date
    notBefore: Date
  },
  sessionId: string,
) {
  return (
    activeGrant(grant) &&
    grant.issuerKind === CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION &&
    grant.localUiSessionId === sessionId
  )
}
async function retireLocalRequest(tx: Prisma.TransactionClient, requestId: string) {
  await tx.assessmentExecutionRequest.updateMany({
    where: { id: requestId, revokedAt: null },
    data: { revokedAt: now(), activeScopeKey: null },
  })
  return { retired: true as const }
}

export async function validateLocalUiSession(input: { sessionToken: string; csrfToken: string }) {
  const session = await credentialAuthorizationClient.credentialAuthorizationUiSession.findUnique({
    where: { sessionTokenHash: sha256(input.sessionToken) },
  })
  if (!session || session.csrfTokenHash !== sha256(input.csrfToken) || session.expiresAt <= now() || session.revokedAt)
    throw new ServiceError('AUTHORIZATION_UI_SESSION_INVALID', 'UNAUTHORIZED', 403)
  return session
}

/** A local grant is visible only to the exact still-valid session that issued
 * it. Host grants intentionally have no UI-readable representation. */
export async function localUiGrantForSession(input: {
  requestId: string
  targetProjectId: string
  sessionToken: string
  csrfToken: string
}) {
  const session = await validateLocalUiSession(input)
  if (session.targetProjectId !== input.targetProjectId) return null
  const grant = await prisma.assessmentExecutionAuthorizationGrant.findUnique({
    where: { requestId: input.requestId },
    select: { id: true, issuerKind: true, localUiSessionId: true, expiresAt: true, consumedAt: true, revokedAt: true },
  })
  if (
    !grant ||
    grant.issuerKind !== CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION ||
    grant.localUiSessionId !== session.id ||
    grant.expiresAt <= now() ||
    grant.consumedAt ||
    grant.revokedAt
  )
    return null
  return { grantId: grant.id, expiresAt: grant.expiresAt.toISOString() }
}

export async function createLocalUiSession(targetProjectId: string) {
  const sessionToken = opaque()
  const csrfToken = opaque()
  const expiresAt = new Date(Date.now() + 8 * 60 * 60_000)
  const session = await prisma.credentialAuthorizationUiSession.create({
    data: { targetProjectId, sessionTokenHash: sha256(sessionToken), csrfTokenHash: sha256(csrfToken), expiresAt },
  })
  return { id: session.id, sessionToken, csrfToken, expiresAt }
}

export async function revokeCredentialExecutionGrant(input: {
  grantId: string
  reason: string
  expectedIssuer: CredentialExecutionAuthorizationIssuer
}) {
  const { grantId, reason, expectedIssuer } = input
  const normalizedReason = reason.trim().slice(0, 500)
  return prisma.$transaction(async tx => {
    const grant = await tx.assessmentExecutionAuthorizationGrant.findUnique({ where: { id: grantId } })
    if (!grant || grant.issuerKind !== expectedIssuer) throw new ServiceError('AUTHORIZATION_NOT_FOUND', 'NOT_FOUND')
    if (grant.consumedAt) throw new ServiceError('AUTHORIZATION_ALREADY_CONSUMED', 'CONFLICT')
    if (grant.revokedAt) {
      if (grant.revokedReason === normalizedReason)
        return { grantId, revokedAt: grant.revokedAt.toISOString(), idempotentReplay: true }
      throw new ServiceError('AUTHORIZATION_REVOKE_CONFLICT', 'CONFLICT')
    }
    const revokedAt = now()
    const updated = await tx.assessmentExecutionAuthorizationGrant.updateMany({
      where: { id: grantId, consumedAt: null, revokedAt: null },
      data: { revokedAt, revokedReason: normalizedReason },
    })
    if (updated.count !== 1) throw new ServiceError('AUTHORIZATION_ALREADY_CONSUMED', 'CONFLICT')
    await tx.assessmentExecutionRequest.updateMany({
      where: { id: grant.requestId, revokedAt: null },
      data: { revokedAt, activeScopeKey: null },
    })
    return { grantId, revokedAt: revokedAt.toISOString() }
  })
}

/** Local UI revocation is scoped to the same active target, assessment, and
 * issuing session. Host-issued grants remain revocable only through the host
 * authority route. */
export async function revokeLocalUiCredentialExecutionGrant(input: {
  grantId: string
  assessmentId: string
  targetProjectId: string
  sessionToken: string
  csrfToken: string
  reason: string
}) {
  const session = await validateLocalUiSession(input)
  if (session.targetProjectId !== input.targetProjectId)
    throw new ServiceError('AUTHORIZATION_UI_SESSION_INVALID', 'UNAUTHORIZED', 403)
  const grant = await prisma.assessmentExecutionAuthorizationGrant.findUnique({
    where: { id: input.grantId },
    include: { request: { select: { assessmentId: true, targetProjectId: true } } },
  })
  if (
    !grant ||
    grant.issuerKind !== CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION ||
    grant.localUiSessionId !== session.id ||
    grant.request.assessmentId !== input.assessmentId ||
    grant.request.targetProjectId !== input.targetProjectId
  )
    throw new ServiceError('AUTHORIZATION_NOT_FOUND', 'NOT_FOUND')
  return revokeCredentialExecutionGrant({
    grantId: input.grantId,
    reason: input.reason,
    expectedIssuer: CredentialExecutionAuthorizationIssuer.LOCAL_UI_SESSION,
  })
}

export async function consumeCredentialExecutionGrant(
  tx: Prisma.TransactionClient,
  input: { grantId: string; requestId: string; requestHash: string; assessmentRunId?: string },
) {
  const grant = await tx.assessmentExecutionAuthorizationGrant.findUnique({
    where: { id: input.grantId },
    include: { request: true },
  })
  if (!grant || grant.requestId !== input.requestId) throw new ServiceError('AUTHORIZATION_NOT_FOUND', 'NOT_FOUND')
  if (grant.request.requestHash !== input.requestHash)
    throw new ServiceError('AUTHORIZATION_SCOPE_MISMATCH', 'CONFLICT')
  const time = now()
  if (grant.request.revokedAt || grant.revokedAt) throw new ServiceError('AUTHORIZATION_REVOKED', 'UNAUTHORIZED', 403)
  if (grant.request.expiresAt <= time || grant.expiresAt <= time)
    throw new ServiceError('AUTHORIZATION_EXPIRED', 'UNAUTHORIZED', 403)
  if (grant.notBefore > time) throw new ServiceError('AUTHORIZATION_NOT_YET_VALID', 'UNAUTHORIZED', 403)
  if (grant.consumedAt) throw new ServiceError('AUTHORIZATION_ALREADY_CONSUMED', 'CONFLICT')
  const consumed = await tx.assessmentExecutionAuthorizationGrant.updateMany({
    where: { id: grant.id, consumedAt: null, revokedAt: null, expiresAt: { gt: time }, notBefore: { lte: time } },
    data: { consumedAt: time },
  })
  if (consumed.count !== 1) throw new ServiceError('AUTHORIZATION_ALREADY_CONSUMED', 'CONFLICT')
  return grant.request
}
