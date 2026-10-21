#!/usr/bin/env node
// Exact offline source assembly. Never executes Codex, Rust, or a provider.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { prepareNativePatch } from './m06-native-patch-10.mjs'

export const bundle12 = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../tasks/codex-app-server-journeys/m06-native-patch-12',
)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => {
  throw new Error(message)
}
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
function validatePathText(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(value)) fail('unsafe source/payload path')
}
function safePath(value) {
  validatePathText(value)
  if (value.split('/').some(part => !part || part === '.' || part === '..') || path.isAbsolute(value))
    fail('unsafe source/payload path')
  return value
}
function noLinks(absolute) {
  const parts = path.resolve(absolute).split(path.sep).filter(Boolean)
  let current = path.parse(path.resolve(absolute)).root
  for (const part of parts) {
    current = path.join(current, part)
    const stat = fs.lstatSync(current)
    if (stat.isSymbolicLink()) fail('symlink ancestor refused')
    if (!stat.isDirectory()) fail('non-directory ancestor refused')
  }
}
const sameFields = (first, second, fields) => fields.every(field => first[field] === second[field])
const fileModeMatches = (stat, mode) => stat.isFile() && (mode === undefined || (stat.mode & 0o777) === mode)
const fileReadIsStable = (opened, before, after, bytes) =>
  sameFields(opened, before, ['ino', 'dev']) &&
  sameFields(after, before, ['ino', 'dev', 'ctimeMs']) &&
  bytes.length === before.size
