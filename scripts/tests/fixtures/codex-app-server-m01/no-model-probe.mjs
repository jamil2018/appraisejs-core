// Explicit opt-in disposable observer. Never sends turn/start or auth/login requests.
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
  realpathSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ProtocolFixture } from './protocol-fixture.mjs'

const pin = {
  sha256: '0d5ac7aae20c4eda6242428d5e218c55ba96d8763fda2a271088ff37104b9d28',
  version: 'codex-cli 0.162.0-alpha.17.2',
  os: '27.0.1',
  build: '26A434',
  arch: 'arm64',
}
const config = `model = "gpt-6.1-sol"
model_reasoning_effort = "medium"
model_provider = "m01_offline"
approval_policy = "never"
sandbox_mode = "read-only"
cli_auth_credentials_store = "file"
mcp_oauth_credentials_store = "file"
web_search = "disabled"
[shell_environment_policy]
inherit = "none"
[features]
plugins = false
[analytics]
enabled = false
[model_providers.m01_offline]
name = "M01 no-model offline sentinel"
base_url = "http://127.0.0.1:1/v1"
wire_api = "responses"
requires_openai_auth = false
`
const requiredMcp = `
[mcp_servers.m01_required_failure]
command = "/usr/bin/false"
required = true
startup_timeout_sec = 1
`
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const here = fileURLToPath(new URL('../../../../tasks/codex-app-server-journeys/m01/', import.meta.url))
const binaryArg = process.argv[2]
const outputArg = process.argv[3]
if (!binaryArg || !outputArg || process.argv.length !== 4)
  throw new Error('Usage: node no-model-probe.mjs /absolute/pinned/codex /absolute/output.json')
