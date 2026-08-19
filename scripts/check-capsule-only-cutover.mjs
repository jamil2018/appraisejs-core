#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const forbiddenSymbols = [
  'LocalExecutorAdapter',
  'performBidirectionalSync',
  'LEGACY_DISABLED',
  'standalone: assessment',
  'legacy Step Definition row hash',
]

const ignoredDirectories = new Set(['.git', 'node_modules', '.next', 'coverage', 'dist', 'graphify-out'])

async function collect(directory) {
  const paths = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) paths.push(...(await collect(target)))
    } else if (/\.(?:ts|tsx|mjs|mts|cts|md|json|prisma|ya?ml)$/.test(entry.name)) {
      paths.push(target)
    }
  }
  return paths
}

const sources = (
  await Promise.all(['src', 'scripts', 'prisma'].map(directory => collect(path.join(root, directory))))
).flat()
const matches = []

for (const source of sources) {
  const relative = path.relative(root, source)
  if (relative === 'scripts/check-capsule-only-cutover.mjs') continue
  const content = await fs.readFile(source, 'utf8')
  for (const symbol of forbiddenSymbols) if (content.includes(symbol)) matches.push(`${relative}:${symbol}`)
}

if (matches.length) {
  console.error('Capsule-only cutover guard found forbidden compatibility symbols:')
  for (const match of matches) console.error(`- ${match}`)
  process.exitCode = 1
} else {
  console.log('Capsule-only cutover guard passed; no compatibility paths are allowlisted.')
}
