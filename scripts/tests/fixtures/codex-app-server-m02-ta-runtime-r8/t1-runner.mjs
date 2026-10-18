/** Exact T1 runtime supervisor. Import and --prepare are inert with respect to native effects. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createTrustedLauncher } from './launcher.mjs'
import { PROTOCOL_FAILURE_CATEGORIES } from './protocol.mjs'
import { NOTIFICATION_ENVELOPE_FAILURE_REASONS } from './notification-envelope.mjs'
import { prepareTrustedComposition } from './composition.mjs'
import { POLICY, digest } from './policy.mjs'
import { DurableT1Journal, T1_ROOT } from './journal.mjs'
import { createT1ErrorAdapter } from './t1-error-adapter.mjs'
import { stageT1Modules, T1_MODULES } from './t1-module-stage.mjs'
import { verifyPriorAttempt, PRIOR_ROOT, PRIOR_JOURNAL_SHA, PRIOR_TERMINAL_HASH } from './prior-attempt.mjs'
import { writeT1PreparationReceipt } from './preparation-receipt.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const CASE_ROOT = join(T1_ROOT, 'cases', 'T1')
const SUPERVISOR = join(CASE_ROOT, 'supervisor')
const SCHEMAS = join(REPO, '.appraisejs/m02-executable-qualification-20261016-01/schemas')
const SCHEMA_METADATA_SHA = '09b1f301dc5f13d7d5c59dce373b1d4a44a8a900af9955ef1887f10d73228556'
const SCHEMA_INVENTORY_SHA = '4d01664dcc1a511dbbee4142b74d30d0624e9cf682ca41d726e4b2b428fa88c8'
const MANIFEST_DIR = join(REPO, '.appraisejs/m02-ta-t1-build-r8')
const MANIFEST_FILE = join(MANIFEST_DIR, 'manifest.json')
export const R8_REPLACEMENT = Object.freeze({
  priorRoot: '/private/tmp/appraise-m02-ta-descriptors-p4',
  priorManifestDigest: '7239aaabd3da269161d03a42dd7b1fdbb38290226b2b6815829a7f2eea14eb81',
  priorJournalSha256: 'f49c0eeaaa1e4b923cbd861d5da842ca77a200c1542a648106f3c5e5dfa6b16a',
  priorJournalTerminalHash: 'd711e1f2b14e16db8cbe22fbe4883e5b66b8ae7d7a44c35efa9784a6f54617c4',
  classification: 'P4_UNKNOWN_NO_RESEND',
  priorUnresolvedDecisionDueAt: '2026-10-23T14:18:50.368Z',
  originalRoot: PRIOR_ROOT,
  originalJournalSha256: PRIOR_JOURNAL_SHA,
  originalJournalTerminalHash: PRIOR_TERMINAL_HASH,
  originalClassification: 'LOST_RAW_ROOT_AFTER_REVIEW',
  originalUnresolvedDecisionDueAt: '2026-10-22T18:54:08.422Z',
  r5ManifestFileSha256: '02ab0bd9e744a892508e9f0927aee983a5a16ca2df3bef9efd9cc88ffe74dad0',
  r5ExactReviewSha256: '0c02950669b35f0e7025c7b75f5e3868c981097c5a109dba1d6b5b7c2892d7f2',
  r5ExecutionReviewSha256: 'e1bfd273f94cbaccd032358c457ef8e9f54d6668e2a42dca6524d469ff675606',
  r5EvidenceIndexSha256: '84d88f76b79dfded1f891dfac7b6171c7c33462ef2578f41c461eb39c885292c',
  r6ManifestFileSha256: 'a714cf070b301be00165d5dafa00b06fd1fc359ac1fcd4e33b11ed4b47c3b841',
  r6ExactReviewSha256: '338fb7f4c24d63f53217b1e1c9624c545f399b9995058a787319e7136b5a5885',
  r6ExecutionReviewSha256: '4bda6ba13127fc48e22efe02cdd481ba6d4185fad6145be6a2ece8fcb38b0887',
  r6EvidenceIndexSha256: '3a43204c8753c08e5fea18ef3fde38be52832fd75d3ec41e2c9f0a96d1b90b96',
  r7ManifestFileSha256: 'b4d62825dda3ee5351f2bccae3ad52ec322e75d61d87be699f1ce8a56610e432',
  r7ExactReviewSha256: 'bb24dca7f4ac0c61313322f66c28c34481063aad59491fc92b049d5b72ae017e',
  r7ExecutionReviewSha256: '4114466774656a793bae950006eb6185d966e31b1c84d30c9b86fb203d9e3163',
  r7EvidenceIndexSha256: 'e1db9c39e08a209ee71c23a82f9d1b7aa18dcba9bb515371dd316079052d7021',
})
const PROMPT =
  'Inspect the advertised tool descriptors for this synthetic T1 case. Do not call tools or perform actions.'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
export function ownedCodexExitProved(exit, close, killCount) {
  if (killCount !== 1 || !exit || !close) return false
  return (
    (exit.code === null && exit.signal === 'SIGTERM' && close.code === null && close.signal === 'SIGTERM') ||
    (exit.code === 0 && exit.signal === null && close.code === 0 && close.signal === null)
  )
}
const compareExact = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const receiptFile = name => join(SUPERVISOR, name)
const shaFile = async path => sha(await fsp.readFile(path))
const expectedTreeRoots = [
  'scripts/tests/fixtures/codex-app-server-m02-ta',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r4',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r5',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r6',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r7',
  'scripts/tests/fixtures/codex-app-server-m02-ta-runtime-r8',
  'packages/appraisejs/dist',
  'packages/appraisejs/node_modules',
  'node_modules/@prisma',
  'node_modules/.prisma/client',
  'node_modules/zod',
  'prisma/migrations',
]
const fixedPaths = {
  codex: POLICY.executable.path,
  interpreter: '/opt/homebrew/Cellar/node/26.11.0/bin/node',
  'environment-launcher': '/usr/bin/env',
  supervisor: join(HERE, 't1-runner.mjs'),
  'r8-offline-test': join(REPO, 'scripts/tests/codex-app-server-m02-ta-runtime-r8.test.mjs'),
  'r8-preservation-baseline': join(REPO, '.appraisejs/m02-r8-preservation-baseline.json'),
  'r7-offline-test': join(REPO, 'scripts/tests/codex-app-server-m02-ta-runtime-r7.test.mjs'),
  'r6-preservation-baseline': join(REPO, '.appraisejs/m02-r6-preservation-baseline.json'),
  'r7-preservation-baseline': join(REPO, '.appraisejs/m02-r7-preservation-baseline.json'),
  'scoped-mcp-entry': join(HERE, 't1-scoped-entry.mjs'),
  'scoped-worker-root-variant': join(HERE, 'scoped-worker-entry.mjs'),
  policy: join(HERE, 'policy.mjs'),
  'protocol-framing': join(REPO, 'scripts/tests/fixtures/codex-app-server-m02-b1/framing.mjs'),
  'root-package': join(REPO, 'package.json'),
  schema: join(HERE, 'schema-pin.json'),
  'schema-inventory': join(REPO, '.appraisejs/m02-executable-qualification-20261016-01/schema-inventory.json'),
  'schema-metadata': join(REPO, '.appraisejs/m02-executable-qualification-20261016-01/metadata-result.json'),
  'prior-preservation': join(REPO, '.appraisejs/m02-t1-failed-attempt-preservation.json'),
  'archived-prior-journal': join(
    REPO,
    '.appraisejs/m02-prior-evidence-recovery-20261016-01/journal-from-historical-tool-output.jsonl',
  ),
  'archived-prior-provenance': join(REPO, '.appraisejs/m02-prior-evidence-recovery-20261016-01/provenance.json'),
  'archived-prior-review': join(REPO, '.appraisejs/m02-prior-evidence-recovery-20261016-01/review.json'),
  'prior-execution-document': join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t1-execution-01.md'),
  'prior-execution-review': join(REPO, '.appraisejs/m02-t1-execution-01-review.json'),
  'prior-r4-review': join(REPO, '.appraisejs/m02-t1-r4-exact-review.json'),
  'prior-r4-manifest': join(REPO, '.appraisejs/m02-ta-t1-build-r4/manifest.json'),
  'prior-r5-manifest': join(REPO, '.appraisejs/m02-ta-t1-build-r5/manifest.json'),
  'prior-r5-offline-test': join(REPO, 'scripts/tests/codex-app-server-m02-ta-runtime-r5.test.mjs'),
  'prior-r5-exact-review': join(REPO, '.appraisejs/m02-t1-r5-exact-review.json'),
  'prior-r5-execution-review': join(REPO, '.appraisejs/m02-t1-r5-execution-review.json'),
  'prior-r5-evidence-index': join(REPO, '.appraisejs/m02-ta-t1-r5-execution-evidence-01/index.json'),
  'prior-r5-evidence-journal': join(
    REPO,
    '.appraisejs/m02-ta-t1-r5-execution-evidence-01/supervisor--journal--journal.jsonl',
  ),
  'prior-r5-evidence-module-stage': join(
    REPO,
    '.appraisejs/m02-ta-t1-r5-execution-evidence-01/supervisor--module-stage.json',
  ),
  'prior-r6-manifest': join(REPO, '.appraisejs/m02-ta-t1-build-r6/manifest.json'),
  'prior-r6-offline-test': join(REPO, 'scripts/tests/codex-app-server-m02-ta-runtime-r6.test.mjs'),
  'prior-r6-exact-review': join(REPO, '.appraisejs/m02-t1-r6-exact-review.json'),
  'prior-r6-execution-review': join(REPO, '.appraisejs/m02-t1-r6-execution-review.json'),
  'prior-r6-execution-document-review': join(REPO, '.appraisejs/m02-t1-r6-execution-document-review.json'),
  'prior-r6-evidence-index': join(REPO, '.appraisejs/m02-ta-t1-r6-execution-evidence-01/index.json'),
  'prior-r6-evidence-journal': join(
    REPO,
    '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--journal--journal.jsonl',
  ),
  'prior-r6-evidence-protocol-failure': join(
    REPO,
    '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--protocol-failure.json',
  ),
  'prior-r6-evidence-owned-child': join(
    REPO,
    '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--owned-child-observation.json',
  ),
  'prior-r6-evidence-module-stage': join(
    REPO,
    '.appraisejs/m02-ta-t1-r6-execution-evidence-01/supervisor--module-stage.json',
  ),
  'prior-r7-manifest': join(REPO, '.appraisejs/m02-ta-t1-build-r7/manifest.json'),
  'prior-r7-exact-review': join(REPO, '.appraisejs/m02-t1-r7-exact-review.json'),
  'prior-r7-execution-review': join(REPO, '.appraisejs/m02-t1-r7-execution-review.json'),
  'prior-r7-execution-document-review': join(REPO, '.appraisejs/m02-t1-r7-execution-document-review.json'),
  'prior-r7-execution-document': join(REPO, 'tasks/codex-app-server-journeys/m02-ta-t1-execution-04.md'),
  'prior-r7-evidence-index': join(REPO, '.appraisejs/m02-ta-t1-r7-execution-evidence-01/index.json'),
  'prior-r7-evidence-journal': join(
    REPO,
    '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--journal--journal.jsonl',
  ),
  'prior-r7-evidence-protocol-failure': join(
    REPO,
    '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--protocol-failure.json',
  ),
  'prior-r7-evidence-owned-child': join(
    REPO,
    '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--owned-child-observation.json',
  ),
  'prior-r7-evidence-module-stage': join(
    REPO,
    '.appraisejs/m02-ta-t1-r7-execution-evidence-01/supervisor--module-stage.json',
  ),
  'notification-inventory': join(HERE, 'notification-inventory.json'),
  'canonical-backend': join(REPO, '.appraisejs/m02-ta-r8-canonical-build-01/canonical-bridge.mjs'),
  'canonical-r8-provenance': join(REPO, '.appraisejs/m02-ta-r8-canonical-build-01/provenance.json'),
  'accepted-r7-canonical-backend': join(REPO, '.appraisejs/m02-ta-r7-canonical-build-01/canonical-bridge.mjs'),
  'canonical-r7-provenance': join(REPO, '.appraisejs/m02-ta-r7-canonical-build-01/provenance.json'),
  'accepted-r6-canonical-backend': join(REPO, '.appraisejs/m02-ta-r6-canonical-build-01/canonical-bridge.mjs'),
  'accepted-canonical-backend': join(REPO, '.appraisejs/m02-ta-r4-canonical-build-01/canonical-bridge.mjs'),
  'canonical-variant-build-manifest': join(REPO, '.appraisejs/m02-ta-r4-canonical-build-01/manifest.json'),
  'descriptor-collector': join(REPO, 'packages/appraisejs/dist/mcp/native-descriptor-capture.js'),
}

async function treeFiles(directory, io, output) {
  const state = await io.lstat(directory)
  if (!state.isDirectory() || state.isSymbolicLink()) throw new Error('runtime dependency tree identity')
  for (const entry of (await io.readdir(directory, { withFileTypes: true })).sort((a, b) =>
    compareExact(a.name, b.name),
  )) {
    if (entry.name === '.bin' && directory.endsWith('/node_modules')) continue
    const file = join(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error('runtime dependency symlink')
    if (entry.isDirectory()) await treeFiles(file, io, output)
    else if (entry.isFile()) output.push(file)
    else throw new Error('runtime dependency special file')
  }
}

/** Hash every file in the conservative T1 runtime closure; no placeholder pins. */
export async function prepareT1({ io = fsp, repo = REPO } = {}) {
  if (repo !== REPO) throw new Error('exact T1 artifact paths required')
  verifyPriorAttempt()
  const schemaBytes = await io.readFile(fixedPaths.schema)
  if (sha(schemaBytes) !== POLICY.executable.schemaDigest) throw new Error('schema pin drift')
  const schema = JSON.parse(schemaBytes)
  if (
    schema.schema !== 'appraise.m02-ta-r5-schema-pin/v1' ||
    schema.files.length !== 318 ||
    schema.binarySha256 !== POLICY.executable.sha256
  )
    throw new Error('schema evidence mismatch')
  const metadataBytes = await io.readFile(fixedPaths['schema-metadata'])
  if (sha(metadataBytes) !== SCHEMA_METADATA_SHA) throw new Error('schema metadata pin drift')
  const metadata = JSON.parse(metadataBytes)
  if (
    metadata.executable?.sha256After !== POLICY.executable.sha256 ||
    metadata.executable?.version !== `codex-cli ${POLICY.executable.version}` ||
    metadata.schemaGeneration?.fileCount !== 318
  )
    throw new Error('schema metadata mismatch')
  const inventoryBytes = await io.readFile(fixedPaths['schema-inventory'])
  if (sha(inventoryBytes) !== SCHEMA_INVENTORY_SHA) throw new Error('schema inventory pin drift')
  const inventory = JSON.parse(inventoryBytes)
  if (
    inventory.completeInventory?.length !== schema.files.length ||
    inventory.completeInventory.some(
      (item, index) =>
        item.file !== schema.files[index].file ||
        item.bytes !== schema.files[index].bytes ||
        item.sha256 !== schema.files[index].sha256,
    )
  )
    throw new Error('schema inventory drift')
  const paths = new Map(Object.entries(fixedPaths).map(([purpose, path]) => [path, purpose]))
  const actualSchemas = []
  await treeFiles(SCHEMAS, io, actualSchemas)
  if (actualSchemas.length !== schema.files.length) throw new Error('schema file count drift')
  const actualSchemaSet = new Set(actualSchemas)
  for (const item of schema.files) {
    const path = join(SCHEMAS, item.file)
    if (!actualSchemaSet.delete(path) || sha(await io.readFile(path)) !== item.sha256)
      throw new Error('schema file drift')
    paths.set(path, `schema:${item.file}`)
  }
  if (actualSchemaSet.size) throw new Error('extra schema files')
  const notificationBytes = await io.readFile(fixedPaths['notification-inventory'])
  const notificationInventory = JSON.parse(notificationBytes)
  const serverSchema = JSON.parse(await io.readFile(join(SCHEMAS, 'ServerNotification.json')))
  if (
    sha(notificationBytes) !== '29435b26b02342dd544b359042479c9c7a13f9ac6b8f47ec2c63150be67a517e' ||
    notificationInventory.sourceSha256 !== '8e719512bc26bb3871fcf7b378b79abf912d82787609c0ad418b71f179d0883f' ||
    notificationInventory.methodCount !== 85 ||
    notificationInventory.notifications.length !== 85 ||
    serverSchema.oneOf.length !== 85 ||
    notificationInventory.notifications.some(
      (entry, index) => entry.method !== serverSchema.oneOf[index].properties.method.enum[0],
    )
  )
    throw new Error('server notification inventory drift')
  for (const tree of expectedTreeRoots) {
    const entries = []
    await treeFiles(join(repo, tree), io, entries)
    if (!entries.length) throw new Error('empty runtime dependency tree')
    for (const entry of entries) if (!paths.has(entry)) paths.set(entry, `dependency:${relative(repo, entry)}`)
  }
  const artifacts = []
  for (const [path, purpose] of [...paths].sort(([a], [b]) => compareExact(a, b))) {
    const state = await io.lstat(path)
    if (!state.isFile() || state.isSymbolicLink()) throw new Error('runtime artifact identity')
    artifacts.push({ purpose, path, sha256: sha(await io.readFile(path)) })
  }
  const oldManifest = JSON.parse(await io.readFile(fixedPaths['prior-r4-manifest'], 'utf8'))
  if (oldManifest.manifest?.artifacts?.length !== 5812) throw new Error('accepted r4 closure changed')
  for (const item of oldManifest.manifest.artifacts) {
    if (item.path !== POLICY.executable.path && sha(await io.readFile(item.path)) !== item.sha256)
      throw new Error('accepted r4 artifact drift')
  }
  const r5Manifest = JSON.parse(await io.readFile(fixedPaths['prior-r5-manifest'], 'utf8'))
  if (
    r5Manifest.manifestDigest !== 'd50d6e7d3fd6f672e6c55b54e8b3473b8f5d32750daba6b597017dd07561111d' ||
    r5Manifest.manifest?.artifacts?.length !== 6154
  )
    throw new Error('accepted r5 closure changed')
  for (const item of r5Manifest.manifest.artifacts) {
    if (item.path !== POLICY.executable.path && sha(await io.readFile(item.path)) !== item.sha256)
      throw new Error('accepted r5 artifact drift')
  }
  const r6Manifest = JSON.parse(await io.readFile(fixedPaths['prior-r6-manifest'], 'utf8'))
  if (
    sha(await io.readFile(fixedPaths['prior-r6-manifest'])) !== R8_REPLACEMENT.r6ManifestFileSha256 ||
    r6Manifest.manifestDigest !== '7dd6df107dfe033056b12addf0d31beb99d3eece1efa3d6e5635aca636970a1f' ||
    r6Manifest.manifest?.artifacts?.length !== 6179
  )
    throw new Error('accepted r6 closure changed')
  for (const item of r6Manifest.manifest.artifacts) {
    if (item.path !== POLICY.executable.path && sha(await io.readFile(item.path)) !== item.sha256)
      throw new Error('accepted r6 artifact drift')
  }
  if (
    sha(await io.readFile(fixedPaths['prior-r5-offline-test'])) !==
      '4d4f3359c21bcad15e4e542d7c4dc6fc6930a8883576cd0762a477b0d250fb2a' ||
    sha(await io.readFile(fixedPaths['r6-preservation-baseline'])) !==
      'f578081347f06a46b1668138fc9b878c372b80f079a995ce8220e3a86bec4428' ||
    sha(await io.readFile(fixedPaths['r7-preservation-baseline'])) !==
      'a23995a875313222189f9600aaa2fd6fe02d03748988624a2866c5fa36f5c7bb' ||
    sha(await io.readFile(fixedPaths['prior-r6-offline-test'])) !==
      'c4331dcaaf1be21bd9058feb7f90c5320d025e812fd320e6e51ca71d30d13c34' ||
    sha(await io.readFile(fixedPaths['prior-r6-execution-document-review'])) !==
      'cf6697a7cb6163d022557b0feec597cf03a9edf9a82e81000c1d3ddbbda2eb47'
  )
    throw new Error('accepted source or preservation baseline drift')
  if (
    artifacts.find(item => item.purpose === 'protocol-framing')?.sha256 !==
    '40aacec14d421f41c1c1da5dc9bec2d491ca713f0c8e3552f495d60b9eda8a34'
  )
    throw new Error('accepted framing drift')
  const r7Manifest = JSON.parse(await io.readFile(fixedPaths['prior-r7-manifest'], 'utf8'))
  if (
    sha(await io.readFile(fixedPaths['prior-r7-manifest'])) !== R8_REPLACEMENT.r7ManifestFileSha256 ||
    r7Manifest.manifestDigest !== R8_REPLACEMENT.priorManifestDigest ||
    r7Manifest.manifest?.artifacts?.length !== 6206
  )
    throw new Error('accepted r7 closure changed')
  for (const item of r7Manifest.manifest.artifacts) {
    if (item.path !== POLICY.executable.path && sha(await io.readFile(item.path)) !== item.sha256)
      throw new Error('accepted r7 artifact drift')
  }
  if (
    sha(await io.readFile(fixedPaths['r8-preservation-baseline'])) !==
      '338bc07ae9b33a61ad8bb2c12f96f046512e3cf6804593450e9995000380e368' ||
    sha(await io.readFile(fixedPaths['r7-offline-test'])) !==
      r7Manifest.manifest.artifacts.find(item => item.path === fixedPaths['r7-offline-test'])?.sha256 ||
    sha(await io.readFile(fixedPaths['prior-r7-execution-document-review'])) !==
      'ca965f158f6c324533b9b8375953f0c1b5e5f554046f04144bc5fe8b20d9709c'
  )
    throw new Error('accepted r7 evidence drift')
  const oldCanonical = await io.readFile(fixedPaths['accepted-r7-canonical-backend'])
  const canonical = await io.readFile(fixedPaths['canonical-backend'])
  const from = '/private/tmp/appraise-m02-ta-descriptors-p4'
  const to = '/private/tmp/appraise-m02-ta-descriptors-p5'
  if (
    sha(oldCanonical) !== 'ce1406d248f65d46a23b86389be49ab7776ea2ef76e7c5bc6a967d4fea767df7' ||
    sha(canonical) !== 'd5902ff2d6e94655e73d29fc6300a494fdbfe961814af3a290b65c1ea7b786f7' ||
    canonical.toString('utf8').split(to).length !== 2 ||
    sha(Buffer.from(canonical.toString('utf8').replace(to, from))) !== sha(oldCanonical)
  )
    throw new Error('canonical p5 variant drift')
  const canonicalProvenance = JSON.parse(await io.readFile(fixedPaths['canonical-r8-provenance'], 'utf8'))
  if (
    canonicalProvenance.acceptedInput?.sha256 !== sha(oldCanonical) ||
    canonicalProvenance.output?.sha256 !== sha(canonical) ||
    canonicalProvenance.replacement?.count !== 1 ||
    canonicalProvenance.replacement?.from !== from ||
    canonicalProvenance.replacement?.to !== to
  )
    throw new Error('canonical p5 provenance drift')
  const prepared = prepareTrustedComposition({ phase: 'T1', artifacts })
  if (prepared.blockers.length || prepared.manifest.cases.join() !== 'T1') throw new Error('T1 composition blocked')
  const manifest = Object.freeze({ ...prepared.manifest, root: T1_ROOT, replacementAttempt: R8_REPLACEMENT })
  const manifestDigest = digest(manifest)
  return Object.freeze({
    ...prepared,
    manifest,
    manifestDigest,
    dependencyFiles: artifacts.length,
    qualification: 'OFFLINE_PREPARED_ONLY',
    invocation: [
      fixedPaths['environment-launcher'],
      '-i',
      'PATH=/usr/bin:/bin',
      'LANG=C',
      fixedPaths.interpreter,
      fixedPaths.supervisor,
      '--run-replacement',
      MANIFEST_FILE,
      manifestDigest,
    ],
  })
}

