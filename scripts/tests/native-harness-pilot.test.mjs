import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { makePrompt, parseCodexJsonlLine } from '../run-native-harness-pilot.mjs'
import { assertProcessGroupSupport, processGroupExists } from '../lib/native-pilot-process-groups.mjs'

const runner = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../run-native-harness-pilot.mjs')

test('parses completed Codex JSONL usage and exposed tool output without counting cached tokens twice', () => {
  const telemetry = {
    turnOutcome: null,
    inputTokens: null,
    cachedInputTokens: null,
    cacheWriteInputTokens: null,
    outputTokens: null,
    totalTokens: null,
    toolCallCount: 0,
    toolOutputBytes: 0,
    parseErrors: 0,
  }
  parseCodexJsonlLine(
    JSON.stringify({
      type: 'item.completed',
      item: { type: 'command_execution', aggregated_output: 'failure detail\n' },
    }),
    telemetry,
  )
  parseCodexJsonlLine(
    JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 100, cached_input_tokens: 60, cache_write_input_tokens: 10, output_tokens: 20 },
    }),
    telemetry,
  )
  assert.equal(telemetry.totalTokens, 120)
  assert.equal(telemetry.cachedInputTokens, 60)
  assert.equal(telemetry.cacheWriteInputTokens, 10)
  assert.equal(telemetry.toolCallCount, 1)
  assert.equal(telemetry.toolOutputBytes, Buffer.byteLength('failure detail\n'))
  assert.equal(telemetry.turnOutcome, 'turn.completed')
  parseCodexJsonlLine('{invalid', telemetry)
  assert.equal(telemetry.parseErrors, 1)
  assert.equal(telemetry.toolCallCount, null)
  assert.equal(telemetry.toolOutputBytes, null)
  parseCodexJsonlLine(
    JSON.stringify({ type: 'item.completed', item: { type: 'tool_call', output: 'later output' } }),
    telemetry,
  )
  assert.equal(telemetry.toolCallCount, null)
  assert.equal(telemetry.toolOutputBytes, null)
})

test('unexposed tool output volume remains unknown', () => {
  const telemetry = { toolCallCount: 0, toolOutputBytes: null, parseErrors: 0 }
  parseCodexJsonlLine(JSON.stringify({ type: 'item.completed', item: { type: 'tool_call' } }), telemetry)
  assert.equal(telemetry.toolCallCount, 1)
  assert.equal(telemetry.toolOutputBytes, null)
})

test('pilot fails closed where POSIX process groups are unavailable', () => {
  assert.throws(() => assertProcessGroupSupport('win32'), /requires POSIX process groups/)
  assert.doesNotThrow(() => assertProcessGroupSupport('darwin'))
})

test('prompt keeps task identical across model comparison and adds guidance only to workflow arm', () => {
  const task = {
    id: 'fixture',
    prompt: 'Inspect a source path.',
    paths: ['src/example.ts'],
    acceptance: ['Cite source'],
  }
  const baseline = makePrompt(task, { workflow: 'frozen-current' })
  const model = makePrompt(task, { workflow: 'frozen-current' })
  const workflow = makePrompt(task, { workflow: 'optimized-guidance-only' })
  assert.equal(baseline, model)
  assert.match(workflow, /Use scoped Graphify/)
  assert.ok(workflow.includes(baseline.slice(baseline.indexOf('Task (fixture):'))))
  assert.match(baseline, /Do not install dependencies/)
})

test('pilot interruption stops a stub child group and persists an incomplete run', { timeout: 30000 }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'native-pilot-stub-'))
  const bin = path.join(root, 'bin')
  const output = path.join(root, 'output')
  const marker = path.join(root, 'started.json')
  mkdirSync(bin)
  const stub = path.join(bin, 'codex')
  writeFileSync(
    stub,
    `#!/usr/bin/env node
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
fs.writeFileSync(process.env.PILOT_STUB_MARKER,JSON.stringify({pid:process.pid,descendant:descendant.pid}));
setInterval(()=>{},1000);
`,
  )
  chmodSync(stub, 0o755)
  const child = spawn(
    process.execPath,
    [runner, '--limit', '1', '--arm', 'baseline', '--repetitions', '1', '--output', output],
    {
      env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, PILOT_STUB_MARKER: marker },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let diagnostics = ''
  child.stderr.on('data', chunk => (diagnostics += chunk))
  try {
    for (let attempt = 0; attempt < 100 && !existsSync(marker); attempt += 1)
      await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(existsSync(marker), true, 'stub Codex was not started')
    const { pid } = JSON.parse(readFileSync(marker, 'utf8'))
    const closed = new Promise(resolve => child.on('close', resolve))
    child.kill('SIGTERM')
    const exitCode = await closed
    assert.equal(exitCode, 143, diagnostics)
    const aggregate = JSON.parse(readFileSync(path.join(output, 'aggregate.json'), 'utf8'))
    assert.equal(existsSync(path.join(output, 'manifest-frozen.json')), true)
    assert.equal(existsSync(path.join(output, 'runner-frozen.mjs')), true)
    assert.equal(existsSync(path.join(output, 'lib/harness-pilot.mjs')), true)
    assert.equal(existsSync(path.join(output, 'lib/native-pilot-process-groups.mjs')), true)
    assert.equal(aggregate.runs.length, 1)
    assert.equal(aggregate.runs[0].status, 'incomplete')
    assert.match(aggregate.runs[0].failure, /interrupted/)
    assert.equal(processGroupExists(pid), false)
    assert.equal(existsSync(path.join(output, 'cases', aggregate.runs[0].id, 'checkout')), false)
  } finally {
    child.kill('SIGKILL')
    rmSync(root, { recursive: true, force: true })
  }
})

test('any unexposed tool output keeps aggregate bytes unknown in either event order', () => {
  const exposed = { type: 'item.completed', item: { type: 'command_execution', aggregated_output: 'abc' } }
  const unexposed = { type: 'item.completed', item: { type: 'tool_call' } }
  for (const events of [
    [exposed, unexposed, exposed],
    [unexposed, exposed],
  ]) {
    const telemetry = { toolCallCount: 0, toolOutputBytes: null, parseErrors: 0 }
    events.forEach(event => parseCodexJsonlLine(JSON.stringify(event), telemetry))
    assert.equal(telemetry.toolOutputBytes, null)
    assert.equal(telemetry.toolOutputIncomplete, true)
    assert.equal(telemetry.toolCallCount, events.length)
  }
})
