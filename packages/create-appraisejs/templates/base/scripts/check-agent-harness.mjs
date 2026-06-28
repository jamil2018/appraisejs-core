#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()

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

const requiredFiles = [
  'docs/agent-harness.md',
  'docs/agent-task-recipes.md',
  'docs/agent-validation-matrix.md',
  'docs/agent-generated-artifacts.md',
  'docs/agent-lifecycle-flow.md',
  'docs/agent-scaffold-flow.md',
  'docs/agent-mcp-setup.md',
  'docs/agent-harness-guardrails.md',
  '.agents/skills/appraise-repo-navigation/SKILL.md',
  '.agents/skills/appraise-lifecycle-flow/SKILL.md',
  '.agents/skills/appraise-scaffold-maintenance/SKILL.md',
  '.agents/skills/appraise-sync-artifacts/SKILL.md',
  '.agents/skills/appraise-runtime-validation/SKILL.md',
  'packages/create-appraisejs/AGENTS.md',
  'packages/appraisejs/AGENTS.md',
]

const staticFiles = [
  'AGENTS.md',
  '.cursor/rules/project-context.mdc',
  '.codex/config.toml',
  '.github/PULL_REQUEST_TEMPLATE.md',
  'packages/create-appraisejs/AGENTS.md',
  'packages/create-appraisejs/README.md',
  'packages/appraisejs/AGENTS.md',
  'packages/appraisejs/README.md',
]

const rootRelativeReferencePattern = /\b(?:docs\/agent-[A-Za-z0-9-]+\.md|\.agents\/skills\/[A-Za-z0-9-]+\/SKILL\.md)\b/g

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
  return path.basename(file) === 'SKILL.md'
})) {
  activeFiles.add(toRepoRelative(file))
}

const failures = []

for (const file of requiredFiles) {
  requireFile(file, 'missing required harness file')
}

for (const dir of listDirectories(path.join(repoRoot, '.agents', 'skills'))) {
  if (!dir.name.startsWith('appraise-')) continue
  requireFile(`.agents/skills/${dir.name}/SKILL.md`, 'missing appraise skill entrypoint')
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
