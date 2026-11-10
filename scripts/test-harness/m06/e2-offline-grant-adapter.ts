import { createHash } from 'node:crypto'
import { open, readFile, realpath, lstat } from 'node:fs/promises'
import path from 'node:path'

import { canonicalE2Json } from '@/lib/quality-journey/provider-grant-contract'
import { applyInertE2GrantSqlKernel, e2KernelPreparationId,
  type E2KernelExpectedCustody, type E2KernelFreshIds, type E2KernelRequest,
  type E2KernelResult } from '@/services/coordinator/quality-journey-e2-grant-kernel'

/**
 * Repository-only disposable SQLite adapter. It never imports the configured app DB, parent owner,
 * source registrar, constructor, provider, or native transport. Caller must separately establish the
 * approved offline source closure and effective OS confinement before importing/executing this module.
 */
type FixtureManifest = Readonly<{
  version: 'M06_E2_OFFLINE_GRANT_CASE_V1'
  caseId: string
  databaseFile: 'fixture.sqlite'
  databaseSha256: string
  campaignPolicyId: string
  allocationDigest: string
  policyDigest: string
  providerIntentPolicyDigest: string
  preparationId: string
  sourceEventDigest: string
}>
export type E2OfflineGrantCase = Readonly<{
  caseRoot: string
  caseId: string
  expectedDatabaseSha256: string
  expectedManifestSha256: string
  request: E2KernelRequest
  expected: E2KernelExpectedCustody
  ids: E2KernelFreshIds
  finalSampleAt: Date
}>
export type E2OfflineGrantCaseResult = Readonly<{
  status: 'DB_COMMITTED_INERT' | 'READ_ONLY_RECEIPT' | 'UNKNOWN_NO_DISPATCH'
  caseId: string
  result?: E2KernelResult
  databaseSha256After?: string
}>

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const E2_OFFLINE_CASE_BASE = '/Users/jamil/Personal Projects/appraisejs/.appraisejs/m06-work/e2-offline'
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)
const fail = (reason: string): never => { throw new Error(`E2 offline grant case refused: ${reason}`) }
async function exists(pathname: string) {
  try { await lstat(pathname); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  plain(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))

async function assertNoSymlink(pathname: string, directory: boolean) {
  const info = await lstat(pathname)
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile())) fail('file type')
  if (!directory && info.nlink !== 1) fail('hard-linked file')
  if (await realpath(pathname) !== pathname) fail('noncanonical path')
}

async function readPinnedManifest(caseRoot: string, expectedHash: string): Promise<FixtureManifest> {
  const manifestPath = path.join(caseRoot, 'e2-grant-fixture.json')
  await assertNoSymlink(manifestPath, false)
  const bytes = await readFile(manifestPath)
  if (digest(bytes) !== expectedHash || bytes.length > 4096) fail('manifest hash or size')
  let parsed: unknown
  try { parsed = JSON.parse(bytes.toString('utf8')) } catch { fail('manifest JSON') }
  if (!Buffer.from(canonicalE2Json(parsed), 'utf8').equals(bytes)) fail('manifest canonical JSON')
  if (!exact(parsed, ['version', 'caseId', 'databaseFile', 'databaseSha256',
    'campaignPolicyId', 'allocationDigest', 'policyDigest', 'providerIntentPolicyDigest',
    'preparationId', 'sourceEventDigest']) ||
    parsed.version !== 'M06_E2_OFFLINE_GRANT_CASE_V1' || !uuid(parsed.caseId) ||
    parsed.databaseFile !== 'fixture.sqlite' || !hex(parsed.databaseSha256) ||
    !hex(parsed.allocationDigest) || !hex(parsed.policyDigest) ||
    !hex(parsed.providerIntentPolicyDigest) || !hex(parsed.preparationId) ||
    !hex(parsed.sourceEventDigest) || typeof parsed.campaignPolicyId !== 'string' ||
    !/^[A-Za-z0-9_.:/-]{1,128}$/.test(parsed.campaignPolicyId)) fail('manifest fields')
  return parsed as FixtureManifest
}

/** One new case, one outer transaction, one inert receipt; a failed/ambiguous attempt is never retried. */
export async function runFreshE2OfflineGrantCase(input: E2OfflineGrantCase):
  Promise<E2OfflineGrantCaseResult> {
  if (!uuid(input.caseId) || !hex(input.expectedDatabaseSha256) ||
    !hex(input.expectedManifestSha256) || !(input.finalSampleAt instanceof Date) ||
    !Number.isFinite(input.finalSampleAt.getTime())) fail('operation packet')
  const caseRoot = path.resolve(input.caseRoot)
  if (caseRoot !== input.caseRoot || caseRoot !== path.join(E2_OFFLINE_CASE_BASE, input.caseId))
    fail('case root is outside the new E2 offline case base')
  await assertNoSymlink(path.dirname(caseRoot), true)
  await assertNoSymlink(caseRoot, true)
  const dbPath = path.join(caseRoot, 'fixture.sqlite')
  await assertNoSymlink(dbPath, false)
  if (await exists(`${dbPath}-wal`) || await exists(`${dbPath}-shm`) ||
    await exists(`${dbPath}-journal`)) fail('database has a preexisting sidecar')
  const manifest = await readPinnedManifest(caseRoot, input.expectedManifestSha256)
  if (manifest.caseId !== input.caseId ||
    manifest.databaseSha256 !== input.expectedDatabaseSha256 ||
    manifest.campaignPolicyId !== input.expected.campaignPolicyId ||
    manifest.allocationDigest !== input.expected.allocationDigest ||
    manifest.policyDigest !== input.expected.policyDigest ||
    manifest.providerIntentPolicyDigest !== input.expected.providerIntentPolicyDigest ||
    manifest.sourceEventDigest !== input.expected.sourceEventDigest ||
    manifest.preparationId !== e2KernelPreparationId(input.expected.campaignPolicyId,
      input.request.providerRunId, input.request.envelope.operationId)) fail('fixture identity')
  if ((await lstat(dbPath)).size > 67_108_864 ||
    digest(await readFile(dbPath)) !== input.expectedDatabaseSha256) fail('database hash or size')
  // Exclusive marker consumes the allocation before loading Prisma or issuing any SQL.
  const marker = await open(path.join(caseRoot, 'e2-grant-attempt.json'), 'wx', 0o600)
  await marker.writeFile(JSON.stringify({ version: 'M06_E2_GRANT_ATTEMPT_V1', caseId: input.caseId,
    databaseSha256Before: input.expectedDatabaseSha256, manifestSha256: input.expectedManifestSha256 }))
  await marker.close()
  let result: E2KernelResult | undefined
  try {
    const { PrismaClient } = await import('@prisma/client')
    const client = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } })
    try {
      result = await client.$transaction(tx => applyInertE2GrantSqlKernel(tx, input.request,
        input.expected, input.ids, () => new Date(input.finalSampleAt.getTime())))
    } finally {
      await client.$disconnect()
    }
  } catch {
    return { status: 'UNKNOWN_NO_DISPATCH', caseId: input.caseId }
  }
  const after = digest(await readFile(dbPath))
  const safeResult: E2OfflineGrantCaseResult = { status: result.status,
    caseId: input.caseId, result, databaseSha256After: after }
  const receipt = await open(path.join(caseRoot, 'e2-grant-result.json'), 'wx', 0o600)
  await receipt.writeFile(JSON.stringify(safeResult))
  await receipt.close()
  return safeResult
}
