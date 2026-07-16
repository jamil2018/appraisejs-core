import { performance } from 'node:perf_hooks'

import { createAppraiseMcpServer, mcpContractForServer } from '../src/mcp.js'

const iterations = Number.parseInt(process.env.APPRAISE_MCP_BENCHMARK_ITERATIONS ?? '100', 10)
const beforeHeap = process.memoryUsage().heapUsed
const startedAt = performance.now()
let contract: readonly unknown[] | undefined

for (let iteration = 0; iteration < iterations; iteration += 1) {
  const server = await createAppraiseMcpServer({ cwd: process.cwd(), baseUrl: 'http://127.0.0.1:3000' })
  const current = mcpContractForServer(server)
  if (contract && current !== contract) throw new Error('MCP definitions were reallocated instead of reused.')
  contract = current
  await server.close()
}

const durationMs = performance.now() - startedAt
console.log(
  JSON.stringify({
    iterations,
    operations: contract?.length ?? 0,
    totalMs: Number(durationMs.toFixed(2)),
    averageMs: Number((durationMs / iterations).toFixed(3)),
    heapDeltaBytes: process.memoryUsage().heapUsed - beforeHeap,
  }),
)
