import { spawnSync } from 'node:child_process'
import { execFileSync } from 'node:child_process'

import { PrismaClient } from '@prisma/client'
import { createHash } from 'node:crypto'

const matrix = {
  schemaVersion: 1,
  cases: [
    {
      id: 'greenfield-publication',
      test: 'src/services/coordinator/validation-ast-operation-service.integration.test.ts',
    },
    { id: 'existing-project-capsule', test: 'src/services/coordinator/coordinator-capsule-lifecycle.e2e.test.ts' },
  ],
}
const startedAt = Date.now()
const result = spawnSync('npx', ['vitest', 'run', ...matrix.cases.map(item => item.test)], { stdio: 'inherit' })
const status = result.status === 0 ? 'passed' : 'failed'
const matrixJson = JSON.stringify(matrix)
const client = new PrismaClient()
try {
  await client.lifecycleCertificationReceipt.create({
    data: {
      schemaVersion: '1',
      status,
      matrixHash: `sha256:${createHash('sha256').update(matrixJson).digest('hex')}`,
      matrixJson,
      durationMs: Date.now() - startedAt,
      gitCommit: (() => {
        try {
          return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
        } catch {
          return null
        }
      })(),
    },
  })
} finally {
  await client.$disconnect()
}
process.exitCode = result.status ?? 1
