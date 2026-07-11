import { constants, promises as fs } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import {
  hashRuntimeCapsuleBytes,
  parseCanonicalRuntimeCapsuleManifest,
  runtimeCapsuleHashSchema,
  runtimeCapsuleSegmentSchema,
  validationHashSegment,
  type RuntimeCapsuleManifest,
  runtimeCapsuleFilePathSchema,
} from './contracts'

export type RuntimeCapsulePaths = {
  managedRoot: string
  projectRoot: string
  capsuleRoot: string
  manifestPath: string
}

export type ManagedProjectPaths = {
  managedRoot: string
  projectRoot: string
  projectManifestPath: string
}

export function assertRuntimeCapsulePathContained(root: string, candidate: string): void {
  const relative = path.relative(root, candidate)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('Runtime capsule path escapes its managed project root.')
}

export function resolveRuntimeCapsulePaths(input: {
  appraiseRoot: string
  projectId: string
  validationHash: string
  runId: string
}): RuntimeCapsulePaths {
  const project = resolveManagedProjectPaths(input.appraiseRoot, input.projectId)
  const runId = runtimeCapsuleSegmentSchema.parse(input.runId)
  const validation = validationHashSegment(input.validationHash)
  const capsuleRoot = path.resolve(project.projectRoot, 'runtime', validation, runId)
  assertRuntimeCapsulePathContained(project.projectRoot, capsuleRoot)
  return {
    managedRoot: project.managedRoot,
    projectRoot: project.projectRoot,
    capsuleRoot,
    manifestPath: path.join(capsuleRoot, 'manifest.json'),
  }
}

export function resolveManagedProjectPaths(appraiseRoot: string, projectIdValue: string): ManagedProjectPaths {
  const projectId = runtimeCapsuleSegmentSchema.parse(projectIdValue)
  const managedRoot = path.resolve(appraiseRoot, 'projects')
  const projectRoot = path.resolve(managedRoot, projectId)
  assertRuntimeCapsulePathContained(managedRoot, projectRoot)
  return { managedRoot, projectRoot, projectManifestPath: path.join(projectRoot, 'project.json') }
}

async function assertRealContainment(root: string, candidate: string): Promise<void> {
  const [realRoot, realCandidate] = await Promise.all([fs.realpath(root), fs.realpath(candidate)])
  assertRuntimeCapsulePathContained(realRoot, realCandidate)
  const expectedRealCandidate = path.resolve(realRoot, path.relative(root, candidate))
  if (realCandidate !== expectedRealCandidate)
    throw new Error('Runtime capsule paths must not contain symlink ancestors.')
}

export async function assertTrustedRuntimeCapsuleContainment(
  appraiseRoot: string,
  projectRoot: string,
  capsuleRoot: string,
) {
  const resolvedRoot = path.resolve(appraiseRoot)
  const realParent = await fs.realpath(path.dirname(resolvedRoot))
  const realRoot = await fs.realpath(resolvedRoot)
  if (realRoot !== path.join(realParent, path.basename(resolvedRoot)))
    throw new Error('The trusted Appraise storage root must not be a symlink.')
  await assertRealContainment(resolvedRoot, projectRoot)
  await assertRealContainment(projectRoot, capsuleRoot)
}

async function ensureTrustedManagedRoot(appraiseRoot: string): Promise<string> {
  const resolvedRoot = path.resolve(appraiseRoot)
  const parent = path.dirname(resolvedRoot)
  const realParent = await fs.realpath(parent)
  await fs.mkdir(resolvedRoot, { recursive: true, mode: 0o700 })
  const realRoot = await fs.realpath(resolvedRoot)
  if (realRoot !== path.join(realParent, path.basename(resolvedRoot)))
    throw new Error('The trusted Appraise storage root must not be a symlink.')
  await fs.chmod(realRoot, 0o700)
  return realRoot
}

async function ensureSecureDirectory(root: string, candidate: string): Promise<void> {
  await fs.mkdir(candidate, { recursive: true, mode: 0o700 })
  await assertRealContainment(root, candidate)
  await fs.chmod(candidate, 0o700)
}

