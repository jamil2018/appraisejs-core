#!/usr/bin/env node
/**
 * Prepare one fresh, inert Prisma CLI case from an externally reviewed, exact file closure.
 * This file never invokes Prisma. A case is for exactly one of validate, generate, migrate.
 * Packet: --packet <absolute B/operations/e2-prisma/prepare-*.json>.
 * The caller must use env -i with only PATH, HOME, TMPDIR, CI and OPENSSL_CONF.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const worktree = path.resolve(path.dirname(script), '../../..')
const base = path.resolve(worktree, '../..')
const packetBase = path.join(base, 'operations/e2-prisma')
const caseBase = path.join(base, 'e2-prisma-offline')
const dependencyRoot = path.resolve(worktree, '../../../..', 'node_modules')
const schemaPath = 'prisma/schema.prisma'
const sha = /^[a-f0-9]{64}$/
// This pinned Effect module package metadata is not a credential or secret body.
const effectSecretPackage = 'node_modules/effect/Secret/package.json'
const effectSecretPackageSha256 = '05372d28b66a4398561a7110e41700ce43e6ced1c03f94fea56e5ff0c053b92f'
const forbidden = /^(?:\.env(?:\..*)?|\.npmrc|prisma\.config\..*|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.next)$/i
const hostRoots = ['/System/Cryptexes', '/System/Library', '/usr/lib', '/usr/share', '/private/var/db/dyld',
  '/System/Volumes/Preboot/Cryptexes', '/opt/homebrew', '/usr/local/lib']
const fail = reason => { throw new Error(`E2 Prisma preparation refused: ${reason}`) }
const keys = (v, expected) => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.keys(v).length === expected.length && Object.keys(v).every(k => expected.includes(k))
const canonical = v => {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype) fail('noncanonical_packet')
  return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
}
const hash = b => createHash('sha256').update(b).digest('hex')
const fileHash = file => new Promise((resolve, reject) => {
  const h = createHash('sha256')
  const stream = createReadStream(file)
  stream.on('data', chunk => h.update(chunk))
  stream.on('error', reject)
  stream.on('end', () => resolve(h.digest('hex')))
})
const absolute = value => {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value ||
    value.includes('\0') || /[\r\n]/.test(value)) fail('absolute_path')
  return value
}
const relative = value => {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') ||
    path.posix.normalize(value) !== value || value.split('/').some(p => !p || p === '.' || p === '..' || forbidden.test(p)))
    fail('relative_path')
  return value
}
const dependencyPath = (value, expectedSha256) => {
  if (value === effectSecretPackage) {
    if (expectedSha256 !== effectSecretPackageSha256) fail('effect_secret_package_hash')
    return value
  }
  return relative(value)
}
const regular = async file => {
  const s = await fs.lstat(file)
  if (!s.isFile() || s.isSymbolicLink() || await fs.realpath(file) !== file) fail('nonregular_input')
}
const regularTree = async (root, rel) => {
  let at = root
  const parts = (root === dependencyRoot && rel === effectSecretPackage.slice('node_modules/'.length) ?
    rel : relative(rel)).split('/')
  for (const [i, part] of parts.entries()) {
    at = path.join(at, part)
    const s = await fs.lstat(at)
    if (s.isSymbolicLink() || (i === parts.length - 1 ? !s.isFile() : !s.isDirectory()))
      fail('linked_input')
  }
  return at
}
const assertHash = async (file, expected) => {
  if (!sha.test(expected)) fail('hash_format')
  await regular(file)
  if (await fileHash(file) !== expected) fail('hash_mismatch')
}
const writeNew = async (file, body, mode = 0o600) => {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await fs.writeFile(file, body, { flag: 'wx', mode })
}
const quote = v => JSON.stringify(absolute(v))
const ancestors = v => {
  const out = []
  let p = absolute(v)
  while (p !== path.dirname(p)) { out.push(p); p = path.dirname(p) }
  return [...out, '/']
}
function assertLauncher() {
  const locale = '__CF_USER_TEXT_ENCODING'
  const envKeys = Object.keys(process.env).filter(k => k !== locale).sort()
  if (envKeys.join(',') !== ['CI', 'HOME', 'OPENSSL_CONF', 'PATH', 'TMPDIR'].join(',') ||
    process.env.CI !== '1' || process.env.OPENSSL_CONF !== '' ||
    process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${packetBase}/`) || !process.env.TMPDIR?.startsWith(`${packetBase}/`) ||
    (process.env[locale] !== undefined && !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[locale])))
    fail('launcher_environment')
}
function profile(caseRoot, stage, node, engine, nativeLibraries, hostFiles, hostMetadata, hostDirectories, canary) {
  const mirror = path.join(caseRoot, 'mirror')
  const home = path.join(caseRoot, 'home')
  const tmp = path.join(caseRoot, 'tmp')
  const output = path.join(mirror, 'node_modules/.prisma/client')
  const readable = [mirror, home, tmp, path.join(caseRoot, 'self-check.mjs')]
  const databaseFiles = stage === 'migrate' ? ['fixture.sqlite', 'fixture.sqlite-journal',
    'fixture.sqlite-wal', 'fixture.sqlite-shm'].map(name => path.join(caseRoot, name)) : []
  const metadata = [...new Set([...readable, node, engine, ...hostFiles, ...hostMetadata,
    ...hostDirectories, ...databaseFiles, canary].flatMap(ancestors))]
  return [
    '(version 1)', '(deny default)', '(deny network*)',
    '(allow sysctl-read (sysctl-name "kern.ostype" "kern.hostname" "kern.osrelease" "kern.version" "hw.machine" "hw.pagesize_compat" "hw.memsize" "hw.ncpu"))',
    '(allow signal (target same-sandbox))',
    '(allow process-fork)',
    `(allow process-exec (literal ${quote(node)}) (literal ${quote(engine)}))`,
    `(allow file-map-executable (literal ${quote(node)}) (literal ${quote(engine)}) ${nativeLibraries.map(f => `(literal ${quote(f)})`).join(' ')} ${hostFiles.map(f => `(literal ${quote(f)})`).join(' ')})`,
    `(allow file-read-metadata ${metadata.map(f => `(literal ${quote(f)})`).join(' ')})`,
    `(allow file-read-data (literal "/") ${hostDirectories.map(f => `(literal ${quote(f)})`).join(' ')})`,
    `(allow file-read* ${readable.map(f => `(subpath ${quote(f)})`).join(' ')} (literal ${quote(node)}) (literal ${quote(engine)}) ${hostFiles.map(f => `(literal ${quote(f)})`).join(' ')} ${databaseFiles.map(f => `(literal ${quote(f)})`).join(' ')})`,
    `(allow file-write* (subpath ${quote(home)}) (subpath ${quote(tmp)})` +
      (stage === 'generate' ? ` (subpath ${quote(output)})` : '') +
      (stage === 'migrate' ?
        ` (literal ${quote(path.join(caseRoot, 'fixture.sqlite'))}) (literal ${quote(path.join(caseRoot, 'fixture.sqlite-journal'))})` +
        ` (literal ${quote(path.join(caseRoot, 'fixture.sqlite-wal'))}) (literal ${quote(path.join(caseRoot, 'fixture.sqlite-shm'))})` : '') + ')',
  ].join('\n') + '\n'
}
const childSource = `const ignore=process.argv[2]==='ignore-term';\n` +
  `process.on('SIGTERM',()=>{if(!ignore)process.exit(0)});\n` +
  `process.stdout.write('READY\\n');\nsetTimeout(()=>process.exit(3),3400);\n`
function selfCheck(canary, node, child) {
  return `import fs from 'node:fs';\nimport net from 'node:net';\nimport { spawn, spawnSync } from 'node:child_process';\n` +
    `const denial = e => ['EPERM','EACCES'].includes(e?.code) ? e.code : null;\n` +
    `const observed = {version:'M06_E2_PRISMA_SELF_CHECK_V2',read:null,exec:null,bind:null,term:null,forced:null};\n` +
    `try { fs.readFileSync(${JSON.stringify(canary)}); } catch(e) { observed.read=denial(e); }\n` +
    `try { observed.exec=denial(spawnSync('/bin/echo',['inert'],{timeout:1000,stdio:['pipe','pipe','pipe']}).error); } catch(e) { observed.exec=denial(e); }\n` +
    `observed.bind=await new Promise(resolve=>{ const s=net.createServer(); s.once('error',e=>resolve(denial(e))); try { s.listen(0,'127.0.0.1',()=>s.close(()=>resolve(null))); } catch(e) { resolve(denial(e)); } });\n` +
    `const owned=[];async function one(ignore){const c=spawn(${JSON.stringify(node)},[${JSON.stringify(child)},...(ignore?['ignore-term']:[])],{stdio:['pipe','pipe','pipe'],env:process.env});owned.push(c);c.stdin.end();` +
    `const exit=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));` +
    `await Promise.race([new Promise((resolve,reject)=>{c.once('error',reject);c.stdout.once('data',v=>v.toString()==='READY\\n'?resolve():reject(Error('READINESS_INVALID')))}),new Promise((_,reject)=>setTimeout(()=>reject(Error('READINESS_TIMEOUT')),1000))]);` +
    `const termSent=c.kill('SIGTERM');if(!termSent)throw Error('TERM_NOT_SENT');` +
    `let forced=false;let result=await Promise.race([exit,new Promise(resolve=>setTimeout(()=>resolve(null),ignore?250:1000))]);` +
    `if(ignore&&result===null){forced=c.kill('SIGKILL');result=await Promise.race([exit,new Promise(resolve=>setTimeout(()=>resolve(null),700))])}` +
    `if(!result)throw Error('EXIT_TIMEOUT');return{code:result.code,signal:result.signal,termSent,forced}}\n` +
    `try{observed.term=await one(false);observed.forced=await one(true)}catch(e){observed.failure=e.message;process.exitCode=7}` +
    `finally{for(const c of owned)if(c.exitCode===null&&c.signalCode===null){try{c.kill('SIGKILL')}catch{process.exitCode=7}}}` +
    `process.stdout.write(JSON.stringify(observed));\n`
}

async function main() {
  if (process.platform !== 'darwin') fail('macos_only')
  assertLauncher()
  if (process.argv.length !== 4 || process.argv[2] !== '--packet') fail('args')
  const packetPath = absolute(process.argv[3])
  if (path.dirname(packetPath) !== packetBase || !/^prepare-[A-Za-z0-9_-]+\.json$/.test(path.basename(packetPath))) fail('packet_location')
  await regular(packetPath)
  const text = await fs.readFile(packetPath, 'utf8')
  let p
  try { p = JSON.parse(text) } catch { fail('packet_json') }
  if (canonical(p) !== text.trim() || !keys(p, ['version', 'stage', 'sourceRoot', 'dependencyRoot',
    'schemaSha256', 'migrationFiles', 'dependencyFiles', 'tools', 'hostReadFiles', 'hostMetadataPaths',
    'hostDirectoryReadPaths', 'hostAliasMetadata']) || p.version !== 'M06_E2_PRISMA_PREPARE_V1' ||
    !['validate', 'generate', 'migrate'].includes(p.stage) || p.sourceRoot !== worktree ||
    p.dependencyRoot !== dependencyRoot || !sha.test(p.schemaSha256)) fail('packet_scope')
  if (!Array.isArray(p.migrationFiles) || p.migrationFiles.length > 2000 ||
    (p.stage === 'migrate' ? p.migrationFiles.length < 2 : p.migrationFiles.length !== 0)) fail('migration_scope')
  const migrations = p.migrationFiles.map(v => {
    if (!keys(v, ['path', 'sha256']) || !relative(v.path).startsWith('prisma/migrations/') || !sha.test(v.sha256)) fail('migration_entry')
    return v
  })
  if (p.stage === 'migrate' && !migrations.some(v => v.path === 'prisma/migrations/migration_lock.toml')) fail('migration_lock')
  if (!Array.isArray(p.dependencyFiles) || p.dependencyFiles.length < 8 || p.dependencyFiles.length > 50_000) fail('dependency_scope')
  const dependencies = p.dependencyFiles.map(v => {
    if (!keys(v, ['path', 'sha256']) || !dependencyPath(v.path, v.sha256).startsWith('node_modules/') || !sha.test(v.sha256) ||
      v.path.startsWith('node_modules/.prisma/')) fail('dependency_entry')
    return v
  })
  const required = ['node_modules/prisma/build/index.js', 'node_modules/prisma/package.json',
    'node_modules/@prisma/client/generator-build/index.js', 'node_modules/@prisma/client/package.json',
    'node_modules/@prisma/engines/schema-engine-darwin-arm64',
    'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node']
  if (required.some(r => !dependencies.some(v => v.path === r)) ||
    new Set([...dependencies, ...migrations].map(v => v.path)).size !== dependencies.length + migrations.length)
    fail('closure_required_or_duplicate')
  if (!keys(p.tools, ['node', 'sandboxExec']) || !keys(p.tools.node, ['path', 'sha256', 'version']) ||
    !keys(p.tools.sandboxExec, ['path', 'sha256']) || p.tools.node.path !== process.execPath ||
    p.tools.node.version !== process.version || p.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_scope')
  for (const tool of Object.values(p.tools)) await assertHash(absolute(tool.path), tool.sha256)
  if (!Array.isArray(p.hostReadFiles) || p.hostReadFiles.length > 2000 || !Array.isArray(p.hostMetadataPaths) ||
    !Array.isArray(p.hostDirectoryReadPaths) || !Array.isArray(p.hostAliasMetadata)) fail('host_closure')
  const safeHost = v => hostRoots.some(root => absolute(v).startsWith(`${root}/`)) &&
    !v.split('/').some(part => forbidden.test(part))
  const hostFiles = p.hostReadFiles.map(v => {
    if (!keys(v, ['path', 'sha256']) || !safeHost(v.path)) fail('host_file')
    return v
  })
  for (const v of hostFiles) await assertHash(v.path, v.sha256)
  for (const v of [...p.hostMetadataPaths, ...p.hostDirectoryReadPaths])
    if (!safeHost(v)) fail('host_directory')
  for (const v of p.hostDirectoryReadPaths)
    if (!(await fs.stat(v)).isDirectory()) fail('host_directory_identity')
  for (const v of p.hostAliasMetadata) {
    if (!keys(v, ['path', 'linkText', 'physicalTarget']) || !p.hostMetadataPaths.includes(v.path) ||
      !safeHost(v.path) || !safeHost(v.physicalTarget) ||
      !(await fs.lstat(absolute(v.path))).isSymbolicLink() || await fs.readlink(v.path) !== v.linkText ||
      await fs.realpath(v.path) !== absolute(v.physicalTarget)) fail('host_alias')
  }
  if (await fs.realpath(dependencyRoot) !== dependencyRoot || (await fs.lstat(dependencyRoot)).isSymbolicLink()) fail('dependency_root')
  await assertHash(await regularTree(worktree, schemaPath), p.schemaSha256)
  for (const v of migrations) await assertHash(await regularTree(worktree, v.path), v.sha256)
  for (const v of dependencies) await assertHash(await regularTree(dependencyRoot, v.path.slice('node_modules/'.length)), v.sha256)
  // The four source-verified artifacts are pinned independently of a packet's claimed closure.
  const pinned = {
    'node_modules/prisma/build/index.js': 'c2a77456b70e8ba1e640e122824ed694433828a7c0d76ff3db7fc376b4b0e1a0',
    'node_modules/@prisma/client/generator-build/index.js': 'b504707b44017c90f90bd74b9eddeb0d07bd13491bbb33e29ef2c3d9d898121c',
    'node_modules/@prisma/engines/schema-engine-darwin-arm64': 'caa2cf90d5b2cfe6cc06e47974f7e3275dd395b4d35cf140d5d4b2362c3b5bb1',
    'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node': 'afb9cb5a12ea42caa6f6498e40e9cb75059cae17098aadcc1001c99bb262e1ee',
  }
  if (Object.entries(pinned).some(([name, expected]) => dependencies.find(v => v.path === name)?.sha256 !== expected)) fail('pinned_artifact')
  for (const [name, version] of [['prisma', '6.19.3'], ['@prisma/client', '6.19.3']]) {
    const file = path.join(dependencyRoot, name, 'package.json')
    if (JSON.parse(await fs.readFile(file, 'utf8')).version !== version) fail('package_version')
  }
  const original = await fs.readFile(path.join(worktree, schemaPath), 'utf8')
  const generator = 'generator client {\n  provider = "prisma-client-js"\n}'
  if (!original.startsWith(generator) || original.indexOf(generator, generator.length) !== -1 ||
    /\boutput\s*=/.test(original.slice(0, original.indexOf('datasource db')))) fail('schema_overlay_anchor')
  const overlay = original.replace(generator, 'generator client {\n  provider = "prisma-client-js"\n  output   = "../node_modules/.prisma/client"\n}')
  await fs.mkdir(caseBase, { recursive: true, mode: 0o700 })
  if (await fs.realpath(caseBase) !== caseBase || (await fs.lstat(caseBase)).isSymbolicLink()) fail('case_base')
  const caseId = randomUUID()
  const caseRoot = path.join(caseBase, caseId)
  await fs.mkdir(caseRoot, { mode: 0o700 })
  const mirror = path.join(caseRoot, 'mirror')
  for (const dir of [mirror, path.join(caseRoot, 'home'), path.join(caseRoot, 'tmp'),
    path.join(caseRoot, 'receipts'), path.join(mirror, 'node_modules/.prisma/client')])
    await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  for (const v of [...dependencies, ...migrations]) {
    const source = v.path.startsWith('node_modules/') ?
      path.join(dependencyRoot, v.path.slice('node_modules/'.length)) : path.join(worktree, v.path)
    const dest = path.join(mirror, v.path)
    await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 })
    await fs.copyFile(source, dest, constants.COPYFILE_EXCL)
    await fs.chmod(dest, (await fs.stat(source)).mode & 0o755)
    await assertHash(dest, v.sha256)
  }
  await writeNew(path.join(mirror, schemaPath), overlay)
  await writeNew(path.join(mirror, 'package.json'), '{"name":"m06-e2-prisma-offline","private":true,"version":"0.0.0"}\n')
  const canary = path.join(packetBase, `canary-${caseId}.txt`)
  await writeNew(canary, `M06_E2_PRISMA_CANARY_${caseId}\n`)
  const child = path.join(mirror, 'e2-prisma-signal-child.mjs')
  await writeNew(child, childSource)
  await writeNew(path.join(caseRoot, 'self-check.mjs'), selfCheck(canary, p.tools.node.path, child))
  const engine = path.join(mirror, 'node_modules/@prisma/engines/schema-engine-darwin-arm64')
  const nativeLibraries = dependencies.filter(v => /\.(?:node|dylib)$/.test(v.path)).map(v => path.join(mirror, v.path))
  await writeNew(path.join(caseRoot, 'sandbox.sb'), profile(caseRoot, p.stage, p.tools.node.path, engine, nativeLibraries,
    hostFiles.map(v => v.path), p.hostMetadataPaths, p.hostDirectoryReadPaths, canary))
  const generated = ['mirror/prisma/schema.prisma', 'mirror/package.json',
    'mirror/e2-prisma-signal-child.mjs', 'self-check.mjs', 'sandbox.sb']
  const generatedHashes = Object.fromEntries(await Promise.all(generated.map(async name => [name, await fileHash(path.join(caseRoot, name))])))
  const manifest = {
    version: 'M06_E2_PRISMA_CASE_V1', caseId, caseRoot, stage: p.stage, sourceRoot: worktree,
    preparerSha256: await fileHash(script), preparePacketSha256: hash(Buffer.from(text)),
    schemaSha256: p.schemaSha256, migrationFiles: migrations, dependencyRoot,
    dependencyFiles: dependencies, tools: p.tools, hostReadFiles: hostFiles,
    hostMetadataPaths: p.hostMetadataPaths, hostDirectoryReadPaths: p.hostDirectoryReadPaths,
    hostAliasMetadata: p.hostAliasMetadata, canary: { path: canary, sha256: await fileHash(canary) },
    generatedHashes, args: p.stage === 'migrate' ? ['migrate', 'deploy', '--schema', path.join(mirror, schemaPath)] :
      [p.stage, '--schema', path.join(mirror, schemaPath)],
    env: { PATH: path.dirname(p.tools.node.path), HOME: path.join(caseRoot, 'home'),
      TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '', CHECKPOINT_DISABLE: '1',
      PRISMA_GENERATE_SKIP_AUTOINSTALL: '1', PRISMA_CLI_QUERY_ENGINE_TYPE: 'library',
      PRISMA_SCHEMA_ENGINE_BINARY: engine,
      PRISMA_QUERY_ENGINE_LIBRARY: path.join(mirror, 'node_modules/@prisma/engines/libquery_engine-darwin-arm64.dylib.node'),
      DATABASE_URL: `file:${path.join(caseRoot, 'fixture.sqlite')}` },
    status: 'PREPARED_UNREVIEWED_NO_EXECUTION_AUTHORITY',
  }
  await writeNew(path.join(caseRoot, 'case-manifest.json'), `${canonical(manifest)}\n`)
  process.stdout.write(`${canonical({ caseId, caseRoot, manifestSha256: await fileHash(path.join(caseRoot, 'case-manifest.json')) })}\n`)
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
