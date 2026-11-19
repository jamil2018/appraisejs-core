// This separate check consumes exactly two ordinary Node fixture launches, never a native Codex launch.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERVER_CAPABILITIES, SERVER_INFO, TOOL_SCHEMA } from './transport.mjs'

const fixturePath = fileURLToPath(new URL('./fixture.mjs', import.meta.url))
function deadline(promise, milliseconds, category) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(category)), milliseconds)
    }),
  ]).finally(() => clearTimeout(timer))
}

function fixtureChannel(child) {
  let buffer = ''
  let total = 0
  let pending
  const refuse = category => {
    pending?.reject(new Error(category))
    pending = undefined
  }
  child.stdout.on('data', chunk => {
    total += chunk.length
    if (total > 64 * 1024) return refuse('fixture_output_limit')
    buffer += chunk.toString('utf8')
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const frame = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      try {
        const response = JSON.parse(frame)
        if (!pending || response.id !== pending.id || !('result' in response) || 'error' in response)
          return refuse('fixture_response_refused')
        pending.resolve(response.result)
        pending = undefined
      } catch {
        refuse('fixture_frame_refused')
      }
    }
  })
  child.stdout.on('error', () => refuse('fixture_transport_refused'))
  child.stdin.on('error', () => refuse('fixture_transport_refused'))
  child.stderr.on('data', chunk => {
    total += chunk.length
    if (total > 64 * 1024) refuse('fixture_output_limit')
  })
  const request = (id, method, params) =>
    deadline(
      new Promise((resolveRequest, rejectRequest) => {
        pending = { id, resolve: resolveRequest, reject: rejectRequest }
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      }),
      3_000,
      'fixture_request_deadline',
    )
  return request
}
async function verifyHealthyFixture(request, child) {
  const initialized = await request(1, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'appraise-b1-source-check', version: '1.0.0' },
  })
  assert.equal(initialized.protocolVersion, '2025-11-25')
  assert.deepEqual(initialized.serverInfo, SERVER_INFO)
  assert.deepEqual(initialized.capabilities, SERVER_CAPABILITIES)
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)
  const inventory = await request(2, 'tools/list', {})
  assert.deepEqual(inventory, { tools: [{ name: 'fixture_observe', inputSchema: TOOL_SCHEMA }] })
}
async function stopFixture(child, close) {
  child.stdin.end()
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  try {
    await deadline(close, 1_000, 'fixture_cleanup_term_deadline')
  } catch {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await deadline(close, 1_000, 'fixture_cleanup_kill_deadline')
  }
}
async function checkFixture(mode) {
  const root = mkdtempSync('/private/tmp/m13-b1-fixture-source-')
  for (const name of ['home', 'codex-home', 'tmp', 'cwd']) mkdirSync(join(root, name), { mode: 0o700 })
  const journal = join(root, 'fixture.jsonl')
  writeFileSync(journal, '', { flag: 'wx', mode: 0o600 })
  writeFileSync(join(root, 'launch-spent.json'), JSON.stringify({ mode, nodeFixtureLaunches: 1 }), {
    flag: 'wx',
    mode: 0o600,
  })
  const child = spawn(process.execPath, [fixturePath, mode, journal], {
    cwd: join(root, 'cwd'),
    env: {
      PATH: '/usr/bin:/bin',
      HOME: join(root, 'home'),
      CODEX_HOME: join(root, 'codex-home'),
      TMPDIR: join(root, 'tmp'),
      LANG: 'C',
      LC_ALL: 'C',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const close = new Promise((resolveClose, rejectClose) => {
    child.once('close', (code, signal) => resolveClose({ code, signal }))
    child.once('error', () => rejectClose(new Error('fixture_spawn_refused')))
  })
  let cleaned = false
  const request = fixtureChannel(child)
  try {
    if (mode === 'healthy') {
      await verifyHealthyFixture(request, child)
    } else {
      const exit = await deadline(close, 3_000, 'fixture_exit_deadline')
      assert.equal(exit.code, 19)
      assert.equal(exit.signal, null)
      cleaned = true
    }
  } finally {
    if (!cleaned) {
      await stopFixture(child, close)
      cleaned = true
    }
  }
  const events = readFileSync(journal, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line).event)
  assert.deepEqual(events, mode === 'healthy' ? ['startup', 'tools-list'] : ['startup', 'startup_exit_19'])
  assert.equal(events.filter(event => event === 'tools-call').length, 0)
  if (cleaned) rmSync(root, { recursive: true })
  return { mode, nodeFixtureLaunches: 1, toolsCall: 0, cleanup: 'ORIGINAL_CHILD_EXIT_OBSERVED', disposition: 'PASS' }
}

export async function checkBothFixtures() {
  const results = []
  for (const mode of ['healthy', 'missing']) results.push(await checkFixture(mode))
  return results
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkBothFixtures()
    .then(results => {
      console.log(JSON.stringify({ sourceFixtureChecks: results }))
    })
    .catch(() => {
      console.log(JSON.stringify({ category: 'source_fixture_check_refused', disposition: 'UNKNOWN_OR_REFUSED' }))
      process.exitCode = 1
    })
}
