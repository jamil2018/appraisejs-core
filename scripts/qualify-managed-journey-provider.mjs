#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createReadStream, mkdtempSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  evaluatePreTurnQualification,
  sanitizeStartupReceipt,
  sha256,
} from './lib/managed-journey-provider-qualification.mjs'

const executable = process.env.APPRAISE_CODEX_EXECUTABLE ?? '/Applications/ChatGPT.app/Contents/Resources/codex'
const schemaPath = process.env.APPRAISE_CODEX_PROTOCOL_SCHEMA
const requiredMcpServer = process.env.APPRAISE_REQUIRED_MCP ?? 'appraise-quality-journey'
const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'appraise-provider-qualification-'))
const sentMethods = []
const pending = new Map()
let nextId = 1
const launchArgs = ['app-server', '--stdio', '--strict-config', '-c', 'mcp_servers={}']
const threadStartParams = {
  cwd: fixtureRoot,
  ephemeral: true,
  sandbox: 'read-only',
  runtimeWorkspaceRoots: [],
  environments: [],
  dynamicTools: [],
  baseInstructions: 'Phase 0 qualification fixture. Do not start a model turn.',
  developerInstructions: '',
}

const child = spawn(executable, launchArgs, {
  cwd: fixtureRoot,
  env: {
    ...process.env,
    APPRAISE_PHASE0_FIXTURE: '1',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})

const stderrLines = []
createInterface({ input: child.stderr }).on('line', line => stderrLines.push(line))

const responses = createInterface({ input: child.stdout })
responses.on('line', handleResponseLine)

function handleResponseLine(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  settleResponse(message)
}

function settleResponse(message) {
  if (message.id === undefined || !pending.has(message.id)) return
  const { resolve, reject, timer } = pending.get(message.id)
  clearTimeout(timer)
  pending.delete(message.id)
  if (message.error) reject(new Error(JSON.stringify(message.error)))
  else resolve(message.result)
}

function send(method, params) {
  const id = nextId++
  sentMethods.push(method)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`Timed out waiting for ${method}; app-server stderr: ${stderrLines.join(' | ') || '<empty>'}`))
    }, 10_000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
  })
}

function notify(method, params = {}) {
  sentMethods.push(method)
  child.stdin.write(`${JSON.stringify({ method, params })}\n`)
}

async function main() {
  try {
    await send('initialize', {
      clientInfo: { name: 'appraise-phase0-qualification', version: '1' },
      capabilities: { experimentalApi: true },
    })
    notify('initialized')

    const threadStartResponse = await send('thread/start', threadStartParams)
    const mcpStatus = await send('mcpServerStatus/list', {
      threadId: threadStartResponse.thread.id,
      detail: 'toolsAndAuthOnly',
    })

    const protocolHash = schemaPath ? sha256(readFileSync(schemaPath)) : null
    const executableHash = await hashFile(executable)
    const result = evaluatePreTurnQualification({
      requiredMcpServer,
      mcpServers: mcpStatus.data,
      threadStartResponse,
      sentMethods,
      authoritativeNativeToolInventory: false,
    })
    const output = {
      schema: 'appraise.managed-journey-provider-qualification/v1',
      fixture: 'QB-01-pre-turn',
      startupReceipt: sanitizeStartupReceipt({
        executable,
        executableHash,
        protocolHash,
        response: threadStartResponse,
      }),
      launchConfigurationDigest: sha256(JSON.stringify({ launchArgs, threadStartParams })),
      ...result,
      stderrLineCount: stderrLines.length,
    }
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
    process.exitCode = result.qualified ? 0 : 2
  } finally {
    child.stdin.end()
    child.kill('SIGTERM')
  }
}

async function hashFile(filePath) {
  const chunks = []
  for await (const chunk of createReadStream(filePath)) chunks.push(chunk)
  return sha256(Buffer.concat(chunks))
}

main().catch(error => {
  child.kill('SIGTERM')
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