if (!binaryArg.startsWith('/') || !outputArg.startsWith('/')) throw new Error('absolute paths required')
const binary = realpathSync(binaryArg)
if (sha(readFileSync(binary)) !== pin.sha256) throw new Error('executable hash differs: requalification required')
const os = execFileSync('/usr/bin/sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim()
const build = execFileSync('/usr/bin/sw_vers', ['-buildVersion'], { encoding: 'utf8' }).trim()
const arch = execFileSync('/usr/bin/uname', ['-m'], { encoding: 'utf8' }).trim()
if (os !== pin.os || build !== pin.build || arch !== pin.arch)
  throw new Error('host tuple differs: requalification required')
if (existsSync('/etc/codex/config.toml')) throw new Error('ambient system configuration present: stop before launch')
const root = mkdtempSync('/private/tmp/appraise-m01-probe-')
const normalize = value => JSON.parse(JSON.stringify(value).split(root).join('<disposable-root>'))
const report = {
  systemConfigFileAbsent: true,
  evidenceClass: 'live-no-model',
  pin,
  executable: binary,
  environmentKeys: ['HOME', 'CODEX_HOME', 'PATH', 'TMPDIR', 'LANG', 'RUST_LOG'],
  config,
  configSha256: sha(config),
  requiredMcp,
  requiredMcpConfigSha256: sha(config + requiredMcp),
  observations: [],
  providerInferenceAuthorized: false,
  m01Complete: false,
}
function area(name) {
  const dir = join(root, name)
  for (const part of ['', 'home', 'codex', 'workspace', 'tmp']) mkdirSync(join(dir, part), { recursive: true })
  writeFileSync(join(dir, 'codex/config.toml'), config + (name === 'required-mcp' ? requiredMcp : ''))
  return {
    dir,
    env: {
      HOME: join(dir, 'home'),
      CODEX_HOME: join(dir, 'codex'),
      PATH: '/usr/bin:/bin',
      TMPDIR: join(dir, 'tmp'),
      LANG: 'C',
      RUST_LOG: 'off',
    },
  }
}
function inventory(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...inventory(join(dir, entry.name)))
    else files.push(join(dir, entry.name))
  }
  return files
}
const children = new Set()
function launch(a, dropStartReply = false) {
  const child = spawn(binary, ['app-server', '--listen', 'stdio://', '--strict-config'], {
    cwd: join(a.dir, 'workspace'),
    env: a.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.add(child)
  const sent = []
  const notifications = []
  let dropped = 0
  let buffer = ''
  let stderrBytes = 0
  const closed = new Promise(resolve =>
    child.once('close', (code, signal) => {
      children.delete(child)
      client.close()
      resolve({ code, signal })
    }),
  )
  const client = new ProtocolFixture(
    frame => {
      if (
        frame.method &&
        ![
          'initialize',
          'initialized',
          'config/read',
          'thread/start',
          'thread/resume',
          'thread/read',
          'turn/interrupt',
        ].includes(frame.method)
      )
        throw new Error('live no-model method denied')
      sent.push({ id: frame.id, method: frame.method })
      child.stdin.write(`${JSON.stringify(frame)}\n`)
    },
    { timeoutMs: 10000 },
  )
  child.stdin.on('error', () => client.close())
  child.on('error', () => client.close())
  child.stderr.on('data', data => {
    stderrBytes += data.length
  })
  function dispatchLine(line) {
    try {
      const frame = JSON.parse(line)
      if (frame.method) notifications.push(frame.method)
      if (shouldDrop(frame)) {
        dropped++
        return
      }
      client.feed(`${line}\n`)
    } catch {
      client.close()
    }
  }
  function shouldDrop(frame) {
    if (!dropStartReply) return false
    if (frame.method) return false
    return sent.find(r => r.id === frame.id)?.method === 'thread/start'
  }
  child.stdout.on('data', data => {
    buffer += data.toString()
    if (Buffer.byteLength(buffer) > 262144) {
      client.close()
      child.kill('SIGTERM')
      return
    }
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      dispatchLine(line)
    }
  })

  return {
    client,
    sent,
    notifications,
    initialize: async () => {
      const result = await client.request('initialize', {
        clientInfo: { name: 'appraise_m01_probe', title: 'Appraise M01 disposable probe', version: '0.1' },
        capabilities: { experimentalApi: false, requestAttestation: false, explicitGatewayOauth: true },
      })
      if (result.codexHome !== a.env.CODEX_HOME) throw new Error('unexpected Codex home')
      return normalize(result)
    },
    stop: async () => {
      child.stdin.end()
      const timer = setTimeout(() => child.kill('SIGTERM'), 3000)
      const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
      const result = await closed
      clearTimeout(timer)
      clearTimeout(killTimer)
      client.close()
      return { ...result, stderrBytes, sent, notifications, dropped }
    },
  }
}
function ownUserLayer(layer, a) {
  return layer.name.type === 'user' && layer.name.file === join(a.dir, 'codex/config.toml')
}
function emptySystemLayer(layer) {
  return (
    layer.name.type === 'system' &&
    layer.name.file === '/etc/codex/config.toml' &&
    Object.keys(layer.config).length === 0
  )
}
function validateLayers(layers, a) {
  if (!layers.length) throw new Error('missing configuration-layer evidence')
  for (const layer of layers) validateLayer(layer, a)
}
function validateLayer(layer, a) {
  if (!ownUserLayer(layer, a) && !emptySystemLayer(layer)) throw new Error('ambient or unknown configuration layer')
}
async function configurationRecord(s, a, record) {
  const effective = await s.client.request('config/read', { includeLayers: true, cwd: join(a.dir, 'workspace') })
  validateLayers(effective.layers, a)
  if (effective.config.model_provider !== 'm01_offline') throw new Error('unexpected provider')
  record.effectiveConfigSha256 = sha(JSON.stringify(normalize(effective.config)))
  record.configReadSnapshotSha256 = sha(JSON.stringify(normalize(effective)))
  record.effectiveProvider = effective.config.model_provider
  record.configLayers = normalize(
    effective.layers.map(layer => ({ source: layer.name, configKeys: Object.keys(layer.config) })),
  )
}
async function probe(name, fn, existingArea) {
  const a = existingArea ?? area(name)
  const s = launch(a, name === 'lost-ack')
  const record = { name }
  try {
    record.handshake = await s.initialize()
    await configurationRecord(s, a, record)
    await fn(s, a, record)
  } catch (error) {
    record.error = normalize({ message: error.message, rpcError: error.rpcError ?? null })
  } finally {
    record.transport = await s.stop()
    report.observations.push(record)
  }
  return a
}
try {
  const a = area('schemas')
  report.actualVersion = execFileSync(binary, ['--version'], { cwd: a.dir, env: a.env, encoding: 'utf8' }).trim()
  if (report.actualVersion !== pin.version) throw new Error('version mismatch')
  const schemaDir = join(root, 'schemas-generated')
  execFileSync(binary, ['app-server', 'generate-json-schema', '--out', schemaDir], {
    cwd: a.dir,
    env: a.env,
    stdio: 'pipe',
    timeout: 30000,
  })
  const schemaFiles = inventory(schemaDir)
    .sort()
    .map(file => ({ file: file.slice(schemaDir.length + 1), sha256: sha(readFileSync(file)) }))
  report.schemaManifestSha256 = sha(JSON.stringify(schemaFiles))
  report.schemaFileCount = schemaFiles.length
  const expectedSchema = JSON.parse(readFileSync(join(here, 'schema-pin.json'), 'utf8'))
  if (report.schemaManifestSha256 !== expectedSchema.manifestSha256) throw new Error('schema drift')
  let threadId
  const baselineArea = await probe('baseline', async (s, a, r) => {
    const shared = {
      cwd: join(a.dir, 'workspace'),
      model: 'gpt-6.1-sol',
      modelProvider: 'm01_offline',
      approvalPolicy: 'never',
      sandbox: 'read-only',
    }
    const start = await s.client.request('thread/start', shared)
    threadId = start.thread.id
    r.start = {
      threadIdCaptured: true,
      provider: start.modelProvider,
      model: start.model,
      approvalPolicy: start.approvalPolicy,
      sandbox: start.sandbox,
    }
    const resumed = await s.client.request('thread/resume', { ...shared, threadId })
    r.sameProcessResumeMatches = resumed.thread.id === threadId
    const read = await s.client.request('thread/read', { threadId, includeTurns: false })
    r.readMatches = read.thread.id === threadId
  })
  if (threadId)
    await probe(
      'restart-resume',
      async (s, a, r) => {
        const resumed = await s.client.request('thread/resume', {
          threadId,
          cwd: join(a.dir, 'workspace'),
          modelProvider: 'm01_offline',
          approvalPolicy: 'never',
          sandbox: 'read-only',
        })
        r.matches = resumed.thread.id === threadId
      },
      baselineArea,
    )
  await probe('idle-interrupt', async (s, a, r) => {
    const start = await s.client.request('thread/start', {
      cwd: join(a.dir, 'workspace'),
      modelProvider: 'm01_offline',
      approvalPolicy: 'never',
      sandbox: 'read-only',
    })
    try {
      await s.client.request('turn/interrupt', { threadId: start.thread.id, turnId: 'm01-no-such-turn' })
      r.idleInterruptAcknowledged = true
    } catch (error) {
      r.idleInterruptError = error.rpcError ?? error.message
    }
  })
  await probe('required-mcp', async (s, a, r) => {
    try {
      await s.client.request('thread/start', {
        cwd: join(a.dir, 'workspace'),
        modelProvider: 'm01_offline',
        approvalPolicy: 'never',
        sandbox: 'read-only',
      })
      r.requiredMcpRejected = false
    } catch (error) {
      r.requiredMcpRejected = Boolean(error.rpcError)
      r.rejection = error.rpcError ?? error.message
    }
  })
  await probe('lost-ack', async (s, a, r) => {
    try {
      await s.client.request('thread/start', {
        cwd: join(a.dir, 'workspace'),
        modelProvider: 'm01_offline',
        approvalPolicy: 'never',
        sandbox: 'read-only',
      })
    } catch (error) {
      r.ackOutcome = error.message
    }
    r.unknownStart = s.client.unknownStart
    r.startRequestCount = s.sent.filter(frame => frame.method === 'thread/start').length
    r.automaticResend = false
  })
} catch (error) {
  report.preparationError = error.message
  process.exitCode = 1
} finally {
  for (const child of children) child.kill('SIGTERM')
  rmSync(root, { recursive: true, force: true })
  report.disposableStateDeleted = true
  report.generatedAtUtc = new Date().toISOString()
  writeFileSync(resolve(outputArg), `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    JSON.stringify({
      output: outputArg,
      probes: report.observations.map(r => ({ name: r.name, error: r.error ?? null })),
      preparationError: report.preparationError ?? null,
    }),
  )
}
