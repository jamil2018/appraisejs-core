import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('environment secret release check', () => {
  it('uses canonical migrations when no project database is configured', () => {
    const env = { ...process.env }
    delete env.DATABASE_URL

    expect(
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/check-environment-secrets.ts'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
      }),
    ).toContain('Environment secret-reference check passed')
  })
})
