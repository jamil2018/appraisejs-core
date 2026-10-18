/** Offline exact-artifact preparation; import and pure verification perform no writes. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { prepareR17MatrixManifest } from './manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../')
export const MATRIX_BUILD = join(REPO, '.appraisejs/m02-ta-matrix-build-r17')
export const MATRIX_MANIFEST = join(MATRIX_BUILD, 'manifest.json')
export const MATRIX_CANONICAL = join(MATRIX_BUILD, 'canonical-bridge.mjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

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

export async function writeR17MatrixPreparation() {
  const prepared = await prepareR17MatrixManifest()
  if (fs.existsSync(MATRIX_BUILD)) throw new Error('matrix build already exists; no overwrite')
  fs.mkdirSync(MATRIX_BUILD, { mode: 0o700 })
  const dirfd = fs.openSync(MATRIX_BUILD, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    ownedWrite(MATRIX_CANONICAL, prepared.canonicalBytes)
    const envelope = {
      schema: 'appraise.m02-ta-matrix-r17-preparation/v1',
      manifest: prepared.manifest,
      manifestDigest: prepared.manifestDigest,
      canonicalSha256: prepared.canonicalSha256,
      blockers: [],
      runtimeEligible: false,
      exactArtifactReviewRequired: true,
    }
    ownedWrite(MATRIX_MANIFEST, Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`))
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

export async function verifyR17MatrixPreparation() {
  const prepared = await prepareR17MatrixManifest()
  const directory = await fsp.lstat(MATRIX_BUILD)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('matrix preparation directory drift')
  for (const file of [MATRIX_MANIFEST, MATRIX_CANONICAL]) {
    const state = await fsp.lstat(file)
    if (!state.isFile() || state.isSymbolicLink() || state.uid !== process.getuid() || (state.mode & 0o777) !== 0o600)
      throw new Error('matrix preparation file identity drift')
  }
  const envelope = JSON.parse(await fsp.readFile(MATRIX_MANIFEST, 'utf8'))
  if (
    envelope.schema !== 'appraise.m02-ta-matrix-r17-preparation/v1' ||
    envelope.manifestDigest !== prepared.manifestDigest ||
    envelope.manifestDigest !== digest(envelope.manifest) ||
    sha(Buffer.from(JSON.stringify(envelope.manifest))) !== sha(Buffer.from(JSON.stringify(prepared.manifest))) ||
    envelope.canonicalSha256 !== prepared.canonicalSha256 ||
    sha(await fsp.readFile(MATRIX_CANONICAL)) !== prepared.canonicalSha256 ||
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
    manifestFileSha256: sha(await fsp.readFile(MATRIX_MANIFEST)),
    seal: prepared.seal,
  })
}
