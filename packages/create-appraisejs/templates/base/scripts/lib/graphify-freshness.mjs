import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolveGraphifyExecutable } from './graphify-executable.mjs'

export const graphScopes = ['src', 'scripts', 'prisma', 'packages']

function scopeFiles(directory, relative = '') {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['graphify-out', 'node_modules', 'dist', 'templates', '.git'].includes(entry.name)) return []
    const name = path.posix.join(relative, entry.name)
    if (entry.isSymbolicLink()) return [name]
    if (entry.isDirectory()) return scopeFiles(path.join(directory, entry.name), name)
    return /\.(cjs|css|cts|js|json|jsx|mjs|mts|prisma|sql|ts|tsx|yaml|yml|md)$/.test(name) ? [name] : []
  })
}

export function graphInputDigest(scope, cwd = process.cwd()) {
  if (!graphScopes.includes(scope)) throw new Error('Unknown Graphify scope')
  const root = path.join(cwd, scope)
  const hash = createHash('sha256')
  for (const relative of [
    '.graphifyignore',
    'package.json',
    'scripts/lib/graphify-executable.mjs',
    '.gitignore',
    'scripts/run-graphify.mjs',
    'scripts/update-graphify-graphs.mjs',
    'scripts/build-prisma-graph.mjs',
    'scripts/lib/graphify-freshness.mjs',
  ]) {
    const file = path.join(cwd, relative)
    hash
      .update(relative)
      .update('\0')
      .update(fs.existsSync(file) ? fs.readFileSync(file) : 'missing')
      .update('\0')
  }
  const executable = resolveGraphifyExecutable() ?? 'graphify'
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 10_000 })
  hash.update(
    JSON.stringify({
      node: process.version,
      executable,
      graphify: version.status === 0 ? version.stdout.trim() : 'unavailable',
    }),
  )
  for (const name of scopeFiles(root).sort()) {
    const file = path.join(root, name)
    hash.update(name).update('\0')
    hash.update(fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : fs.readFileSync(file)).update('\0')
  }
  return hash.digest('hex')
}

export function graphFreshness(scope, cwd = process.cwd()) {
  const file = path.join(cwd, scope, 'graphify-out', '.harness-freshness.json')
  const digest = graphInputDigest(scope, cwd)
  if (!fs.existsSync(path.join(cwd, scope, 'graphify-out', 'graph.json'))) return { scope, status: 'missing' }
  if (!fs.existsSync(file)) return { scope, status: 'unknown', reason: 'No input receipt from a successful refresh' }
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'))
  const outputDigest = createHash('sha256')
    .update(fs.readFileSync(path.join(cwd, scope, 'graphify-out', 'graph.json')))
    .digest('hex')
  return {
    scope,
    status: receipt.digest === digest && receipt.outputDigest === outputDigest ? 'fresh' : 'stale',
    recordedAt: receipt.recordedAt,
  }
}

export function recordGraphFreshness(scope, expectedDigest, cwd = process.cwd()) {
  if (graphInputDigest(scope, cwd) !== expectedDigest) throw new Error('Graph inputs changed during refresh; rerun')
  const outputDigest = createHash('sha256')
    .update(fs.readFileSync(path.join(cwd, scope, 'graphify-out', 'graph.json')))
    .digest('hex')
  fs.writeFileSync(
    path.join(cwd, scope, 'graphify-out', '.harness-freshness.json'),
    JSON.stringify({ version: 1, digest: expectedDigest, outputDigest, recordedAt: new Date().toISOString() }) + '\n',
  )
}
