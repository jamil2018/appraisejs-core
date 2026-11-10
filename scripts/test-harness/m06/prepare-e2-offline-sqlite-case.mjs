#!/usr/bin/env node
/** Prepare a fresh C1 SQLite case. This copies pinned inputs; it never imports product code. */
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const sourceRoot = path.resolve(path.dirname(script), '../../..')
const base = path.resolve(sourceRoot, '../..')
const caseBase = path.join(base, 'e2-prisma-offline')
const reviewBase = path.join(base, 'operations/e2-c1-sqlite')
const dependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const generatedRoot = path.join(base, 'e2-prisma-offline/20b046fc-c16c-4dc6-a577-72a3c276506a/mirror/node_modules/.prisma/client')
const fixtureEvidencePath = path.join(base, 'operations/e2-prisma/fresh-migrated-fixture-06430240-1.json')
const generatedEvidencePath = path.join(base, 'operations/e2-prisma/generated-client-static-inspection-20b046fc-1.json')
const generatedReviewPath = path.join(base, 'operations/e2-prisma/review-generated-static-inspection-20b046fc-1.json')
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
const evidenceHashes = Object.freeze({
  fixture: 'd83ddb951e0f0341a743c745fb3b1e310c128118b59e7524346f6e6a16d3bb28',
  generated: '66a543e5c71b41c2c77ab249431e8f2574d2299c32661e0470e2aa1531c49aa6',
  generatedReview: 'b0386be92bbfbaa70f9b826c1f1419f5c427aad1881523161faef665c30c01d8',
})
const engineHash = 'afb9cb5a12ea42caa6f6498e40e9cb75059cae17098aadcc1001c99bb262e1ee'
const hostRoots = ['/System/Volumes/Preboot/Cryptexes', '/System/Cryptexes', '/System/Library', '/usr/lib', '/usr/share', '/private/var/db/dyld', '/opt/homebrew', '/usr/local/lib']
const forbidden = /^(?:\.env(?:\..*)?|\.npmrc|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.vite|\.next)$/i
const sha = /^[a-f0-9]{64}$/
const fail = reason => { throw new Error(`E2 C1 SQLite preparation refused: ${reason}`) }
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
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.nlink !== 1 && !linkedToolInput) || await fs.realpath(file) !== file) fail('nonregular_input')
  return stat
}
const assertHash = async (file, expected) => {
  if (!sha.test(expected)) fail('hash_format')
  await regular(file)
  if (await fileHash(file) !== expected) fail('hash_mismatch')
}
const readJson = async (file, expected) => {
  await assertHash(file, expected)
  try { return JSON.parse(await fs.readFile(file, 'utf8')) } catch { fail('json') }
}
const writeNew = async (file, bytes) => {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o600 })
}
const copyNew = async (from, to, expected) => {
  await assertHash(from, expected)
  const sourceStat = await fs.stat(from)
  await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o700 })
  await fs.copyFile(from, to, constants.COPYFILE_EXCL)
  await fs.chmod(to, sourceStat.mode & 0o111 ? 0o500 : 0o400)
  await assertHash(to, expected)
  if ((await fs.stat(to)).ino === (await fs.stat(from)).ino) fail('copy_hardlink')
}
const quote = value => JSON.stringify(absolute(value))
const ancestors = value => {
  const out = []; let current = absolute(value)
  while (current !== path.dirname(current)) { out.push(current); current = path.dirname(current) }
  return [...out, '/']
}
function assertLauncher() {
  const locale = '__CF_USER_TEXT_ENCODING'
  const names = Object.keys(process.env).filter(key => key !== locale).sort()
  if (names.join(',') !== 'CI,HOME,OPENSSL_CONF,PATH,TMPDIR' || process.env.CI !== '1' ||
    process.env.OPENSSL_CONF !== '' || process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${reviewBase}/`) || !process.env.TMPDIR?.startsWith(`${reviewBase}/`) ||
    (process.env[locale] !== undefined && !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[locale]))) fail('launcher_environment')
}
function sandboxProfile(root, node, esbuild, hostFiles, hostMetadata, hostDirectories, addons) {
  const mirror = path.join(root, 'mirror'), home = path.join(root, 'home'), tmp = path.join(root, 'tmp')
  const db = path.join(root, 'fixture.sqlite'), late = path.join(root, 'c1-sqlite-test-manifest.json')
  const readTree = [mirror, home, tmp]
  const dbWrites = [db, `${db}-wal`, `${db}-shm`, `${db}-journal`]
  const readFiles = [path.join(root, 'self-check.mjs'), ...dbWrites, late]
  const metadata = [...new Set([...readTree, ...readFiles, ...dbWrites, node, ...esbuild,
    ...hostFiles, ...hostMetadata, ...hostDirectories].flatMap(ancestors))]
  return [
    '(version 1)', '(deny default)', '(deny network*)',
    '(allow sysctl-read (sysctl-name "kern.ostype" "kern.hostname" "kern.osrelease" "kern.version" "hw.machine" "hw.pagesize_compat" "hw.memsize" "hw.ncpu"))',
    '(allow signal (target same-sandbox))', '(allow process-fork)',
    `(allow process-exec (literal ${quote(node)}) ${esbuild.map(value => `(literal ${quote(value)})`).join(' ')})`,
    `(allow file-map-executable ${[node, ...esbuild, ...addons, ...hostFiles].map(value => `(literal ${quote(value)})`).join(' ')})`,
    `(allow file-read-data (literal "/") ${hostDirectories.map(value => `(literal ${quote(value)})`).join(' ')})`,
    `(allow file-read-metadata ${metadata.map(value => `(literal ${quote(value)})`).join(' ')})`,
    `(allow file-read* ${readTree.map(value => `(subpath ${quote(value)})`).join(' ')} ${[...readFiles, node, ...hostFiles].map(value => `(literal ${quote(value)})`).join(' ')})`,
    `(allow file-write* (subpath ${quote(home)}) (subpath ${quote(tmp)}) ${dbWrites.map(value => `(literal ${quote(value)})`).join(' ')})`,
  ].join('\n') + '\n'
}
const childSource = `const ignore=process.argv[2]==='ignore-term';\nprocess.on('SIGTERM',()=>{if(!ignore)process.exit(0)});\nprocess.stdout.write('READY\\n');\nsetTimeout(()=>process.exit(3),3400);\n`
function selfCheck(node, child, deniedRead) {
  return `import fs from 'node:fs';import net from 'node:net';import {spawn,spawnSync} from 'node:child_process';\n` +
    `const denial=e=>['EPERM','EACCES'].includes(e?.code)?e.code:null;\n` +
    `const r={version:'M06_E2_C1_SQLITE_SELF_CHECK_V1',read:null,exec:null,bind:null,term:null,forced:null};\n` +
    `try{fs.readFileSync(${JSON.stringify(deniedRead)})}catch(e){r.read=denial(e)}\n` +
    `try{r.exec=denial(spawnSync('/bin/echo',['inert'],{timeout:1000,stdio:['pipe','pipe','pipe']}).error)}catch(e){r.exec=denial(e)}\n` +
    `r.bind=await new Promise(resolve=>{const s=net.createServer();s.once('error',e=>resolve(denial(e)));try{s.listen(0,'127.0.0.1',()=>s.close(()=>resolve(null)))}catch(e){resolve(denial(e))}});\n` +
    `const owned=[];async function one(ignore){const c=spawn(${JSON.stringify(node)},[${JSON.stringify(child)},...(ignore?['ignore-term']:[])],{stdio:['pipe','pipe','pipe'],env:process.env});owned.push(c);c.stdin.end();` +
    `const exit=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));` +
    `await Promise.race([new Promise((resolve,reject)=>{c.once('error',reject);c.stdout.once('data',v=>v.toString()==='READY\\n'?resolve():reject(Error('READINESS_INVALID')))}),new Promise((_,reject)=>setTimeout(()=>reject(Error('READINESS_TIMEOUT')),1000))]);` +
    `if(!c.kill('SIGTERM'))throw Error('TERM_NOT_SENT');let forced=false;let result=await Promise.race([exit,new Promise(resolve=>setTimeout(()=>resolve(null),ignore?250:1000))]);` +
    `if(ignore&&result===null){forced=c.kill('SIGKILL');result=await Promise.race([exit,new Promise(resolve=>setTimeout(()=>resolve(null),700))])}` +
    `if(!result)throw Error('EXIT_TIMEOUT');return{code:result.code,signal:result.signal,termSent:true,forced}}\n` +
    `try{r.term=await one(false);r.forced=await one(true)}catch(e){r.failure=e.message;process.exitCode=7}` +
    `finally{for(const c of owned)if(c.exitCode===null&&c.signalCode===null){try{c.kill('SIGKILL')}catch{process.exitCode=7}}}` +
    `process.stdout.write(JSON.stringify(r));\n`
}
async function main() {
  if (process.platform !== 'darwin') fail('macos_only')
  assertLauncher()
  if (process.argv.length !== 4 || process.argv[2] !== '--packet') fail('args')
  const packetPath = absolute(process.argv[3])
  if (path.dirname(packetPath) !== reviewBase || !/^prepare-[A-Za-z0-9_-]+\.json$/.test(path.basename(packetPath))) fail('packet_path')
  await regular(packetPath)
  const packetBytes = await fs.readFile(packetPath)
  let p; try { p = JSON.parse(packetBytes.toString('utf8')) } catch { fail('packet_json') }
  if (packetBytes.toString('utf8') !== `${JSON.stringify(p)}\n`) fail('packet_canonical')
  const fields = ['version', 'sourceRoot', 'caseBase', 'dependencyRoot', 'sourceFiles', 'dependencyFiles',
    'dependencyAliases', 'generatedFiles', 'fixture', 'evidence', 'runtimeClosure', 'tools',
    'hostReadFiles', 'hostMetadataPaths', 'hostDirectoryReadPaths', 'hostAliasMetadata', 'versions', 'canary']
  if (!exact(p, fields) || p.version !== 'M06_E2_C1_SQLITE_PREPARE_V1' ||
    p.sourceRoot !== sourceRoot || p.caseBase !== caseBase || p.dependencyRoot !== dependencyRoot ||
    !exact(p.sourceFiles, sourcePaths) || sourcePaths.some(name => !sha.test(p.sourceFiles[name])) ||
    !exact(p.evidence, ['fixtureSha256', 'generatedSha256', 'generatedReviewSha256']) ||
    p.evidence.fixtureSha256 !== evidenceHashes.fixture || p.evidence.generatedSha256 !== evidenceHashes.generated ||
    p.evidence.generatedReviewSha256 !== evidenceHashes.generatedReview) fail('packet_scope')
  const fixtureEvidence = await readJson(fixtureEvidencePath, evidenceHashes.fixture)
  const generatedEvidence = await readJson(generatedEvidencePath, evidenceHashes.generated)
  const generatedReview = await readJson(generatedReviewPath, evidenceHashes.generatedReview)
  if (fixtureEvidence.status !== 'FRESH_MIGRATED_SYNTHETIC_SCHEMA_ONLY' ||
    generatedEvidence.status !== 'STATIC_METADATA_INSPECTED_NOT_IMPORTED_NOT_ORIGINAL_STAGE_PASS' ||
    generatedEvidence.frozenOriginalReceipt?.status !== 'FAIL' || generatedEvidence.files?.length !== 27 ||
    generatedReview.decision !== 'ACCEPT' || generatedReview.scope !== 'STATIC_OVERLAY_METADATA_ELIGIBILITY_ONLY' ||
    generatedReview.inspectionSha256 !== evidenceHashes.generated) fail('evidence_status')
  if (!exact(p.fixture, ['path', 'sha256', 'byteLength']) ||
    p.fixture.path !== fixtureEvidence.fixture.path || p.fixture.sha256 !== fixtureEvidence.fixture.sha256 ||
    p.fixture.byteLength !== fixtureEvidence.fixture.byteLength) fail('fixture_scope')
  if (!Array.isArray(p.generatedFiles) || p.generatedFiles.length !== 27 ||
    p.generatedFiles.some((item, index) => !exact(item, ['path', 'sha256']) ||
      item.path !== generatedEvidence.files[index].path || item.sha256 !== generatedEvidence.files[index].sha256) ||
    p.generatedFiles.find(item => item.path === 'libquery_engine-darwin-arm64.dylib.node')?.sha256 !== engineHash)
    fail('generated_scope')
  if (!exact(p.runtimeClosure, ['ledgerPath', 'ledgerSha256', 'reviewPath', 'reviewSha256']) ||
    p.runtimeClosure.ledgerPath !== path.join(base, 'plans/m06-e2-generated-client-runtime-closure-r2-2026-10-24.json') ||
    p.runtimeClosure.ledgerSha256 !== 'dd7e4a1e4ebcde9000f18b48b6c8fb47177565387f345f8473b98a3e3de6fccb' ||
    path.dirname(absolute(p.runtimeClosure.reviewPath)) !== reviewBase ||
    !sha.test(p.runtimeClosure.reviewSha256)) fail('runtime_closure_reference')
  await assertHash(p.runtimeClosure.ledgerPath, p.runtimeClosure.ledgerSha256)
  const closureReview = await readJson(p.runtimeClosure.reviewPath, p.runtimeClosure.reviewSha256)
  if (await fs.readFile(p.runtimeClosure.reviewPath, 'utf8') !== `${JSON.stringify(closureReview)}\n`)
    fail('runtime_closure_review_canonical')
  if (closureReview.kind !== 'GENERATED_CLIENT_RUNTIME_CLOSURE' || closureReview.decision !== 'ACCEPT' ||
    closureReview.ledgerSha256 !== p.runtimeClosure.ledgerSha256 ||
    closureReview.exactGeneratedDirectDependenciesReviewed !== true ||
    closureReview.enginePathAndLoaderReadsReviewed !== true || closureReview.hostLibraryClosureReviewed !== true ||
    closureReview.dependencyManifestSha256 !== hash(JSON.stringify(p.dependencyFiles))) fail('runtime_closure_unqualified')
  const deps = p.dependencyFiles
  if (!Array.isArray(deps) || deps.length < 8 || deps.length > 50000 ||
    deps.some(item => !exact(item, ['path', 'sha256']) || !relative(item.path).startsWith('node_modules/') ||
      item.path.startsWith('node_modules/.prisma/') || !sha.test(item.sha256)) ||
    new Set(deps.map(item => item.path)).size !== deps.length ||
    deps.some(item => item.path.startsWith('node_modules/@prisma/') ||
      item.path.startsWith('node_modules/prisma/') || item.path.startsWith('node_modules/.prisma/')) ||
    !['node_modules/vitest/vitest.mjs', 'node_modules/vitest/package.json', 'node_modules/vite/package.json',
      'node_modules/esbuild/package.json', 'node_modules/zod/package.json'].every(name =>
      deps.some(item => item.path === name))) fail('dependency_scope')
  const esbuild = deps.filter(item => /^node_modules\/(?:@esbuild\/[^/]+\/bin\/esbuild|esbuild\/bin\/esbuild)$/.test(item.path))
  if (esbuild.length < 1 || esbuild.length > 2 || new Set(esbuild.map(item => item.sha256)).size !== 1) fail('esbuild_scope')
  const addons = deps.filter(item => item.path.endsWith('.node'))
  if (addons.length !== 3 || addons.some(item => !/^node_modules\/(?:@rolldown\/binding-darwin-arm64|fsevents|lightningcss-darwin-arm64)\//.test(item.path))) fail('addon_scope')
  if (!Array.isArray(p.dependencyAliases) || p.dependencyAliases.length < 5 ||
    p.dependencyAliases.some(item => !exact(item, ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256']) ||
      !relative(item.virtualPackage).startsWith('node_modules/') || !sha.test(item.packageJsonSha256))) fail('alias_scope')
  const packageOf = name => {
    const parts = name.split('/')
    return parts[1].startsWith('@') ? parts.slice(0, 3).join('/') : parts.slice(0, 2).join('/')
  }
  const aliasesByPackage = new Map(p.dependencyAliases.map(item => [item.virtualPackage, item]))
  if (aliasesByPackage.size !== p.dependencyAliases.length ||
    new Set(deps.map(item => packageOf(item.path))).size !== aliasesByPackage.size ||
    deps.some(item => !aliasesByPackage.has(packageOf(item.path))) ||
    p.dependencyAliases.some(item =>
      deps.find(dep => dep.path === `${item.virtualPackage}/package.json`)?.sha256 !== item.packageJsonSha256))
    fail('alias_closure')
  for (const alias of p.dependencyAliases) {
    if (alias.physicalPackagePath !== path.join(dependencyRoot, alias.virtualPackage.slice(13))) fail('alias_path')
    const logical = path.join(sourceRoot, alias.virtualPackage)
    if (!(await fs.lstat(logical)).isSymbolicLink() || await fs.readlink(logical) !== alias.linkText ||
      await fs.realpath(logical) !== alias.physicalPackagePath) fail('alias_drift')
    await assertHash(path.join(alias.physicalPackagePath, 'package.json'), alias.packageJsonSha256)
  }
  if (!exact(p.tools, ['node', 'sandboxExec']) || !exact(p.tools.node, ['path', 'sha256', 'version']) ||
    !exact(p.tools.sandboxExec, ['path', 'sha256']) || p.tools.node.path !== process.execPath ||
    p.tools.node.version !== process.version || p.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_scope')
  for (const tool of Object.values(p.tools)) await assertHash(tool.path, tool.sha256)
  if (!exact(p.versions, ['vitest', 'vite', 'esbuild', 'zod']) ||
    Object.values(p.versions).some(value => !/^\d+\.\d+\.\d+$/.test(value))) fail('versions')
  if (!Array.isArray(p.hostReadFiles) || p.hostReadFiles.length > 2000 ||
    p.hostReadFiles.some(item => !exact(item, ['path', 'sha256']) || !hostPath(item.path) || !sha.test(item.sha256)) ||
    !Array.isArray(p.hostMetadataPaths) || !Array.isArray(p.hostDirectoryReadPaths) ||
    !Array.isArray(p.hostAliasMetadata) ||
    [...p.hostMetadataPaths, ...p.hostDirectoryReadPaths].some(value => !hostPath(value))) fail('host_closure')
  for (const item of p.hostReadFiles) await assertHash(item.path, item.sha256)
  for (const item of p.hostDirectoryReadPaths) if (!(await fs.stat(item)).isDirectory()) fail('host_directory')
  for (const item of p.hostAliasMetadata) {
    if (!exact(item, ['path', 'linkText', 'physicalTarget']) || !hostPath(item.path) ||
      !hostPath(item.physicalTarget) || !p.hostMetadataPaths.includes(item.path) ||
      !(await fs.lstat(item.path)).isSymbolicLink() || await fs.readlink(item.path) !== item.linkText ||
      await fs.realpath(item.path) !== item.physicalTarget) fail('host_alias')
  }
  if (!exact(p.canary, ['path', 'sha256']) || path.dirname(absolute(p.canary.path)) !== reviewBase ||
    !sha.test(p.canary.sha256)) fail('canary_scope')
  await assertHash(p.canary.path, p.canary.sha256)
  for (const name of sourcePaths) await assertHash(path.join(sourceRoot, name), p.sourceFiles[name])
  for (const item of deps) await assertHash(path.join(dependencyRoot, item.path.slice(13)), item.sha256)
  for (const name of ['vitest', 'vite', 'esbuild', 'zod']) {
    const key = name
    const packageJson = path.join(dependencyRoot, name, 'package.json')
    if (JSON.parse(await fs.readFile(packageJson, 'utf8')).version !== p.versions[key]) fail('package_version')
  }
  for (const item of p.generatedFiles) await assertHash(path.join(generatedRoot, relative(item.path)), item.sha256)
  await assertHash(p.fixture.path, p.fixture.sha256)
  if ((await fs.stat(p.fixture.path)).size !== p.fixture.byteLength) fail('fixture_length')
  await fs.mkdir(caseBase, { recursive: true, mode: 0o700 })
  if ((await fs.lstat(caseBase)).isSymbolicLink() || await fs.realpath(caseBase) !== caseBase) fail('case_base')
  const caseId = randomUUID(), caseRoot = path.join(caseBase, caseId), mirror = path.join(caseRoot, 'mirror')
  await fs.mkdir(caseRoot, { mode: 0o700 })
  for (const name of ['mirror', 'home', 'tmp', 'receipts']) await fs.mkdir(path.join(caseRoot, name), { mode: 0o700 })
  for (const name of sourcePaths) await copyNew(path.join(sourceRoot, name), path.join(mirror, name), p.sourceFiles[name])
  for (const item of deps) await copyNew(path.join(dependencyRoot, item.path.slice(13)), path.join(mirror, item.path), item.sha256)
  for (const item of p.generatedFiles) await copyNew(path.join(generatedRoot, item.path),
    path.join(mirror, 'node_modules/.prisma/client', item.path), item.sha256)
  await copyNew(p.fixture.path, path.join(caseRoot, 'fixture.sqlite'), p.fixture.sha256)
  await fs.chmod(path.join(caseRoot, 'fixture.sqlite'), 0o600)
  const config = { root: mirror, cacheDir: path.join(caseRoot, 'tmp/vite-cache'),
    resolve: { alias: { '@': path.join(mirror, 'src') } },
    test: { environment: 'node', setupFiles: [], include: [selector], fileParallelism: false,
      maxWorkers: 1, isolate: true, passWithNoTests: false } }
  await writeNew(path.join(mirror, 'vitest.e2-c1-sqlite.config.mjs'), `export default ${JSON.stringify(config)}\n`)
  await writeNew(path.join(mirror, 'package.json'), '{"name":"m06-e2-c1-sqlite-offline","private":true,"type":"module"}\n')
  const child = path.join(mirror, 'e2-c1-sqlite-signal-child.mjs')
  await writeNew(child, childSource)
  for (const name of ['vitest.e2-c1-sqlite.config.mjs', 'package.json', 'e2-c1-sqlite-signal-child.mjs'])
    await fs.chmod(path.join(mirror, name), 0o400)
  await writeNew(path.join(caseRoot, 'self-check.mjs'), selfCheck(p.tools.node.path, child, p.canary.path))
  await writeNew(path.join(caseRoot, 'sandbox.sb'), sandboxProfile(caseRoot, p.tools.node.path,
    esbuild.map(item => path.join(mirror, item.path)), p.hostReadFiles.map(item => item.path),
    p.hostMetadataPaths, p.hostDirectoryReadPaths,
    [...addons.map(item => path.join(mirror, item.path)),
      path.join(mirror, 'node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node')]))
  const generatedNames = ['mirror/vitest.e2-c1-sqlite.config.mjs', 'mirror/package.json',
    'mirror/e2-c1-sqlite-signal-child.mjs', 'self-check.mjs', 'sandbox.sb']
  const generatedHashes = Object.fromEntries(await Promise.all(generatedNames.map(async name =>
    [name, await fileHash(path.join(caseRoot, name))])))
  const env = { PATH: [path.dirname(p.tools.node.path), path.dirname(path.join(mirror, esbuild[0].path))].join(':'),
    HOME: path.join(caseRoot, 'home'), TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '',
    DATABASE_URL: `file:${path.join(caseRoot, 'fixture.sqlite')}`,
    PRISMA_QUERY_ENGINE_LIBRARY: path.join(mirror, 'node_modules/.prisma/client/libquery_engine-darwin-arm64.dylib.node'),
    M06_E2_C1_CASE_ROOT: caseRoot, M06_E2_C1_MANIFEST_SHA256: 'LATE_MANIFEST_HASH_REQUIRED' }
  const manifest = { version: 'M06_E2_C1_SQLITE_CASE_V1', caseId, caseRoot, sourceRoot, dependencyRoot,
    preparerSha256: await fileHash(script), preparePacketSha256: hash(packetBytes), sourceFiles: p.sourceFiles,
    dependencyFiles: deps, dependencyAliases: p.dependencyAliases, generatedFiles: p.generatedFiles,
    fixture: p.fixture, evidence: p.evidence, runtimeClosure: p.runtimeClosure, tools: p.tools,
    hostReadFiles: p.hostReadFiles, hostMetadataPaths: p.hostMetadataPaths,
    hostDirectoryReadPaths: p.hostDirectoryReadPaths, hostAliasMetadata: p.hostAliasMetadata,
    versions: p.versions, canary: p.canary, generatedHashes, env,
    args: ['run', '--config', 'vitest.e2-c1-sqlite.config.mjs', '--configLoader', 'native', selector],
    status: 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY' }
  await writeNew(path.join(caseRoot, 'case-manifest.json'), `${JSON.stringify(manifest)}\n`)
  process.stdout.write(`${JSON.stringify({ caseId, caseRoot,
    manifestSha256: await fileHash(path.join(caseRoot, 'case-manifest.json')) })}\n`)
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
