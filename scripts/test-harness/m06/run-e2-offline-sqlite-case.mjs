#!/usr/bin/env node
/** Single-use C1 SQLite runner. Reviews are external; this script never certifies its own containment. */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const script = fileURLToPath(import.meta.url)
const sourceRoot = path.resolve(path.dirname(script), '../../..')
const base = path.resolve(sourceRoot, '../..')
const caseBase = path.join(base, 'e2-prisma-offline')
const reviewBase = path.join(base, 'operations/e2-c1-sqlite')
const dependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const generatedRoot = path.join(base, 'e2-prisma-offline/20b046fc-c16c-4dc6-a577-72a3c276506a/mirror/node_modules/.prisma/client')
const sourcePaths = [
  'src/services/coordinator/quality-journey-e2-retirement-service.sqlite.integration.test.ts',
  'src/services/coordinator/quality-journey-e2-retirement-service.ts',
  'src/services/coordinator/quality-journey-coordinator-session.ts',
  'src/services/shared/errors.ts',
  'src/lib/quality-journey/e2-campaign-policy-contract.ts',
  'src/lib/quality-journey/provider-grant-contract.ts',
  'src/lib/catalog-contracts/canonical-json.ts',
]
const selector = sourcePaths[0]
const migrationIds = [
  '20261024010000_add_journey_e2_effect_admission',
  '20261024020000_add_journey_shared_resource_claims',
  '20261024030000_add_journey_e2_operation_preparation',
  '20261024040000_add_automation_materialization_source_proof',
]
const hostRoots = ['/System/Volumes/Preboot/Cryptexes', '/System/Cryptexes', '/System/Library', '/usr/lib', '/usr/share', '/private/var/db/dyld', '/opt/homebrew', '/usr/local/lib']
const forbidden = /^(?:\.env(?:\..*)?|\.npmrc|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.vite|\.next)$/i
const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fail = reason => { throw new Error(`E2 C1 SQLite run refused: ${reason}`) }
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && Object.keys(value).every(key => fields.includes(key))
const absolute = value => {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value ||
    /[\r\n\0]/.test(value)) fail('absolute_path')
  return value
}
const relative = value => {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.normalize(value) !== value ||
    value.split('/').some(part => !part || part === '.' || part === '..' || forbidden.test(part))) fail('relative_path')
  return value
}
const hostPath = value => hostRoots.some(root => absolute(value).startsWith(`${root}/`)) &&
  !value.split('/').some(part => forbidden.test(part))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fileHash = file => new Promise((resolve, reject) => {
  const h = createHash('sha256'), stream = createReadStream(file)
  stream.on('data', bytes => h.update(bytes)); stream.on('error', reject)
  stream.on('end', () => resolve(h.digest('hex')))
})
const regular = async file => {
  const stat = await fs.lstat(file)
  const linkedToolInput = stat.nlink === 2 && [
    path.join(dependencyRoot, '@esbuild/darwin-arm64/bin/esbuild'),
    path.join(dependencyRoot, 'esbuild/bin/esbuild'),
  ].includes(file)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.nlink !== 1 && !linkedToolInput) || await fs.realpath(file) !== file) fail('nonregular_file')
  return stat
}
const assertHash = async (file, expected) => {
  if (!sha.test(expected)) fail('hash_format')
  await regular(file)
  if (await fileHash(file) !== expected) fail('hash_mismatch')
}
const readJson = async (file, canonical = false) => {
  await regular(file)
  let bytes, value
  try { bytes = await fs.readFile(file, 'utf8'); value = JSON.parse(bytes) } catch { fail('json') }
  if (canonical && bytes !== `${JSON.stringify(value)}\n`) fail('noncanonical_json')
  return value
}
const writeNew = async (file, body) => fs.writeFile(file, body, { flag: 'wx', mode: 0o600 })
function assertLauncher() {
  const locale = '__CF_USER_TEXT_ENCODING'
  const names = Object.keys(process.env).filter(key => key !== locale).sort()
  if (names.join(',') !== 'CI,HOME,OPENSSL_CONF,PATH,TMPDIR' || process.env.CI !== '1' ||
    process.env.OPENSSL_CONF !== '' || process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${reviewBase}/`) || !process.env.TMPDIR?.startsWith(`${reviewBase}/`) ||
    (process.env[locale] !== undefined && !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[locale]))) fail('launcher_environment')
}
async function assertMirror(root, m) {
  const expected = new Map([
    ...Object.entries(m.sourceFiles),
    ...m.dependencyFiles.map(item => [item.path, item.sha256]),
    ...m.generatedFiles.map(item => [`node_modules/.prisma/client/${item.path}`, item.sha256]),
    ...Object.entries(m.generatedHashes).filter(([name]) => name.startsWith('mirror/'))
      .map(([name, value]) => [name.slice(7), value]),
  ])
  if (expected.size !== sourcePaths.length + m.dependencyFiles.length + 27 + 3) fail('mirror_duplicate')
  const seen = new Set(); let visited = 0
  const walk = async (directory, prefix = '') => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++visited > expected.size * 8 + 100) fail('mirror_bound')
      const name = prefix ? `${prefix}/${entry.name}` : entry.name
      const file = path.join(directory, entry.name), stat = await fs.lstat(file)
      if (stat.isSymbolicLink()) fail('mirror_link')
      if (stat.isDirectory()) await walk(file, name)
      else if (stat.isFile() && expected.has(name)) { await assertHash(file, expected.get(name)); seen.add(name) }
      else fail('mirror_extra')
    }
  }
  await walk(path.join(root, 'mirror'))
  if (seen.size !== expected.size) fail('mirror_missing')
}
async function review(ref, kind, m, manifestHash, profileHash, selfCheckHash = null, lateHash = null) {
  if (!exact(ref, ['path', 'sha256'])) fail('review_reference')
  const file = absolute(ref.path)
  if (path.dirname(file) !== reviewBase || !/^review-[A-Za-z0-9_-]+\.json$/.test(path.basename(file))) fail('review_path')
  await assertHash(file, ref.sha256)
  const r = await readJson(file, true)
  const common = ['version', 'kind', 'caseId', 'manifestSha256', 'profileSha256', 'decision', 'reviewId']
  const extras = kind === 'SOURCE_CLOSURE' ?
    ['sourceClosureComplete', 'generatedClientRuntimeClosureReviewed', 'fixtureAndClientHashesReviewed',
      'toolsAndAddonsReviewed', 'selectorsAndConfigReviewed'] :
    kind === 'OPERATIONAL_PROFILE' ?
      ['profileAndArgsReviewed', 'negativeControlsReviewed', 'signalOraclesReviewed',
        'codeAndArgsAllowlistReviewed', 'productEntryExcluded', 'exactDatabaseWritesReviewed'] :
      kind === 'HOST_EFFECTIVE_CONFINEMENT' ?
        ['selfCheckResultSha256', 'osEnforcedProfile', 'negativeControlsObserved',
          'ownedTermAndKillObserved', 'networkDeny', 'processClosure', 'fileBoundary', 'subprocessClosure',
          'nativeLoaderClosure'] :
        ['lateManifestSha256', 'sourceReviewSha256', 'operationalReviewSha256', 'hostProofSha256',
          'lateManifestAndDatabaseReviewed', 'testEntryAuthorized']
  if (!exact(r, [...common, ...extras]) || r.version !== 'M06_E2_C1_SQLITE_REVIEW_V1' ||
    r.kind !== kind || r.caseId !== m.caseId || r.manifestSha256 !== manifestHash ||
    r.profileSha256 !== profileHash || r.decision !== 'ACCEPT' || typeof r.reviewId !== 'string' || !r.reviewId ||
    (kind === 'HOST_EFFECTIVE_CONFINEMENT' && r.selfCheckResultSha256 !== selfCheckHash) ||
    (kind === 'TEST_ENTRY' && r.lateManifestSha256 !== lateHash) ||
    extras.filter(key => !['selfCheckResultSha256', 'lateManifestSha256', 'sourceReviewSha256',
      'operationalReviewSha256', 'hostProofSha256'].includes(key)).some(key => r[key] !== true)) fail('review_scope')
  return r
}
function inspectSelfCheck(bytes) {
  let result; try { result = JSON.parse(bytes.toString('utf8')) } catch { fail('self_check_json') }
  if (!exact(result, ['version', 'read', 'exec', 'bind', 'term', 'forced']) ||
    result.version !== 'M06_E2_C1_SQLITE_SELF_CHECK_V1' ||
    [result.read, result.exec, result.bind].filter(value => value === 'EPERM' || value === 'EACCES').length !== 3 ||
    !isDeepStrictEqual(result.term, { code: 0, signal: null, termSent: true, forced: false }) ||
    !isDeepStrictEqual(result.forced, { code: null, signal: 'SIGKILL', termSent: true, forced: true })) fail('self_check_oracles')
  return result
}
function launch(binary, args, options) {
  return new Promise(resolve => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'], detached: true })
    child.stdin?.end()
    const stdout = [], stderr = []
    let outBytes = 0, errBytes = 0, overLimit = false, timedOut = false
    let interruption = null, killError = null, spawnError = null
    const kill = () => {
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL') }
      catch (error) { if (error.code !== 'ESRCH') killError = error.code || 'KILL_FAILED' }
    }
    const onTerm = () => { interruption = 'SIGTERM'; kill() }
    const onInt = () => { interruption = 'SIGINT'; kill() }
    process.on('SIGTERM', onTerm); process.on('SIGINT', onInt)
    const timer = setTimeout(() => { timedOut = true; kill() }, options.timeoutMs)
    child.stdout?.on('data', bytes => { outBytes += bytes.length; if (outBytes > 1_048_576) { overLimit = true; kill() } else stdout.push(bytes) })
    child.stderr?.on('data', bytes => { errBytes += bytes.length; if (errBytes > 1_048_576) { overLimit = true; kill() } else stderr.push(bytes) })
    child.on('error', error => { spawnError = error.code || 'SPAWN_FAILED' })
    child.on('close', (code, signal) => {
      clearTimeout(timer); process.off('SIGTERM', onTerm); process.off('SIGINT', onInt)
      resolve({ pid: child.pid ?? null, code, signal, spawnError, overLimit, timedOut,
        interruption, killError, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
    })
  })
}
async function main() {
  if (process.platform !== 'darwin') fail('macos_only')
  assertLauncher()
  if (process.argv.length !== 10 || process.argv[2] !== '--case' || process.argv[4] !== '--operation' ||
    process.argv[6] !== '--operation-sha256' || process.argv[8] !== '--stage') fail('args')
  const root = absolute(process.argv[3]), operationPath = absolute(process.argv[5])
  const operationHash = process.argv[7], stage = process.argv[9]
  if (!['self-check', 'test'].includes(stage) || !uuid.test(path.basename(root)) ||
    path.dirname(root) !== caseBase || await fs.realpath(root) !== root ||
    operationPath !== path.join(root, `${stage}-operation.json`) || !sha.test(operationHash)) fail('case_scope')
  for (const name of ['mirror', 'home', 'tmp', 'receipts']) {
    const dir = path.join(root, name), stat = await fs.lstat(dir)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(dir) !== dir) fail('case_directory')
  }
  const manifestPath = path.join(root, 'case-manifest.json')
  const manifestHash = await fileHash(manifestPath), m = await readJson(manifestPath, true)
  const manifestFields = ['version', 'caseId', 'caseRoot', 'sourceRoot', 'dependencyRoot',
    'preparerSha256', 'preparePacketSha256', 'sourceFiles', 'dependencyFiles', 'dependencyAliases',
    'generatedFiles', 'fixture', 'evidence', 'runtimeClosure', 'tools', 'hostReadFiles',
    'hostMetadataPaths', 'hostDirectoryReadPaths', 'hostAliasMetadata', 'versions', 'canary',
    'generatedHashes', 'env', 'args', 'status']
  if (!exact(m, manifestFields) || m.version !== 'M06_E2_C1_SQLITE_CASE_V1' || m.caseId !== path.basename(root) ||
    m.caseRoot !== root || m.sourceRoot !== sourceRoot || m.dependencyRoot !== dependencyRoot ||
    m.status !== 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY' || !exact(m.sourceFiles, sourcePaths) ||
    sourcePaths.some(name => !sha.test(m.sourceFiles[name])) || !Array.isArray(m.generatedFiles) ||
    m.generatedFiles.length !== 27 || !Array.isArray(m.dependencyFiles) || m.dependencyFiles.length < 8 ||
    !exact(m.generatedHashes, ['mirror/vitest.e2-c1-sqlite.config.mjs', 'mirror/package.json',
      'mirror/e2-c1-sqlite-signal-child.mjs', 'self-check.mjs', 'sandbox.sb']) ||
    !isDeepStrictEqual(m.args, ['run', '--config', 'vitest.e2-c1-sqlite.config.mjs', '--configLoader', 'native', selector])) fail('manifest_scope')
  await assertHash(operationPath, operationHash)
  const op = await readJson(operationPath, true)
  const opFields = ['version', 'stage', 'caseId', 'manifestSha256', 'profileSha256', 'runnerSha256',
    'sourceReview', 'operationalReview', ...(stage === 'test' ?
      ['hostProof', 'selfCheckResultSha256', 'lateManifestSha256', 'testReview'] : [])]
  if (!exact(op, opFields) || op.version !== 'M06_E2_C1_SQLITE_OPERATION_V1' ||
    op.stage !== stage || op.caseId !== m.caseId || op.manifestSha256 !== manifestHash) fail('operation_scope')
  const profileHash = m.generatedHashes?.['sandbox.sb']
  if (op.profileSha256 !== profileHash) fail('profile_scope')
  await assertHash(script, op.runnerSha256)
  await assertHash(path.join(sourceRoot, 'scripts/test-harness/m06/prepare-e2-offline-sqlite-case.mjs'), m.preparerSha256)
  await assertHash(path.join(root, 'sandbox.sb'), profileHash)
  await assertHash(path.join(root, 'self-check.mjs'), m.generatedHashes['self-check.mjs'])
  await assertHash(path.join(root, 'mirror/e2-c1-sqlite-signal-child.mjs'),
    m.generatedHashes['mirror/e2-c1-sqlite-signal-child.mjs'])
  if (!exact(m.tools, ['node', 'sandboxExec']) || !exact(m.tools.node, ['path', 'sha256', 'version']) ||
    !exact(m.tools.sandboxExec, ['path', 'sha256']) || m.tools.node.path !== process.execPath ||
    m.tools.node.version !== process.version || m.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tools')
  for (const tool of Object.values(m.tools)) await assertHash(tool.path, tool.sha256)
  if (!exact(m.runtimeClosure, ['ledgerPath', 'ledgerSha256', 'reviewPath', 'reviewSha256']) ||
    m.runtimeClosure.ledgerPath !== path.join(base, 'plans/m06-e2-generated-client-runtime-closure-r2-2026-10-24.json') ||
    m.runtimeClosure.ledgerSha256 !== 'dd7e4a1e4ebcde9000f18b48b6c8fb47177565387f345f8473b98a3e3de6fccb' ||
    path.dirname(absolute(m.runtimeClosure.reviewPath)) !== reviewBase) fail('runtime_closure_reference')
  await assertHash(m.runtimeClosure.ledgerPath, m.runtimeClosure.ledgerSha256)
  await assertHash(m.runtimeClosure.reviewPath, m.runtimeClosure.reviewSha256)
  const closureReview = await readJson(m.runtimeClosure.reviewPath, true)
  if (closureReview.kind !== 'GENERATED_CLIENT_RUNTIME_CLOSURE' || closureReview.decision !== 'ACCEPT' ||
    closureReview.ledgerSha256 !== m.runtimeClosure.ledgerSha256 ||
    closureReview.exactGeneratedDirectDependenciesReviewed !== true ||
    closureReview.enginePathAndLoaderReadsReviewed !== true || closureReview.hostLibraryClosureReviewed !== true ||
    closureReview.dependencyManifestSha256 !== hash(JSON.stringify(m.dependencyFiles))) fail('runtime_closure_unqualified')
  if (!exact(m.versions, ['vitest', 'vite', 'esbuild', 'zod'])) fail('versions')
  if (!Array.isArray(m.hostReadFiles) || m.hostReadFiles.length > 2000 ||
    !Array.isArray(m.hostMetadataPaths) || !Array.isArray(m.hostDirectoryReadPaths) ||
    !Array.isArray(m.hostAliasMetadata) || !Array.isArray(m.dependencyAliases)) fail('closure_lists')
  if (!exact(m.canary, ['path', 'sha256']) || path.dirname(absolute(m.canary.path)) !== reviewBase) fail('canary')
  await assertHash(m.canary.path, m.canary.sha256)
  for (const item of m.hostReadFiles) {
    if (!exact(item, ['path', 'sha256']) || !hostPath(item.path)) fail('host_file_scope')
    await assertHash(item.path, item.sha256)
  }
  for (const item of [...m.hostMetadataPaths, ...m.hostDirectoryReadPaths]) if (!hostPath(item)) fail('host_directory_scope')
  for (const item of m.hostDirectoryReadPaths) if (!(await fs.stat(item)).isDirectory()) fail('host_directory')
  for (const item of m.hostAliasMetadata) {
    if (!exact(item, ['path', 'linkText', 'physicalTarget']) || !hostPath(item.path) ||
      !hostPath(item.physicalTarget) || !m.hostMetadataPaths.includes(item.path) ||
      !(await fs.lstat(item.path)).isSymbolicLink() || await fs.readlink(item.path) !== item.linkText ||
      await fs.realpath(item.path) !== item.physicalTarget) fail('host_alias')
  }
  for (const name of sourcePaths) await assertHash(path.join(sourceRoot, name), m.sourceFiles[name])
  for (const item of m.dependencyFiles) {
    if (!exact(item, ['path', 'sha256']) || !relative(item.path).startsWith('node_modules/') ||
      item.path.startsWith('node_modules/@prisma/') || item.path.startsWith('node_modules/prisma/') ||
      item.path.startsWith('node_modules/.prisma/')) fail('dependency_scope')
    await assertHash(path.join(dependencyRoot, item.path.slice(13)), item.sha256)
  }
  for (const item of m.generatedFiles) {
    if (!exact(item, ['path', 'sha256']) || !relative(item.path)) fail('generated_scope')
    await assertHash(path.join(generatedRoot, item.path), item.sha256)
  }
  if (!exact(m.evidence, ['fixtureSha256', 'generatedSha256', 'generatedReviewSha256']) ||
    m.evidence.fixtureSha256 !== 'd83ddb951e0f0341a743c745fb3b1e310c128118b59e7524346f6e6a16d3bb28' ||
    m.evidence.generatedSha256 !== '66a543e5c71b41c2c77ab249431e8f2574d2299c32661e0470e2aa1531c49aa6' ||
    m.evidence.generatedReviewSha256 !== 'b0386be92bbfbaa70f9b826c1f1419f5c427aad1881523161faef665c30c01d8') fail('evidence_scope')
  const fixtureEvidencePath = path.join(base, 'operations/e2-prisma/fresh-migrated-fixture-06430240-1.json')
  const generatedEvidencePath = path.join(base, 'operations/e2-prisma/generated-client-static-inspection-20b046fc-1.json')
  const generatedReviewPath = path.join(base, 'operations/e2-prisma/review-generated-static-inspection-20b046fc-1.json')
  await assertHash(fixtureEvidencePath, m.evidence.fixtureSha256)
  await assertHash(generatedEvidencePath, m.evidence.generatedSha256)
  await assertHash(generatedReviewPath, m.evidence.generatedReviewSha256)
  const fixtureEvidence = await readJson(fixtureEvidencePath)
  const generatedEvidence = await readJson(generatedEvidencePath)
  const staticReview = await readJson(generatedReviewPath)
  if (fixtureEvidence.status !== 'FRESH_MIGRATED_SYNTHETIC_SCHEMA_ONLY' ||
    !isDeepStrictEqual(m.fixture, fixtureEvidence.fixture) ||
    generatedEvidence.status !== 'STATIC_METADATA_INSPECTED_NOT_IMPORTED_NOT_ORIGINAL_STAGE_PASS' ||
    generatedEvidence.frozenOriginalReceipt?.status !== 'FAIL' ||
    !isDeepStrictEqual(m.generatedFiles, generatedEvidence.files.map(item =>
      ({ path: item.path, sha256: item.sha256 }))) ||
    staticReview.decision !== 'ACCEPT' ||
    staticReview.scope !== 'STATIC_OVERLAY_METADATA_ELIGIBILITY_ONLY' ||
    staticReview.inspectionSha256 !== m.evidence.generatedSha256) fail('evidence_drift')
  for (const item of m.dependencyAliases) {
    if (!exact(item, ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256']) ||
      item.physicalPackagePath !== path.join(dependencyRoot, item.virtualPackage.slice(13))) fail('alias_scope')
    const logical = path.join(sourceRoot, item.virtualPackage)
    if (!(await fs.lstat(logical)).isSymbolicLink() || await fs.readlink(logical) !== item.linkText ||
      await fs.realpath(logical) !== item.physicalPackagePath) fail('alias_drift')
    await assertHash(path.join(item.physicalPackagePath, 'package.json'), item.packageJsonSha256)
  }
  await assertMirror(root, m)
  await assertHash(m.fixture.path, m.fixture.sha256)
  const db = path.join(root, 'fixture.sqlite')
  const dbStat = await regular(db)
  if (!exact(m.fixture, ['path', 'sha256', 'byteLength']) ||
    dbStat.size !== m.fixture.byteLength || (dbStat.mode & 0o777) !== 0o600) fail('fixture_scope')
  const dbHashBefore = await fileHash(db)
  if (dbHashBefore !== m.fixture.sha256) fail('fixture_drift')
  for (const suffix of ['-wal', '-shm', '-journal'])
    if (await fs.access(`${db}${suffix}`).then(() => true, () => false)) fail('unexpected_db_sidecar')
  const mirror = path.join(root, 'mirror')
  const esbuild = m.dependencyFiles.filter(item => /^node_modules\/(?:@esbuild\/[^/]+\/bin\/esbuild|esbuild\/bin\/esbuild)$/.test(item.path))
  if (esbuild.length < 1 || esbuild.length > 2 || new Set(esbuild.map(item => item.sha256)).size !== 1 ||
    m.generatedFiles.find(item => item.path === 'libquery_engine-darwin-arm64.dylib.node')?.sha256 !==
      'afb9cb5a12ea42caa6f6498e40e9cb75059cae17098aadcc1001c99bb262e1ee') fail('binary_closure')
  const env = { PATH: [path.dirname(m.tools.node.path), path.dirname(path.join(mirror, esbuild[0].path))].join(':'),
    HOME: path.join(root, 'home'), TMPDIR: path.join(root, 'tmp'), CI: '1', OPENSSL_CONF: '',
    DATABASE_URL: `file:${db}`,
    PRISMA_QUERY_ENGINE_LIBRARY: path.join(mirror, 'node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node'),
    M06_E2_C1_CASE_ROOT: root, M06_E2_C1_MANIFEST_SHA256: 'LATE_MANIFEST_HASH_REQUIRED' }
  if (!isDeepStrictEqual(m.env, env)) fail('environment')
  const config = { root: mirror, cacheDir: path.join(root, 'tmp/vite-cache'),
    resolve: { alias: { '@': path.join(mirror, 'src') } },
    test: { environment: 'node', setupFiles: [], include: [selector], fileParallelism: false,
      maxWorkers: 1, isolate: true, passWithNoTests: false } }
  if (await fs.readFile(path.join(mirror, 'vitest.e2-c1-sqlite.config.mjs'), 'utf8') !==
      `export default ${JSON.stringify(config)}\n` ||
    await fs.readFile(path.join(mirror, 'package.json'), 'utf8') !==
      '{"name":"m06-e2-c1-sqlite-offline","private":true,"type":"module"}\n') fail('config_scope')
  await review(op.sourceReview, 'SOURCE_CLOSURE', m, manifestHash, profileHash)
  await review(op.operationalReview, 'OPERATIONAL_PROFILE', m, manifestHash, profileHash)
  const receipts = path.join(root, 'receipts')
  let lateHash = null
  if (stage === 'test') {
    const priorPath = path.join(receipts, 'self-check.result.json')
    await assertHash(priorPath, op.selfCheckResultSha256)
    const prior = await readJson(priorPath, true)
    if (prior.version !== 'M06_E2_C1_SQLITE_RESULT_V1' || prior.stage !== 'self-check' ||
      prior.caseId !== m.caseId || prior.status !== 'PASS' || prior.manifestSha256 !== manifestHash ||
      prior.profileSha256 !== profileHash ||
      prior.denialOracleCount !== 3 || prior.ownedExitOracleCount !== 2 ||
      !isDeepStrictEqual(prior.selfCheckObservation,
        inspectSelfCheck(Buffer.from(JSON.stringify(prior.selfCheckObservation))))) fail('self_check_prerequisite')
    await review(op.hostProof, 'HOST_EFFECTIVE_CONFINEMENT', m, manifestHash,
      profileHash, op.selfCheckResultSha256)
    const late = { version: 'M06_E2_C1_SQLITE_TEST_CASE_V1', caseId: m.caseId, caseRoot: root,
      stage: 'C1_SQLITE_TEST', databasePath: db, databaseSha256: dbHashBefore,
      generatedClientEntry: path.join(mirror, 'node_modules/.prisma/client/index.js'),
      generatedClientSha256: m.generatedFiles.find(item => item.path === 'index.js').sha256,
      generatedRuntimeSha256: m.generatedFiles.find(item => item.path === 'runtime/library.js').sha256,
      testSourceSha256: m.sourceFiles[selector], migrationIds,
      sourceReviewSha256: op.sourceReview.sha256, operationalReviewSha256: op.operationalReview.sha256,
      hostProofSha256: op.hostProof.sha256 }
    const lateBytes = `${JSON.stringify(late)}\n`
    lateHash = hash(lateBytes)
    if (op.lateManifestSha256 !== lateHash) fail('late_manifest_hash')
    const testReview = await review(op.testReview, 'TEST_ENTRY', m, manifestHash, profileHash, null, lateHash)
    if (testReview.sourceReviewSha256 !== op.sourceReview.sha256 ||
      testReview.operationalReviewSha256 !== op.operationalReview.sha256 ||
      testReview.hostProofSha256 !== op.hostProof.sha256) fail('test_review_bindings')
    await writeNew(path.join(root, 'c1-sqlite-test-manifest.json'), lateBytes)
    await assertHash(path.join(root, 'c1-sqlite-test-manifest.json'), lateHash)
    env.M06_E2_C1_MANIFEST_SHA256 = lateHash
  } else if (await fs.access(path.join(root, 'c1-sqlite-test-manifest.json')).then(() => true, () => false))
    fail('premature_late_manifest')
  await writeNew(path.join(receipts, `${stage}.started.json`), `${JSON.stringify({
    version: 'M06_E2_C1_SQLITE_STARTED_V1', caseId: m.caseId, stage,
    manifestSha256: manifestHash, operationSha256: operationHash, profileSha256: profileHash,
    lateManifestSha256: lateHash, time: new Date().toISOString(),
  })}\n`)
  const target = stage === 'self-check' ? path.join(root, 'self-check.mjs') :
    path.join(mirror, 'node_modules/vitest/vitest.mjs')
  const result = await launch(m.tools.sandboxExec.path,
    ['-f', path.join(root, 'sandbox.sb'), m.tools.node.path, target, ...(stage === 'test' ? m.args : [])],
    { cwd: mirror, env, timeoutMs: stage === 'self-check' ? 8_000 : 120_000 })
  let status = result.code === 0 && !result.signal && !result.spawnError && !result.overLimit &&
    !result.timedOut && !result.interruption && !result.killError ? 'PASS' : 'FAIL'
  let observed = null, denialOracleCount = 0, ownedExitOracleCount = 0
  if (stage === 'self-check') {
    try { observed = inspectSelfCheck(result.stdout); denialOracleCount = 3; ownedExitOracleCount = 2 }
    catch { status = 'FAIL' }
  }
  const combined = `${result.stdout.toString('utf8')}\n${result.stderr.toString('utf8')}`
  const teardownWarning = stage === 'test' &&
    /(?:failed|unable|could not|timed out|timeout|force(?:d)?)\s+(?:to\s+)?(?:terminate|stop|close|kill|tear\s*down)|(?:pool|worker|child process|engine).{0,80}(?:failed|timeout|timed out|unhandled|unexpectedly|still running)/i.test(combined)
  if (teardownWarning) status = 'FAIL'
  let postcheckFailureCategory = null
  let dbHashAfter = null
  let sidecars = null
  try {
    await assertMirror(root, m)
    for (const name of sourcePaths) await assertHash(path.join(sourceRoot, name), m.sourceFiles[name])
    await assertHash(m.fixture.path, m.fixture.sha256)
    await assertHash(path.join(root, 'sandbox.sb'), profileHash)
    if (stage === 'self-check') {
      await assertHash(db, dbHashBefore)
      for (const suffix of ['-wal', '-shm', '-journal'])
        if (await fs.access(`${db}${suffix}`).then(() => true, () => false)) fail('self_check_db_sidecar')
    } else {
      await regular(db)
      dbHashAfter = await fileHash(db)
      sidecars = []
      for (const suffix of ['-wal', '-shm', '-journal']) {
        const name = `${db}${suffix}`
        if (await fs.access(name).then(() => true, () => false)) {
          await regular(name)
          sidecars.push({ suffix, sha256: await fileHash(name), byteLength: (await fs.stat(name)).size })
        }
      }
      await assertHash(path.join(root, 'c1-sqlite-test-manifest.json'), lateHash)
    }
  } catch (error) {
    status = 'FAIL'
    postcheckFailureCategory = /^E2 C1 SQLite run refused: ([a-z_]+)$/.exec(error?.message)?.[1] ?? 'postcheck_unknown'
  }
  const receipt = { version: 'M06_E2_C1_SQLITE_RESULT_V1', caseId: m.caseId, stage,
    status, manifestSha256: manifestHash, operationSha256: operationHash, profileSha256: profileHash,
    lateManifestSha256: lateHash, pid: result.pid, exitCode: result.code, signal: result.signal,
    spawnError: result.spawnError, interruption: result.interruption, killError: result.killError,
    timedOut: result.timedOut, overLimit: result.overLimit, teardownWarning,
    processDrainProof: 'UNPROVEN_FROM_TEST_EXIT',
    stdoutSha256: hash(result.stdout), stderrSha256: hash(result.stderr),
    boundedStdout: result.stdout.subarray(0, 16_384).toString('utf8'),
    boundedStderr: result.stderr.subarray(0, 16_384).toString('utf8'),
    selfCheckObservation: observed, denialOracleCount, ownedExitOracleCount,
    dbHashBefore, dbHashAfter, sidecars, postcheckFailureCategory, completedAt: new Date().toISOString() }
  await writeNew(path.join(receipts, `${stage}.result.json`), `${JSON.stringify(receipt)}\n`)
  process.stdout.write(`${JSON.stringify({ caseId: m.caseId, stage, status,
    receipt: path.join(receipts, `${stage}.result.json`) })}\n`)
  if (status !== 'PASS') process.exitCode = 1
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
