#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

const packageFiles = ['package.json', 'packages/appraisejs/package.json', 'packages/create-appraisejs/package.json']
const nodeFloors = packageFiles.map(
  file => JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8')).engines?.node,
)
if (nodeFloors.some(floor => floor !== '>=20.19')) {
  throw new Error(`Active packages must share the Node floor >=20.19: ${nodeFloors.join(', ')}`)
}
const ciContents = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8')
const ciNodeMajor = Number(ciContents.match(/NODE_VERSION:\s*(\d+)/)?.[1])
if (!Number.isInteger(ciNodeMajor) || ciNodeMajor < 20) {
  throw new Error('Release CI must use a Node version compatible with the >=20.19 package floor.')
}

const literalForbidden = [
  'templates/default',
  'templates/starter',
  'templates/blank',
  'npm run sync-template',
  'sync-templates',
  '/Users/hasnat',
  '/Users/mdhasnat',
  'download-repo',
]

const regexForbidden = [
  { pattern: /\bAGENT\.md\b/g, label: 'AGENT.md' },
  {
    pattern: /MCP tools are available(?![^.\n]*(register|restart|reconnect))/gi,
    label: 'MCP tools available without registration/restart guidance',
  },
]

const hasRootAgentHarness = fs.existsSync(path.join(repoRoot, 'docs', 'agent-harness.md'))

const rootHarnessRequiredFiles = [
  'docs/agent-harness.md',
  'docs/agent-task-recipes.md',
  'docs/agent-validation-matrix.md',
  'docs/agent-generated-artifacts.md',
  'docs/agent-lifecycle-flow.md',
  'docs/agent-scaffold-flow.md',
  'docs/agent-mcp-setup.md',
  'docs/agent-harness-guardrails.md',
  'docs/agent-real-subagent-audit-protocol.md',
  'docs/generated/coordinator-operation-reference.md',
  '.agents/skills/appraise-repo-navigation/SKILL.md',
  '.agents/skills/appraise-lifecycle-flow/SKILL.md',
  '.agents/skills/appraise-scaffold-maintenance/SKILL.md',
  '.agents/skills/appraise-sync-artifacts/SKILL.md',
  '.agents/skills/appraise-runtime-validation/SKILL.md',
  '.agents/skills/swarm-orchestrator/SKILL.md',
  '.agents/skills/swarm-orchestrator/references/routing-and-evolution.md',
  '.codex/agents/investigator.toml',
  '.codex/agents/solver.toml',
  '.codex/agents/executor.toml',
  '.codex/agents/executor-advanced.toml',
  '.codex/agents/judge.toml',
  'scripts/fixtures/swarm-routing-contracts.json',
  'scripts/lib/swarm-routing-contract.mjs',
  'scripts/lib/swarm-router.mjs',
  'scripts/lib/swarm-ledger-access.mjs',
  'scripts/record-swarm-route.mjs',
  'scripts/tests/swarm-routing.test.mjs',
  'packages/create-appraisejs/AGENTS.md',
  'packages/appraisejs/AGENTS.md',
]

const requiredFiles = hasRootAgentHarness ? [...rootHarnessRequiredFiles] : []

const staticFiles = [
  'AGENTS.md',
  '.cursor/rules/project-context.mdc',
  '.codex/config.toml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'packages/create-appraisejs/AGENTS.md',
  'packages/create-appraisejs/README.md',
  'packages/appraisejs/AGENTS.md',
  'packages/appraisejs/README.md',
  'scripts/mcp-config.mjs',
  'scripts/print-agent-config.mjs',
  'scripts/print-mcp-config.mjs',
  'scripts/check-swarm-harness.mjs',
  'scripts/record-swarm-run.mjs',
  'scripts/record-swarm-route.mjs',
  'scripts/update-swarm-evolution.mjs',
  'scripts/lib/swarm-ledger-lock.mjs',
  'scripts/lib/toml-validator.mjs',
  'scripts/lib/swarm-cli.mjs',
  'scripts/lib/swarm-ledger-store.mjs',
  'scripts/lib/swarm-ledger-access.mjs',
  'scripts/lib/swarm-routing-contract.mjs',
  'scripts/lib/swarm-router.mjs',
  'scripts/swarm-ledger.mjs',
  'scripts/tests/swarm-evolution.test.mjs',
  '.codex/agents/investigator.toml',
  '.codex/agents/solver.toml',
  '.codex/agents/executor.toml',
  '.codex/agents/executor-advanced.toml',
  '.codex/agents/judge.toml',
]

const rootRelativeReferencePattern = /\b(?:docs\/agent-[A-Za-z0-9-]+\.md|\.agents\/skills\/[A-Za-z0-9-]+\/SKILL\.md)\b/g

