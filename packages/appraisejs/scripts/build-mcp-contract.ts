import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { createAppraiseMcpServer, mcpContractForServer } from '../src/mcp.js'

async function contract(providerNativeRuns: boolean) {
  process.env.APPRAISE_EXPERIMENTAL_PROVIDER_RUNS = providerNativeRuns ? '1' : '0'
  const server = await createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' })
  const definitions = [...mcpContractForServer(server)].sort(
    (left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name),
  )
  await server.close()
  return definitions
}

const fixture = {
  schemaVersion: 1,
  default: await contract(false),
  providerNative: await contract(true),
}
await writeFile(path.resolve('src/mcp-contract.fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`)
