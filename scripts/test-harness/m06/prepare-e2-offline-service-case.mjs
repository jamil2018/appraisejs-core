#!/usr/bin/env node
/** Source-only preparer. Exact packet at B/operations/e2-service-ts/prepare-*.json.
 * It creates a new UUID case; neither tests nor product code are executed here. */
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const sourceRoot = path.resolve(path.dirname(script), '../../..')
const base = path.resolve(sourceRoot, '../..')
const caseBase = path.join(base, 'e2-service-offline')
const reviewBase = path.join(base, 'operations/e2-service-ts')
const dependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const sourcePaths = [
  "src/lib/quality-journey/provider-grant-contract.ts",
  "src/lib/quality-journey/e2-campaign-policy-contract.ts",
  "src/lib/quality-journey/provider-intent-contract.ts",
  "src/lib/quality-journey/codex-app-server/rpc-transport.ts",
  "src/lib/catalog-contracts/canonical-json.ts",
  "src/services/shared/errors.ts",
  "src/services/coordinator/quality-journey-coordinator-session.ts",
  "src/services/coordinator/quality-journey-e2-retirement-service.ts",
  "src/services/coordinator/quality-journey-e2-retirement-service.test.ts",
  "src/services/coordinator/quality-journey-e2-grant-kernel.ts",
  "src/services/coordinator/quality-journey-e2-grant-kernel.test.ts"
]
const selectors = sourcePaths.filter(v => v.endsWith('.test.ts'))
const testNamePattern = "commits one native-start reservation with final-sample/Journey-CAS adjacency|contends on the Journey version before an E2 business write and refuses after request"
const addons = Object.freeze({
  'node_modules/@rolldown/binding-darwin-arm64/rolldown-binding.darwin-arm64.node': '22ae594023af37462b204250819e86f0343a1c7b86ccc36d55eaee60062e9d3d',
  'node_modules/fsevents/fsevents.node': '40f2f51199e4f5fc46fa6b985fb3461bb63e6cd86c62bfa9bcee45ed4438d5fb',
  'node_modules/lightningcss-darwin-arm64/lightningcss.darwin-arm64.node': 'aee1601d7145d89f262d4c777f308ef06ed53046ee49b780d31a98f02db2e253',
})
const hostRoots = ['/System/Volumes/Preboot/Cryptexes', '/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld', '/System/Cryptexes', '/System/Library', '/usr/lib',
  '/usr/share', '/private/var/db/dyld', '/opt/homebrew', '/usr/local/lib']
const forbidden = /^(?:\.env(?:\..*)?|\.npmrc|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.vite|\.next)$/i
const sha = /^[a-f0-9]{64}$/
const fail = s => { throw new Error(`E2 service preparation refused: ${s}`) }
const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === expected.length && Object.keys(v).every(k => expected.includes(k))
const canonical = v => {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) fail('noncanonical_packet')
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
}
const hash = v => createHash('sha256').update(v).digest('hex')
const fileHash = file => new Promise((resolve, reject) => {
  const h = createHash('sha256'), stream = createReadStream(file)
  stream.on('data', b => h.update(b)); stream.on('error', reject)
  stream.on('end', () => resolve(h.digest('hex')))
})
const absolute = v => {
  if (typeof v !== 'string' || !path.isAbsolute(v) || path.normalize(v) !== v ||
    v.includes('\0') || /[\r\n]/.test(v)) fail('absolute_path')
  return v
}
const relative = v => {
  if (typeof v !== 'string' || !v || v.includes('\\') || v.includes('\0') ||
    path.posix.normalize(v) !== v || v.split('/').some(p => !p || p === '.' || p === '..' || forbidden.test(p)))
    fail('relative_path')
  return v
}
const hostPath = v => hostRoots.some(root => absolute(v).startsWith(`${root}/`)) &&
  !v.split('/').some(part => forbidden.test(part))
