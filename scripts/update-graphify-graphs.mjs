#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { graphInputDigest, recordGraphFreshness } from './lib/graphify-freshness.mjs'

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
  const inputDigest = graphInputDigest(scope.name)
  const deleted = changedFiles.some(file => scope.matches(file) && !existsSync(file))
  const buildArgs = ['run', scope.script, ...(deleted && scope.name !== 'prisma' ? ['--', '--force'] : [])]
  const result = spawnSync('npm', buildArgs, {
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 600_000,
  })

  if (result.error?.code === 'ENOENT') {
    console.error('npm was not found on PATH.')
    process.exit(127)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
  recordGraphFreshness(scope.name, inputDigest)
}

printUnmatchedFiles(changedFiles)

function listChangedFiles() {
  const tracked = git(['diff', '--name-only', '-z', '--no-renames', '--diff-filter=ACMRD', 'HEAD', '--'])
  const untracked = git(['ls-files', '-z', '--others', '--exclude-standard'])
  return [...new Set([...tracked, ...untracked].map(normalizePath).filter(Boolean))].filter(isRelevantChange)
}

function git(args) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 10_000,
  })

  handleMissingCommand(result, 'git')
  handleFailedCommand(result)

  return result.stdout.split('\0')
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
  return path.replace(/\\/g, '/')
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
