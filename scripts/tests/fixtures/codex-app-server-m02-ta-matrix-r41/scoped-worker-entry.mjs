/** Explicit future child entry. Importing this module performs no I/O. */
import { lstat, open, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve, relative, dirname, sep, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { instrumentScopedServerTransport } from '../codex-app-server-m02-ta-matrix-r10/server-transport-audit.mjs'

const allowedRoots = ['/private/tmp/appraise-m02-ta-matrix-p24']
const bootstrapMaxBytes = 64 * 1024

async function readOwnedBootstrap(pathValue) {
  if (typeof pathValue !== 'string' || !pathValue.startsWith('/')) throw new Error('Missing scoped bootstrap.')
  const path = resolve(pathValue)
  const root = allowedRoots.find(
    candidate =>
      path !== candidate &&
      relative(candidate, path) &&
      !relative(candidate, path).startsWith(`..${sep}`) &&
      relative(candidate, path) !== '..',
  )
  if (!root) throw new Error('Scoped bootstrap is outside owned roots.')
  if ((await realpath(path)) !== path) throw new Error('Scoped bootstrap path is not canonical.')
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error('Scoped bootstrap owner is unavailable.')
  const parents = []
  for (let current = dirname(path); current !== dirname(root); current = dirname(current)) {
    parents.push(current)
    if (current === root) break
  }
  if (parents.at(-1) !== root) throw new Error('Scoped bootstrap ancestry is invalid.')
  for (const parent of parents) {
    const state = await lstat(parent)
    if (!state.isDirectory() || state.isSymbolicLink() || state.uid !== uid || (state.mode & 0o777) !== 0o700)
      throw new Error('Scoped bootstrap directory is not private and owned.')
  }
  const file = await lstat(path)
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    file.uid !== uid ||
    (file.mode & 0o777) !== 0o600 ||
    file.size > bootstrapMaxBytes
  )
    throw new Error('Scoped bootstrap file is not private and owned.')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  let raw
  try {
    const descriptor = await handle.stat()
    if (descriptor.dev !== file.dev || descriptor.ino !== file.ino || descriptor.size > bootstrapMaxBytes)
      throw new Error('Scoped bootstrap changed.')
    raw = await handle.readFile('utf8')
    const after = await lstat(path)
    if (after.dev !== file.dev || after.ino !== file.ino || after.isSymbolicLink())
      throw new Error('Scoped bootstrap replaced.')
  } finally {
    await handle.close()
  }
  if (Buffer.byteLength(raw) > bootstrapMaxBytes) throw new Error('Scoped bootstrap exceeds bound.')
  const config = JSON.parse(raw)
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    Object.keys(config).sort().join(',') !== 'capability,caseId,schema,url' ||
    config.schema !== 'appraise.m02-ta-bridge-bootstrap/v1' ||
    typeof config.caseId !== 'string' ||
    typeof config.capability !== 'string' ||
    typeof config.url !== 'string'
  )
    throw new Error('Scoped bootstrap shape is invalid.')
  const expectedRoot = allowedRoots[0]
  if (
    !/^(B0[1-6]|B07-A(0[1-9]|1[0-4])|B07-D01|B07-T01|P00|B14)$/.test(config.caseId) ||
    path !== join(expectedRoot, 'cases', config.caseId, 'codex', 'mcp-bootstrap.json')
  )
    throw new Error('Scoped bootstrap case path mismatch.')
  return config
}

export async function runScopedWorkerEntry({
  args = process.argv.slice(2),
  bootstrapPath = process.env.APPRAISE_M02_BOOTSTRAP_PATH,
} = {}) {
  if (
    !Array.isArray(args) ||
    args[0] !== '--m02-ta-scoped-worker' ||
    args.length > 2 ||
    (args.length === 2 && args[1] !== '--m02-ta-required-failure')
  )
    throw new Error('Scoped worker entry flag is required.')
  // P00 proves required-server failure before reading config or opening any
  // socket, SDK server or bootstrap channel.
  if (args[1] === '--m02-ta-required-failure') return { requiredFailure: true }
  const config = await readOwnedBootstrap(bootstrapPath)
  const { createTrustedWorkerBridgeClient, createTrustedWorkerBridgeEndpoint, createLoopbackTrustedWorkerExchange } =
    await import('../../../../packages/appraisejs/dist/mcp/trusted-worker-bridge.js')
  const { StdioServerTransport } =
    await import('../../../../packages/appraisejs/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js')
  const bridge = createTrustedWorkerBridgeClient({
    caseId: config.caseId,
    capability: config.capability,
    exchange: createLoopbackTrustedWorkerExchange(config.url),
    onAmbiguous: () => {
      process.exitCode = 1
    },
  })
  const endpoint = await createTrustedWorkerBridgeEndpoint(bridge)
  const auditUrl = new URL(config.url)
  if (auditUrl.pathname !== '/m02/canonical' || auditUrl.search || auditUrl.hash)
    throw new Error('Scoped audit endpoint binding invalid.')
  auditUrl.pathname = '/m02/audit'
  const report = async event => {
    const response = await fetch(auditUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schema: 'appraise.m02-ta-scoped-audit/v1',
        caseId: config.caseId,
        capability: config.capability,
        event,
      }),
      signal: AbortSignal.timeout(5000),
    })
    if (response.status !== 200 || (await response.text()) !== '{"status":"ACKNOWLEDGED"}')
      throw new Error('Scoped audit acknowledgement lost.')
  }
  const transport = instrumentScopedServerTransport({
    transport: new StdioServerTransport(),
    report,
    onUnknown: () => {
      process.exitCode = 1
      void endpoint.server.close().catch(() => {})
    },
  })
  await endpoint.server.connect(transport)
  return { requiredFailure: false, endpoint }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runScopedWorkerEntry()
    .then(result => {
      if (result.requiredFailure) {
        process.stderr.write('Required scoped MCP unavailable.\n')
        process.exitCode = 1
      }
    })
    .catch(() => {
      process.stderr.write('Scoped MCP initialization failed.\n')
      process.exitCode = 1
    })
}
