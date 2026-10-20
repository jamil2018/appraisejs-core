// fallow-ignore-file unused-file -- Executed as an owned Node entrypoint by absolute path.
// Local protocol fixture only. No provider, credentials, network or model calls.
import readline from 'node:readline'
import fs from 'node:fs'
const mode = process.argv[2] ?? 'normal'
const threadId = 'm05-fixture-thread'
const turnId = 'm05-fixture-turn'
let starts = 0
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`)
const reply = (id, result) => send({ id, result })
const turnEvent = (method, id = turnId) => send({ method, params: { threadId, turn: { id, status: 'completed' } } })

function privateModes() {
  return [process.env.HOME, process.env.CODEX_HOME, process.env.TMPDIR, process.cwd()].every(
    directory => (fs.statSync(directory).mode & 0o777) === 0o700,
  )
}
function privateConfig() {
  const config = `${process.env.CODEX_HOME}/config.toml`
  return (fs.statSync(config).mode & 0o777) === 0o600 && fs.readFileSync(config, 'utf8') === ''
}
function isolatedEnvironment() {
  // Darwin injects runtime encoding metadata after the exact environment is supplied.
  const platformKeys = process.platform === 'darwin' ? ['__CF_USER_TEXT_ENCODING'] : []
  const allowed = ['HOME', 'CODEX_HOME', 'TMPDIR', 'LANG', ...platformKeys]
  return (
    Object.keys(process.env).every(key => allowed.includes(key)) &&
    fs.realpathSync(process.env.HOME).startsWith(`${fs.realpathSync(process.cwd())}/`) &&
    process.env.CODEX_HOME !== process.env.HOME
  )
}
function initialize(frame) {
  if (!isolatedEnvironment() || !privateModes() || !privateConfig())
    return send({ id: frame.id, error: { code: -32000, message: 'fixture isolation failed' } })
  reply(frame.id, { userAgent: 'owned-fixture', isolationChecked: true })
}
function thread(frame) {
  reply(frame.id, { thread: { id: threadId } })
  if (mode === 'premature-event') turnEvent('turn/completed')
}
const failures = {
  crash: () => process.exit(23),
  'lost-ack': () => {},
  rpc: () => send({ id: 'permission-1', method: 'item/commandExecution/requestApproval', params: {} }),
  malformed: () => process.stdout.write('{bad json}\n'),
  'wrong-event': () => send({ method: 'turn/completed', params: { threadId: 'foreign', turn: { id: turnId } } }),
}
function turn(frame) {
  if (++starts !== 1) process.exit(90)
  if (Object.hasOwn(failures, mode)) return failures[mode]()
  if (mode === 'turn-mismatch') turnEvent('turn/started', 'foreign-turn')
  finishTurn(frame)
}
function finishTurn(frame) {
  if (mode === 'malformed-handle') return reply(frame.id, { turn: { id: {} } })
  reply(frame.id, { turn: { id: turnId } })
  if (mode !== 'hold') setTimeout(() => turnEvent('turn/completed'), 20)
}
const handlers = {
  initialize,
  'thread/start': thread,
  'thread/resume': thread,
  'turn/start': turn,
  'turn/interrupt': frame => reply(frame.id, { interrupted: true }),
}
const input = readline.createInterface({ input: process.stdin })
input.on('line', line => {
  const frame = JSON.parse(line)
  if (process.argv[3]) fs.appendFileSync(process.argv[3], `${frame.method}\n`, { mode: 0o600 })
  if (Object.hasOwn(handlers, frame.method)) handlers[frame.method](frame)
})
