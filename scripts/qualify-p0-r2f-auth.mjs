#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

import { DISABLED_FEATURES } from './lib/p0-r2c-dynamic-tools-experiment.mjs'
import { collectBoundedBody } from './lib/p0-r2d-interlock-experiment.mjs'
import { inspectProcessIdentity, terminateOwnedProcessGroup } from './lib/managed-journey-isolated-launch.mjs'

const binary =
  '/private/tmp/appraise-codex-0154-npm-cache/_npx/4897a91091a83573/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex'
const results = []
for (const arm of ['refresh-success', 'refresh-error']) results.push(await runArm(arm))
const fixturePassed = results.every(result => result.fixturePassed)
const subject = { schema: 'appraise.p0-r2f-auth-preflight/v1', fixturePassed, providerQualified: false, results }
const output = { ...subject, receiptSubjectSha256: hash(canonicalJson(subject)) }
writeFileSync('/private/tmp/appraise-p0-r2f-auth-final.json', `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 })
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
if (!fixturePassed) process.exitCode = 2

async function runArm(arm) {
  const root = mkdtempSync(path.join(tmpdir(), 'appraise-p0-r2f-'))
  const workspace = path.join(root, 'workspace')
  mkdirSync(workspace, { recursive: true, mode: 0o700 })
  const requests = []
  const observedPaths = []
  let error = null
  let child, identity, rpc, config, canaryResult, cleanup
  const initialToken = fakeJwt('initial')
  const refreshedToken = fakeJwt('refreshed')
  const forbidden = http.createServer((_request, response) => response.end())
  const server = http.createServer((request, response) => {
    void (async () => {
      const requestBody = await collectBoundedBody(request)
      const pathname = new URL(request.url, 'http://localhost').pathname
      observedPaths.push({ method: request.method, pathname })
      if (pathname !== '/v1/responses') {
        if (request.method !== 'GET' || !['/v1/models', '/backend-api/wham/settings/user'].includes(pathname)) {
          error = 'unexpected_fixture_route'
          response.writeHead(404)
          response.end()
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{"data":[]}')
        return
      }
      if (request.method !== 'POST') {
        error = 'unexpected_responses_method'
        response.writeHead(405)
        response.end()
        return
      }
      requests.push({
        method: request.method,
        authorizationExpected:
          String(request.headers.authorization ?? '') ===
          `Bearer ${requests.length === 0 ? initialToken : refreshedToken}`,
        bodyByteLength: requestBody.length,
        bodySha256: hash(requestBody),
        bodySummary: summarizeJson(requestBody),
      })
      if (requests.length === 1) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end('{"error":{"message":"unauthorized"}}')
        return
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"synthetic","status":"completed","output":[]}}\n\n',
      )
    })().catch(() => {
      error = 'fixture_body_error'
      response.destroy()
    })
  })
  try {
    await listen(server)
    await listen(forbidden)
    const port = server.address().port
    config = configText(port)
    writeFileSync(path.join(root, 'config.toml'), config, { mode: 0o600 })
    const profile = `(version 1) (allow default) (deny network*) (allow network-outbound (remote ip "localhost:${port}"))`
    canaryResult = await canary(profile, forbidden.address().port)
    child = spawn('/usr/bin/sandbox-exec', ['-p', profile, binary, 'app-server', '--stdio', '--strict-config'], {
      cwd: workspace,
      detached: true,
      env: { CODEX_HOME: root, HOME: root, LANG: 'C', PATH: '/opt/homebrew/bin:/usr/bin:/bin', TMPDIR: '/private/tmp' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    identity = await inspectProcessIdentity(child.pid)
    rpc = rpcClient(child, arm)
    await rpc.send('initialize', {
      capabilities: { experimentalApi: true },
      clientInfo: { name: 'appraise-p0-r2f', version: '1' },
    })
    rpc.notify('initialized')
    await rpc.send('account/login/start', {
      type: 'chatgptAuthTokens',
      accessToken: initialToken,
      chatgptAccountId: 'p0-r2f-workspace',
      chatgptPlanType: 'pro',
    })
    const thread = await rpc.send('thread/start', {
      approvalPolicy: 'never',
      cwd: workspace,
      dynamicTools: [],
      ephemeral: true,
      model: 'mock-model',
      modelProvider: 'mock_provider',
      sandbox: 'read-only',
    })
    await rpc.send('turn/start', { threadId: thread.thread.id, input: [{ type: 'text', text: 'synthetic' }] })
    await rpc.waitForCompletion()
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught)
  } finally {
    rpc?.close()
    if (child && child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(done, 500)
        function done() {
          clearTimeout(timer)
          child.off('exit', done)
          resolve()
        }
        child.once('exit', done)
      })
    }
    try {
      if (child && identity) cleanup = await terminateOwnedProcessGroup(child, identity)
      else if (child?.pid) {
        child.kill('SIGTERM')
        error = error ?? 'identity_unavailable'
      }
    } finally {
      for (const listener of [server, forbidden])
        if (listener.listening) {
          listener.closeAllConnections()
          await close(listener)
        }
    }
  }
  if (!cleanup || !rpc || !config || !canaryResult) throw new Error(error ?? 'fixture_incomplete')
  const refresh = rpc.refresh
  const success = arm === 'refresh-success'
  const toolsEmpty = requests.every(
    request => request.bodySummary?.toolsField === 'absent' || request.bodySummary?.toolsSha256 === hash('[]'),
  )
  const fixturePassed =
    !error &&
    canaryResult.denied &&
    cleanup.cleanupConfirmed &&
    cleanup.survivingProcessCount === 0 &&
    requests.length === (success ? 2 : 1) &&
    requests.every(request => request.method === 'POST' && request.authorizationExpected) &&
    toolsEmpty &&
    refresh.count === 1 &&
    refresh.errorSent === !success &&
    refresh.successSent === success &&
    (success ? rpc.completed === 'completed' : rpc.completed === 'failed')
  return {
    arm,
    fixturePassed,
    receipt: {
      canaryDenied: canaryResult.denied,
      cleanupConfirmed: cleanup.cleanupConfirmed,
      survivingProcessCount: cleanup.survivingProcessCount,
      configSha256: hash(config),
      executableSha256: hash(readFileSync(binary)),
      sourceSha256: Object.fromEntries(
        [
          fileURLToPath(import.meta.url),
          path.resolve('scripts/lib/p0-r2c-dynamic-tools-experiment.mjs'),
          path.resolve('scripts/lib/p0-r2d-interlock-experiment.mjs'),
          path.resolve('scripts/lib/managed-journey-isolated-launch.mjs'),
        ].map(file => [file, hash(readFileSync(file))]),
      ),
      mcpConfigured: false,
      providerQualified: false,
      modelVisibleToolsEmpty: toolsEmpty,
      modelVisibleToolManifest: requests.map(request => request.bodySummary?.toolManifest ?? null),
      refresh: { count: refresh.count, errorSent: refresh.errorSent, successSent: refresh.successSent },
      requestMethods: requests.map(request => request.method),
      requestAuthorizationExpected: requests.map(request => request.authorizationExpected),
      requestBodyByteLength: requests.map(request => request.bodyByteLength),
      retryBodyBytesEqual:
        success && requests.length === 2
          ? requests[0].bodySha256 === requests[1].bodySha256 &&
            requests[0].bodyByteLength === requests[1].bodyByteLength
          : null,
      requestBodySha256: requests.map(request => request.bodySha256),
      retryBodyDifference:
        success && requests.length === 2 ? compareBodies(requests[0].bodySummary, requests[1].bodySummary) : null,
      requestCount: requests.length,
      observedPaths,
      turnStatus: rpc.completed,
      ...(error ? { error } : {}),
    },
  }
}

function rpcClient(child, arm) {
  let next = 1
  const pending = new Map()
  let completed = null
  const refresh = { count: 0, errorSent: false, successSent: false }
  let resolveCompleted
  const completion = new Promise(resolve => {
    resolveCompleted = resolve
  })
  const write = message => child.stdin.write(`${JSON.stringify(message)}\n`)
  createInterface({ input: child.stdout }).on('line', line => {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (message.id !== undefined && pending.has(message.id)) {
      const item = pending.get(message.id)
      pending.delete(message.id)
      clearTimeout(item.timer)
      if (message.error) item.reject(new Error(message.error.message ?? 'rpc'))
      else item.resolve(message.result)
      return
    }
    if (message.method === 'account/chatgptAuthTokens/refresh') {
      refresh.count += 1
      if (arm === 'refresh-success') {
        refresh.successSent = true
        write({
          id: message.id,
          result: { accessToken: fakeJwt('refreshed'), chatgptAccountId: 'p0-r2f-workspace', chatgptPlanType: 'pro' },
        })
      } else {
        refresh.errorSent = true
        write({ id: message.id, error: { code: -32000, message: 'synthetic refresh error' } })
      }
    }
    if (message.method === 'turn/completed') {
      completed = message.params?.turn?.status ?? 'unknown'
      resolveCompleted(completed)
    }
  })
  return {
    get completed() {
      return completed
    },
    refresh,
    close() {
      for (const value of pending.values()) {
        clearTimeout(value.timer)
        value.reject(new Error('closed'))
      }
      pending.clear()
      child.stdin.end()
    },
    notify(method, params = {}) {
      write({ method, params })
    },
    send(method, params) {
      const id = next++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${method}:timeout`))
        }, 8000)
        pending.set(id, { resolve, reject, timer })
        write({ id, method, params })
      })
    },
    async waitForCompletion() {
      return Promise.race([
        completion,
        new Promise((_, reject) => setTimeout(() => reject(new Error('turn:timeout')), 12000)),
      ])
    },
  }
}