function exactState(stat, expected) {
  return (
    stat.isDirectory() &&
    !stat.isSymbolicLink() &&
    stat.dev === expected.dev &&
    stat.ino === expected.ino &&
    stat.uid === process.getuid() &&
    (stat.mode & 0o777) === 0o700
  )
}

/** One-use adoption of only the root this process just exclusively created for its journal. */
export function t1RootIo({
  rootStat,
  baseFs = fsp,
  spawnChild = spawn,
  server = createServer,
  tuple,
  nativeErrorGate,
} = {}) {
  if (!rootStat || typeof tuple !== 'function') throw new Error('T1 owned-root token and tuple required')
  let rootMkdirConsumed = false
  const fileSystem = new Proxy(baseFs, {
    get(target, key) {
      if (key === 'mkdir')
        return async (path, options) => {
          if (path !== T1_ROOT) return target.mkdir(path, options)
          if (rootMkdirConsumed || options?.recursive || options?.mode !== 0o700)
            throw new Error('T1 root token consumed')
          const current = await target.lstat(path)
          if (!exactState(current, rootStat)) throw new Error('T1 owned root changed')
          rootMkdirConsumed = true
        }
      if (key === 'lstat')
        return async path => {
          const current = await target.lstat(path)
          if (path === T1_ROOT && !exactState(current, rootStat)) throw new Error('T1 owned root changed')
          return current
        }
      return target[key]
    },
  })
  const childObservations = []
  let nativeErrorAdapter = null
  const owned = { child: null, server: null, killCount: 0, serverCloseCount: 0, serverClosed: false }
  return Object.freeze({
    fs: fileSystem,
    createServer(...args) {
      if (owned.server) throw new Error('T1 second listener forbidden')
      const instance = server(...args)
      owned.server = instance
      instance.once('close', () => {
        owned.serverClosed = true
      })
      const close = instance.close.bind(instance)
      instance.close = (...closeArgs) => {
        if (owned.serverCloseCount++) throw new Error('T1 listener close already requested')
        return close(...closeArgs)
      }
      return instance
    },
    tuple,
    fileDigest: async path => sha(await baseFs.readFile(path)),
    spawn(...args) {
      if (owned.child) throw new Error('T1 second Codex child forbidden')
      const child = spawnChild(...args)
      owned.child = child
      if (nativeErrorGate) {
        if (!child.stdout?.pipe) throw new Error('T1 owned stdout unavailable for error classifier')
        nativeErrorAdapter = createT1ErrorAdapter(nativeErrorGate)
        nativeErrorAdapter.stream.on('error', nativeErrorGate.onAmbiguous)
        child.stdout.pipe(nativeErrorAdapter.stream)
        child.stdout = nativeErrorAdapter.stream
      }
      const kill = child.kill.bind(child)
      child.kill = signal => {
        if (owned.killCount++) throw new Error('T1 child signal already requested')
        if (signal !== 'SIGTERM') throw new Error('T1 child signal not reviewed')
        return kill(signal)
      }
      const evidence = { exit: null, close: null }
      evidence.exitPromise = new Promise(resolve =>
        child.once('exit', (code, signal) => {
          evidence.exit = { code, signal }
          resolve(evidence.exit)
        }),
      )
      evidence.closePromise = new Promise(resolve =>
        child.once('close', (code, signal) => {
          evidence.close = { code, signal }
          resolve(evidence.close)
        }),
      )
      childObservations.push(evidence)
      return child
    },
    childObservations,
    nativeError: () => nativeErrorAdapter?.snapshot() ?? null,
    owned,
    rootMkdirConsumed: () => rootMkdirConsumed,
  })
}

