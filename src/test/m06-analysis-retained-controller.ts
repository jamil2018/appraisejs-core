// Direct OS-main fixture entry. Static bundling does not execute this module.
import assert from 'node:assert/strict'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync, writeSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseUniqueJson } from '../../scripts/test-harness/m06/unique-json.mjs'
import { verifyPhysicalClient } from '../../scripts/test-harness/m06/source-custody/source-custody-client-binding.mjs'
import { RetainedAnalysisLifetime } from './m06-analysis-retained-lifetime'

const fileRecordSchema = z
  .object({ filename: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() })
  .strict()
type FileRecord = z.infer<typeof fileRecordSchema>
const operationsSchema = z
  .object({
    judgment: z.literal('ACCEPT'),
    scope: z.literal('EXACT_M06_RETAINED_ANALYSIS_CONTROLLER_AND_OPERATIONS'),
    executionAuthorized: z.literal(true),
    manifest: fileRecordSchema,
    rootDirectory: z.string(),
    migratedDatabase: fileRecordSchema,
    caseName: z.string(),
    argv: z.array(z.string()),
    environment: z.record(z.string()),
    cwd: z.string(),
    freshDatabaseReceipt: fileRecordSchema,
  })
  .strict()
const manifestSchema = z
  .object({
    version: z.literal(1),
    runtimeExecuted: z.literal(false),
    entry: fileRecordSchema,
    outputs: z.array(fileRecordSchema),
    preRuntimeOutputs: z.array(z.string()),
    externalImports: z.array(z.string()),
    installedRoots: z.array(z.string()),
    packageDependencyEdges: z.array(
      z
        .object({
          specifier: z.string(),
          from: z.string(),
          declared: z.string().nullable(),
          directory: z.string(),
          actualName: z.string(),
        })
        .strict(),
    ),
    excludedPackageInputs: z.array(
      z
        .object({
          filename: z.string(),
          kind: z.enum(['directory', 'symlink', 'file']),
          bytes: z.number(),
          mode: z.number(),
          reason: z.literal('NON_RUNTIME_CANDIDATE_METADATA_ONLY'),
        })
        .strict(),
    ),
    inputs: z.array(fileRecordSchema),
    clientBinding: fileRecordSchema,
    clientEntry: z.string(),
    executable: fileRecordSchema,
    nodeVersion: z.string(),
    repositoryRoot: z.string(),
    migrations: z.array(fileRecordSchema).length(93),
  })
  .strict()
const pristineSchema = z
  .object({
    status: z.literal('FRESH_PRISTINE_MIGRATED_DATABASE_KNOWN_CLOSED'),
    database: fileRecordSchema,
    clientClosed: z.literal(true),
    campaignCreated: z.literal(true),
    migrations: z.array(fileRecordSchema).length(93),
  })
  .strict()
