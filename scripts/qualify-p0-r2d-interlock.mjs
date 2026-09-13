#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import { inspectProcessIdentity, terminateOwnedProcessGroup } from './lib/managed-journey-isolated-launch.mjs'
import {
  P0_R2D_BRIDGE,
  canonicalJson,
  composeR2dLaunch,
  createRequestInterlock,
  evaluateInterlockResults,
  consumeReleasedCall,
  collectBoundedBody,
  registerReleasedCalls,
  loadCanonicalProfile,
  projectResponsesTools,
  sanitizedReceipt,
  sha256,
  validateBufferedSse,
} from './lib/p0-r2d-interlock-experiment.mjs'

const executable =
  process.env.APPRAISE_CODEX_EXECUTABLE ??
  '/private/tmp/appraise-codex-0154-npm-cache/_npx/4897a91091a83573/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex'
const profile = await loadCanonicalProfile()
const results = []
for (const arm of ['allowed', 'request-rejection', 'response-rejection']) results.push(await runArm(arm))
const subject = {
  schema: 'appraise.p0-r2d-interlock-qualification/v1',
  expectedWireTools: projectResponsesTools(profile),
  results,
}
const output = {
  ...subject,
  receiptSubjectSha256: sha256(canonicalJson(subject)),
  qualification: evaluateInterlockResults(results, profile),
}
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!output.qualification.qualified) process.exitCode = 2