export function trackT1Bridge(bridge, { onProfile } = {}) {
  let bootstrap = null
  let bound = null
  return Object.freeze({
    bootstrapConfig(url) {
      const value = bridge.bootstrapConfig(url)
      if (bootstrap) throw new Error('T1 duplicate bootstrap configuration')
      bootstrap = {
        capabilityHash: `sha256:${sha(value.capability)}`,
        bootstrapHash: `sha256:${sha(JSON.stringify(value))}`,
        requestId: null,
      }
      return value
    },
    async handle(request) {
      const action = request?.action
      if (action !== 'bootstrap' && action !== 'bindProfile') throw new Error('T1 canonical action forbidden')
      if (
        (action === 'bootstrap' && (!bootstrap || bootstrap.requestId)) ||
        (action === 'bindProfile' && (!bootstrap?.requestId || bound))
      )
        throw new Error('T1 canonical startup sequence')
      const result = await bridge.handle(request)
      if (result?.ok !== true || result.requestId !== request.requestId) throw new Error('T1 canonical startup failed')
      if (action === 'bootstrap') bootstrap = { ...bootstrap, requestId: request.requestId }
      else {
        const profile = request.payload?.advertisedProfile
        if (!/^sha256:[a-f0-9]{64}$/.test(profile?.profileDigest ?? '')) throw new Error('T1 profile binding missing')
        bound = { requestId: request.requestId, profileDigest: profile.profileDigest }
        onProfile?.(bound)
      }
      return result
    },
    snapshot: () => ({ bootstrap, bound, fenced: bridge.fenced }),
    close: () => bridge.close?.(),
  })
}

