#!/usr/bin/env node
/** Exact E2 contract-case runner. Inert self-check first, then one pure bootstrap contract testfile.
 * Invocation: --case ABS --operation ABS --operation-sha256 HEX --stage self-check|test.
 * The runner verifies external reviews but never self-certifies host-effective confinement. */
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
const caseBase = path.join(base, 'e2-bootstrap-contract-offline')
const reviewBase = path.join(base, 'operations/e2-bootstrap-contract-ts')
const dependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const sourcePaths = [
  "src/lib/quality-journey/shared-resource-bootstrap-contract.ts",
  "src/lib/quality-journey/shared-resource-bootstrap-contract.test.ts",
  "src/lib/quality-journey/shared-resource-contract.ts"
]
const selectors = sourcePaths.filter(v => v.endsWith('.test.ts'))
const addons = Object.freeze({
  'node_modules/@rolldown/binding-darwin-arm64/rolldown-binding.darwin-arm64.node': '22ae594023af37462b204250819e86f0343a1c7b86ccc36d55eaee60062e9d3d',
  'node_modules/fsevents/fsevents.node': '40f2f51199e4f5fc46fa6b985fb3461bb63e6cd86c62bfa9bcee45ed4438d5fb',
  'node_modules/lightningcss-darwin-arm64/lightningcss.darwin-arm64.node': 'aee1601d7145d89f262d4c777f308ef06ed53046ee49b780d31a98f02db2e253',
})
const hostRoots = ['/System/Volumes/Preboot/Cryptexes', '/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld', '/System/Cryptexes', '/System/Library', '/usr/lib',
  '/usr/share', '/private/var/db/dyld', '/opt/homebrew', '/usr/local/lib']
const forbidden = /^(?:\.env(?:\..*)?|\.npmrc|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.vite|\.next)$/i
const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const fail = s => { throw new Error(`E2 contract run refused: ${s}`) }
const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === expected.length && Object.keys(v).every(k => expected.includes(k))
const absolute = v => {
  if (typeof v !== 'string' || !path.isAbsolute(v) || path.normalize(v) !== v ||
    v.includes('\0') || /[\r\n]/.test(v)) fail('absolute_path')
  return v
}
const relative = v => {
  if (typeof v !== 'string' || !v || v.includes('\\') || v.includes('\0') ||
    path.posix.normalize(v) !== v || v.split('/').some(p => !p || p === '.' || p === '..' || forbidden.test(p))) fail('relative_path')
  return v
}
const hostPath = v => hostRoots.some(root => absolute(v).startsWith(`${root}/`)) &&
  !v.split('/').some(part => forbidden.test(part))
