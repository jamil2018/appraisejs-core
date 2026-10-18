/** Test-process guard: accidental default effects must throw before crossing the host boundary. */
import childProcess from 'node:child_process'
import net from 'node:net'
import dgram from 'node:dgram'
import { syncBuiltinESMExports } from 'node:module'

export const externalEffectAttempts = []
const refuse = category => () => {
  externalEffectAttempts.push(category)
  throw new Error(`OFFLINE_EXTERNAL_EFFECT_FORBIDDEN_${category}`)
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'])
  childProcess[name] = refuse('PROCESS')
net.Server.prototype.listen = refuse('SOCKET')
net.Socket.prototype.connect = refuse('SOCKET')
for (const name of ['bind', 'send', 'connect']) dgram.Socket.prototype[name] = refuse('SOCKET')
process.dlopen = refuse('NATIVE_ADDON')
syncBuiltinESMExports()