export function t1TurnParams(threadId) {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(threadId ?? '')) throw new Error('actual thread id required')
  return Object.freeze({
    threadId,
    model: POLICY.model,
    effort: POLICY.reasoning,
    input: [{ type: 'text', text: PROMPT, text_elements: [] }],
  })
}

/** Validate only the two pinned target fields from the observed provider request. Never retain its body. */
export function assertT1ObservedTuple(request) {
  if (!Buffer.isBuffer(request?.body) || request.body.length < 1 || request.body.length > 1024 * 1024)
    throw new Error('T1 observed target tuple UNKNOWN')
  let body
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(request.body))
  } catch {
    throw new Error('T1 observed target tuple UNKNOWN')
  }
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    body.model !== POLICY.model ||
    !body.reasoning ||
    typeof body.reasoning !== 'object' ||
    Array.isArray(body.reasoning) ||
    body.reasoning.effort !== POLICY.reasoning
  )
    throw new Error('T1 observed target tuple UNKNOWN')
  return Object.freeze({ model: POLICY.model, effort: POLICY.reasoning })
}

export function t1InitializeParams() {
  return {
    clientInfo: { name: 'appraise_m02_t1', version: '1' },
    capabilities: { experimentalApi: false, explicitGatewayOauth: true, requestAttestation: false },
  }
}

