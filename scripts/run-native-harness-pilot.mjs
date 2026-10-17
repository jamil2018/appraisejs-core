import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { pilotManifestDigest } from './lib/harness-pilot.mjs'
import {
  assertProcessGroupSupport,
  createPilotCancellation,
  signalProcessGroup,
  stopProcessGroup,
} from './lib/native-pilot-process-groups.mjs'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(repositoryRoot, 'config/development-harness/native-pilot.json')
const commonGuidance = [
  'Work only inside this disposable checkout. Do not install dependencies, use network tools, contact external services, delegate, publish Git changes, or send messages.',
  'Use the supplied repository task and acceptance criteria. Inspect relevant source, make only needed edits, and run focused checks when possible.',
  'Report what changed, checks performed, and any unresolved failures. Do not claim a pass for a check that did not run.',
].join('\n')
const workflowGuidance = [
  'Use scoped Graphify only for relationship questions when its graph is fresh; use targeted source search for exact details.',
  'Keep routine tool output concise while retaining failing command output, exit codes, and source locations.',
  'Avoid repeated discovery and checks unless a change or failure makes a rerun necessary.',
].join('\n')
const codexEventHandlers = {
  'turn.completed': parseTurnEvent,
  'turn.failed': parseTurnEvent,
  'item.completed': parseItemEventEnvelope,
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 30000 })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${executable} ${args[0]} failed: ${result.stderr}`)
  return result.stdout
}

export function parseCodexJsonlLine(line, telemetry) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    telemetry.parseErrors += 1
    telemetry.toolCallCount = null
    telemetry.toolOutputIncomplete = true
    telemetry.toolOutputBytes = null
    return
  }
  codexEventHandlers[event.type]?.(event, telemetry)
}

function parseItemEventEnvelope(event, telemetry) {
  parseItemEvent(firstOrNull(event.item, {}), telemetry)
}

function firstOrNull(...values) {
  const value = values.find(item => item !== null && item !== undefined)
  return value === undefined ? null : value
}

function tokenTotal(input, output) {
  if (input === null || output === null) return null
  return input + output
}

function parseTurnEvent(event, telemetry) {
  telemetry.turnOutcome = event.type
  const usage = firstOrNull(event.usage, event.payload?.usage)
  if (!usage) return
  telemetry.inputTokens = firstOrNull(usage.input_tokens, usage.inputTokens)
  telemetry.cachedInputTokens = firstOrNull(usage.cached_input_tokens, usage.cachedInputTokens)
  telemetry.cacheWriteInputTokens = firstOrNull(usage.cache_write_input_tokens, usage.cacheWriteInputTokens)
  telemetry.outputTokens = firstOrNull(usage.output_tokens, usage.outputTokens)
  telemetry.totalTokens = tokenTotal(telemetry.inputTokens, telemetry.outputTokens)
}

function parseItemEvent(item, telemetry) {
  if (!['command_execution', 'tool_call', 'mcp_tool_call'].includes(item.type)) return
  if (telemetry.toolCallCount !== null) telemetry.toolCallCount += 1
  const output = firstOrNull(item.aggregated_output, item.output, item.result)
  if (typeof output === 'string') addToolOutputBytes(telemetry, output)
  else {
    telemetry.toolOutputIncomplete = true
    telemetry.toolOutputBytes = null
  }
}

function addToolOutputBytes(telemetry, output) {
  if (telemetry.toolOutputIncomplete) return
  telemetry.toolOutputBytes = firstOrNull(telemetry.toolOutputBytes, 0) + Buffer.byteLength(output)
}

function createTelemetry() {
  return {
    turnOutcome: null,
    inputTokens: null,
    cachedInputTokens: null,
    cacheWriteInputTokens: null,
    outputTokens: null,
    totalTokens: null,
    toolCallCount: 0,
    toolOutputBytes: null,
    toolOutputIncomplete: false,
    parseErrors: 0,
  }
}

export function makePrompt(task, arm) {
  return [
    commonGuidance,
    arm.workflow === 'optimized-guidance-only' ? workflowGuidance : '',
    `Task (${task.id}): ${task.prompt}`,
    `Relevant paths: ${task.paths.join(', ')}`,
    `Acceptance criteria:\n${task.acceptance.map(item => `- ${item}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

function parseArguments(argv, manifest) {
  const options = {
    limit: manifest.tasks.length,
    task: null,
    arm: null,
    repetitions: manifest.repetitions,
    output: null,
  }
  readPilotOptions(argv, options)
  options.limit = positivePilotInteger('limit', options.limit)
  options.repetitions = positivePilotInteger('repetitions', options.repetitions)
  validatePilotSelection(options, manifest)
  return options
}

function readPilotOptions(argv, options) {
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (!['--limit', '--task', '--arm', '--repetitions', '--output'].includes(flag) || !argv[index + 1]) {
      throw new Error(`Unsupported or incomplete pilot argument: ${flag}`)
    }
    options[flag.slice(2)] = argv[++index]
  }
}

function positivePilotInteger(name, input) {
  const value = Number(input)
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`)
  return value
}

