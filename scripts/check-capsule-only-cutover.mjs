#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const forbiddenSymbols = [
  'LocalExecutorAdapter',
  'performBidirectionalSync',
  'LEGACY_DISABLED',
  'standalone: assessment',
  'legacy Step Definition row hash',
  'sync-all',
  'sync-features',
  'sync-locators',
  'sync-environments',
  'sync-modules',
  'sync-tags',
  'sync-test-suites',
  'sync-test-cases',
  'sync-locator-groups',
]

const ignoredDirectories = new Set(['.git', 'node_modules', '.next', 'coverage', 'dist', 'graphify-out'])

async function collect(directory) {
  const paths = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) paths.push(...(await collect(target)))
    } else if (/\.(?:ts|tsx|mjs|mts|cts|md|json|prisma|ya?ml)$/.test(entry.name)) {
      paths.push(target)
    }
  }
  return paths
}

const scanRoots = [
  'src',
  'scripts',
  'prisma/schema.prisma',
  'docs',
  'e2e',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'package.json',
  'packages/appraisejs/src',
  'packages/create-appraisejs/src',
  'packages/create-appraisejs/README.md',
  'packages/create-appraisejs/templates/base/src',
  'packages/create-appraisejs/templates/base/scripts',
  'packages/create-appraisejs/templates/base/package.json',
]

const sources = (
  await Promise.all(
    scanRoots.map(async entry => {
      const target = path.join(root, entry)
      try {
        return (await fs.stat(target)).isDirectory() ? collect(target) : [target]
      } catch {
        return []
      }
    }),
  )
).flat()
const matches = []

const forbiddenPaths = [
  'src/app/(base)/locators/locator-sync-toast.ts',
  'src/services/locator/locator-sync-utils.ts',
  'src/lib/bidirectional-sync.ts',
  'src/lib/database-sync.ts',
  'src/lib/executor/local-executor-adapter.ts',
  'src/lib/feature-file-generator.ts',
  'src/lib/locator-group-file-utils.ts',
  'src/services/locator/locator-path-utils.ts',
  'scripts/lib/filename-utils.ts',
  'scripts/lib/sync-script-runner.ts',
  'scripts/sync-all.ts',
]

async function validatePackageScriptGraph(packageJsonPath, requiredScripts = [], requiredSetupScripts = []) {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, packageJsonPath), 'utf8'))
  const scripts = packageJson.scripts ?? {}
  matches.push(
    ...requiredScripts
      .filter(required => !scripts[required])
      .map(required => `${packageJsonPath}:missing script ${required}`),
    ...requiredSetupScripts
      .filter(required => !`${scripts.setup ?? ''} ${scripts['setup:db'] ?? ''}`.includes(`run ${required}`))
      .map(required => `${packageJsonPath}:setup does not invoke ${required}`),
    ...Object.entries(scripts).flatMap(([name, command]) =>
      [...command.matchAll(/npm run ([\w:.-]+)/g)]
        .filter(match => !scripts[match[1]])
        .map(match => `${packageJsonPath}:${name} references missing script ${match[1]}`),
    ),
  )
}

for (const source of sources) {
  const relative = path.relative(root, source)
  if (relative.endsWith('scripts/check-capsule-only-cutover.mjs')) continue
  const content = await fs.readFile(source, 'utf8')
  for (const symbol of forbiddenSymbols) if (content.includes(symbol)) matches.push(`${relative}:${symbol}`)
}

const templateRoot = 'packages/create-appraisejs/templates/base'
const forbiddenPathCandidates = [
  ...forbiddenPaths,
  ...forbiddenPaths.map(forbiddenPath => path.join(templateRoot, forbiddenPath)),
]

for (const forbiddenPath of forbiddenPathCandidates) {
  try {
    await fs.access(path.join(root, forbiddenPath))
    matches.push(`${forbiddenPath}:forbidden compatibility file`)
  } catch {}
}

await validatePackageScriptGraph('package.json', ['sync-step-definitions'], ['sync-step-definitions'])
const templatePackagePath = 'packages/create-appraisejs/templates/base/package.json'
const templatePackageExists = await fs
  .access(path.join(root, templatePackagePath))
  .then(() => true)
  .catch(() => false)
if (templatePackageExists) {
  await validatePackageScriptGraph(templatePackagePath, ['sync-step-definitions'], ['sync-step-definitions'])
}

if (matches.length) {
  console.error('Capsule-only cutover guard found forbidden compatibility symbols:')
  for (const match of matches) console.error(`- ${match}`)
  process.exitCode = 1
} else {
  console.log('Capsule-only cutover guard passed; no compatibility paths are allowlisted.')
}
