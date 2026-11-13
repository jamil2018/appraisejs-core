import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'

const id = z.string().min(1).max(200)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const role = z.enum([
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
])
const requestSchema = z
  .object({
    journeyId: id,
    targetProjectId: id,
    role,
    principal: z.object({ principalId: id, assurance: z.literal('PROJECT_CREDENTIAL_ONLY') }).strict(),
    idempotencyKey: id,
    coordinatorSessionId: id,
    coordinatorGeneration: z.number().int().positive(),
    coordinatorPrincipalId: id,
    coordinatorHandoffId: id.optional(),
    leaseSeconds: z.number().int().positive().optional(),
  })
  .strict()
const scopeSchema = z.object({ databaseIdentity: digest, claimRequest: requestSchema }).strict()
const attemptSchema = z
  .object({
    workItemId: id,
    attemptId: id,
    assignmentId: id,
    assignmentGeneration: z.number().int().positive(),
    leaseId: id,
  })
  .strict()
const materialSchema = z
  .object({
    schema: z.literal('appraise.assignment-custody/v1'),
    scope: scopeSchema,
    assignmentSecret: z
      .string()
      .max(2000)
      .refine(value => Buffer.byteLength(value, 'utf8') >= 32),
    stage: z.enum(['PREPARED_CLAIM', 'BOUND_ATTEMPT']),
    boundAttempt: attemptSchema.nullable(),
  })
  .strict()
  .refine(v => (v.stage === 'BOUND_ATTEMPT') === (v.boundAttempt !== null))
const envelopeSchema = z
  .object({
    schema: z.literal('appraise.assignment-ciphertext/v1'),
    iv: z.string().regex(/^[a-f0-9]{24}$/),
    tag: z.string().regex(/^[a-f0-9]{32}$/),
    ciphertext: z
      .string()
      .regex(/^[a-f0-9]+$/)
      .max(64000),
  })
  .strict()
export type AssignmentClaimRequest = z.infer<typeof requestSchema>
export type AssignmentCustodyScope = z.infer<typeof scopeSchema>
export type AssignmentAttemptIdentity = z.infer<typeof attemptSchema>
type AssignmentCredentialMaterial = z.infer<typeof materialSchema>
export type AssignmentCredentialStore = Readonly<{
  read(entryId: string): Promise<Readonly<{ revision: string; value: string }> | null>
  compareAndSwap(entryId: string, expectedRevision: string | null, value: string): Promise<string>
}>
type AssignmentCustodyReceipt = Readonly<{
  entryId: string
  stage: 'PREPARED_CLAIM' | 'BOUND_ATTEMPT'
  boundAttempt: Readonly<AssignmentAttemptIdentity> | null
  provenance: 'OFFLINE_ASSIGNMENT_CUSTODY'
  runtimeQualified: false
}>
export class AssignmentCustodyError extends Error {
  constructor(
    readonly code:
      | 'INVALID'
      | 'KEY_UNAVAILABLE'
      | 'MISSING'
      | 'CORRUPT'
      | 'CONFLICT'
      | 'STORAGE_UNAVAILABLE'
      | 'AUTHORITY_REFUSED'
      | 'CLAIM_UNRESOLVED'
      | 'ADMISSION_UNRESOLVED',
  ) {
    super(`Assignment custody ${code.toLowerCase()}.`)
    this.name = 'AssignmentCustodyError'
  }
}
const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value)
  } catch {
    throw new AssignmentCustodyError('INVALID')
  }
}
function identity(scope: AssignmentCustodyScope) {
  return hash(scope)
}
function receipt(scope: AssignmentCustodyScope, material: AssignmentCredentialMaterial): AssignmentCustodyReceipt {
  return Object.freeze({
    entryId: identity(scope),
    stage: material.stage,
    boundAttempt: material.boundAttempt && Object.freeze({ ...material.boundAttempt }),
    provenance: 'OFFLINE_ASSIGNMENT_CUSTODY',
    runtimeQualified: false,
  })
}
function encrypt(material: AssignmentCredentialMaterial, key: Buffer, entryId: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(entryId))
  const ciphertext = Buffer.concat([cipher.update(canonicalContractJson(material), 'utf8'), cipher.final()])
  return JSON.stringify({
    schema: 'appraise.assignment-ciphertext/v1',
    iv: iv.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  })
}
function decrypt(value: string, key: Buffer, scope: AssignmentCustodyScope) {
  try {
    if (Buffer.byteLength(value) > 65536) throw new Error()
    const envelope = envelopeSchema.parse(JSON.parse(value)),
      decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'hex'))
    decipher.setAAD(Buffer.from(identity(scope)))
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'))
    const material = materialSchema.parse(
      JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]).toString('utf8'),
      ),
    )
    if (hash(material.scope) !== identity(scope)) throw new Error()
    return material
  } catch {
    throw new AssignmentCustodyError('CORRUPT')
  }
}

