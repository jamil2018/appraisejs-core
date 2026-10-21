#!/usr/bin/env node
// Offline exact-source preparation only. This module never launches Codex or Rust.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const defaultBundle = path.resolve(here, '../tasks/codex-app-server-journeys/m06-native-patch-10')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => {
  throw new Error(message)
}
// Exact accepted amendment 10b. This is a fixed copy fact, not a link policy option.
const PINNED_LICENSE = Object.freeze({
  sourceRevision: '4ebc485ca321243727539187169425fcf972f2c4',
  path: 'codex-rs/vendor/bubblewrap/LICENSE',
  mode: '120000',
  blob: 'd24842f3cdcf2e447f9a7a26fa387ad63f5c4b91',
  target: 'COPYING',
  length: 7,
  sha256: '400d38e5cfee181230373a8b02d38f50271a5bf62c62410382efddb8e8b19e22',
  targetPath: 'codex-rs/vendor/bubblewrap/COPYING',
  targetMode: '100644',
  targetBlob: '5bc8fb2c8f757e34a0d8f4644f589d57609e213f',
  targetLength: 25383,
  targetSha256: 'b7993225104d90ddd8024fd838faf300bea5e83d91203eab98e29512acebd69c',
})
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const sameFields = (before, after, fields) => fields.every(field => before[field] === after[field])
const pinnedLinkBytesMatch = bytes =>
  bytes.toString() === PINNED_LICENSE.target &&
  bytes.length === PINNED_LICENSE.length &&
  sha256(bytes) === PINNED_LICENSE.sha256 &&
  gitBlob(bytes) === PINNED_LICENSE.blob
const pinnedTargetBytesMatch = bytes =>
  bytes.length === PINNED_LICENSE.targetLength &&
  sha256(bytes) === PINNED_LICENSE.targetSha256 &&
  gitBlob(bytes) === PINNED_LICENSE.targetBlob
