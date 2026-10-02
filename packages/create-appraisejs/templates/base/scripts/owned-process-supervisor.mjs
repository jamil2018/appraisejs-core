// This file is launched by Node directly. Its IPC channel is private to the parent hub.
// Only this still-live session leader may signal its own negative PGID.
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const nonce = randomUUID()
let child
let childCode = null
let childExited = false
let childClosed = false
let resolveChildClose
const childClose = new Promise(resolve => {
  resolveChildClose = resolve
})
let draining = false
let stopped = false
let resourceState = 'none'
let resourceBuffer = ''

process.on('SIGTERM', () => {})

function send(message) {
  return new Promise(resolve => {
    if (!process.connected) return resolve(false)
    process.send({ ...message, nonce }, error => resolve(!error))
  })
}

function members() {
  return new Promise((resolve, reject) => {
    const inspection = execFile('ps', ['-axo', 'pid=,pgid=,stat='], (error, stdout) => {
      if (error) return reject(error)
      const live = Array.from(stdout.matchAll(/^\s*(\d+)\s+(\d+)\s+(\S+)/gm), ([, pid, group, state]) => ({
        pid: Number(pid),
        group: Number(group),
        state,
      }))
        .filter(row => row.group === process.pid && row.pid !== process.pid && row.pid !== inspection.pid)
        .filter(row => !row.state.startsWith('Z'))
      resolve(live)
    })
  })
}

async function waitForDrain(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  do {
    if ((await members()).length === 0) return true
    await new Promise(resolve => setTimeout(resolve, 25))
  } while (Date.now() < deadline)
  return (await members()).length === 0
}

async function waitForChildClose(timeoutMs) {
  if (childClosed) return true
  return Promise.race([
    childClose.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), timeoutMs)),
  ])
}

async function terminateMembers(termWaitMs) {
  if ((await members()).length === 0) return true
  process.kill(-process.pid, 'SIGTERM')
  return waitForDrain(termWaitMs)
}

async function escalateGroup() {
  // The callback flushes protocol evidence before self-inclusive SIGKILL.
  await send({ type: 'escalating', browserClosed: resourceState === 'closed' })
  process.kill(-process.pid, 'SIGKILL')
}

async function drain(termWaitMs = 1500, killWaitMs = 2000) {
  if (draining) return
  draining = true
  try {
    await finishDrain(termWaitMs, killWaitMs)
  } catch {
    await send({ type: 'failed', reason: 'group inspection or signaling failed' })
    // IPC or inspection failure stays unverified, but the live leader still
    // owns its group and must not leave descendants running.
    process.kill(-process.pid, 'SIGKILL')
  }
}

async function finishDrain(termWaitMs, killWaitMs) {
  if (!(await terminateMembers(termWaitMs))) return escalateGroup()
  // An exit event and an empty PGID can precede delivery of the resource
  // pipe. The child close event proves that every fd3 byte has been read.
  if (!(await waitForChildClose(killWaitMs))) {
    await send({ type: 'failed', reason: 'child resource pipe did not close' })
    process.kill(-process.pid, 'SIGKILL')
    return
  }
  await send({ type: 'finished', browserClosed: resourceState === 'closed' })
  process.exit(completionCode())
}

function completionCode() {
  if (stopped) return 0
  return childCode ?? 1
}

const transitions = {
  none: { 'appraise.browser.launch-intent.v1': 'launching' },
  launching: { 'appraise.browser.closed.v1': 'closed' },
}

function consumeResourceLine(line) {
  resourceState = transitions[resourceState]?.[line] ?? 'invalid'
}

function consumeResourceData(data) {
  resourceBuffer += data.toString()
  if (resourceBuffer.length > 4096) {
    resourceBuffer = ''
    resourceState = 'invalid'
    return
  }
  const lines = resourceBuffer.split('\n')
  resourceBuffer = lines.pop()
  for (const line of lines) consumeResourceLine(line)
}

function validStart(message) {
  const checks = [
    typeof message.command === 'string',
    Array.isArray(message.args),
    Array.isArray(message.args) && message.args.every(arg => typeof arg === 'string'),
    typeof message.cwd === 'string',
    !!message.env,
    typeof message.env === 'object',
  ]
  return checks.every(Boolean)
}

async function startChild(message) {
  if (!validStart(message)) {
    await send({ type: 'failed', reason: 'invalid child launch request' })
    process.exit(1)
  }
  // The child receives precisely the sealed command, cwd and environment.
  child = spawn(message.command, message.args, {
    cwd: message.cwd,
    env: message.env,
    stdio: ['inherit', 'inherit', 'inherit', 'pipe'],
  })
  child.stdio[3].on('data', consumeResourceData)
  child.once('error', async () => {
    await send({ type: 'failed', reason: 'child spawn failed' })
    process.exit(1)
  })
  child.once('exit', code => {
    childCode = code
    childExited = true
    void drain()
  })
  child.once('close', () => {
    if (resourceBuffer) resourceState = 'invalid'
    childClosed = true
    resolveChildClose()
    void drain()
  })
  await send({ type: 'started', childPid: child.pid })
}

function stopChild(message) {
  if (!childExited) stopped = true
  const termWaitMs = Number.isSafeInteger(message.termWaitMs) ? Math.max(0, message.termWaitMs) : 1500
  const killWaitMs = Number.isSafeInteger(message.killWaitMs) ? Math.max(0, message.killWaitMs) : 2000
  void drain(termWaitMs, killWaitMs)
}

const messageHandlers = new Map([
  [
    'start',
    message => {
      if (!child) void startChild(message)
    },
  ],
  [
    'stop',
    message => {
      if (child) stopChild(message)
    },
  ],
])

function handleMessage(message) {
  if (message?.nonce !== nonce) return
  messageHandlers.get(message.type)?.(message)
}

process.on('message', handleMessage)

process.on('disconnect', () => {
  if (child && !childExited) void drain()
})

execFile('ps', ['-o', 'pgid=', '-p', String(process.pid)], async (error, stdout) => {
  if (error || Number(stdout.trim()) !== process.pid) {
    await send({ type: 'failed', reason: 'supervisor is not a verified session leader' })
    process.exit(1)
  }
  await send({ type: 'ready' })
})
