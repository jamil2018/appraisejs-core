import { execFileSync } from 'node:child_process'
import { it } from 'vitest'

it('adds M04 storage without inventing historical sends or changing predecessor bytes', () => {
  execFileSync(process.execPath, ['scripts/tests/m04-provider-intent-backfill.test.mjs'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
})
