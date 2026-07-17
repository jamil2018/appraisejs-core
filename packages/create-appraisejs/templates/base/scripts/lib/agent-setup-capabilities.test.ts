import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import expectedCapabilities from '../../packages/appraisejs/src/agent-setup-capabilities.json'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('repo agent setup capabilities', () => {
  it('prints the same expected capabilities as the packaged CLI', () => {
    const output = execFileSync(process.execPath, ['scripts/print-agent-config.mjs'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })

    expect(output).toContain(JSON.stringify(expectedCapabilities, null, 2))
  })
})
