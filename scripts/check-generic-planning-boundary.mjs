#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const roots = ['src/services/coordinator', 'packages/appraisejs/src']
const forbiddenProductionPatterns = [
  { pattern: /\b(?:project|plan)(?:Archetype|TemplateRegistry)\b/g, label: 'project-specific planning registry' },
  {
    pattern: /\b(?:create|generate|infer)(?:Tasks|Plan|AcceptanceCriteria)FromBrief\b/g,
    label: 'brief-driven task synthesis',
  },
  { pattern: /\b(?:domain|project)Keyword(?:Map|Router|Tasks)\b/g, label: 'domain keyword routing' },
  { pattern: /\bfallback(?:Tasks|Plan)\b/g, label: 'fallback task graph' },
]

function walk(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => collectEntry(directory, entry))
}

function collectEntry(directory, entry) {
  const fullPath = path.join(directory, entry.name)
  if (entry.isDirectory()) return walk(fullPath)
  return isProductionSource(entry) ? [fullPath] : []
}

function isProductionSource(entry) {
  const supportedExtension = /\.(?:ts|tsx|mjs|js)$/.test(entry.name)
  const testSource = /\.(?:test|e2e)\./.test(entry.name)
  return entry.isFile() && supportedExtension && !testSource
}

const failures = []
for (const file of roots.flatMap(root => walk(path.join(repoRoot, root)))) {
  const contents = fs.readFileSync(file, 'utf8')
  for (const { pattern, label } of forbiddenProductionPatterns) {
    pattern.lastIndex = 0
    for (const match of contents.matchAll(pattern)) {
      const line = contents.slice(0, match.index).split('\n').length
      failures.push(`${path.relative(repoRoot, file)}:${line} contains ${label} (${match[0]})`)
    }
  }
}

const harnessDoc = fs.readFileSync(path.join(repoRoot, 'docs/agent-harness.md'), 'utf8')
const lifecycleDoc = fs.readFileSync(path.join(repoRoot, 'docs/agent-lifecycle-flow.md'), 'utf8')
const methodologyRegistry = fs.readFileSync(
  path.join(repoRoot, 'src/lib/quality-design/methodology-registry.ts'),
  'utf8',
)
if (!harnessDoc.includes('The host agent supplies semantic reasoning')) {
  failures.push('docs/agent-harness.md: must assign semantic reasoning to the host agent')
}
if (!lifecycleDoc.includes('the host agent performs semantic reasoning with a versioned Appraise methodology')) {
  failures.push('docs/agent-lifecycle-flow.md: must bind host reasoning to the versioned Appraise methodology')
}
for (const requiredContract of [
  'plannerContract',
  "artifactType: 'REQUIREMENT_ANALYSIS'",
  "artifactType: 'VALIDATION_DESIGN'",
]) {
  if (!methodologyRegistry.includes(requiredContract)) {
    failures.push(`src/lib/quality-design/methodology-registry.ts: missing ${requiredContract}`)
  }
}

if (failures.length > 0) {
  console.error('Generic planning boundary check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Generic planning boundary check passed.')