const requiredTokens = [
  {
    file: 'docs/agent-harness-guardrails.md',
    tokens: [
      'Major behavior, architecture, workflow, package, schema, scaffold',
      'Interactive UI testing defaults to the bundled `Browser` plugin',
    ],
  },
  {
    file: 'AGENTS.md',
    tokens: ['use the bundled `Browser` plugin', 'Use standalone `playwright-cli` only as a fallback'],
  },
  {
    file: 'docs/agent-task-recipes.md',
    tokens: ['Use the bundled `Browser` plugin', 'Use standalone `playwright-cli` only when'],
  },
  {
    file: '.agents/skills/swarm-orchestrator/SKILL.md',
    tokens: ['investigator', 'solver', 'executor', 'judge', 'evolution criteria'],
  },
  {
    file: '.agents/skills/swarm-orchestrator/references/routing-and-evolution.md',
    tokens: ['Run scorecard', 'Evolution triggers', 'Do not change the harness automatically'],
  },
  {
    file: '.codex/config.toml',
    tokens: [
      '[agents.investigator]',
      '[agents.solver]',
      '[agents.executor]',
      '[agents.judge]',
      'config_file = "agents/',
      'max_concurrent_threads_per_session',
      'default_subagent_model',
    ],
  },
  {
    file: 'docs/generated/coordinator-operation-reference.md',
    tokens: ['<!-- GENERATED by npm run generate:coordinator-reference. DO NOT EDIT. -->'],
  },
  {
    file: 'packages/appraisejs/README.md',
    tokens: ['Node.js 20.19+', 'coordinator client', 'MCP server', 'Step Definition'],
  },
  { file: 'packages/create-appraisejs/README.md', tokens: ['Node.js `20.19+`', 'bundled-only'] },
  {
    file: 'docs/component-organization-rules.md',
    tokens: ['multiple real consumers', 'catch-all CRUD frameworks'],
  },
  {
    file: 'docs/server-actions-conventions.md',
    tokens: ['authorization or', 'project-scope mapping', 'error-envelope translation'],
  },
]

function walkFiles(dir, predicate) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap(entry => collectEntryFiles(path.join(dir, entry.name), entry, predicate))
}

function collectEntryFiles(fullPath, entry, predicate) {
  if (entry.isDirectory()) return walkFiles(fullPath, predicate)
  if (entry.isFile() && predicate(fullPath)) return [fullPath]
  return []
}

function listDirectories(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory())
}

function lineFor(contents, index) {
  return contents.slice(0, index).split('\n').length
}

function toRepoRelative(file) {
  return path.relative(repoRoot, file).replace(/\\/g, '/')
}

function requireFile(file, reason) {
  if (!fs.existsSync(path.join(repoRoot, file))) {
    failures.push(`${file}: ${reason}`)
  }
}

function checkRootRelativeReferences(file, contents) {
  rootRelativeReferencePattern.lastIndex = 0
  for (const match of contents.matchAll(rootRelativeReferencePattern)) {
    const target = match[0]
    if (fs.existsSync(path.join(repoRoot, target))) continue
    failures.push(`${file}:${lineFor(contents, match.index ?? 0)} references missing harness file "${target}"`)
  }
}

const activeFiles = new Set(staticFiles)

for (const file of walkFiles(path.join(repoRoot, 'docs'), file => {
  const relative = path.relative(repoRoot, file).replace(/\\/g, '/')
  return /^docs\/agent-[^/]+\.md$/.test(relative)
})) {
  activeFiles.add(toRepoRelative(file))
}

for (const file of walkFiles(path.join(repoRoot, '.agents', 'skills'), file => {
  return path.basename(file) === 'SKILL.md' || file.includes(`${path.sep}references${path.sep}`)
})) {
  activeFiles.add(toRepoRelative(file))
}

const failures = []

for (const file of requiredFiles) {
  requireFile(file, 'missing required harness file')
}

for (const { file, tokens } of requiredTokens) {
  const fullPath = path.join(repoRoot, file)
  if (!fs.existsSync(fullPath)) continue
  const contents = fs.readFileSync(fullPath, 'utf8')
  for (const token of tokens) {
    if (!contents.includes(token)) failures.push(`${file}: missing required harness token "${token}"`)
  }
}

for (const dir of listDirectories(path.join(repoRoot, '.agents', 'skills'))) {
  if (!dir.name.startsWith('appraise-')) continue
  const entrypoint = `.agents/skills/${dir.name}/SKILL.md`
  if (fs.existsSync(path.join(repoRoot, entrypoint))) requireFile(entrypoint, 'missing appraise skill entrypoint')
}

for (const file of Array.from(activeFiles).sort()) {
  const fullPath = path.join(repoRoot, file)
  if (!fs.existsSync(fullPath)) continue

  const contents = fs.readFileSync(fullPath, 'utf8')
  checkRootRelativeReferences(file, contents)

  for (const token of literalForbidden) {
    let index = contents.indexOf(token)
    while (index !== -1) {
      failures.push(`${file}:${lineFor(contents, index)} contains stale reference "${token}"`)
      index = contents.indexOf(token, index + token.length)
    }
  }

  for (const { pattern, label } of regexForbidden) {
    pattern.lastIndex = 0
    for (const match of contents.matchAll(pattern)) {
      failures.push(`${file}:${lineFor(contents, match.index ?? 0)} contains stale reference "${label}"`)
    }
  }
}

if (failures.length > 0) {
  console.error('Agent harness check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Agent harness check passed (${activeFiles.size} active files scanned).`)
