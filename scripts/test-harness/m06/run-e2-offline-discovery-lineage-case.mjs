#!/usr/bin/env node
/** Exact E2 Discovery mode-lineage runner. Inert self-check precedes its single selected test file.
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
const caseBase = path.join(base, 'e2-discovery-lineage-offline')
const reviewBase = path.join(base, 'operations/e2-discovery-lineage-ts')
const dependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const sourcePaths = [
  "packages/cucumber-runtime/src/assertion.ts",
  "packages/cucumber-runtime/src/cache.util.ts",
  "packages/cucumber-runtime/src/canonical-json.ts",
  "packages/cucumber-runtime/src/captcha-detector.ts",
  "packages/cucumber-runtime/src/environment.util.ts",
  "packages/cucumber-runtime/src/locator.util.ts",
  "packages/cucumber-runtime/src/operations/browser-handlers.ts",
  "packages/cucumber-runtime/src/operations/builtins/active-state-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/browser-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/browser-state.ts",
  "packages/cucumber-runtime/src/operations/builtins/click.ts",
  "packages/cucumber-runtime/src/operations/builtins/data-diagnostics.ts",
  "packages/cucumber-runtime/src/operations/builtins/download-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/downloads.ts",
  "packages/cucumber-runtime/src/operations/builtins/element-property-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/element-state-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/forms.ts",
  "packages/cucumber-runtime/src/operations/builtins/hover.ts",
  "packages/cucumber-runtime/src/operations/builtins/index.ts",
  "packages/cucumber-runtime/src/operations/builtins/input.ts",
  "packages/cucumber-runtime/src/operations/builtins/keyboard.ts",
  "packages/cucumber-runtime/src/operations/builtins/navigation-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/navigation.ts",
  "packages/cucumber-runtime/src/operations/builtins/pointer.ts",
  "packages/cucumber-runtime/src/operations/builtins/random-data.ts",
  "packages/cucumber-runtime/src/operations/builtins/store.ts",
  "packages/cucumber-runtime/src/operations/builtins/structured-operations.ts",
  "packages/cucumber-runtime/src/operations/builtins/synchronization.ts",
  "packages/cucumber-runtime/src/operations/builtins/tabs-frames-dialogs.ts",
  "packages/cucumber-runtime/src/operations/builtins/text-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/visibility-assertion.ts",
  "packages/cucumber-runtime/src/operations/builtins/wait.ts",
  "packages/cucumber-runtime/src/operations/contracts.ts",
  "packages/cucumber-runtime/src/operations/definitions.json",
  "packages/cucumber-runtime/src/operations/handler-source-hash.ts",
  "packages/cucumber-runtime/src/operations/human-dispatcher.ts",
  "packages/cucumber-runtime/src/operations/index.ts",
  "packages/cucumber-runtime/src/operations/registry.ts",
  "packages/cucumber-runtime/src/operations/sealed-origin.ts",
  "packages/cucumber-runtime/src/operations/value-schema.ts",
  "packages/cucumber-runtime/src/paths.ts",
  "packages/cucumber-runtime/src/random-data.util.ts",
  "packages/cucumber-runtime/src/step-definitions/artifact-contract.ts",
  "packages/cucumber-runtime/src/step-definitions/builtins.ts",
  "packages/cucumber-runtime/src/step-definitions/composition-validator.ts",
  "packages/cucumber-runtime/src/step-definitions/contracts.ts",
  "packages/cucumber-runtime/src/step-definitions/dispatcher.ts",
  "packages/cucumber-runtime/src/step-definitions/index.ts",
  "packages/cucumber-runtime/src/step-definitions/invocation-contracts.ts",
  "packages/cucumber-runtime/src/step-operations.ts",
  "packages/cucumber-runtime/src/types.ts",
  "src/config/db-config.ts",
  "src/lib/catalog-contracts/canonical-json.ts",
  "src/lib/catalog-contracts/index.ts",
  "src/lib/catalog-contracts/references.ts",
  "src/lib/operation-catalog/default-operation-registry.ts",
  "src/lib/operation-catalog/index.ts",
  "src/lib/operation-catalog/validation-adapter.ts",
  "src/lib/quality-journey/agent-factory.ts",
  "src/lib/quality-journey/analysis-contracts.ts",
  "src/lib/quality-journey/automation-contracts.ts",
  "src/lib/quality-journey/closure-contracts.ts",
  "src/lib/quality-journey/codex-app-server/rpc-transport.ts",
  "src/lib/quality-journey/contracts.ts",
  "src/lib/quality-journey/discovery-browser-contracts.ts",
  "src/lib/quality-journey/discovery-contracts.ts",
  "src/lib/quality-journey/draft-contracts.ts",
  "src/lib/quality-journey/e2-campaign-policy-contract.ts",
  "src/lib/quality-journey/execution-contracts.ts",
  "src/lib/quality-journey/execution-effects.ts",
  "src/lib/quality-journey/golden-fixtures.ts",
  "src/lib/quality-journey/index.ts",
  "src/lib/quality-journey/kernel.ts",
  "src/lib/quality-journey/lifecycle.ts",
  "src/lib/quality-journey/materialization-source-contract.ts",
  "src/lib/quality-journey/provider-grant-contract.ts",
  "src/lib/quality-journey/provider-intent-contract.ts",
  "src/lib/quality-journey/requirement-contracts.ts",
  "src/lib/quality-journey/requirement-values.ts",
  "src/lib/quality-journey/role-definitions.ts",
  "src/lib/quality-journey/runner.ts",
  "src/lib/quality-journey/scenario-contracts.ts",
  "src/lib/quality-journey/shared-resource-contract.ts",
  "src/lib/quality-journey/state.ts",
  "src/lib/quality-journey/triage-contracts.ts",
  "src/lib/quality-journey/triage-evidence-contracts.ts",
  "src/services/coordinator/quality-journey-analysis-followup-budget.ts",
  "src/services/coordinator/quality-journey-analysis-followup.ts",
  "src/services/coordinator/quality-journey-business-write-join.ts",
  "src/services/coordinator/quality-journey-coordinator-session.ts",
  "src/services/coordinator/quality-journey-discovery-bootstrap.ts",
  "src/services/coordinator/quality-journey-discovery-e2-lineage.test.ts",
  "src/services/coordinator/quality-journey-e2-retirement-service.ts",
  "src/services/coordinator/quality-journey-provider-recovery.ts",
  "src/services/coordinator/quality-journey-service.ts",
  "src/services/coordinator/quality-journey-shared-resource-descriptor-service.ts",
  "src/services/coordinator/quality-journey-shared-resource-guard-service.ts",
  "src/services/coordinator/quality-journey-shared-resource-use-service.ts",
  "src/services/coordinator/quality-journey-terminal.ts",
  "src/services/coordinator/quality-journey-wake-service.ts",
  "src/services/shared/errors.ts"
]
const selectors = ["src/services/coordinator/quality-journey-discovery-e2-lineage.test.ts"]
const sourceLedgerPath = path.join(base, 'operations/e2-discovery-lineage-ts/source-closure1.json')
const sourceLedgerHash = '5b1b015a9ea8f7d4dbba0831dfeddc268810c12ccc77a350e67a7aedd47d39fe'
const dependencyPacketPath = path.join(base, 'operations/e2-shared-use-ts/prepare-shared-use-r2.json')
const dependencyPacketHash = 'f3e49038b8fe1f7cec7dcea7380c05e9ffa8d16c74d8031742c763b7df7369f5'
const guardSource = "throw new Error('M06_E2_DISCOVERY_LINEAGE_PLAYWRIGHT_RUNTIME_IMPORT_FORBIDDEN')\n"
const guardName = 'mirror/playwright-runtime-forbidden.mjs'
const sortEntries = rows => [...rows].sort((a, b) => a.path.localeCompare(b.path))
const exactRows = (got, expected) => Array.isArray(got) && got.length === expected.length &&
  got.every((v, i) => v.path === expected[i].path && v.sha256 === expected[i].sha256)
const exactAliases = (got, expected) => Array.isArray(got) && got.length === expected.length &&
  [...got].sort((a, b) => a.virtualPackage.localeCompare(b.virtualPackage)).every((v, i) =>
    ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256'].every(k => v[k] === expected[i][k]))
async function expectedClosure() {
  await assertHash(sourceLedgerPath, sourceLedgerHash)
  await assertHash(dependencyPacketPath, dependencyPacketHash)
  const source = JSON.parse(await fs.readFile(sourceLedgerPath, 'utf8'))
  const baseline = JSON.parse(await fs.readFile(dependencyPacketPath, 'utf8'))
  if (source.version !== 'M06_E2_DISCOVERY_LINEAGE_SOURCE_CLOSURE_V1' ||
    !Array.isArray(source.canonicalFiles) || source.canonicalFiles.length !== 101 ||
    source.canonicalFiles.some((v, i) => v.path !== sourcePaths[i] || !sha.test(v.sha256)) ||
    source.declaredTestCount !== 408 || !Array.isArray(source.mocks) || source.mocks.length !== 1 ||
    source.mocks[0].path !== 'src/config/db-config.ts' ||
    source.dependencyPacket?.sha256 !== dependencyPacketHash ||
    baseline.dependencyRoot !== dependencyRoot ||
    !Array.isArray(baseline.dependencyFiles) || baseline.dependencyFiles.length !== 3565 ||
    !Array.isArray(baseline.dependencyAliases) || baseline.dependencyAliases.length !== 122)
    fail('sealed_ledger_shape')
  const sources = Object.fromEntries(source.canonicalFiles.map(v => [v.path, v.sha256]))
  if (Object.keys(sources).length !== 101 || sourcePaths.some(v => !sha.test(sources[v]))) fail('sealed_source_union')
  const dependencies = sortEntries(baseline.dependencyFiles)
  if (new Set(dependencies.map(v => v.path)).size !== 3565 ||
    dependencies.some(v => !sha.test(v.sha256) || !relative(v.path).startsWith('node_modules/') ||
      /^node_modules\/(?:playwright(?:-core)?|@playwright\/test)(?:\/|$)/.test(v.path)))
    fail('sealed_dependency_union')
  const aliases = [...baseline.dependencyAliases].sort((a, b) =>
    a.virtualPackage.localeCompare(b.virtualPackage))
  if (new Set(aliases.map(v => v.virtualPackage)).size !== 122 ||
    aliases.some(v => /^node_modules\/(?:playwright(?:-core)?|@playwright\/test)(?:\/|$)/.test(v.virtualPackage)) ||
    aliases.some(v => dependencies.find(d => d.path === v.virtualPackage + '/package.json')?.sha256 !== v.packageJsonSha256))
    fail('sealed_alias_union')
  return { sources, dependencies, aliases, versions: baseline.versions }
}

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
const fail = s => { throw new Error(`E2 discovery-lineage run refused: ${s}`) }
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
  if (!keys(r, [...common, ...extra]) || r.version !== 'M06_E2_DISCOVERY_LINEAGE_REVIEW_V1' ||
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
    r.version !== 'M06_E2_DISCOVERY_LINEAGE_SELF_CHECK_V1' ||
    [r.read, r.exec, r.bind].filter(v => v === 'EPERM' || v === 'EACCES').length !== 3 ||
    !keys(r.term, ['code', 'signal', 'termSent', 'forced']) ||
    !keys(r.forced, ['code', 'signal', 'termSent', 'forced']) ||
    !isDeepStrictEqual(r.term, { code: 0, signal: null, termSent: true, forced: false }) ||
    !isDeepStrictEqual(r.forced, { code: null, signal: 'SIGKILL', termSent: true, forced: true }))
    fail('self_check_oracles')
  return r
}

function inspectTestReport(bytes, mirror) {
  let report; try { report = JSON.parse(bytes.toString('utf8')) } catch { fail('test_report_json') }
  if (report.success !== true || report.numTotalTests !== 408 || report.numPassedTests !== 408 ||
    report.numFailedTests !== 0 || report.numPendingTests !== 0 || report.numTodoTests !== 0 ||
    report.numFailedTestSuites !== 0 || report.numPendingTestSuites !== 0 ||
    !Array.isArray(report.testResults) || report.testResults.length !== 1)
    fail('test_report_counts')
  const selected = report.testResults[0]
  if (selected.name !== path.join(mirror, selectors[0]) || selected.status !== 'passed' ||
    !Array.isArray(selected.assertionResults) || selected.assertionResults.length !== 408 ||
    selected.assertionResults.some(test => test.status !== 'passed')) fail('test_report_selector')
  return { totalTests: report.numTotalTests, passedTests: report.numPassedTests,
    failedTests: report.numFailedTests, pendingTests: report.numPendingTests,
    todoTests: report.numTodoTests, selectedFiles: report.testResults.length }
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
  if (m.version !== 'M06_E2_DISCOVERY_LINEAGE_CASE_V1' || m.caseId !== path.basename(caseRoot) ||
    m.caseRoot !== caseRoot || m.sourceRoot !== sourceRoot || m.dependencyRoot !== dependencyRoot ||
    m.status !== 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY' ||
    !keys(m.sourceFiles, sourcePaths) || sourcePaths.some(v => !sha.test(m.sourceFiles[v])) ||
    !isDeepStrictEqual(m.selectors, selectors) ||
    !isDeepStrictEqual(m.args, ['run', '--config', 'vitest.e2-discovery-lineage.config.mjs', '--configLoader', 'native', '--reporter=json', ...selectors]))
    fail('manifest_scope')
  const sealed = await expectedClosure()
  if (m.sourceLedgerSha256 !== sourceLedgerHash || m.dependencyPacketSha256 !== dependencyPacketHash ||
    sourcePaths.some(v => m.sourceFiles[v] !== sealed.sources[v]) ||
    !Array.isArray(m.dependencyFiles) || !exactRows(sortEntries(m.dependencyFiles), sealed.dependencies) ||
    !exactAliases(m.dependencyAliases, sealed.aliases) ||
    Object.keys(sealed.versions).some(k => m.versions?.[k] !== sealed.versions[k]) ||
    !keys(m.generatedHashes, ['mirror/vitest.e2-discovery-lineage.config.mjs', guardName,
      'mirror/package.json', 'mirror/e2-discovery-lineage-signal-child.mjs', 'self-check.mjs', 'sandbox.sb']))
    fail('sealed_manifest_closure')
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
  if (!keys(op, opKeys) || op.version !== 'M06_E2_DISCOVERY_LINEAGE_OPERATION_V1' ||
    op.stage !== stage || op.caseId !== m.caseId || op.manifestSha256 !== manifestHash) fail('operation_scope')
  const profileHash = m.generatedHashes?.['sandbox.sb']
  if (op.profileSha256 !== profileHash) fail('profile_scope')
  await assertHash(script, op.runnerSha256)
  await assertHash(path.join(sourceRoot, 'scripts/test-harness/m06/prepare-e2-offline-discovery-lineage-case.mjs'), m.preparerSha256)
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
    resolve: { alias: { '@': path.join(mirror, 'src'), playwright: path.join(mirror, guardName.slice(7)) } },
    test: { environment: 'node', setupFiles: [], include: selectors, fileParallelism: false,
      maxWorkers: 1, isolate: true, passWithNoTests: false } }
  if (await fs.readFile(path.join(mirror, 'vitest.e2-discovery-lineage.config.mjs'), 'utf8') !== `export default ${JSON.stringify(config)}\n` ||
    await fs.readFile(path.join(mirror, 'package.json'), 'utf8') !==
      '{"name":"m06-e2-discovery-lineage-offline","private":true,"type":"module"}\n' ||
    await fs.readFile(path.join(caseRoot, guardName), 'utf8') !== guardSource ||
    await fileHash(path.join(caseRoot, guardName)) !== m.generatedHashes[guardName]) fail('config_scope')
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
    if (prior.version !== 'M06_E2_DISCOVERY_LINEAGE_RESULT_V1' || prior.stage !== 'self-check' ||
      prior.caseId !== m.caseId || prior.manifestSha256 !== manifestHash || prior.status !== 'PASS' ||
      prior.denialOracleCount !== 3 || prior.ownedExitOracleCount !== 2 ||
      !isDeepStrictEqual(prior.selfCheckObservation, inspectSelfCheck(Buffer.from(JSON.stringify(prior.selfCheckObservation)))))
      fail('self_check_prerequisite')
    await reviewed(op.hostProof, 'HOST_EFFECTIVE_CONFINEMENT', m, manifestHash, profileHash,
      op.selfCheckResultSha256)
  }
  await writeNew(path.join(receipts, `${stage}.started.json`), {
    version: 'M06_E2_DISCOVERY_LINEAGE_STARTED_V1', caseId: m.caseId, stage,
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
  let testObservation = null
  if (stage === 'test') {
    try { testObservation = inspectTestReport(result.stdout, mirror) } catch { status = 'FAIL' }
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
  const receipt = { version: 'M06_E2_DISCOVERY_LINEAGE_RESULT_V1', caseId: m.caseId, stage,
    operationSha256: operationHash, manifestSha256: manifestHash, profileSha256: profileHash,
    status, pid: result.pid, exitCode: result.code, signal: result.signal,
    spawnError: result.spawnError, timedOut: result.timedOut, overLimit: result.overLimit,
    interruption: result.interruption, killError: result.killError, teardownWarning,
    stdoutSha256: createHash('sha256').update(result.stdout).digest('hex'),
    stderrSha256: createHash('sha256').update(result.stderr).digest('hex'),
    boundedStdout: result.stdout.subarray(0, 16_384).toString('utf8'),
    boundedStderr: result.stderr.subarray(0, 16_384).toString('utf8'),
    selfCheckObservation: observed, denialOracleCount, ownedExitOracleCount, testObservation,
    completedAt: new Date().toISOString() }
  await writeNew(path.join(receipts, `${stage}.result.json`), receipt)
  process.stdout.write(`${JSON.stringify({ caseId: m.caseId, stage, status,
    receipt: path.join(receipts, `${stage}.result.json`) })}\n`)
  if (status !== 'PASS') process.exitCode = 1
}
main().catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1 })
