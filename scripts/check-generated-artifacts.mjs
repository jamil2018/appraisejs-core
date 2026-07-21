#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const allowedDatabaseFixtures = new Set([
  'packages/create-appraisejs/templates/flavors/blank/prisma/dev.db',
  'packages/create-appraisejs/templates/flavors/starter/prisma/dev.db',
])

const committedGraphifyScopes = new Set([
  'src/graphify-out',
  'prisma/graphify-out',
  'scripts/graphify-out',
  'packages/graphify-out',
])
const committedGraphifyFiles = new Set(['GRAPH_REPORT.md', 'graph.html', 'graph.json'])

const runtimeDirectoryPatterns = [
  /^\.appraise\//,
  /^\.playwright-cli\//,
  /^playwright-report\//,
  /^test-results\//,
  /^automation\/(?:reports|logs|traces|screenshots)\//,
  /^packages\/(?:appraisejs|cucumber-runtime|locator-picker-companion)\/dist\//,
]

export function runtimeArtifactReason(file) {
  const normalized = file.replaceAll('\\', '/')
  if (allowedDatabaseFixtures.has(normalized)) return null
  const graphifyMarker = '/graphify-out/'
  const graphifyMarkerIndex = normalized.indexOf(graphifyMarker)
  if (normalized.startsWith('graphify-out/') || graphifyMarkerIndex !== -1) {
    const scope = normalized.startsWith('graphify-out/')
      ? 'graphify-out'
      : normalized.slice(0, graphifyMarkerIndex + graphifyMarker.length - 1)
    const filename = normalized.slice(scope.length + 1)
    if (!committedGraphifyScopes.has(scope) || !committedGraphifyFiles.has(filename)) {
      return 'non-canonical Graphify output'
    }
  }
  if (/\.(?:db|sqlite|sqlite3)(?:-|$)/i.test(normalized)) return 'local database'
  if (runtimeDirectoryPatterns.some(pattern => pattern.test(normalized))) return 'runtime or build output'
  return null
}

export function findForbiddenRuntimeArtifacts(files) {
  return files.map(file => ({ file, reason: runtimeArtifactReason(file) })).filter(item => item.reason !== null)
}

function gitPaths(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    process.exit(result.status ?? 1)
  }
  return result.stdout.split('\0').filter(Boolean)
}

function main() {
  const tracked = gitPaths(['ls-files', '-z'])
  const stagedAdditions = gitPaths(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  const forbidden = findForbiddenRuntimeArtifacts([...new Set([...tracked, ...stagedAdditions])])
  if (forbidden.length > 0) {
    console.error('Repository contains tracked or staged runtime artifacts outside the fixture allowlist:')
    for (const item of forbidden) console.error(`- ${item.file} (${item.reason})`)
    process.exit(1)
  }
  console.log(`Generated-artifact policy passed for ${tracked.length} tracked paths.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
