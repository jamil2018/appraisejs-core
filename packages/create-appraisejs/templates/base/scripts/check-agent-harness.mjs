#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const forbiddenPaths = [
  '.agents',
  '.codex',
  'scripts/check-swarm-harness.mjs',
  'scripts/record-swarm-run.mjs',
  'scripts/record-swarm-route.mjs',
  'scripts/update-swarm-evolution.mjs',
  'scripts/swarm-ledger.mjs',
  'scripts/lib/swarm-cli.mjs',
  'scripts/lib/swarm-ledger-lock.mjs',
  'scripts/lib/swarm-ledger-store.mjs',
  'scripts/lib/toml-validator.mjs',
  'scripts/tests/swarm-evolution.test.mjs',
]
const forbiddenScripts = [
  'check:swarm-harness',
  'swarm:record',
  'swarm:route',
  'swarm:evolve',
  'swarm:ledger',
  'test:swarm-harness',
]

for (const relativePath of forbiddenPaths) {
  if (fs.existsSync(path.join(repoRoot, relativePath))) {
    throw new Error(`Generated scaffold includes repository-only harness asset: ${relativePath}`)
  }
}

const scriptsDir = path.join(repoRoot, 'scripts')
if (fs.existsSync(scriptsDir)) {
  const stack = [scriptsDir]
  while (stack.length > 0) {
    const directory = stack.pop()
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.name.includes('swarm')) {
        throw new Error(`Generated scaffold includes repository-only swarm asset: ${path.relative(repoRoot, fullPath)}`)
      }
    }
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
if (packageJson.scripts?.['check:harness'] !== 'node scripts/check-agent-harness.mjs') {
  throw new Error('Generated scaffold must keep check:harness scoped to its bundled harness check.')
}
for (const scriptName of forbiddenScripts) {
  if (scriptName in (packageJson.scripts ?? {})) {
    throw new Error(`Generated scaffold exposes repository-only harness command: ${scriptName}`)
  }
}

console.log('Generated scaffold harness check passed.')
