#!/usr/bin/env node
/**
 * E2 pure-TS case preparation only. This script copies an explicit reviewed file closure;
 * it does not run Vitest, import product modules, inspect a DB, or certify confinement.
 * Invocation: node prepare-e2-offline-case.mjs --packet /absolute/reviewed-packet.json
 * Caller must use a reviewed env -i launch with exactly PATH, fresh HOME/TMPDIR and CI=1.
 * The new case is never reopened or deleted by this preparer.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const sourceRoot = path.resolve(path.dirname(scriptPath), '../../..')
const physicalDependencyRoot = path.resolve(sourceRoot, '../../../..', 'node_modules')
const caseBase = path.resolve(sourceRoot, '../..', 'e2-offline')
const packetBase = path.resolve(sourceRoot, '../..', 'operations', 'e2-pure-ts')
const launcherEnvKeys = ['PATH', 'HOME', 'TMPDIR', 'CI', 'OPENSSL_CONF']
// CoreFoundation may add this locale value after env -i, before Node enters this script.
const cfLocaleKey = '__CF_USER_TEXT_ENCODING'
const sourcePaths = Object.freeze([
  'src/lib/quality-journey/provider-grant-contract.ts',
  'src/lib/quality-journey/provider-grant-contract.test.ts',
  'src/lib/quality-journey/codex-app-server/native-e2-private-protocol.ts',
  'src/lib/quality-journey/codex-app-server/native-e2-private-protocol.test.ts',
])
const testPaths = sourcePaths.filter(item => item.endsWith('.test.ts'))
const shaPattern = /^[a-f0-9]{64}$/
const forbiddenPart = /^(?:\.env(?:\..*)?|\.npmrc|\.git|\.appraisejs|auth|credentials?|secrets?|fixtures?|testdata|\.cache|\.vite|\.next)$/i
const hostFileRoots = ['/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld', '/System/Library', '/usr/lib', '/usr/share', '/private/var/db/dyld',
  '/opt/homebrew', '/usr/local/lib']
const fail = reason => { throw new Error(`E2 pure case preparation refused: ${reason}`) }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
const canonical = value => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) fail('noncanonical_packet')
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
const digest = value => createHash('sha256').update(value).digest('hex')
const fileDigest = async file => new Promise((resolve, reject) => {
  const hash = createHash('sha256')
  const stream = createReadStream(file)
  stream.on('data', chunk => hash.update(chunk))
  stream.on('error', reject)
  stream.on('end', () => resolve(hash.digest('hex')))
})
const safeRelative = (relative, prefix) => {
  if (typeof relative !== 'string' || !relative.startsWith(prefix) || relative.includes('\\') ||
    relative.includes('\0') || path.posix.normalize(relative) !== relative ||
    relative.split('/').some(part => !part || part === '.' || part === '..' || forbiddenPart.test(part)))
    fail('unsafe_input_path')
  return relative
}
const packagePrefix = relative => {
  const parts = relative.split('/')
  if (parts[0] !== 'node_modules' || parts.length < 3) fail('dependency_package_path')
  return parts[1].startsWith('@') ? parts.slice(0, 3).join('/') : parts.slice(0, 2).join('/')
}
const safeAbsolute = value => {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') ||
    /[\r\n]/.test(value) || path.normalize(value) !== value) fail('unsafe_absolute_path')
  return value
}
const assertLauncherEnvironment = () => {
  const keys = Object.keys(process.env).filter(key => key !== cfLocaleKey)
  if ((process.env[cfLocaleKey] !== undefined &&
      !/^(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+):(?:0x[0-9a-f]+|\d+)$/i.test(process.env[cfLocaleKey])) ||
    keys.sort().join(',') !== [...launcherEnvKeys].sort().join(',') ||
    process.env.OPENSSL_CONF !== '' || process.env.CI !== '1' || process.env.PATH !== `${path.dirname(process.execPath)}:/usr/bin` ||
    !process.env.HOME?.startsWith(`${packetBase}${path.sep}`) ||
    !process.env.TMPDIR?.startsWith(`${packetBase}${path.sep}`) ||
    !path.isAbsolute(process.env.HOME) || !path.isAbsolute(process.env.TMPDIR))
    fail('launcher_environment')
}
const regularNoLinks = async (root, relative) => {
  let at = root
  for (const [index, part] of relative.split('/').entries()) {
    at = path.join(at, part)
    const stat = await fs.lstat(at)
    if (stat.isSymbolicLink() || (index === relative.split('/').length - 1 ? !stat.isFile() : !stat.isDirectory()))
      fail('symlink_or_nonregular_input')
  }
  return at
}
const isRegularHostFile = async file => {
  const stat = await fs.lstat(file)
  return stat.isFile() && !stat.isSymbolicLink()
}
const writeNew = async (file, body, mode = 0o600) => {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await fs.writeFile(file, body, { flag: 'wx', mode })
}
const quote = value => JSON.stringify(safeAbsolute(value))
const ancestors = value => {
  const output = []
  let current = safeAbsolute(value)
  while (current !== path.dirname(current)) { output.push(current); current = path.dirname(current) }
  return [...output, '/']
}

const selfCheckSource = `import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as net from 'node:net';
const denial = error => error?.code === 'EPERM' || error?.code === 'EACCES' ? error.code : null;
const result = { version: 'M06_E2_SANDBOX_SELF_CHECK_V1', readErrorCode: null, execErrorCode: null, bindErrorCode: null };
try { fs.readFileSync(${JSON.stringify(scriptPath)}); } catch (error) { result.readErrorCode = denial(error); }
try { const child = spawnSync('/bin/echo', ['inert'], { timeout: 1500 }); result.execErrorCode = denial(child.error); }
catch (error) { result.execErrorCode = denial(error); }
result.bindErrorCode = await new Promise(resolve => {
  const server = net.createServer();
  server.once('error', error => resolve(denial(error)));
  try { server.listen(0, '127.0.0.1', () => server.close(() => resolve(null))); }
  catch (error) { resolve(denial(error)); }
});
process.stdout.write(JSON.stringify(result));
if (!result.readErrorCode || !result.execErrorCode || !result.bindErrorCode) process.exitCode = 7;
`

function sandboxProfile(caseRoot, nodePath, esbuildPaths, hostReadFiles, hostMetadataPaths, hostDirectoryReadPaths, nativeAddonPaths) {
  // A deny-default SBPL candidate. Effective denial must be proved by the host before test entry.
  const readRoots = [path.join(caseRoot, 'mirror'), path.join(caseRoot, 'home'),
    path.join(caseRoot, 'tmp'), path.join(caseRoot, 'self-check.mjs')]
  const metadataPaths = new Set([...readRoots, nodePath, ...hostReadFiles, ...hostMetadataPaths, ...hostDirectoryReadPaths]
    .flatMap(ancestors))
  const lines = ['(version 1)', '(deny default)', '(deny network*)',
    '(allow sysctl-read (sysctl-name \"kern.ostype\" \"kern.hostname\" \"kern.osrelease\" \"kern.version\" \"hw.machine\" \"hw.pagesize_compat\" \"hw.memsize\" \"hw.ncpu\"))',
    `(allow file-read-data (literal \"/\") ${hostDirectoryReadPaths.map(item => `(literal ${quote(item)})`).join(' ')})`,
    `(allow file-map-executable ${[nodePath, ...esbuildPaths, ...hostReadFiles, ...nativeAddonPaths].map(item => `(literal ${quote(item)})`).join(' ')})`,
    '(allow process-fork)', `(allow process-exec (literal ${quote(nodePath)})${esbuildPaths.map(item => ` (literal ${quote(item)})`).join('')})`,
    `(allow file-read-metadata ${[...metadataPaths].map(item => `(literal ${quote(item)})`).join(' ')})`,
    `(allow file-read* ${readRoots.map(item => `(subpath ${quote(item)})`).join(' ')} (literal ${quote(nodePath)})` +
      ` ${hostReadFiles.map(item => `(literal ${quote(item)})`).join(' ')})`,
    `(allow file-write* (subpath ${quote(path.join(caseRoot, 'home'))}) (subpath ${quote(path.join(caseRoot, 'tmp'))}))`,
  ]
  return `${lines.join('\n')}\n`
}

async function main() {
  if (process.platform !== 'darwin') fail('macos_only_profile')
  assertLauncherEnvironment()
  if (process.argv.length !== 4 || process.argv[2] !== '--packet') fail('args')
  const packetPath = safeAbsolute(process.argv[3])
  if (!packetPath.startsWith(`${packetBase}${path.sep}`) || !/^prepare-[A-Za-z0-9_-]+\.json$/.test(path.basename(packetPath)))
    fail('packet_location')
  if (await fs.realpath(packetPath) !== packetPath) fail('packet_link')
  const packetText = await fs.readFile(packetPath, 'utf8')
  let packet
  try { packet = JSON.parse(packetText) } catch { fail('packet_json') }
  if (canonical(packet) !== packetText.trim() || !exactKeys(packet, [
    'version', 'sourceRoot', 'caseBase', 'sourceFiles', 'dependencyRoot', 'dependencyAliases',
    'dependencyFiles', 'hostReadFiles', 'hostMetadataPaths', 'hostDirectoryReadPaths', 'hostAliasMetadata', 'tools', 'versions',
  ]) || packet.version !== 'M06_E2_PURE_TS_PREPARE_V1' || packet.sourceRoot !== sourceRoot ||
    packet.caseBase !== caseBase || packet.dependencyRoot !== physicalDependencyRoot) fail('packet_scope')
  if (!exactKeys(packet.sourceFiles, sourcePaths) || !sourcePaths.every(item => shaPattern.test(packet.sourceFiles[item])))
    fail('source_hash_manifest')
  if (!Array.isArray(packet.dependencyFiles) || packet.dependencyFiles.length < 4 ||
    packet.dependencyFiles.length > 50_000 || !packet.dependencyFiles.every(item =>
      exactKeys(item, ['path', 'sha256']) && shaPattern.test(item.sha256))) fail('dependency_manifest')
  if (!Array.isArray(packet.dependencyAliases) || packet.dependencyAliases.length < 3 ||
    packet.dependencyAliases.length > 2_000 || !packet.dependencyAliases.every(item =>
      exactKeys(item, ['virtualPackage', 'linkText', 'physicalPackagePath', 'packageJsonSha256']) &&
      typeof item.linkText === 'string' && item.linkText.length > 0 && item.linkText.length <= 512 &&
      shaPattern.test(item.packageJsonSha256))) fail('dependency_alias_manifest')
  if (!Array.isArray(packet.hostReadFiles) || packet.hostReadFiles.length > 2_000 ||
    !packet.hostReadFiles.every(item => exactKeys(item, ['path', 'sha256']) &&
      typeof item.path === 'string' && hostFileRoots.some(root => item.path.startsWith(`${root}/`)) &&
      !item.path.split('/').some(part => forbiddenPart.test(part)) && shaPattern.test(item.sha256)))
    fail('host_file_manifest')
  const safeLoaderPath = value => {
    safeAbsolute(value)
    if (!['/opt/homebrew/', '/System/Cryptexes/', '/System/Volumes/Preboot/Cryptexes/'].some(root => value.startsWith(root)) ||
      value.split('/').some(part => forbiddenPart.test(part))) fail('loader_path_scope')
    return value
  }
  for (const field of ['hostMetadataPaths', 'hostDirectoryReadPaths']) {
    if (!Array.isArray(packet[field]) || packet[field].length > 1000 ||
      new Set(packet[field]).size !== packet[field].length) fail('loader_path_manifest')
    packet[field].forEach(safeLoaderPath)
  }
  for (const directory of packet.hostDirectoryReadPaths) {
    if (!(await fs.stat(directory)).isDirectory()) fail('loader_directory_identity')
  }
  if (!Array.isArray(packet.hostAliasMetadata) || packet.hostAliasMetadata.length > 1000) fail('loader_alias_manifest')
  for (const alias of packet.hostAliasMetadata) {
    if (!exactKeys(alias, ['path', 'linkText', 'physicalTarget']) || !packet.hostMetadataPaths.includes(alias.path) ||
      typeof alias.linkText !== 'string' || !(await fs.lstat(safeLoaderPath(alias.path))).isSymbolicLink() ||
      await fs.readlink(alias.path) !== alias.linkText || await fs.realpath(alias.path) !== safeLoaderPath(alias.physicalTarget))
      fail('loader_alias_identity')
  }
  if (!exactKeys(packet.tools, ['node', 'sandboxExec']) ||
    !exactKeys(packet.tools.node, ['path', 'sha256', 'version']) ||
    !exactKeys(packet.tools.sandboxExec, ['path', 'sha256']) ||
    !exactKeys(packet.versions, ['vitest', 'vite', 'esbuild'])) fail('tool_manifest')
  for (const value of Object.values(packet.versions)) if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(value)) fail('tool_version')
  if (safeAbsolute(packet.tools.node.path) !== process.execPath ||
    packet.tools.node.version !== process.version ||
    packet.tools.sandboxExec.path !== '/usr/bin/sandbox-exec') fail('tool_identity')
  for (const tool of Object.values(packet.tools)) {
    if (!shaPattern.test(tool.sha256) || !(await fs.lstat(tool.path)).isFile() ||
      (await fs.lstat(tool.path)).isSymbolicLink() || await fileDigest(tool.path) !== tool.sha256)
      fail('tool_hash')
  }
  const dependencies = packet.dependencyFiles.map(item => ({
    path: safeRelative(item.path, 'node_modules/'), sha256: item.sha256,
  })).sort((a, b) => a.path.localeCompare(b.path))
  if (new Set(dependencies.map(item => item.path)).size !== dependencies.length) fail('duplicate_dependency')
  if ((await fs.lstat(physicalDependencyRoot)).isSymbolicLink() ||
    await fs.realpath(physicalDependencyRoot) !== physicalDependencyRoot) fail('dependency_root_link')
  const aliases = packet.dependencyAliases.map(item => {
    const virtualPackage = safeRelative(item.virtualPackage, 'node_modules/')
    if (packagePrefix(`${virtualPackage}/package.json`) !== virtualPackage) fail('alias_package')
    const physicalPackagePath = safeAbsolute(item.physicalPackagePath)
    if (physicalPackagePath !== path.join(physicalDependencyRoot, virtualPackage.slice('node_modules/'.length)))
      fail('alias_target')
    return { virtualPackage, linkText: item.linkText, physicalPackagePath,
      packageJsonSha256: item.packageJsonSha256 }
  }).sort((a, b) => a.virtualPackage.localeCompare(b.virtualPackage))
  const aliasByPackage = new Map(aliases.map(item => [item.virtualPackage, item]))
  if (new Set(aliases.map(item => item.virtualPackage)).size !== aliases.length ||
    new Set(dependencies.map(item => packagePrefix(item.path))).size !== aliases.length ||
    dependencies.some(item => !aliasByPackage.has(packagePrefix(item.path))))
    fail('alias_closure')
  for (const alias of aliases) {
    const link = path.join(sourceRoot, alias.virtualPackage)
    const stat = await fs.lstat(link)
    const physical = await fs.lstat(alias.physicalPackagePath)
    if (!stat.isSymbolicLink() || await fs.readlink(link) !== alias.linkText ||
      await fs.realpath(link) !== alias.physicalPackagePath || !physical.isDirectory() ||
      physical.isSymbolicLink() || await fs.realpath(alias.physicalPackagePath) !== alias.physicalPackagePath)
      fail('alias_metadata_or_package_hash')
    const packageJson = await regularNoLinks(alias.physicalPackagePath, 'package.json')
    if (await fileDigest(packageJson) !== alias.packageJsonSha256) fail('alias_metadata_or_package_hash')
    const packageEntry = dependencies.find(item => item.path === `${alias.virtualPackage}/package.json`)
    if (!packageEntry || packageEntry.sha256 !== alias.packageJsonSha256) fail('alias_package_manifest')
  }
  for (const required of ['node_modules/vitest/vitest.mjs', 'node_modules/vitest/package.json',
    'node_modules/vite/package.json', 'node_modules/esbuild/package.json'])
    if (!dependencies.some(item => item.path === required)) fail('missing_tool_dependency')
  const esbuildPaths = dependencies.filter(item => /^node_modules\/(?:@esbuild\/[^/]+\/bin\/esbuild|esbuild\/bin\/esbuild)$/.test(item.path))
  // npm can install the same native executable at both its package and platform paths.
  if (esbuildPaths.length < 1 || esbuildPaths.length > 2 ||
    new Set(esbuildPaths.map(item => item.sha256)).size !== 1) fail('esbuild_binary_closure')
  const hostReadFiles = packet.hostReadFiles.map(item => ({ path: safeAbsolute(item.path), sha256: item.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path))
  if (new Set(hostReadFiles.map(item => item.path)).size !== hostReadFiles.length) fail('duplicate_host_file')
  for (const item of hostReadFiles) {
    if (await fs.realpath(item.path) !== item.path || !await isRegularHostFile(item.path) ||
      await fileDigest(item.path) !== item.sha256) fail('host_file_hash')
  }
  const dependencySource = relative => {
    const alias = aliasByPackage.get(packagePrefix(relative))
    if (!alias) fail('dependency_alias_missing')
    return { root: alias.physicalPackagePath,
      relative: relative.slice(alias.virtualPackage.length + 1) }
  }
  for (const entry of sourcePaths.map(item => ({ path: item, sha256: packet.sourceFiles[item] }))) {
    const file = await regularNoLinks(sourceRoot, entry.path)
    if (await fileDigest(file) !== entry.sha256) fail(`input_hash:${entry.path}`)
  }
  for (const entry of dependencies) {
    const from = dependencySource(entry.path)
    const file = await regularNoLinks(from.root, from.relative)
    if (await fileDigest(file) !== entry.sha256) fail(`input_hash:${entry.path}`)
  }
  for (const name of ['vitest', 'vite', 'esbuild']) {
    const relative = `node_modules/${name}/package.json`
    const from = dependencySource(relative)
    const body = await fs.readFile(path.join(from.root, from.relative), 'utf8')
    if (JSON.parse(body).version !== packet.versions[name]) fail('package_version')
  }

  await fs.mkdir(caseBase, { recursive: true, mode: 0o700 })
  if ((await fs.lstat(caseBase)).isSymbolicLink() || await fs.realpath(caseBase) !== caseBase) fail('case_base_link')
  const caseId = randomUUID()
  const caseRoot = path.join(caseBase, caseId)
  await fs.mkdir(caseRoot, { mode: 0o700 }) // exclusive; never use an existing case
  const mirror = path.join(caseRoot, 'mirror')
  await fs.mkdir(mirror, { mode: 0o700 })
  for (const entry of [...sourcePaths.map(item => ({ path: item, sha256: packet.sourceFiles[item] })), ...dependencies]) {
    const target = path.join(mirror, entry.path)
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
    const from = entry.path.startsWith('node_modules/') ? dependencySource(entry.path) :
      { root: sourceRoot, relative: entry.path }
    const original = path.join(from.root, from.relative)
    await fs.copyFile(original, target, constants.COPYFILE_EXCL)
    const mode = (await fs.stat(original)).mode & 0o777
    await fs.chmod(target, mode & ~0o022)
    if (await fileDigest(target) !== entry.sha256) fail('copy_hash')
  }
  await fs.mkdir(path.join(caseRoot, 'home'), { mode: 0o700 })
  await fs.mkdir(path.join(caseRoot, 'tmp'), { mode: 0o700 })
  await fs.mkdir(path.join(caseRoot, 'receipts'), { mode: 0o700 })
  const config = `export default ${JSON.stringify({ root: mirror, cacheDir: path.join(caseRoot, 'tmp', 'vite-cache'),
    test: { environment: 'node', setupFiles: [], include: testPaths, fileParallelism: false,
      maxWorkers: 1, isolate: true, passWithNoTests: false } }, null, 2)}\n`
  await writeNew(path.join(mirror, 'vitest.e2.config.mjs'), config)
  await writeNew(path.join(mirror, 'package.json'), '{"name":"m06-e2-pure-offline","private":true,"type":"module"}\n')
  await writeNew(path.join(caseRoot, 'self-check.mjs'), selfCheckSource)
  const profile = sandboxProfile(caseRoot, packet.tools.node.path,
    esbuildPaths.map(item => path.join(mirror, item.path)), hostReadFiles.map(item => item.path), packet.hostMetadataPaths, packet.hostDirectoryReadPaths,
    dependencies.filter(item => item.path.endsWith('.node')).map(item => path.join(mirror, item.path)))
  await writeNew(path.join(caseRoot, 'sandbox.sb'), profile)
  const generated = ['mirror/vitest.e2.config.mjs', 'mirror/package.json', 'self-check.mjs', 'sandbox.sb']
  const generatedHashes = Object.fromEntries(await Promise.all(generated.map(async item =>
    [item, await fileDigest(path.join(caseRoot, item))])))
  const manifest = {
    version: 'M06_E2_PURE_TS_CASE_V1', caseId, caseRoot, sourceRoot,
    preparePacketSha256: digest(Buffer.from(packetText)),
    preparerSha256: await fileDigest(scriptPath),
    sourceFiles: packet.sourceFiles, dependencyRoot: physicalDependencyRoot,
    dependencyAliases: aliases, dependencyFiles: dependencies,
    closureSha256: digest(canonical({ sourceFiles: packet.sourceFiles, dependencyFiles: dependencies,
      dependencyRoot: physicalDependencyRoot, dependencyAliases: aliases,
      hostReadFiles, hostMetadataPaths: packet.hostMetadataPaths, hostDirectoryReadPaths: packet.hostDirectoryReadPaths,
      hostAliasMetadata: packet.hostAliasMetadata, tools: packet.tools, versions: packet.versions })),
    tools: packet.tools, versions: packet.versions, hostReadFiles, generatedHashes,
    hostMetadataPaths: packet.hostMetadataPaths, hostDirectoryReadPaths: packet.hostDirectoryReadPaths, hostAliasMetadata: packet.hostAliasMetadata,
    selectors: testPaths,
    args: ['run', '--config', 'vitest.e2.config.mjs', '--configLoader', 'native', ...testPaths],
    env: { PATH: [path.dirname(packet.tools.node.path), path.dirname(path.join(mirror, esbuildPaths[0].path))].join(':'),
      HOME: path.join(caseRoot, 'home'), TMPDIR: path.join(caseRoot, 'tmp'), CI: '1', OPENSSL_CONF: '' },
    hostFileRoots,
    status: 'PREPARED_UNREVIEWED_NO_TEST_AUTHORITY',
  }
  await writeNew(path.join(caseRoot, 'case-manifest.json'), `${canonical(manifest)}\n`)
  process.stdout.write(`${canonical({ caseRoot, caseId,
    manifestSha256: await fileDigest(path.join(caseRoot, 'case-manifest.json')) })}\n`)
}

main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
