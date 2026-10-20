/** Byte-identical, private T1 supervisor module staging. No module is imported here. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import fsp from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const T1_MODULES = '/private/tmp/appraise-m02-ta-descriptors-p2/supervisor/modules'
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
const ORIGINAL_BUNDLE = join(REPO, '.appraisejs/m02-ta-r4-canonical-build-01/canonical-bridge.mjs')
const ROOT_PACKAGE = join(REPO, 'package.json')
const PACKAGE_ROOTS = ['node_modules/@prisma/client', 'node_modules/.prisma/client', 'node_modules/zod'].map(path =>
  join(REPO, path),
)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const within = (base, path) => path === base || (path.startsWith(`${base}${sep}`) && relative(base, path) !== '..')
const clean = state => !state.isSymbolicLink() && state.uid === process.getuid() && (state.mode & 0o022) === 0

function sourceTarget(path, moduleRoot) {
  if (path === ORIGINAL_BUNDLE) return join(moduleRoot, 'canonical-bridge.mjs')
  if (path === ROOT_PACKAGE) return join(dirname(dirname(moduleRoot)), 'package.json')
  const root = PACKAGE_ROOTS.find(base => within(base, path))
  if (!root) throw new Error('T1 module source outside exact closure')
  return join(moduleRoot, 'node_modules', relative(join(REPO, 'node_modules'), path))
}

async function checkAncestor(path, stop, io) {
  let current = dirname(path)
  while (within(stop, current)) {
    const state = await io.lstat(current)
    if (!state.isDirectory() || !clean(state)) throw new Error('T1 module source ancestor changed')
    if (current === stop) break
    current = dirname(current)
  }
}

async function checkPrivateDirectory(path, expected, io) {
  const state = await io.lstat(path)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700 ||
    (expected && (state.dev !== expected.dev || state.ino !== expected.ino))
  )
    throw new Error('T1 staged module root identity changed')
  return state
}

/** Injected root is used only by offline temp-root tests; the runtime passes the exact T1 path. */
export async function stageT1Modules({
  prepared,
  moduleRoot = T1_MODULES,
  sourceBundle = ORIGINAL_BUNDLE,
  phaseStat,
  supervisorStat,
  io = fsp,
  requireFactory = createRequire,
} = {}) {
  if (
    !isAbsolute(moduleRoot) ||
    within(REPO, moduleRoot) ||
    sourceBundle !== ORIGINAL_BUNDLE ||
    !prepared?.manifest?.artifacts
  )
    throw new Error('T1 module staging contract missing')
  if ((await io.realpath(dirname(moduleRoot))) !== dirname(moduleRoot))
    throw new Error('T1 staged module parent path must be canonical')
  const supervisor = dirname(moduleRoot)
  const phase = dirname(supervisor)
  if (moduleRoot === T1_MODULES) {
    await checkPrivateDirectory(phase, phaseStat, io)
    await checkPrivateDirectory(supervisor, supervisorStat, io)
  }
  const selected = prepared.manifest.artifacts.filter(
    item =>
      item.path === ORIGINAL_BUNDLE ||
      item.path === ROOT_PACKAGE ||
      PACKAGE_ROOTS.some(root => within(root, item.path)),
  )
  if (!selected.some(item => item.path === ORIGINAL_BUNDLE) || selected.length < 4)
    throw new Error('T1 staged module pins incomplete')
  const pinned = new Map(selected.map(item => [item.path, item.sha256]))
  for (const required of [
    ORIGINAL_BUNDLE,
    ROOT_PACKAGE,
    join(PACKAGE_ROOTS[0], 'package.json'),
    join(PACKAGE_ROOTS[1], 'index.js'),
    join(PACKAGE_ROOTS[2], 'package.json'),
  ])
    if (!pinned.has(required)) throw new Error('T1 required module pin missing')
  await io.mkdir(moduleRoot, { mode: 0o700 })
  const moduleStat = await checkPrivateDirectory(moduleRoot, null, io)
  const made = new Map([
    [phase, await checkPrivateDirectory(phase, phaseStat, io)],
    [supervisor, await checkPrivateDirectory(supervisor, supervisorStat, io)],
    [moduleRoot, moduleStat],
  ])
  const copied = []
  async function checkTargetChain(target) {
    for (let current = dirname(target); within(phase, current); current = dirname(current)) {
      const expected = made.get(current)
      if (!expected) throw new Error('T1 staged target parent not exclusively created')
      await checkPrivateDirectory(current, expected, io)
      if (current === phase) break
    }
  }
  async function makeParents(target) {
    const pending = []
    for (let current = dirname(target); current !== moduleRoot; current = dirname(current)) {
      if (current === phase) break
      if (!within(moduleRoot, current)) throw new Error('T1 stage path escapes module root')
      pending.push(current)
    }
    for (const directory of pending.reverse()) {
      if (made.has(directory)) continue
      await io.mkdir(directory, { mode: 0o700 })
      made.set(directory, await checkPrivateDirectory(directory, null, io))
    }
  }
  for (const item of selected.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (basename(item.path) === '.env' || !/^[a-f0-9]{64}$/.test(item.sha256))
      throw new Error('T1 unsafe module source pin')
    await checkAncestor(item.path, REPO, io)
    const state = await io.lstat(item.path)
    if (!state.isFile() || !clean(state)) throw new Error('T1 module source identity changed')
    const source = await io.open(item.path, constants.O_RDONLY | constants.O_NOFOLLOW)
    let bytes
    try {
      const opened = await source.stat()
      if (opened.dev !== state.dev || opened.ino !== state.ino || opened.size !== state.size)
        throw new Error('T1 module source replaced')
      bytes = await source.readFile()
    } finally {
      await source.close()
    }
    if (sha(bytes) !== item.sha256) throw new Error('T1 module source hash drift')
    const target = sourceTarget(item.path, moduleRoot)
    await makeParents(target)
    await checkTargetChain(target)
    const output = await io.open(
      target,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await output.writeFile(bytes)
      await output.sync()
    } finally {
      await output.close()
    }
    await checkTargetChain(target)
    const written = await io.lstat(target)
    if (
      !written.isFile() ||
      written.isSymbolicLink() ||
      written.uid !== process.getuid() ||
      (written.mode & 0o777) !== 0o600 ||
      sha(await io.readFile(target)) !== item.sha256
    )
      throw new Error('T1 staged module hash or identity mismatch')
    copied.push({ source: item.path, target, sha256: item.sha256 })
  }
  for (const item of copied) {
    await checkTargetChain(item.target)
    const state = await io.lstat(item.target)
    if (
      !state.isFile() ||
      state.isSymbolicLink() ||
      state.uid !== process.getuid() ||
      (state.mode & 0o777) !== 0o600 ||
      sha(await io.readFile(item.target)) !== item.sha256
    )
      throw new Error('T1 staged module final verification failed')
  }
  await checkPrivateDirectory(moduleRoot, moduleStat, io)
  try {
    await io.access(join(moduleRoot, '.env'))
    throw new Error('T1 staged schema environment file present')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const bundlePath = join(moduleRoot, 'canonical-bridge.mjs')
  await verifyT1ModuleResolution(moduleRoot, { io, requireFactory })
  return Object.freeze({
    bundlePath,
    moduleRoot,
    copiedFiles: copied.length,
    stagedDigest: sha(Buffer.from(JSON.stringify(copied.map(({ source, sha256 }) => [source, sha256])))),
  })
}

export async function verifyT1ModuleResolution(moduleRoot, { io = fsp, requireFactory = createRequire } = {}) {
  const bundlePath = join(moduleRoot, 'canonical-bridge.mjs')
  const require = requireFactory(bundlePath)
  const expected = {
    '../../package.json': join(dirname(dirname(moduleRoot)), 'package.json'),
    '@prisma/client': join(moduleRoot, 'node_modules/@prisma/client/default.js'),
    '@prisma/client/runtime/library.js': join(moduleRoot, 'node_modules/@prisma/client/runtime/library.js'),
    '.prisma/client/default': join(moduleRoot, 'node_modules/.prisma/client/default.js'),
    zod: join(moduleRoot, 'node_modules/zod/index.cjs'),
  }
  for (const [specifier, path] of Object.entries(expected)) {
    if (require.resolve(specifier) !== path) throw new Error(`T1 staged module resolution mismatch: ${specifier}`)
  }
  const generatedIndex = join(moduleRoot, 'node_modules/.prisma/client/index.js')
  const generated = await io.readFile(generatedIndex, 'utf8')
  if (
    !generated.includes('"schemaEnvPath": "../../../.env"') ||
    resolve(dirname(generatedIndex), '../../../.env') !== join(moduleRoot, '.env')
  )
    throw new Error('T1 staged Prisma schema environment path mismatch')
  return true
}
