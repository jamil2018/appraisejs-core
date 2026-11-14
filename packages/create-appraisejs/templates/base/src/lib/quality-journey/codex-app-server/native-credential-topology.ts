import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readlinkSync,
  realpathSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

function requireMetadata(condition: unknown): asserts condition {
  if (!condition) throw new Error('Native credential topology refused')
}
/** Metadata only. No credential bytes are opened, read, hashed, copied, repaired or restored. */
export function describeNativeCredential(path: string) {
  const metadata = lstatSync(path, { bigint: true })
  requireMetadata(metadata.isFile() && !metadata.isSymbolicLink())
  requireMetadata(
    metadata.uid === BigInt(process.getuid!()) &&
      (metadata.mode & BigInt(0o7777)) === BigInt(0o600) &&
      metadata.nlink === BigInt(1),
  )
  return Object.freeze({
    path,
    canonicalPath: realpathSync(path),
    ...Object.fromEntries(
      ['uid', 'dev', 'ino', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [
        key,
        String(metadata[key as keyof typeof metadata]),
      ]),
    ),
    mode: String(metadata.mode & BigInt(0o7777)),
  }) as Readonly<{
    path: string
    canonicalPath: string
    uid: string
    dev: string
    ino: string
    nlink: '1'
    size: string
    mtimeNs: string
    ctimeNs: string
    mode: '384'
  }>
}
export type NativeCredentialDescriptor = ReturnType<typeof describeNativeCredential>
export function verifyNativeCredential(expected: NativeCredentialDescriptor) {
  requireMetadata(isDeepStrictEqual(describeNativeCredential(expected.path), expected))
}
export function assertNativePublicInput(path: string, source: NativeCredentialDescriptor) {
  const metadata = statSync(path, { bigint: true })
  requireMetadata(
    metadata.isFile() &&
      realpathSync(path) !== source.canonicalPath &&
      !(String(metadata.dev) === source.dev && String(metadata.ino) === source.ino),
  )
}
/** One original descriptor: guard the opened object before bytes, and bound growth as well as initial size. */
export function readNativePublicBytes(path: string, source: NativeCredentialDescriptor, maxBytes = 512 * 1024 * 1024) {
  requireMetadata(Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 512 * 1024 * 1024)
  verifyNativeCredential(source)
  assertNativePublicInput(path, source)
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const original = fstatSync(fd, { bigint: true })
    requireMetadata(original.isFile() && original.size <= BigInt(maxBytes))
    requireMetadata(!(String(original.dev) === source.dev && String(original.ino) === source.ino))
    const chunks: Buffer[] = []
    let count = 0
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - count + 1))
      const bytes = readSync(fd, chunk, 0, chunk.length, null)
      if (!bytes) break
      count += bytes
      requireMetadata(count <= maxBytes)
      chunks.push(chunk.subarray(0, bytes))
    }
    const final = fstatSync(fd, { bigint: true })
    requireMetadata(final.size === BigInt(count))
    for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'nlink'] as const)
      requireMetadata(final[key] === original[key])
    verifyNativeCredential(source)
    return Buffer.concat(chunks, count)
  } finally {
    closeSync(fd)
  }
}
function describeLink(path: string) {
  const metadata = lstatSync(path, { bigint: true })
  requireMetadata(
    metadata.isSymbolicLink() && metadata.uid === BigInt(process.getuid!()) && metadata.nlink === BigInt(1),
  )
  return Object.freeze({
    path,
    target: readlinkSync(path),
    dev: String(metadata.dev),
    ino: String(metadata.ino),
    uid: String(metadata.uid),
  })
}
export function linkNativeCredential(source: NativeCredentialDescriptor, path: string) {
  verifyNativeCredential(source)
  symlinkSync(source.path, path, 'file')
  const original = describeLink(path)
  requireMetadata(original.target === source.path)
  verifyNativeCredential(source)
  return original
}
export function unlinkNativeCredential(original: ReturnType<typeof linkNativeCredential>) {
  requireMetadata(isDeepStrictEqual(describeLink(original.path), original))
  unlinkSync(original.path)
}
