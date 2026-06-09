import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('coordinator adapter boundaries', () => {
  it('keeps API and MCP adapters away from Prisma, repositories, and lifecycle tables', async () => {
    const adapters = [
      path.join(process.cwd(), 'src', 'app', 'api', 'internal', 'coordinator', '[...operation]', 'route.ts'),
      path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp.ts'),
    ]
    for (const adapter of adapters) {
      const source = await fs.readFile(adapter, 'utf8')
      expect(source).not.toMatch(/from ['"].*(@prisma|db-config|artifact-repository)/)
      expect(source).not.toMatch(/\.(planProjection|planEvent|planCoordinatorLease)\./)
    }
  })

  it('does not write diagnostics to stdout from the MCP adapter', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'packages', 'appraisejs', 'src', 'mcp.ts'), 'utf8')
    expect(source).not.toMatch(/console\.(log|info|debug)/)
    expect(source).not.toMatch(/process\.stdout\.write/)
  })
})