export async function prepareRuntimeCapsuleDirectories(paths: RuntimeCapsulePaths): Promise<void> {
  await prepareManagedProjectDirectory({
    managedRoot: paths.managedRoot,
    projectRoot: paths.projectRoot,
    projectManifestPath: path.join(paths.projectRoot, 'project.json'),
  })
  await assertRealContainment(paths.managedRoot, paths.projectRoot)
  await ensureSecureDirectory(paths.projectRoot, path.dirname(path.dirname(paths.capsuleRoot)))
  await ensureSecureDirectory(paths.projectRoot, path.dirname(paths.capsuleRoot))
  await ensureSecureDirectory(paths.projectRoot, paths.capsuleRoot)
  await assertRealContainment(paths.projectRoot, paths.capsuleRoot)
  await Promise.all([
    fs.chmod(paths.managedRoot, 0o700),
    fs.chmod(paths.projectRoot, 0o700),
    fs.chmod(paths.capsuleRoot, 0o700),
  ])
}

export async function prepareManagedProjectDirectory(paths: ManagedProjectPaths): Promise<void> {
  const appraiseRoot = path.dirname(paths.managedRoot)
  await ensureTrustedManagedRoot(appraiseRoot)
  await ensureSecureDirectory(appraiseRoot, paths.managedRoot)
  await ensureSecureDirectory(paths.managedRoot, paths.projectRoot)
  await assertRealContainment(paths.managedRoot, paths.projectRoot)
  await Promise.all([fs.chmod(paths.managedRoot, 0o700), fs.chmod(paths.projectRoot, 0o700)])
}

