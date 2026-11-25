import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { connect } from 'node:net'
import { createInterface } from 'node:readline'
import { expect, it } from 'vitest'

const processModule = new URL('./cursor-process.ts', import.meta.url).href
// Start the synthetic vendor in a separate process so killing its simulated
// Appraise parent proves IPC-driven cleanup without sharing the Vitest process.
const parentScript = `
const { startCursorCommand } = await import(process.argv[1])
const script = "require('node:net').createServer(() => {}).listen(0, '127.0.0.1', function () { console.log(this.address().port) })"
const { child } = startCursorCommand(process.execPath, process.execPath, ['-e', script], {})
child.stdout.pipe(process.stdout)
child.stderr.resume()
`

it('stops the supervised Cursor process group when Appraise is killed', async () => {
  const parent = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', parentScript, processModule],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  parent.stderr.resume()
  const lines = createInterface({ input: parent.stdout })
  const timeout = AbortSignal.timeout(8_000)
  try {
    const [port] = await once(lines, 'line', { signal: timeout })
    const socket = connect(Number(port), '127.0.0.1')
    try {
      await once(socket, 'connect', { signal: timeout })
      const disconnected = once(socket, 'close', { signal: timeout })
      parent.kill('SIGKILL')
      await disconnected
      expect(socket.destroyed).toBe(true)
    } finally {
      socket.destroy()
    }
  } finally {
    parent.kill('SIGKILL')
    lines.close()
  }
}, 10_000)
