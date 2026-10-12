#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import http from 'node:http'
import { createInterface } from 'node:readline'

import { inspectProcessIdentity, terminateOwnedProcessGroup } from './lib/managed-journey-isolated-launch.mjs'
import {
  canonicalJson,
  composeDynamicToolsLaunch,
  DYNAMIC_TOOL_NAME,
  evaluateExperimentResults,
  evaluateDispatch,
  sha256,
  summarizeResponsesRequest,
} from './lib/p0-r2c-dynamic-tools-experiment.mjs'

const executable = process.env.APPRAISE_CODEX_EXECUTABLE ?? '/Applications/ChatGPT.app/Contents/Resources/codex'
const results = []
for (const arm of ['empty', 'one-strict']) results.push(await runArm(arm))
const qualification = evaluateExperimentResults(results)
const receiptSubject = { schema: 'appraise.p0-r2c-dynamic-tools/v1', results }
const output = { ...receiptSubject, receiptSubjectSha256: sha256(canonicalJson(receiptSubject)), qualification }
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!qualification.qualified) process.exitCode = 2

async function runArm(arm) {
  const requests = []
  const dispatches = []
  let resolveRequest
  const requestObserved = new Promise(resolve => {
    resolveRequest = resolve
  })
  const server = http.createServer((request, response) => {
    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      requests.push(summarizeResponsesRequest(Buffer.concat(chunks), request.headers))
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      if (arm === 'one-strict' && requests.length === 1) {
        const item = {
          arguments: JSON.stringify({ probe: 'account-free' }),
          call_id: 'call-r2c-allowed',
          id: 'fc-r2c-allowed',
          name: DYNAMIC_TOOL_NAME,
          type: 'function_call',
        }
        const responseRecord = { id: 'resp-r2c', object: 'response', output: [item], status: 'completed' }
        response.write(
          `event: response.created\ndata: ${JSON.stringify({ response: { ...responseRecord, output: [], status: 'in_progress' }, sequence_number: 1, type: 'response.created' })}\n\n`,
        )
        response.write(
          `event: response.output_item.added\ndata: ${JSON.stringify({ item, output_index: 0, sequence_number: 2, type: 'response.output_item.added' })}\n\n`,
        )
        response.write(
          `event: response.output_item.done\ndata: ${JSON.stringify({ item, output_index: 0, sequence_number: 3, type: 'response.output_item.done' })}\n\n`,
        )
        response.write(
          `event: response.completed\ndata: ${JSON.stringify({ response: responseRecord, sequence_number: 4, type: 'response.completed' })}\n\n`,
        )
      } else {
        response.write(
          `event: response.completed\ndata: ${JSON.stringify({ response: { id: 'resp-r2c-empty', output: [], status: 'completed' }, sequence_number: 1, type: 'response.completed' })}\n\n`,
        )
      }
      response.end()
      resolveRequest()
    })
  })
  await listen(server)
  const port = server.address().port
  const composition = composeDynamicToolsLaunch({ arm, executable, port })
  const profile = `(version 1) (allow default) (deny network*) (allow network-outbound (remote ip "localhost:${port}"))`
  const child = spawn('/usr/bin/sandbox-exec', ['-p', profile, composition.executable, ...composition.args], {
    cwd: composition.workingDirectory,
    detached: true,
    env: composition.environment,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const identity = await inspectProcessIdentity(child.pid)
  const rpc = createRpc(child, ({ id, method, params }) => {
    if (method !== 'item/tool/call') return
    const decision = evaluateDispatch(params, {
      expectedThreadId: rpc.threadId,
      expectedTurnId: rpc.turnId,
      seenCallIds: rpc.seenCallIds,
    })
    dispatches.push({
      method,
      outcome: decision.outcome,
      received: { namespace: params?.namespace ?? null, tool: params?.tool ?? null },
    })
    if (decision.accepted) rpc.respond(id, { contentItems: decision.contentItems, success: true })
    else rpc.respond(id, { contentItems: [], success: false })
  })
  let error = null
  let resolved = null
  try {
    await rpc.send('initialize', {
      capabilities: { experimentalApi: true },
      clientInfo: { name: 'appraise-p0-r2c', version: '1' },
    })
    rpc.notify('initialized')
    resolved = await rpc.send('config/read', { cwd: composition.workingDirectory, includeLayers: true })
    const thread = await rpc.send('thread/start', composition.threadStartParams)
    rpc.threadId = thread.thread.id
    const turn = await rpc.send('turn/start', {
      input: [{ text: 'Run the synthetic dynamic tool if available.', type: 'text' }],
      threadId: rpc.threadId,
    })
    rpc.turnId = turn.turn.id
    await Promise.race([requestObserved, timeout('request-capture-timeout', 10_000)])
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    rpc.close()
  }
  const cleanup = await terminateOwnedProcessGroup(child, identity)
  await close(server)
  return {
    arm,
    artifact: {
      configurationSha256: sha256(composition.configText),
      dynamicToolsSha256: sha256(canonicalJson(composition.dynamicTools)),
      executableSha256: await hashFile(executable),
      sandboxProfileSha256: sha256(profile),
    },
    cleanup: { confirmed: cleanup.cleanupConfirmed, survivingProcessCount: cleanup.survivingProcessCount },
    dispatches,
    error,
    requestCount: requests.length,
    requests,
    resolved: {
      featureDigest: sha256(JSON.stringify(resolved?.config?.features ?? null)),
      layerTypes: (resolved?.layers ?? []).map(layer => layer?.name?.type ?? 'unknown'),
      mcpNames: Object.keys(resolved?.config?.mcp_servers ?? {}),
      webSearch: resolved?.config?.web_search ?? null,
    },
  }
}

function createRpc(child, onServerRequest) {
  let nextId = 1
  const pending = new Map()
  const stderr = []
  const rpc = {
    seenCallIds: new Set(),
    threadId: null,
    turnId: null,
    close() {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error('process-closed'))
      }
      pending.clear()
      child.stdin.end()
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ method, params })}\n`)
    },
    respond(id, result) {
      child.stdin.write(`${JSON.stringify({ id, result })}\n`)
    },
    send(method, params) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${method}:timeout;stderr-lines=${stderr.length}`))
        }, 5_000)
        pending.set(id, { reject, resolve, timer })
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
      })
    },
  }
  createInterface({ input: child.stdout }).on('line', line => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const entry = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) entry.reject(new Error(`${entry.method}:${message.error.code ?? 'error'}`))
      else entry.resolve(message.result)
      return
    }
    if (message.id !== undefined && message.method) onServerRequest(message)
  })
  createInterface({ input: child.stderr }).on('line', line => stderr.push(line))
  return rpc
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
}
function close(server) {
  return new Promise(resolve => server.close(resolve))
}
function timeout(message, milliseconds) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), milliseconds))
}
async function hashFile(filePath) {
  const chunks = []
  for await (const chunk of createReadStream(filePath)) chunks.push(chunk)
  return sha256(Buffer.concat(chunks))
}
