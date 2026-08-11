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
  schemaVersion: 2,
  default: await contract(false),
}
await writeFile(path.resolve('src/mcp-contract.fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`)
await writeFile(
  path.resolve('src/agent-setup-capabilities.json'),
  `${JSON.stringify(
    {
      tools: fixture.default.filter(definition => definition.kind === 'tool').map(definition => definition.name),
      resources: fixture.default
        .filter(
          (definition): definition is typeof definition & { uri: string } =>
            definition.kind === 'resource' && typeof definition.uri === 'string',
        )
        .map(definition => definition.uri),
    },
    null,
    2,
  )}\n`,
)
