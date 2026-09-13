#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createReadStream, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  composeIsolatedLaunch,
  inspectProcessIdentity,
  normalizeMcpInventory,
  REQUIRED_FIXTURE_MCP,
  sanitizeLaunchComposition,
  sanitizeResolvedConfiguration,
  terminateOwnedProcessGroup,
} from './lib/managed-journey-isolated-launch.mjs'
import { sanitizeStartupReceipt, sha256 } from './lib/managed-journey-provider-qualification.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const executable = process.env.APPRAISE_CODEX_EXECUTABLE ?? '/Applications/ChatGPT.app/Contents/Resources/codex'
const schemaPath = process.env.APPRAISE_CODEX_PROTOCOL_SCHEMA
const surface = readOption(process.argv.slice(2), '--surface') ?? 'synthetic'
const fixtureScript = path.join(
  scriptDirectory,
  surface === 'requirement-analyzer'
    ? '../packages/appraisejs/scripts/managed-journey-worker-mcp.ts'
    : '../packages/appraisejs/scripts/managed-journey-synthetic-mcp.mjs',
)
const roleTools = ['quality_journey_analysis_get', 'quality_journey_analysis_submit']
const requiredMcpServer = surface === 'requirement-analyzer' ? 'appraise-quality-journey-worker' : REQUIRED_FIXTURE_MCP
const mode = readMode(process.argv.slice(2))
const composition = composeIsolatedLaunch({
  executable,
  fixtureScript,
  mode,
  requiredMcpServer,
  ...(surface === 'requirement-analyzer'
    ? {
        enabledTools: roleTools,
        fixtureCommand: process.execPath,
        fixtureEnvironment: { TSX_TSCONFIG_PATH: path.join(scriptDirectory, '..', 'tsconfig.json') },
        fixtureArgs: [
          '--import',
          path.join(scriptDirectory, '..', 'packages', 'appraisejs', 'node_modules', 'tsx', 'dist', 'loader.mjs'),
          fixtureScript,
        ],
      }
    : {}),
})
const sentMethods = []
const pending = new Map()
const stderrLines = []
let nextId = 1
let processIdentity
let cleanupReceipt = { cleanupConfirmed: false, processIdentity: null }

const child = spawn(composition.executable, composition.args, {
  cwd: composition.workingDirectory,
  detached: true,
  env: composition.environment,
  stdio: ['pipe', 'pipe', 'pipe'],
})

createInterface({ input: child.stderr }).on('line', line => stderrLines.push(line))
createInterface({ input: child.stdout }).on('line', handleResponseLine)

function handleResponseLine(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id === undefined || !pending.has(message.id)) return
  const { reject, resolve, timer } = pending.get(message.id)
  clearTimeout(timer)
  pending.delete(message.id)
  if (message.error) reject(new RpcError(message.error))
  else resolve(message.result)
}

