import { execFile } from 'node:child_process'
import { timingSafeEqual } from 'node:crypto'

export type ProviderSecretVault = {
  read(id: string): Promise<Buffer | undefined>
  create(id: string, secret: Buffer): Promise<void>
  remove(id: string): Promise<void>
}

const service = 'com.appraisejs.provider-secret'
const macSecurity = '/usr/bin/security'
const linuxSecretTool = '/usr/bin/secret-tool'
const secretPattern = /^[0-9a-f]{64}$/
const identifierPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function unavailable() {
  return new Error('The operating system credential vault is unavailable.')
}

function invoke(tool: string, args: string[], input?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', PATH: '/usr/bin:/bin', LC_ALL: 'C' }
    if (tool === linuxSecretTool) {
      env.HOME = process.env.HOME
      env.DBUS_SESSION_BUS_ADDRESS = process.env.DBUS_SESSION_BUS_ADDRESS
      env.XDG_RUNTIME_DIR = process.env.XDG_RUNTIME_DIR
    }
    const child = execFile(
      tool,
      args,
      { env, encoding: 'utf8', timeout: 12_000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 },
      (error, stdout, stderr) => {
        if (!error) resolve({ code: 0, stdout, stderr })
        else if (typeof error.code === 'number' && !error.killed) resolve({ code: error.code, stdout, stderr })
        else reject(unavailable())
      },
    )
    child.stdin?.on('error', () => undefined)
    child.stdin?.end(input)
  })
}

function validateId(id: string) {
  if (!identifierPattern.test(id)) throw unavailable()
}

async function read(id: string) {
  validateId(id)
  const mac = process.platform === 'darwin'
  if (!mac && process.platform !== 'linux') throw unavailable()
  const reply = mac
    ? await invoke(macSecurity, ['find-generic-password', '-s', service, '-a', id, '-w'])
    : await invoke(linuxSecretTool, ['lookup', 'service', service, 'account', id])
  if (mac ? reply.code === 44 : reply.code === 1 && reply.stderr.trim() === '') return undefined
  const secret = reply.stdout.trim()
  if (reply.code !== 0 || !secretPattern.test(secret)) throw unavailable()
  return Buffer.from(secret, 'hex')
}

async function create(id: string, secret: Buffer) {
  validateId(id)
  if (secret.length !== 32) throw unavailable()
  const existing = await read(id)
  if (existing) {
    existing.fill(0)
    throw unavailable()
  }
  const encoded = secret.toString('hex')
  // security's interactive command mode reads its arguments from stdin.
  // The key never appears in the child process arguments or environment.
  const reply =
    process.platform === 'darwin'
      ? await invoke(macSecurity, ['-q', '-i'], `add-generic-password -s ${service} -a ${id} -w ${encoded}\n`)
      : await invoke(
          linuxSecretTool,
          ['store', '--label=AppraiseJS provider key', 'service', service, 'account', id],
          encoded,
        )
  if (reply.code !== 0) throw unavailable()
  const stored = await read(id)
  if (!stored) throw unavailable()
  try {
    if (!timingSafeEqual(stored, secret)) throw unavailable()
  } finally {
    stored.fill(0)
  }
}

async function remove(id: string) {
  validateId(id)
  const mac = process.platform === 'darwin'
  if (!mac && process.platform !== 'linux') throw unavailable()
  const reply = mac
    ? await invoke(macSecurity, ['delete-generic-password', '-s', service, '-a', id])
    : await invoke(linuxSecretTool, ['clear', 'service', service, 'account', id])
  if (reply.code !== 0 && !(mac ? reply.code === 44 : reply.code === 1 && reply.stderr.trim() === ''))
    throw unavailable()
}

export const providerSecretVault: ProviderSecretVault = { read, create, remove }
