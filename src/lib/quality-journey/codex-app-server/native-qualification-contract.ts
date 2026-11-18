import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { z } from 'zod'
import { assertNativePublicInput, readNativePublicBytes, verifyNativeCredential } from './native-credential-topology'
import schemaOrigin from './native-qualification-schemas/origin.json'
import { nativeQualificationFeatureControls, nativeQualificationModel } from './native-qualification-configuration'

const sha = z.string().regex(/^[a-f0-9]{64}$/)
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const absolute = z.string().refine(value => path.isAbsolute(value) && path.normalize(value) === value)
const id = z.string().regex(/^[A-Za-z0-9._:-]{1,200}$/)
const file = z.object({ path: absolute, sha256: sha }).strict()
const role = z.enum([
  'REQUIREMENT_ANALYZER',
  'SCOUT',
  'RESOURCE_EXPLORER',
  'TEST_SCENARIO_DESIGNER',
  'AUTOMATOR',
  'TRIAGER',
])
const timeout = z.number().int().min(1).max(60_000)
const credential = z
  .object({
    path: absolute,
    canonicalPath: absolute,
    uid: z.string(),
    mode: z.literal('384'),
    dev: z.string(),
    ino: z.string(),
    nlink: z.literal('1'),
    size: z.string(),
    mtimeNs: z.string(),
    ctimeNs: z.string(),
  })
  .strict()
const nativeQualificationManifestSchema = z
  .object({
    version: z.literal('appraise.native-qualification/v1'),
    campaignId: id,
    repositoryRoot: absolute,
    freshRoot: absolute,
    candidateTree: z.string().regex(/^[a-f0-9]{40}$/),
    native: file,
    prerequisites: z.object({ readinessReceipt: file, existingLoginReceipt: file }).strict(),
    database: z.object({ path: absolute, dev: z.string(), ino: z.string() }).strict(),
    binding: z
      .object({
        journeyId: id,
        targetProjectId: id,
        coordinatorSessionId: id,
        coordinatorGeneration: z.number().int().positive(),
        workItemId: id,
        attemptId: id,
        assignmentId: id,
        assignmentGeneration: z.number().int().positive(),
        leaseId: id,
        role,
      })
      .strict(),
    inputs: z.array(file).min(1).max(20_000),
    configurationSha256: sha,
    credentialSource: credential,
    endpoint: z
      .object({
        host: z.literal('127.0.0.1'),
        port: z.number().int().min(1024).max(65535),
        path: z.string().regex(/^\/appraise-worker\/[a-f0-9]{32}$/),
        serverName: z.literal('appraise_worker'),
        capabilityCommitment: digest,
      })
      .strict(),
    envelopeDigest: digest,
    roleProfileDigest: digest,
    mcpPromptBypass: z.literal('EXACT_ENABLED_TOOLS_APPROVE'),
    enabledTools: z.array(id).min(1).max(4),
    limits: z
      .object({
        acquisitionMs: timeout,
        caseMs: z.number().int().min(1).max(900_000),
        requestMs: timeout,
        acknowledgementMs: timeout,
        cleanupMs: timeout,
        bodyBytes: z.number().int().min(1).max(1_048_576),
        httpRequests: z.number().int().min(3).max(64),
        toolCalls: z.number().int().min(1).max(16),
      })
      .strict(),
    allowance: z
      .object({
        acquisitions: z.literal(1),
        threads: z.literal(1),
        consumingTurns: z.literal(1),
        accountRequests: z.literal(0),
        resumes: z.literal(0),
        executionCalls: z.literal(0),
        correctionCalls: z.literal(0),
      })
      .strict(),
  })
  .strict()
export type NativeQualificationManifest = z.infer<typeof nativeQualificationManifestSchema>
declare const planBrand: unique symbol
export type CapturedNativeQualificationPlan = { readonly [planBrand]: true }
const plans = new WeakMap<
  object,
  Readonly<{ manifest: NativeQualificationManifest; capability: string; config: string }>
