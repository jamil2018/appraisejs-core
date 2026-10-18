/** Offline exact-artifact preparation; import and pure verification perform no writes. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { constants } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest } from './policy.mjs'
import { prepareR22MatrixManifest } from './manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
export const MATRIX_BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r22')
export const MATRIX_MANIFEST = join(MATRIX_BUILD, 'manifest.json')
export const MATRIX_CANONICAL = join(MATRIX_BUILD, 'canonical-bridge.mjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

export function buildR22PreparationEnvelope(prepared) {
  if (
    prepared?.manifestDigest !== digest(prepared.manifest) ||
    prepared?.canonicalSha256 !== sha(prepared.canonicalBytes) ||
    prepared?.blockers?.length !== 0 ||
    prepared?.runtimeEligible !== false
  )
    throw new Error('R22 preparation input drift')
  return {
    schema: 'appraise.m02-ta-matrix-r22-preparation/v1',
    manifest: prepared.manifest,
    manifestDigest: prepared.manifestDigest,
    canonicalSha256: prepared.canonicalSha256,
    blockers: [],
    runtimeEligible: false,
    exactArtifactReviewRequired: true,
  }
}

export function serializeR22Preparation(prepared) {
  return Buffer.from(`${JSON.stringify(buildR22PreparationEnvelope(prepared), null, 2)}\n`)
}

function ownedWrite(file, bytes) {
  if (
    dirname(file) !== MATRIX_BUILD ||
    !['manifest.json', 'canonical-bridge.mjs'].includes(file.slice(MATRIX_BUILD.length + 1))
  )
    throw new Error('matrix build output path')
  const fd = fs.openSync(
    file,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
    0o600,
  )
  try {
    fs.writeFileSync(fd, bytes)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}

export async function writeR22MatrixPreparation() {
  const prepared = await prepareR22MatrixManifest()
  if (fs.existsSync(MATRIX_BUILD)) throw new Error('matrix build already exists; no overwrite')
  fs.mkdirSync(MATRIX_BUILD, { mode: 0o700 })
  const dirfd = fs.openSync(MATRIX_BUILD, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    ownedWrite(MATRIX_CANONICAL, prepared.canonicalBytes)
    ownedWrite(MATRIX_MANIFEST, serializeR22Preparation(prepared))
    fs.fsyncSync(dirfd)
    return Object.freeze({
      manifestDigest: prepared.manifestDigest,
      canonicalSha256: prepared.canonicalSha256,
      manifestFileSha256: sha(fs.readFileSync(MATRIX_MANIFEST)),
      artifacts: prepared.manifest.artifacts.length,
      runtimeEligible: false,
    })
  } finally {
    fs.closeSync(dirfd)
  }
}

async function readExactOutput(file) {
  const before = await fsp.lstat(file)
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.uid !== process.getuid() ||
    (before.mode & 0o7777) !== 0o600 ||
    before.nlink !== 1
  )
    throw new Error('matrix preparation file identity drift')
  const handle = await fsp.open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const same = state =>
      state.isFile() &&
      !state.isSymbolicLink() &&
      ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs'].every(key => state[key] === before[key])
    if (!same(await handle.stat())) throw new Error('matrix preparation file changed before read')
    const bytes = await handle.readFile()
    if (bytes.length !== before.size || !same(await handle.stat()) || !same(await fsp.lstat(file)))
      throw new Error('matrix preparation file changed during read')
    return bytes
  } finally {
    await handle.close()
  }
}

export async function verifyR22MatrixPreparation() {
  const prepared = await prepareR22MatrixManifest()
  const directory = await fsp.lstat(MATRIX_BUILD)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('matrix preparation directory drift')
  const entries = (await fsp.readdir(MATRIX_BUILD)).sort()
  if (JSON.stringify(entries) !== JSON.stringify(['canonical-bridge.mjs', 'manifest.json']))
    throw new Error('matrix preparation output membership drift')
  const [manifestBytes, canonicalBytes] = await Promise.all([
    readExactOutput(MATRIX_MANIFEST),
    readExactOutput(MATRIX_CANONICAL),
  ])
  const envelope = JSON.parse(manifestBytes.toString('utf8'))
  if (
    envelope.schema !== 'appraise.m02-ta-matrix-r22-preparation/v1' ||
    envelope.manifestDigest !== prepared.manifestDigest ||
    envelope.manifestDigest !== digest(envelope.manifest) ||
    sha(Buffer.from(JSON.stringify(envelope.manifest))) !== sha(Buffer.from(JSON.stringify(prepared.manifest))) ||
    envelope.canonicalSha256 !== prepared.canonicalSha256 ||
    sha(canonicalBytes) !== prepared.canonicalSha256 ||
    envelope.runtimeEligible !== false ||
    envelope.exactArtifactReviewRequired !== true ||
    envelope.blockers?.length !== 0
  )
    throw new Error('matrix preparation drift')
  return Object.freeze({
    manifest: envelope.manifest,
    manifestDigest: envelope.manifestDigest,
    blockers: [],
    runtimeEligible: false,
    canonicalSha256: envelope.canonicalSha256,
    manifestFileSha256: sha(manifestBytes),
    seal: prepared.seal,
  })
}