function validatePinnedLinkRead(before, after, bytes) {
  if (!sameFields(before, after, ['ino', 'dev', 'ctimeMs']) || !pinnedLinkBytesMatch(bytes))
    fail('pinned license link mismatch')
}
function readPinnedLicense(root) {
  const absolute = path.join(root, PINNED_LICENSE.path)
  noSymlinks(path.dirname(absolute))
  const before = fs.lstatSync(absolute)
  if (!before.isSymbolicLink()) fail('pinned license must remain a symlink')
  const bytes = fs.readlinkSync(absolute, { encoding: 'buffer' })
  const after = fs.lstatSync(absolute)
  validatePinnedLinkRead(before, after, bytes)
  const target = readRegular(root, PINNED_LICENSE.targetPath, '644')
  if (!pinnedTargetBytesMatch(target)) fail('pinned COPYING target mismatch')
  return bytes
}
function validatePinnedDeclaration(manifest) {
  if (
    manifest.sourceRevision !== PINNED_LICENSE.sourceRevision ||
    JSON.stringify(manifest.copiedPinnedSymlink) !== JSON.stringify(PINNED_LICENSE)
  )
    fail('unapproved symlink or pinned license metadata mismatch')
}
function validatePinnedLinkEntry(links) {
  if (links.length !== 1) fail('unapproved symlink or pinned license metadata mismatch')
  if (links[0].path !== PINNED_LICENSE.path || links[0].blob !== PINNED_LICENSE.blob)
    fail('unapproved symlink or pinned license metadata mismatch')
}
function validatePinnedPatchTargets(manifest) {
  if (manifest.changedPaths.some(name => [PINNED_LICENSE.path, PINNED_LICENSE.targetPath].includes(name)))
    fail('unapproved symlink or pinned license metadata mismatch')
}
function validatePinnedTargetEntry(entries) {
  const target = entries.find(entry => entry.path === PINNED_LICENSE.targetPath)
  if (!target || target.mode !== PINNED_LICENSE.targetMode || target.blob !== PINNED_LICENSE.targetBlob)
    fail('pinned COPYING Git metadata mismatch')
}
function validatePinnedLicense(root, entries, manifest) {
  const links = entries.filter(entry => entry.mode === '120000')
  if (!links.length && manifest.copiedPinnedSymlink === undefined) return false
  validatePinnedDeclaration(manifest)
  validatePinnedLinkEntry(links)
  validatePinnedPatchTargets(manifest)
  validatePinnedTargetEntry(entries)
  readPinnedLicense(root)
  return true
}
function validateCopiedLeaf(relative, stat, root, expected, licensePath) {
  if (!expected.has(relative)) fail('unexpected copied entry/link')
  if (relative === licensePath) readPinnedLicense(root)
  else if (!stat.isFile()) fail('unexpected copied source symlink/type')
}
function walkCopiedTree(directory, prefix, root, expected, licensePath) {
  for (const name of fs.readdirSync(directory)) {
    const relative = prefix + name
    const absolute = path.join(directory, name)
    const stat = fs.lstatSync(absolute)
    if (stat.isDirectory()) walkCopiedTree(absolute, relative + '/', root, expected, licensePath)
    else validateCopiedLeaf(relative, stat, root, expected, licensePath)
  }
}
function validateCopiedPostimage(root, entry, inputs, outputs) {
  if (entry.mode === '120000') return
  const bytes = readRegular(root, entry.path, entry.mode.slice(3))
  if (!bytes.equals(outputs.get(entry.path) ?? inputs.get(entry.path))) fail('copied source postimage mismatch')
}
function validateCopiedTree(root, entries, inputs, outputs, hasLicense) {
  const expected = new Set(entries.map(entry => entry.path))
  walkCopiedTree(root, '', root, expected, hasLicense ? PINNED_LICENSE.path : null)
  for (const entry of entries) validateCopiedPostimage(root, entry, inputs, outputs)
}
function git(root, args) {
  const result = spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', '-C', root, ...args],
    {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    },
  )
  if (result.status !== 0) fail(`git source inspection failed: ${args[0]}`)
  return result.stdout
}
function validatePathText(value) {
  if (typeof value !== 'string' || !value) fail('unsafe declared path')
  if (/[\\\x00-\x1f]/.test(value)) fail('unsafe declared path')
}
function safePath(value) {
  validatePathText(value)
  if (path.posix.isAbsolute(value) || value.split('/').some(p => !p || p === '.' || p === '..'))
    fail('unsafe declared path')
  return value
}
function noSymlinks(absolute) {
  let cursor = path.parse(absolute).root
  for (const part of absolute.slice(cursor.length).split('/').filter(Boolean)) {
    cursor = path.join(cursor, part)
    if (fs.lstatSync(cursor).isSymbolicLink()) fail(`symlink refused: ${cursor}`)
  }
}
function readRegular(root, relative, mode) {
  const absolute = path.join(root, safePath(relative))
  noSymlinks(absolute)
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const before = fs.fstatSync(fd)
    if (!before.isFile() || (before.mode & 0o7777) !== parseInt(mode, 8)) fail(`source mode/type mismatch: ${relative}`)
    const bytes = fs.readFileSync(fd)
    const after = fs.lstatSync(absolute)
    if (!regularReadIsStable(before, after, bytes)) fail(`source changed during read: ${relative}`)
    return bytes
  } finally {
    fs.closeSync(fd)
  }
}
function regularReadIsStable(before, after, bytes) {
  if (!sameFields(before, after, ['ino', 'dev'])) return false
  if (before.size !== bytes.length) return false
  return sameFields(before, after, ['mtimeMs', 'ctimeMs'])
}

