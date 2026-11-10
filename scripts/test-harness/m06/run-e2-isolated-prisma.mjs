#!/usr/bin/env node
/**
 * One-case, one-CLI-stage runner for a freshly prepared Prisma case.
 * --case <absolute case> --operation <absolute case/self-check|cli-operation.json>
 * --operation-sha256 <64 lowercase hex> --stage self-check|cli
 * A self-check needs separately reviewed source/profile receipts. CLI also needs a separately
 * attested host-effective confinement receipt bound to the exact self-check result. The
 * launcher validates those references; it cannot itself certify the OS or dependency closure.
 */
import { spawn } from 'node:child_process'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const script = fileURLToPath(import.meta.url)
const worktree = path.resolve(path.dirname(script), '../../..')
const base = path.resolve(worktree, '../..')
const caseBase = path.join(base, 'e2-prisma-offline')
const reviewBase = path.join(base, 'operations/e2-prisma')
const dependencyRoot = path.resolve(worktree, '../../../..', 'node_modules')
const sha = /^[a-f0-9]{64}$/
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const effectSecretPackage = 'node_modules/effect/Secret/package.json'
const effectSecretPackageSha256 = '05372d28b66a4398561a7110e41700ce43e6ced1c03f94fea56e5ff0c053b92f'
const hostRoots = ['/System/Cryptexes', '/System/Library', '/usr/lib', '/usr/share', '/private/var/db/dyld',
  '/System/Volumes/Preboot/Cryptexes', '/opt/homebrew', '/usr/local/lib']
const forbidden = /^(?:\.env(?:\..*)?|\.npmrc|prisma\.config\..*|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.next)$/i
const fail = reason => { throw new Error(`E2 isolated Prisma refused: ${reason}`) }
const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === expected.length && Object.keys(v).every(k => expected.includes(k))
const absolute = v => {
  if (typeof v !== 'string' || !path.isAbsolute(v) || path.normalize(v) !== v ||
    v.includes('\0') || /[\r\n]/.test(v)) fail('absolute_path')
  return v
}
const relative = v => {
  if (typeof v !== 'string' || !v || v.includes('\\') || v.includes('\0') ||
    path.posix.normalize(v) !== v || v.split('/').some(part => !part || part === '.' || part === '..' || forbidden.test(part)))
    fail('relative_path')
  return v
}
const dependencyPath = (value, expectedSha256) => {
  if (value === effectSecretPackage) {
    if (expectedSha256 !== effectSecretPackageSha256) fail('effect_secret_package_hash')
    return value
  }
  return relative(value)
}
const hostPath = v => hostRoots.some(root => absolute(v).startsWith(`${root}/`)) &&
  !v.split('/').some(part => forbidden.test(part))
