#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const graphScopes = [
  {
    name: 'src',
    script: 'graphify:build',
    matches: path => path.startsWith('src/') && isSourceLike(path),
  },
  {
    name: 'prisma',
    script: 'graphify:build:prisma',
    matches: path =>
      path === 'prisma/schema.prisma' ||
      (path.startsWith('prisma/migrations/') && (path.endsWith('.sql') || path.endsWith('/migration.sql'))),
  },
  {
    name: 'scripts',
    script: 'graphify:build:scripts',
    matches: path => path.startsWith('scripts/') && isSourceLike(path),
  },
  {
    name: 'packages',
    script: 'graphify:build:packages',
    matches: isPackageGraphSource,
  },
]

const graphOutputPrefixes = [
  'src/graphify-out/',
  'prisma/graphify-out/',
  'scripts/graphify-out/',
  'packages/graphify-out/',
]

const packageGraphExclusions = [
  'packages/create-appraisejs/templates/',
  '/dist/',
  '/node_modules/',
  '/README.md',
  '/AGENTS.md',
]

const args = new Set(process.argv.slice(2))
const runAll = args.has('--all')
const dryRun = args.has('--dry-run')

const changedFiles = runAll ? [] : listChangedFiles()
const selectedScopes = runAll ? graphScopes : graphScopes.filter(scope => changedFiles.some(scope.matches))

if (selectedScopes.length === 0) {
  console.log('Graphify auto-update: no safe committed graph scopes changed.')
  printUnmatchedFiles(changedFiles)
  process.exit(0)
}

console.log(`Graphify auto-update: ${selectedScopes.map(scope => scope.name).join(', ')}`)

if (dryRun) {
  for (const scope of selectedScopes) {
    console.log(`Would run: npm run ${scope.script}`)
  }
  printUnmatchedFiles(changedFiles)
  process.exit(0)
}

for (const scope of selectedScopes) {
  const result = spawnSync('npm', ['run', scope.script], {
    encoding: 'utf8',
    stdio: 'inherit',
  })

  if (result.error?.code === 'ENOENT') {
    console.error('npm was not found on PATH.')
    process.exit(127)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

printUnmatchedFiles(changedFiles)

function listChangedFiles() {
  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD', '--'])
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
  return [...new Set([...tracked, ...untracked].map(normalizePath).filter(Boolean))].filter(isRelevantChange)
}

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe',
  })

  handleMissingCommand(result, 'git')
  handleFailedCommand(result)

  return result.stdout.split('\n')
}

function handleMissingCommand(result, command) {
  if (result.error?.code !== 'ENOENT') return

  console.error(`${command} was not found on PATH.`)
  process.exit(127)
}

function handleFailedCommand(result) {
  if (result.status === 0) return

  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

function normalizePath(path) {
  return path.trim().replace(/\\/g, '/')
}

function isRelevantChange(path) {
  return Boolean(path) && !isGraphOutputPath(path)
}

function isGraphOutputPath(path) {
  return path.includes('/graphify-out/') || graphOutputPrefixes.some(prefix => path.startsWith(prefix))
}

function isPackageGraphSource(path) {
  return path.startsWith('packages/') && !isPackageGraphExcluded(path) && isSourceLike(path)
}

function isPackageGraphExcluded(path) {
  return packageGraphExclusions.some(pattern => path.includes(pattern) || path.endsWith(pattern))
}

function isSourceLike(path) {
  return /\.(cjs|css|cts|js|json|jsx|mjs|mts|sql|ts|tsx|yaml|yml)$/.test(path)
}

function printUnmatchedFiles(changedFiles) {
  const unmatched = changedFiles.filter(path => !graphScopes.some(scope => scope.matches(path)))
  if (unmatched.length === 0) return

  console.log('Graphify auto-update skipped uncertain or non-graphable changes:')
  for (const path of unmatched.slice(0, 12)) {
    console.log(`- ${path}`)
  }
  if (unmatched.length > 12) {
    console.log(`- ...and ${unmatched.length - 12} more`)
  }
}
