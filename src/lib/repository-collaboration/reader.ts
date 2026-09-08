import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

import {
  collaborationManifestSchema,
  collaborationRecordSchema,
  MAX_COLLABORATION_RECORD_BYTES,
  MAX_COLLABORATION_TOTAL_BYTES,
  type CollaborationManifest,
  type CollaborationRecord,
} from './contracts'
import { collaborationHash } from './canonical'

const expectedDirectoryByKind: Record<CollaborationRecord['kind'], string> = {
  module: 'modules',
  'test-suite': 'test-suites',
  'test-case': 'test-cases',
  template: 'templates',
  'locator-group': 'locator-groups',
  locator: 'locators',
  tag: 'tags',
  'environment-reference': 'environment-references',
  'journey-reuse-asset': 'journey-reuse-assets',
}

function contained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function readBoundedFile(root: string, relativePath: string, limit: number): Promise<Buffer> {
  const candidate = path.resolve(root, relativePath)
  if (!contained(root, candidate)) throw new Error(`Collaboration path escapes root: ${relativePath}`)
  const fileStat = await lstat(candidate, { bigint: false })
  if (fileStat.isSymbolicLink()) throw new Error(`Collaboration symlinks are not allowed: ${relativePath}`)
  if (!fileStat.isFile()) throw new Error(`Collaboration path is not a regular file: ${relativePath}`)
  const resolvedRoot = await realpath(root)
  const resolvedCandidate = await realpath(candidate)
  if (!contained(resolvedRoot, resolvedCandidate)) throw new Error(`Collaboration path escapes root: ${relativePath}`)
  if (fileStat.size > limit) throw new Error(`Collaboration file exceeds ${limit} bytes: ${relativePath}`)

  const handle = await open(resolvedCandidate, 'r')
  try {
    const buffer = Buffer.alloc(fileStat.size)
    const { bytesRead } = await handle.read(buffer, 0, fileStat.size, 0)
    if (bytesRead !== fileStat.size) throw new Error(`Collaboration file changed while reading: ${relativePath}`)
    return buffer
  } finally {
    await handle.close()
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error(`Invalid collaboration JSON: ${label}`)
  }
}

async function listedSnapshotFiles(root: string, relative = ''): Promise<string[]> {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relativePath = path.posix.join(relative.split(path.sep).join(path.posix.sep), entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Collaboration symlinks are not allowed: ${relativePath}`)
    if (entry.isDirectory()) files.push(...(await listedSnapshotFiles(root, relativePath)))
    else if (entry.isFile()) files.push(relativePath)
    else throw new Error(`Unsupported collaboration filesystem entry: ${relativePath}`)
  }
  return files.sort((left, right) => left.localeCompare(right))
}

export interface ReadCollaborationSnapshotResult {
  manifest: CollaborationManifest
  records: CollaborationRecord[]
  sourceBytes: number
  snapshotHash: string
}

export async function readCollaborationSnapshot(root: string): Promise<ReadCollaborationSnapshotResult> {
  const manifestBytes = await readBoundedFile(root, 'manifest.json', MAX_COLLABORATION_RECORD_BYTES)
  const manifest = collaborationManifestSchema.parse(parseJson(manifestBytes, 'manifest.json'))
  for (const entry of manifest.records) {
    if (path.posix.dirname(entry.path) !== expectedDirectoryByKind[entry.kind]) {
      throw new Error(`Unexpected directory for ${entry.kind}: ${entry.path}`)
    }
  }
  const expectedFiles = new Set(['manifest.json', ...manifest.records.map(record => record.path)])
  const actualFiles = await listedSnapshotFiles(root)
  const unexpected = actualFiles.find(file => !expectedFiles.has(file))
  if (unexpected) throw new Error(`Unlisted collaboration file: ${unexpected}`)
  const missing = [...expectedFiles].find(file => !actualFiles.includes(file))
  if (missing) throw new Error(`Missing collaboration file: ${missing}`)
  let totalBytes = manifestBytes.length
  const records: CollaborationRecord[] = []

  for (const entry of manifest.records) {
    const bytes = await readBoundedFile(root, entry.path, MAX_COLLABORATION_RECORD_BYTES)
    totalBytes += bytes.length
    if (totalBytes > MAX_COLLABORATION_TOTAL_BYTES) throw new Error('Collaboration snapshot exceeds total byte limit')
    if (collaborationHash(bytes.toString('utf8')) !== entry.hash) throw new Error(`Hash mismatch for ${entry.path}`)
    const record = collaborationRecordSchema.parse(parseJson(bytes, entry.path))
    if (record.kind !== entry.kind || record.portableId !== entry.portableId) {
      throw new Error(`Manifest identity mismatch for ${entry.path}`)
    }
    if (record.portableProjectId !== manifest.portableProjectId) {
      throw new Error(`Portable project mismatch for ${entry.path}`)
    }
    records.push(record)
  }

  return {
    manifest,
    records,
    sourceBytes: totalBytes,
    snapshotHash: collaborationHash({ manifest, records }),
  }
}