function patchLines(patchBytes) {
  const patch = patchBytes.toString('utf8')
  if (!Buffer.from(patch).equals(patchBytes) || !patch.endsWith('\n')) fail('invalid patch encoding/newline')
  return patch.slice(0, -1).split('\n')
}
function patchName(header) {
  if (!header || header[1] !== header[2]) fail('unsupported patch header/path')
  return safePath(header[1])
}
function validatePatchTarget(name, declaredPaths, outputs) {
  if ([PINNED_LICENSE.path, PINNED_LICENSE.targetPath].includes(name)) fail('license entries cannot be patch targets')
  if (!declaredPaths.includes(name) || outputs.has(name)) fail('undeclared/duplicate patch path')
}
function patchMode(line, name, expectedModes) {
  const index = /^index [0-9a-f]+\.\.[0-9a-f]+ (100644|100755)$/.exec(line)
  if (!index) fail('unsupported patch mode')
  if (expectedModes && expectedModes.get(name) !== index[1]) fail('patch mode drift')
}
function patchFileHeader(state, declaredPaths, outputs, expectedModes) {
  const { lines } = state
  const header = /^diff --git a\/(\S+) b\/(\S+)$/.exec(lines[state.index++])
  const name = patchName(header)
  validatePatchTarget(name, declaredPaths, outputs)
  patchMode(lines[state.index++], name, expectedModes)
  if (lines[state.index++] !== `--- a/${name}` || lines[state.index++] !== `+++ b/${name}`) fail('patch path drift')
  return name
}
function patchSource(bytes) {
  if (!bytes || !bytes.toString('utf8').endsWith('\n')) fail('missing/non-text patch preimage')
  return bytes.toString('utf8').slice(0, -1).split('\n')
}
function patchHunkHeader(line) {
  const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/.exec(line)
  if (!hunk) fail('invalid patch hunk')
  return {
    oldStart: Number(hunk[1]) - 1,
    oldCount: Number(hunk[2] ?? 1),
    newStart: Number(hunk[3]) - 1,
    newCount: Number(hunk[4] ?? 1),
  }
}
function startPatchHunk(file, hunk) {
  if (hunk.oldStart < file.cursor || hunk.oldStart > file.source.length) fail('patch offset/overlap refused')
  file.result.push(...file.source.slice(file.cursor, hunk.oldStart))
  file.cursor = hunk.oldStart
  if (file.result.length !== hunk.newStart) fail('patch new offset refused')
}
function consumePatchContext(file, counts, content) {
  if (file.source[file.cursor++] !== content) fail('patch preimage context/offset mismatch')
  counts.oldSeen++
}
function consumePatchLine(line, file, counts) {
  const content = line.slice(1)
  switch (line[0]) {
    case ' ':
      consumePatchContext(file, counts, content)
      file.result.push(content)
      counts.newSeen++
      break
    case '-':
      consumePatchContext(file, counts, content)
      break
    case '+':
      file.result.push(content)
      counts.newSeen++
      break
    default:
      fail('unsupported patch line/fuzz')
  }
}
function consumePatchHunk(state, file) {
  const { lines } = state
  const counts = { oldSeen: 0, newSeen: 0 }
  while (
    state.index < lines.length &&
    !lines[state.index].startsWith('@@ ') &&
    !lines[state.index].startsWith('diff --git ')
  )
    consumePatchLine(lines[state.index++], file, counts)
  return counts
}
function applyPatchHunk(state, file) {
  const hunk = patchHunkHeader(state.lines[state.index++])
  startPatchHunk(file, hunk)
  const counts = consumePatchHunk(state, file)
  if (counts.oldSeen !== hunk.oldCount || counts.newSeen !== hunk.newCount) fail('patch hunk count mismatch')
}
function patchedFile(state, source) {
  const file = { source, result: [], cursor: 0 }
  let hunks = 0
  while (state.index < state.lines.length && !state.lines[state.index].startsWith('diff --git ')) {
    applyPatchHunk(state, file)
    hunks++
  }
  if (!hunks) fail('empty patch file')
  file.result.push(...source.slice(file.cursor))
  return Buffer.from(file.result.join('\n') + '\n')
}

// Deliberately no fuzzy matching, offset search, external patch command or hooks.
export function applyExactPatch(patchBytes, inputs, declaredPaths, expectedModes) {
  const state = { lines: patchLines(patchBytes), index: 0 }
  const outputs = new Map()
  while (state.index < state.lines.length) {
    const name = patchFileHeader(state, declaredPaths, outputs, expectedModes)
    outputs.set(name, patchedFile(state, patchSource(inputs.get(name))))
  }
  if (outputs.size !== declaredPaths.length) fail('declared path drift')
  return outputs
}

const isWithin = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep)
function validateReceiptPath(receipt, source, destination) {
  if (isWithin(receipt, source) || isWithin(receipt, destination)) fail('receipt must be outside source/destination')
  if (fs.existsSync(receipt)) fail('receipt must be new')
}
function resolveReceipt(receipt, source, destination) {
  if (!receipt) return receipt
  receipt = path.resolve(receipt)
  noSymlinks(path.dirname(receipt))
  validateReceiptPath(receipt, source, destination)
  return receipt
}
function validateDestination(source, destination) {
  if (fs.existsSync(destination) || fs.lstatSync(path.dirname(destination)).isSymbolicLink())
    fail('destination must be new')
  if (isWithin(destination, source)) fail('destination inside source refused')
}
function preflightPaths(source, destination, bundle, receipt) {
  noSymlinks(source)
  noSymlinks(path.resolve(bundle))
  noSymlinks(path.join(path.resolve(bundle), 'manifest.json'))
  noSymlinks(path.join(path.resolve(bundle), 'ordinary-cancel-v1.patch'))
  noSymlinks(path.dirname(destination))
  receipt = resolveReceipt(receipt, source, destination)
  validateDestination(source, destination)
  return receipt
}
const validSourceIdentity = manifest =>
  /^[0-9a-f]{40}$/.test(manifest.sourceRevision) && /^[0-9a-f]{40}$/.test(manifest.sourceTree)
