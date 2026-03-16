#!/usr/bin/env tsx

import { execa } from 'execa'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const playwrightCliPath = require.resolve('playwright/cli')
const browserArgs = process.argv.slice(2)

await execa(process.execPath, [playwrightCliPath, 'install', ...browserArgs], {
  stdio: 'inherit',
})

if (process.platform === 'linux') {
  await execa(process.execPath, [playwrightCliPath, 'install-deps', ...browserArgs], {
    stdio: 'inherit',
  })
}