/** Dormant application-assignment custody. No key, path, provider account or credential source is discovered. */
export function createAssignmentCredentialCustody(options: {
  keyProvider?: (entryId: string) => Promise<Uint8Array | null>
  store: AssignmentCredentialStore
}) {
  const keyProvider = options.keyProvider,
    read = options.store.read,
    cas = options.store.compareAndSwap
  if (typeof read !== 'function' || typeof cas !== 'function') throw new AssignmentCustodyError('INVALID')
  async function withKey<T>(entryId: string, operation: (key: Buffer) => Promise<T>): Promise<T> {
    let supplied: Uint8Array | null
    try {
      supplied = keyProvider ? await keyProvider(entryId) : null
    } catch {
      throw new AssignmentCustodyError('KEY_UNAVAILABLE')
    }
    if (!(supplied instanceof Uint8Array) || supplied.byteLength !== 32)
      throw new AssignmentCustodyError('KEY_UNAVAILABLE')
    const key = Buffer.from(supplied)
    try {
      return await operation(key)
    } finally {
      key.fill(0)
    }
  }
  async function stored(scope: AssignmentCustodyScope, key: Buffer) {
    let found: Awaited<ReturnType<AssignmentCredentialStore['read']>>
    try {
      found = await read(identity(scope))
    } catch {
      throw new AssignmentCustodyError('STORAGE_UNAVAILABLE')
    }
    if (!found) throw new AssignmentCustodyError('MISSING')
    return { ...found, material: decrypt(found.value, key, scope) }
  }
  async function save(
    scope: AssignmentCustodyScope,
    revision: string | null,
    material: AssignmentCredentialMaterial,
    key: Buffer,
  ) {
    try {
      await cas(identity(scope), revision, encrypt(material, key, identity(scope)))
    } catch {
      throw new AssignmentCustodyError('CONFLICT')
    }
    return receipt(scope, material)
  }
  return Object.freeze({
    async prepare(rawScope: AssignmentCustodyScope, assignmentSecret: string) {
      const scope = parse(scopeSchema, rawScope)
      const material = parse(materialSchema, {
        schema: 'appraise.assignment-custody/v1',
        scope,
        assignmentSecret,
        stage: 'PREPARED_CLAIM',
        boundAttempt: null,
      })
      return withKey(identity(scope), async key => {
        let existing: Awaited<ReturnType<AssignmentCredentialStore['read']>>
        try {
          existing = await read(identity(scope))
        } catch {
          throw new AssignmentCustodyError('STORAGE_UNAVAILABLE')
        }
        if (!existing) return save(scope, null, material, key)
        const current = decrypt(existing.value, key, scope)
        if (current.assignmentSecret !== assignmentSecret) throw new AssignmentCustodyError('CONFLICT')
        return receipt(scope, current)
      })
    },
    async bind(rawScope: AssignmentCustodyScope, rawBinding: AssignmentAttemptIdentity) {
      const scope = parse(scopeSchema, rawScope),
        binding = parse(attemptSchema, rawBinding)
      return withKey(identity(scope), async key => {
        const current = await stored(scope, key)
        if (current.material.boundAttempt) {
          if (hash(current.material.boundAttempt) !== hash(binding)) throw new AssignmentCustodyError('CONFLICT')
          return receipt(scope, current.material)
        }
        return save(
          scope,
          current.revision,
          { ...current.material, stage: 'BOUND_ATTEMPT', boundAttempt: binding },
          key,
        )
      })
    },
    async inspect(rawScope: AssignmentCustodyScope) {
      const scope = parse(scopeSchema, rawScope)
      return withKey(identity(scope), async key => receipt(scope, (await stored(scope, key)).material))
    },
    async withRecovered<T>(
      rawScope: AssignmentCustodyScope,
      use: (material: Readonly<AssignmentCredentialMaterial>) => Promise<T>,
    ): Promise<T> {
      const scope = parse(scopeSchema, rawScope)
      return withKey(identity(scope), async key => {
        const current = (await stored(scope, key)).material
        const captured = Object.freeze({
          ...current,
          scope: Object.freeze({
            ...current.scope,
            claimRequest: Object.freeze({
              ...current.scope.claimRequest,
              principal: Object.freeze({ ...current.scope.claimRequest.principal }),
            }),
          }),
          boundAttempt: current.boundAttempt && Object.freeze({ ...current.boundAttempt }),
        })
        return use(captured)
      })
    },
  })
}
export type AssignmentCredentialCustody = ReturnType<typeof createAssignmentCredentialCustody>