export function sanitizeT1SupervisorEnvironment(env = process.env) {
  if (globalThis.prisma !== undefined) throw new Error('ambient Prisma client present')
  if (process.cwd() !== REPO) throw new Error('T1 supervisor cwd must be the exact repository')
  const keep = { PATH: '/usr/bin:/bin', LANG: 'C' }
  for (const key of Object.keys(env)) delete env[key]
  Object.assign(env, keep, {
    NODE_ENV: 'production',
    DATABASE_URL: `file:${receiptFile('fixture.db')}`,
  })
  return Object.freeze({ databaseUrl: env.DATABASE_URL, ambientKeysRetained: Object.keys(keep) })
}

function writeOwnedJson(path, value, io = fs) {
  if (dirname(path) !== SUPERVISOR || !/^[a-z0-9-]+\.json$/.test(path.slice(SUPERVISOR.length + 1)))
    throw new Error('T1 evidence path mismatch')
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  if (bytes.length > 1024 * 1024) throw new Error('T1 evidence bound')
  const fd = io.openSync(
    path,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    io.writeFileSync(fd, bytes)
    io.fsyncSync(fd)
  } finally {
    io.closeSync(fd)
  }
  const directory = io.openSync(SUPERVISOR, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    io.fsyncSync(directory)
  } finally {
    io.closeSync(directory)
  }
}

export function normalStopJournal(journal, { write = writeOwnedJson } = {}) {
  let intent = false
  return new Proxy(journal, {
    get(target, key) {
      if (key !== 'recordRecovery') {
        const value = target[key]
        return typeof value === 'function' ? value.bind(target) : value
      }
      return ({ id, action }) => {
        if (target.snapshot().fenced) return target.recordRecovery({ id, action })
        if (
          (action === 'owned-stop-intent' && intent) ||
          (action === 'owned-stop-observed' && !intent) ||
          !['owned-stop-intent', 'owned-stop-observed'].includes(action)
        )
          throw new Error('T1 normal-stop sequence invalid')
        write(receiptFile(action === 'owned-stop-intent' ? 'normal-stop-intent.json' : 'normal-stop-observed.json'), {
          schema: 'appraise.m02-ta-t1-normal-stop/v1',
          caseId: 'T1',
          action,
          id,
          journalSequence: target.snapshot().seq,
          evidenceClass: 'SUPERVISOR_OWNED_HANDLE_RECEIPT',
        })
        if (action === 'owned-stop-intent') intent = true
      }
    },
  })
}

async function waitUntil(read, expected, deadline, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (;;) {
    const value = await read()
    if (expected(value)) return value
    if (Date.now() >= deadline) throw new Error('T1 deadline; UNKNOWN')
    await pause(20)
  }
}

