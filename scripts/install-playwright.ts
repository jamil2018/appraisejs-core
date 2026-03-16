#!/usr/bin/env tsx

import { execa } from 'execa'
import { createRequire } from 'module'
import path from 'path'

const require = createRequire(import.meta.url)
const playwrightPackageJsonPath = require.resolve('playwright/package.json')
const playwrightCliPath = path.join(path.dirname(playwrightPackageJsonPath), 'cli.js')
const browserArgs = process.argv.slice(2)

await execa(process.execPath, [playwrightCliPath, 'install', ...browserArgs], {
  stdio: 'inherit',
})

if (process.platform === 'linux') {
  await execa(process.execPath, [playwrightCliPath, 'install-deps', ...browserArgs], {
    stdio: 'inherit',
  })
}
