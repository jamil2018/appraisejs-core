/** R11 T3 preparation is exclusive and cannot run before accepted actual T2 evidence. */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest } from '../codex-app-server-m02-ta-runtime-r9/policy.mjs'
import { prepareWorkspaceManifest } from './manifest.mjs'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../')
export const WORKSPACE_BUILD = join(REPO, '.appraisejs/m02-ta-workspace-build-r11')
export const WORKSPACE_MANIFEST = join(WORKSPACE_BUILD, 'manifest.json')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/** Invoked only by a later reviewed --prepare command; never by import, --verify, or tests. */
export async function writeWorkspacePreparation() {
  const prepared = await prepareWorkspaceManifest()
  if (
    prepared.blockers?.length ||
    prepared.manifest.blockers?.length ||
    prepared.manifest.ta03?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED'
  )
    throw new Error('T3 TA03 preparation criteria incomplete')
  if (fs.existsSync(WORKSPACE_BUILD)) throw new Error('T3 preparation already exists; no overwrite')
  fs.mkdirSync(WORKSPACE_BUILD, { mode: 0o700 })
  const dirfd = fs.openSync(WORKSPACE_BUILD, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW)
  try {
    const envelope = {
      schema: 'appraise.m02-ta-workspace-r11-preparation/v1',
      manifest: prepared.manifest,
      manifestDigest: prepared.manifestDigest,
      canonicalSha256: prepared.canonicalSha256,
      blockers: [],
      runtimeEligible: false,
      exactArtifactReviewRequired: true,
    }
    const bytes = Buffer.from(`${JSON.stringify(envelope, null, 2)}\n`)
    const fd = fs.openSync(
      WORKSPACE_MANIFEST,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
      0o600,
    )
    try {
      fs.writeFileSync(fd, bytes)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.fsyncSync(dirfd)
    return Object.freeze({
      manifestDigest: prepared.manifestDigest,
      manifestFileSha256: sha(bytes),
      artifacts: prepared.manifest.artifacts.length,
      runtimeEligible: false,
    })
  } finally {
    fs.closeSync(dirfd)
  }
}

export async function verifyWorkspacePreparation() {
  const prepared = await prepareWorkspaceManifest()
  const directory = await fsp.lstat(WORKSPACE_BUILD)
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== process.getuid() ||
    (directory.mode & 0o777) !== 0o700
  )
    throw new Error('T3 preparation directory identity changed')
  const state = await fsp.lstat(WORKSPACE_MANIFEST)
  if (
    !state.isFile() ||
    state.isSymbolicLink() ||
    state.uid !== process.getuid() ||
    state.nlink !== 1 ||
    (state.mode & 0o777) !== 0o600
  )
    throw new Error('T3 preparation manifest identity changed')
  const bytes = await fsp.readFile(WORKSPACE_MANIFEST)
  const envelope = JSON.parse(bytes)
  if (
    envelope.schema !== 'appraise.m02-ta-workspace-r11-preparation/v1' ||
    envelope.manifestDigest !== prepared.manifestDigest ||
    envelope.manifestDigest !== digest(envelope.manifest) ||
    sha(Buffer.from(JSON.stringify(envelope.manifest))) !== sha(Buffer.from(JSON.stringify(prepared.manifest))) ||
    envelope.canonicalSha256 !== prepared.canonicalSha256 ||
    envelope.runtimeEligible !== false ||
    envelope.exactArtifactReviewRequired !== true ||
    envelope.blockers?.length !== 0 ||
    envelope.manifest.blockers?.length !== 0 ||
    envelope.manifest.ta03?.nativeScratchHelperInventory !== 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED'
  )
    throw new Error('T3 preparation drift')
  return Object.freeze({
    manifest: envelope.manifest,
    manifestDigest: envelope.manifestDigest,
    manifestFileSha256: sha(bytes),
    seal: prepared.seal,
    runtimeEligible: false,
    blockers: [],
  })
}
