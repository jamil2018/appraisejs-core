import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['worker.mjs'], { cwd: import.meta.dirname, stdio: ['ignore', 'pipe', 'pipe'] })
let output = ''
child.stdout.on('data', chunk => {
  output += String(chunk)
})
await once(child.stdout, 'data')
assert.match(output, /QUALIFICATION_READY http:\/\/127\.0\.0\.1:\d+/)
child.kill('SIGTERM')
const [code, signal] = await once(child, 'exit')
assert.equal(code, null)
assert.equal(signal, 'SIGTERM')
process.stdout.write('QUALIFICATION_INTERRUPTED signal=SIGTERM\n')
