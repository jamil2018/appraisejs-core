/** Test preload only. The runtime reader never imports or installs these regression sentinels. */
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import http from 'node:http'
import https from 'node:https'
import childProcess from 'node:child_process'

const inputPath = process.argv[2]
const binding = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const copy = binding.snapshot.copyPath
const originalWrite = fs.writeFileSync.bind(fs)
const report = path.join(
  path.dirname(path.dirname(inputPath)),
  `${path.basename(path.dirname(inputPath))}-test-sentinel.json`,
)
const counts = {
  injectedBeforeCanonicalImport: false,
  dotenv: 0,
  credentials: 0,
  otherDatabase: 0,
  canonicalFileWrites: 0,
  canonicalNetwork: 0,
  canonicalNative: 0,
}
let client
Object.defineProperty(globalThis, 'prisma', {
  configurable: true,
  get: () => client,
  set: value => {
    client = value
    counts.injectedBeforeCanonicalImport = true
  },
})
function check(value) {
  if (typeof value === 'number' || value === undefined) return
  const filename = String(value)
  let refused = false
  if (/(^|\/)\.env(?:\.|$)/.test(filename)) {
    counts.dotenv++
    refused = true
  }
  if (/(^|\/)(?:auth\.json|\.codex|\.aws)(?:\/|$)/.test(filename)) {
    counts.credentials++
    refused = true
  }
  if (
    /(?:\.sqlite|\.db)(?:$|[?-])/.test(filename) &&
    filename !== copy &&
    !['-wal', '-shm', '-journal'].some(suffix => filename === copy + suffix)
  ) {
    counts.otherDatabase++
    refused = true
  }
  if (refused) throw new Error('Test sentinel refused a forbidden canonical file access')
}
for (const name of ['existsSync', 'readFileSync', 'lstatSync', 'statSync', 'openSync']) {
  const original = fs[name].bind(fs)
  fs[name] = (...args) => {
    check(args[0])
    return original(...args)
  }
}
for (const name of ['readFile', 'access', 'stat', 'lstat', 'open']) {
  const original = fs.promises[name].bind(fs.promises)
  fs.promises[name] = (...args) => {
    check(args[0])
    return original(...args)
  }
}
for (const name of ['writeFileSync', 'appendFileSync', 'chmodSync', 'unlinkSync', 'mkdirSync']) {
  const original = fs[name].bind(fs)
  fs[name] = (...args) => {
    if (counts.injectedBeforeCanonicalImport) {
      counts.canonicalFileWrites++
      throw new Error('Test sentinel refused a canonical file write')
    }
    return original(...args)
  }
}
for (const [module, names, key] of [
  [net, ['connect', 'createConnection', 'createServer'], 'canonicalNetwork'],
  [http, ['request', 'get', 'createServer'], 'canonicalNetwork'],
  [https, ['request', 'get', 'createServer'], 'canonicalNetwork'],
  [childProcess, ['spawn', 'spawnSync', 'fork', 'exec', 'execSync', 'execFile', 'execFileSync'], 'canonicalNative'],
])
  for (const name of names) {
    const original = module[name].bind(module)
    module[name] = (...args) => {
      if (counts.injectedBeforeCanonicalImport) {
        counts[key]++
        throw new Error('Test sentinel refused a canonical external effect')
      }
      return original(...args)
    }
  }
const originalFetch = globalThis.fetch
globalThis.fetch = (...args) => {
  if (counts.injectedBeforeCanonicalImport) {
    counts.canonicalNetwork++
    throw new Error('Test sentinel refused canonical fetch')
  }
  return originalFetch(...args)
}
syncBuiltinESMExports()
process.on('exit', () => originalWrite(report, JSON.stringify(counts), { flag: 'wx', mode: 0o600 }))
