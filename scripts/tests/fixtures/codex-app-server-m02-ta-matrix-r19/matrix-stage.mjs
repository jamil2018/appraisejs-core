/** Exact pinned module/migration staging before the first T2 backend import. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { POLICY } from './policy.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
const SHA = /^[a-f0-9]{64}$/
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (base, file) => file === base || file.startsWith(`${base}${sep}`)
const PACKAGE = join(REPO, 'packages/appraisejs/package.json')
const SDK_DEPENDENCIES = join(REPO, 'packages/appraisejs/node_modules')
const PRISMA_CLIENT = join(REPO, 'node_modules/@prisma/client')
const GENERATED_PRISMA = join(REPO, 'node_modules/.prisma/client')
const MIGRATIONS = join(REPO, 'prisma/migrations')
const BUILD_BUNDLE = join(REPO, '.appraisejs/m02-ta-matrix-build-r19/canonical-bridge.mjs')

function targetFor(source, stageRoot) {
  const modules = join(stageRoot, 'modules')
  if (source === BUILD_BUNDLE) return join(modules, 'canonical-bridge.mjs')
  if (source === PACKAGE) return join(modules, 'appraise-package.json')
  if (inside(SDK_DEPENDENCIES, source)) return join(modules, 'node_modules', relative(SDK_DEPENDENCIES, source))
  if (inside(PRISMA_CLIENT, source) || inside(GENERATED_PRISMA, source))
    return join(modules, 'node_modules', relative(join(REPO, 'node_modules'), source))
  if (inside(MIGRATIONS, source)) return join(stageRoot, 'prisma/migrations', relative(MIGRATIONS, source))
  throw new Error('matrix staged source outside closed dependency set')
}

async function privateDir(file, expected = null) {
  const state = await fs.lstat(file)
  if (
    !state.isDirectory() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    (state.mode & 0o777) !== 0o700 ||
    (await fs.realpath(file)) !== file ||
    (expected && (state.dev !== expected.dev || state.ino !== expected.ino))
  )
    throw new Error('matrix staged directory identity changed')
  return state
}

/** `stageRoot` injection is only for isolated offline tests; native use passes the fixed T2 root. */
export async function stageMatrixModules({
  prepared,
  stageRoot,
  phaseRoot,
  expectedPhaseIdentity,
  offlineCanonicalBytes,
} = {}) {
  if (
    !prepared?.manifest?.artifacts ||
    !isAbsolute(stageRoot) ||
    !isAbsolute(phaseRoot) ||
    stageRoot !== join(phaseRoot, 'supervisor') ||
    inside(REPO, phaseRoot)
  )
    throw new Error('matrix module stage contract missing')
  const phase = await privateDir(phaseRoot)
  if (expectedPhaseIdentity && (phase.dev !== expectedPhaseIdentity.dev || phase.ino !== expectedPhaseIdentity.ino))
    throw new Error('matrix phase root changed before staging')
  if (offlineCanonicalBytes && (phaseRoot === POLICY.roots.T2 || !Buffer.isBuffer(offlineCanonicalBytes)))
    throw new Error('matrix offline bundle injection is not a native runtime port')
  await fs.mkdir(stageRoot, { mode: 0o700 })
  const made = new Map([
    [phaseRoot, phase],
    [stageRoot, await privateDir(stageRoot)],
  ])
  const selected = prepared.manifest.artifacts.filter(
    item =>
      item.path === BUILD_BUNDLE ||
      item.path === PACKAGE ||
      inside(SDK_DEPENDENCIES, item.path) ||
      inside(PRISMA_CLIENT, item.path) ||
      inside(GENERATED_PRISMA, item.path) ||
      inside(MIGRATIONS, item.path),
  )
  const pinned = new Map(selected.map(item => [item.path, item.sha256]))
  for (const required of [
    BUILD_BUNDLE,
    PACKAGE,
    join(SDK_DEPENDENCIES, '@modelcontextprotocol/sdk/package.json'),
    join(SDK_DEPENDENCIES, 'zod/package.json'),
    join(PRISMA_CLIENT, 'package.json'),
    join(GENERATED_PRISMA, 'index.js'),
  ])
    if (!pinned.has(required)) throw new Error('matrix required staged pin missing')
  if (!selected.some(item => inside(MIGRATIONS, item.path))) throw new Error('matrix migration pins missing')
  const targets = new Set()
  const copied = []
  const writtenFiles = []
  for (const item of selected.sort((a, b) => a.path.localeCompare(b.path))) {
    if (!SHA.test(item.sha256) || item.path.endsWith('/.env')) throw new Error('matrix unsafe staged pin')
    const target = targetFor(item.path, stageRoot)
    if (targets.has(target)) throw new Error('matrix duplicate staged target')
    targets.add(target)
    if (!(item.path === BUILD_BUNDLE && offlineCanonicalBytes)) {
      let sourceDirectory = dirname(item.path)
      while (inside(REPO, sourceDirectory)) {
        const ancestor = await fs.lstat(sourceDirectory)
        if (
          !ancestor.isDirectory() ||
          ancestor.isSymbolicLink() ||
          ancestor.uid !== process.getuid() ||
          (ancestor.mode & 0o022) !== 0
        )
          throw new Error('matrix staged source ancestor changed')
        if (sourceDirectory === REPO) break
        sourceDirectory = dirname(sourceDirectory)
      }
    }
    let bytes
    if (item.path === BUILD_BUNDLE && offlineCanonicalBytes) bytes = offlineCanonicalBytes
    else {
      const sourceState = await fs.lstat(item.path)
      if (
        !sourceState.isFile() ||
        sourceState.isSymbolicLink() ||
        sourceState.uid !== process.getuid() ||
        (sourceState.mode & 0o022) !== 0
      )
        throw new Error('matrix staged source identity changed')
      const source = await fs.open(item.path, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const opened = await source.stat()
        if (opened.dev !== sourceState.dev || opened.ino !== sourceState.ino || opened.size !== sourceState.size)
          throw new Error('matrix staged source replaced')
        bytes = await source.readFile()
      } finally {
        await source.close()
      }
    }
    if (sha(bytes) !== item.sha256) throw new Error('matrix staged source hash drift')
    const parents = []
    for (let current = dirname(target); current !== stageRoot; current = dirname(current)) {
      if (!inside(stageRoot, current)) throw new Error('matrix staged target escaped')
      parents.push(current)
    }
    for (const directory of parents.reverse()) {
      if (!made.has(directory)) {
        await fs.mkdir(directory, { mode: 0o700 })
        made.set(directory, await privateDir(directory))
      }
      await privateDir(directory, made.get(directory))
    }
    await privateDir(stageRoot, made.get(stageRoot))
    const output = await fs.open(
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
    const written = await fs.lstat(target)
    if (
      !written.isFile() ||
      written.isSymbolicLink() ||
      written.uid !== process.getuid() ||
      (written.mode & 0o777) !== 0o600 ||
      sha(await fs.readFile(target)) !== item.sha256
    )
      throw new Error('matrix staged target verification failed')
    copied.push([item.path, item.sha256])
    writtenFiles.push({ target, sha256: item.sha256, dev: written.dev, ino: written.ino })
  }
  for (const item of writtenFiles) {
    for (let parent = dirname(item.target); inside(stageRoot, parent); parent = dirname(parent)) {
      await privateDir(parent, made.get(parent))
      if (parent === stageRoot) break
    }
    const state = await fs.lstat(item.target)
    if (
      !state.isFile() ||
      state.isSymbolicLink() ||
      state.uid !== process.getuid() ||
      (state.mode & 0o777) !== 0o600 ||
      state.dev !== item.dev ||
      state.ino !== item.ino ||
      sha(await fs.readFile(item.target)) !== item.sha256
    )
      throw new Error('matrix staged final file identity or hash changed')
  }
  const moduleRoot = join(stageRoot, 'modules')
  const require = createRequire(join(moduleRoot, 'canonical-bridge.mjs'))
  for (const [specifier, expected] of Object.entries({
    './appraise-package.json': join(moduleRoot, 'appraise-package.json'),
    '@modelcontextprotocol/sdk/server/mcp.js': join(
      moduleRoot,
      'node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js',
    ),
    '@prisma/client': join(moduleRoot, 'node_modules/@prisma/client/default.js'),
    zod: join(moduleRoot, 'node_modules/zod/index.cjs'),
  }))
    if (require.resolve(specifier) !== expected)
      throw new Error(`matrix staged module resolution mismatch: ${specifier}`)
  const generated = await fs.readFile(join(moduleRoot, 'node_modules/.prisma/client/index.js'), 'utf8')
  if (
    !generated.includes('"schemaEnvPath": "../../../.env"') ||
    resolve(moduleRoot, 'node_modules/.prisma/client/../../../.env') !== join(moduleRoot, '.env')
  )
    throw new Error('matrix staged Prisma environment relocation changed')
  try {
    await fs.lstat(join(moduleRoot, '.env'))
    throw new Error('matrix staged schema environment present')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const bundlePath = join(moduleRoot, 'canonical-bridge.mjs')
  return Object.freeze({
    stageRoot,
    moduleRoot,
    bundlePath,
    copiedFiles: copied.length,
    stagedDigest: sha(Buffer.from(JSON.stringify(copied))),
  })
}
