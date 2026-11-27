import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams, type SpawnOptions } from 'node:child_process'

// The supervisor runs the exact argv provided by Appraise. The vendor process
// is in its own process group, so IPC closure also stops it after parent death.
const supervisor = `
const { spawn } = require('node:child_process')
const [command, ...args] = process.argv.slice(1)
const child = spawn(command, args, { detached: true, stdio: 'inherit' })
let active = true
function stop() {
  if (!active || !child.pid) return
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
}
function finish(code) {
  active = false
  process.exitCode = code ?? 1
  if (process.connected) process.disconnect()
}
process.on('message', message => {
  if (message === 'stop') stop()
})
process.on('disconnect', stop)
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
child.once('error', () => finish(1))
child.once('exit', finish)
if (!process.connected) stop()
`

type CommandOptions = Pick<SpawnOptions, 'cwd' | 'env'>

function hasPipes(child: ChildProcess): child is ChildProcessWithoutNullStreams {
  return child.stdin !== null && child.stdout !== null && child.stderr !== null
}

export function startCursorCommand(
  node: string,
  command: string,
  args: readonly string[],
  options: CommandOptions,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted()
  const child = spawn(node, ['-e', supervisor, '--', command, ...args], {
    ...options,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
  const stop = () => {
    // Let the supervisor close IPC after the vendor exits so Node emits close.
    if (child.connected) child.send('stop', () => undefined)
  }
  if (!hasPipes(child)) {
    child.once('error', () => undefined)
    stop()
    throw new Error('Cursor command pipes are unavailable.')
  }
  signal?.addEventListener('abort', stop, { once: true })
  child.once('close', () => signal?.removeEventListener('abort', stop))
  return { child, stop }
}
