#!/usr/bin/env tsx

import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'
import { buildStepRegistry } from './lib/template-step-registry'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')
const registryRoot = path.join(repoRoot, 'packages', 'appraisejs', 'registry', 'template-steps')
const fragmentsRoot = path.join(registryRoot, 'fragments')

async function writeRegistry(): Promise<void> {
  const { manifest, fragments } = await buildStepRegistry(repoRoot)

  await fs.rm(registryRoot, { recursive: true, force: true })
  await fs.mkdir(fragmentsRoot, { recursive: true })

  await fs.writeFile(path.join(registryRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  for (const fragment of fragments) {
    const fragmentPath = path.join(registryRoot, fragment.path)
    await fs.mkdir(path.dirname(fragmentPath), { recursive: true })
    await fs.writeFile(fragmentPath, fragment.content)
  }

  console.log(`Generated template-step registry with ${manifest.steps.length} step(s) at ${registryRoot}`)
}

writeRegistry().catch(error => {
  console.error(error)
  process.exit(1)
})