function configText(port) {
  const features = DISABLED_FEATURES.map(name => `${name} = false`).join('\n')
  return `model = "mock-model"\nmodel_provider = "mock_provider"\napproval_policy = "never"\nsandbox_mode = "read-only"\nallow_login_shell = false\nweb_search = "disabled"\nchatgpt_base_url = "http://localhost:${port}/backend-api"\n[analytics]\nenabled = false\n[agents]\nenabled = false\n[memories]\ngenerate_memories = false\nuse_memories = false\n[tools.experimental_request_user_input]\nenabled = false\n[features]\n${features}\ndefault_mode_request_user_input = false\n[model_providers.mock_provider]\nname = "P0 R2f local auth fixture"\nbase_url = "http://localhost:${port}/v1"\nwire_api = "responses"\nrequires_openai_auth = true\nsupports_websockets = false\nrequest_max_retries = 0\nstream_max_retries = 0\n`
}
function fakeJwt(label) {
  return `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify({ email: `${label}@invalid.local`, 'https://api.openai.com/auth': { chatgpt_account_id: 'p0-r2f-workspace', chatgpt_plan_type: 'pro' } })).toString('base64url')}.x`
}
function hash(value) {
  return createHash('sha256').update(value).digest('hex')
}
function summarizeJson(body) {
  try {
    const value = JSON.parse(body)
    return {
      inputSha256: hash(JSON.stringify(value.input ?? null)),
      modelSha256: hash(JSON.stringify(value.model ?? null)),
      toolManifest: Array.isArray(value.tools)
        ? value.tools.map(tool => ({
            definitionSha256: hash(JSON.stringify(tool)),
            name: typeof tool?.name === 'string' ? tool.name : null,
            type: typeof tool?.type === 'string' ? tool.type : null,
          }))
        : null,
      toolsField: Object.hasOwn(value, 'tools') ? 'present' : 'absent',
      toolsSha256: hash(JSON.stringify(value.tools ?? null)),
      tree: summarizeValue(value),
    }
  } catch {
    return { invalid: true }
  }
}
function summarizeValue(value) {
  if (value === null || typeof value !== 'object')
    return { digest: hash(JSON.stringify(value)), type: value === null ? 'null' : typeof value }
  if (Array.isArray(value)) return { children: value.map(summarizeValue), type: 'array' }
  return {
    children: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, summarizeValue(child)])),
    type: 'object',
  }
}
function compareBodies(left, right) {
  const differences = []
  diffTree(left.tree, right.tree, '$', differences)
  return {
    canonicalJsonEqual: canonicalJson(left.tree) === canonicalJson(right.tree),
    differences,
    inputUnchanged: left.inputSha256 === right.inputSha256,
    modelUnchanged: left.modelSha256 === right.modelSha256,
    toolsUnchanged: left.toolsSha256 === right.toolsSha256,
  }
}
function diffTree(left, right, path, differences) {
  if (!left || !right || left.type !== right.type) {
    differences.push({ leftType: left?.type ?? 'missing', path, rightType: right?.type ?? 'missing' })
    return
  }
  if (left.digest && left.digest !== right.digest)
    differences.push({
      leftDigest: left.digest,
      leftType: left.type,
      path,
      rightDigest: right.digest,
      rightType: right.type,
    })
  const keys = new Set([...Object.keys(left.children ?? {}), ...Object.keys(right.children ?? {})])
  for (const key of keys) diffTree(left.children?.[key], right.children?.[key], `${path}.${key}`, differences)
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
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
function canary(profile, port) {
  return new Promise(resolve => {
    const child = spawn('/usr/bin/sandbox-exec', [
      '-p',
      profile,
      process.execPath,
      '-e',
      `require('node:net').connect(${port},'127.0.0.1').on('connect',()=>process.exit(10)).on('error',e=>process.exit(e.code==='EPERM'||e.code==='EACCES'?0:11));setTimeout(()=>process.exit(12),1000)`,
    ])
    child.once('exit', code => resolve({ denied: code === 0 }))
  })
}