const regularTree = async (root, rel) => {
  let at = root
  const parts = relative(rel).split('/')
  for (const [i, part] of parts.entries()) {
    at = path.join(at, part)
    const s = await fs.lstat(at)
    if (s.isSymbolicLink() || (i === parts.length - 1 ? !s.isFile() : !s.isDirectory())) fail('linked_input')
  }
  return at
}
const assertHash = async (file, expected) => {
  if (!sha.test(expected)) fail('hash_format')
  const s = await fs.lstat(file)
  if (!s.isFile() || s.isSymbolicLink() || await fs.realpath(file) !== file ||
    await fileHash(file) !== expected) fail('hash_mismatch')
}
const writeNew = async (file, body, mode = 0o600) => {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await fs.writeFile(file, body, { flag: 'wx', mode })
}
const quote = v => JSON.stringify(absolute(v))
const ancestors = v => {
  const out = []; let at = absolute(v)
  while (at !== path.dirname(at)) { out.push(at); at = path.dirname(at) }
  return [...out, '/']
}
function assertLauncher() {
  const locale = '__CF_USER_TEXT_ENCODING'
  const names = Object.keys(process.env).filter(k => k !== locale).sort()
  if (names.join(',') !== 'CI,HOME,OPENSSL_CONF,PATH,TMPDIR' || process.env.CI !== '1' ||
    process.env.OPENSSL_CONF !== '' || process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${reviewBase}/`) || !process.env.TMPDIR?.startsWith(`${reviewBase}/`) ||
    (process.env[locale] !== undefined && !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[locale]))) fail('launcher_environment')
}
function profile(caseRoot, node, esbuild, hostFiles, hostMetadata, hostDirectories, nativeAddons) {
  const mirror = path.join(caseRoot, 'mirror'), home = path.join(caseRoot, 'home'), tmp = path.join(caseRoot, 'tmp')
  const readable = [mirror, home, tmp, path.join(caseRoot, 'self-check.mjs')]
  const metadata = [...new Set([...readable, node, ...esbuild, ...hostFiles, ...hostMetadata,
    ...hostDirectories].flatMap(ancestors))]
  return [
    '(version 1)', '(deny default)', '(deny network*)',
    '(allow sysctl-read (sysctl-name "kern.ostype" "kern.hostname" "kern.osrelease" "kern.version" "hw.machine" "hw.pagesize_compat" "hw.memsize" "hw.ncpu"))',
    '(allow signal (target same-sandbox))', '(allow process-fork)',
    `(allow process-exec (literal ${quote(node)}) ${esbuild.map(v => `(literal ${quote(v)})`).join(' ')})`,
    `(allow file-map-executable ${[node, ...esbuild, ...hostFiles, ...nativeAddons].map(v => `(literal ${quote(v)})`).join(' ')})`,
    `(allow file-read-data (literal "/") ${hostDirectories.map(v => `(literal ${quote(v)})`).join(' ')})`,
    `(allow file-read-metadata ${metadata.map(v => `(literal ${quote(v)})`).join(' ')})`,
    `(allow file-read* ${readable.map(v => `(subpath ${quote(v)})`).join(' ')} (literal ${quote(node)}) ${hostFiles.map(v => `(literal ${quote(v)})`).join(' ')})`,
    `(allow file-write* (subpath ${quote(home)}) (subpath ${quote(tmp)}))`,
  ].join('\n') + '\n'
}
const childSource = `const ignore=process.argv[2]==='ignore-term';\n` +
  `process.on('SIGTERM',()=>{if(!ignore)process.exit(0)});\n` +
  `process.stdout.write('READY\\n');\nsetTimeout(()=>process.exit(3),3400);\n`
function selfCheck(node, child) {
  return `import fs from 'node:fs';import net from 'node:net';import {spawn,spawnSync} from 'node:child_process';\n` +
    `const denial=e=>['EPERM','EACCES'].includes(e?.code)?e.code:null;\n` +
    `const r={version:'M06_E2_SERVICE_SELF_CHECK_V1',read:null,exec:null,bind:null,term:null,forced:null};\n` +
    `try{fs.readFileSync(${JSON.stringify(script)})}catch(e){r.read=denial(e)}\n` +
    `try{r.exec=denial(spawnSync('/bin/echo',['inert'],{timeout:1000,stdio:['pipe','pipe','pipe']}).error)}catch(e){r.exec=denial(e)}\n` +
    `r.bind=await new Promise(resolve=>{const s=net.createServer();s.once('error',e=>resolve(denial(e)));try{s.listen(0,'127.0.0.1',()=>s.close(()=>resolve(null)))}catch(e){resolve(denial(e))}});\n` +
    `const owned=[];async function one(ignore){const c=spawn(${JSON.stringify(node)},[${JSON.stringify(child)},...(ignore?['ignore-term']:[])],{stdio:['pipe','pipe','pipe'],env:process.env});owned.push(c);c.stdin.end();` +
    `let ready='';const exit=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));` +
    `await Promise.race([new Promise((resolve,reject)=>{c.once('error',reject);c.stdout.once('data',v=>{ready=v.toString();ready==='READY\\n'?resolve():reject(Error('READINESS_INVALID'))})}),new Promise((_,reject)=>setTimeout(()=>reject(Error('READINESS_TIMEOUT')),1000))]);` +
    `const termSent=c.kill('SIGTERM');if(!termSent)throw Error('TERM_NOT_SENT');` +
    `let forced=false;let result=await Promise.race([exit,new Promise(resolve=>setTimeout(()=>resolve(null),ignore?250:1000))]);` +
    `if(ignore&&result===null){forced=c.kill('SIGKILL');result=await Promise.race([exit,new Promise(resolve=>setTimeout(()=>resolve(null),700))])}` +
    `if(!result)throw Error('EXIT_TIMEOUT');return{code:result.code,signal:result.signal,termSent,forced}}\n` +
    `try{r.term=await one(false);r.forced=await one(true)}catch(e){r.failure=e.message;process.exitCode=7}` +
    `finally{for(const c of owned)if(c.exitCode===null&&c.signalCode===null){try{c.kill('SIGKILL')}catch{process.exitCode=7}}}` +
    `process.stdout.write(JSON.stringify(r));\n`
}

async function main() {
  if (process.platform !== 'darwin') fail('macos_only')
  assertLauncher()
  if (process.argv.length !== 4 || process.argv[2] !== '--packet') fail('args')
  const packetFile = absolute(process.argv[3])
  if (path.dirname(packetFile) !== reviewBase || !/^prepare-[A-Za-z0-9_-]+\.json$/.test(path.basename(packetFile))) fail('packet_path')
  const packetStat = await fs.lstat(packetFile)
  if (!packetStat.isFile() || packetStat.isSymbolicLink() || await fs.realpath(packetFile) !== packetFile) fail('packet_link')
  const packetText = await fs.readFile(packetFile, 'utf8')
  let p; try { p = JSON.parse(packetText) } catch { fail('packet_json') }
  if (canonical(p) !== packetText.trim() || !keys(p, ['version', 'sourceRoot', 'caseBase',
    'sourceFiles', 'dependencyRoot', 'dependencyAliases', 'dependencyFiles', 'hostReadFiles',
    'hostMetadataPaths', 'hostDirectoryReadPaths', 'hostAliasMetadata', 'tools', 'versions']) ||
    p.version !== 'M06_E2_SERVICE_PREPARE_V1' || p.sourceRoot !== sourceRoot ||
    p.caseBase !== caseBase || p.dependencyRoot !== dependencyRoot ||
    !keys(p.sourceFiles, sourcePaths) || sourcePaths.some(v => !sha.test(p.sourceFiles[v]))) fail('packet_scope')
  if (!Array.isArray(p.dependencyFiles) || p.dependencyFiles.length < 8 || p.dependencyFiles.length > 50000 ||
    !Array.isArray(p.dependencyAliases) || p.dependencyAliases.length < 4 || p.dependencyAliases.length > 2000)
    fail('dependency_manifest')
  const deps = p.dependencyFiles.map(v => {
    if (!keys(v, ['path', 'sha256']) || !relative(v.path).startsWith('node_modules/') || !sha.test(v.sha256)) fail('dependency_entry')
    return v
  }).sort((a, b) => a.path.localeCompare(b.path))
  const pkg = v => { const a = v.split('/'); return a[1].startsWith('@') ? a.slice(0, 3).join('/') : a.slice(0, 2).join('/') }
  const aliases = p.dependencyAliases.map(v => {
    if (!keys(v, ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256']) ||
      !relative(v.virtualPackage).startsWith('node_modules/') || pkg(`${v.virtualPackage}/package.json`) !== v.virtualPackage ||
      absolute(v.physicalPackagePath) !== path.join(dependencyRoot, v.virtualPackage.slice(13)) ||
      !sha.test(v.packageJsonSha256) || typeof v.linkText !== 'string' || v.linkText.length > 512) fail('alias_scope')
    return v
  }).sort((a, b) => a.virtualPackage.localeCompare(b.virtualPackage))
  const aliasMap = new Map(aliases.map(v => [v.virtualPackage, v]))
  if (new Set(aliases.map(v => v.virtualPackage)).size !== aliases.length ||
    new Set(deps.map(v => v.path)).size !== deps.length ||
    new Set(deps.map(v => pkg(v.path))).size !== aliases.length ||
    deps.some(v => !aliasMap.has(pkg(v.path)))) fail('alias_closure')
  for (const v of aliases) {
    const link = path.join(sourceRoot, v.virtualPackage)
    if (!(await fs.lstat(link)).isSymbolicLink() || await fs.readlink(link) !== v.linkText ||
      await fs.realpath(link) !== v.physicalPackagePath ||
      await fs.realpath(v.physicalPackagePath) !== v.physicalPackagePath) fail('alias_drift')
    await assertHash(await regularTree(v.physicalPackagePath, 'package.json'), v.packageJsonSha256)
    if (deps.find(d => d.path === `${v.virtualPackage}/package.json`)?.sha256 !== v.packageJsonSha256) fail('alias_package_hash')
  }
  for (const required of ['node_modules/vitest/vitest.mjs', 'node_modules/vitest/package.json',
    'node_modules/vite/package.json', 'node_modules/esbuild/package.json', 'node_modules/zod/package.json',
    ...Object.keys(addons)]) if (!deps.some(v => v.path === required)) fail('required_dependency')
  if (deps.filter(v => v.path.endsWith('.node')).length !== 3 ||
    Object.entries(addons).some(([name, value]) => deps.find(v => v.path === name)?.sha256 !== value)) fail('native_addon_pin')
  const esbuild = deps.filter(v => /^node_modules\/(?:@esbuild\/[^/]+\/bin\/esbuild|esbuild\/bin\/esbuild)$/.test(v.path))
  if (esbuild.length < 1 || esbuild.length > 2 || new Set(esbuild.map(v => v.sha256)).size !== 1) fail('esbuild_pin')
  if (!keys(p.tools, ['node', 'sandboxExec']) || !keys(p.tools.node, ['path', 'sha256', 'version']) ||
    !keys(p.tools.sandboxExec, ['path', 'sha256']) || p.tools.node.path !== process.execPath ||
    p.tools.node.version !== process.version || p.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_scope')
  for (const t of Object.values(p.tools)) await assertHash(t.path, t.sha256)
  if (!keys(p.versions, ['vitest', 'vite', 'esbuild', 'zod']) ||
    Object.values(p.versions).some(v => !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(v))) fail('versions')
  if (!Array.isArray(p.hostReadFiles) || p.hostReadFiles.length > 2000 ||
    !Array.isArray(p.hostMetadataPaths) || !Array.isArray(p.hostDirectoryReadPaths) ||
    !Array.isArray(p.hostAliasMetadata)) fail('host_closure')
  const hostFiles = p.hostReadFiles.map(v => {
    if (!keys(v, ['path', 'sha256']) || !hostPath(v.path) || !sha.test(v.sha256)) fail('host_file')
    return v
  })
  for (const v of hostFiles) await assertHash(v.path, v.sha256)
  for (const v of [...p.hostMetadataPaths, ...p.hostDirectoryReadPaths]) if (!hostPath(v)) fail('host_directory')
  for (const v of p.hostDirectoryReadPaths) if (!(await fs.stat(v)).isDirectory()) fail('host_directory_identity')
  for (const v of p.hostAliasMetadata) {
    if (!keys(v, ['path', 'linkText', 'physicalTarget']) || !p.hostMetadataPaths.includes(v.path) ||
      !hostPath(v.path) || !hostPath(v.physicalTarget) || !(await fs.lstat(v.path)).isSymbolicLink() ||
      await fs.readlink(v.path) !== v.linkText || await fs.realpath(v.path) !== v.physicalTarget) fail('host_alias')
  }
  for (const v of sourcePaths) await assertHash(await regularTree(sourceRoot, v), p.sourceFiles[v])
  for (const v of deps) await assertHash(await regularTree(dependencyRoot, v.path.slice(13)), v.sha256)
  for (const name of ['vitest', 'vite', 'esbuild', 'zod']) {
    const item = deps.find(v => v.path === `node_modules/${name}/package.json`)
    if (!item || JSON.parse(await fs.readFile(path.join(dependencyRoot, name, 'package.json'), 'utf8')).version !== p.versions[name]) fail('package_version')
  }
  await fs.mkdir(caseBase, { recursive: true, mode: 0o700 })
  if ((await fs.lstat(caseBase)).isSymbolicLink() || await fs.realpath(caseBase) !== caseBase) fail('case_base')
  const caseId = randomUUID(), caseRoot = path.join(caseBase, caseId), mirror = path.join(caseRoot, 'mirror')
  await fs.mkdir(caseRoot, { mode: 0o700 })
  for (const dir of [mirror, path.join(caseRoot, 'home'), path.join(caseRoot, 'tmp'), path.join(caseRoot, 'receipts')])
    await fs.mkdir(dir, { mode: 0o700 })
  for (const v of [...sourcePaths.map(name => ({ path: name, sha256: p.sourceFiles[name] })), ...deps]) {
    const from = v.path.startsWith('node_modules/') ? path.join(dependencyRoot, v.path.slice(13)) : path.join(sourceRoot, v.path)
    const to = path.join(mirror, v.path)
    await fs.mkdir(path.dirname(to), { recursive: true, mode: 0o700 })
    await fs.copyFile(from, to, constants.COPYFILE_EXCL)
    await fs.chmod(to, (await fs.stat(from)).mode & ~0o022)
    await assertHash(to, v.sha256)
  }
  const config = { root: mirror, cacheDir: path.join(caseRoot, 'tmp/vite-cache'),
    resolve: { alias: { '@': path.join(mirror, 'src') } },
    test: { testNamePattern, environment: 'node', setupFiles: [], include: selectors, fileParallelism: false,
      maxWorkers: 1, isolate: true, passWithNoTests: false } }
  await writeNew(path.join(mirror, 'vitest.e2-service.config.mjs'), `export default ${JSON.stringify(config)}\n`)
  await writeNew(path.join(mirror, 'package.json'), '{"name":"m06-e2-service-offline","private":true,"type":"module"}\n')
  const child = path.join(mirror, 'e2-service-signal-child.mjs')
  await writeNew(child, childSource)
  await writeNew(path.join(caseRoot, 'self-check.mjs'), selfCheck(p.tools.node.path, child))
  await writeNew(path.join(caseRoot, 'sandbox.sb'), profile(caseRoot, p.tools.node.path,
    esbuild.map(v => path.join(mirror, v.path)), hostFiles.map(v => v.path),
    p.hostMetadataPaths, p.hostDirectoryReadPaths, Object.keys(addons).map(v => path.join(mirror, v))))
  const generated = ['mirror/vitest.e2-service.config.mjs', 'mirror/package.json',
    'mirror/e2-service-signal-child.mjs', 'self-check.mjs', 'sandbox.sb']
  const generatedHashes = Object.fromEntries(await Promise.all(generated.map(async v => [v, await fileHash(path.join(caseRoot, v))])))
  const env = { PATH: [path.dirname(p.tools.node.path), path.dirname(path.join(mirror, esbuild[0].path))].join(':'),
    HOME: path.join(caseRoot, 'home'), TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '' }
  const manifest = { version: 'M06_E2_SERVICE_CASE_V1', caseId, caseRoot, sourceRoot, dependencyRoot,
    preparerSha256: await fileHash(script), preparePacketSha256: hash(Buffer.from(packetText)),
    sourceFiles: p.sourceFiles, dependencyAliases: aliases, dependencyFiles: deps,
    hostReadFiles: hostFiles, hostMetadataPaths: p.hostMetadataPaths,
    hostDirectoryReadPaths: p.hostDirectoryReadPaths, hostAliasMetadata: p.hostAliasMetadata,
    tools: p.tools, versions: p.versions, generatedHashes, selectors,
    args: ['run', '--config', 'vitest.e2-service.config.mjs', '--configLoader', 'native', ...selectors],
    env, status: 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY' }
  await writeNew(path.join(caseRoot, 'case-manifest.json'), `${canonical(manifest)}\n`)
  process.stdout.write(`${canonical({ caseId, caseRoot, manifestSha256: await fileHash(path.join(caseRoot, 'case-manifest.json')) })}\n`)
}
main().catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1 })