const hashFile = file => new Promise((resolve, reject) => {
  const h = createHash('sha256')
  const s = createReadStream(file)
  s.on('data', b => h.update(b))
  s.on('error', reject)
  s.on('end', () => resolve(h.digest('hex')))
})
const regular = async file => {
  const s = await fs.lstat(file)
  if (!s.isFile() || s.isSymbolicLink() || await fs.realpath(file) !== file) fail('nonregular_file')
}
const assertHash = async (file, expected) => {
  if (!sha.test(expected)) fail('hash_format')
  await regular(file)
  const actual = await hashFile(file)
  if (!timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) fail('hash_mismatch')
}
const json = async file => {
  await regular(file)
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { fail('json') }
}
const writeNew = async (file, value) => fs.writeFile(file, `${JSON.stringify(value)}\n`, { flag: 'wx', mode: 0o600 })
function assertLauncher() {
  const locale = '__CF_USER_TEXT_ENCODING'
  const envKeys = Object.keys(process.env).filter(k => k !== locale).sort()
  if (envKeys.join(',') !== ['CI', 'HOME', 'OPENSSL_CONF', 'PATH', 'TMPDIR'].join(',') ||
    process.env.CI !== '1' || process.env.OPENSSL_CONF !== '' ||
    process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${reviewBase}/`) || !process.env.TMPDIR?.startsWith(`${reviewBase}/`) ||
    (process.env[locale] !== undefined && !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[locale])))
    fail('launcher_environment')
}
async function assertTree(root, files, outputPrefix = null) {
  const expected = new Map(files.map(v => [v.path, v.sha256]))
  const seen = new Set()
  let visited = 0
  const walk = async (dir, prefix = '') => {
    for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
      if (++visited > expected.size * 8 + 200) fail('mirror_entry_bound')
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name
      const file = path.join(dir, ent.name)
      const s = await fs.lstat(file)
      if (s.isSymbolicLink()) fail('mirror_link')
      if (s.isDirectory()) await walk(file, rel)
      else if (s.isFile()) {
        if (outputPrefix && rel.startsWith(`${outputPrefix}/`)) {
          if (s.size > 32_000_000) fail('generated_file_bound')
        } else {
          if (!expected.has(rel)) fail('mirror_extra')
          await assertHash(file, expected.get(rel))
          seen.add(rel)
        }
      } else fail('mirror_nonregular')
    }
  }
  await walk(root)
  if (seen.size !== expected.size || [...expected.keys()].some(v => !seen.has(v))) fail('mirror_missing')
}
async function reviewed(ref, kind, m, manifestHash, profileHash, selfCheckHash = null) {
  if (!keys(ref, ['path', 'sha256'])) fail('review_reference')
  const file = absolute(ref.path)
  if (path.dirname(file) !== reviewBase || !/^review-[A-Za-z0-9_-]+\.json$/.test(path.basename(file))) fail('review_path')
  await assertHash(file, ref.sha256)
  const r = await json(file)
  const fields = ['version', 'kind', 'caseId', 'stage', 'manifestSha256', 'profileSha256',
    'decision', 'reviewId', 'sourceClosureComplete', 'exactArgsAndEnvironmentReviewed',
    'processAndLoaderClosureReviewed', 'networkDeniedByOS', 'fileBoundaryReviewed',
    'negativeControlsReviewed', 'ownedSignalControlsReviewed',
    'ownedSignalControlsObserved', 'selfCheckResultSha256']
  if (!keys(r, fields) || r.version !== 'M06_E2_PRISMA_REVIEW_V1' || r.kind !== kind ||
    r.caseId !== m.caseId || r.stage !== m.stage || r.manifestSha256 !== manifestHash ||
    r.profileSha256 !== profileHash || r.decision !== 'ACCEPT' ||
    typeof r.reviewId !== 'string' || !r.reviewId ||
    r.selfCheckResultSha256 !== (kind === 'HOST_EFFECTIVE_CONFINEMENT' ? selfCheckHash : null) ||
    ['sourceClosureComplete', 'exactArgsAndEnvironmentReviewed', 'processAndLoaderClosureReviewed',
      'networkDeniedByOS', 'fileBoundaryReviewed', 'negativeControlsReviewed',
      'ownedSignalControlsReviewed', 'ownedSignalControlsObserved'].some(f =>
      r[f] !== (kind === 'HOST_EFFECTIVE_CONFINEMENT' ||
        (kind === 'SOURCE_CLOSURE' && f === 'sourceClosureComplete') ||
        (kind === 'OPERATIONAL_PROFILE' && ['exactArgsAndEnvironmentReviewed',
          'processAndLoaderClosureReviewed', 'fileBoundaryReviewed', 'negativeControlsReviewed',
          'ownedSignalControlsReviewed'].includes(f)))))
    fail('review_scope_or_claims')
}
function inspectSelfCheck(buffer) {
  let observed
  try { observed = JSON.parse(buffer.toString('utf8')) } catch { fail('self_check_json') }
  if (!keys(observed, ['version', 'read', 'exec', 'bind', 'term', 'forced']) ||
    observed.version !== 'M06_E2_PRISMA_SELF_CHECK_V2' ||
    [observed.read, observed.exec, observed.bind].filter(v => v === 'EPERM' || v === 'EACCES').length !== 3 ||
    !keys(observed.term, ['code', 'signal', 'termSent', 'forced']) ||
    !keys(observed.forced, ['code', 'signal', 'termSent', 'forced']) ||
    !isDeepStrictEqual(observed.term, { code: 0, signal: null, termSent: true, forced: false }) ||
    !isDeepStrictEqual(observed.forced, { code: null, signal: 'SIGKILL', termSent: true, forced: true }))
    fail('self_check_oracles')
  return observed
}
function generatedClientConfig(body) {
  const marker = '\nconst config = {'
  const at = body.indexOf(marker)
  if (at < 0 || body.indexOf(marker, at + marker.length) !== -1) fail('generated_config_anchor')
  const start = at + marker.length - 1
  let depth = 0
  let quoted = false
  let escaped = false
  let end = -1
  const topKeys = []
  let relativeStart = -1
  let keyStart = -1
  for (let i = start; i < body.length && i - start <= 1_000_000; i++) {
    const ch = body[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') {
        quoted = false
        if (depth === 1) {
          let next = i + 1
          while (/\s/.test(body[next] ?? '')) next++
          if (body[next] === ':') {
            const key = JSON.parse(body.slice(keyStart, i + 1))
            topKeys.push(key)
            if (key === 'relativeEnvPaths') {
              if (relativeStart !== -1) fail('generated_envpaths_duplicate')
              relativeStart = next + 1
              while (/\s/.test(body[relativeStart] ?? '')) relativeStart++
            }
          }
        }
      }
    } else if (ch === '"') {
      quoted = true
      keyStart = i
    } else if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') {
      depth--
      if (depth === 0) { end = i + 1; break }
      if (depth < 0) fail('generated_config_json')
    }
  }
  if (end < 0 || relativeStart < 0 || new Set(topKeys).size !== topKeys.length)
    fail('generated_config_ambiguous')
  const source = body.slice(start, end)
  let config
  try { config = JSON.parse(source) } catch { fail('generated_config_json') }
  if (!config || typeof config !== 'object' || Array.isArray(config) ||
    Object.getPrototypeOf(config) !== Object.prototype ||
    !Object.hasOwn(config, 'relativeEnvPaths')) fail('generated_config_shape')
  const paths = config.relativeEnvPaths
  if (!paths || typeof paths !== 'object' || Array.isArray(paths) ||
    Object.getPrototypeOf(paths) !== Object.prototype) fail('generated_envpaths_shape')
  const names = Object.keys(paths)
  if (names.length > 2 || names.some(name => !['rootEnvPath', 'schemaEnvPath'].includes(name)) ||
    names.some(name => paths[name] !== null)) fail('generated_envpaths_nonnull_or_extra')
  if (body[relativeStart] !== '{') fail('generated_envpaths_shape')
  const relativeEnd = body.indexOf('}', relativeStart)
  if (relativeEnd < 0 || relativeEnd >= end) fail('generated_envpaths_shape')
  const raw = body.slice(relativeStart + 1, relativeEnd).trim()
  const rawEntries = raw ? raw.split(',').map(entry => entry.trim()) : []
  if (rawEntries.length !== names.length ||
    rawEntries.some(entry => !/^"(?:rootEnvPath|schemaEnvPath)"\s*:\s*null$/.test(entry)))
    fail('generated_envpaths_ambiguous')
  return { configSha256: createHash('sha256').update(source).digest('hex'),
    relativeEnvPaths: { rootEnvPath: paths.rootEnvPath ?? null, schemaEnvPath: paths.schemaEnvPath ?? null },
    omittedKeys: ['rootEnvPath', 'schemaEnvPath'].filter(name => !Object.hasOwn(paths, name)) }
}
async function generatedMetadata(caseRoot) {
  const output = path.join(caseRoot, 'mirror/node_modules/.prisma/client')
  const files = await fs.readdir(output)
  const entryNames = ['index.js', 'edge.js', 'wasm.js']
  if (entryNames.some(name => !files.includes(name)) || files.length > 100)
    fail('generated_client_missing_or_excess')
  const outputFiles = []
  const entryConfigs = []
  const walk = async (dir, rel = '') => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const name = rel ? `${rel}/${entry.name}` : entry.name
      const at = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) fail('generated_link')
      if (entry.isDirectory()) await walk(at, name)
      else if (entry.isFile()) {
        if (outputFiles.length >= 100 || (await fs.stat(at)).size > 32_000_000) fail('generated_output_bound')
        if (name.split('/').some(part => forbidden.test(part))) fail('generated_forbidden_path')
        if (entryNames.includes(name)) {
          if ((await fs.stat(at)).size > 16_000_000) fail('generated_metadata_bound')
          const body = await fs.readFile(at, 'utf8')
          entryConfigs.push({ path: `node_modules/.prisma/client/${name}`,
            sha256: await hashFile(at), ...generatedClientConfig(body) })
        }
        outputFiles.push({ path: `node_modules/.prisma/client/${name}`, sha256: await hashFile(at) })
      } else fail('generated_nonregular')
    }
  }
  await walk(output)
  if (entryConfigs.length !== entryNames.length) fail('generated_entry_configs')
  return { files: outputFiles.sort((a, b) => a.path.localeCompare(b.path)),
    nodeEntry: 'node_modules/.prisma/client/index.js',
    entryConfigs: entryConfigs.sort((a, b) => a.path.localeCompare(b.path)),
    runtimeSources: [
      { path: 'node_modules/.prisma/client/runtime/library.js',
        sha256: await hashFile(path.join(output, 'runtime/library.js')) },
      { path: 'node_modules/@prisma/client/runtime/library.js',
        sha256: await hashFile(path.join(caseRoot, 'mirror/node_modules/@prisma/client/runtime/library.js')) },
    ] }
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
      catch (e) { if (e.code !== 'ESRCH') killError = e.code || 'KILL_FAILED' }
    }
    const onTerm = () => { interruption = 'SIGTERM'; kill() }
    const onInt = () => { interruption = 'SIGINT'; kill() }
    process.on('SIGTERM', onTerm)
    process.on('SIGINT', onInt)
    const timer = setTimeout(() => { timedOut = true; kill() }, options.timeoutMs)
    child.stdout?.on('data', b => { outBytes += b.length; if (outBytes > 1_048_576) { overLimit = true; kill() } else stdout.push(b) })
    child.stderr?.on('data', b => { errBytes += b.length; if (errBytes > 1_048_576) { overLimit = true; kill() } else stderr.push(b) })
    child.on('error', e => { spawnError = e.code || 'SPAWN_FAILED' })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      process.off('SIGTERM', onTerm)
      process.off('SIGINT', onInt)
      resolve({ code, signal, pid: child.pid ?? null, overLimit, timedOut, interruption,
        killError, spawnError, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) })
    })
  })
}

async function main() {
  if (process.platform !== 'darwin') fail('macos_only')
  assertLauncher()
  if (process.argv.length !== 10 || process.argv[2] !== '--case' || process.argv[4] !== '--operation' ||
    process.argv[6] !== '--operation-sha256' || process.argv[8] !== '--stage') fail('args')
  const caseRoot = absolute(process.argv[3])
  const operationPath = absolute(process.argv[5])
  const operationHash = process.argv[7]
  const stage = process.argv[9]
  if (!['self-check', 'cli'].includes(stage) || !uuid.test(path.basename(caseRoot)) ||
    path.dirname(caseRoot) !== caseBase || await fs.realpath(caseRoot) !== caseRoot ||
    operationPath !== path.join(caseRoot, `${stage}-operation.json`) || !sha.test(operationHash)) fail('case_scope')
  const manifestPath = path.join(caseRoot, 'case-manifest.json')
  await regular(manifestPath)
  const manifestHash = await hashFile(manifestPath)
  const m = await json(manifestPath)
  if (m.version !== 'M06_E2_PRISMA_CASE_V1' || m.caseRoot !== caseRoot ||
    m.caseId !== path.basename(caseRoot) || m.sourceRoot !== worktree ||
    m.dependencyRoot !== dependencyRoot || m.status !== 'PREPARED_UNREVIEWED_NO_EXECUTION_AUTHORITY' ||
    !['validate', 'generate', 'migrate'].includes(m.stage)) fail('manifest_scope')
  if (!Array.isArray(m.dependencyFiles) || m.dependencyFiles.length < 8 ||
    m.dependencyFiles.length > 50_000 || !Array.isArray(m.migrationFiles) ||
    m.migrationFiles.length > 2_000 || !Array.isArray(m.hostReadFiles) ||
    m.hostReadFiles.length > 2_000 || !Array.isArray(m.hostDirectoryReadPaths) ||
    !Array.isArray(m.hostMetadataPaths) || !Array.isArray(m.hostAliasMetadata) ||
    m.dependencyFiles.some(v => !keys(v, ['path', 'sha256']) ||
      !dependencyPath(v.path, v.sha256).startsWith('node_modules/') || !sha.test(v.sha256)) ||
    m.migrationFiles.some(v => !keys(v, ['path', 'sha256']) ||
      !relative(v.path).startsWith('prisma/migrations/') || !sha.test(v.sha256)) ||
    m.hostReadFiles.some(v => !keys(v, ['path', 'sha256']) || !hostPath(v.path) || !sha.test(v.sha256)) ||
    [...m.hostMetadataPaths, ...m.hostDirectoryReadPaths].some(v => !hostPath(v)) ||
    m.hostAliasMetadata.some(v => !keys(v, ['path', 'linkText', 'physicalTarget']) ||
      !hostPath(v.path) || !hostPath(v.physicalTarget))) fail('manifest_closure_shape')
  await assertHash(operationPath, operationHash)
  const op = await json(operationPath)
  const opFields = ['version', 'stage', 'caseId', 'manifestSha256', 'profileSha256',
    'runnerSha256', 'sourceReview', 'operationalReview',
    ...(stage === 'cli' ? ['hostProof', 'selfCheckResultSha256'] : [])]
  if (!keys(op, opFields) || op.version !== 'M06_E2_PRISMA_OPERATION_V1' ||
    op.stage !== stage || op.caseId !== m.caseId || op.manifestSha256 !== manifestHash) fail('operation_scope')
  const profileHash = m.generatedHashes?.['sandbox.sb']
  if (op.profileSha256 !== profileHash) fail('profile_scope')
  await assertHash(script, op.runnerSha256)
  await assertHash(path.join(worktree, 'scripts/test-harness/m06/prepare-e2-offline-prisma-case.mjs'), m.preparerSha256)
  await assertHash(path.join(caseRoot, 'sandbox.sb'), profileHash)
  await assertHash(path.join(caseRoot, 'self-check.mjs'), m.generatedHashes['self-check.mjs'])
  await assertHash(path.join(caseRoot, 'mirror/e2-prisma-signal-child.mjs'),
    m.generatedHashes['mirror/e2-prisma-signal-child.mjs'])
  if (!keys(m.canary, ['path', 'sha256']) || path.dirname(absolute(m.canary.path)) !== reviewBase ||
    m.canary.path !== path.join(reviewBase, `canary-${m.caseId}.txt`)) fail('canary_scope')
  await assertHash(m.canary.path, m.canary.sha256)
  if (!keys(m.tools, ['node', 'sandboxExec']) ||
    !keys(m.tools.node, ['path', 'sha256', 'version']) ||
    !keys(m.tools.sandboxExec, ['path', 'sha256']) ||
    m.tools.node.path !== process.execPath || m.tools.node.version !== process.version ||
    m.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_scope')
  for (const tool of Object.values(m.tools)) await assertHash(tool.path, tool.sha256)
  const mirror = path.join(caseRoot, 'mirror')
  const expected = [
    ...m.dependencyFiles, ...m.migrationFiles,
    { path: 'prisma/schema.prisma', sha256: m.generatedHashes['mirror/prisma/schema.prisma'] },
    { path: 'package.json', sha256: m.generatedHashes['mirror/package.json'] },
    { path: 'e2-prisma-signal-child.mjs', sha256: m.generatedHashes['mirror/e2-prisma-signal-child.mjs'] },
  ]
  for (const v of [mirror, path.join(caseRoot, 'home'), path.join(caseRoot, 'tmp'),
    path.join(caseRoot, 'receipts'), path.join(mirror, 'node_modules/.prisma/client')]) {
    const s = await fs.lstat(v)
    if (!s.isDirectory() || s.isSymbolicLink() || await fs.realpath(v) !== v) fail('case_directory')
  }
  await assertTree(mirror, expected)
  await assertHash(path.join(worktree, 'prisma/schema.prisma'), m.schemaSha256)
  const originalSchema = await fs.readFile(path.join(worktree, 'prisma/schema.prisma'), 'utf8')
  const generator = 'generator client {\n  provider = "prisma-client-js"\n}'
  if (!originalSchema.startsWith(generator) || originalSchema.indexOf(generator, generator.length) !== -1 ||
    /\boutput\s*=/.test(originalSchema.slice(0, originalSchema.indexOf('datasource db'))))
    fail('schema_overlay_anchor')
  const expectedSchema = originalSchema.replace(generator,
    'generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma/client"\n}')
  if (await fs.readFile(path.join(mirror, 'prisma/schema.prisma'), 'utf8') !== expectedSchema ||
    await fs.readFile(path.join(mirror, 'package.json'), 'utf8') !==
      '{"name":"m06-e2-prisma-offline","private":true,"version":"0.0.0"}\n')
    fail('source_overlay')
  for (const v of m.migrationFiles) await assertHash(path.join(worktree, v.path), v.sha256)
  for (const v of m.dependencyFiles) {
    await assertHash(path.join(dependencyRoot, v.path.slice('node_modules/'.length)), v.sha256)
  }
  for (const v of m.hostReadFiles) await assertHash(v.path, v.sha256)
  for (const v of m.hostDirectoryReadPaths)
    if (!(await fs.stat(v)).isDirectory()) fail('host_directory_drift')
  for (const v of m.hostAliasMetadata) {
    if (!(await fs.lstat(v.path)).isSymbolicLink() || await fs.readlink(v.path) !== v.linkText ||
      await fs.realpath(v.path) !== v.physicalTarget) fail('host_alias_drift')
  }
  const engine = path.join(mirror, 'node_modules/@prisma/engines/schema-engine-darwin-arm64')
  const query = path.join(mirror, 'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node')
  const env = { PATH: path.dirname(m.tools.node.path), HOME: path.join(caseRoot, 'home'),
    TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '', CHECKPOINT_DISABLE: '1',
    PRISMA_GENERATE_SKIP_AUTOINSTALL: '1', PRISMA_CLI_QUERY_ENGINE_TYPE: 'library',
    PRISMA_SCHEMA_ENGINE_BINARY: engine, PRISMA_QUERY_ENGINE_LIBRARY: query,
    DATABASE_URL: `file:${path.join(caseRoot, 'fixture.sqlite')}` }
  const args = m.stage === 'migrate' ? ['migrate', 'deploy', '--schema', path.join(mirror, 'prisma/schema.prisma')] :
    [m.stage, '--schema', path.join(mirror, 'prisma/schema.prisma')]
  if (!isDeepStrictEqual(m.env, env) || !isDeepStrictEqual(m.args, args) ||
    m.dependencyFiles.some(v => v.path.startsWith('node_modules/.prisma/'))) fail('env_args_or_client_scope')
  if ((await json(path.join(mirror, 'node_modules/prisma/package.json'))).version !== '6.19.3' ||
    (await json(path.join(mirror, 'node_modules/@prisma/client/package.json'))).version !== '6.19.3') fail('prisma_version')
  for (const name of ['fixture.sqlite', 'fixture.sqlite-wal', 'fixture.sqlite-shm', 'fixture.sqlite-journal'])
    if (await fs.access(path.join(caseRoot, name)).then(() => true, () => false)) fail('fixture_exists')
  await reviewed(op.sourceReview, 'SOURCE_CLOSURE', m, manifestHash, profileHash)
  await reviewed(op.operationalReview, 'OPERATIONAL_PROFILE', m, manifestHash, profileHash)
  if (stage === 'cli') {
    const priorFile = path.join(caseRoot, 'receipts/self-check.result.json')
    await assertHash(priorFile, op.selfCheckResultSha256)
    const prior = await json(priorFile)
    if (prior.version !== 'M06_E2_PRISMA_RESULT_V1' || prior.stage !== 'self-check' ||
      prior.caseId !== m.caseId || prior.status !== 'PASS' || prior.manifestSha256 !== manifestHash ||
      prior.denialOracleCount !== 3 || prior.ownedExitOracleCount !== 2 ||
      !isDeepStrictEqual(prior.selfCheckObservation,
        inspectSelfCheck(Buffer.from(JSON.stringify(prior.selfCheckObservation)))))
      fail('self_check_prerequisite')
    await reviewed(op.hostProof, 'HOST_EFFECTIVE_CONFINEMENT', m, manifestHash, profileHash,
      op.selfCheckResultSha256)
  }
  const receiptDir = path.join(caseRoot, 'receipts')
  await writeNew(path.join(receiptDir, `${stage}.started.json`), {
    version: 'M06_E2_PRISMA_STARTED_V1', caseId: m.caseId, stage, prismaStage: m.stage,
    manifestSha256: manifestHash, operationSha256: operationHash, profileSha256: profileHash,
    time: new Date().toISOString(),
  })
  const target = stage === 'self-check' ? path.join(caseRoot, 'self-check.mjs') :
    path.join(mirror, 'node_modules/prisma/build/index.js')
  const result = await launch(m.tools.sandboxExec.path,
    ['-f', path.join(caseRoot, 'sandbox.sb'), m.tools.node.path, target, ...(stage === 'cli' ? args : [])],
    { cwd: mirror, env, timeoutMs: stage === 'self-check' ? 8_000 : 120_000 })
  let status = result.code === 0 && !result.signal && !result.spawnError && !result.overLimit &&
    !result.timedOut && !result.interruption && !result.killError ? 'PASS' : 'FAIL'
  let observed = null
  let denialOracleCount = 0
  let ownedExitOracleCount = 0
  if (stage === 'self-check') {
    try { observed = inspectSelfCheck(result.stdout); denialOracleCount = 3; ownedExitOracleCount = 2 }
    catch { status = 'FAIL' }
  }
  const output = `${result.stdout.toString('utf8')}\n${result.stderr.toString('utf8')}`
  const teardownWarning = stage === 'cli' &&
    /(?:failed|unable|could not|did not|timed out|timeout|force(?:d)?)\s+(?:to\s+)?(?:terminate|stop|close|kill|exit|tear\s*down|shut\s*down)|(?:engine|worker|child process).{0,80}(?:failed|unable|did not|shutdown|still running|timed out|timeout|unexpectedly)|(?:cleanup|teardown).{0,40}(?:failed|unknown|incomplete)/i.test(output)
  if (teardownWarning) status = 'FAIL'
  let generatedFiles = null
  let generatedClientMetadata = null
  let postcheckFailureCategory = null
  try {
    await assertTree(mirror, expected, stage === 'cli' && m.stage === 'generate' ?
      'node_modules/.prisma/client' : null)
    if (stage === 'cli' && m.stage === 'generate' && status === 'PASS') {
      const generated = await generatedMetadata(caseRoot)
      generatedFiles = generated.files
      generatedClientMetadata = { nodeEntry: generated.nodeEntry,
        entryConfigs: generated.entryConfigs, runtimeSources: generated.runtimeSources }
    }
    if (stage === 'cli' && m.stage === 'migrate' && status === 'PASS')
      await regular(path.join(caseRoot, 'fixture.sqlite'))
    if (!(stage === 'cli' && m.stage === 'migrate'))
      for (const name of ['fixture.sqlite', 'fixture.sqlite-wal', 'fixture.sqlite-shm', 'fixture.sqlite-journal'])
        if (await fs.access(path.join(caseRoot, name)).then(() => true, () => false)) fail('unexpected_database')
  } catch (error) {
    status = 'FAIL'
    const reason = error instanceof Error ? /^E2 isolated Prisma refused: ([a-z_]+)$/.exec(error.message)?.[1] : null
    postcheckFailureCategory = reason ?? 'postcheck_unknown'
  }
  const receipt = { version: 'M06_E2_PRISMA_RESULT_V1', caseId: m.caseId, stage,
    prismaStage: m.stage, manifestSha256: manifestHash, operationSha256: operationHash,
    profileSha256: profileHash, status, pid: result.pid, exitCode: result.code,
    signal: result.signal, spawnError: result.spawnError, interruption: result.interruption,
    killError: result.killError, timedOut: result.timedOut, overLimit: result.overLimit,
    teardownWarning, processDrainProof: 'UNPROVEN_FROM_CLI_EXIT',
    stdoutSha256: createHash('sha256').update(result.stdout).digest('hex'),
    stderrSha256: createHash('sha256').update(result.stderr).digest('hex'),
    boundedStdout: result.stdout.subarray(0, 16384).toString('utf8'),
    boundedStderr: result.stderr.subarray(0, 16384).toString('utf8'),
    selfCheckObservation: observed, denialOracleCount, ownedExitOracleCount, generatedFiles,
    generatedClientMetadata, postcheckFailureCategory,
    completedAt: new Date().toISOString() }
  await writeNew(path.join(receiptDir, `${stage}.result.json`), receipt)
  process.stdout.write(`${JSON.stringify({ caseId: m.caseId, stage, status,
    receipt: path.join(receiptDir, `${stage}.result.json`) })}\n`)
  if (status !== 'PASS') process.exitCode = 1
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