function validatePilotSelection(options, manifest) {
  if (options.repetitions > manifest.repetitions) throw new Error('Cannot exceed frozen manifest repetitions.')
  if (options.task) assertPilotTask(options.task, manifest.tasks)
  if (options.arm) assertPilotArm(options.arm, manifest.arms)
}

function assertPilotTask(id, tasks) {
  if (!tasks.some(task => task.id === id)) throw new Error('Unknown task.')
}

function assertPilotArm(id, arms) {
  if (!arms.some(arm => arm.id === id)) throw new Error('Unknown arm.')
}

async function archiveCheckout(commit, checkout) {
  mkdirSync(checkout, { recursive: true })
  const archive = spawn('git', ['archive', '--format=tar', commit], {
    cwd: repositoryRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const extract = spawn('tar', ['-xf', '-', '-C', checkout], { stdio: ['pipe', 'ignore', 'pipe'] })
  archive.stdout.pipe(extract.stdin)
  let errors = ''
  archive.stderr.on('data', chunk => (errors += chunk))
  extract.stderr.on('data', chunk => (errors += chunk))
  const statuses = await Promise.all([
    new Promise(resolve => archive.on('close', resolve)),
    new Promise(resolve => extract.on('close', resolve)),
  ])
  if (statuses.some(status => status !== 0)) throw new Error(`Archive checkout failed: ${errors}`)
  command('git', ['init', '-q'], checkout)
  command('git', ['add', '.'], checkout)
  command(
    'git',
    ['-c', 'user.name=Pilot Fixture', '-c', 'user.email=pilot@example.test', 'commit', '-qm', 'frozen base'],
    checkout,
  )
  const modules = path.join(repositoryRoot, 'node_modules')
  if (existsSync(modules)) symlinkSync(modules, path.join(checkout, 'node_modules'))
}

function codexArguments(manifest, arm, checkout, finalPath) {
  return [
    'exec',
    '--ignore-user-config',
    '--disable',
    'plugins',
    '--disable',
    'apps',
    '--ephemeral',
    '--json',
    '--skip-git-repo-check',
    '-s',
    'workspace-write',
    '-m',
    arm.model,
    '-c',
    `model_reasoning_effort="${manifest.execution.effort}"`,
    '-C',
    checkout,
    '--output-last-message',
    finalPath,
    '-',
  ]
}

function captureCodexOutput(child, caseDirectory, telemetry) {
  const stdout = createWriteStream(path.join(caseDirectory, 'raw.jsonl'), { mode: 0o600 })
  const stderr = createWriteStream(path.join(caseDirectory, 'raw.stderr'), { mode: 0o600 })
  let pending = ''
  child.stdout.on('data', chunk => {
    stdout.write(chunk)
    pending += chunk.toString('utf8')
    const lines = pending.split('\n')
    pending = lines.pop()
    for (const line of lines) if (line.trim()) parseCodexJsonlLine(line, telemetry)
  })
  child.stderr.on('data', chunk => stderr.write(chunk))
  return async () => {
    if (pending.trim()) parseCodexJsonlLine(pending, telemetry)
    await Promise.all([closeOutput(stdout), closeOutput(stderr)])
  }
}

function closeOutput(stream) {
  return new Promise(resolve => stream.end(resolve))
}

function childOutcome(child, limitMs, cancellation) {
  let abortTimer
  let limitTimer
  const closed = new Promise(resolve => {
    child.once('error', error => resolve({ error }))
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  const deadline = new Promise(resolve => {
    limitTimer = setTimeout(() => {
      signalProcessGroup(child.pid, 'SIGTERM')
      resolve({ deadline: 'time limit exceeded' })
    }, limitMs)
  })
  const interrupted = new Promise(resolve => {
    const unsubscribe = cancellation.subscribe(signal => {
      abortTimer = setTimeout(() => resolve({ deadline: `runner interrupted by ${signal}` }), 7000)
    })
    closed.finally(unsubscribe)
  })
  return Promise.race([closed, deadline, interrupted]).finally(() => {
    clearTimeout(limitTimer)
    clearTimeout(abortTimer)
  })
}

async function executeCodex(manifest, arm, checkout, caseDirectory, prompt, cancellation) {
  const finalPath = path.join(caseDirectory, 'final.md')
  const args = codexArguments(manifest, arm, checkout, finalPath)
  const child = spawn('codex', args, { cwd: checkout, stdio: ['pipe', 'pipe', 'pipe'], detached: true })
  cancellation.add(child.pid)
  const telemetry = createTelemetry()
  const finishOutput = captureCodexOutput(child, caseDirectory, telemetry)
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)
  const outcome = await childOutcome(child, manifest.execution.timeLimitSeconds * 1000, cancellation)
  finishExpiredChild(child, outcome)
  const groupStopped = await stopProcessGroup(child.pid)
  if (groupStopped) cancellation.delete(child.pid)
  await finishOutput()
  const exitCode = firstOrNull(outcome.code)
  return {
    telemetry,
    groupStopped,
    exitCode,
    signal: firstOrNull(outcome.signal),
    timedOut: outcome.deadline === 'time limit exceeded',
    failure: codexFailure(outcome, cancellation, exitCode, telemetry),
  }
}

function finishExpiredChild(child, outcome) {
  if (!outcome.deadline) return
  signalProcessGroup(child.pid, 'SIGKILL')
  child.stdout.destroy()
  child.stderr.destroy()
}

function codexFailure(outcome, cancellation, exitCode, telemetry) {
  const observedFailure = observedCodexFailure(outcome, cancellation)
  if (observedFailure) return observedFailure
  if (codexCompleted(exitCode, telemetry)) return null
  return `Codex exited ${firstOrNull(exitCode, outcome.signal, 'unknown')} without completion`
}

function observedCodexFailure(outcome, cancellation) {
  if (outcome.error) return outcome.error.message
  return firstOrNull(outcome.deadline, cancellationFailure(cancellation.signal))
}

function cancellationFailure(signal) {
  return signal ? `Runner interrupted by ${signal}` : null
}

function codexCompleted(exitCode, telemetry) {
  return exitCode === 0 && telemetry.turnOutcome === 'turn.completed'
}

function captureCasePatch(checkout, caseDirectory) {
  command('git', ['add', '-N', '-A'], checkout)
  const patch = command('git', ['diff', '--binary', 'HEAD'], checkout)
  writeFileSync(path.join(caseDirectory, 'patch.diff'), patch, { mode: 0o600 })
}

function caseRecord({ manifest, manifestDigest, task, arm, repetition, id, setupMs, elapsedMs, outcome }) {
  return {
    id,
    taskId: task.id,
    category: task.category,
    arm: arm.id,
    repetition,
    model: arm.model,
    manifestDigest,
    baseCommit: manifest.baseCommit,
    effort: manifest.execution.effort,
    observedModel: null,
    workflow: arm.workflow,
    status: caseStatus(outcome),
    failure: outcome.failure,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    timedOut: outcome.timedOut,
    setupMs,
    elapsedMs,
    agentElapsedMs: agentElapsedMs(setupMs, elapsedMs),
    ...outcome.telemetry,
    failures: Number(Boolean(outcome.failure)),
    retries: null,
    manualCorrections: 0,
    correctness: 'unknown',
    requiredReview: 'unknown',
    artifacts: `cases/${id}`,
  }
}

function caseStatus(outcome) {
  if (!outcome.failure) return 'complete'
  if (outcome.timedOut) return 'incomplete'
  return outcome.exitCode === null ? 'incomplete' : 'failed'
}

function agentElapsedMs(setupMs, elapsedMs) {
  return setupMs === null ? null : Math.max(0, elapsedMs - setupMs)
}

async function runCase({ manifest, manifestDigest, task, arm, repetition, outputDirectory, cancellation }) {
  const id = `${task.id}--${arm.id}--r${repetition}`
  const caseDirectory = path.join(outputDirectory, 'cases', id)
  const checkout = path.join(caseDirectory, 'checkout')
  mkdirSync(caseDirectory, { recursive: true })
  const started = performance.now()
  let setupMs = null
  let outcome = {
    telemetry: createTelemetry(),
    groupStopped: true,
    exitCode: null,
    signal: null,
    timedOut: false,
    failure: null,
  }
  try {
    await archiveCheckout(manifest.baseCommit, checkout)
    setupMs = Math.round(performance.now() - started)
    if (cancellation.signal) throw new Error(`Runner interrupted by ${cancellation.signal} during setup.`)
    outcome = await executeCodex(manifest, arm, checkout, caseDirectory, makePrompt(task, arm), cancellation)
  } catch (error) {
    outcome.failure = error.message
  } finally {
    finishCaseCheckout(checkout, caseDirectory, outcome)
  }
  const elapsedMs = Math.round(performance.now() - started)
  return caseRecord({
    manifest,
    manifestDigest,
    task,
    arm,
    repetition,
    id,
    setupMs,
    elapsedMs,
    outcome,
  })
}

function finishCaseCheckout(checkout, caseDirectory, outcome) {
  if (!outcome.groupStopped) {
    outcome.failure = firstOrNull(outcome.failure, 'Process group remained active; checkout retained.')
    return
  }
  if (!existsSync(checkout)) return
  try {
    captureCasePatch(checkout, caseDirectory)
  } catch (error) {
    outcome.failure = firstOrNull(outcome.failure, `Patch capture failed: ${error.message}`)
  }
  rmSync(checkout, { recursive: true, force: true })
}

function freezePilot(manifestBytes, manifest, manifestDigest, outputDirectory) {
  const runnerBytes = readFileSync(fileURLToPath(import.meta.url))
  const helperNames = ['harness-pilot.mjs', 'native-pilot-process-groups.mjs']
  const helpers = helperNames.map(name => [name, readFileSync(path.join(repositoryRoot, 'scripts/lib', name))])
  const freeze = {
    schemaVersion: 1,
    manifestSha256: digest(manifestBytes),
    manifestDigest,
    commonGuidanceSha256: digest(commonGuidance),
    workflowGuidanceSha256: digest(workflowGuidance),
    runnerSha256: digest(runnerBytes),
    importedSourceSha256: Object.fromEntries(helpers.map(([name, bytes]) => [name, digest(bytes)])),
    baseCommit: manifest.baseCommit,
    requestedArms: manifest.arms,
    source: 'config/development-harness/native-pilot.json',
  }
  writeFileSync(path.join(outputDirectory, 'freeze.json'), JSON.stringify(freeze, null, 2), { mode: 0o600 })
  writeFileSync(path.join(outputDirectory, 'manifest-frozen.json'), manifestBytes, { mode: 0o600 })
  writeFileSync(path.join(outputDirectory, 'runner-frozen.mjs'), runnerBytes, { mode: 0o600 })
  mkdirSync(path.join(outputDirectory, 'lib'))
  for (const [name, bytes] of helpers) writeFileSync(path.join(outputDirectory, 'lib', name), bytes, { mode: 0o600 })
  return freeze
}

function planCases(manifest, manifestDigest, options, outputDirectory, cancellation) {
  const selectedTasks = selectPilotTasks(manifest.tasks, options)
  const selectedArms = selectPilotArms(manifest.arms, options.arm)
  const cases = []
  for (const task of selectedTasks) {
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      const arms = orderedPilotArms(selectedArms, repetition)
      for (const arm of arms)
        cases.push({ manifest, manifestDigest, task, arm, repetition, outputDirectory, cancellation })
    }
  }
  return cases
}

function selectPilotTasks(tasks, options) {
  return tasks.filter(task => !options.task || task.id === options.task).slice(0, options.limit)
}

function selectPilotArms(arms, id) {
  return arms.filter(arm => !id || arm.id === id)
}

function orderedPilotArms(arms, repetition) {
  return repetition % 2 ? arms : [...arms].reverse()
}

async function executePilotCases(cases, aggregate, outputDirectory, cancellation) {
  const aggregatePath = path.join(outputDirectory, 'aggregate.json')
  const save = () => writeFileSync(aggregatePath, JSON.stringify(aggregate, null, 2), { mode: 0o600 })
  save()
  let cursor = 0
  async function worker() {
    while (cursor < cases.length && !cancellation.signal) {
      const result = await runCase(cases[cursor++])
      aggregate.runs.push(result)
      aggregate.completedCases = aggregate.runs.length
      save()
      process.stdout.write(`${result.id}: ${result.status} (${result.elapsedMs} ms)\n`)
    }
  }
  await Promise.all([worker(), worker()])
  process.stdout.write(`Pilot aggregate: ${aggregatePath}\n`)
}

export async function runPilot(argv = process.argv.slice(2)) {
  assertProcessGroupSupport()
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes)
  const manifestDigest = pilotManifestDigest(manifest)
  const options = parseArguments(argv, manifest)
  command('git', ['cat-file', '-e', `${manifest.baseCommit}^{commit}`], repositoryRoot)
  const outputDirectory = createPilotOutputDirectory(options.output)
  const freeze = freezePilot(manifestBytes, manifest, manifestDigest, outputDirectory)
  const cancellation = createPilotCancellation()
  const cases = planCases(manifest, manifestDigest, options, outputDirectory, cancellation)
  const aggregate = {
    schemaVersion: 1,
    kind: 'native-harness-pilot',
    freeze,
    limitations:
      'Requested models are not observed host models. Correctness and required review await independent assessment. Internal child retries are unavailable.',
    plannedCases: cases.length,
    completedCases: 0,
    runs: [],
  }
  try {
    await executePilotCases(cases, aggregate, outputDirectory, cancellation)
  } finally {
    cancellation.dispose()
  }
  applyPilotExitSignal(cancellation.signal)
  return aggregate
}

function createPilotOutputDirectory(requested) {
  const outputDirectory = path.resolve(
    firstOrNull(requested, path.join(os.tmpdir(), `appraise-native-pilot-${Date.now()}`)),
  )
  if (existsSync(outputDirectory)) throw new Error('Pilot output directory already exists.')
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 })
  return outputDirectory
}

function applyPilotExitSignal(signal) {
  if (signal) process.exitCode = signal === 'SIGINT' ? 130 : 143
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPilot().catch(error => {
    process.stderr.write(`${error.stack ?? error.message}\n`)
    process.exitCode = 1
  })
}