export async function writeImmutableCapsuleManifest(
  paths: RuntimeCapsulePaths,
  canonicalManifest: string,
): Promise<'created' | 'unchanged'> {
  await prepareRuntimeCapsuleDirectories(paths)
  const temporaryPath = `${paths.manifestPath}.${process.pid}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, canonicalManifest, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await fs.link(temporaryPath, paths.manifestPath)
    await fs.unlink(temporaryPath)
    return 'created'
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined)
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = await fs.readFile(paths.manifestPath, 'utf8')
    if (existing !== canonicalManifest) throw new Error('Runtime capsule manifest is immutable and already differs.')
    return 'unchanged'
  }
}

export async function readCapsuleManifest(paths: RuntimeCapsulePaths): Promise<RuntimeCapsuleManifest | null> {
  try {
    const stat = await fs.stat(paths.manifestPath)
    if (stat.size > 1024 * 1024) throw new Error('Runtime capsule manifest exceeds 1 MiB.')
    return parseCanonicalRuntimeCapsuleManifest(await fs.readFile(paths.manifestPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function resolveRuntimeCapsuleBlobPath(input: { appraiseRoot: string; projectId: string; contentHash: string }): {
  projectRoot: string
  blobPath: string
} {
  const projectId = runtimeCapsuleSegmentSchema.parse(input.projectId)
  const digest = runtimeCapsuleHashSchema.parse(input.contentHash).slice('sha256:'.length)
  const projectRoot = path.resolve(input.appraiseRoot, 'projects', projectId)
  const blobPath = path.resolve(projectRoot, 'cache', 'blobs', digest.slice(0, 2), digest)
  assertRuntimeCapsulePathContained(projectRoot, blobPath)
  return { projectRoot, blobPath }
}

export async function writeContentAddressedBlob(input: {
  appraiseRoot: string
  projectId: string
  contentHash: string
  bytes: Uint8Array
}): Promise<{ path: string; status: 'created' | 'unchanged' }> {
  if (hashRuntimeCapsuleBytes(input.bytes) !== input.contentHash)
    throw new Error('Runtime capsule blob bytes do not match their content hash.')
  const paths = resolveRuntimeCapsuleBlobPath(input)
  const directory = path.dirname(paths.blobPath)
  const managedPaths = resolveManagedProjectPaths(input.appraiseRoot, input.projectId)
  await prepareManagedProjectDirectory(managedPaths)
  await ensureSecureDirectory(paths.projectRoot, path.join(paths.projectRoot, 'cache'))
  await ensureSecureDirectory(paths.projectRoot, path.join(paths.projectRoot, 'cache', 'blobs'))
  await ensureSecureDirectory(paths.projectRoot, directory)
  await assertRealContainment(paths.projectRoot, directory)
  const temporaryPath = `${paths.blobPath}.${crypto.randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, input.bytes, { flag: 'wx', mode: 0o600 })
    await fs.link(temporaryPath, paths.blobPath)
    return { path: paths.blobPath, status: 'created' }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const existing = await fs.readFile(paths.blobPath)
    if (hashRuntimeCapsuleBytes(existing) !== input.contentHash)
      throw new Error('Existing runtime capsule blob is corrupt.')
    return { path: paths.blobPath, status: 'unchanged' }
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

export async function verifyContentAddressedBlob(input: {
  appraiseRoot: string
  projectId: string
  contentHash: string
  expectedSize: number
}): Promise<'ready' | 'missing' | 'corrupt'> {
  const paths = resolveRuntimeCapsuleBlobPath(input)
  try {
    const stat = await fs.lstat(paths.blobPath)
    if (!stat.isFile() || stat.isSymbolicLink()) return 'corrupt'
    await assertRealContainment(paths.projectRoot, paths.blobPath)
    if (stat.size !== input.expectedSize) return 'corrupt'
    const bytes = await fs.readFile(paths.blobPath)
    return hashRuntimeCapsuleBytes(bytes) === input.contentHash ? 'ready' : 'corrupt'
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'corrupt'
  }
}

function resolveRunFilePath(paths: RuntimeCapsulePaths, filePath: string): string {
  const relative = runtimeCapsuleFilePathSchema.parse(filePath)
  const candidate = path.resolve(paths.capsuleRoot, ...relative.split('/'))
  assertRuntimeCapsulePathContained(paths.capsuleRoot, candidate)
  return candidate
}

export async function materializeRuntimeCapsuleFile(input: {
  paths: RuntimeCapsulePaths
  filePath: string
  blobPath: string
  contentHash: string
  expectedSize: number
}): Promise<'created' | 'unchanged'> {
  await prepareRuntimeCapsuleDirectories(input.paths)
  const destination = resolveRunFilePath(input.paths, input.filePath)
  const directory = path.dirname(destination)
  await ensureSecureDirectory(input.paths.projectRoot, directory)
  await assertRealContainment(input.paths.capsuleRoot, directory)
  const existing = await verifyRuntimeCapsuleFile({
    paths: input.paths,
    filePath: input.filePath,
    contentHash: input.contentHash,
    expectedSize: input.expectedSize,
  })
  if (existing === 'ready') return 'unchanged'
  if (existing === 'corrupt') throw new Error(`Runtime capsule file ${input.filePath} already differs.`)
  const temporaryPath = `${destination}.${crypto.randomUUID()}.tmp`
  try {
    await fs.copyFile(input.blobPath, temporaryPath, constants.COPYFILE_EXCL)
    await fs.chmod(temporaryPath, 0o600)
    await fs.link(temporaryPath, destination)
    return 'created'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const raced = await verifyRuntimeCapsuleFile({
      paths: input.paths,
      filePath: input.filePath,
      contentHash: input.contentHash,
      expectedSize: input.expectedSize,
    })
    if (raced !== 'ready') throw new Error(`Concurrent runtime capsule file ${input.filePath} differs.`)
    return 'unchanged'
  } finally {
    await fs.unlink(temporaryPath).catch(() => undefined)
  }
}

export async function verifyRuntimeCapsuleFile(input: {
  paths: RuntimeCapsulePaths
  filePath: string
  contentHash: string
  expectedSize: number
}): Promise<'ready' | 'missing' | 'corrupt'> {
  const destination = resolveRunFilePath(input.paths, input.filePath)
  try {
    const stat = await fs.lstat(destination)
    if (!stat.isFile() || stat.isSymbolicLink()) return 'corrupt'
    await assertRealContainment(input.paths.capsuleRoot, destination)
    if (stat.size !== input.expectedSize) return 'corrupt'
    return hashRuntimeCapsuleBytes(await fs.readFile(destination)) === input.contentHash ? 'ready' : 'corrupt'
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'corrupt'
  }
}