function readFile(absolute, mode) {
  noLinks(path.dirname(absolute))
  const before = fs.lstatSync(absolute)
  if (!fileModeMatches(before, mode)) fail('nonregular file or mode mismatch')
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const opened = fs.fstatSync(fd)
    const bytes = fs.readFileSync(fd)
    const after = fs.lstatSync(absolute)
    if (!fileReadIsStable(opened, before, after, bytes)) fail('file identity drift')
    return bytes
  } finally {
    fs.closeSync(fd)
  }
}
function absent(absolute) {
  try {
    fs.lstatSync(absolute)
    fail('ABSENT preimage already exists')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
function exclusiveFile(absolute, bytes, mode) {
  noLinks(path.dirname(absolute))
  const fd = fs.openSync(
    absolute,
    fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW | fs.constants.O_WRONLY,
    mode,
  )
  try {
    // A short write is retained as a failed attempt, never retried/replayed.
    if (fs.writeSync(fd, bytes, 0, bytes.length) !== bytes.length) fail('short addition/receipt write')
    fs.fchmodSync(fd, mode)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  if (!readFile(absolute, mode).equals(bytes)) fail('written addition/receipt mismatch')
}
function createAncestor(absolute) {
  try {
    fs.mkdirSync(absolute, { mode: 0o755 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
}
function validateAncestor(absolute) {
  const stat = fs.lstatSync(absolute)
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe addition ancestor')
}
function makeAncestors(root, relative) {
  let current = root
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part)
    createAncestor(current)
    validateAncestor(current)
  }
}
function walk(root, prefix = '') {
  return fs
    .readdirSync(path.join(root, prefix))
    .flatMap(name => {
      const relative = prefix + name
      const stat = fs.lstatSync(path.join(root, relative))
      return stat.isDirectory() && !stat.isSymbolicLink() ? walk(root, relative + '/') : [relative]
    })
    .sort()
}
function validateTrackedPathText(value) {
  if (value.includes('\\') || /[\x00-\x1f]/.test(value) || path.isAbsolute(value)) fail('unsafe tracked path')
}
function trackedPath(value) {
  validateTrackedPathText(value)
  if (value.split('/').some(part => !part || part === '.' || part === '..')) fail('unsafe tracked path')
  return value
}
function parseGitEntry(value) {
  const match = /^(100644|100755|120000) [a-f0-9]{40} 0\t(.+)$/.exec(value)
  if (!match) fail('invalid source inventory')
  return { path: trackedPath(match[2]), mode: match[1] }
}
function gitEntries(source) {
  const result = spawnSync('git', ['-c', 'core.fsmonitor=false', '-C', source, 'ls-files', '--stage', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
  })
  if (result.status !== 0) fail('source inventory failed')
  return result.stdout
    .split('\0')
    .filter(Boolean)
    .map(parseGitEntry)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
const isWithin = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep)
function resolveFinalReceipt(receipt) {
  if (!receipt) fail('final receipt required')
  return path.resolve(receipt)
}
function validateOutputLocation(candidate, source, bundle) {
  if (isWithin(candidate, source) || isWithin(candidate, bundle)) fail('output inside source/bundle refused')
}
function preflightOutputs(source, destination, receipt, bundle, intermediateReceipt, intermediateScopeReceipt) {
  noLinks(path.dirname(receipt))
  noLinks(path.dirname(destination))
  absent(receipt)
  absent(intermediateReceipt)
  absent(intermediateScopeReceipt)
  absent(destination)
  noLinks(bundle)
  for (const candidate of [receipt, intermediateReceipt, intermediateScopeReceipt, destination])
    validateOutputLocation(candidate, source, bundle)
  if (isWithin(receipt, destination)) fail('receipt inside destination refused')
}
const validSourceIdentity = manifest =>
  /^[a-f0-9]{40}$/.test(manifest.sourceRevision) && /^[a-f0-9]{40}$/.test(manifest.sourceTree)
function validateManifestHeader(manifest) {
  if (manifest.version !== 2 || manifest.status !== 'CANDIDATE_COMPILE_UNVERIFIED' || !validSourceIdentity(manifest))
    fail('invalid v2 manifest')
}
function validateAdditionList(additions) {
  if (!Array.isArray(additions) || !additions.length || additions.length > 64) fail('invalid v2 manifest')
}
function readBundle(bundle) {
  const manifestBytes = readFile(path.join(bundle, 'manifest.json'), 0o644)
  const manifest = JSON.parse(manifestBytes)
  validateManifestHeader(manifest)
  if (!digest(manifest.existingManifestSha256)) fail('invalid v2 manifest')
  validateAdditionList(manifest.additions)
  const existingBytes = readFile(path.join(bundle, 'existing/manifest.json'), 0o644)
  if (hash(existingBytes) !== manifest.existingManifestSha256) fail('existing manifest digest drift')
  const existing = JSON.parse(existingBytes)
  validateNestedIdentity(existing, manifest)
  return { manifestBytes, manifest, existingBytes, existing }
}
function validateNestedIdentity(existing, manifest) {
  if (existing.sourceRevision !== manifest.sourceRevision || existing.sourceTree !== manifest.sourceTree)
    fail('nested source identity mismatch')
}
function validateAdditionIdentity(item) {
  if (item.preimage !== 'ABSENT' || item.mode !== '100644') fail('invalid ABSENT addition')
}
function validateAdditionLength(length) {
  if (!Number.isSafeInteger(length) || length < 1 || length > 1024 * 1024) fail('invalid ABSENT addition')
}
function validateAdditionShape(item) {
  if (!item || Object.keys(item).sort().join(',') !== 'length,mode,path,payload,preimage,sha256')
    fail('invalid ABSENT addition')
  validateAdditionIdentity(item)
  validateAdditionLength(item.length)
  if (!digest(item.sha256)) fail('invalid ABSENT addition')
}
function validateAdditionConflict(item, last, tracked, existing) {
  if (item.path <= last || tracked.has(item.path) || existing.changedPaths.includes(item.path))
    fail('duplicate/conflicting addition')
}
function validateAdditionPayloadPath(item) {
  if (item.payload !== 'additions/' + item.path || item.path === 'M06-PREPARATION-STATUS.json')
    fail('duplicate/conflicting addition')
}
const exactUtf8Text = bytes =>
  Buffer.from(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).equals(bytes) && !bytes.includes(0)
function validateAdditionBytes(bytes, item) {
  if (bytes.length !== item.length || hash(bytes) !== item.sha256 || !exactUtf8Text(bytes))
    fail('addition payload drift/nontext')
}
function captureAdditions(source, bundle, manifest, existing, tracked) {
  const payloads = new Map()
  let last = ''
  for (const item of manifest.additions) {
    validateAdditionShape(item)
    safePath(item.path)
    safePath(item.payload)
    validateAdditionConflict(item, last, tracked, existing)
    validateAdditionPayloadPath(item)
    last = item.path
    absent(path.join(source, item.path))
    const bytes = readFile(path.join(bundle, item.payload), 0o644)
    validateAdditionBytes(bytes, item)
    payloads.set(item.path, bytes)
  }
  return payloads
}
function validatePayloadMembership(bundle, manifest) {
  if (
    JSON.stringify(walk(path.join(bundle, 'additions'))) !== JSON.stringify(manifest.additions.map(item => item.path))
  )
    fail('undeclared addition payload')
}
function intermediateScopeBytes(intermediateReceipt, intermediateBytes, manifest) {
  return Buffer.from(
    JSON.stringify(
      {
        version: 2,
        scope: 'INTERMEDIATE_EXISTING_FILES_ONLY',
        finalReceiptWritten: false,
        receipt: intermediateReceipt,
        sha256: hash(intermediateBytes),
        additionsPending: manifest.additions.length,
        nativeExecution: false,
        runtimeQualified: false,
      },
      null,
      2,
    ) + '\n',
  )
}
function writeAdditions(destination, additions, payloads) {
  for (const item of additions) {
    makeAncestors(destination, item.path)
    exclusiveFile(path.join(destination, item.path), payloads.get(item.path), 0o644)
  }
}
function expectedInventory(originals, additions) {
  return [...originals, ...additions.map(item => ({ path: item.path, mode: item.mode }))].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )
}
function validateFinalMembership(destination, expected) {
  if (
    JSON.stringify(walk(destination).filter(name => name !== 'M06-PREPARATION-STATUS.json')) !==
    JSON.stringify(expected.map(entry => entry.path))
  )
    fail('final source inventory mismatch')
}
function validateFinalLinkTarget(entry, destination, existing) {
  if (
    entry.path !== existing.copiedPinnedSymlink?.path ||
    fs.readlinkSync(path.join(destination, entry.path)) !== existing.copiedPinnedSymlink.target
  )
    fail('unexpected final source symlink')
}
function readFinalLink(entry, destination, existing) {
  validateFinalLinkTarget(entry, destination, existing)
  const bytes = fs.readlinkSync(path.join(destination, entry.path), { encoding: 'buffer' })
  if (hash(bytes) !== existing.copiedPinnedSymlink.sha256) fail('final pinned link drift')
  return bytes
}
function expectedRegularHash(entry, payloads, changed, source) {
  return payloads.has(entry.path)
    ? hash(payloads.get(entry.path))
    : (changed.get(entry.path)?.sha256 ??
        hash(readFile(path.join(source, entry.path), parseInt(entry.mode.slice(3), 8))))
}
function readFinalRegular(entry, destination, payloads, changed, source) {
  const bytes = readFile(path.join(destination, entry.path), parseInt(entry.mode.slice(3), 8))
  if (hash(bytes) !== expectedRegularHash(entry, payloads, changed, source)) fail('final source postimage drift')
  return bytes
}
function captureFinalEntry(entry, destination, existing, payloads, changed, source) {
  const bytes =
    entry.mode === '120000'
      ? readFinalLink(entry, destination, existing)
      : readFinalRegular(entry, destination, payloads, changed, source)
  return { ...entry, length: bytes.length, sha256: hash(bytes) }
}
function validateStableManifests(bundle, manifestBytes, existingBytes) {
  if (
    !readFile(path.join(bundle, 'manifest.json'), 0o644).equals(manifestBytes) ||
    !readFile(path.join(bundle, 'existing/manifest.json'), 0o644).equals(existingBytes)
  )
    fail('manifest changed during assembly')
}
function validateStablePayloads(bundle, additions, payloads) {
  for (const item of additions)
    if (!readFile(path.join(bundle, item.payload), 0o644).equals(payloads.get(item.path)))
      fail('payload changed during assembly')
}
function validateGitSourceStatus(result) {
  if (result.status !== 0 || result.stdout.length) fail('source drift during additions')
}
function validateGitSourcePin(result, manifest) {
  if (result.status !== 0 || result.stdout.trim() !== manifest.sourceRevision) fail('source drift during additions')
}
function validateSourceAfterAdditions(source, manifest) {
  const sourceState = spawnSync(
    'git',
    ['-c', 'core.fsmonitor=false', '-C', source, 'status', '--porcelain=v1', '--untracked-files=all'],
    { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } },
  )
  const sourcePin = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  validateGitSourceStatus(sourceState)
  validateGitSourcePin(sourcePin, manifest)
}
function validateOriginalRecord(record, source) {
  const match = /^(100644|100755|120000) ([a-f0-9]{40}) 0\t(.+)$/.exec(record)
  if (!match) fail('source inventory drift')
  const bytes =
    match[1] === '120000'
      ? fs.readlinkSync(path.join(source, match[3]), { encoding: 'buffer' })
      : readFile(path.join(source, match[3]), parseInt(match[1].slice(3), 8))
  if (createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== match[2])
    fail('source byte drift during additions')
}
function validateOriginalInventory(source) {
  const staged = spawnSync('git', ['-C', source, 'ls-files', '--stage', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (staged.status !== 0) fail('final source inventory failed')
  for (const record of staged.stdout.split('\0').filter(Boolean)) validateOriginalRecord(record, source)
}
function assemblyResult({
  source,
  destination,
  manifest,
  manifestBytes,
  existingBytes,
  intermediate,
  intermediateReceipt,
  intermediateBytes,
  intermediateScopeReceipt,
  intermediateScopeBytes,
  preparationStatus,
  inventory,
}) {
  return {
    version: 2,
    status: manifest.status,
    source,
    destination,
    sourceRevision: manifest.sourceRevision,
    sourceTree: manifest.sourceTree,
    manifestSha256: hash(manifestBytes),
    existingManifestSha256: hash(existingBytes),
    existingPatchSha256: intermediate.patchSha256,
    intermediate: {
      scope: 'INTERMEDIATE_EXISTING_FILES_ONLY',
      receipt: intermediateReceipt,
      sha256: hash(intermediateBytes),
      scopeReceipt: intermediateScopeReceipt,
      scopeReceiptSha256: hash(intermediateScopeBytes),
      copiedTrackedFiles: intermediate.copiedTrackedFiles,
    },
    preparationMetadata: {
      path: 'M06-PREPARATION-STATUS.json',
      sha256: hash(preparationStatus),
      scope: 'GENERIC10_EXISTING_STAGE_ONLY',
    },
    additions: manifest.additions,
    sourceInventory: inventory,
    sourceInventoryOrder: 'ASCII_PATH',
    sourceFileCount: inventory.length,
    sourceInventorySha256: hash(JSON.stringify(inventory)),
    rustCompilation: 'UNEXECUTED',
    rustTests: 'UNEXECUTED',
    rustFormatting: 'UNEXECUTED',
    nativeExecution: false,
    runtimeQualified: false,
  }
}
/** Generic exact assembler for offline tests; the CLI wrapper selects bundle12 only. */
export function prepareExactNativeBundle12({ source, destination, receipt, bundle }) {
  source = path.resolve(source)
  destination = path.resolve(destination)
  bundle = path.resolve(bundle)
  receipt = resolveFinalReceipt(receipt)
  const intermediateReceipt = receipt + '.existing.json'
  const intermediateScopeReceipt = receipt + '.existing-scope.json'
  preflightOutputs(source, destination, receipt, bundle, intermediateReceipt, intermediateScopeReceipt)
  const { manifestBytes, manifest, existingBytes, existing } = readBundle(bundle)
  const originals = gitEntries(source)
  const tracked = new Set(originals.map(entry => entry.path))
  const payloads = captureAdditions(source, bundle, manifest, existing, tracked)
  validatePayloadMembership(bundle, manifest)
  const intermediate = prepareNativePatch({
    source,
    destination,
    bundle: path.join(bundle, 'existing'),
    receipt: intermediateReceipt,
  })
  // Generic10 status is preparation metadata, never a source or final12 receipt.
  const preparationStatus = readFile(path.join(destination, 'M06-PREPARATION-STATUS.json'), 0o600)
  const intermediateBytes = readFile(intermediateReceipt, 0o600)
  const scopeBytes = intermediateScopeBytes(intermediateReceipt, intermediateBytes, manifest)
  exclusiveFile(intermediateScopeReceipt, scopeBytes, 0o600)
  writeAdditions(destination, manifest.additions, payloads)
  const expected = expectedInventory(originals, manifest.additions)
  validateFinalMembership(destination, expected)
  const changed = new Map(existing.files.map(item => [item.path, item.postimage]))
  const inventory = expected.map(entry => captureFinalEntry(entry, destination, existing, payloads, changed, source))
  validateStableManifests(bundle, manifestBytes, existingBytes)
  validateStablePayloads(bundle, manifest.additions, payloads)
  validateSourceAfterAdditions(source, manifest)
  validateOriginalInventory(source)
  if (hash(readFile(path.join(bundle, 'existing/ordinary-cancel-v1.patch'), 0o644)) !== intermediate.patchSha256)
    fail('existing patch drift during additions')
  const result = assemblyResult({
    source,
    destination,
    manifest,
    manifestBytes,
    existingBytes,
    intermediate,
    intermediateReceipt,
    intermediateBytes,
    intermediateScopeReceipt,
    intermediateScopeBytes: scopeBytes,
    preparationStatus,
    inventory,
  })
  exclusiveFile(receipt, Buffer.from(JSON.stringify(result, null, 2) + '\n'), 0o600)
  return result
}

export function prepareNativePatch12(options) {
  return prepareExactNativeBundle12({ ...options, bundle: bundle12 })
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 6 || args[0] !== '--source' || args[2] !== '--destination' || args[4] !== '--receipt')
      fail('usage: --source PATH --destination NEW_PATH --receipt NEW_PATH')
    const result = prepareNativePatch12({ source: args[1], destination: args[3], receipt: args[5] })
    console.log(
      JSON.stringify({
        status: result.status,
        sourceFileCount: result.sourceFileCount,
        sourceInventorySha256: result.sourceInventorySha256,
        nativeExecution: false,
        runtimeQualified: false,
      }),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
