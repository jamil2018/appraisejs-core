// Inert owned Node protocol fixture. Uses stdio and a disposable test marker. Never reads credentials or opens a network connection.
/* eslint-disable @typescript-eslint/no-require-imports -- Direct CommonJS executable fixture. */
const { existsSync } = require('node:fs')
const readline = require('node:readline')
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
const warning = { method: 'configWarning', params: { summary: startupWarning } }
const account = { method: 'account/updated', params: { authMode: 'chatgpt', planType: 'unknown' } }
let pendingAccountSuffix = ''
function initialize(request) {
  const reply = {
    id: request.id,
    result: {
      userAgent: 'inert',
      platformFamily: 'unix',
      platformOs: 'test',
      codexHome: process.env.CODEX_HOME,
    },
  }
  if (startupScenario === 'before-init') send(warning)
  if (startupScenario === 'invalid-init') reply.result = {}
  if (startupScenario === 'same-chunk') {
    process.stdout.write([reply, warning, account].map(value => JSON.stringify(value)).join('\n') + '\n')
  } else {
    send(reply)
    if (startupScenario === 'nonnull-warning') warning.params.details = 'private-sentinel-rejected'
    send(warning)
    if (startupScenario === 'split') {
      const bytes = JSON.stringify(account) + '\n'
      process.stdout.write(bytes.slice(0, 17))
      pendingAccountSuffix = bytes.slice(17)
    } else if (startupScenario === 'different-microtasks') {
      setTimeout(() => send(account), 40)
    } else if (!['missing-account', 'premature-reply'].includes(startupScenario)) send(account)
    if (startupScenario === 'duplicate') send(account)
  }
}
function configuration(request) {
  // The request is the barrier between fragments. Finish the frame before emitting the reply.
  if (pendingAccountSuffix) {
    process.stdout.write(pendingAccountSuffix)
    pendingAccountSuffix = ''
  }
  send({ id: request.id, result: safeConfiguration })
  if (startupScenario === 'premature-reply') {
    const timer = setInterval(() => {
      if (!existsSync('release-premature-reply')) return
      clearInterval(timer)
      send({ id: 3, result: {} })
    }, 5)
    timer.unref()
  }
}
function thread(request) {
  if (
    request.params.sandbox !== 'read-only' ||
    request.params.ephemeral !== true ||
    request.params.approvalPolicy !== 'never'
  ) {
    send({ id: request.id, error: { code: -32600, message: 'inert wire control mismatch' } })
    return
  }
  send({
    id: request.id,
    result: {
      approvalPolicy: 'never',
      approvalsReviewer: 'user',
      cwd: request.params.cwd,
      model: 'gpt-5.5',
      modelProvider: 'openai',
      sandbox: { type: 'readOnly' },
      thread: {
        id: 'inert-thread',
        ephemeral: true,
        turns: [],
        cliVersion: 'inert',
        createdAt: 0,
        updatedAt: 0,
        cwd: request.params.cwd,
        modelProvider: 'openai',
        preview: '',
        projectId: null,
        sessionId: 'inert-session',
        source: 'appServer',
        status: { type: 'idle' },
      },
    },
  })
}
function turn(request) {
  if (
    request.params.threadId !== 'inert-thread' ||
    request.params.input?.length !== 1 ||
    request.params.input[0]?.type !== 'text' ||
    request.params.input[0]?.text !== 'approved'
  ) {
    send({ id: request.id, error: { code: -32600, message: 'inert wire input mismatch' } })
    return
  }
  send({ id: request.id, result: { turn: { id: 'inert-turn', items: [], status: 'inProgress' } } })
}
readline.createInterface({ input: process.stdin }).on('line', line => {
  const request = JSON.parse(line)
  if (request.method === 'initialize') initialize(request)
  if (request.method === 'config/read') configuration(request)
  if (request.method === 'mcpServerStatus/list') send({ id: request.id, result: { data: [] } })
  if (request.method === 'thread/start') thread(request)
  if (request.method === 'turn/start') turn(request)
})