function send(method, params) {
  const id = nextId++
  sentMethods.push(method)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timed out waiting for ${method}.`))
    }, 10_000)
    pending.set(id, { reject, resolve, timer })
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
  })
}

function notify(method, params = {}) {
  sentMethods.push(method)
  child.stdin.write(`${JSON.stringify({ method, params })}\n`)
}

async function main() {
  let resolvedConfig
  let threadStartResponse
  let mcpStatus
  let launchError = null
  try {
    processIdentity = await inspectProcessIdentity(child.pid)
    await send('initialize', {
      capabilities: { experimentalApi: true },
      clientInfo: { name: 'appraise-phase0-isolated-qualification', version: '1' },
    })
    notify('initialized')
    resolvedConfig = await send('config/read', { cwd: composition.workingDirectory, includeLayers: true })
    try {
      threadStartResponse = await send('thread/start', composition.threadStartParams)
      mcpStatus = await send('mcpServerStatus/list', {
        detail: 'toolsAndAuthOnly',
        threadId: threadStartResponse.thread.id,
      })
    } catch (error) {
      launchError = sanitizeError(error)
    }

    const inventory = normalizeMcpInventory(mcpStatus)
    const resolvedConfiguration = sanitizeResolvedConfiguration(resolvedConfig)
    const isolationFindings = evaluateLaunchIsolation({
      expectedTools: surface === 'requirement-analyzer' ? roleTools : undefined,
      inventory,
      launchError,
      mode,
      requiredMcpServer,
      resolvedConfiguration,
      sentMethods,
    })
    const protocolHash = schemaPath ? sha256(readFileSync(schemaPath)) : null
    const executableHash = await hashFile(executable)
    const output = {
      schema: 'appraise.managed-journey-isolated-launch/v1',
      fixture:
        surface === 'requirement-analyzer' ? 'P0.R2-requirement-analyzer-pre-turn' : 'P0.R0b-account-free-app-server',
      mode,
      surface,
      launchIsolationQualified: isolationFindings.length === 0,
      providerQualified: false,
      mayStartTurn: false,
      isolationFindings,
      providerFindings: [
        {
          id: 'QB-02',
          kind: 'native_tool_inventory_unavailable',
          detail: 'The upstream provider supplied no trusted post-filter model-visible native-tool manifest.',
        },
      ],
      launchComposition: sanitizeLaunchComposition(composition),
      resolvedConfiguration,
      processIdentity: {
        ...processIdentity,
        commandHash: sha256(processIdentity.command),
        command: undefined,
      },
      startupReceipt: threadStartResponse
        ? sanitizeStartupReceipt({ executable, executableHash, protocolHash, response: threadStartResponse })
        : null,
      inventory,
      launchError,
      sentMethods,
      stderr: { digest: sha256(stderrLines.join('\n')), lineCount: stderrLines.length },
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    process.exitCode = expectedModeOutcome(mode, output) ? 0 : 2
  } finally {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer)
      reject(new Error('Provider stopped before returning a response.'))
    }
    pending.clear()
    child.stdin.end()
    if (processIdentity) cleanupReceipt = await terminateOwnedProcessGroup(child, processIdentity)
    else child.kill('SIGTERM')
    process.stderr.write(`${JSON.stringify({ cleanupReceipt })}\n`)
    if (!cleanupReceipt.cleanupConfirmed) process.exitCode = 3
  }
}

function evaluateLaunchIsolation({
  expectedTools,
  inventory,
  launchError,
  mode: selectedMode,
  requiredMcpServer,
  resolvedConfiguration,
  sentMethods: methods,
}) {
  const findings = []
  if (methods.includes('turn/start')) findings.push('turn_started_during_no_model_qualification')
  if (!resolvedConfiguration.layers.some(layer => layer.source.type === 'user')) {
    findings.push('dedicated_user_configuration_source_unobserved')
  }
  const names = inventory.map(server => server.name)
  const required = inventory.find(server => server.name === requiredMcpServer)
  if (launchError) findings.push(selectedMode === 'unhealthy' ? 'required_mcp_not_ready' : 'launch_failed')
  if (!required) findings.push('required_mcp_missing')
  if (names.some(name => name !== requiredMcpServer)) findings.push('unexpected_mcp_servers')
  if (required && (required.status !== 'ready' || required.health !== 'healthy'))
    findings.push('required_mcp_not_ready')
  if (required && expectedTools) {
    const actualTools = required.tools.map(tool => tool.name)
    const expectedNormalized = [...expectedTools].sort((left, right) => left.localeCompare(right))
    if (JSON.stringify(actualTools) !== JSON.stringify(expectedNormalized))
      findings.push('fixture_tool_inventory_invalid')
  } else if (required && required.tools.length !== 1) findings.push('fixture_tool_inventory_invalid')
  return findings
}

function expectedModeOutcome(selectedMode, output) {
  if (selectedMode === 'healthy') return output.launchIsolationQualified && !output.mayStartTurn
  if (selectedMode === 'absent')
    return output.isolationFindings.includes('required_mcp_missing') && !output.mayStartTurn
  if (selectedMode === 'unhealthy')
    return output.isolationFindings.includes('required_mcp_not_ready') && !output.mayStartTurn
  if (selectedMode === 'ambient')
    return output.isolationFindings.includes('unexpected_mcp_servers') && !output.mayStartTurn
  return false
}

function readMode(args) {
  return readOption(args, '--mode') ?? 'healthy'
}

function readOption(args, name) {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}

function sanitizeError(error) {
  if (error instanceof RpcError)
    return { code: error.payload.code ?? null, messageHash: sha256(error.payload.message ?? '') }
  return { code: null, messageHash: sha256(error instanceof Error ? error.message : String(error)) }
}

async function hashFile(filePath) {
  const chunks = []
  for await (const chunk of createReadStream(filePath)) chunks.push(chunk)
  return sha256(Buffer.concat(chunks))
}

class RpcError extends Error {
  constructor(payload) {
    super(payload?.message ?? 'App Server request failed.')
    this.payload = payload ?? {}
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
