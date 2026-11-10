#!/usr/bin/env node
/**
 * Executes only the selected pure TypeScript self-check or Vitest stage in a fresh E2 case.
 * Required invocation: node run-e2-offline-case.mjs --case /absolute/new-case
 *   --operation /absolute/new-case/<stage>-operation.json --operation-sha256 <64 hex>
 *   --stage self-check|test
 * Caller must use a reviewed env -i launch with exactly PATH, fresh HOME/TMPDIR and CI=1.
 * Self-check requires reviewed source closure and operational profile. Test entry additionally
 * requires a host-effective attestation bound to the inert self-check result. These are external
 * authorities; this launcher checks exact bytes and declared scope but cannot itself prove them.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const scriptPath = fileURLToPath(import.meta.url)
const sourceRoot = path.resolve(path.dirname(scriptPath), '../../..')
const physicalDependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const caseBase = path.resolve(sourceRoot, '../..', 'e2-offline')
const reviewBase = path.resolve(sourceRoot, '../..', 'operations', 'e2-pure-ts')
const launcherEnvKeys = ['PATH', 'HOME', 'TMPDIR', 'CI', 'OPENSSL_CONF']
// CoreFoundation may add this locale value after env -i, before Node enters this script.
const cfLocaleKey = '__CF_USER_TEXT_ENCODING'
const shaPattern = /^[a-f0-9]{64}$/
const selectedSource = [
  'src/lib/quality-journey/provider-grant-contract.ts',
  'src/lib/quality-journey/provider-grant-contract.test.ts',
  'src/lib/quality-journey/codex-app-server/native-e2-private-protocol.ts',
  'src/lib/quality-journey/codex-app-server/native-e2-private-protocol.test.ts',
]
const selectedTests = selectedSource.filter(item => item.endsWith('.test.ts'))
const hostFileRoots = ['/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld', '/System/Library', '/usr/lib', '/usr/share', '/private/var/db/dyld',
  '/opt/homebrew', '/usr/local/lib']
const fail = reason => { throw new Error(`E2 pure offline run refused: ${reason}`) }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
const same = (a, b) => isDeepStrictEqual(a, b)
const digestFile = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256')
  const stream = createReadStream(file)
  stream.on('data', chunk => hash.update(chunk))
  stream.on('error', reject)
  stream.on('end', () => resolve(hash.digest('hex')))
})
const safePath = value => {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value ||
    value.includes('\0') || /[\r\n]/.test(value)) fail('unsafe_path')
  return value
}
const assertLauncherEnvironment = () => {
  const keys = Object.keys(process.env).filter(key => key !== cfLocaleKey)
  if ((process.env[cfLocaleKey] !== undefined &&
      !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[cfLocaleKey])) ||
    keys.sort().join(',') !== [...launcherEnvKeys].sort().join(',') ||
    process.env.OPENSSL_CONF !== '' || process.env.CI !== '1' || process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${reviewBase}${path.sep}`) ||
    !process.env.TMPDIR?.startsWith(`${reviewBase}${path.sep}`) ||
    !path.isAbsolute(process.env.HOME) || !path.isAbsolute(process.env.TMPDIR))
    fail('launcher_environment')
}
const readJson = async file => {
  let value
  try { value = JSON.parse(await fs.readFile(file, 'utf8')) } catch { fail('json_read') }
  return value
}
const isRegular = async file => {
  const stat = await fs.lstat(file)
  return stat.isFile() && !stat.isSymbolicLink()
}
const assertCaseDirectories = async caseRoot => {
  for (const item of ['mirror', 'home', 'tmp', 'receipts']) {
    const directory = path.join(caseRoot, item)
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory)
      fail('case_directory_link')
  }
}
const assertHash = async (file, expected) => {
  if (!shaPattern.test(expected) || !await isRegular(file) || await digestFile(file) !== expected) fail('hash_mismatch')
}
const writeNew = async (file, value) => fs.writeFile(file, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 })

async function inspectMirror(caseRoot, manifest) {
  const mirror = path.join(caseRoot, 'mirror')
  const expected = new Map([
    ...Object.entries(manifest.sourceFiles),
    ...manifest.dependencyFiles.map(item => [item.path, item.sha256]),
    ...Object.entries(manifest.generatedHashes).filter(([item]) => item.startsWith('mirror/'))
      .map(([item, hash]) => [item.slice('mirror/'.length), hash]),
  ])
  const seen = new Set()
  const walk = async (directory, relative = '') => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const next = relative ? `${relative}/${entry.name}` : entry.name
      const absolute = path.join(directory, entry.name)
      const stat = await fs.lstat(absolute)
      if (stat.isSymbolicLink()) fail('mirror_link')
      if (stat.isDirectory()) await walk(absolute, next)
      else {
        if (!stat.isFile() || !expected.has(next)) fail('mirror_extra_or_nonregular')
        await assertHash(absolute, expected.get(next))
        seen.add(next)
      }
    }
  }
  await walk(mirror)
  if (seen.size !== expected.size || [...expected.keys()].some(item => !seen.has(item))) fail('mirror_missing')
}

async function inspectSelectedSource(manifest) {
  const digests = {}
  for (const relative of selectedSource) {
    const file = path.join(sourceRoot, relative)
    await assertHash(file, manifest.sourceFiles[relative])
    digests[relative] = manifest.sourceFiles[relative]
  }
  return createHash('sha256').update(JSON.stringify(digests)).digest('hex')
}

async function inspectDependencyAliases(manifest) {
  if (manifest.dependencyRoot !== physicalDependencyRoot || !Array.isArray(manifest.dependencyAliases))
    fail('dependency_alias_scope')
  for (const alias of manifest.dependencyAliases) {
    if (!exactKeys(alias, ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256']) ||
      typeof alias.virtualPackage !== 'string' || !/^node_modules\/(?:@[^/]+\/)?[^/]+$/.test(alias.virtualPackage) ||
      alias.physicalPackagePath !== path.join(physicalDependencyRoot,
        alias.virtualPackage.slice('node_modules/'.length))) fail('dependency_alias_scope')
    const link = path.join(sourceRoot, alias.virtualPackage)
    if (!(await fs.lstat(link)).isSymbolicLink() || await fs.readlink(link) !== alias.linkText ||
      await fs.realpath(link) !== alias.physicalPackagePath ||
      await fs.realpath(alias.physicalPackagePath) !== alias.physicalPackagePath)
      fail('dependency_alias_drift')
    await assertHash(path.join(alias.physicalPackagePath, 'package.json'), alias.packageJsonSha256)
  }
}

async function reviewedReceipt(reference, kind, caseId, manifestSha, profileSha, selfCheckSha = null) {
  if (!exactKeys(reference, ['path', 'sha256'])) fail('review_reference')
  const file = safePath(reference.path)
  if (!file.startsWith(`${reviewBase}${path.sep}`) || !/^review-[A-Za-z0-9_-]+\.json$/.test(path.basename(file)))
    fail('review_location')
  if (await fs.realpath(file) !== file) fail('review_link')
  await assertHash(file, reference.sha256)
  const body = await readJson(file)
  const common = ['version', 'kind', 'caseId', 'manifestSha256', 'profileSha256', 'decision', 'reviewId']
  const additions = kind === 'HOST_EFFECTIVE_CONFINEMENT' ?
    ['selfCheckResultSha256', 'osEnforcedProfile', 'negativeControlsObserved',
      'networkDeny', 'processClosure', 'fileBoundary', 'subprocessClosure'] :
    kind === 'OPERATIONAL_PROFILE' ?
      ['profileAndArgsReviewed', 'negativeControlsReviewed', 'codeAndArgsAllowlistReviewed',
        'productEntryExcluded'] :
      ['sourceClosureComplete', 'selectorsAndConfigReviewed', 'toolHashesReviewed']
  const fields = [...common, ...additions]
  if (!exactKeys(body, fields) || body.version !== 'M06_E2_PURE_TS_REVIEW_V1' || body.kind !== kind ||
    body.caseId !== caseId || body.manifestSha256 !== manifestSha || body.profileSha256 !== profileSha ||
    body.decision !== 'ACCEPT' || typeof body.reviewId !== 'string' || !body.reviewId ||
    (kind === 'HOST_EFFECTIVE_CONFINEMENT' && body.selfCheckResultSha256 !== selfCheckSha) ||
    additions.filter(field => field !== 'selfCheckResultSha256').some(field => body[field] !== true))
    fail('review_scope_or_decision')
}

function launch(binary, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: options.cwd, env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const stdout = []
    const stderr = []
    let outBytes = 0
    let errBytes = 0
    let overLimit = false
    let timedOut = false
    let killError = null
    const killGroup = () => {
      try { if (child.pid) process.kill(-child.pid, 'SIGKILL') }
      catch (error) { if (error.code !== 'ESRCH') killError = error.code || 'KILL_FAILED' }
    }
    const timer = setTimeout(() => { timedOut = true; killGroup() }, options.timeoutMs)
    child.stdout.on('data', chunk => {
      outBytes += chunk.length
      if (outBytes > 1_048_576) { overLimit = true; killGroup() }
      else stdout.push(chunk)
    })
    child.stderr.on('data', chunk => {
      errBytes += chunk.length
      if (errBytes > 1_048_576) { overLimit = true; killGroup() }
      else stderr.push(chunk)
    })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, overLimit, timedOut, killError,
      stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
    })
  })
}

async function main() {
  if (process.platform !== 'darwin') fail('macos_only_profile')
  assertLauncherEnvironment()
  if (process.argv.length !== 10 || process.argv[2] !== '--case' || process.argv[4] !== '--operation' ||
    process.argv[6] !== '--operation-sha256' || process.argv[8] !== '--stage') fail('args')
  const caseRoot = safePath(process.argv[3])
  const operationPath = safePath(process.argv[5])
  const operationHash = process.argv[7]
  const stage = process.argv[9]
  if (!['self-check', 'test'].includes(stage) || !shaPattern.test(operationHash) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path.basename(caseRoot)) ||
    path.dirname(caseRoot) !== caseBase || operationPath !== path.join(caseRoot, `${stage}-operation.json`) ||
    await fs.realpath(caseRoot) !== caseRoot) fail('case_scope')
  await assertCaseDirectories(caseRoot)
  const manifestPath = path.join(caseRoot, 'case-manifest.json')
  if (!await isRegular(manifestPath)) fail('manifest_file')
  const manifestSha = await digestFile(manifestPath)
  await assertHash(operationPath, operationHash)
  const operation = await readJson(operationPath)
  const operationKeys = ['version', 'stage', 'caseId', 'manifestSha256', 'profileSha256',
    'runnerSha256', 'sourceReview', 'operationalReview',
    ...(stage === 'test' ? ['hostProof', 'selfCheckResultSha256'] : [])]
  if (!exactKeys(operation, operationKeys) || operation.version !== 'M06_E2_PURE_TS_OPERATION_V1' ||
    operation.stage !== stage || operation.manifestSha256 !== manifestSha)
    fail('operation_scope')
  const manifest = await readJson(manifestPath)
  if (manifest.version !== 'M06_E2_PURE_TS_CASE_V1' || manifest.caseRoot !== caseRoot ||
    manifest.caseId !== path.basename(caseRoot) || manifest.sourceRoot !== sourceRoot ||
    manifest.status !== 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY' ||
    !same(Object.keys(manifest.sourceFiles).sort(), [...selectedSource].sort()) ||
    !same(manifest.selectors, selectedTests) ||
    !same(manifest.args, ['run', '--config', 'vitest.e2.config.mjs', '--configLoader', 'native', ...selectedTests])) fail('manifest_scope')
  const profileSha = manifest.generatedHashes['sandbox.sb']
  await assertHash(path.join(caseRoot, 'sandbox.sb'), profileSha)
  await assertHash(path.join(caseRoot, 'self-check.mjs'), manifest.generatedHashes['self-check.mjs'])
  await assertHash(scriptPath, operation.runnerSha256)
  await assertHash(path.join(sourceRoot, 'scripts/test-harness/m06/prepare-e2-offline-case.mjs'), manifest.preparerSha256)
  for (const tool of Object.values(manifest.tools)) await assertHash(tool.path, tool.sha256)
  if (!Array.isArray(manifest.hostMetadataPaths) || !Array.isArray(manifest.hostDirectoryReadPaths) ||
    !Array.isArray(manifest.hostAliasMetadata)) fail('loader_manifest')
  for (const alias of manifest.hostAliasMetadata) {
    if (!exactKeys(alias, ['path', 'linkText', 'physicalTarget']) || !manifest.hostMetadataPaths.includes(alias.path) ||
      !(await fs.lstat(alias.path)).isSymbolicLink() || await fs.readlink(alias.path) !== alias.linkText ||
      await fs.realpath(alias.path) !== alias.physicalTarget) fail('loader_alias_drift')
  }
  for (const directory of manifest.hostDirectoryReadPaths)
    if (!(await fs.stat(directory)).isDirectory()) fail('loader_directory_drift')
  if (!same(manifest.hostFileRoots, hostFileRoots) || !Array.isArray(manifest.hostReadFiles) ||
    manifest.hostReadFiles.length > 2_000) fail('host_file_scope')
  for (const item of manifest.hostReadFiles) {
    if (!exactKeys(item, ['path', 'sha256']) || !hostFileRoots.some(root => item.path.startsWith(`${root}/`)) ||
      await fs.realpath(item.path) !== item.path) fail('host_file_scope')
    await assertHash(item.path, item.sha256)
  }
  if (manifest.tools.node.path !== process.execPath || manifest.tools.node.version !== process.version ||
    manifest.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_identity')
  if (!same(manifest.env, {
    PATH: [path.dirname(manifest.tools.node.path), path.dirname(path.join(caseRoot, 'mirror',
      manifest.dependencyFiles.find(item => /^node_modules\/(?:@esbuild\/[^/]+\/bin\/esbuild|esbuild\/bin\/esbuild)$/.test(item.path))?.path ?? ''))].join(':'),
    HOME: path.join(caseRoot, 'home'), TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '',
  })) fail('environment_scope')
  const sourceBeforeSha256 = await inspectSelectedSource(manifest)
  await inspectDependencyAliases(manifest)
  await inspectMirror(caseRoot, manifest)
  if (operation.caseId !== manifest.caseId || operation.profileSha256 !== profileSha) fail('operation_scope')
  await reviewedReceipt(operation.sourceReview, 'SOURCE_CLOSURE', manifest.caseId, manifestSha, profileSha)
  await reviewedReceipt(operation.operationalReview, 'OPERATIONAL_PROFILE', manifest.caseId, manifestSha, profileSha)
  const receipts = path.join(caseRoot, 'receipts')
  if (stage === 'test') {
    const priorPath = path.join(receipts, 'self-check.result.json')
    await assertHash(priorPath, operation.selfCheckResultSha256)
    const prior = await readJson(priorPath)
    if (prior.version !== 'M06_E2_PURE_TS_RESULT_V1' || prior.stage !== 'self-check' ||
      prior.caseId !== manifest.caseId || prior.manifestSha256 !== manifestSha || prior.status !== 'PASS')
      fail('self_check_prerequisite')
    await reviewedReceipt(operation.hostProof, 'HOST_EFFECTIVE_CONFINEMENT', manifest.caseId,
      manifestSha, profileSha, operation.selfCheckResultSha256)
  }
  const started = { version: 'M06_E2_PURE_TS_STARTED_V1', caseId: manifest.caseId,
    stage, operationSha256: operationHash, manifestSha256: manifestSha, profileSha256: profileSha,
    time: new Date().toISOString() }
  await writeNew(path.join(receipts, `${stage}.started.json`), started)
  const targetArgs = stage === 'self-check' ? [path.join(caseRoot, 'self-check.mjs')] :
    [path.join(caseRoot, 'mirror', 'node_modules/vitest/vitest.mjs'), ...manifest.args]
  const result = await launch(manifest.tools.sandboxExec.path,
    ['-f', path.join(caseRoot, 'sandbox.sb'), manifest.tools.node.path, ...targetArgs],
    { cwd: path.join(caseRoot, 'mirror'), env: manifest.env,
      timeoutMs: stage === 'self-check' ? 10_000 : 120_000 })
  let status = result.code === 0 && !result.signal && !result.overLimit && !result.timedOut &&
    !result.killError ? 'PASS' : 'FAIL'
  let selfCheckObservation = null
  if (stage === 'self-check') {
    try { selfCheckObservation = JSON.parse(result.stdout.toString('utf8')) } catch { status = 'FAIL' }
    if (!exactKeys(selfCheckObservation, ['version', 'readErrorCode', 'execErrorCode', 'bindErrorCode']) ||
      selfCheckObservation.version !== 'M06_E2_SANDBOX_SELF_CHECK_V1' ||
      !['EPERM', 'EACCES'].includes(selfCheckObservation.readErrorCode) ||
      !['EPERM', 'EACCES'].includes(selfCheckObservation.execErrorCode) ||
      !['EPERM', 'EACCES'].includes(selfCheckObservation.bindErrorCode)) status = 'FAIL'
  }
  let sourceAfterSha256 = null
  try {
    await assertCaseDirectories(caseRoot)
    await inspectMirror(caseRoot, manifest)
    await inspectDependencyAliases(manifest)
    sourceAfterSha256 = await inspectSelectedSource(manifest)
  } catch { status = 'FAIL' }
  const resultReceipt = { version: 'M06_E2_PURE_TS_RESULT_V1', caseId: manifest.caseId,
    stage, operationSha256: operationHash, manifestSha256: manifestSha, status,
    exitCode: result.code, signal: result.signal, overLimit: result.overLimit,
    timedOut: result.timedOut, killError: result.killError,
    stdoutSha256: createHash('sha256').update(result.stdout).digest('hex'),
    stderrSha256: createHash('sha256').update(result.stderr).digest('hex'),
    // Bounded streams from only this source-closed toy case; no inherited env or external body access.
    sourceClosedStdoutText: result.stdout.subarray(0, 16_384).toString('utf8'),
    sourceClosedStderrText: result.stderr.subarray(0, 16_384).toString('utf8'),
    selfCheckObservation,
    sourceBeforeSha256, sourceAfterSha256,
    completedAt: new Date().toISOString() }
  await writeNew(path.join(receipts, `${stage}.result.json`), resultReceipt)
  process.stdout.write(`${JSON.stringify({ caseId: manifest.caseId, stage, status,
    receipt: path.join(receipts, `${stage}.result.json`) })}\n`)
  if (status !== 'PASS') process.exitCode = 1
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
