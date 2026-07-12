import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashRepositoryExportBytes, repositoryExportManifestSchema, type RepositoryExportManifest } from './contracts'

const EXPORT_MANIFEST = '.appraise-export.json'

function assertRelativeExportPath(value: string) {
  if (
    !value ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).some(segment => !segment || segment === '.' || segment === '..')
  )
    throw new Error('Repository export path must be a contained portable relative path.')
  return value.split('/').join(path.sep)
}

function contained(root: string, candidate: string) {
  const relative = path.relative(root, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('Repository export destination escapes the target project.')
}

async function readManifest(root: string): Promise<RepositoryExportManifest | null> {
  try {
    const file = path.join(root, EXPORT_MANIFEST)
    const stat = await fs.lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
      throw new Error('Export manifest is unsafe.')
    return repositoryExportManifestSchema.parse(JSON.parse(await fs.readFile(file, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function currentConflicts(root: string, previous: RepositoryExportManifest | null) {
  if (!previous) return []
  const conflicts: string[] = []
  for (const file of previous.files) {
    const candidate = path.resolve(root, assertRelativeExportPath(file.path))
    contained(root, candidate)
    try {
      const stat = await fs.lstat(candidate)
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size !== file.size ||
        hashRepositoryExportBytes(await fs.readFile(candidate)) !== file.hash
      )
        conflicts.push(file.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') conflicts.push(file.path)
      else throw error
    }
  }
  return conflicts.sort()
}

export async function publishRepositoryExport(input: {
  projectRoot: string
  destinationPath: string
  manifest: RepositoryExportManifest
  files: Array<{ path: string; bytes: Uint8Array }>
  allowReplaceConflicts?: boolean
}) {
  const realProjectRoot = await fs.realpath(input.projectRoot)
  const destination = path.resolve(realProjectRoot, assertRelativeExportPath(input.destinationPath))
  contained(realProjectRoot, destination)
  const parent = path.dirname(destination)
  await fs.mkdir(parent, { recursive: true })
  if ((await fs.realpath(parent)) !== parent) throw new Error('Repository export destination has a symlinked parent.')
  const previous = await readManifest(destination)
  if (previous && previous.projectId !== input.manifest.projectId)
    throw new Error('Repository export destination belongs to another target project.')
  const conflicts = await currentConflicts(destination, previous)
  if (conflicts.length && !input.allowReplaceConflicts) return { status: 'conflict' as const, conflicts }

  const staging = path.join(parent, `.${path.basename(destination)}.staging-${crypto.randomUUID()}`)
  const backup = path.join(parent, `.${path.basename(destination)}.previous-${crypto.randomUUID()}`)
  await fs.mkdir(staging, { mode: 0o700 })
  try {
    for (const file of input.files) {
      const relative = assertRelativeExportPath(file.path)
      const target = path.resolve(staging, relative)
      contained(staging, target)
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
      await fs.writeFile(target, file.bytes, { flag: 'wx', mode: 0o600 })
    }
    await fs.writeFile(path.join(staging, EXPORT_MANIFEST), canonicalContractJson(input.manifest), {
      flag: 'wx',
      mode: 0o600,
    })
    let movedPrevious = false
    try {
      await fs.rename(destination, backup)
      movedPrevious = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      await fs.rename(staging, destination)
    } catch (error) {
      if (movedPrevious) await fs.rename(backup, destination)
      throw error
    }
    if (movedPrevious) await fs.rm(backup, { recursive: true, force: true })
    return { status: 'succeeded' as const, conflicts }
  } finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
}
