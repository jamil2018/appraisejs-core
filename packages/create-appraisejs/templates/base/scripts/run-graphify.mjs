#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { withDefaultGraph } from './lib/graphify-command-args.mjs'
import { resolveGraphifyExecutable } from './lib/graphify-executable.mjs'

const args = process.argv.slice(2)
const graphifyCommand = resolveGraphifyExecutable('graphify')
const graphifyMcpCommand = resolveGraphifyExecutable('graphify-mcp')

if (args.length === 0) {
  console.error('Usage: node scripts/run-graphify.mjs <graphify args...>')
  process.exit(1)
}

const versionCheck = spawnSync(graphifyCommand ?? 'graphify', ['--version'], {
  encoding: 'utf8',
  stdio: 'pipe',
})

if (!graphifyCommand || versionCheck.error?.code === 'ENOENT') {
  console.error('Graphify CLI was not found on PATH.')
  console.error('Install it with: uv tool install graphifyy')
  console.error(
    'Then make sure the uv tool bin directory is on PATH, for example: export PATH="$HOME/.local/bin:$PATH"',
  )
  process.exit(127)
}

if (versionCheck.status !== 0) {
  process.stderr.write(versionCheck.stderr)
  process.exit(versionCheck.status ?? 1)
}

if (args[0] === 'build-scope') {
  const scope = args[1]
  if (!scope) {
    console.error('Usage: node scripts/run-graphify.mjs build-scope <path>')
    process.exit(1)
  }

  const hasGeminiBackend = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  const hasExistingPackageGraph = scope === 'packages' && fs.existsSync(path.join(scope, 'graphify-out', 'graph.json'))
  const buildArgs =
    hasExistingPackageGraph && !hasGeminiBackend && !args.includes('--force')
      ? ['update', scope]
      : [scope, ...(args.includes('--force') ? ['--force'] : [])]
  if (buildArgs[0] === 'update') {
    console.log('Using the existing host-semantic package graph; refreshing code incrementally without an API key.')
  }
  const build = runCommand(graphifyCommand, buildArgs)
  if (build.status !== 0) process.exit(build.status ?? 1)
  const cluster = runCommand(graphifyCommand, ['cluster-only', scope])
  process.exit(cluster.status ?? 1)
}

const command = args[0] === 'mcp' ? graphifyMcpCommand : graphifyCommand
const commandArgs = args[0] === 'mcp' ? args.slice(1) : withDefaultGraph(args)

const result = runCommand(command, commandArgs)
process.exit(result.status ?? 1)

function runCommand(command, commandArgs) {
  if (!command) {
    console.error('Graphify command was not found.')
    process.exit(127)
  }

  const result = spawnSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: 'inherit',
    timeout: 600_000,
  })

  if (result.error?.code === 'ENOENT') {
    console.error(`${command} was not found on PATH.`)
    process.exit(127)
  }

  return result
}