async function runArm(arm) {
  let upstreamCount = 0
  let dispatchCount = 0
  const brokerReceiptDigests = []
  const forwardedRequests = []
  const observed = { requestRejections: [], responseRejections: [] }
  const requestDiagnostics = []
  const upstreamRequestHashes = []
  const upstreamRequests = []
  let responseBinding = null
  let requestInterlock = null
  const releasedCalls = new Map()
  const seenCallIds = new Set()
  const completion = deferred()
  let composition, child, identity, rpc, gate, canary, sandboxProfile
  let error = null
  let resolved = null
  let childDiagnostics = null
  let cleanup
  const onFixtureError = cause => {
    error = cause.message
    completion.resolve()
  }
  const upstream = createFixtureServer(async (request, response) => {
    upstreamCount += 1
    const receivedBody = await collectBoundedBody(request, 1_000_000)
    upstreamRequestHashes.push(sha256(receivedBody))
    upstreamRequests.push({ byteLength: receivedBody.length, sha256: sha256(receivedBody) })
    if (upstreamCount > 1) {
      response.writeHead(200, { 'cache-control': 'no-cache', 'content-type': 'text/event-stream' })
      response.end(
        Buffer.from(
          frame('response.completed', { response: { id: `resp-r2d-${arm}-final`, output: [], status: 'completed' } }),
        ),
      )
      return
    }
    const tool = profile.tools[0]
    const call = {
      arguments: JSON.stringify(syntheticArguments(tool.inputSchema)),
      call_id: `call-r2d-${arm}`,
      id: `fc-r2d-${arm}`,
      name: arm === 'response-rejection' ? 'forbidden_tool' : tool.name,
      type: 'function_call',
    }
    const completed = { id: `resp-r2d-${arm}`, output: [call], status: 'completed' }
    const sse = Buffer.from(
      [
        frame('response.created', { response: { ...completed, output: [], status: 'in_progress' } }),
        frame('response.output_item.added', { item: call, output_index: 0 }),
        frame('response.output_item.done', { item: call, output_index: 0 }),
        frame('response.completed', { response: completed }),
      ].join(''),
    )
    response.writeHead(200, { 'cache-control': 'no-cache', 'content-type': 'text/event-stream' })
    response.end(sse)
  }, onFixtureError)
  try {
    await listen(upstream)
    const upstreamPort = upstream.address().port
    gate = createFixtureServer(async (request, response) => {
      const receivedBody = await collectBoundedBody(request, 1_000_000)
      if (!requestInterlock) {
        observed.requestRejections.push('authority_not_bound')
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'r2d_authority_unavailable' }))
        return
      }
      const verdict = await requestInterlock({
        body: receivedBody,
        headers: request.headers,
        method: request.method,
        url: request.url,
      })
      if (!verdict.accepted) {
        observed.requestRejections.push(verdict.reason)
        if (verdict.observedTools) requestDiagnostics.push(verdict.observedTools)
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'r2d_request_interlocked' }))
        completion.resolve()
        return
      }
      responseBinding = verdict.binding
      if (
        verdict.requestHash !== verdict.upstreamResult.upstreamMeasured.sha256 ||
        verdict.upstreamBody.length !== verdict.upstreamResult.upstreamMeasured.byteLength
      ) {
        observed.responseRejections.push('forwarded_request_bytes_changed')
        response.writeHead(502, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'r2d_request_interlocked' }))
        completion.resolve()
        return
      }
      const { processIdentity, threadId, turnId, ...publicBinding } = verdict.binding
      const bindingReceipt = {
        ...publicBinding,
        processIdentityHash: sha256(processIdentity),
        threadIdHash: sha256(threadId),
        turnIdHash: sha256(turnId),
      }
      forwardedRequests.push({
        binding: bindingReceipt,
        bindingDigest: sha256(canonicalJson(bindingReceipt)),
        gateByteLength: verdict.upstreamBody.length,
        gateRequestSha256: verdict.requestHash,
        upstreamByteLength: verdict.upstreamResult.upstreamMeasured.byteLength,
        upstreamRequestSha256: verdict.upstreamResult.upstreamMeasured.sha256,
      })
      const responseVerdict = await validateBufferedSse({
        body: verdict.upstreamResult.body,
        binding: responseBinding,
        profile,
      })
      if (!responseVerdict.accepted) {
        observed.responseRejections.push(responseVerdict.reason)
        response.writeHead(502, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'r2d_response_interlocked' }))
        completion.resolve()
        return
      }
      const released = registerReleasedCalls({
        calls: responseVerdict.calls,
        binding: responseBinding,
        releasedCalls,
        seenCallIds,
      })
      if (!released.accepted) {
        observed.responseRejections.push(released.reason)
        response.writeHead(502)
        response.end()
        completion.resolve()
        return
      }
      response.writeHead(verdict.upstreamResult.statusCode, verdict.upstreamResult.headers)
      response.end(verdict.upstreamResult.body)
      if (arm === 'allowed' && forwardedRequests.length === 2 && dispatchCount === 1) completion.resolve()
    }, onFixtureError)
    await listen(gate)
    composition = composeR2dLaunch({ executable, gatePort: gate.address().port, profile })
    sandboxProfile = `(version 1) (allow default) (deny network*) (allow network-outbound (remote ip "localhost:${gate.address().port}"))`
    canary = await runSeatbeltCanary(sandboxProfile, upstreamPort)
    child = spawn('/usr/bin/sandbox-exec', ['-p', sandboxProfile, composition.executable, ...composition.args], {
      cwd: composition.workingDirectory,
      detached: true,
      env: composition.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    identity = await inspectProcessIdentity(child.pid)
    rpc = createRpc(child, async ({ id, method, params }) => {
      if (method !== 'item/tool/call') return
      const tool = profile.tools.find(candidate => candidate.name === params?.tool)
      const decision = consumeReleasedCall({
        params,
        releasedCalls,
        binding: releasedCalls.get(params?.callId)?.originBinding,
        authority: {
          attemptId: `p0-r2d-${arm}`,
          profileDigest: profile.contractDigest,
          threadId: rpc.threadId,
          turnId: rpc.turnId,
        },
      })
      if (!decision.accepted || !tool) {
        rpc.respond(id, { contentItems: [], success: false })
        return
      }
      try {
        const encoded = Buffer.from(JSON.stringify(params.arguments)).toString('base64url')
        const authority = Buffer.from(
          JSON.stringify({
            attemptId: `p0-r2d-${arm}`,
            expiresAt: new Date(responseBinding.expiresAt).toISOString(),
            profileDigest: profile.contractDigest,
          }),
        ).toString('base64url')
        const bridged = await runBridge(['invoke', tool.name, encoded, authority])
        if (bridged.profileDigest !== profile.contractDigest) throw new Error('bridge profile drift')
        brokerReceiptDigests.push(bridged.receiptDigest)
        dispatchCount += 1
        rpc.respond(id, { contentItems: [{ text: 'synthetic-authorized-effect', type: 'inputText' }], success: true })
      } catch {
        rpc.respond(id, { contentItems: [], success: false })
      }
    })
    await rpc.send('initialize', {
      capabilities: { experimentalApi: true },
      clientInfo: { name: 'appraise-p0-r2d', version: '1' },
    })
    rpc.notify('initialized')
    resolved = await rpc.send('config/read', { cwd: composition.workingDirectory, includeLayers: true })
    const thread = await rpc.send('thread/start', composition.threadStartParams)
    rpc.threadId = thread.thread.id
    const turn = await rpc.send('turn/start', {
      input: [{ text: 'Use the available canonical operation.', type: 'text' }],
      threadId: rpc.threadId,
    })
    rpc.turnId = turn.turn.id
    const authority = Object.freeze({
      attemptId: `p0-r2d-${arm}`,
      configSha256: sha256(composition.configText),
      executableSha256: sha256(readFileSync(composition.executable)),
      expiresAt: Date.now() + 20_000,
      processIdentity: `${identity.pid}:${identity.birthMarker}:${identity.pgid}`,
      profileDigest: profile.contractDigest,
      protocol: 'responses/v1',
      threadId: rpc.threadId,
      turnId: rpc.turnId,
    })
    requestInterlock = createRequestInterlock({
      authority,
      expectedTools:
        arm === 'request-rejection' ? [...projectResponsesTools(profile)].reverse() : projectResponsesTools(profile),
      upstream: async input => {
        const before = upstreamRequests.length
        const forwarded = await forwardLocal(
          upstreamPort,
          { 'content-type': 'application/json', authorization: 'Bearer synthetic' },
          input.body,
        )
        const upstreamMeasured = upstreamRequests[before]
        if (!upstreamMeasured) throw new Error('Local upstream did not record the forwarded request.')
        return { ...forwarded, upstreamMeasured }
      },
    })
    await raceWithTimeout(completion.promise, 'r2d-completion-timeout', 12_000)
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    rpc?.close()
    if (child && identity) cleanup = await terminateOwnedProcessGroup(child, identity)
    childDiagnostics = rpc?.diagnostics()
    if (gate?.listening) {
      gate.closeAllConnections()
      await close(gate)
    }
    if (upstream.listening) {
      upstream.closeAllConnections()
      await close(upstream)
    }
  }
  if (!composition || !cleanup) throw new Error(error ?? 'fixture_launch_incomplete')
  return sanitizedReceipt({
    composition,
    profile,
    result: {
      arm,
      cleanup: { confirmed: cleanup.cleanupConfirmed, survivingProcessCount: cleanup.survivingProcessCount },
      canary,
      childDiagnostics,
      dispatchCount,
      brokerReceiptDigests,
      forwardedRequests,
      error,
      requestRejections: observed.requestRejections,
      requestDiagnostics,
      responseRejections: observed.responseRejections,
      resolved: { mcpNames: Object.keys(resolved?.config?.mcp_servers ?? {}) },
      upstreamCount,
      upstreamRequestHashes,
      sandboxProfileSha256: sha256(sandboxProfile),
    },
    sourcePaths: [
      P0_R2D_BRIDGE,
      path.resolve('scripts/lib/p0-r2d-interlock-experiment.mjs'),
      fileURLToPath(import.meta.url),
      path.resolve('src/lib/quality-journey/managed-worker-gateway.ts'),
      path.resolve('packages/appraisejs/src/mcp/registry.ts'),
      path.resolve('src/lib/quality-journey/role-definitions.ts'),
      path.resolve('scripts/lib/p0-r2c-dynamic-tools-experiment.mjs'),
      path.resolve('scripts/tests/p0-r2d-interlock-experiment.test.mjs'),
    ],
  })
}