>()
export const nativeQualificationDigest = (value: string | Buffer) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`
function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error('Native qualification plan refused')
}

/** Exact rendered configuration is reviewed as bytes, including this single connector capability. */
export function renderNativeQualificationConfiguration(manifest: NativeQualificationManifest, capability: string) {
  return [
    `model = "${nativeQualificationModel}"`,
    'model_provider = "openai"',
    'model_reasoning_effort = "medium"',
    'cli_auth_credentials_store = "file"',
    'mcp_oauth_credentials_store = "file"',
    'approval_policy = "never"',
    'sandbox_mode = "read-only"',
    'web_search = "disabled"',
    '[features]',
    ...nativeQualificationFeatureControls.map(key => `${key} = false`),
    '[analytics]',
    'enabled = false',
    '[feedback]',
    'enabled = false',
    '[history]',
    'persistence = "none"',
    '[mcp_servers.appraise_worker]',
    'environment_id = "local"',
    'enabled = true',
    'required = true',
    `url = ${JSON.stringify(`http://127.0.0.1:${manifest.endpoint.port}${manifest.endpoint.path}`)}`,
    `http_headers = { Authorization = ${JSON.stringify(`Bearer ${capability}`)} }`,
    `enabled_tools = ${JSON.stringify(manifest.enabledTools)}`,
    'startup_timeout_sec = 10',
    'tool_timeout_sec = 30',
    ...manifest.enabledTools.flatMap(name => [
      `[mcp_servers.appraise_worker.tools.${JSON.stringify(name)}]`,
      'approval_mode = "approve"',
    ]),
    '',
  ].join('\n')
}
export function nativeQualificationSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(root, entry.name)
    assert(!entry.isSymbolicLink())
    return entry.isDirectory() ? nativeQualificationSourceFiles(target) : entry.isFile() ? [target] : []
  })
}
function installedDependencyInputs(): string[] {
  const resolve = createRequire(import.meta.url)
  const ajvRoot = path.dirname(resolve.resolve('ajv/package.json'))
  const prismaRoot = path.dirname(resolve.resolve('@prisma/client/package.json'))
  const prismaEntry = resolve.resolve('@prisma/client')
  const generated = createRequire(prismaEntry).resolve('.prisma/client/default')
  return [
    resolve.resolve('ajv/package.json'),
    ...nativeQualificationSourceFiles(path.dirname(resolve.resolve('ajv'))),
    resolve.resolve('execa'),
    resolve.resolve('zod'),
    resolve.resolve('zod/package.json'),
    ...nativeQualificationSourceFiles(prismaRoot),
    ...nativeQualificationSourceFiles(path.dirname(generated)),
    path.join(ajvRoot, 'package.json'),
  ]
}

/** Canonical minimum, portable to generated apps. Task code separately enforces its full external controller/SDK recipe. */
export function nativeQualificationInputPaths(repositoryRoot: string) {
  return [
    ...new Set([
      ...installedDependencyInputs(),
      ...nativeQualificationSourceFiles(path.join(repositoryRoot, 'src')),
      ...nativeQualificationSourceFiles(path.join(repositoryRoot, 'prisma/migrations')),
      ...['prisma/schema.prisma', 'scripts/owned-process-supervisor.mjs', 'package.json', 'package-lock.json'].map(
        name => path.join(repositoryRoot, name),
      ),
      realpathSync(process.execPath),
    ]),
  ].sort()
}
function hashPublic(input: z.infer<typeof file>, manifest: NativeQualificationManifest) {
  assertNativePublicInput(input.path, manifest.credentialSource)
  assert(
    nativeQualificationDigest(readNativePublicBytes(input.path, manifest.credentialSource)) ===
      `sha256:${input.sha256}`,
  )
}
function verifyDatabaseFile(manifest: NativeQualificationManifest) {
  const database = lstatSync(manifest.database.path, { bigint: true })
  assert(
    database.isFile() &&
      !database.isSymbolicLink() &&
      String(database.dev) === manifest.database.dev &&
      String(database.ino) === manifest.database.ino,
  )
}
function verify(manifest: NativeQualificationManifest, capability: string, config: string) {
  assert(
    realpathSync(manifest.repositoryRoot) === realpathSync(fileURLToPath(new URL('../../../../', import.meta.url))),
  )
  verifyNativeCredential(manifest.credentialSource)
  assert(
    /^[a-f0-9]{64}$/.test(capability) &&
      nativeQualificationDigest(capability) === manifest.endpoint.capabilityCommitment,
  )
  assert(nativeQualificationDigest(config) === `sha256:${manifest.configurationSha256}`)
  assert(
    realpathSync(manifest.native.path) === manifest.native.path && (statSync(manifest.native.path).mode & 0o111) !== 0,
  )
  const required = nativeQualificationInputPaths(manifest.repositoryRoot)
  assert(
    manifest.inputs.length >= required.length &&
      new Set(manifest.inputs.map(item => item.path)).size === manifest.inputs.length,
  )
  const selected = new Set(manifest.inputs.map(item => item.path))
  assert(required.every(input => selected.has(input)))
  assert(manifest.inputs.every((item, index) => index === 0 || manifest.inputs[index - 1].path < item.path))
  // Guard every alias before hashing any selected public input.
  const all = [...manifest.inputs, manifest.native, ...Object.values(manifest.prerequisites)]
  for (const item of all) assertNativePublicInput(item.path, manifest.credentialSource)
  for (const item of all) hashPublic(item, manifest)
  verifyDatabaseFile(manifest)
  for (const [name, expected] of Object.entries(schemaOrigin.files)) {
    const schemaPath = path.join(
      manifest.repositoryRoot,
      'src/lib/quality-journey/codex-app-server/native-qualification-schemas',
      name,
    )
    assert(manifest.inputs.some(item => item.path === schemaPath && item.sha256 === expected))
  }
}
export function parseNativeQualificationManifest(value: unknown): NativeQualificationManifest {
  return nativeQualificationManifestSchema.parse(value)
}
export function captureNativeQualificationPlan(value: unknown, capability: string): CapturedNativeQualificationPlan {
  const manifest = parseNativeQualificationManifest(value)
  try {
    lstatSync(manifest.freshRoot)
    throw new Error('Native fresh root already exists')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  assert(realpathSync(path.dirname(manifest.freshRoot)) === path.dirname(manifest.freshRoot))
  const config = renderNativeQualificationConfiguration(manifest, capability)
  verify(manifest, capability, config)
  const plan = Object.freeze({}) as CapturedNativeQualificationPlan
  plans.set(plan, { manifest: structuredClone(manifest), capability, config })
  return plan
}
export function inspectNativeQualificationPlan(plan: CapturedNativeQualificationPlan) {
  const captured = plans.get(plan)
  assert(captured)
  return structuredClone(captured)
}
export function verifyNativeQualificationPlan(plan: CapturedNativeQualificationPlan) {
  const captured = inspectNativeQualificationPlan(plan)
  verify(captured.manifest, captured.capability, captured.config)
  return captured
}
