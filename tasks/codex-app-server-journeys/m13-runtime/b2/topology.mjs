import { lstatSync, readlinkSync, realpathSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'

export const CREDENTIAL_SOURCE_PATH = '/Users/jamil/.codex/auth.json'
export class B2Refusal extends Error {
  constructor(category) {
    super(category)
    this.name = 'B2Refusal'
    this.category = category
  }
}
export function requireCondition(condition, category) {
  if (!condition) throw new B2Refusal(category)
}

/** Metadata only: never opens, reads, hashes, parses, copies, restores, or chmods credential bytes. */
export function describeCredentialSource(path) {
  const metadata = lstatSync(path, { bigint: true })
  requireCondition(metadata.isFile() && !metadata.isSymbolicLink(), 'credential_source_type_refused')
  requireCondition(
    metadata.uid === BigInt(process.getuid()) && (metadata.mode & 0o7777n) === 0o600n && metadata.nlink === 1n,
    'credential_source_permissions_refused',
  )
  return {
    path,
    canonicalPath: realpathSync(path),
    uid: metadata.uid.toString(),
    mode: (metadata.mode & 0o7777n).toString(),
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
    nlink: metadata.nlink.toString(),
    size: metadata.size.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    ctimeNs: metadata.ctimeNs.toString(),
  }
}

export function verifyCredentialSource(expected) {
  const observed = describeCredentialSource(expected.path)
  requireCondition(isDeepStrictEqual(observed, expected), 'credential_source_metadata_changed')
  return observed
}

export function assertHashInputIsNotCredential(path, source) {
  const metadata = statSync(path, { bigint: true })
  requireCondition(
    realpathSync(path) !== source.canonicalPath &&
      !(metadata.dev.toString() === source.dev && metadata.ino.toString() === source.ino),
    'credential_hash_input_refused',
  )
}

function describeLink(path) {
  const metadata = lstatSync(path, { bigint: true })
  requireCondition(
    metadata.isSymbolicLink() && metadata.uid === BigInt(process.getuid()) && metadata.nlink === 1n,
    'credential_link_replaced',
  )
  return {
    path,
    target: readlinkSync(path),
    dev: metadata.dev.toString(),
    ino: metadata.ino.toString(),
    uid: metadata.uid.toString(),
  }
}

export function createOwnedCredentialLink(source, linkPath) {
  verifyCredentialSource(source)
  // symlinkSync is exclusive: no preexisting path is replaced.
  symlinkSync(source.path, linkPath, 'file')
  const link = describeLink(linkPath)
  requireCondition(link.target === source.path, 'credential_link_replaced')
  verifyCredentialSource(source)
  return link
}

export function verifyOwnedCredentialLink(expected) {
  const observed = describeLink(expected.path)
  requireCondition(isDeepStrictEqual(observed, expected), 'credential_link_replaced')
  return observed
}

/** Unlinks only the exact newly owned symlink, never its target or any replacement file/link. */
export function removeOwnedCredentialLink(expected) {
  verifyOwnedCredentialLink(expected)
  unlinkSync(expected.path)
}