function createFixtureServer(handler, onError) {
  return http.createServer((request, response) => {
    void handler(request, response).catch(error => {
      response.destroy()
      onError(error)
    })
  })
}

function forwardLocal(port, headers, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { headers, host: '127.0.0.1', method: 'POST', path: '/v1/responses', port },
      response => {
        void collectBoundedBody(response).then(
          body =>
            resolve({
              body,
              headers: response.headers,
              statusCode: response.statusCode ?? 502,
            }),
          reject,
        )
      },
    )
    request.on('error', reject)
    request.end(body)
  })
}

function runSeatbeltCanary(sandboxProfile, forbiddenPort) {
  const probe = [
    "const net = require('node:net')",
    `const socket = net.connect({ host: '127.0.0.1', port: ${forbiddenPort} })`,
    "socket.once('connect', () => process.exit(10))",
    "socket.once('error', error => process.exit(error.code === 'EPERM' || error.code === 'EACCES' ? 0 : 11))",
    'setTimeout(() => process.exit(12), 1000)',
  ].join(';')
  return new Promise(resolve => {
    const child = spawn('/usr/bin/sandbox-exec', ['-p', sandboxProfile, process.execPath, '-e', probe], {
      stdio: 'ignore',
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ denied: false, outcome: 'timeout' })
    }, 1_200)
    child.once('error', () => {
      clearTimeout(timer)
      resolve({ denied: false, outcome: 'spawn_error' })
    })
    child.once('exit', code => {
      clearTimeout(timer)
      resolve({ denied: code === 0, outcome: code === 0 ? 'connection_denied' : `unexpected_exit_${code}` })
    })
  })
}