const fileHash = file => new Promise((resolve, reject) => {
  const h = createHash('sha256'), stream = createReadStream(file)
  stream.on('data', b => h.update(b)); stream.on('error', reject)
  stream.on('end', () => resolve(h.digest('hex')))
})
const regular = async file => {
  const s = await fs.lstat(file)
  if (!s.isFile() || s.isSymbolicLink() || await fs.realpath(file) !== file) fail('nonregular_file')
}
const assertHash = async (file, expected) => {
  if (!sha.test(expected)) fail('hash_format')
  await regular(file)
  if (await fileHash(file) !== expected) fail('hash_mismatch')
}
const readJson = async file => {
  await regular(file)
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { fail('json') }
}
const writeNew = async (file, value) => fs.writeFile(file, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 })
function assertLauncher() {
  const locale = '__CF_USER_TEXT_ENCODING'
  const names = Object.keys(process.env).filter(k => k !== locale).sort()
  if (names.join(',') !== 'CI,HOME,OPENSSL_CONF,PATH,TMPDIR' || process.env.CI !== '1' ||
    process.env.OPENSSL_CONF !== '' || process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${reviewBase}/`) || !process.env.TMPDIR?.startsWith(`${reviewBase}/`) ||
    (process.env[locale] !== undefined && !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[locale]))) fail('launcher_environment')
}
async function assertMirror(caseRoot, m) {
  const expected = new Map([...Object.entries(m.sourceFiles),
    ...m.dependencyFiles.map(v => [v.path, v.sha256]),
    ...Object.entries(m.generatedHashes).filter(([name]) => name.startsWith('mirror/'))
      .map(([name, value]) => [name.slice(7), value])])
  const seen = new Set(); let visited = 0
  const walk = async (dir, rel = '') => {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      if (++visited > expected.size * 8 + 100) fail('mirror_bound')
      const name = rel ? `${rel}/${ent.name}` : ent.name
      const file = path.join(dir, ent.name), s = await fs.lstat(file)
      if (s.isSymbolicLink()) fail('mirror_link')
      if (s.isDirectory()) await walk(file, name)
      else if (s.isFile() && expected.has(name)) { await assertHash(file, expected.get(name)); seen.add(name) }
      else fail('mirror_extra')
    }
  }
  await walk(path.join(caseRoot, 'mirror'))
  if (seen.size !== expected.size || [...expected.keys()].some(v => !seen.has(v))) fail('mirror_missing')
}
async function reviewed(ref, kind, m, manifestHash, profileHash, selfCheckHash = null) {
  if (!keys(ref, ['path', 'sha256'])) fail('review_reference')
  const file = absolute(ref.path)
  if (path.dirname(file) !== reviewBase || !/^review-[A-Za-z0-9_-]+\.json$/.test(path.basename(file))) fail('review_path')
  await assertHash(file, ref.sha256)
  const r = await readJson(file)
  const common = ['version', 'kind', 'caseId', 'manifestSha256', 'profileSha256', 'decision', 'reviewId']
  const extra = kind === 'SOURCE_CLOSURE' ?
    ['sourceClosureComplete', 'selectorsAndConfigReviewed', 'toolAndAddonHashesReviewed'] :
    kind === 'OPERATIONAL_PROFILE' ?
      ['profileAndArgsReviewed', 'negativeControlsReviewed', 'signalOraclesReviewed',
        'codeAndArgsAllowlistReviewed', 'productEntryExcluded'] :
      ['selfCheckResultSha256', 'osEnforcedProfile', 'negativeControlsObserved',
        'ownedTermAndKillObserved', 'networkDeny', 'processClosure', 'fileBoundary', 'subprocessClosure']
  if (!keys(r, [...common, ...extra]) || r.version !== 'M06_E2_BOOTSTRAP_CONTRACT_REVIEW_V1' ||
    r.kind !== kind || r.caseId !== m.caseId || r.manifestSha256 !== manifestHash ||
    r.profileSha256 !== profileHash || r.decision !== 'ACCEPT' || !r.reviewId ||
    typeof r.reviewId !== 'string' ||
    (kind === 'HOST_EFFECTIVE_CONFINEMENT' && r.selfCheckResultSha256 !== selfCheckHash) ||
    extra.filter(k => k !== 'selfCheckResultSha256').some(k => r[k] !== true)) fail('review_scope')
}
function launch(binary, args, options) {
  return new Promise(resolve => {
    const c = spawn(binary, args, { cwd: options.cwd, env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'], detached: true })
    c.stdin?.end()
    const out = [], err = []
    let outBytes = 0, errBytes = 0, overLimit = false, timedOut = false
    let interruption = null, killError = null, spawnError = null
    const kill = () => {
      try { if (c.pid) process.kill(-c.pid, 'SIGKILL') }
      catch (e) { if (e.code !== 'ESRCH') killError = e.code || 'KILL_FAILED' }
    }
    const onTerm = () => { interruption = 'SIGTERM'; kill() }
    const onInt = () => { interruption = 'SIGINT'; kill() }
    process.on('SIGTERM', onTerm); process.on('SIGINT', onInt)
    const timer = setTimeout(() => { timedOut = true; kill() }, options.timeoutMs)
    c.stdout?.on('data', b => { outBytes += b.length; if (outBytes > 1_048_576) { overLimit = true; kill() } else out.push(b) })
    c.stderr?.on('data', b => { errBytes += b.length; if (errBytes > 1_048_576) { overLimit = true; kill() } else err.push(b) })
    c.on('error', e => { spawnError = e.code || 'SPAWN_FAILED' })
    c.on('close', (code, signal) => {
      clearTimeout(timer); process.off('SIGTERM', onTerm); process.off('SIGINT', onInt)
      resolve({ pid: c.pid ?? null, code, signal, spawnError, overLimit, timedOut,
        interruption, killError, stdout: Buffer.concat(out), stderr: Buffer.concat(err) })
    })
  })
}
function inspectSelfCheck(b) {
  let r; try { r = JSON.parse(b.toString('utf8')) } catch { fail('self_check_json') }
  if (!keys(r, ['version', 'read', 'exec', 'bind', 'term', 'forced']) ||
    r.version !== 'M06_E2_BOOTSTRAP_CONTRACT_SELF_CHECK_V1' ||
    [r.read, r.exec, r.bind].filter(v => v === 'EPERM' || v === 'EACCES').length !== 3 ||
    !keys(r.term, ['code', 'signal', 'termSent', 'forced']) ||
    !keys(r.forced, ['code', 'signal', 'termSent', 'forced']) ||
    !isDeepStrictEqual(r.term, { code: 0, signal: null, termSent: true, forced: false }) ||
    !isDeepStrictEqual(r.forced, { code: null, signal: 'SIGKILL', termSent: true, forced: true }))
    fail('self_check_oracles')
  return r
}

async function main() {
  if (process.platform !== 'darwin') fail('macos_only')
  assertLauncher()
  if (process.argv.length !== 10 || process.argv[2] !== '--case' || process.argv[4] !== '--operation' ||
    process.argv[6] !== '--operation-sha256' || process.argv[8] !== '--stage') fail('args')
  const caseRoot = absolute(process.argv[3]), operationPath = absolute(process.argv[5])
  const operationHash = process.argv[7], stage = process.argv[9]
  if (!['self-check', 'test'].includes(stage) || !uuid.test(path.basename(caseRoot)) ||
    path.dirname(caseRoot) !== caseBase || await fs.realpath(caseRoot) !== caseRoot ||
    operationPath !== path.join(caseRoot, `${stage}-operation.json`) || !sha.test(operationHash)) fail('case_scope')
  for (const name of ['mirror', 'home', 'tmp', 'receipts']) {
    const dir = path.join(caseRoot, name), s = await fs.lstat(dir)
    if (!s.isDirectory() || s.isSymbolicLink() || await fs.realpath(dir) !== dir) fail('case_directory')
  }
  const manifestPath = path.join(caseRoot, 'case-manifest.json')
  await regular(manifestPath)
  const manifestHash = await fileHash(manifestPath), m = await readJson(manifestPath)
  if (m.version !== 'M06_E2_BOOTSTRAP_CONTRACT_CASE_V1' || m.caseId !== path.basename(caseRoot) ||
    m.caseRoot !== caseRoot || m.sourceRoot !== sourceRoot || m.dependencyRoot !== dependencyRoot ||
    m.status !== 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY' ||
    !keys(m.sourceFiles, sourcePaths) || sourcePaths.some(v => !sha.test(m.sourceFiles[v])) ||
    !isDeepStrictEqual(m.selectors, selectors) ||
    !isDeepStrictEqual(m.args, ['run', '--config', 'vitest.e2-bootstrap-contract.config.mjs', '--configLoader', 'native', ...selectors]))
    fail('manifest_scope')
  if (!Array.isArray(m.dependencyFiles) || m.dependencyFiles.length < 8 ||
    m.dependencyFiles.length > 50000 || !Array.isArray(m.dependencyAliases) ||
    !Array.isArray(m.hostReadFiles) || !Array.isArray(m.hostMetadataPaths) ||
    !Array.isArray(m.hostDirectoryReadPaths) || !Array.isArray(m.hostAliasMetadata) ||
    m.dependencyFiles.some(v => !keys(v, ['path', 'sha256']) ||
      !relative(v.path).startsWith('node_modules/') || !sha.test(v.sha256)) ||
    m.hostReadFiles.some(v => !keys(v, ['path', 'sha256']) || !hostPath(v.path) || !sha.test(v.sha256)))
    fail('manifest_closure')
  await assertHash(operationPath, operationHash)
  const op = await readJson(operationPath)
  const opKeys = ['version', 'stage', 'caseId', 'manifestSha256', 'profileSha256',
    'runnerSha256', 'sourceReview', 'operationalReview',
    ...(stage === 'test' ? ['hostProof', 'selfCheckResultSha256'] : [])]
  if (!keys(op, opKeys) || op.version !== 'M06_E2_BOOTSTRAP_CONTRACT_OPERATION_V1' ||
    op.stage !== stage || op.caseId !== m.caseId || op.manifestSha256 !== manifestHash) fail('operation_scope')
  const profileHash = m.generatedHashes?.['sandbox.sb']
  if (op.profileSha256 !== profileHash) fail('profile_scope')
  await assertHash(script, op.runnerSha256)
  await assertHash(path.join(sourceRoot, 'scripts/test-harness/m06/prepare-e2-offline-bootstrap-contract-case.mjs'), m.preparerSha256)
  await assertHash(path.join(caseRoot, 'sandbox.sb'), profileHash)
  await assertHash(path.join(caseRoot, 'self-check.mjs'), m.generatedHashes['self-check.mjs'])
  if (!keys(m.tools, ['node', 'sandboxExec']) || !keys(m.tools.node, ['path', 'sha256', 'version']) ||
    !keys(m.tools.sandboxExec, ['path', 'sha256']) || m.tools.node.path !== process.execPath ||
    m.tools.node.version !== process.version || m.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_scope')
  for (const t of Object.values(m.tools)) await assertHash(t.path, t.sha256)
  if (!keys(m.versions, ['vitest', 'vite', 'esbuild', 'zod'])) fail('version_scope')
  const mirror = path.join(caseRoot, 'mirror')
  const esbuild = m.dependencyFiles.filter(v => /^node_modules\/(?:@esbuild\/[^/]+\/bin\/esbuild|esbuild\/bin\/esbuild)$/.test(v.path))
  if (esbuild.length < 1 || esbuild.length > 2 || new Set(esbuild.map(v => v.sha256)).size !== 1 ||
    m.dependencyFiles.filter(v => v.path.endsWith('.node')).length !== 3 ||
    Object.entries(addons).some(([name, value]) => m.dependencyFiles.find(v => v.path === name)?.sha256 !== value)) fail('binary_closure')
  const env = { PATH: [path.dirname(m.tools.node.path), path.dirname(path.join(mirror, esbuild[0].path))].join(':'),
    HOME: path.join(caseRoot, 'home'), TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '' }
  if (!isDeepStrictEqual(m.env, env)) fail('environment')
  const config = { root: mirror, cacheDir: path.join(caseRoot, 'tmp/vite-cache'),
    resolve: { alias: { '@': path.join(mirror, 'src') } },
    test: { environment: 'node', setupFiles: [], include: selectors, fileParallelism: false,
      maxWorkers: 1, isolate: true, passWithNoTests: false } }
  if (await fs.readFile(path.join(mirror, 'vitest.e2-bootstrap-contract.config.mjs'), 'utf8') !== `export default ${JSON.stringify(config)}\n` ||
    await fs.readFile(path.join(mirror, 'package.json'), 'utf8') !==
      '{"name":"m06-e2-bootstrap-contract-offline","private":true,"type":"module"}\n') fail('config_scope')
  for (const v of sourcePaths) await assertHash(path.join(sourceRoot, v), m.sourceFiles[v])
  for (const v of m.dependencyFiles) await assertHash(path.join(dependencyRoot, v.path.slice(13)), v.sha256)
  for (const v of m.hostReadFiles) await assertHash(v.path, v.sha256)
  for (const v of [...m.hostMetadataPaths, ...m.hostDirectoryReadPaths]) if (!hostPath(v)) fail('host_directory_scope')
  for (const v of m.hostDirectoryReadPaths) if (!(await fs.stat(v)).isDirectory()) fail('host_directory_drift')
  for (const v of m.hostAliasMetadata) {
    if (!keys(v, ['path', 'linkText', 'physicalTarget']) || !hostPath(v.path) || !hostPath(v.physicalTarget) ||
      !m.hostMetadataPaths.includes(v.path) || !(await fs.lstat(v.path)).isSymbolicLink() ||
      await fs.readlink(v.path) !== v.linkText || await fs.realpath(v.path) !== v.physicalTarget) fail('host_alias_drift')
  }
  for (const v of m.dependencyAliases) {
    if (!keys(v, ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256']) ||
      !relative(v.virtualPackage).startsWith('node_modules/') ||
      v.physicalPackagePath !== path.join(dependencyRoot, v.virtualPackage.slice(13))) fail('alias_scope')
    const link = path.join(sourceRoot, v.virtualPackage)
    if (!(await fs.lstat(link)).isSymbolicLink() || await fs.readlink(link) !== v.linkText ||
      await fs.realpath(link) !== v.physicalPackagePath) fail('alias_drift')
    await assertHash(path.join(v.physicalPackagePath, 'package.json'), v.packageJsonSha256)
  }
  for (const name of ['vitest', 'vite', 'esbuild', 'zod'])
    if ((await readJson(path.join(mirror, `node_modules/${name}/package.json`))).version !== m.versions[name]) fail('package_version')
  await assertMirror(caseRoot, m)
  await reviewed(op.sourceReview, 'SOURCE_CLOSURE', m, manifestHash, profileHash)
  await reviewed(op.operationalReview, 'OPERATIONAL_PROFILE', m, manifestHash, profileHash)
  const receipts = path.join(caseRoot, 'receipts')
  if (stage === 'test') {
    const priorPath = path.join(receipts, 'self-check.result.json')
    await assertHash(priorPath, op.selfCheckResultSha256)
    const prior = await readJson(priorPath)
    if (prior.version !== 'M06_E2_BOOTSTRAP_CONTRACT_RESULT_V1' || prior.stage !== 'self-check' ||
      prior.caseId !== m.caseId || prior.manifestSha256 !== manifestHash || prior.status !== 'PASS' ||
      prior.denialOracleCount !== 3 || prior.ownedExitOracleCount !== 2 ||
      !isDeepStrictEqual(prior.selfCheckObservation, inspectSelfCheck(Buffer.from(JSON.stringify(prior.selfCheckObservation)))))
      fail('self_check_prerequisite')
    await reviewed(op.hostProof, 'HOST_EFFECTIVE_CONFINEMENT', m, manifestHash, profileHash,
      op.selfCheckResultSha256)
  }
  await writeNew(path.join(receipts, `${stage}.started.json`), {
    version: 'M06_E2_BOOTSTRAP_CONTRACT_STARTED_V1', caseId: m.caseId, stage,
    operationSha256: operationHash, manifestSha256: manifestHash, profileSha256: profileHash,
    time: new Date().toISOString() })
  const target = stage === 'self-check' ? path.join(caseRoot, 'self-check.mjs') :
    path.join(mirror, 'node_modules/vitest/vitest.mjs')
  const result = await launch(m.tools.sandboxExec.path,
    ['-f', path.join(caseRoot, 'sandbox.sb'), m.tools.node.path, target, ...(stage === 'test' ? m.args : [])],
    { cwd: mirror, env, timeoutMs: stage === 'self-check' ? 8_000 : 120_000 })
  let status = result.code === 0 && !result.signal && !result.spawnError && !result.overLimit &&
    !result.timedOut && !result.interruption && !result.killError ? 'PASS' : 'FAIL'
  let observed = null, denialOracleCount = 0, ownedExitOracleCount = 0
  if (stage === 'self-check') {
    try { observed = inspectSelfCheck(result.stdout); denialOracleCount = 3; ownedExitOracleCount = 2 }
    catch { status = 'FAIL' }
  }
  // A zero exit with a failed worker/pool teardown is still a failed one-shot test attempt.
  const combined = `${result.stdout.toString('utf8')}\n${result.stderr.toString('utf8')}`
  const teardownWarning = stage === 'test' &&
    /(?:failed|unable|could not|timed out|timeout|force(?:d)?)\s+(?:to\s+)?(?:terminate|stop|close|kill|tear\s*down)|(?:pool|worker|child process).{0,80}(?:failed|timeout|timed out|unhandled|unexpectedly)/i.test(combined)
  if (teardownWarning) status = 'FAIL'
  try {
    await assertMirror(caseRoot, m)
    for (const v of sourcePaths) await assertHash(path.join(sourceRoot, v), m.sourceFiles[v])
  } catch { status = 'FAIL' }
  const receipt = { version: 'M06_E2_BOOTSTRAP_CONTRACT_RESULT_V1', caseId: m.caseId, stage,
    operationSha256: operationHash, manifestSha256: manifestHash, profileSha256: profileHash,
    status, pid: result.pid, exitCode: result.code, signal: result.signal,
    spawnError: result.spawnError, timedOut: result.timedOut, overLimit: result.overLimit,
    interruption: result.interruption, killError: result.killError, teardownWarning,
    stdoutSha256: createHash('sha256').update(result.stdout).digest('hex'),
    stderrSha256: createHash('sha256').update(result.stderr).digest('hex'),
    boundedStdout: result.stdout.subarray(0, 16_384).toString('utf8'),
    boundedStderr: result.stderr.subarray(0, 16_384).toString('utf8'),
    selfCheckObservation: observed, denialOracleCount, ownedExitOracleCount,
    completedAt: new Date().toISOString() }
  await writeNew(path.join(receipts, `${stage}.result.json`), receipt)
  process.stdout.write(`${JSON.stringify({ caseId: m.caseId, stage, status,
    receipt: path.join(receipts, `${stage}.result.json`) })}\n`)
  if (status !== 'PASS') process.exitCode = 1
}
main().catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1 })