const admittedCases = [
  'recovers claim/admission/ACK gaps and sends one actual owned-child successor from an effect-free canonical predecessor',
  'retains actual acknowledged M05 UNKNOWN across answer, wake ACK, reconnect and competing scheduler ticks',
  'recovers the prepare-before-claim gap with the same immutable run and no reconstructed armed permit',
  'rolls back answer, review event, issuance, authorization and wake when issuance persistence fails',
  'serializes concurrent required answers and exact retries into one logical round without a provider turn',
  'refuses lost credentials, stale identity and revoked authority without new effects',
  'canonical-authored-A-B-C',
]
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
function readRecord(row: FileRecord) {
  fileRecordSchema.parse(row)
  assert.ok(path.isAbsolute(row.filename) && realpathSync(row.filename) === row.filename)
  assert.ok(!/^\.env(?:\.|$)/.test(path.basename(row.filename)), 'Env contents are never inputs.')
  assert.ok(lstatSync(row.filename).isFile())
  const bytes = readFileSync(row.filename)
  assert.equal(bytes.length, row.bytes)
  assert.equal(digest(bytes), row.sha256)
  return bytes
}
function readAdmission() {
  const [reviewPath] = process.argv.slice(2)
  assert.equal(process.argv.length, 3, 'Exactly one approved operations artifact is required.')
  assert.ok(path.isAbsolute(reviewPath) && realpathSync(reviewPath) === reviewPath)
  assert.ok(!/^\.env(?:\.|$)/.test(path.basename(reviewPath)))
  const review = operationsSchema.parse(parseUniqueJson(readFileSync(reviewPath, 'utf8')))
  assert.ok(admittedCases.includes(review.caseName), 'Unknown exact case.')
  assert.equal(review.judgment, 'ACCEPT')
  assert.equal(review.scope, 'EXACT_M06_RETAINED_ANALYSIS_CONTROLLER_AND_OPERATIONS')
  assert.equal(review.executionAuthorized, true)
  assert.deepEqual(review.argv, process.argv)
  assert.deepEqual(review.environment, Object.fromEntries(Object.entries(process.env)))
  assert.equal(review.cwd, process.cwd())
  const manifest = manifestSchema.parse(parseUniqueJson(readRecord(review.manifest).toString('utf8')))
  assert.equal(manifest.version, 1)
  assert.equal(manifest.runtimeExecuted, false)
  assert.equal(manifest.entry.filename, fileURLToPath(import.meta.url))
  assert.ok(
    manifest.outputs.some(
      output => output.filename === manifest.entry.filename && output.sha256 === manifest.entry.sha256,
    ),
  )
  assert.equal(manifest.executable.filename, process.execPath)
  assert.equal(manifest.nodeVersion, process.version)
  for (const row of [...manifest.inputs, ...manifest.outputs, manifest.executable]) readRecord(row)
  assert.equal(manifest.migrations.length, 93)
  for (const row of manifest.migrations) readRecord(row)
  const binding = parseUniqueJson(readRecord(manifest.clientBinding).toString('utf8'))
  assert.equal(
    manifest.clientEntry,
    z
      .object({ facts: z.object({ entry: z.string() }).passthrough() })
      .passthrough()
      .parse(binding).facts.entry,
  )
  verifyPhysicalClient(binding)
  const campaignRoot = path.join(manifest.repositoryRoot, '.appraisejs', 'm06-retained-campaigns')
  assert.equal(path.dirname(review.rootDirectory), campaignRoot, 'Only a fresh direct campaign child is allowed.')
  assert.equal(realpathSync(campaignRoot), campaignRoot)
  assert.equal(existsSync(review.rootDirectory), false, 'Original allocations cannot be reused.')
  assert.ok(review.migratedDatabase.filename.startsWith(campaignRoot + path.sep))
  assert.equal(path.dirname(review.migratedDatabase.filename), path.dirname(review.freshDatabaseReceipt.filename))
  const receipt = pristineSchema.parse(parseUniqueJson(readRecord(review.freshDatabaseReceipt).toString('utf8')))
  assert.equal(receipt.status, 'FRESH_PRISTINE_MIGRATED_DATABASE_KNOWN_CLOSED')
  assert.equal(receipt.clientClosed, true)
  assert.equal(receipt.campaignCreated, true)
  assert.deepEqual(receipt.database, review.migratedDatabase)
  assert.deepEqual(receipt.migrations, manifest.migrations)
  // The independently approved receipt identifies this new known-closed input, never an old database.
  readRecord(review.migratedDatabase)
  return review
}

// Failure reporting is bounded to fixed messages and cannot retire the retained owner.
function reportRetainedFailure(message: string) {
  try {
    writeSync(2, message)
  } catch {
    /* Unavailable stderr leaves the original retained lifetime untouched. */
  }
}

// No product/client import or canonical allocation precedes exact artifact/invocation admission.
const admission = readAdmission()
const owner = new RetainedAnalysisLifetime()
const retainedLifetime = setInterval(() => {
  void owner.failed
}, 60_000)
let allocated = false
try {
  mkdirSync(admission.rootDirectory, { mode: 0o700 })
  allocated = true
  const retainedAnalysisScenarios = await owner.track('original-scheduler-scenarios-import', async () => {
    const { retainedAnalysisScenarios } = await import('./m06-analysis-retained-scenarios')
    return retainedAnalysisScenarios
  })
  const retainedCanonicalAnalysisABC = await owner.track('original-canonical-scenario-import', async () => {
    const { retainedCanonicalAnalysisABC } = await import('./m06-analysis-retained-canonical')
    return retainedCanonicalAnalysisABC
  })
  const scenarios = { ...retainedAnalysisScenarios, 'canonical-authored-A-B-C': retainedCanonicalAnalysisABC }
  assert.ok(Object.hasOwn(scenarios, admission.caseName), 'Unknown exact case.')
  const scenario = scenarios[admission.caseName as keyof typeof scenarios]
  await owner.track('original-selected-scenario', () =>
    scenario({
      rootDirectory: admission.rootDirectory,
      migratedDatabasePath: admission.migratedDatabase.filename,
      owner,
      allocated: 0,
    }),
  )
  await owner.closeKnownSettledClients()
  writeFileSync(
    path.join(admission.rootDirectory, 'known-closed.json'),
    JSON.stringify(owner.disposition(), null, 2) + '\n',
    { flag: 'wx' },
  )
  clearInterval(retainedLifetime)
} catch {
  owner.retainFailure()
  // The interval and this lexical owner retain actual clients/deliveries/original promises on any ambiguity.
  if (allocated) {
    try {
      writeFileSync(
        path.join(admission.rootDirectory, 'retained-failure.json'),
        JSON.stringify({ code: 'RETAINED_ANALYSIS_FAILURE', ...owner.disposition() }, null, 2) + '\n',
        { flag: 'wx' },
      )
    } catch {
      reportRetainedFailure('RETAINED_ANALYSIS_EVIDENCE_WRITE_FAILED\n')
    }
  }
  reportRetainedFailure('RETAINED_ANALYSIS_FAILURE_NO_RETRY\n')
}
