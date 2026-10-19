import { execFileSync } from 'node:child_process'
import { it } from 'vitest'

it('preserves scoped legacy owners and immutable attempt bytes through the actual M03 migration', () => {
  execFileSync(process.execPath, ['scripts/tests/m03-host-neutral-sessions-backfill.test.mjs'], {
    cwd: process.cwd(),
    stdio: 'pipe',
  })
})
