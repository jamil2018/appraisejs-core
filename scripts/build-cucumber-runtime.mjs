import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { cucumberRuntimeReceiptIsCurrent } from './lib/cucumber-runtime-fingerprint.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (cucumberRuntimeReceiptIsCurrent(root, process.env.APPRAISE_CUCUMBER_RUNTIME_RECEIPT)) {
  console.log('Reusing the verified Cucumber runtime build prerequisite for this validation session.')
  process.exit(0)
}

const result = spawnSync(
  process.execPath,
  [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'packages/cucumber-runtime/tsconfig.json'],
  {
    cwd: root,
    stdio: 'inherit',
    timeout: 120000,
  },
)
if (result.error) console.error(result.error)
if (result.signal === 'SIGTERM') console.error('Cucumber runtime build exceeded its configured timeout.')
process.exit(result.status ?? 1)
