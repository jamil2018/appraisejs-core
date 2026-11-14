import { appendFileSync, closeSync, openSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SERVER_CAPABILITIES, SERVER_INFO, TOOL_SCHEMA } from './transport.mjs'

const sdkRequire = createRequire(new URL('../../../../packages/appraisejs/package.json', import.meta.url))

/** Local SDK stdio fixture. It advertises one inert tool; invocation is always a case failure. */
export async function startFixture(mode, journalPath) {
  if (!['healthy', 'missing'].includes(mode) || !journalPath?.startsWith('/'))
    throw new Error('fixture_arguments_refused')
  // The runner reserves this owned journal before native launch. Every fixture restart is counted.
  closeSync(openSync(journalPath, 'a', 0o600))
  const record = event => appendFileSync(journalPath, `${JSON.stringify({ event })}\n`, { mode: 0o600 })
  record('startup')
  if (mode === 'missing') {
    record('startup_exit_19')
    process.exitCode = 19
    return
  }
  const { Server } = await import(pathToFileURL(sdkRequire.resolve('@modelcontextprotocol/sdk/server/index.js')).href)
  const { StdioServerTransport } = await import(
    pathToFileURL(sdkRequire.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href
  )
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    pathToFileURL(sdkRequire.resolve('@modelcontextprotocol/sdk/types.js')).href
  )
  const server = new Server(SERVER_INFO, { capabilities: SERVER_CAPABILITIES })
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    record('tools-list')
    return { tools: [{ name: 'fixture_observe', inputSchema: TOOL_SCHEMA }] }
  })
  server.setRequestHandler(CallToolRequestSchema, async () => {
    record('tools-call')
    throw new Error('fixture_invocation_forbidden')
  })
  await server.connect(new StdioServerTransport())
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startFixture(process.argv[2], process.argv[3]).catch(() => {
    // No payload, path, credential, or error text is emitted.
    process.exitCode = 19
  })
}