function validateManifestIdentity(manifest) {
  if (manifest.version !== 1 || manifest.status !== 'CANDIDATE_COMPILE_UNVERIFIED') fail('invalid candidate manifest')
  if (!validSourceIdentity(manifest)) fail('invalid candidate manifest')
}
function validateChangedPaths(changedPaths) {
  if (!Array.isArray(changedPaths) || !changedPaths.length || new Set(changedPaths).size !== changedPaths.length)
    fail('invalid manifest path inventory')
}
function validateImageDigest(image) {
  if (!/^[0-9a-f]{64}$/.test(image?.sha256)) fail('invalid manifest preimage/postimage')
}
function validateManifestFile(file, declaredPath) {
  if (file.path !== declaredPath) fail('invalid manifest preimage/postimage')
  if (!['100644', '100755'].includes(file.preimage?.mode)) fail('invalid manifest preimage/postimage')
  validateImageModeAndDigests(file)
}
function validateImageModeAndDigests(file) {
  if (file.postimage?.mode !== file.preimage.mode) fail('invalid manifest preimage/postimage')
  validateImageDigest(file.preimage)
  validateImageDigest(file.postimage)
}
function validateManifestInventory(manifest) {
  validateChangedPaths(manifest.changedPaths)
  if (!Array.isArray(manifest.files) || manifest.files.length !== manifest.changedPaths.length)
    fail('invalid manifest path inventory')
  manifest.changedPaths.forEach(safePath)
  for (const [index, file] of manifest.files.entries()) validateManifestFile(file, manifest.changedPaths[index])
}
function validateSourcePin(source, manifest) {
  if (
    git(source, ['rev-parse', 'HEAD']).trim() !== manifest.sourceRevision ||
    git(source, ['rev-parse', 'HEAD^{tree}']).trim() !== manifest.sourceTree
  )
    fail('wrong source pin/tree')
  if (git(source, ['status', '--porcelain=v1', '--untracked-files=all']).length) fail('dirty source refused')
}
function trackedEntries(source) {
  return git(source, ['ls-files', '--stage', '-z'])
    .split('\0')
    .filter(Boolean)
    .map(entry => {
      const match = /^(100644|100755|120000) ([0-9a-f]{40}) 0\t(.+)$/.exec(entry)
      if (!match) fail('nonregular/unmerged tracked source refused')
      return { mode: match[1], blob: match[2], path: safePath(match[3]) }
    })
}
function captureTrackedInputs(source, entries) {
  const inputs = new Map()
  // Validate every tracked byte and mode; ignored files are never read or copied.
  for (const entry of entries) {
    const bytes =
      entry.mode === '120000' ? readPinnedLicense(source) : readRegular(source, entry.path, entry.mode.slice(3))
    if (gitBlob(bytes) !== entry.blob) fail(`tracked source preimage mismatch: ${entry.path}`)
    inputs.set(entry.path, bytes)
  }
  return inputs
}
function validateDeclaredPreimage(file, entries, inputs) {
  const entry = entries.find(entry => entry.path === file.path)
  if (!entry || entry.mode !== file.preimage.mode || sha256(inputs.get(file.path)) !== file.preimage.sha256)
    fail('manifest preimage mismatch')
}
function patchedOutputs(patchBytes, manifest, entries, inputs) {
  for (const file of manifest.files) validateDeclaredPreimage(file, entries, inputs)
  const outputs = applyExactPatch(
    patchBytes,
    inputs,
    manifest.changedPaths,
    new Map(manifest.files.map(file => [file.path, file.preimage.mode])),
  )
  for (const file of manifest.files) {
    if (sha256(outputs.get(file.path)) !== file.postimage.sha256) fail('manifest postimage mismatch')
  }
  return outputs
}
function copyTrackedRegularFiles(destination, entries, inputs, outputs) {
  for (const entry of entries) {
    if (entry.mode === '120000') continue
    const target = path.join(destination, entry.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, outputs.get(entry.path) ?? inputs.get(entry.path), {
      flag: 'wx',
      mode: parseInt(entry.mode.slice(3), 8),
    })
    fs.chmodSync(target, parseInt(entry.mode.slice(3), 8))
  }
}
function copyPinnedLicense(destination, hasLicense) {
  if (!hasLicense) return
  // Sibling COPYING has already been copied and validated as a regular file.
  const target = readRegular(destination, PINNED_LICENSE.targetPath, '644')
  if (sha256(target) !== PINNED_LICENSE.targetSha256) fail('copied COPYING mismatch')
  fs.symlinkSync(PINNED_LICENSE.target, path.join(destination, PINNED_LICENSE.path))
  readPinnedLicense(destination)
}
function validateWrittenChanges(destination, manifest) {
  for (const file of manifest.files) {
    if (sha256(readRegular(destination, file.path, file.postimage.mode.slice(3))) !== file.postimage.sha256)
      fail('written postimage mismatch')
  }
}
function validateSourceAfterCopy(source, manifest) {
  if (
    git(source, ['rev-parse', 'HEAD']).trim() !== manifest.sourceRevision ||
    git(source, ['status', '--porcelain=v1', '--untracked-files=all']).length
  )
    fail('source drift during preparation')
}
function validateOriginalInputs(source, entries, inputs) {
  for (const entry of entries) {
    const bytes =
      entry.mode === '120000' ? readPinnedLicense(source) : readRegular(source, entry.path, entry.mode.slice(3))
    if (!bytes.equals(inputs.get(entry.path))) fail('source mutation during preparation')
  }
}
function preparationResult(source, destination, manifestBytes, manifest, entries, hasLicense) {
  return {
    version: 1,
    status: manifest.status,
    source,
    destination,
    sourceRevision: manifest.sourceRevision,
    manifestSha256: sha256(manifestBytes),
    patchSha256: manifest.patchSha256,
    copiedTrackedFiles: entries.length,
    copiedPinnedSymlink: hasLicense ? PINNED_LICENSE : null,
    changedPaths: manifest.changedPaths,
    rustCompilation: 'UNEXECUTED',
    rustTests: 'UNEXECUTED',
    nativeExecution: false,
    runtimeQualified: false,
  }
}
export function prepareNativePatch({ source, destination, bundle = defaultBundle, receipt }) {
  source = path.resolve(source)
  destination = path.resolve(destination)
  receipt = preflightPaths(source, destination, bundle, receipt)
  const manifestBytes = fs.readFileSync(path.join(bundle, 'manifest.json'))
  const manifest = JSON.parse(manifestBytes)
  validateManifestIdentity(manifest)
  validateManifestInventory(manifest)
  validateSourcePin(source, manifest)
  const patchBytes = fs.readFileSync(path.join(bundle, 'ordinary-cancel-v1.patch'))
  if (sha256(patchBytes) !== manifest.patchSha256) fail('patch digest drift')
  const entries = trackedEntries(source)
  const hasLicense = validatePinnedLicense(source, entries, manifest)
  const inputs = captureTrackedInputs(source, entries)
  const outputs = patchedOutputs(patchBytes, manifest, entries, inputs)
  // Exclusive creation is the consume-once boundary. Failed copies are retained.
  fs.mkdirSync(destination, { mode: 0o700 })
  let status = 'FAILED'
  try {
    copyTrackedRegularFiles(destination, entries, inputs, outputs)
    copyPinnedLicense(destination, hasLicense)
    validateCopiedTree(destination, entries, inputs, outputs, hasLicense)
    validateWrittenChanges(destination, manifest)
    validateSourceAfterCopy(source, manifest)
    validatePinnedLicense(source, entries, manifest)
    validateOriginalInputs(source, entries, inputs)
    const result = preparationResult(source, destination, manifestBytes, manifest, entries, hasLicense)
    if (receipt) fs.writeFileSync(receipt, JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    status = manifest.status
    return result
  } finally {
    fs.writeFileSync(
      path.join(destination, 'M06-PREPARATION-STATUS.json'),
      JSON.stringify({ status, reusable: false }) + '\n',
      { flag: 'wx', mode: 0o600 },
    )
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 6 || args[0] !== '--source' || args[2] !== '--destination' || args[4] !== '--receipt')
      fail('usage: --source PATH --destination NEW_PATH --receipt NEW_PATH')
    console.log(
      JSON.stringify(prepareNativePatch({ source: args[1], destination: args[3], receipt: args[5] }), null, 2),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