function frame(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify({ ...data, type: event })}\n\n`
}

function syntheticArguments(schema) {
  if (schema?.type !== 'object') return {}
  return Object.fromEntries((schema.required ?? []).map(key => [key, syntheticValue(schema.properties?.[key] ?? {})]))
}
function syntheticValue(schema) {
  if (Array.isArray(schema.enum)) return schema.enum[0]
  if (schema.type === 'string') return 'synthetic'
  if (schema.type === 'integer' || schema.type === 'number') return 1
  if (schema.type === 'boolean') return false
  if (schema.type === 'array') return []
  if (schema.type === 'object') return syntheticArguments(schema)
  return null
}

function createRpc(child, onServerRequest) {
  let nextId = 1
  const pending = new Map()
  const stderr = []
  let exit = null
  const rpc = {
    threadId: null,
    turnId: null,
    diagnostics() {
      return { exit, stderr: stderr.slice(-20).map(sanitizeChildDiagnostic) }
    },
    close() {
      for (const pendingCall of pending.values()) {
        clearTimeout(pendingCall.timer)
        pendingCall.reject(new Error('process-closed'))
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
          reject(new Error(`${method}:timeout`))
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
      if (message.error) entry.reject(new Error(`${entry.method ?? 'rpc'}:error`))
      else entry.resolve(message.result)
    } else if (message.id !== undefined && message.method) void onServerRequest(message)
  })
  createInterface({ input: child.stderr }).on('line', line => stderr.push(line))
  child.once('exit', (code, signal) => {
    exit = { code, signal }
  })
  return rpc
}

function sanitizeChildDiagnostic(line) {
  return String(line)
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/APPRAISE_P0_R2D_FAKE_AUTH\s*=\s*\S+/g, 'APPRAISE_P0_R2D_FAKE_AUTH=[redacted]')
    .slice(0, 500)
}
async function runBridge(args) {
  const { stdout } = await import('node:child_process').then(
    ({ execFile }) =>
      new Promise((resolve, reject) =>
        execFile(process.execPath, ['--import', 'tsx', P0_R2D_BRIDGE, ...args], (error, stdout) =>
          error ? reject(error) : resolve({ stdout }),
        ),
      ),
  )
  return JSON.parse(stdout)
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
function deferred() {
  let resolve
  const promise = new Promise(done => {
    resolve = done
  })
  return { promise, resolve }
}
function raceWithTimeout(promise, message, milliseconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds)
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