async function withDeadline(effect, deadline, clock = Date.now) {
  let timer
  try {
    return await Promise.race([
      effect,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('T1 operation deadline; UNKNOWN')), Math.max(1, deadline - clock()))
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Cleanup only handles observed by this supervisor when the launcher did not return. */
export async function stopPartialT1({
  io,
  journal,
  approved,
  existingAuthorization,
  manifestDigest,
  deadline,
  clock = Date.now,
}) {
  const owned = io?.owned
  if (!owned || (!owned.child && !owned.server)) return { noOwnedHandles: true }
  if (!journal.snapshot().fenced) throw new Error('partial T1 cleanup requires UNKNOWN fence')
  const authority = existingAuthorization ?? approved({ action: 'owned-stop', manifestDigest })
  if ((await withDeadline(Promise.resolve(authority), deadline, clock)) !== true)
    throw new Error('partial T1 owned-stop authority missing')
  try {
    journal.recordRecovery({ id: 'T1-partial-stop-intent', action: 'owned-stop-intent' })
  } catch {
    // An already-fenced or unusable journal cannot turn an observed owned handle into an orphan.
  }
  if (owned.child && !owned.killCount) owned.child.kill('SIGTERM')
  if (owned.server && !owned.serverCloseCount) {
    const close = new Promise((resolve, reject) => owned.server.close(error => (error ? reject(error) : resolve())))
    await withDeadline(close, deadline, clock)
  } else if (owned.server) {
    await waitUntil(() => owned.serverClosed, Boolean, deadline)
  }
  if (owned.child) {
    const child = io.childObservations[0]
    if (!child) throw new Error('partial T1 child observer missing')
    await waitUntil(() => child.exit, Boolean, deadline)
    await waitUntil(() => child.close, Boolean, deadline)
  }
  journal.recordRecovery({ id: 'T1-partial-stop-observed', action: 'owned-stop-observed' })
  return { childExit: io.childObservations[0]?.exit ?? null, listenerClosed: owned.serverClosed }
}

async function readReceipt(path) {
  const state = await fsp.lstat(path)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o600 ||
    state.size > 4096
  )
    throw new Error('T1 child receipt identity')
  return JSON.parse(await fsp.readFile(path, 'utf8'))
}

async function verifyT1Artifacts(prepared) {
  for (const artifact of prepared.manifest.artifacts) {
    const state = await fsp.lstat(artifact.path)
    if (!state.isFile() || state.isSymbolicLink() || (await shaFile(artifact.path)) !== artifact.sha256)
      throw new Error('T1 artifact drift before effects')
  }
}

export function verifyChildReceipt(receipt, event, bridge, startup = null) {
  const bound = bridge.snapshot().bound
  const expectedBootstrap = bridge.snapshot().bootstrap
  return (
    receipt?.schema === 'appraise.m02-ta-t1-child-receipt/v1' &&
    receipt.caseId === 'T1' &&
    receipt.event === event &&
    receipt.evidenceClass === 'TRUSTED_CHILD_SELF_REPORT' &&
    receipt.capabilityHash === expectedBootstrap?.capabilityHash &&
    receipt.bootstrapHash === expectedBootstrap?.bootstrapHash &&
    receipt.profileDigest === bound?.profileDigest &&
    (!startup ||
      (receipt.capabilityHash === startup.capabilityHash &&
        receipt.bootstrapHash === startup.bootstrapHash &&
        receipt.profileDigest === startup.profileDigest))
  )
}

export function classifyT1PreparationFailure(step) {
  if (step === 'runtime-io') return 'OWNED_RUNTIME_IO_SETUP_UNCERTAIN'
  if (step === 'staging') return 'PINNED_MODULE_STAGING_UNCERTAIN'
  if (step === 'stage-receipt') return 'OWNED_STAGE_RECEIPT_UNCERTAIN'
  if (step === 'backend-import') return 'STAGED_BACKEND_IMPORT_UNCERTAIN'
  if (step === 'collector-import') return 'PINNED_COLLECTOR_IMPORT_UNCERTAIN'
  if (step === 'prelaunch-construction') return 'PRELAUNCH_CONSTRUCTION_UNCERTAIN'
  return null
}

/** Effect path only after a separate exact approval. --prepare and import remain inert. */
export async function runT1({
  prepared,
  approved,
  collectorBundle = fixedPaths['descriptor-collector'],
  bridgeBundle = fixedPaths['canonical-backend'],
  createJournal = () => DurableT1Journal.create(),
  makeLauncher = createTrustedLauncher,
  loadBridge = path => import(pathToFileURL(path).href),
  loadCollector = path => import(pathToFileURL(path).href),
  stageModules = stageT1Modules,
  makeIo,
  clock = Date.now,
  preflight = {
    prepare: prepareT1,
    verifyPrior: verifyPriorAttempt,
    rootExists: () => fs.existsSync(T1_ROOT),
    verifyArtifacts: verifyT1Artifacts,
    sanitize: sanitizeT1SupervisorEnvironment,
    rootStat: () => fs.lstatSync(T1_ROOT),
  },
  readChildReceipt = readReceipt,
  writeEvidence = writeOwnedJson,
  writePreparationReceipt = writeT1PreparationReceipt,
  makeJournalFacade = normalStopJournal,
  caseDeadlineMs = POLICY.deadlineMs.case,
} = {}) {
  if (
    typeof approved !== 'function' ||
    !prepared ||
    prepared.manifestDigest !== digest(prepared.manifest) ||
    prepared.manifest.phase !== 'T1' ||
    prepared.manifest.root !== T1_ROOT ||
    JSON.stringify(prepared.manifest.replacementAttempt) !== JSON.stringify(R8_REPLACEMENT) ||
    prepared.blockers.length ||
    !prepared.manifest.artifacts.some(
      item => item.purpose === 'descriptor-collector' && item.path === collectorBundle,
    ) ||
    !prepared.manifest.artifacts.some(item => item.purpose === 'canonical-backend' && item.path === bridgeBundle) ||
    !Number.isInteger(caseDeadlineMs) ||
    caseDeadlineMs < 1 ||
    caseDeadlineMs > POLICY.deadlineMs.case
  )
    throw new Error('exact T1 reviewed manifest required')
  if ((await approved({ action: 'T1-preflight', manifestDigest: prepared.manifestDigest })) !== true)
    throw new Error('T1 runtime approval absent')
  const exactPrepared = await preflight.prepare()
  if (exactPrepared.manifestDigest !== prepared.manifestDigest)
    throw new Error('T1 manifest inventory differs from current runtime closure')
  preflight.verifyPrior()
  if (preflight.rootExists()) throw new Error('T1 phase root already exists; no retry')
  await preflight.verifyArtifacts(prepared)
  preflight.sanitize()
  const journal = createJournal()
  const recordProtocolFailure = ({
    category,
    phase,
    pendingKind,
    seq,
    methodSha256 = null,
    frameKind,
    safeRemoteStatus,
    hasEnvironment,
    envelopeFailureReason = null,
    timestampPresent = false,
  }) => {
    if (
      !PROTOCOL_FAILURE_CATEGORIES.includes(category) ||
      ![
        'new',
        'ready',
        'thread',
        'turn',
        'terminal',
        'capture-stopped',
        'required-mcp-failed',
        'permission-denied',
      ].includes(phase) ||
      ![null, 'initialize', 'thread/start', 'turn/start'].includes(pendingKind) ||
      !(seq === null || (Number.isSafeInteger(seq) && seq >= 0)) ||
      !(methodSha256 === null || /^[a-f0-9]{64}$/.test(methodSha256)) ||
      !['request', 'notification', 'response', 'invalid'].includes(frameKind) ||
      ![null, 'disabled', 'connecting', 'connected', 'errored', 'OTHER'].includes(safeRemoteStatus) ||
      typeof hasEnvironment !== 'boolean' ||
      !(envelopeFailureReason === null || NOTIFICATION_ENVELOPE_FAILURE_REASONS.includes(envelopeFailureReason)) ||
      typeof timestampPresent !== 'boolean'
    )
      throw new Error('unreviewed protocol failure category')
    writePreparationReceipt({
      journal,
      name: 'protocol-failure.json',
      value: {
        schema: 'appraise.m02-ta-r8-protocol-failure/v1',
        status: 'UNKNOWN',
        category,
        phase,
        pendingKind,
        seq,
        methodSha256,
        frameKind,
        safeRemoteStatus,
        hasEnvironment,
        envelopeFailureReason,
        timestampPresent,
      },
    })
  }
  let runtimeIo = null
  let started = null
  let capture = null
  let startup = null
  let canonical = null
  let canonicalCloseAttempted = false
  let stopStarted = false
  let stopAuthorization = null
  let stopPromise = null
  let deadline = clock() + caseDeadlineMs
  const cleanupReserveMs = Math.min(10_000, Math.max(5, Math.floor(caseDeadlineMs / 4)))
  let dispatchDeadline = deadline - cleanupReserveMs
  let preparationStep = 'runtime-io'
  const fallbackReserveMs = Math.max(2, Math.floor(cleanupReserveMs / 2))
  try {
    const rootStat = preflight.rootStat()
    runtimeIo =
      makeIo?.(rootStat) ??
      t1RootIo({
        rootStat,
        nativeErrorGate: {
          afterCapture: () => ({
            captured: capture?.status === 'CAPTURED',
            threadId: started?.peer.snapshot().threadId,
            turnId: started?.peer.snapshot().turnId,
          }),
          onAccepted: value => writeEvidence(receiptFile('provider-error.json'), value),
          onAmbiguous: () => {
            if (!journal.snapshot().fenced) journal.markUnknown('native-provider-error-variant')
          },
          onEnvelopeFailure: failure =>
            recordProtocolFailure({
              category: 'NOTIFICATION_ENVELOPE_INVALID',
              phase: started?.peer.snapshot().phase ?? 'new',
              pendingKind: started?.peer.snapshot().pendingKind ?? null,
              seq: journal.snapshot().seq ?? null,
              methodSha256: failure.methodSha256,
              frameKind: 'notification',
              safeRemoteStatus: null,
              hasEnvironment: false,
              envelopeFailureReason: failure.reason,
              timestampPresent: failure.timestampPresent,
            }),
        },
        tuple: async () => {
          const plist = await fsp.readFile('/System/Library/CoreServices/SystemVersion.plist', 'utf8')
          return {
            platform: process.platform,
            arch: process.arch,
            osBuild: plist.match(/<key>ProductBuildVersion<\/key>\s*<string>([^<]+)<\/string>/)?.[1],
            nodeExecutable: process.execPath,
            nodeMajor: Number(process.versions.node.split('.')[0]),
          }
        },
      })
    preparationStep = 'staging'
    const staged = await withDeadline(
      stageModules({
        prepared,
        sourceBundle: bridgeBundle,
        moduleRoot: T1_MODULES,
        phaseStat: journal.parentStats?.[0],
        supervisorStat: journal.parentStats?.[1],
      }),
      dispatchDeadline,
      clock,
    )
    if (!staged?.bundlePath || !/^([a-f0-9]{64})$/.test(staged.stagedDigest ?? ''))
      throw new Error('T1 staged module provenance missing')
    preparationStep = 'stage-receipt'
    writePreparationReceipt({
      journal,
      name: 'module-stage.json',
      value: {
        schema: 'appraise.m02-ta-t1-module-stage/v1',
        sourceBundle: bridgeBundle,
        stagedBundle: staged.bundlePath,
        copiedFiles: staged.copiedFiles,
        stagedDigest: staged.stagedDigest,
        resolutionClass: 'STAGED_MODULES_ONLY',
      },
    })
    preparationStep = 'backend-import'
    const backend = await withDeadline(loadBridge(staged.bundlePath), dispatchDeadline, clock)
    preparationStep = 'collector-import'
    const collectorModule = await withDeadline(loadCollector(collectorBundle), dispatchDeadline, clock)
    preparationStep = 'prelaunch-construction'
    if (
      typeof backend.createLazyCanonicalSupervisorBridge !== 'function' ||
      typeof collectorModule.NativeDescriptorCollector !== 'function'
    )
      throw new Error('T1 compiled modules mismatch')
    canonical = trackT1Bridge(
      backend.createLazyCanonicalSupervisorBridge({
        role: 'REQUIREMENT_ANALYZER',
        workspace: SUPERVISOR,
        caseId: 'T1',
        onUnknown: () => {
          if (!journal.snapshot().fenced) journal.markUnknown('canonical-ambiguity')
        },
      }),
    )
    const collector = new collectorModule.NativeDescriptorCollector()
    preparationStep = null
    const launcher = makeLauncher({
      prepared,
      journal: makeJournalFacade(journal),
      authorize: input => {
        if (input.action === 'owned-stop') {
          if (stopStarted) return false
          stopStarted = true
          stopAuthorization = Promise.resolve(approved({ action: input.action, manifestDigest: input.manifestDigest }))
          return stopAuthorization
        }
        return approved({ action: input.action, manifestDigest: input.manifestDigest })
      },
      io: runtimeIo,
      clock,
      verifyMcpStartup: async result => {
        if (
          !result?.thread?.id ||
          !canonical.snapshot().bootstrap ||
          !canonical.snapshot().bound ||
          canonical.snapshot().fenced
        )
          return false
        startup = await waitUntil(
          async () => {
            if (journal.snapshot().fenced) throw new Error('T1 startup fenced')
            return readChildReceipt(receiptFile('mcp-startup.json')).catch(() => null)
          },
          Boolean,
          dispatchDeadline,
        ).catch(() => null)
        return verifyChildReceipt(startup, 'sdk-connect-returned', canonical)
      },
      recordProtocolFailure,
    })
    deadline = clock() + caseDeadlineMs
    dispatchDeadline = deadline - cleanupReserveMs
    started = await withDeadline(
      launcher.startCase({
        caseId: 'T1',
        canonicalBridge: canonical,
        onCaptured: request => {
          const peer = started?.peer.snapshot()
          if (!peer?.threadId || !peer?.turnId) throw new Error('actual T1 peer IDs unavailable')
          const observedTuple = assertT1ObservedTuple(request)
          const collected = collector.capture(request, {
            binarySha256: `sha256:${POLICY.executable.sha256}`,
            platform: `${POLICY.executable.platform}-${POLICY.executable.arch}`,
            configSha256: `sha256:${sha(JSON.stringify(started.config.config))}`,
            schemaSha256: `sha256:${POLICY.executable.schemaDigest}`,
            runId: prepared.manifestDigest,
            requestId: 'T1-listener-request-1',
            threadId: peer.threadId,
            turnId: peer.turnId,
          })
          if (collected.status !== 'CAPTURED') throw new Error('actual native descriptor capture incomplete')
          const result = Object.freeze({ ...collected, observedTuple })
          writeEvidence(receiptFile('descriptor-capture.json'), result)
          capture = result
          return result
        },
      }),
      dispatchDeadline,
      clock,
    )
    await withDeadline(
      started.peer.request('initialize', t1InitializeParams(), 'T1-initialize'),
      dispatchDeadline,
      clock,
    )
    await waitUntil(
      () => started.peer.snapshot(),
      state => {
        if (journal.snapshot().fenced) throw new Error('T1 peer fenced UNKNOWN')
        return state.phase === 'thread'
      },
      dispatchDeadline,
    )
    const actualThread = started.peer.snapshot().threadId
    await withDeadline(
      started.peer.request('turn/start', t1TurnParams(actualThread), 'T1-turn-start'),
      dispatchDeadline,
      clock,
    )
    await waitUntil(
      () => started.peer.snapshot(),
      state => {
        if (journal.snapshot().fenced) throw new Error('T1 peer fenced UNKNOWN')
        return state.phase === 'capture-stopped'
      },
      dispatchDeadline,
    )
    if (!capture || journal.snapshot().counts.providerRequests !== 1 || journal.snapshot().counts.scopedCalls !== 0)
      throw new Error('T1 capture counters mismatch')
    const nativeError = runtimeIo.nativeError?.()
    if (
      nativeError?.threadId !== actualThread ||
      nativeError?.turnId !== started.peer.snapshot().turnId ||
      nativeError?.httpStatusCode !== 503
    )
      throw new Error('T1 captured-provider 503 notification missing')
    stopPromise = started.stopOwned()
    const stop = await withDeadline(stopPromise, deadline - fallbackReserveMs, clock)
    const child = runtimeIo.childObservations?.[0]
    if (!stop.listenerClosed || !child) throw new Error('T1 owned cleanup unproved')
    const exit = await waitUntil(() => child.exit, Boolean, deadline)
    const close = await waitUntil(() => child.close, Boolean, deadline)
    const mcpExit = await waitUntil(
      () => readChildReceipt(receiptFile('mcp-exit.json')).catch(() => null),
      Boolean,
      deadline,
    )
    if (
      !verifyChildReceipt(mcpExit, 'node-exit-handler', canonical, startup) ||
      mcpExit.exitCode !== 0 ||
      !ownedCodexExitProved(exit, close, runtimeIo.owned?.killCount)
    )
      throw new Error('T1 owned child exit evidence incomplete')
    if (journal.snapshot().pending.length !== 0) throw new Error('T1 pending durable intent')
    canonicalCloseAttempted = true
    await withDeadline(Promise.resolve(canonical.close()), deadline, clock)
    const verifyEvidence = () => {
      const peer = started.peer.snapshot()
      const state = journal.snapshot()
      return (
        capture?.status === 'CAPTURED' &&
        typeof capture.descriptorHash === 'string' &&
        state.counts.providerRequests === 1 &&
        state.counts.scopedCalls === 0 &&
        state.pending.length === 0 &&
        peer.phase === 'capture-stopped' &&
        peer.threadId === actualThread &&
        peer.turnId === capture.provenance?.turnId &&
        runtimeIo.nativeError?.()?.notificationSha256 === nativeError.notificationSha256 &&
        verifyChildReceipt(startup, 'sdk-connect-returned', canonical) &&
        verifyChildReceipt(mcpExit, 'node-exit-handler', canonical, startup) &&
        mcpExit.exitCode === 0 &&
        child.exit === exit &&
        child.close === close &&
        runtimeIo.owned?.serverClosed === true &&
        runtimeIo.owned?.killCount === 1 &&
        runtimeIo.owned?.serverCloseCount === 1
      )
    }
    if (!verifyEvidence()) throw new Error('T1 completion evidence drift')
    await withDeadline(
      started.coordinator.complete({ outcome: 'capture', cleanupKnown: true, verifyEvidence }),
      deadline,
      clock,
    )
    return {
      status: 'T1_CAPTURED',
      manifestDigest: prepared.manifestDigest,
      descriptorHash: capture.descriptorHash,
      threadId: actualThread,
      turnId: started.peer.snapshot().turnId,
      journal: journal.snapshot(),
      retention: journal.snapshot().retention,
      cleanup: {
        codexExit: exit,
        codexClose: close,
        listenerClosed: true,
        mcpExitEvidence: 'TRUSTED_CHILD_SELF_REPORT',
        rawCodexHistoryDeleted: false,
      },
    }
  } catch (error) {
    const preparationCode = classifyT1PreparationFailure(preparationStep)
    try {
      if (!journal.snapshot().fenced) journal.markUnknown('T1-runtime-ambiguity')
    } catch {
      /* retain uncertainty */
    }
    if (preparationCode) {
      try {
        writePreparationReceipt({
          journal,
          name: 'preparation-error.json',
          value: {
            schema: 'appraise.m02-ta-t1-preparation-error/v1',
            caseId: 'T1',
            code: preparationCode,
            status: 'UNKNOWN',
          },
        })
      } catch {
        /* journal UNKNOWN is authoritative when receipt cannot be written */
      }
    }
    if (started && !stopStarted) {
      stopPromise = started.stopOwned()
      await withDeadline(
        stopPromise.catch(() => {}),
        deadline - fallbackReserveMs,
        clock,
      ).catch(() => {})
    }
    if (
      (runtimeIo?.owned?.child || runtimeIo?.owned?.server) &&
      ((runtimeIo.owned?.child && !runtimeIo.owned.killCount) ||
        (runtimeIo.owned?.server && !runtimeIo.owned.serverCloseCount))
    ) {
      await withDeadline(
        stopPartialT1({
          io: runtimeIo,
          journal,
          approved,
          existingAuthorization: stopAuthorization,
          manifestDigest: prepared.manifestDigest,
          deadline,
          clock,
        }),
        deadline,
        clock,
      ).catch(() => {})
    }
    if (runtimeIo?.owned?.child) {
      const observation = runtimeIo.childObservations?.[0]
      if (observation?.exitPromise && observation?.closePromise) {
        await withDeadline(Promise.all([observation.exitPromise, observation.closePromise]), deadline, clock).catch(
          () => {},
        )
      }
      const safeSignal = value => (value === 'SIGTERM' ? 'SIGTERM' : value == null ? null : 'OTHER')
      try {
        writePreparationReceipt({
          journal,
          name: 'owned-child-observation.json',
          value: {
            schema: 'appraise.m02-ta-r8-owned-child-observation/v1',
            status: 'UNKNOWN',
            stopRequested: Boolean(runtimeIo.owned.killCount),
            exitObserved: Boolean(observation?.exit),
            closeObserved: Boolean(observation?.close),
            exitCode: Number.isSafeInteger(observation?.exit?.code) ? observation.exit.code : null,
            closeCode: Number.isSafeInteger(observation?.close?.code) ? observation.close.code : null,
            exitSignal: safeSignal(observation?.exit?.signal),
            closeSignal: safeSignal(observation?.close?.signal),
            processExitProved: Boolean(observation?.exit && observation?.close),
          },
        })
      } catch {
        /* Missing diagnostic receipts cannot promote UNKNOWN or authorize a retry. */
      }
    }
    if (preparationCode) throw new Error(`T1 preparation UNKNOWN: ${preparationCode}`)
    throw error
  } finally {
    if (canonical && !canonicalCloseAttempted) {
      canonicalCloseAttempted = true
      await withDeadline(Promise.resolve(canonical.close()), deadline, clock).then(
        () => {},
        () => {
          try {
            if (!journal.snapshot().fenced) journal.markUnknown('canonical-close-uncertain')
          } catch {}
        },
      )
    }
    journal.close()
  }
}

function writePreparedManifest(value) {
  fs.mkdirSync(MANIFEST_DIR, { mode: 0o700 })
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
  if (bytes.length > 8 * 1024 * 1024) throw new Error('T1 manifest bound')
  const fd = fs.openSync(
    MANIFEST_FILE,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  const directory = fs.openSync(
    MANIFEST_DIR,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  )
  try {
    fs.fsyncSync(directory)
  } finally {
    fs.closeSync(directory)
  }
  return {
    manifestFile: MANIFEST_FILE,
    manifestFileSha256: sha(bytes),
    manifestDigest: value.manifestDigest,
    dependencyFiles: value.dependencyFiles,
    invocation: value.invocation,
  }
}

function readPreparedManifest(path, expectedDigest) {
  if (path !== MANIFEST_FILE || !/^[a-f0-9]{64}$/.test(expectedDigest ?? ''))
    throw new Error('exact T1 manifest argument required')
  const directory = fs.lstatSync(MANIFEST_DIR)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('T1 manifest directory identity')
  const state = fs.lstatSync(path)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o600 ||
    state.size > 8 * 1024 * 1024
  )
    throw new Error('T1 manifest file identity')
  const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  let raw
  try {
    const opened = fs.fstatSync(fd)
    if (opened.dev !== state.dev || opened.ino !== state.ino || opened.size !== state.size)
      throw new Error('T1 manifest file replaced')
    raw = fs.readFileSync(fd, 'utf8')
  } finally {
    fs.closeSync(fd)
  }
  const value = JSON.parse(raw)
  if (
    value.manifestDigest !== expectedDigest ||
    digest(value.manifest) !== expectedDigest ||
    value.manifest.root !== T1_ROOT ||
    JSON.stringify(value.manifest.replacementAttempt) !== JSON.stringify(R8_REPLACEMENT) ||
    value.qualification !== 'OFFLINE_PREPARED_ONLY' ||
    value.manifest.runtimeAuthorized !== false
  )
    throw new Error('T1 manifest digest or qualification mismatch')
  return value
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv[2] === '--prepare' && process.argv.length === 3) {
    prepareT1()
      .then(value => process.stdout.write(`${JSON.stringify(writePreparedManifest(value))}\n`))
      .catch(() => {
        process.stderr.write('T1 preparation blocked.\n')
        process.exitCode = 1
      })
  } else if (process.argv[2] === '--run-replacement' && process.argv.length === 5) {
    const exactDigest = process.argv[4]
    const allowed = new Set([
      'T1-preflight',
      'owned-loopback-listener',
      'private-synthetic-bootstrap',
      'codex-child',
      'owned-stdio-send',
      'scripted-provider-request',
      'canonical-ipc-request',
      'owned-stop',
    ])
    Promise.resolve()
      .then(() => readPreparedManifest(process.argv[3], exactDigest))
      .then(prepared =>
        runT1({
          prepared,
          approved: ({ action, manifestDigest }) => manifestDigest === exactDigest && allowed.has(action),
        }),
      )
      .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
      .catch(() => {
        process.stderr.write('T1 stopped UNKNOWN or failed preflight; inspect owned evidence.\n')
        process.exit(1)
      })
  } else {
    process.stderr.write('T1 requires exact --prepare or --run-replacement manifest digest invocation.\n')
    process.exitCode = 1
  }
}
